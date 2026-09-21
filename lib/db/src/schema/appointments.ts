import { pgTable, text, serial, timestamp, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const appointmentsTable = pgTable("appointments", {
  id:                 serial("id").primaryKey(),
  title:              text("title").notNull(),
  type:               text("type").notNull().default("consultation"), // consultation | meeting | hearing | other
  status:             text("status").notNull().default("scheduled"),  // scheduled | confirmed | rescheduled | cancelled | completed | no_show
  date:               date("date", { mode: "string" }).notNull(),
  startTime:          text("start_time").notNull(),
  endTime:            text("end_time"),
  durationMinutes:    integer("duration_minutes"),
  location:           text("location"),
  virtualMeetingUrl:  text("virtual_meeting_url"),
  notes:              text("notes"),
  externalAttendees:  text("external_attendees").array(),
  clientId:           integer("client_id"),
  matterId:           integer("matter_id"),
  assignedToId:       integer("assigned_to_id"),    // attorney/staff this is scheduled for
  createdById:        integer("created_by_id"),
  createdAt:          timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:          timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAppointmentSchema = createInsertSchema(appointmentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;
export type Appointment = typeof appointmentsTable.$inferSelect;
