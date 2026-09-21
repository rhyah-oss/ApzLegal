import { pgTable, serial, text, timestamp, integer, jsonb, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const emailThreadsTable = pgTable("email_threads", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull(),
  externalThreadId: text("external_thread_id").notNull(),
  subject: text("subject"),
  matterId: integer("matter_id"),
  clientId: integer("client_id"),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  providerThreadUnique: uniqueIndex("email_threads_provider_external_unique").on(table.provider, table.externalThreadId),
  matterIndex: index("email_threads_matter_idx").on(table.matterId),
}));

export const emailsTable = pgTable("emails", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull(),
  externalMessageId: text("external_message_id").notNull(),
  threadId: integer("thread_id").notNull(),
  direction: text("direction").notNull().default("inbound"), // inbound | outbound
  senderEmail: text("sender_email").notNull(),
  senderName: text("sender_name"),
  toRecipients: text("to_recipients").array().notNull().default([]),
  ccRecipients: text("cc_recipients").array().notNull().default([]),
  bccRecipients: text("bcc_recipients").array().notNull().default([]),
  subject: text("subject"),
  bodyText: text("body_text"),
  bodyHtml: text("body_html"),
  headers: jsonb("headers").$type<Record<string, string>>(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
  matterId: integer("matter_id"),
  clientId: integer("client_id"),
  linkStatus: text("link_status").notNull().default("unlinked"), // unlinked | suggested | linked | reviewed_unlinked
  matchReason: text("match_reason"),
  matchConfidence: integer("match_confidence"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  providerMessageUnique: uniqueIndex("emails_provider_external_unique").on(table.provider, table.externalMessageId),
  matterIndex: index("emails_matter_idx").on(table.matterId),
  threadIndex: index("emails_thread_idx").on(table.threadId),
  receivedIndex: index("emails_received_idx").on(table.receivedAt),
}));

export const emailAttachmentsTable = pgTable("email_attachments", {
  id: serial("id").primaryKey(),
  emailId: integer("email_id").notNull(),
  provider: text("provider").notNull(),
  externalAttachmentId: text("external_attachment_id"),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  fileChecksum: text("file_checksum").notNull(),
  fileObjectPath: text("file_object_path"),
  documentId: integer("document_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  providerAttachmentUnique: uniqueIndex("email_attachments_provider_external_unique").on(table.provider, table.externalAttachmentId),
  emailIndex: index("email_attachments_email_idx").on(table.emailId),
}));

export const emailLinkCandidatesTable = pgTable("email_link_candidates", {
  id: serial("id").primaryKey(),
  emailId: integer("email_id").notNull(),
  matterId: integer("matter_id").notNull(),
  score: integer("score").notNull(),
  reason: text("reason").notNull(),
  source: text("source").notNull(), // reference | thread | participant | client | subject
  decision: text("decision").notNull().default("pending"), // pending | accepted | rejected
  decidedById: integer("decided_by_id"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  emailMatterUnique: uniqueIndex("email_link_candidates_email_matter_unique").on(table.emailId, table.matterId),
}));

export const insertEmailSchema = createInsertSchema(emailsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEmail = z.infer<typeof insertEmailSchema>;
export type Email = typeof emailsTable.$inferSelect;
export type EmailThread = typeof emailThreadsTable.$inferSelect;
export type EmailAttachment = typeof emailAttachmentsTable.$inferSelect;
export type EmailLinkCandidate = typeof emailLinkCandidatesTable.$inferSelect;