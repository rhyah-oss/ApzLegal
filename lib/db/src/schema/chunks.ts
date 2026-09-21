import { pgTable, text, serial, timestamp, integer, boolean, vector, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const documentChunksTable = pgTable("document_chunks", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull(),
  matterId: integer("matter_id").notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  text: text("text").notNull(),
  embedding: vector("embedding", { dimensions: 768 }),
  metadata: jsonb("metadata").$type<{
    page?: number;
    section?: string;
    clause?: string;
    sourceType: "matter_document" | "email" | "knowledge" | "template" | "precedent";
    sourceId?: number;
    knowledgeItemId?: number;
    templateId?: number;
    documentType?: string;
    practiceArea?: string;
    jurisdiction?: string;
    approvalStatus?: string;
    mimeType?: string;
    authorId?: number;
    chunkingStrategy: "legal_aware" | "fixed" | "paragraph";
    tokenCount?: number;
  }>(),
  indexedAt: timestamp("indexed_at", { withTimezone: true }),
  indexingStatus: text("indexing_status").notNull().default("pending"), // pending | processing | indexed | failed
  indexingError: text("indexing_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  documentIdIdx: index("idx_document_chunks_document_id").on(table.documentId),
  matterIdIdx: index("idx_document_chunks_matter_id").on(table.matterId),
  embeddingIdx: index("idx_document_chunks_embedding").on(table.embedding),
  statusIdx: index("idx_document_chunks_indexing_status").on(table.indexingStatus),
  sourceTypeIdx: index("idx_document_chunks_source_type").on(table.metadata),
}));

export const knowledgeChunksTable = pgTable("knowledge_chunks", {
  id: serial("id").primaryKey(),
  knowledgeItemId: integer("knowledge_item_id").notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  text: text("text").notNull(),
  embedding: vector("embedding", { dimensions: 768 }),
  metadata: jsonb("metadata").$type<{
    section?: string;
    clause?: string;
    sourceType: "knowledge" | "template" | "precedent" | "guidance" | "opinion";
    knowledgeItemType?: string;
    category?: string;
    practiceArea?: string;
    jurisdiction?: string;
    documentType?: string;
    effectiveDate?: string;
    reviewDate?: string;
    authorId?: number;
    approvedById?: number;
    approvedAt?: string;
    version?: number;
    chunkingStrategy: "legal_aware" | "fixed" | "paragraph";
    tokenCount?: number;
  }>(),
  indexedAt: timestamp("indexed_at", { withTimezone: true }),
  indexingStatus: text("indexing_status").notNull().default("pending"),
  indexingError: text("indexing_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  knowledgeItemIdIdx: index("idx_knowledge_chunks_knowledge_item_id").on(table.knowledgeItemId),
  embeddingIdx: index("idx_knowledge_chunks_embedding").on(table.embedding),
  statusIdx: index("idx_knowledge_chunks_indexing_status").on(table.indexingStatus),
  sourceTypeIdx: index("idx_knowledge_chunks_source_type").on(table.metadata),
}));

export const retrievalLogsTable = pgTable("retrieval_logs", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id"),
  researchId: integer("research_id"),
  userId: integer("user_id").notNull(),
  matterId: integer("matter_id"),
  query: text("query").notNull(),
  retrievalMode: text("retrieval_mode").notNull(), // matter_only | knowledge | template | hybrid | general
  chunksRetrieved: integer("chunks_retrieved").notNull().default(0),
  sourcesUsed: jsonb("sources_used").$type<Array<{ type: string; id: number; title?: string; chunkCount: number }>>(),
  model: text("model"),
  latencyMs: integer("latency_ms"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDocumentChunkSchema = createInsertSchema(documentChunksTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertKnowledgeChunkSchema = createInsertSchema(knowledgeChunksTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertRetrievalLogSchema = createInsertSchema(retrievalLogsTable).omit({ id: true, createdAt: true });

export type DocumentChunk = typeof documentChunksTable.$inferSelect;
export type KnowledgeChunk = typeof knowledgeChunksTable.$inferSelect;
export type RetrievalLog = typeof retrievalLogsTable.$inferSelect;
export type InsertDocumentChunk = z.infer<typeof insertDocumentChunkSchema>;
export type InsertKnowledgeChunk = z.infer<typeof insertKnowledgeChunkSchema>;
export type InsertRetrievalLog = z.infer<typeof insertRetrievalLogSchema>;
