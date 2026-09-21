import { pgTable, text, serial, timestamp, integer, boolean, numeric, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Governed lifecycle: draft → ai_assist → review → partner_approval → client_signing → archived
export const documentsTable = pgTable("documents", {
  id: serial("id").primaryKey(),
  matterId: integer("matter_id").notNull(),
  title: text("title").notNull(),
  documentType: text("document_type").notNull().default("general"), // contract | pleading | opinion | correspondence | affidavit | general
  content: text("content"),
  fileObjectPath: text("file_object_path"),
  originalFilename: text("original_filename"),
  mimeType: text("mime_type"),
  fileSize: integer("file_size"),
  fileChecksum: text("file_checksum"),
  sourceTemplateId: integer("source_template_id"),
  sourceTemplateVersion: integer("source_template_version"),
  status: text("status").notNull().default("draft"), // draft | ai_assist | review | partner_approval | client_signing | archived (legacy: approved, signed)
  version: integer("version").notNull().default(1),
  contentOrigin: text("content_origin").notNull().default("human"), // human | ai_assisted | ai_generated
  // Sections with per-section provenance: [{ heading, origin, summary }]
  sections: jsonb("sections").$type<{ heading: string; origin: "human" | "ai_assisted" | "ai_generated"; summary?: string }[]>(),
  aiGenerated: boolean("ai_generated").notNull().default(false),
  aiRiskLevel: text("ai_risk_level"), // low | medium | high
  confidenceScore: numeric("confidence_score", { precision: 5, scale: 2 }),
  citations: text("citations").array(),
  citationStatus: text("citation_status").notNull().default("none"), // none | unverified | verified
  approvalStatus: text("approval_status").notNull().default("not_submitted"), // not_submitted | pending | approved | rejected | changes_requested
  approvalReason: text("approval_reason"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  submittedById: integer("submitted_by_id"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  signatureStatus: text("signature_status").notNull().default("not_sent"), // not_sent | sent | signed; sent means provider handoff queued or confirmed
  signedAt: timestamp("signed_at", { withTimezone: true }),
  createdById: integer("created_by_id"),
  approvedById: integer("approved_by_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDocumentSchema = createInsertSchema(documentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documentsTable.$inferSelect;

// Immutable version history — a row is written BEFORE any content overwrite.
export const documentVersionsTable = pgTable("document_versions", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull(),
  version: integer("version").notNull(),
  title: text("title").notNull(),
  content: text("content"),
  fileObjectPath: text("file_object_path"),
  originalFilename: text("original_filename"),
  mimeType: text("mime_type"),
  fileSize: integer("file_size"),
  fileChecksum: text("file_checksum"),
  contentOrigin: text("content_origin").notNull().default("human"),
  authorId: integer("author_id"),
  changeSummary: text("change_summary"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DocumentVersion = typeof documentVersionsTable.$inferSelect;
