import { Router, type IRouter } from "express";
import crypto from "crypto";
import { z } from "zod";
import {
  db, documentsTable, documentVersionsTable, providerOperationsTable, usersTable, mattersTable, notificationsTable, auditLogsTable, notificationPreferencesTable, knowledgeItemsTable,
} from "@workspace/db";
import { eq, and, desc, inArray, or, ilike } from "drizzle-orm";
import { getCurrentUser, logAudit } from "../lib/context";
import { LEGAL_AUTHOR_ROLES, PARTNER_ROLES, requireRole } from "../lib/permissions";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { indexDocument } from "../lib/indexing-service";
import {
  AddMatterDocumentBody,
  UpdateMatterDocumentBody,
  ApproveMatterDocumentBody,
  ListMatterDocumentsParams,
  AddMatterDocumentParams,
  GetMatterDocumentParams,
  UpdateMatterDocumentParams,
  ApproveMatterDocumentParams,
} from "@workspace/api-zod";
import type { TemplateInstantiateInput } from "@workspace/api-zod";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();
const MAX_DOCUMENT_SIZE = 25 * 1024 * 1024;
const SUPPORTED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/rtf",
  "text/plain",
  "application/vnd.oasis.opendocument.text",
] as const;
const ASSIGNMENT_RESTRICTED_ROLES = ["candidate_attorney", "paralegal", "secretary", "legal_secretary"];
const FileMetadata = z.object({
  fileObjectPath: z.string().startsWith("/objects/"),
  originalFilename: z.string().trim().min(1).max(255),
  mimeType: z.enum(SUPPORTED_DOCUMENT_MIME_TYPES),
  fileSize: z.number().int().positive().max(MAX_DOCUMENT_SIZE),
  fileChecksum: z.string().regex(/^[a-f0-9]{64}$/i),
});
const TemplateInstantiateBody = z.object({
  matterId: z.number().int().positive(),
  title: z.string().trim().min(1).max(255).optional(),
  documentType: z.enum(["contract", "pleading", "opinion", "correspondence", "affidavit", "general"]).optional(),
}) satisfies z.ZodType<TemplateInstantiateInput>;

// ── Governed document lifecycle ──────────────────────────────────────────────
// draft → ai_assist → review → partner_approval → client_signing → archived
// Approval/signing states are ONLY reachable through the dedicated workflow
// endpoints below — never via generic PATCH.
const DOC_TRANSITIONS: Record<string, string[]> = {
  draft:            ["ai_assist", "review"],
  ai_assist:        ["review", "draft"],
  review:           ["draft"], // forward move happens via /submit
  partner_approval: [],        // decided via /decision
  client_signing:   [],        // progresses via /send-signature, /sign, /archive
  archived:         [],
};

async function enrichDoc(d: typeof documentsTable.$inferSelect) {
  const ids = [d.createdById, d.approvedById, d.submittedById].filter((x): x is number => x != null);
  const [users, providerOperations] = await Promise.all([
    ids.length ? db.select().from(usersTable).where(inArray(usersTable.id, ids)) : Promise.resolve([] as (typeof usersTable.$inferSelect)[]),
    db.select().from(providerOperationsTable)
      .where(and(eq(providerOperationsTable.kind, "signature"), eq(providerOperationsTable.documentId, d.id)))
      .orderBy(desc(providerOperationsTable.createdAt))
      .limit(1),
  ]);
  const nameOf = (id: number | null) => (id ? users.find((u) => u.id === id)?.name ?? null : null);
  return {
    ...d,
    confidenceScore: d.confidenceScore != null ? parseFloat(d.confidenceScore as string) : null,
    citations: d.citations ?? [],
    sections: d.sections ?? [],
    createdByName: nameOf(d.createdById),
    approvedByName: nameOf(d.approvedById),
    submittedByName: nameOf(d.submittedById),
    providerOperation: providerOperations[0] ?? null,
  };
}

async function findDoc(matterId: number, id: number) {
  const [doc] = await db
    .select()
    .from(documentsTable)
    .where(and(eq(documentsTable.matterId, matterId), eq(documentsTable.id, id)));
  return doc ?? null;
}

function safeFilename(filename: string): string {
  const basename = filename.replaceAll("\\", "/").split("/").pop() ?? "";
  const cleaned = basename.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return cleaned.slice(0, 255) || "document";
}

// All lifecycle-mutating document routes require an authenticated user.
async function requireUser(req: any, res: any) {
  const user = await getCurrentUser(req);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }
  return user;
}

async function auditDoc(req: any, doc: { id: number; title: string }, action: string, details: string, userId?: number | null) {
  const uid = userId !== undefined ? userId : (await getCurrentUser(req))?.id ?? null;
  await logAudit({
    action,
    entityType: "document",
    entityId: doc.id,
    entityTitle: doc.title,
    userId: uid,
    details,
    ipAddress: req.ip,
  });
}

function parseSignatureEvidence(details: string | null): Record<string, unknown> | null {
  if (!details) return null;
  try {
    const parsed = JSON.parse(details) as { kind?: string; evidence?: Record<string, unknown> };
    return parsed.kind === "signature_evidence" && parsed.evidence ? parsed.evidence : null;
  } catch {
    return null;
  }
}

function signatureSealKey(): string | null {
  return process.env.SESSION_SECRET ?? null;
}

function sealSignatureEvidence(evidence: Record<string, unknown>, key: string): string {
  return crypto.createHmac("sha256", key).update(JSON.stringify(evidence)).digest("hex");
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function snapshotVersion(tx: Tx | typeof db, doc: typeof documentsTable.$inferSelect, authorId: number | null, changeSummary: string) {
  await tx.insert(documentVersionsTable).values({
    documentId: doc.id,
    version: doc.version,
    title: doc.title,
    content: doc.content,
    fileObjectPath: doc.fileObjectPath,
    originalFilename: doc.originalFilename,
    mimeType: doc.mimeType,
    fileSize: doc.fileSize,
    fileChecksum: doc.fileChecksum,
    contentOrigin: doc.contentOrigin,
    authorId,
    changeSummary,
  });
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

router.post("/templates/:templateId/instantiate", async (req, res): Promise<void> => {
  const templateId = Number(req.params.templateId);
  if (!Number.isInteger(templateId) || templateId <= 0) {
    res.status(400).json({ error: "Invalid templateId" });
    return;
  }
  const parsed = TemplateInstantiateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const user = await requireRole(req, res, LEGAL_AUTHOR_ROLES, "Only legal staff may create matter documents.");
  if (!user) return;

  const [template] = await db.select().from(knowledgeItemsTable)
    .where(and(eq(knowledgeItemsTable.id, templateId), eq(knowledgeItemsTable.type, "template")));
  if (!template) { res.status(404).json({ error: "Template not found" }); return; }
  if (template.status !== "approved") {
    res.status(409).json({ error: "Only approved templates can create matter documents.", code: "TEMPLATE_NOT_APPROVED" });
    return;
  }

  const [matter] = await db.select().from(mattersTable).where(eq(mattersTable.id, parsed.data.matterId));
  if (!matter) { res.status(404).json({ error: "Matter not found" }); return; }
  if (["candidate_attorney", "paralegal", "secretary", "legal_secretary"].includes(user.role) && matter.assignedToId !== user.id) {
    res.status(403).json({ error: "You do not have access to this matter.", code: "ASSIGNMENT_REQUIRED" });
    return;
  }

  const title = parsed.data.title?.trim() || template.title;
  const docType = parsed.data.documentType || template.documentType || "general";
  const doc = await db.transaction(async (tx) => {
    const [created] = await tx.insert(documentsTable).values({
      matterId: matter.id,
      title,
      documentType: docType,
      content: template.content,
      fileObjectPath: template.fileObjectPath,
      originalFilename: template.originalFilename,
      mimeType: template.mimeType,
      fileSize: template.fileSize,
      fileChecksum: template.fileChecksum,
      sourceTemplateId: template.id,
      sourceTemplateVersion: template.version,
      contentOrigin: "human",
      aiGenerated: false,
      createdById: user.id,
    }).returning();
    await snapshotVersion(tx, created, user.id, `Created from template "${template.title}" v${template.version}`);
    return created;
  });
  await auditDoc(req, doc, "template_instantiated", `Created from template "${template.title}" v${template.version}`, user.id);
  await logAudit({
    action: "template_used",
    entityType: "knowledge_item",
    entityId: template.id,
    entityTitle: template.title,
    userId: user.id,
    details: `Instantiated in matter ${matter.reference} as document ${doc.id}`,
    ipAddress: req.ip,
  });
  res.status(201).json(await enrichDoc(doc));
});

router.get("/documents", async (req: any, res: any): Promise<void> => {
  const current = await getCurrentUser(req);
  const q = req.query as Record<string, string | undefined>;

  const conditions: any[] = [];
  if (q.search && q.search.trim().length >= 2) {
    const term = `%${q.search.trim()}%`;
    conditions.push(or(ilike(documentsTable.title, term), ilike(mattersTable.reference, term)));
  }
  if (q.status) conditions.push(eq(documentsTable.status, q.status));
  if (q.documentType) conditions.push(eq(documentsTable.documentType, q.documentType));
  if (q.contentOrigin) conditions.push(eq(documentsTable.contentOrigin, q.contentOrigin));
  if (q.matterId && !isNaN(Number(q.matterId))) conditions.push(eq(documentsTable.matterId, Number(q.matterId)));
  if (q.clientId && !isNaN(Number(q.clientId))) {
    const clientMatters = await db.select({ id: mattersTable.id }).from(mattersTable).where(eq(mattersTable.clientId, Number(q.clientId)));
    if (clientMatters.length) conditions.push(inArray(documentsTable.matterId, clientMatters.map(m => m.id)));
  }

  const matterAccessConditions: any[] = [];
  if (current && ["candidate_attorney", "paralegal", "secretary"].includes(current.role)) {
    const assignedMatters = await db.select({ id: mattersTable.id }).from(mattersTable).where(eq(mattersTable.assignedToId, current.id));
    if (assignedMatters.length) matterAccessConditions.push(inArray(documentsTable.matterId, assignedMatters.map(m => m.id)));
    else matterAccessConditions.push(eq(documentsTable.id, -1));
  }

  const whereClause = conditions.length || matterAccessConditions.length ? and(...conditions, ...matterAccessConditions) : undefined;

  const docs = await db.select().from(documentsTable)
    .leftJoin(mattersTable, eq(documentsTable.matterId, mattersTable.id))
    .where(whereClause)
    .orderBy(desc(documentsTable.updatedAt));

  const enriched = await Promise.all(docs.map((row) => enrichDoc(row.documents)));
  res.json(enriched.map((d, i) => {
    const matter = docs[i].matters;
    return { ...d, matterTitle: matter?.title ?? null, matterReference: matter?.reference ?? null, clientId: matter?.clientId ?? null };
  }));
});

router.get("/matters/:matterId/documents", async (req, res): Promise<void> => {
  const current = await getCurrentUser(req);
  const params = ListMatterDocumentsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid matterId" }); return; }
  if (current && ["candidate_attorney", "paralegal", "secretary"].includes(current.role)) {
    const [matter] = await db.select().from(mattersTable).where(eq(mattersTable.id, params.data.matterId));
    if (!matter || matter.assignedToId !== current.id) { res.status(403).json({ error: "You do not have access to this matter.", code: "ASSIGNMENT_REQUIRED" }); return; }
  }

  const docs = await db.select().from(documentsTable).where(eq(documentsTable.matterId, params.data.matterId)).orderBy(desc(documentsTable.updatedAt));
  res.json(await Promise.all(docs.map(enrichDoc)));
});

router.post("/matters/:matterId/documents", async (req, res): Promise<void> => {
  const params = AddMatterDocumentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid matterId" }); return; }

  const parsed = AddMatterDocumentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const user = await requireRole(req, res, LEGAL_AUTHOR_ROLES, "Only legal staff may create matter documents.");
  if (!user) return;
  const [matter] = await db.select({ id: mattersTable.id, assignedToId: mattersTable.assignedToId })
    .from(mattersTable)
    .where(eq(mattersTable.id, params.data.matterId));
  if (!matter) { res.status(404).json({ error: "Matter not found" }); return; }
  if (ASSIGNMENT_RESTRICTED_ROLES.includes(user.role) && matter.assignedToId !== user.id) {
    res.status(403).json({ error: "You do not have access to this matter.", code: "ASSIGNMENT_REQUIRED" });
    return;
  }
  const data: Record<string, unknown> = { ...parsed.data };
  // Workflow-controlled fields can never be set at creation time.
  for (const k of ["status", "approvalStatus", "approvalReason", "approvedById", "approvedAt", "signatureStatus", "signedAt", "submittedById", "submittedAt", "version"]) delete data[k];
  const fileMetadataKeys = ["originalFilename", "mimeType", "fileSize", "fileChecksum"];
  const hasFileMetadata = fileMetadataKeys.some((key) => data[key] !== undefined && data[key] !== null);
  if (hasFileMetadata && !data.fileObjectPath) {
    res.status(400).json({ error: "File metadata can only be saved with a stored file object.", code: "FILE_OBJECT_REQUIRED" });
    return;
  }
  if (data.fileObjectPath) {
    const metadata = FileMetadata.safeParse(data);
    if (!metadata.success) {
      res.status(400).json({ error: "Uploaded documents require a supported type, a size up to 25 MB, a safe filename, and a SHA-256 checksum.", code: "INVALID_FILE_METADATA" });
      return;
    }
    data.originalFilename = safeFilename(metadata.data.originalFilename);
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(metadata.data.fileObjectPath);
      await objectStorageService.validateObjectEntity(objectFile, {
        size: metadata.data.fileSize,
        mimeType: metadata.data.mimeType,
        checksum: metadata.data.fileChecksum,
      });
    } catch (error) {
      const fileError = error as { code?: string };
      const isFileError = error instanceof ObjectNotFoundError || fileError.code?.startsWith("FILE_");
      res.status(isFileError ? 400 : 503).json({
        error: error instanceof ObjectNotFoundError ? "Uploaded file was not found in storage." : error instanceof Error ? error.message : "Document storage is unavailable.",
        code: error instanceof ObjectNotFoundError ? "FILE_NOT_FOUND" : fileError.code ?? "STORAGE_UNAVAILABLE",
      });
      return;
    }
  }

  const doc = await db.transaction(async (tx) => {
    const [created] = await tx.insert(documentsTable).values({
      ...(data as typeof documentsTable.$inferInsert),
      matterId: params.data.matterId,
      createdById: user.id,
    }).returning();
    await snapshotVersion(tx, created, user.id, "Initial version");
    return created;
  });
  await auditDoc(req, doc, "document_created", `Document "${doc.title}" created (v1, ${doc.contentOrigin})`, user.id);

  if (doc.content && doc.content.trim().length > 0) {
    try {
      const result = await indexDocument(doc.id, doc.content, doc.mimeType || "text/plain", {
        matterId: doc.matterId,
        documentType: doc.documentType,
        practiceArea: undefined,
        jurisdiction: undefined,
        approvalStatus: doc.approvalStatus,
        authorId: doc.createdById ?? undefined,
      });
      console.log(`Indexed document ${doc.id}: ${result.chunksIndexed}/${result.chunksCreated} chunks (${result.status})`);
    } catch (indexErr) {
      console.error(`Background indexing failed for document ${doc.id}:`, indexErr);
    }
  }

  res.status(201).json(await enrichDoc(doc));
});

router.get("/matters/:matterId/documents/:id", async (req, res): Promise<void> => {
  const params = GetMatterDocumentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid params" }); return; }
  const doc = await findDoc(params.data.matterId, params.data.id);
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
  res.json(await enrichDoc(doc));
});

router.get("/matters/:matterId/documents/:id/versions", async (req, res): Promise<void> => {
  const params = GetMatterDocumentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid params" }); return; }
  const doc = await findDoc(params.data.matterId, params.data.id);
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

  const versions = await db
    .select()
    .from(documentVersionsTable)
    .where(eq(documentVersionsTable.documentId, doc.id))
    .orderBy(desc(documentVersionsTable.version));
  const authorIds = versions.map((v) => v.authorId).filter((x): x is number => x != null);
  const users = authorIds.length ? await db.select().from(usersTable).where(inArray(usersTable.id, authorIds)) : [];
  res.json(versions.map((v) => ({ ...v, authorName: v.authorId ? users.find((u) => u.id === v.authorId)?.name ?? null : null })));
});

// Content/metadata edits. Creates a new version when content changes.
// Status and workflow fields are NEVER writable here.
router.patch("/matters/:matterId/documents/:id", async (req, res): Promise<void> => {
  const params = UpdateMatterDocumentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid params" }); return; }

  const parsed = UpdateMatterDocumentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const doc = await findDoc(params.data.matterId, params.data.id);
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

  if (["partner_approval", "client_signing", "archived"].includes(doc.status)) {
    res.status(409).json({ error: "This document is locked for editing while it is in approval, signing, or archived.", code: "DOCUMENT_LOCKED" });
    return;
  }

  const user = await requireRole(req, res, LEGAL_AUTHOR_ROLES, "Only legal staff may edit matter documents.");
  if (!user) return;

  const data: Record<string, unknown> = { ...parsed.data };
  for (const k of ["status", "approvalStatus", "approvalReason", "approvedById", "approvedAt", "signatureStatus", "signedAt", "submittedById", "submittedAt", "version", "matterId", "citationStatus"]) delete data[k];

  const changeSummary = (data.changeSummary as string) ?? "Content edited";
  delete data.changeSummary;
  const contentChanged = typeof data.content === "string" && data.content !== doc.content;
  const set: Record<string, unknown> = { ...data };
  if (contentChanged) {
    set.version = doc.version + 1;
    // Any edit after a changes-requested decision returns the doc to a clean slate.
    if (doc.approvalStatus === "changes_requested" || doc.approvalStatus === "rejected") set.approvalStatus = "not_submitted";
  }

  const updated = await db.transaction(async (tx) => {
    const [u] = await tx.update(documentsTable).set(set).where(eq(documentsTable.id, doc.id)).returning();
    if (contentChanged) await snapshotVersion(tx, u, user.id, changeSummary);
    return u;
  });
  await auditDoc(req, updated, "document_edited", contentChanged ? `Content edited — version ${doc.version} preserved, now v${updated.version}` : "Metadata updated", user.id);
  res.json(await enrichDoc(updated));
});

// ── Lifecycle: generic draft-phase moves (draft ↔ ai_assist ↔ review) ────────
router.post("/matters/:matterId/documents/:id/status", async (req, res): Promise<void> => {
  const params = GetMatterDocumentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid params" }); return; }
  const user = await requireRole(req, res, LEGAL_AUTHOR_ROLES, "Only legal staff may update document status.");
  if (!user) return;
  const target = String(req.body?.status ?? "");
  const doc = await findDoc(params.data.matterId, params.data.id);
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

  const allowed = DOC_TRANSITIONS[doc.status] ?? [];
  if (!allowed.includes(target)) {
    res.status(409).json({
      error: `Invalid document transition: "${doc.status}" can only move to ${allowed.length ? allowed.map((s) => `"${s}"`).join(" or ") : "no further status here — use the approval/signing workflow actions"}.`,
      code: "INVALID_DOC_TRANSITION",
    });
    return;
  }
  const [updated] = await db.update(documentsTable).set({ status: target }).where(eq(documentsTable.id, doc.id)).returning();
  await auditDoc(req, updated, target === "ai_assist" ? "document_ai_assist_started" : "document_status_changed", `Status ${doc.status} → ${target}`);
  res.json(await enrichDoc(updated));
});

// ── AI assistance: record AI-generated/assisted content with provenance ─────
router.post("/matters/:matterId/documents/:id/ai-assist", async (req, res): Promise<void> => {
  const params = GetMatterDocumentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid params" }); return; }
  const doc = await findDoc(params.data.matterId, params.data.id);
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
  if (!["draft", "ai_assist", "review"].includes(doc.status)) {
    res.status(409).json({ error: "AI assistance can only be applied before the document is submitted for approval.", code: "DOCUMENT_LOCKED" });
    return;
  }

  const user = await requireRole(req, res, LEGAL_AUTHOR_ROLES, "Only legal staff may apply AI-assisted document content.");
  if (!user) return;
  const { sections, content, aiRiskLevel, confidenceScore, citations, origin } = req.body ?? {};
  const newOrigin = origin === "ai_generated" ? "ai_generated" : "ai_assisted";

  const mergedSections = [
    ...(doc.sections ?? []),
    ...((Array.isArray(sections) ? sections : []) as { heading: string; origin: "human" | "ai_assisted" | "ai_generated"; summary?: string }[]),
  ];
  const contentChanged = typeof content === "string" && content !== doc.content;

  const updated = await db.transaction(async (tx) => {
    const [u] = await tx.update(documentsTable).set({
      status: doc.status === "draft" ? "ai_assist" : doc.status,
      content: contentChanged ? content : doc.content,
      version: contentChanged ? doc.version + 1 : doc.version,
      contentOrigin: doc.contentOrigin === "ai_generated" ? "ai_generated" : newOrigin,
      aiGenerated: true,
      sections: mergedSections.length ? mergedSections : doc.sections,
      aiRiskLevel: aiRiskLevel ?? doc.aiRiskLevel,
      confidenceScore: confidenceScore != null ? String(confidenceScore) : doc.confidenceScore,
      citations: Array.isArray(citations) && citations.length ? citations : doc.citations,
      citationStatus: Array.isArray(citations) && citations.length ? "unverified" : doc.citationStatus,
      approvalStatus: ["changes_requested", "rejected"].includes(doc.approvalStatus) ? "not_submitted" : doc.approvalStatus,
    }).where(eq(documentsTable.id, doc.id)).returning();
    if (contentChanged) await snapshotVersion(tx, u, user.id, `AI ${newOrigin === "ai_generated" ? "generated" : "assisted"} content applied`);
    return u;
  });
  await auditDoc(req, updated, "document_ai_assisted", `AI ${newOrigin === "ai_generated" ? "generated" : "assisted"} content recorded${Array.isArray(sections) && sections.length ? ` (${sections.length} section(s))` : ""}`, user.id);
  res.json(await enrichDoc(updated));
});

// Citation verification is an explicit, auditable legal-review action. Generic
// document updates cannot set citationStatus and therefore cannot bypass it.
router.post("/matters/:matterId/documents/:id/verify-citations", async (req, res): Promise<void> => {
  const params = GetMatterDocumentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid params" }); return; }
  const user = await requireRole(req, res, LEGAL_AUTHOR_ROLES, "Only legal staff may verify citations.");
  if (!user) return;
  const doc = await findDoc(params.data.matterId, params.data.id);
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
  if (!(doc.citations ?? []).length) {
    res.status(409).json({ error: "This document has no citations to verify.", code: "NO_CITATIONS" });
    return;
  }
  if (doc.citationStatus === "verified") {
    res.status(409).json({ error: "Citations have already been verified.", code: "CITATIONS_ALREADY_VERIFIED" });
    return;
  }
  const [updated] = await db.update(documentsTable)
    .set({ citationStatus: "verified" })
    .where(eq(documentsTable.id, doc.id))
    .returning();
  await auditDoc(req, updated, "document_citations_verified", `${(doc.citations ?? []).length} citation(s) verified by ${user.name}`, user.id);
  res.json(await enrichDoc(updated));
});

// ── Approval workflow ────────────────────────────────────────────────────────

// Attorney submits → partner_approval + partner notification.
router.post("/matters/:matterId/documents/:id/submit", async (req, res): Promise<void> => {
  const params = GetMatterDocumentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid params" }); return; }
  const doc = await findDoc(params.data.matterId, params.data.id);
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
  if (!["draft", "ai_assist", "review"].includes(doc.status)) {
    res.status(409).json({ error: `A document in "${doc.status}" cannot be submitted for approval.`, code: "INVALID_DOC_TRANSITION" });
    return;
  }

  const user = await requireRole(req, res, LEGAL_AUTHOR_ROLES, "Only legal staff may submit documents for approval.");
  if (!user) return;
  if ((doc.citations ?? []).length > 0 && doc.citationStatus !== "verified") {
    res.status(409).json({
      error: "Citations must be verified before a cited document can be submitted for approval.",
      code: "CITATION_VERIFICATION_REQUIRED",
    });
    return;
  }
  const [updated] = await db.update(documentsTable).set({
    status: "partner_approval",
    approvalStatus: "pending",
    approvalReason: null,
    submittedById: user.id,
    submittedAt: new Date(),
  }).where(eq(documentsTable.id, doc.id)).returning();

  const [matter] = await db.select().from(mattersTable).where(eq(mattersTable.id, doc.matterId));
  await db.insert(notificationsTable).values({
    targetRole: "partner",
    type: "document_submitted",
    title: "Document awaiting partner approval",
    message: `${user?.name ?? "An attorney"} submitted "${doc.title}" (v${doc.version}) on ${matter?.reference ?? `matter #${doc.matterId}`} for approval.`,
    link: `/matters/${doc.matterId}?tab=documents&doc=${doc.id}`,
  });
  await auditDoc(req, updated, "document_submitted", `Submitted for partner approval (v${updated.version}) by ${user?.name ?? "unknown"}`);
  res.json(await enrichDoc(updated));
});

// Partner decision: approve | reject | request_changes.
// This is the ONLY path to approvalStatus=approved.
router.post("/matters/:matterId/documents/:id/decision", async (req, res): Promise<void> => {
  const params = GetMatterDocumentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid params" }); return; }
  const { decision, reason } = req.body ?? {};
  if (!["approve", "reject", "request_changes"].includes(decision)) {
    res.status(400).json({ error: "decision must be approve, reject or request_changes" });
    return;
  }
  if (decision !== "approve" && !String(reason ?? "").trim()) {
    res.status(400).json({ error: "A reason is required when rejecting or requesting changes." });
    return;
  }

  const user = await getCurrentUser(req);
  if (!user || !PARTNER_ROLES.includes(user.role as (typeof PARTNER_ROLES)[number])) {
    res.status(403).json({ error: "Only partners may decide document approvals." });
    return;
  }

  const doc = await findDoc(params.data.matterId, params.data.id);
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
  if (doc.status !== "partner_approval" || doc.approvalStatus !== "pending") {
    res.status(409).json({ error: "This document is not awaiting partner approval.", code: "NOT_PENDING_APPROVAL" });
    return;
  }

  const now = new Date();
  const set =
    decision === "approve"
      ? { status: "client_signing", approvalStatus: "approved", approvedById: user.id, approvedAt: now, approvalReason: reason ?? null }
      : decision === "reject"
        ? { status: "draft", approvalStatus: "rejected", approvedById: user.id, approvedAt: now, approvalReason: reason }
        : { status: "draft", approvalStatus: "changes_requested", approvedById: user.id, approvedAt: now, approvalReason: reason };

  const [updated] = await db.update(documentsTable).set(set).where(eq(documentsTable.id, doc.id)).returning();

  const action = decision === "approve" ? "document_approved" : decision === "reject" ? "document_rejected" : "document_changes_requested";
  const verb = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "requested changes on";
  await auditDoc(req, updated, action, `Partner ${user.name} ${verb} "${doc.title}" (v${doc.version})${reason ? ` — ${reason}` : ""}`);
  if (updated.submittedById) {
    await db.insert(notificationsTable).values({
      userId: updated.submittedById,
      type: "document_decision",
      title: `Document ${decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "returned with change requests"}`,
      message: `${user.name} ${decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "requested changes on"} "${doc.title}"${reason ? `: ${reason}` : ""}`,
      link: `/matters/${doc.matterId}?tab=documents&doc=${doc.id}`,
    });
  }
  res.json(await enrichDoc(updated));
});

// Legacy endpoint retired: approval may only happen through the governed
// /decision workflow above.
router.post("/matters/:matterId/documents/:id/approve", async (req, res): Promise<void> => {
  const params = ApproveMatterDocumentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid params" }); return; }
  const parsed = ApproveMatterDocumentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  res.status(409).json({
    error: "Direct approval is no longer supported. Submit the document for partner approval and use the decision workflow.",
    code: "USE_DECISION_WORKFLOW",
  });
});

// ── Signature workflow ───────────────────────────────────────────────────────
router.post("/matters/:matterId/documents/:id/send-signature", async (req, res): Promise<void> => {
  const params = GetMatterDocumentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid params" }); return; }
  const doc = await findDoc(params.data.matterId, params.data.id);
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
  if (doc.status !== "client_signing" || doc.approvalStatus !== "approved") {
    res.status(409).json({ error: "Only partner-approved documents in the signing stage can be sent for signature.", code: "NOT_APPROVED" });
    return;
  }
  if (doc.signatureStatus !== "not_sent") {
    res.status(409).json({ error: `Signature already ${doc.signatureStatus}.`, code: "SIGNATURE_STATE" });
    return;
  }
  const user = await requireRole(req, res, LEGAL_AUTHOR_ROLES, "Only legal staff may send a document for signature.");
  if (!user) return;
  const signerName = typeof req.body?.signerName === "string" ? req.body.signerName.trim() : "";
  const signerEmail = typeof req.body?.signerEmail === "string" ? req.body.signerEmail.trim().toLowerCase() : "";
  if (signerName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signerEmail)) {
    res.status(400).json({ error: "Signer name and email are required before queueing a signature request.", code: "SIGNER_DETAILS_REQUIRED" });
    return;
  }
  const idempotencyKey = `signature:${doc.id}:v${doc.version}`;
  const [existingOperation] = await db.select().from(providerOperationsTable)
    .where(eq(providerOperationsTable.idempotencyKey, idempotencyKey));
  if (existingOperation) {
    res.json({ ...(await enrichDoc(doc)), providerOperation: existingOperation });
    return;
  }
  const { operation, updated } = await db.transaction(async (tx) => {
    const [created] = await tx.insert(providerOperationsTable).values({
      kind: "signature",
      status: "queued",
      idempotencyKey,
      providerName: "not_connected",
      matterId: doc.matterId,
      documentId: doc.id,
      payload: { signerName, signerEmail, documentId: doc.id, version: doc.version },
      createdById: user.id,
    }).returning();
    const [changed] = await tx.update(documentsTable).set({ signatureStatus: "sent" }).where(eq(documentsTable.id, doc.id)).returning();
    if (!changed) throw new Error("Signature operation could not update the document.");
    return { operation: created, updated: changed };
  });
  await auditDoc(req, updated, "document_sent_for_signature", `"${doc.title}" (v${doc.version}) queued for provider signature handoff; provider is not connected`, user.id);
  res.json({ ...(await enrichDoc(updated)), providerOperation: operation });
});

router.post("/matters/:matterId/documents/:id/sign", async (req, res): Promise<void> => {
  const params = GetMatterDocumentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid params" }); return; }
  const doc = await findDoc(params.data.matterId, params.data.id);
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
  if (doc.status !== "client_signing" || doc.signatureStatus !== "sent") {
    res.status(409).json({ error: "Only documents sent for signature can be marked signed.", code: "SIGNATURE_STATE" });
    return;
  }
  const [signatureOperation] = await db.select().from(providerOperationsTable)
    .where(and(
      eq(providerOperationsTable.kind, "signature"),
      eq(providerOperationsTable.documentId, doc.id),
    ))
    .orderBy(desc(providerOperationsTable.createdAt))
    .limit(1);
  if (!signatureOperation || signatureOperation.status !== "provider_confirmed") {
    res.status(409).json({
      error: "The signature provider has not confirmed this request yet.",
      code: "SIGNATURE_PROVIDER_NOT_CONFIRMED",
    });
    return;
  }
  const user = await requireRole(req, res, LEGAL_AUTHOR_ROLES, "Only legal staff may record a verified client signature.");
  if (!user) return;
  const signerName = typeof req.body?.signerName === "string" ? req.body.signerName.trim() : "";
  const signerEmail = typeof req.body?.signerEmail === "string" ? req.body.signerEmail.trim().toLowerCase() : "";
  const signerMethod = typeof req.body?.signerMethod === "string" ? req.body.signerMethod.trim() : "";
  if (signerName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signerEmail) || signerMethod.length < 2) {
    res.status(400).json({ error: "Signer name, email, and verification method are required to record a signature.", code: "SIGNATURE_EVIDENCE_REQUIRED" });
    return;
  }
  const [signedVersion] = await db
    .select()
    .from(documentVersionsTable)
    .where(and(eq(documentVersionsTable.documentId, doc.id), eq(documentVersionsTable.version, doc.version)));
  const signedAt = new Date();
  const documentSha256 = crypto
    .createHash("sha256")
    .update(JSON.stringify({
      documentId: doc.id,
      matterId: doc.matterId,
      version: doc.version,
      title: signedVersion?.title ?? doc.title,
      content: signedVersion?.content ?? doc.content ?? "",
    }))
    .digest("hex");
  const evidence = {
    signerName,
    signerEmail,
    signerMethod,
    signedVersion: doc.version,
    documentSha256,
    recordedById: user.id,
    recordedByName: user.name,
    recordedAt: signedAt.toISOString(),
  };
  const sealKey = signatureSealKey();
  if (!sealKey) {
    res.status(503).json({ error: "Signature evidence cannot be sealed because the server secret is unavailable.", code: "SIGNATURE_SEAL_UNAVAILABLE" });
    return;
  }
  const evidenceSeal = sealSignatureEvidence(evidence, sealKey);
  const sealedEvidence = { ...evidence, evidenceSeal, sealAlgorithm: "HMAC-SHA256" };
  const [updated] = await db.update(documentsTable).set({ signatureStatus: "signed", signedAt }).where(eq(documentsTable.id, doc.id)).returning();
  await auditDoc(req, updated, "document_signed", JSON.stringify({ kind: "signature_evidence", evidence: sealedEvidence }), user.id);
  res.json(await enrichDoc(updated));
});

router.get("/matters/:matterId/documents/:id/signature-certificate", async (req, res): Promise<void> => {
  const params = GetMatterDocumentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid params" }); return; }
  const doc = await findDoc(params.data.matterId, params.data.id);
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
  if (!["signed", "archived"].includes(doc.signatureStatus)) {
    res.status(409).json({ error: "A signature certificate is available only after the document has been signed.", code: "NOT_SIGNED" });
    return;
  }
  const user = await requireRole(req, res, LEGAL_AUTHOR_ROLES, "Only legal staff may download signature evidence.");
  if (!user) return;
  const events = await db
    .select()
    .from(auditLogsTable)
    .where(and(eq(auditLogsTable.entityType, "document"), eq(auditLogsTable.entityId, doc.id)))
    .orderBy(desc(auditLogsTable.createdAt));
  const actorIds = [...new Set(events.map((event) => event.userId).filter((actorId): actorId is number => actorId != null))];
  const actors = actorIds.length ? await db.select().from(usersTable).where(inArray(usersTable.id, actorIds)) : [];
  const actorName = (actorId: number | null) => actorId == null ? "System" : actors.find((actor) => actor.id === actorId)?.name ?? "Unknown staff member";
  const signedEvent = events.find((event) => event.action === "document_signed");
  const signatureEvidence = signedEvent ? parseSignatureEvidence(signedEvent.details) : null;
  if (!signatureEvidence) {
    res.status(409).json({ error: "This legacy signature has no sealed evidence record. Re-verify the client signature before issuing a certificate.", code: "SIGNATURE_EVIDENCE_REQUIRED" });
    return;
  }
  const { evidenceSeal, sealAlgorithm, ...unsignedEvidence } = signatureEvidence;
  const sealKey = signatureSealKey();
  const expectedSeal = sealKey ? sealSignatureEvidence(unsignedEvidence, sealKey) : null;
  const evidenceSealIsValid = typeof evidenceSeal === "string"
    && typeof expectedSeal === "string"
    && evidenceSeal.length === expectedSeal.length
    && crypto.timingSafeEqual(Buffer.from(evidenceSeal), Buffer.from(expectedSeal));
  if (sealAlgorithm !== "HMAC-SHA256" || !evidenceSealIsValid) {
    res.status(409).json({ error: "Signature evidence failed integrity verification and cannot be certified.", code: "SIGNATURE_EVIDENCE_INVALID" });
    return;
  }
  const certificate = {
    certificateId: `APZ-SIGN-${doc.id}-V${doc.version}`,
    generatedAt: new Date().toISOString(),
    document: { id: doc.id, title: doc.title, version: doc.version, matterId: doc.matterId },
    signature: {
      status: doc.signatureStatus,
      signedAt: doc.signedAt?.toISOString() ?? null,
      verifiedBy: signedEvent ? actorName(signedEvent.userId) : null,
      verificationRecordedAt: signedEvent?.createdAt.toISOString() ?? null,
      evidence: signatureEvidence,
    },
    approval: {
      status: doc.approvalStatus,
      approvedAt: doc.approvedAt?.toISOString() ?? null,
      approvedBy: doc.approvedById == null ? null : actorName(doc.approvedById),
    },
    auditTrail: events.map((event) => ({
      timestamp: event.createdAt.toISOString(),
      action: event.action,
      actor: actorName(event.userId),
      details: event.details,
      ipAddress: event.ipAddress,
    })),
    verification: "This certificate contains sealed signature evidence, including signer identity, the signed document version, and a SHA-256 digest of the signed content. Any change to the recorded evidence invalidates its HMAC-SHA256 seal.",
  };
  await auditDoc(req, doc, "signature_certificate_downloaded", `Signature certificate downloaded for "${doc.title}" (v${doc.version})`, user.id);
  res
    .setHeader("Content-Disposition", `attachment; filename="apz-signature-certificate-${doc.id}-v${doc.version}.json"`)
    .type("application/json")
    .json(certificate);
});

router.post("/matters/:matterId/documents/:id/archive", async (req, res): Promise<void> => {
  const params = GetMatterDocumentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid params" }); return; }
  const doc = await findDoc(params.data.matterId, params.data.id);
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
  if (doc.status !== "client_signing" || doc.signatureStatus !== "signed") {
    res.status(409).json({ error: "Only signed documents can be archived.", code: "NOT_SIGNED" });
    return;
  }
  const user = await requireRole(req, res, LEGAL_AUTHOR_ROLES, "Only legal staff may archive a signed document.");
  if (!user) return;
  const [updated] = await db.update(documentsTable).set({ status: "archived" }).where(eq(documentsTable.id, doc.id)).returning();
  await auditDoc(req, updated, "document_archived", `"${doc.title}" archived after signature`, user.id);
  res.json(await enrichDoc(updated));
});

// ── Notifications ────────────────────────────────────────────────────────────
router.get("/notifications", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const roleTargets = PARTNER_ROLES.includes(user.role as (typeof PARTNER_ROLES)[number]) ? ["partner", user.role] : [user.role];
  const items = await db
    .select()
    .from(notificationsTable)
    .where(or(eq(notificationsTable.userId, user.id), inArray(notificationsTable.targetRole, roleTargets)))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);
  res.json(items);
});

router.post("/notifications/:id/read", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [existing] = await db.select().from(notificationsTable).where(eq(notificationsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Notification not found" }); return; }
  // Ownership: only the targeted user, or a member of the targeted role, may mark it read.
  const roleTargets = PARTNER_ROLES.includes(user.role as (typeof PARTNER_ROLES)[number]) ? ["partner", user.role] : [user.role];
  const visible = existing.userId === user.id || (existing.targetRole != null && roleTargets.includes(existing.targetRole));
  if (!visible) { res.status(403).json({ error: "This notification is not addressed to you." }); return; }
  const [n] = await db.update(notificationsTable).set({ readAt: new Date() }).where(eq(notificationsTable.id, id)).returning();
  res.json(n);
});

router.get("/notification-preferences", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  let [preferences] = await db.select().from(notificationPreferencesTable).where(eq(notificationPreferencesTable.userId, user.id));
  if (!preferences) {
    [preferences] = await db.insert(notificationPreferencesTable).values({ userId: user.id }).returning();
  }
  res.json(preferences);
});

router.patch("/notification-preferences", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const allowed = ["emailEnabled", "inAppEnabled", "conflictAlerts", "approvalAlerts", "billingAlerts"] as const;
  const values = Object.fromEntries(Object.entries(req.body ?? {}).filter(([key, value]) => allowed.includes(key as typeof allowed[number]) && typeof value === "boolean"));
  let [preferences] = await db.update(notificationPreferencesTable).set({ ...values, updatedAt: new Date() }).where(eq(notificationPreferencesTable.userId, user.id)).returning();
  if (!preferences) [preferences] = await db.insert(notificationPreferencesTable).values({ userId: user.id, ...values }).returning();
  await logAudit({ action: "notification_preferences_updated", entityType: "user", entityId: user.id, entityTitle: user.name, userId: user.id, details: "Notification preferences updated.", ipAddress: req.ip });
  res.json(preferences);
});

export default router;
