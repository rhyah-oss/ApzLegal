import { pgTable, serial, text, integer, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";

export const providerOperationsTable = pgTable("provider_operations", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(), // email | signature
  status: text("status").notNull().default("queued"), // queued | provider_confirmed | failed
  idempotencyKey: text("idempotency_key").notNull(),
  providerName: text("provider_name").notNull().default("not_connected"),
  providerRequestId: text("provider_request_id"),
  providerEventId: text("provider_event_id"),
  matterId: integer("matter_id"),
  documentId: integer("document_id"),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  errorMessage: text("error_message"),
  attempt: integer("attempt").notNull().default(1),
  retryOfId: integer("retry_of_id"),
  reviewedById: integer("reviewed_by_id"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdById: integer("created_by_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  idempotencyKeyUnique: uniqueIndex("provider_operations_idempotency_key_unique").on(table.idempotencyKey),
  providerEventUnique: uniqueIndex("provider_operations_provider_event_unique").on(table.providerName, table.providerEventId),
}));

export type ProviderOperation = typeof providerOperationsTable.$inferSelect;