import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

// Lightweight in-app notifications. Either targeted at a specific user
// (userId) or at every user holding a role (targetRole).
export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  targetRole: text("target_role"), // e.g. partner | managing_partner
  type: text("type").notNull(), // document_submitted | document_decision | conflict_review | general
  title: text("title").notNull(),
  message: text("message"),
  link: text("link"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Notification = typeof notificationsTable.$inferSelect;
