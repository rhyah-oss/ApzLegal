import { pgTable, text, serial, timestamp, integer, boolean, jsonb, numeric } from "drizzle-orm/pg-core";

// Governed legal research (PRD v2, User Journey 4). Every research run is
// matter-bound and stored as a traceable record; "save to matter" makes it a
// formal part of the matter record.
export const researchRecordsTable = pgTable("research_records", {
  id: serial("id").primaryKey(),
  matterId: integer("matter_id").notNull(),
  userId: integer("user_id"),
  query: text("query").notNull(),
  // which sources the attorney selected: firm_precedents | knowledge_base | case_law | legislation
  sourcesRequested: text("sources_requested").array().notNull(),
  // internal hits: [{ id, title, type, category, status }]
  internalResults: jsonb("internal_results"),
  // AI-derived findings (external sources are AI-assisted until Phase 1D live integrations)
  aiStatus: text("ai_status").notNull().default("unavailable"), // ok | unavailable | failed
  aiError: text("ai_error"),
  aiSummary: text("ai_summary"),
  caseReferences: text("case_references").array(),
  legislation: text("legislation").array(),
  citations: text("citations").array(),
  citationStatus: text("citation_status").notNull().default("none"), // none | unverified | verified
  confidenceScore: numeric("confidence_score", { precision: 5, scale: 2 }),
  explanation: text("explanation"),
  model: text("model"),
  savedToMatter: boolean("saved_to_matter").notNull().default(false),
  savedAt: timestamp("saved_at", { withTimezone: true }),
  savedById: integer("saved_by_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ResearchRecord = typeof researchRecordsTable.$inferSelect;
