import { pagination } from "../lib/pagination";
import { Router, type IRouter } from "express";
import crypto from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, providerOperationsTable, mattersTable, documentsTable } from "@workspace/db";
import { getCurrentUser, logAudit } from "../lib/context";
import { LEGAL_AUTHOR_ROLES, requireRole } from "../lib/permissions";

const router: IRouter = Router();
const EmailBody = z.object({
  to: z.string().email(),
  cc: z.string().email().optional(),
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(100_000),
  matterId: z.number().int().positive(),
  documentId: z.number().int().positive().optional(),
  reviewed: z.literal(true),
  reviewNote: z.string().max(2_000).optional(),
  idempotencyKey: z.string().min(8).max(200).optional(),
});

function keyFor(kind: string, supplied?: string) {
  return supplied || `${kind}:${crypto.randomUUID()}`;
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505");
}

async function validateContext(matterId: number, documentId?: number) {
  const [matter] = await db.select({ id: mattersTable.id }).from(mattersTable).where(eq(mattersTable.id, matterId));
  if (!matter) return { error: "Matter not found.", code: "MATTER_NOT_FOUND" as const };
  if (documentId) {
    const [document] = await db.select({
      id: documentsTable.id,
      matterId: documentsTable.matterId,
      approvalStatus: documentsTable.approvalStatus,
      status: documentsTable.status,
    }).from(documentsTable).where(eq(documentsTable.id, documentId));
    if (!document || document.matterId !== matterId) return { error: "Document does not belong to this matter.", code: "DOCUMENT_CONTEXT_INVALID" as const };
    if (document.approvalStatus !== "approved") return { error: "Only an approved document can be attached to an outbound email.", code: "DOCUMENT_NOT_APPROVED" as const };
  }
  return null;
}

function operationTitle(operation: typeof providerOperationsTable.$inferSelect): string {
  const payload = operation.payload;
  return typeof payload.subject === "string"
    ? payload.subject
    : typeof payload.title === "string"
      ? payload.title
      : `${operation.kind} operation #${operation.id}`;
}

router.get("/provider-operations", async (req, res): Promise<void> => {
  const page = pagination(req, res);
  if (!page) return;
  const user = await getCurrentUser(req);
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const kind = req.query.kind === "email" || req.query.kind === "signature" ? String(req.query.kind) : undefined;
  const matterId = req.query.matterId != null ? Number(req.query.matterId) : undefined;
  if (matterId !== undefined && (!Number.isInteger(matterId) || matterId <= 0)) {
    res.status(400).json({ error: "Invalid matterId." }); return;
  }
  const conditions = [
    ...(kind ? [eq(providerOperationsTable.kind, kind)] : []),
    ...(matterId !== undefined ? [eq(providerOperationsTable.matterId, matterId)] : []),
  ];
  const operations = await db.select().from(providerOperationsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(providerOperationsTable.createdAt), providerOperationsTable.id).limit(page.limit).offset(page.offset);
  res.json(operations);
});

router.post("/provider-operations/email", async (req, res): Promise<void> => {
  const user = await requireRole(req, res, LEGAL_AUTHOR_ROLES, "Only legal staff may queue outbound email.");
  if (!user) return;
  const parsed = EmailBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const data = parsed.data;
  const contextError = await validateContext(data.matterId, data.documentId);
  if (contextError) { res.status(409).json(contextError); return; }
  const idempotencyKey = keyFor("email", data.idempotencyKey);
  const [existing] = await db.select().from(providerOperationsTable).where(eq(providerOperationsTable.idempotencyKey, idempotencyKey));
  if (existing) { res.status(200).json(existing); return; }
  let created: typeof providerOperationsTable.$inferSelect;
  try {
    [created] = await db.insert(providerOperationsTable).values({
      kind: "email",
      status: "queued",
      idempotencyKey,
      providerName: "not_connected",
      matterId: data.matterId,
      documentId: data.documentId,
      payload: { to: data.to, cc: data.cc ?? null, subject: data.subject, body: data.body, matterId: data.matterId, documentId: data.documentId ?? null, reviewed: true, reviewNote: data.reviewNote ?? null },
      reviewedById: user.id,
      reviewedAt: new Date(),
      createdById: user.id,
    }).returning();
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const [raced] = await db.select().from(providerOperationsTable).where(eq(providerOperationsTable.idempotencyKey, idempotencyKey));
    if (!raced) { res.status(409).json({ error: "The email operation could not be created safely.", code: "IDEMPOTENCY_CONFLICT" }); return; }
    res.status(200).json(raced);
    return;
  }
  await logAudit({ action: "email_queued_for_provider", entityType: "email", entityId: created.id, entityTitle: data.subject, userId: user.id, details: `Outbound email queued for provider handoff; provider is not connected.` });
  res.status(201).json(created);
});

router.post("/provider-operations/:id/status", async (req, res): Promise<void> => {
  const user = await requireRole(req, res, LEGAL_AUTHOR_ROLES, "Only legal staff may update provider operation status.");
  if (!user) return;
  const id = Number(req.params.id);
  const parsed = z.object({
    status: z.enum(["provider_confirmed", "failed"]),
    providerName: z.string().trim().min(1).max(100),
    providerRequestId: z.string().trim().max(300).optional(),
    providerEventId: z.string().trim().min(1).max(300),
    errorMessage: z.string().max(2000).optional(),
  }).safeParse(req.body);
  if (!Number.isInteger(id) || !parsed.success) { res.status(400).json({ error: "Invalid provider status update." }); return; }
  // A staff session and caller-supplied event ID are not provider verification.
  // Confirmation must come from a verified provider integration, not this UI route.
  if (parsed.data.status === "provider_confirmed") {
    res.status(403).json({ error: "Provider confirmation requires a verified provider callback.", code: "TRUSTED_PROVIDER_REQUIRED" });
    return;
  }
  const [operation] = await db.select().from(providerOperationsTable).where(eq(providerOperationsTable.id, id));
  if (!operation) { res.status(404).json({ error: "Provider operation not found." }); return; }
  if (operation.providerEventId === parsed.data.providerEventId && operation.providerName === parsed.data.providerName) { res.json(operation); return; }
  if (operation.providerEventId === parsed.data.providerEventId && operation.providerName !== parsed.data.providerName) {
    res.status(409).json({ error: "Provider event belongs to a different provider.", code: "PROVIDER_EVENT_PROVIDER_MISMATCH" });
    return;
  }
  const [eventOwner] = await db.select({ id: providerOperationsTable.id }).from(providerOperationsTable).where(and(
    eq(providerOperationsTable.providerName, parsed.data.providerName),
    eq(providerOperationsTable.providerEventId, parsed.data.providerEventId),
  ));
  if (eventOwner && eventOwner.id !== id) {
    res.status(409).json({ error: "This provider event has already been applied to another operation.", code: "PROVIDER_EVENT_REUSED" });
    return;
  }
  if (operation.status !== "queued") {
    res.status(409).json({ error: "This provider operation already has a terminal status.", code: "PROVIDER_OPERATION_TERMINAL" });
    return;
  }
  if (operation.providerRequestId && parsed.data.providerRequestId && operation.providerRequestId !== parsed.data.providerRequestId) {
    res.status(409).json({ error: "Provider request ID does not match this operation.", code: "PROVIDER_REQUEST_MISMATCH" });
    return;
  }
  const [updated] = await db.update(providerOperationsTable).set({
    status: parsed.data.status,
    providerName: parsed.data.providerName,
    providerRequestId: parsed.data.providerRequestId ?? operation.providerRequestId,
    providerEventId: parsed.data.providerEventId,
    errorMessage: parsed.data.status === "failed" ? parsed.data.errorMessage ?? "Provider reported failure." : null,
  }).where(and(eq(providerOperationsTable.id, id), eq(providerOperationsTable.status, "queued"))).returning();
  if (!updated) {
    const [current] = await db.select().from(providerOperationsTable).where(eq(providerOperationsTable.id, id));
    if (current?.providerEventId === parsed.data.providerEventId) { res.json(current); return; }
    res.status(409).json({ error: "This provider operation was updated concurrently.", code: "PROVIDER_OPERATION_RACE" });
    return;
  }
  await logAudit({ action: parsed.data.status === "failed" ? "provider_operation_failed" : "provider_operation_confirmed", entityType: operation.kind, entityId: operation.id, entityTitle: operationTitle(operation), userId: user.id, details: `${parsed.data.providerName} event ${parsed.data.providerEventId}: ${updated.errorMessage ?? "Provider status updated."}` });
  res.json(updated);
});

router.post("/provider-operations/:id/retry", async (req, res): Promise<void> => {
  const user = await requireRole(req, res, LEGAL_AUTHOR_ROLES, "Only legal staff may retry provider operations.");
  if (!user) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid provider operation ID." }); return; }
  const [operation] = await db.select().from(providerOperationsTable).where(eq(providerOperationsTable.id, id));
  if (!operation) { res.status(404).json({ error: "Provider operation not found." }); return; }
  if (operation.status !== "failed") {
    res.status(409).json({ error: "Only failed provider operations can be retried.", code: "RETRY_NOT_ALLOWED" }); return;
  }
  const attempt = operation.attempt + 1;
  const idempotencyKey = `${operation.idempotencyKey}:attempt:${attempt}`;
  const [existing] = await db.select().from(providerOperationsTable).where(eq(providerOperationsTable.idempotencyKey, idempotencyKey));
  if (existing) { res.json(existing); return; }
  let retry: typeof providerOperationsTable.$inferSelect;
  try {
    [retry] = await db.insert(providerOperationsTable).values({
      kind: operation.kind,
      status: "queued",
      idempotencyKey,
      providerName: "not_connected",
      matterId: operation.matterId,
      documentId: operation.documentId,
      payload: { ...operation.payload, retryOfOperationId: operation.id, attempt },
      attempt,
      retryOfId: operation.id,
      reviewedById: operation.reviewedById,
      reviewedAt: operation.reviewedAt,
      createdById: user.id,
    }).returning();
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const [raced] = await db.select().from(providerOperationsTable).where(eq(providerOperationsTable.idempotencyKey, idempotencyKey));
    if (!raced) { res.status(409).json({ error: "The retry could not be created safely.", code: "RETRY_CONFLICT" }); return; }
    res.json(raced);
    return;
  }
  await logAudit({ action: "provider_operation_requeued", entityType: operation.kind, entityId: retry.id, entityTitle: operationTitle(operation), userId: user.id, details: `Retry attempt ${attempt} created from operation #${operation.id}; provider is not connected.` });
  res.status(201).json(retry);
});

export default router;
