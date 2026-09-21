import { pgTable, serial, text, timestamp, integer, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const emailConnectionsTable = pgTable("email_connections", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull().default("microsoft"),
  ownerUserId: integer("owner_user_id").notNull(),
  tenantId: text("tenant_id"),
  accountIdentifier: text("account_identifier").notNull(),
  mailboxEmail: text("mailbox_email").notNull(),
  displayName: text("display_name"),
  encryptedAccessToken: text("encrypted_access_token").notNull(),
  encryptedRefreshToken: text("encrypted_refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  connectionStatus: text("connection_status").notNull().default("connected"),
  lastSuccessfulCheckAt: timestamp("last_successful_check_at", { withTimezone: true }),
  lastProviderError: text("last_provider_error"),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
  subscriptionId: text("subscription_id"),
  subscriptionExpiresAt: timestamp("subscription_expires_at", { withTimezone: true }),
  subscriptionClientState: text("subscription_client_state"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  providerAccountUnique: uniqueIndex("email_connections_provider_account_unique").on(table.provider, table.ownerUserId, table.accountIdentifier),
  ownerIndex: index("email_connections_owner_idx").on(table.ownerUserId),
  statusIndex: index("email_connections_status_idx").on(table.connectionStatus),
  subscriptionIndex: index("email_connections_subscription_idx").on(table.subscriptionId),
}));

export const webhookNotificationsTable = pgTable("webhook_notifications", {
  id: serial("id").primaryKey(),
  notificationId: text("notification_id").notNull(),
  subscriptionId: text("subscription_id").notNull(),
  clientState: text("client_state"),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  notificationUnique: uniqueIndex("webhook_notifications_unique").on(table.notificationId),
}));

export const insertEmailConnectionSchema = createInsertSchema(emailConnectionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEmailConnection = z.infer<typeof insertEmailConnectionSchema>;
export type EmailConnection = typeof emailConnectionsTable.$inferSelect;
