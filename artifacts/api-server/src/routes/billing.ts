import { pagination } from "../lib/pagination";
import { Router, type IRouter } from "express";
import {
  db, invoicesTable, clientsTable, mattersTable, timeEntriesTable, usersTable, notificationsTable,
} from "@workspace/db";
import { eq, and, inArray, sql, type SQL } from "drizzle-orm";
import { getCurrentUser, logAudit } from "../lib/context";
import { BILLING_ROLES, PARTNER_ROLES, requireRole } from "../lib/permissions";
import {
  CreateInvoiceBody,
  UpdateInvoiceBody,
  GetInvoiceParams,
  UpdateInvoiceParams,
  ListInvoicesQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

// ── Governed billing lifecycle ───────────────────────────────────────────────
// Time Entry → Billing Review → Invoice Generation → Invoice Sent
// draft → pending_review → approved → sent → paid (overdue reachable from sent)
// Review decisions are partner-level only; status may never change via PATCH.
async function requireUser(req: any, res: any) {
  const user = await getCurrentUser(req);
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return null; }
  return user;
}

async function auditInvoice(req: any, inv: typeof invoicesTable.$inferSelect, action: string, details: string, userId: number) {
  await logAudit({
    action, entityType: "invoice", entityId: inv.id, entityTitle: inv.invoiceNumber,
    userId, details, ipAddress: req.ip,
  });
}

async function enrichInvoice(inv: typeof invoicesTable.$inferSelect, cached?: {
  clients: (typeof clientsTable.$inferSelect)[];
  matters: (typeof mattersTable.$inferSelect)[];
  users: (typeof usersTable.$inferSelect)[];
}) {
  const clients = cached?.clients ?? await db.select().from(clientsTable).where(eq(clientsTable.id, inv.clientId));
  const client = clients.find((item) => item.id === inv.clientId);
  let matterTitle: string | null = null;
  if (inv.matterId) {
    const matters = cached?.matters ?? await db.select().from(mattersTable).where(eq(mattersTable.id, inv.matterId));
    const m = matters.find((item) => item.id === inv.matterId);
    matterTitle = m?.title ?? null;
  }
  const ids = [inv.createdById, inv.reviewedById].filter((x): x is number => x != null);
  const users = cached?.users ?? (ids.length ? await db.select().from(usersTable).where(inArray(usersTable.id, ids)) : []);
  const nameOf = (id: number | null) => (id ? users.find((u) => u.id === id)?.name ?? null : null);
  return {
    ...inv,
    subtotal: parseFloat(inv.subtotal as string),
    tax: parseFloat(inv.tax as string),
    total: parseFloat(inv.total as string),
    clientName: client?.name ?? "Unknown",
    matterTitle,
    createdByName: nameOf(inv.createdById),
    reviewedByName: nameOf(inv.reviewedById),
  };
}

export async function nextInvoiceNumber(executor: Pick<typeof db, "execute"> = db) {
  const result = await executor.execute<{ value: string }>(sql`SELECT nextval('apz_invoice_number_seq')::text AS value`);
  return `INV-${new Date().getFullYear()}-${String(result.rows[0].value).padStart(5, "0")}`;
}

router.get("/invoices", async (req, res): Promise<void> => {
  const page = pagination(req, res);
  if (!page) return;
  const current = await requireUser(req, res);
  if (!current) return;
  const params = ListInvoicesQueryParams.safeParse(req.query);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const conditions: SQL[] = [];
  if (params.data.clientId) conditions.push(eq(invoicesTable.clientId, params.data.clientId));
  if (params.data.matterId) conditions.push(eq(invoicesTable.matterId, params.data.matterId));
  if (params.data.status) conditions.push(eq(invoicesTable.status, params.data.status));

  if (["candidate_attorney", "paralegal", "secretary"].includes(current.role)) conditions.push(eq(invoicesTable.createdById, current.id));
  const invoices = await db.select().from(invoicesTable).where(conditions.length ? and(...conditions) : undefined).orderBy(invoicesTable.createdAt, invoicesTable.id).limit(page.limit).offset(page.offset);
  const clientIds = invoices.map((invoice) => invoice.clientId);
  const matterIds = invoices.map((invoice) => invoice.matterId).filter((id): id is number => id != null);
  const userIds = invoices.flatMap((invoice) => [invoice.createdById, invoice.reviewedById]).filter((id): id is number => id != null);
  const [clients, matters, users] = await Promise.all([
    clientIds.length ? db.select().from(clientsTable).where(inArray(clientsTable.id, clientIds)) : Promise.resolve([]),
    matterIds.length ? db.select().from(mattersTable).where(inArray(mattersTable.id, matterIds)) : Promise.resolve([]),
    userIds.length ? db.select().from(usersTable).where(inArray(usersTable.id, userIds)) : Promise.resolve([]),
  ]);
  res.json(await Promise.all(invoices.map((invoice) => enrichInvoice(invoice, { clients, matters, users }))));
});

router.post("/invoices", async (req, res): Promise<void> => {
  const user = await requireRole(req, res, BILLING_ROLES, "Only billing staff may create invoices.");
  if (!user) return;
  const parsed = CreateInvoiceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [invoice] = await db.insert(invoicesTable).values({
    ...parsed.data,
    invoiceNumber: await nextInvoiceNumber(),
    status: "draft", // lifecycle always starts at draft, regardless of input
    createdById: user.id,
    subtotal: parsed.data.subtotal?.toString() ?? "0",
    tax: parsed.data.tax?.toString() ?? "0",
    total: parsed.data.total.toString(),
  }).returning();

  await auditInvoice(req, invoice, "invoice_created", `Invoice ${invoice.invoiceNumber} created (draft)`, user.id);
  res.status(201).json(await enrichInvoice(invoice));
});

// ── Invoice generation from unbilled time (Workflow 3 step) ─────────────────
router.post("/invoices/generate", async (req, res): Promise<void> => {
  const user = await requireRole(req, res, BILLING_ROLES, "Only billing staff may generate invoices.");
  if (!user) return;
  const matterId = parseInt(req.body?.matterId, 10);
  if (isNaN(matterId)) { res.status(400).json({ error: "matterId is required" }); return; }

  const [matter] = await db.select().from(mattersTable).where(eq(mattersTable.id, matterId));
  if (!matter) { res.status(404).json({ error: "Matter not found" }); return; }

  const result = await db.transaction(async (tx) => {
    const entries = await tx
      .select()
      .from(timeEntriesTable)
      .where(and(eq(timeEntriesTable.matterId, matterId), eq(timeEntriesTable.billed, false)))
      .for("update");
    if (entries.length === 0) return null;

    const subtotal = entries.reduce((s, e) => s + parseFloat(e.total as string), 0);
    const tax = Math.round(subtotal * 15) / 100; // 15% VAT
    const [invoice] = await tx.insert(invoicesTable).values({
      invoiceNumber: await nextInvoiceNumber(tx),
      clientId: matter.clientId,
      matterId,
      status: "draft",
      createdById: user.id,
      subtotal: subtotal.toFixed(2),
      tax: tax.toFixed(2),
      total: (subtotal + tax).toFixed(2),
    }).returning();

    await tx.update(timeEntriesTable)
      .set({ billed: true })
      .where(inArray(timeEntriesTable.id, entries.map((e) => e.id)));

    return { invoice, entryCount: entries.length };
  });

  if (!result) {
    res.status(409).json({ error: "No unbilled time entries on this matter.", code: "NO_UNBILLED_TIME" });
    return;
  }
  await auditInvoice(req, result.invoice, "invoice_generated",
    `Invoice ${result.invoice.invoiceNumber} generated from ${result.entryCount} unbilled time entr${result.entryCount === 1 ? "y" : "ies"} on "${matter.title}"`, user.id);
  res.status(201).json(await enrichInvoice(result.invoice));
});

router.get("/invoices/:id", async (req, res): Promise<void> => {
  const current = await requireUser(req, res);
  if (!current) return;
  const params = GetInvoiceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, params.data.id));
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }
  if (["candidate_attorney", "paralegal", "secretary"].includes(current.role) && invoice.createdById !== current.id) {
    res.status(404).json({ error: "Invoice not found" }); return;
  }
  res.json(await enrichInvoice(invoice));
});

// Amounts/dates may only be edited while the invoice is still a draft; status
// can never be changed through PATCH — only through the workflow endpoints.
router.patch("/invoices/:id", async (req, res): Promise<void> => {
  const user = await requireRole(req, res, BILLING_ROLES, "Only billing staff may edit invoices.");
  if (!user) return;
  const params = UpdateInvoiceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateInvoiceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { status: _ignored, ...data } = parsed.data as Record<string, unknown>;
  const updateData: Record<string, unknown> = { ...data };
  for (const k of ["subtotal", "tax", "total"] as const) {
    if (updateData[k] !== undefined) updateData[k] = String(updateData[k]);
  }

  const [invoice] = await db.update(invoicesTable)
    .set(updateData)
    .where(and(eq(invoicesTable.id, params.data.id), eq(invoicesTable.status, "draft")))
    .returning();
  if (!invoice) {
    const [existing] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, params.data.id));
    if (!existing) { res.status(404).json({ error: "Invoice not found" }); return; }
    res.status(409).json({ error: `Invoice is ${existing.status} — only draft invoices can be edited.`, code: "NOT_DRAFT" });
    return;
  }
  await auditInvoice(req, invoice, "invoice_edited", `Invoice ${invoice.invoiceNumber} edited (draft)`, user.id);
  res.json(await enrichInvoice(invoice));
});

// ── Workflow: submit for billing review ─────────────────────────────────────
router.post("/invoices/:id/submit", async (req, res): Promise<void> => {
  const user = await requireRole(req, res, BILLING_ROLES, "Only billing staff may submit invoices for review.");
  if (!user) return;
  const params = GetInvoiceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const [invoice] = await db.update(invoicesTable)
    .set({ status: "pending_review" })
    .where(and(eq(invoicesTable.id, params.data.id), eq(invoicesTable.status, "draft")))
    .returning();
  if (!invoice) {
    const [existing] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, params.data.id));
    if (!existing) { res.status(404).json({ error: "Invoice not found" }); return; }
    res.status(409).json({ error: `Invoice is ${existing.status} — only draft invoices can be submitted for billing review.`, code: "INVALID_STATE" });
    return;
  }

  await auditInvoice(req, invoice, "invoice_submitted_for_review", `Invoice ${invoice.invoiceNumber} submitted for billing review`, user.id);
  await db.insert(notificationsTable).values({
    targetRole: "partner",
    type: "invoice_review",
    title: "Invoice awaiting billing review",
    message: `${invoice.invoiceNumber} (R ${parseFloat(invoice.total as string).toFixed(2)}) requires billing review before it can be sent.`,
    link: `/billing?invoice=${invoice.id}`,
  });
  res.json(await enrichInvoice(invoice));
});

// ── Workflow: billing review decision (partner-level only) ──────────────────
router.post("/invoices/:id/decision", async (req, res): Promise<void> => {
  const user = await requireUser(req, res);
  if (!user) return;
  if (!PARTNER_ROLES.includes(user.role as (typeof PARTNER_ROLES)[number])) {
    res.status(403).json({ error: "Only partners may review invoices.", code: "FORBIDDEN_ROLE" });
    return;
  }
  const params = GetInvoiceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const decision = req.body?.decision;
  const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
  if (!["approve", "reject"].includes(decision)) { res.status(400).json({ error: "decision must be approve or reject" }); return; }
  if (decision === "reject" && !note) { res.status(400).json({ error: "A note is required when rejecting an invoice.", code: "NOTE_REQUIRED" }); return; }

  const targetStatus = decision === "approve" ? "approved" : "draft";
  const [invoice] = await db.update(invoicesTable)
    .set({ status: targetStatus, reviewedById: user.id, reviewNote: note || null })
    .where(and(eq(invoicesTable.id, params.data.id), eq(invoicesTable.status, "pending_review")))
    .returning();
  if (!invoice) {
    const [existing] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, params.data.id));
    if (!existing) { res.status(404).json({ error: "Invoice not found" }); return; }
    res.status(409).json({ error: `Invoice is ${existing.status} — only invoices pending review can be decided.`, code: "INVALID_STATE" });
    return;
  }

  await auditInvoice(req, invoice, decision === "approve" ? "invoice_approved" : "invoice_rejected",
    `Invoice ${invoice.invoiceNumber} ${decision === "approve" ? "approved in billing review" : `rejected in billing review: ${note}`}`, user.id);
  if (invoice.createdById) {
    await db.insert(notificationsTable).values({
      userId: invoice.createdById,
      type: "invoice_decision",
      title: `Invoice ${decision === "approve" ? "approved" : "returned"}`,
      message: `${invoice.invoiceNumber} was ${decision === "approve" ? "approved and can now be sent" : `returned to draft: ${note}`}.`,
      link: `/billing?invoice=${invoice.id}`,
    });
  }
  res.json(await enrichInvoice(invoice));
});

// ── Workflow: send (only after billing review approval) ─────────────────────
router.post("/invoices/:id/send", async (req, res): Promise<void> => {
  const user = await requireRole(req, res, BILLING_ROLES, "Only billing staff may send invoices.");
  if (!user) return;
  const params = GetInvoiceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const [invoice] = await db.update(invoicesTable)
    .set({ status: "sent", sentAt: new Date() })
    .where(and(eq(invoicesTable.id, params.data.id), eq(invoicesTable.status, "approved")))
    .returning();
  if (!invoice) {
    const [existing] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, params.data.id));
    if (!existing) { res.status(404).json({ error: "Invoice not found" }); return; }
    res.status(409).json({ error: `Invoice is ${existing.status} — an invoice must pass billing review before it can be sent.`, code: "REVIEW_REQUIRED" });
    return;
  }
  await auditInvoice(req, invoice, "invoice_sent", `Invoice ${invoice.invoiceNumber} sent to client`, user.id);
  res.json(await enrichInvoice(invoice));
});

// ── Workflow: mark paid ──────────────────────────────────────────────────────
router.post("/invoices/:id/mark-paid", async (req, res): Promise<void> => {
  const user = await requireRole(req, res, BILLING_ROLES, "Only billing staff may record invoice payment.");
  if (!user) return;
  const params = GetInvoiceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const [invoice] = await db.update(invoicesTable)
    .set({ status: "paid" })
    .where(and(eq(invoicesTable.id, params.data.id), inArray(invoicesTable.status, ["sent", "overdue"])))
    .returning();
  if (!invoice) {
    const [existing] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, params.data.id));
    if (!existing) { res.status(404).json({ error: "Invoice not found" }); return; }
    res.status(409).json({ error: `Invoice is ${existing.status} — only sent or overdue invoices can be marked paid.`, code: "INVALID_STATE" });
    return;
  }
  await auditInvoice(req, invoice, "invoice_paid", `Invoice ${invoice.invoiceNumber} marked paid`, user.id);
  res.json(await enrichInvoice(invoice));
});

export default router;
