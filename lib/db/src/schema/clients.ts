import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clientsTable = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  // type: individual | corporate | trust | government
  type: text("type").notNull().default("individual"),
  // status: active | inactive | pending
  status: text("status").notNull().default("active"),

  // Identity
  idNumber:             text("id_number"),
  passportNumber:       text("passport_number"),
  companyRegistration:  text("company_registration"),
  vatNumber:            text("vat_number"),
  trustNumber:          text("trust_number"),

  // Contact
  email:    text("email"),
  phone:    text("phone"),
  address:  text("address"),
  city:     text("city"),
  province: text("province"),
  country:  text("country").default("South Africa"),

  // Compliance — document-level
  ficaStatus: text("fica_status").notNull().default("pending"), // compliant | pending | expired | blocked

  // Compliance — account-level (highly visible)
  // compliant | review_required | blocked
  complianceStatus:      text("compliance_status").notNull().default("review_required"),
  complianceBlockReason: text("compliance_block_reason"),

  // Risk
  riskScore: integer("risk_score").default(0),
  // low | medium | high
  riskLevel:  text("risk_level").notNull().default("low"),

  notes: text("notes"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertClientSchema = createInsertSchema(clientsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clientsTable.$inferSelect;
