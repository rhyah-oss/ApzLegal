import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const conflictsTable = pgTable("conflicts", {
  id: serial("id").primaryKey(),
  matterId: integer("matter_id"),
  clientName: text("client_name").notNull(),
  opposingParty: text("opposing_party"),
  severity: text("severity").notNull().default("none"), // none | low | medium | high
  // pending_review | cleared | approved | rejected | further_review
  status: text("status").notNull().default("pending"),
  conflictData: jsonb("conflict_data"),
  aiReasoning: text("ai_reasoning"),
  reviewedById: integer("reviewed_by_id"),
  reviewDecision: text("review_decision"), // approve | reject | request_further_review
  reviewReason: text("review_reason"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertConflictSchema = createInsertSchema(conflictsTable).omit({ id: true, createdAt: true, checkedAt: true });
export type InsertConflict = z.infer<typeof insertConflictSchema>;
export type Conflict = typeof conflictsTable.$inferSelect;
