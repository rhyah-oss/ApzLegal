import { pgTable, text, serial, timestamp, integer, numeric, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Governed AI outputs. Every row is a traceable AI work product bound to a matter.
export const aiConversationsTable = pgTable("ai_conversations", {
  id: serial("id").primaryKey(),
  matterId: integer("matter_id"),
  userId: integer("user_id"),
  workflow: text("workflow").notNull().default("general"), // draft_contract | summarise_matter | draft_email | analyse_clause | legal_research | matter_summary | general
  title: text("title"),
  params: jsonb("params").$type<Record<string, unknown>>(), // workflow inputs: contractType, jurisdiction, clauses, instructions...
  query: text("query").notNull(),
  response: text("response").notNull(),
  model: text("model"),
  explanation: text("explanation"), // AI's own explanation of its reasoning/limitations
  riskLevel: text("risk_level").notNull().default("low"), // low | medium | high — classified server-side by workflow
  confidenceScore: numeric("confidence_score", { precision: 5, scale: 2 }),
  citations: text("citations").array(),
  citationStatus: text("citation_status").notNull().default("none"), // none | unverified | verified
  reviewStatus: text("review_status").notNull().default("pending"), // pending | reviewed | overridden
  reviewNote: text("review_note"),
  humanOverride: boolean("human_override").notNull().default(false),
  reviewedById: integer("reviewed_by_id"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  documentId: integer("document_id"), // set when saved to the matter as a governed document
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAiConversationSchema = createInsertSchema(aiConversationsTable).omit({ id: true, createdAt: true });
export type InsertAiConversation = z.infer<typeof insertAiConversationSchema>;
export type AiConversation = typeof aiConversationsTable.$inferSelect;
