import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const relatedPartiesTable = pgTable("related_parties", {
  id:          serial("id").primaryKey(),
  clientId:    integer("client_id").notNull(),
  role:        text("role").notNull(), // director | beneficial_owner | beneficiary | opposing_party | trustee | shareholder | other
  name:        text("name").notNull(),
  idNumber:    text("id_number"),
  passportNo:  text("passport_no"),
  email:       text("email"),
  phone:       text("phone"),
  notes:       text("notes"),
  ownershipPct: text("ownership_pct"), // percentage if applicable
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertRelatedPartySchema = createInsertSchema(relatedPartiesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRelatedParty = z.infer<typeof insertRelatedPartySchema>;
export type RelatedParty = typeof relatedPartiesTable.$inferSelect;
