import { pgTable, text, serial, timestamp, integer, boolean, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const mattersTable = pgTable("matters", {
  id: serial("id").primaryKey(),
  reference: text("reference").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("lead"), // lead | conflict_check | approved | active | review | completed | closed | archived
  riskFlag: boolean("risk_flag").notNull().default(false),
  riskLevel: text("risk_level").notNull().default("no_risk"), // no_risk | review_required | high_risk | compliance_blocked
  clientId: integer("client_id").notNull(),
  assignedToId: integer("assigned_to_id"),
  practiceArea: text("practice_area"),
  value: numeric("value", { precision: 15, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertMatterSchema = createInsertSchema(mattersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMatter = z.infer<typeof insertMatterSchema>;
export type Matter = typeof mattersTable.$inferSelect;
