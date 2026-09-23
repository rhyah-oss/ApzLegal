import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import { db, emailConnectionsTable, webhookNotificationsTable, type EmailConnection } from "@workspace/db";
import { getCurrentUser, logAudit } from "../lib/context";
import { requireRole, LEGAL_AUTHOR_ROLES } from "../lib/permissions";
import { MicrosoftGraphProvider, MicrosoftGraphProviderError } from "../lib/microsoft-graph";
import { decryptToken, encryptToken } from "../lib/email-token-crypto";

const router: IRouter = Router();
const graphProvider = new MicrosoftGraphProvider();

function isMicrosoftConfigured(): boolean {
  return Boolean(
    process.env.MICROSOFT_CLIENT_ID &&
    process.env.MICROSOFT_CLIENT_SECRET &&
    process.env.MICROSOFT_REDIRECT_URI,
  );
}

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const oauthStateStore = new Map<string, { userId: number; createdAt: number }>();

function generateState(userId: number): string {
  const state = crypto.randomBytes(32).toString("hex");
  oauthStateStore.set(state, { userId, createdAt: Date.now() });
  return state;
}

function consumeState(state: string, userId: number): boolean {
  const record = oauthStateStore.get(state);
  if (!record) return false;
  if (record.userId !== userId) return false;
  if (Date.now() - record.createdAt > OAUTH_STATE_TTL_MS) {
    oauthStateStore.delete(state);
    return false;
  }
  oauthStateStore.delete(state);
  return true;
}

function sanitizeGraphError(error: unknown): string {
  if (error instanceof MicrosoftGraphProviderError) {
    if (error.statusCode === 401) return "Microsoft authentication expired or invalid.";
    if (error.statusCode === 403) return "Microsoft Graph permission denied.";
    if (error.statusCode === 404) return "Microsoft Graph resource not found.";
    if (error.statusCode === 429) return "Microsoft Graph rate limit exceeded. Please retry later.";
    if (error.statusCode >= 500) return "Microsoft Graph service unavailable.";
    return "Microsoft Graph request failed.";
  }
  if (error instanceof Error) {
    const message = error.message;
    if (message.includes("access_token") || message.includes("refresh_token") || message.includes("client_secret")) {
      return "Microsoft authentication error.";
    }
    if (message.includes("JSON") || message.includes("Unexpected end")) {
      return "Microsoft Graph returned an unexpected response.";
    }
    return message.length > 200 ? message.slice(0, 200) + "..." : message;
  }
  return "Unknown Microsoft Graph error.";
}

async function persistTokenUpdate(connection: EmailConnection, tokens: { accessToken: string; refreshToken?: string; expiresIn: number }): Promise<void> {
  const tokenUpdate = graphProvider.persistTokenUpdate(connection, tokens);
  await db.update(emailConnectionsTable).set({
    ...tokenUpdate,
    connectionStatus: "connected",
    disconnectedAt: null,
    lastProviderError: null,
    updatedAt: new Date(),
  }).where(eq(emailConnectionsTable.id, connection.id));
}

router.get("/microsoft/oauth/authorize", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (!user) { res.status(401).json({ error: "Not authenticated", code: "AUTH_REQUIRED" }); return; }
  if (!(await requireRole(req, res, LEGAL_AUTHOR_ROLES, "Only legal staff may connect Microsoft 365."))) return;
  if (!isMicrosoftConfigured()) {
    res.status(501).json({ error: "Microsoft 365 integration is not configured.", code: "MICROSOFT_NOT_CONFIGURED" });
    return;
  }

  const state = generateState(user.id);
  const redirectUri = graphProvider.getAuthorizationUrl(state);
  res.json({ url: redirectUri, state });
});

router.get("/microsoft/oauth/callback", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (!user) { res.status(401).json({ error: "Not authenticated", code: "AUTH_REQUIRED" }); return; }

  const code = typeof req.query.code === "string" ? req.query.code : undefined;
  const state = typeof req.query.state === "string" ? req.query.state : undefined;
  const error = typeof req.query.error === "string" ? req.query.error : undefined;

  if (error) {
    await logAudit({ action: "microsoft_oauth_failed", entityType: "microsoft_connection", entityId: 0, entityTitle: "Microsoft 365", userId: user.id, details: `OAuth error: ${error}`, ipAddress: req.ip });
    res.redirect(`/email?error=oauth_denied`);
    return;
  }

  if (!state || !consumeState(state, user.id)) {
    await logAudit({ action: "microsoft_oauth_failed", entityType: "microsoft_connection", entityId: 0, entityTitle: "Microsoft 365", userId: user.id, details: "Invalid or expired OAuth state.", ipAddress: req.ip });
    res.redirect(`/email?error=invalid_state`);
    return;
  }

  if (!code) {
    res.status(400).json({ error: "Missing authorization code." });
    return;
  }

  try {
    const tokens = await graphProvider.exchangeCode(code);
    const encryptedAccessToken = encryptToken(tokens.accessToken);
    const encryptedRefreshToken = tokens.refreshToken ? encryptToken(tokens.refreshToken) : null;
    const tokenExpiresAt = new Date(Date.now() + tokens.expiresIn * 1000);

    const tempConnection = {
      id: 0,
      provider: "microsoft" as const,
      ownerUserId: user.id,
      tenantId: process.env.MICROSOFT_TENANT_ID ?? null,
      accountIdentifier: "primary",
      mailboxEmail: user.email,
      displayName: user.name,
      encryptedAccessToken,
      encryptedRefreshToken,
      tokenExpiresAt,
      connectionStatus: "connected" as const,
      connectedAt: new Date(),
      disconnectedAt: null,
      lastSuccessfulCheckAt: null,
      lastProviderError: null,
      subscriptionId: null,
      subscriptionExpiresAt: null,
      subscriptionClientState: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const graph = await graphProvider.getAuthenticatedClient(tempConnection);
    const profile = await graph.request<{ mail?: string; userPrincipalName?: string; displayName?: string }>("/me?$select=mail,userPrincipalName,displayName");
    const mailboxEmail = profile.mail || profile.userPrincipalName || user.email;
    const displayName = profile.displayName || user.name;

    const clientState = crypto.randomBytes(32).toString("hex");
    const notificationUrl = `${process.env.APP_URL}/api/microsoft/webhook`;
    const subscriptionExpiration = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

    const subscription = await graph.createSubscription(
      "me/messages",
      notificationUrl,
      subscriptionExpiration,
      clientState,
    );

    const [existing] = await db.select().from(emailConnectionsTable).where(
      and(eq(emailConnectionsTable.provider, "microsoft"), eq(emailConnectionsTable.ownerUserId, user.id), eq(emailConnectionsTable.accountIdentifier, "primary")),
    );

    if (existing) {
      await db.update(emailConnectionsTable).set({
        encryptedAccessToken,
        encryptedRefreshToken,
        tokenExpiresAt,
        mailboxEmail,
        displayName,
        connectionStatus: "connected",
        connectedAt: new Date(),
        disconnectedAt: null,
        lastProviderError: null,
        subscriptionId: subscription.id,
        subscriptionExpiresAt: new Date(subscription.expirationDateTime),
        subscriptionClientState: clientState,
        updatedAt: new Date(),
      }).where(eq(emailConnectionsTable.id, existing.id));
    } else {
      await db.insert(emailConnectionsTable).values({
        provider: "microsoft",
        ownerUserId: user.id,
        tenantId: process.env.MICROSOFT_TENANT_ID ?? null,
        accountIdentifier: "primary",
        mailboxEmail,
        displayName,
        encryptedAccessToken,
        encryptedRefreshToken,
        tokenExpiresAt,
        connectionStatus: "connected",
        connectedAt: new Date(),
        lastSuccessfulCheckAt: new Date(),
        subscriptionId: subscription.id,
        subscriptionExpiresAt: new Date(subscription.expirationDateTime),
        subscriptionClientState: clientState,
      });
    }

    await logAudit({ action: "microsoft_connected", entityType: "microsoft_connection", entityId: existing?.id ?? 0, entityTitle: mailboxEmail, userId: user.id, details: `Microsoft 365 connected for ${mailboxEmail}`, ipAddress: req.ip });
    res.redirect(`/email?connected=1`);
  } catch (error: any) {
    await logAudit({ action: "microsoft_oauth_failed", entityType: "microsoft_connection", entityId: 0, entityTitle: "Microsoft 365", userId: user.id, details: `OAuth callback failed: ${sanitizeGraphError(error)}`, ipAddress: req.ip });
    res.redirect(`/email?error=connection_failed`);
  }
});

router.get("/microsoft/connection", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (!user) { res.status(401).json({ error: "Not authenticated", code: "AUTH_REQUIRED" }); return; }

  const [connection] = await db.select().from(emailConnectionsTable).where(
    and(eq(emailConnectionsTable.provider, "microsoft"), eq(emailConnectionsTable.ownerUserId, user.id), eq(emailConnectionsTable.accountIdentifier, "primary")),
  );

  if (!connection) {
    res.json({ status: "not_configured" });
    return;
  }

  const expiresAt = connection.tokenExpiresAt ? new Date(connection.tokenExpiresAt) : new Date();
  const isExpired = expiresAt <= new Date();

  res.json({
    status: isExpired ? "authentication_expired" : connection.connectionStatus,
    mailboxEmail: connection.mailboxEmail,
    displayName: connection.displayName,
    connectedAt: connection.connectedAt,
    lastSuccessfulCheckAt: connection.lastSuccessfulCheckAt,
    lastProviderError: connection.lastProviderError ? sanitizeGraphError(connection.lastProviderError) : null,
    isExpired,
  });
});

router.post("/microsoft/disconnect", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (!user) { res.status(401).json({ error: "Not authenticated", code: "AUTH_REQUIRED" }); return; }
  if (!(await requireRole(req, res, LEGAL_AUTHOR_ROLES, "Only legal staff may disconnect Microsoft 365."))) return;

  const [connection] = await db.select().from(emailConnectionsTable).where(
    and(eq(emailConnectionsTable.provider, "microsoft"), eq(emailConnectionsTable.ownerUserId, user.id), eq(emailConnectionsTable.accountIdentifier, "primary")),
  );

  if (connection) {
    try {
      if (connection.subscriptionId) {
        const accessToken = decryptToken(connection.encryptedAccessToken);
        const refreshToken = connection.encryptedRefreshToken ? decryptToken(connection.encryptedRefreshToken) : null;
        const client = await graphProvider.getAuthenticatedClient({
          ...connection,
          encryptedAccessToken: accessToken,
          encryptedRefreshToken: refreshToken ?? connection.encryptedRefreshToken,
        });
        await client.deleteSubscription(connection.subscriptionId);
      }
    } catch {
      // Ignore cleanup errors on disconnect
    }

    await db.update(emailConnectionsTable).set({
      connectionStatus: "disconnected",
      disconnectedAt: new Date(),
      encryptedAccessToken: "",
      encryptedRefreshToken: null,
      lastProviderError: null,
      subscriptionId: null,
      subscriptionExpiresAt: null,
      subscriptionClientState: null,
      updatedAt: new Date(),
    }).where(eq(emailConnectionsTable.id, connection.id));

    await logAudit({ action: "microsoft_disconnected", entityType: "microsoft_connection", entityId: connection.id, entityTitle: connection.mailboxEmail, userId: user.id, details: `Microsoft 365 disconnected for ${connection.mailboxEmail}`, ipAddress: req.ip });
  }

  res.json({ status: "disconnected" });
});

router.post("/microsoft/sync", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (!user) { res.status(401).json({ error: "Not authenticated", code: "AUTH_REQUIRED" }); return; }
  if (!(await requireRole(req, res, LEGAL_AUTHOR_ROLES, "Only legal staff may trigger email sync."))) return;

  const [connection] = await db.select().from(emailConnectionsTable).where(
    and(eq(emailConnectionsTable.provider, "microsoft"), eq(emailConnectionsTable.ownerUserId, user.id), eq(emailConnectionsTable.accountIdentifier, "primary"), eq(emailConnectionsTable.connectionStatus, "connected")),
  );

  if (!connection) {
    res.status(409).json({ error: "Microsoft 365 is not connected.", code: "MICROSOFT_NOT_CONNECTED" });
    return;
  }

  const expiresAt = connection.tokenExpiresAt ? new Date(connection.tokenExpiresAt) : new Date();
  if (expiresAt <= new Date()) {
    res.status(401).json({ error: "Microsoft 365 authentication has expired. Reconnect to continue.", code: "MICROSOFT_AUTH_EXPIRED" });
    return;
  }

  res.json({ status: "queued", message: "Email sync has been queued. This is a placeholder for background sync implementation." });
});

router.post("/microsoft/webhook", async (req, res): Promise<void> => {
  const validationToken = typeof req.query.validationToken === "string" ? req.query.validationToken : undefined;
  if (validationToken) {
    res.setHeader("Content-Type", "text/plain");
    res.send(validationToken);
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!Array.isArray(req.body?.value)) {
    res.status(400).json({ error: "Invalid notification batch" }); return;
  }
  for (const notification of req.body.value) {
    if (!notification || typeof notification !== "object" ||
        typeof notification.subscriptionId !== "string" || !notification.subscriptionId ||
        typeof notification.clientState !== "string" || !notification.clientState) continue;
    const [connection] = await db.select().from(emailConnectionsTable).where(and(
      eq(emailConnectionsTable.provider, "microsoft"),
      eq(emailConnectionsTable.connectionStatus, "connected"),
      eq(emailConnectionsTable.subscriptionId, notification.subscriptionId),
      eq(emailConnectionsTable.subscriptionClientState, notification.clientState),
    )).limit(1);
    if (!connection) continue;
    if (notification.lifecycleEvent) {
      if (notification.lifecycleEvent === "subscriptionExpirationMissed") {
        await db.update(emailConnectionsTable).set({
          connectionStatus: "disconnected", lastProviderError: "Subscription expired.", updatedAt: new Date(),
        }).where(eq(emailConnectionsTable.id, connection.id));
      }
      continue;
    }
    if (typeof notification.resource !== "string" || !notification.resource ||
        !["created", "updated", "deleted"].includes(notification.changeType)) continue;
    // Graph change notifications do not guarantee an event ID.
    const notificationId = typeof notification.id === "string" && notification.id
      ? notification.id : crypto.randomUUID();
    await db.insert(webhookNotificationsTable).values({
      notificationId,
      subscriptionId: notification.subscriptionId,
      clientState: notification.clientState,
    }).onConflictDoNothing();
  }

  res.status(202).json({ accepted: true });
});

export default router;