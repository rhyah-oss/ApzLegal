import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Compliance event timeline — every significant FICA/compliance action is
 * recorded here for auditing and client-profile display.
 *
 * eventType values:
 *   document_uploaded | document_verified | document_rejected | document_expired
 *   risk_score_changed | compliance_status_changed | manual_override
 *   onboarding_step_completed | conflict_check_passed | partner_approved
 */
export const complianceEventsTable = pgTable("compliance_events", {
  id:             serial("id").primaryKey(),
  clientId:       integer("client_id").notNull(),
  eventType:      text("event_type").notNull(),
  description:    text("description").notNull(),
  ficaDocumentId: integer("fica_document_id"),  // optional link to specific doc
  userId:         integer("user_id"),            // who triggered
  metadata:       text("metadata"),              // JSON blob for extra context
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertComplianceEventSchema = createInsertSchema(complianceEventsTable).omit({ id: true, createdAt: true });
export type InsertComplianceEvent = z.infer<typeof insertComplianceEventSchema>;
export type ComplianceEvent = typeof complianceEventsTable.$inferSelect;
