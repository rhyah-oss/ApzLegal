import { db, emailConnectionsTable, webhookNotificationsTable } from "@workspace/db";
import { and, eq, lt, or, sql } from "drizzle-orm";
import { MicrosoftGraphProvider } from "./microsoft-graph";
import { decryptToken } from "./email-token-crypto";
import crypto from "crypto";

const RENEWAL_INTERVAL_MS = 12 * 60 * 60 * 1000;
const RENEWAL_THRESHOLD_MS = 24 * 60 * 60 * 1000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 30_000;

const graphProvider = new MicrosoftGraphProvider();

type SubscriptionRenewalResult = {
  connectionId: number;
  mailboxEmail: string;
  action: "renewed" | "recreated" | "skipped" | "failed";
  error?: string;
};

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function renewSubscription(connection: any, attempt = 1): Promise<SubscriptionRenewalResult> {
  const accessToken = decryptToken(connection.encryptedAccessToken);
  const refreshToken = connection.encryptedRefreshToken ? decryptToken(connection.encryptedRefreshToken) : null;

  let client = await graphProvider.getAuthenticatedClient({
    ...connection,
    encryptedAccessToken: accessToken,
    encryptedRefreshToken: refreshToken ?? connection.encryptedRefreshToken,
  });

  const expiresAt = connection.subscriptionExpiresAt ? new Date(connection.subscriptionExpiresAt) : new Date();
  const isExpired = expiresAt <= new Date();

  try {
    if (isExpired || !connection.subscriptionId) {
      if (connection.subscriptionId) {
        try {
          await client.deleteSubscription(connection.subscriptionId);
        } catch {
          // Ignore cleanup errors for expired subscriptions
        }
      }

      const notificationUrl = `${process.env.APP_URL}/api/microsoft/webhook`;
      const expirationDateTime = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      const clientState = crypto.randomBytes(32).toString("hex");

      const subscription = await client.createSubscription(
        "me/messages",
        notificationUrl,
        expirationDateTime,
      clientState,
      );

      await db.update(emailConnectionsTable).set({
        subscriptionId: subscription.id,
        subscriptionExpiresAt: new Date(subscription.expirationDateTime),
        subscriptionClientState: clientState,
        connectionStatus: "connected",
        lastSuccessfulCheckAt: new Date(),
        lastProviderError: null,
        updatedAt: new Date(),
      }).where(eq(emailConnectionsTable.id, connection.id));

      return { connectionId: connection.id, mailboxEmail: connection.mailboxEmail, action: "recreated" };
    }

    const newExpiration = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    await client.request(`/subscriptions/${connection.subscriptionId}`, {
      method: "PATCH",
      body: JSON.stringify({ expirationDateTime: newExpiration }),
    });

    await db.update(emailConnectionsTable).set({
      subscriptionExpiresAt: new Date(newExpiration),
      lastSuccessfulCheckAt: new Date(),
      lastProviderError: null,
      updatedAt: new Date(),
    }).where(eq(emailConnectionsTable.id, connection.id));

    return { connectionId: connection.id, mailboxEmail: connection.mailboxEmail, action: "renewed" };
  } catch (error: any) {
    const errorMessage = error?.message ?? "Unknown renewal error";
    await db.update(emailConnectionsTable).set({
      lastProviderError: errorMessage,
      updatedAt: new Date(),
    }).where(eq(emailConnectionsTable.id, connection.id));

    if (attempt < MAX_RETRIES && (error?.statusCode === 429 || error?.statusCode >= 500)) {
      await sleep(RETRY_DELAY_MS * attempt);
      return renewSubscription(connection, attempt + 1);
    }

    return { connectionId: connection.id, mailboxEmail: connection.mailboxEmail, action: "failed", error: errorMessage };
  }
}

export async function runSubscriptionRenewal(): Promise<SubscriptionRenewalResult[]> {
  const results: SubscriptionRenewalResult[] = [];
  const threshold = new Date(Date.now() + RENEWAL_THRESHOLD_MS);

  const connections = await db.select().from(emailConnectionsTable).where(
    and(
      eq(emailConnectionsTable.connectionStatus, "connected"),
      or(
        lt(emailConnectionsTable.subscriptionExpiresAt, threshold),
        sql`${emailConnectionsTable.subscriptionExpiresAt} IS NULL`,
      ),
    ),
  );

  for (const connection of connections) {
    try {
      const result = await renewSubscription(connection);
      results.push(result);
    } catch (error: any) {
      results.push({
        connectionId: connection.id,
        mailboxEmail: connection.mailboxEmail,
        action: "failed",
        error: error?.message ?? "Unknown error",
      });
    }
  }

  return results;
}

export function startSubscriptionRenewalScheduler(): () => void {
  let running = false;
  let timeoutId: NodeJS.Timeout | null = null;

  async function tick() {
    if (running) return;
    running = true;
    try {
      const results = await runSubscriptionRenewal();
      for (const result of results) {
        if (result.action === "failed") {
          console.error(`[microsoft-subscription-renewal] failed for ${result.mailboxEmail}: ${result.error}`);
        } else {
          console.log(`[microsoft-subscription-renewal] ${result.action} for ${result.mailboxEmail}`);
        }
      }
    } catch (error) {
      console.error("[microsoft-subscription-renewal] scheduler error:", error);
    } finally {
      running = false;
      timeoutId = setTimeout(tick, RENEWAL_INTERVAL_MS);
    }
  }

  timeoutId = setTimeout(tick, RENEWAL_INTERVAL_MS);
  return () => {
    if (timeoutId) clearTimeout(timeoutId);
  };
}
