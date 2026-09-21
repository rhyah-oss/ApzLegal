import { pgTable, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const notificationPreferencesTable = pgTable("notification_preferences", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  emailEnabled: boolean("email_enabled").notNull().default(false),
  inAppEnabled: boolean("in_app_enabled").notNull().default(true),
  conflictAlerts: boolean("conflict_alerts").notNull().default(true),
  approvalAlerts: boolean("approval_alerts").notNull().default(true),
  billingAlerts: boolean("billing_alerts").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});