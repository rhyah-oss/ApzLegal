import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const visitorsTable = pgTable("visitors", {
  id:                  serial("id").primaryKey(),
  name:                text("name").notNull(),
  company:             text("company"),
  contactInfo:         text("contact_info"),
  purpose:             text("purpose"),
  status:              text("status").notNull().default("expected"), // expected | checked_in | with_attorney | checked_out | cancelled | no_show
  hostId:              integer("host_id"),            // user they are visiting
  assignedToId:        integer("assigned_to_id"),    // user responsible for this visitor
  clientId:            integer("client_id"),
  matterId:            integer("matter_id"),
  appointmentId:       integer("appointment_id"),
  expectedArrival:     timestamp("expected_arrival", { withTimezone: true }),
  expectedDeparture:   timestamp("expected_departure", { withTimezone: true }),
  checkedInAt:         timestamp("checked_in_at", { withTimezone: true }),
  checkedOutAt:        timestamp("checked_out_at", { withTimezone: true }),
  createdAt:           timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:           timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertVisitorSchema = createInsertSchema(visitorsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVisitor = z.infer<typeof insertVisitorSchema>;
export type Visitor = typeof visitorsTable.$inferSelect;
