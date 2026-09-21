import crypto from "crypto";
import { EmailConnection } from "@workspace/db";
import { decryptToken, encryptToken } from "./email-token-crypto";

export type MicrosoftTokenResponse = {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType: string;
};

export type MicrosoftMessage = {
  id: string;
  conversationId: string;
  subject: string | null;
  bodyPreview: string | null;
  body: {
    contentType: "text" | "html";
    content: string;
  };
  sender: {
    emailAddress: { name: string | null; address: string };
  };
  toRecipients: Array<{ emailAddress: { name: string | null; address: string } }>;
  ccRecipients: Array<{ emailAddress: { name: string | null; address: string } }>;
  receivedDateTime: string;
  sentDateTime?: string;
  hasAttachments: boolean;
  isRead: boolean;
  importance: string;
  internetMessageId: string | null;
  webLink: string | null;
};

export type MicrosoftAttachment = {
  id: string;
  name: string;
  contentType: string;
  size: number;
  isInline: boolean;
};

export class MicrosoftGraphProviderError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public providerCode?: string,
    public retryable: boolean = false,
  ) {
    super(message);
    this.name = "MicrosoftGraphProviderError";
  }
}

export class MicrosoftGraphProvider {
  private readonly tenantId: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly scopes: string[];
  private readonly baseUrl: string;

  constructor() {
    this.tenantId = process.env.MICROSOFT_TENANT_ID || "common";
    this.clientId = process.env.MICROSOFT_CLIENT_ID || "";
    this.clientSecret = process.env.MICROSOFT_CLIENT_SECRET || "";
    this.redirectUri = process.env.MICROSOFT_REDIRECT_URI || "";
    this.scopes = [
      "https://graph.microsoft.com/Mail.Read",
      "https://graph.microsoft.com/Mail.ReadWrite",
      "https://graph.microsoft.com/offline_access",
      "https://graph.microsoft.com/User.Read",
    ];
    this.baseUrl = `https://graph.microsoft.com/v1.0`;
  }

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: "code",
      redirect_uri: this.redirectUri,
      response_mode: "query",
      scope: this.scopes.join(" "),
      state,
      prompt: "consent",
    });
    return `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<MicrosoftTokenResponse> {
    const response = await fetch(`https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: this.redirectUri,
        grant_type: "authorization_code",
        scope: this.scopes.join(" "),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new MicrosoftGraphProviderError(`Token exchange failed: ${error}`, response.status, "token_exchange_failed");
    }

    const data = await response.json() as Record<string, unknown>;
    return {
      accessToken: String(data.access_token),
      refreshToken: data.refresh_token ? String(data.refresh_token) : undefined,
      expiresIn: Number(data.expires_in),
      tokenType: String(data.token_type),
    };
  }

  async refreshTokens(refreshToken: string): Promise<MicrosoftTokenResponse> {
    const response = await fetch(`https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
        scope: this.scopes.join(" "),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new MicrosoftGraphProviderError(`Token refresh failed: ${error}`, response.status, "token_refresh_failed", true);
    }

    const data = await response.json() as Record<string, unknown>;
    return {
      accessToken: String(data.access_token),
      refreshToken: data.refresh_token ? String(data.refresh_token) : refreshToken,
      expiresIn: Number(data.expires_in),
      tokenType: String(data.token_type),
    };
  }

  async getAuthenticatedClient(connection: EmailConnection): Promise<MicrosoftGraphClient> {
    const accessToken = decryptToken(connection.encryptedAccessToken);
    const refreshToken = connection.encryptedRefreshToken ? decryptToken(connection.encryptedRefreshToken) : null;
    const expiresAt = connection.tokenExpiresAt ? new Date(connection.tokenExpiresAt) : new Date();

    let token = accessToken;
    if (expiresAt <= new Date() && refreshToken) {
      const refreshed = await this.refreshTokens(refreshToken);
      token = refreshed.accessToken;
      return new MicrosoftGraphClient(this, {
        accessToken: token,
        refreshToken: refreshed.refreshToken ?? refreshToken,
        expiresIn: refreshed.expiresIn,
      }, connection);
    }

    return new MicrosoftGraphClient(this, {
      accessToken: token,
      refreshToken: refreshToken ?? undefined,
      expiresIn: expiresAt.getTime() - Date.now(),
    }, connection);
  }

  persistTokenUpdate(connection: EmailConnection, tokens: { accessToken: string; refreshToken?: string; expiresIn: number }): Pick<EmailConnection, "encryptedAccessToken" | "encryptedRefreshToken" | "tokenExpiresAt"> {
    return {
      encryptedAccessToken: encryptToken(tokens.accessToken),
      encryptedRefreshToken: tokens.refreshToken ? encryptToken(tokens.refreshToken) : connection.encryptedRefreshToken,
      tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
    };
  }
}

export class MicrosoftGraphClient {
  private accessToken: string;
  private refreshToken?: string;
  private expiresIn: number;
  private provider: MicrosoftGraphProvider;
  private connection: EmailConnection;

  constructor(provider: MicrosoftGraphProvider, tokens: { accessToken: string; refreshToken?: string; expiresIn: number }, connection: EmailConnection) {
    this.provider = provider;
    this.connection = connection;
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
    this.expiresIn = tokens.expiresIn;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = path.startsWith("http") ? path : `${this.provider["baseUrl"]}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      const delayMs = retryAfter ? Number(retryAfter) * 1000 : 30000;
      await this.sleep(Math.min(delayMs, 60000));
      return this.request<T>(path, options);
    }

    if (response.status === 401 && this.refreshToken) {
      const refreshed = await this.provider.refreshTokens(this.refreshToken);
      this.accessToken = refreshed.accessToken;
      if (refreshed.refreshToken) this.refreshToken = refreshed.refreshToken;
      this.expiresIn = refreshed.expiresIn;
      const retry = await fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
          ...options.headers,
        },
      });
      if (!retry.ok) {
        const error = await retry.text();
        throw new MicrosoftGraphProviderError(`Graph request failed after refresh: ${error}`, retry.status, "graph_request_failed", retry.status >= 500);
      }
      return retry.json() as Promise<T>;
    }

    if (!response.ok) {
      const error = await response.text();
      const retryable = response.status === 429 || response.status >= 500;
      throw new MicrosoftGraphProviderError(`Graph request failed: ${error}`, response.status, "graph_request_failed", retryable);
    }

    return response.json() as Promise<T>;
  }

  async searchMessages(query: string, top: number = 20, skip: number = 0): Promise<{ value: MicrosoftMessage[]; nextLink?: string; deltaLink?: string }> {
    const params = new URLSearchParams({
      $search: `"${query}"`,
      $top: String(top),
      $skip: String(skip),
      $select: "id,conversationId,subject,bodyPreview,body,sender,toRecipients,ccRecipients,receivedDateTime,sentDateTime,hasAttachments,isRead,importance,internetMessageId,webLink",
      $orderby: "receivedDateTime DESC",
    });
    return this.request(`/me/messages?${params.toString()}`);
  }

  async getMessage(messageId: string): Promise<MicrosoftMessage> {
    return this.request(`/me/messages/${messageId}?$select=id,conversationId,subject,bodyPreview,body,sender,toRecipients,ccRecipients,receivedDateTime,sentDateTime,hasAttachments,isRead,importance,internetMessageId,webLink`);
  }

  async getThread(conversationId: string, top: number = 50): Promise<{ value: MicrosoftMessage[] }> {
    const params = new URLSearchParams({
      $filter: `conversationId eq '${conversationId}'`,
      $top: String(top),
      $orderby: "receivedDateTime ASC",
    });
    return this.request(`/me/messages?${params.toString()}`);
  }

  async getAttachments(messageId: string): Promise<{ value: MicrosoftAttachment[] }> {
    return this.request(`/me/messages/${messageId}/attachments?$select=id,name,contentType,size,isInline`);
  }

  async downloadAttachment(messageId: string, attachmentId: string): Promise<Buffer> {
    const url = `${this.provider["baseUrl"]}/me/messages/${messageId}/attachments/${attachmentId}/$value`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      const delayMs = retryAfter ? Number(retryAfter) * 1000 : 30000;
      await this.sleep(Math.min(delayMs, 60000));
      return this.downloadAttachment(messageId, attachmentId);
    }

    if (response.status === 401 && this.refreshToken) {
      const refreshed = await this.provider.refreshTokens(this.refreshToken);
      this.accessToken = refreshed.accessToken;
      if (refreshed.refreshToken) this.refreshToken = refreshed.refreshToken;
      this.expiresIn = refreshed.expiresIn;
      const retry = await fetch(url, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      if (!retry.ok) throw new MicrosoftGraphProviderError("Attachment download failed after refresh", retry.status, "attachment_download_failed", true);
      return Buffer.from(await retry.arrayBuffer());
    }

    if (!response.ok) {
      throw new MicrosoftGraphProviderError("Attachment download failed", response.status, "attachment_download_failed", response.status >= 500);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  async sendMail(to: string[], subject: string, body: string, cc?: string[], attachments?: Array<{ name: string; contentType: string; bytes: Buffer }>): Promise<{ id: string }> {
    const message: Record<string, unknown> = {
      subject,
      body: { contentType: "Text", content: body },
      toRecipients: to.map((address) => ({ emailAddress: { address } })),
    };

    if (cc?.length) {
      message.ccRecipients = cc.map((address) => ({ emailAddress: { address } }));
    }

    if (attachments?.length) {
      message.attachments = attachments.map((file) => ({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: file.name,
        contentType: file.contentType,
        contentBytes: file.bytes.toString("base64"),
      }));
    }

    await this.request<void>("/me/sendMail", {
      method: "POST",
      body: JSON.stringify({ message, saveToSentItems: true }),
    });

    return { id: crypto.randomUUID() };
  }

  async createSubscription(resource: string, notificationUrl: string, expirationDateTime: string): Promise<{ id: string; expirationDateTime: string }> {
    return this.request("/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        resource,
        notificationUrl,
        expirationDateTime,
        clientState: crypto.randomBytes(32).toString("hex"),
      }),
    });
  }

  async deleteSubscription(subscriptionId: string): Promise<void> {
    await this.request(`/subscriptions/${subscriptionId}`, { method: "DELETE" });
  }

  async updateSubscription(subscriptionId: string, expirationDateTime: string): Promise<void> {
    await this.request(`/subscriptions/${subscriptionId}`, {
      method: "PATCH",
      body: JSON.stringify({ expirationDateTime }),
    });
  }

  get currentToken(): string {
    return this.accessToken;
  }

  get pendingTokenUpdate(): { accessToken: string; refreshToken?: string; expiresIn: number } | null {
    if (this.expiresIn < 300 && this.refreshToken) {
      return { accessToken: this.accessToken, refreshToken: this.refreshToken, expiresIn: this.expiresIn };
    }
    return null;
  }
}
