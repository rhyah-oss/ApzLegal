import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const knowledgeItemsTable = pgTable("knowledge_items", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content"),
  type: text("type").notNull().default("template"), // template | opinion | guidance | precedent
  category: text("category").notNull(),
  tags: text("tags").array(),
  documentType: text("document_type"),
  documentSubtype: text("document_subtype"), // nda | partnership | employment | service | generic | null
  practiceArea: text("practice_area"),
  jurisdiction: text("jurisdiction"),
  effectiveDate: timestamp("effective_date", { withTimezone: true }),
  reviewDate: timestamp("review_date", { withTimezone: true }),
  fileObjectPath: text("file_object_path"),
  originalFilename: text("original_filename"),
  mimeType: text("mime_type"),
  fileSize: integer("file_size"),
  fileChecksum: text("file_checksum"),
  // Workflow: uploaded → pending_approval → approved | rejected; archived is terminal.
  status: text("status").notNull().default("uploaded"), // uploaded | pending_approval | approved | rejected | archived
  // AI indexing pipeline: none → indexing → indexed. Only approved+indexed items are AI-retrievable.
  aiIndexStatus: text("ai_index_status").notNull().default("none"), // none | indexing | indexed
  aiIndexedAt: timestamp("ai_indexed_at", { withTimezone: true }),
  version: integer("version").notNull().default(1),
  authorId: integer("author_id"), // uploaded by
  reviewedById: integer("reviewed_by_id"),
  approvedById: integer("approved_by_id"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  reviewNote: text("review_note"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

/** Immutable snapshots of previous versions — approved legal knowledge is never silently overwritten. */
export const knowledgeItemVersionsTable = pgTable("knowledge_item_versions", {
  id: serial("id").primaryKey(),
  knowledgeItemId: integer("knowledge_item_id").notNull(),
  version: integer("version").notNull(),
  title: text("title").notNull(),
  content: text("content"),
  type: text("type").notNull(),
  category: text("category").notNull(),
  tags: text("tags").array(),
  documentType: text("document_type"),
  documentSubtype: text("document_subtype"),
  practiceArea: text("practice_area"),
  jurisdiction: text("jurisdiction"),
  effectiveDate: timestamp("effective_date", { withTimezone: true }),
  reviewDate: timestamp("review_date", { withTimezone: true }),
  fileObjectPath: text("file_object_path"),
  originalFilename: text("original_filename"),
  mimeType: text("mime_type"),
  fileSize: integer("file_size"),
  fileChecksum: text("file_checksum"),
  status: text("status").notNull(),
  wasApproved: boolean("was_approved").notNull().default(false),
  editedById: integer("edited_by_id"),
  changeSummary: text("change_summary"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertKnowledgeItemSchema = createInsertSchema(knowledgeItemsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKnowledgeItem = z.infer<typeof insertKnowledgeItemSchema>;
export type KnowledgeItem = typeof knowledgeItemsTable.$inferSelect;
export type KnowledgeItemVersion = typeof knowledgeItemVersionsTable.$inferSelect;
