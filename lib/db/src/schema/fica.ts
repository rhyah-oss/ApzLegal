import { pgTable, text, serial, timestamp, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ficaDocumentsTable = pgTable("fica_documents", {
  id:              serial("id").primaryKey(),
  clientId:        integer("client_id").notNull(),
  // id_document | passport | proof_of_address | company_registration | beneficial_ownership | trust_deed | mandate_letter | other
  type:            text("type").notNull(),
  // missing | uploaded | pending_verification | verified | rejected | expired
  status:          text("status").notNull().default("missing"),
  expiryDate:      date("expiry_date", { mode: "string" }),
  uploadedAt:      timestamp("uploaded_at", { withTimezone: true }),
  verifiedAt:      timestamp("verified_at", { withTimezone: true }),
  verifiedById:    integer("verified_by_id"),   // user who verified
  rejectedReason:  text("rejected_reason"),
  documentRef:     text("document_ref"),        // file path / reference number
  fileObjectPath:  text("file_object_path"),
  originalFilename: text("original_filename"),
  mimeType:        text("mime_type"),
  fileSize:        integer("file_size"),
  fileChecksum:    text("file_checksum"),
  notes:           text("notes"),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertFicaDocumentSchema = createInsertSchema(ficaDocumentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFicaDocument = z.infer<typeof insertFicaDocumentSchema>;
export type FicaDocument = typeof ficaDocumentsTable.$inferSelect;
