import { pagination } from "../lib/pagination";
import { Router, type IRouter } from "express";
import { db, knowledgeItemsTable, knowledgeChunksTable, knowledgeItemVersionsTable, usersTable } from "@workspace/db";
import { eq, ilike, and, desc, inArray, ne, or, asc, sql, type SQL } from "drizzle-orm";
import {
  CreateKnowledgeItemBody,
  UpdateKnowledgeItemBody,
  GetKnowledgeItemParams,
  UpdateKnowledgeItemParams,
  ListKnowledgeItemsQueryParams,
  DecideKnowledgeItemBody,
  ListTemplatesQueryParams,
} from "@workspace/api-zod";
import { getCurrentUser, logAudit } from "../lib/context";
import { LEGAL_AUTHOR_ROLES, PARTNER_ROLES, requireRole } from "../lib/permissions";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { indexKnowledgeItem } from "../lib/indexing-service";

const router: IRouter = Router();

const REVIEWER_ROLES = PARTNER_ROLES;
const objectStorageService = new ObjectStorageService();

async function requireUser(req: any, res: any) {
  const user = await getCurrentUser(req);
  if (!user) { res.status(401).json({ error: "Authentication required" }); return null; }
  return user;
}

async function enrichItem(item: typeof knowledgeItemsTable.$inferSelect, cachedUsers?: (typeof usersTable.$inferSelect)[]) {
  const ids = [item.authorId, item.reviewedById, item.approvedById].filter((v): v is number => v != null);
  const users = cachedUsers ?? (ids.length ? await db.select().from(usersTable).where(inArray(usersTable.id, ids)) : []);
  const nameOf = (id: number | null) => (id == null ? null : users.find((u) => u.id === id)?.name ?? null);
  const availableToAi = item.status === "approved" && item.aiIndexStatus === "indexed";
  return {
    ...item,
    tags: item.tags ?? [],
    authorName: nameOf(item.authorId),
    reviewedByName: nameOf(item.reviewedById),
    approvedByName: nameOf(item.approvedById),
    availableToAi,
  };
}

router.get("/knowledge", async (req, res): Promise<void> => {
  const page = pagination(req, res);
  if (!page) return;
  const current = await requireUser(req, res);
  if (!current) return;
  const params = ListKnowledgeItemsQueryParams.safeParse(req.query);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const conditions: SQL[] = [];
  if (params.data.search) {
    const term = `%${params.data.search}%`;
    conditions.push(or(
      ilike(knowledgeItemsTable.title, term),
      ilike(knowledgeItemsTable.content, term),
      ilike(knowledgeItemsTable.category, term),
      ilike(knowledgeItemsTable.practiceArea, term),
      ilike(knowledgeItemsTable.documentType, term),
      sql`array_to_string(${knowledgeItemsTable.tags}, ' ') ILIKE ${term}`,
    )!);
  }
  if (params.data.category) conditions.push(eq(knowledgeItemsTable.category, params.data.category));
  if (params.data.type) conditions.push(eq(knowledgeItemsTable.type, params.data.type));
  if (params.data.status) conditions.push(eq(knowledgeItemsTable.status, params.data.status));

  const items = await db.select().from(knowledgeItemsTable).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(knowledgeItemsTable.createdAt), knowledgeItemsTable.id).limit(page.limit).offset(page.offset);
  const userIds = items.flatMap((item) => [item.authorId, item.reviewedById, item.approvedById]).filter((id): id is number => id != null);
  const users = userIds.length ? await db.select().from(usersTable).where(inArray(usersTable.id, userIds)) : [];
  const enriched = await Promise.all(items.map((item) => enrichItem(item, users)));
  res.json(enriched);
});

// Templates are a governed view over Knowledge Base records. The response
// includes database-backed summary counts without changing the legacy
// /knowledge response shape used by the Knowledge page.
router.get("/templates", async (req, res): Promise<void> => {
  const current = await requireUser(req, res);
  if (!current) return;
  const params = ListTemplatesQueryParams.safeParse(req.query);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const { search, category, status, practiceArea, documentType, aiIndexStatus, ownerId, sort } = params.data;
  const conditions: SQL[] = [eq(knowledgeItemsTable.type, "template")];
  if (search) {
    const term = `%${search}%`;
    conditions.push(or(
      ilike(knowledgeItemsTable.title, term),
      ilike(knowledgeItemsTable.content, term),
      ilike(knowledgeItemsTable.category, term),
      ilike(knowledgeItemsTable.practiceArea, term),
      ilike(knowledgeItemsTable.documentType, term),
      sql`array_to_string(${knowledgeItemsTable.tags}, ' ') ILIKE ${term}`,
    )!);
  }
  if (category) conditions.push(eq(knowledgeItemsTable.category, category));
  if (status) conditions.push(eq(knowledgeItemsTable.status, status));
  if (practiceArea) conditions.push(eq(knowledgeItemsTable.practiceArea, practiceArea));
  if (documentType) conditions.push(eq(knowledgeItemsTable.documentType, documentType));
  if (aiIndexStatus) conditions.push(eq(knowledgeItemsTable.aiIndexStatus, aiIndexStatus));
  if (ownerId) conditions.push(eq(knowledgeItemsTable.authorId, ownerId));

  // Non-reviewers can use approved templates and can still see their own
  // submissions so they can respond to a rejection or submit a draft.
  if (!REVIEWER_ROLES.includes(current.role as typeof REVIEWER_ROLES[number])) {
    conditions.push(or(
      eq(knowledgeItemsTable.status, "approved"),
      eq(knowledgeItemsTable.authorId, current.id),
    )!);
  }

  const orderBy = sort === "oldest" ? asc(knowledgeItemsTable.createdAt)
    : sort === "title" ? asc(knowledgeItemsTable.title)
      : sort === "version" ? desc(knowledgeItemsTable.version)
        : desc(knowledgeItemsTable.updatedAt);
  const [items, allTemplates] = await Promise.all([
    db.select().from(knowledgeItemsTable).where(and(...conditions)).orderBy(orderBy),
    db.select().from(knowledgeItemsTable).where(eq(knowledgeItemsTable.type, "template")),
  ]);
  const templateUserIds = items.flatMap((item) => [item.authorId, item.reviewedById, item.approvedById]).filter((id): id is number => id != null);
  const templateUsers = templateUserIds.length ? await db.select().from(usersTable).where(inArray(usersTable.id, templateUserIds)) : [];
  const enriched = await Promise.all(items.map((item) => enrichItem(item, templateUsers)));
  const counts = allTemplates.reduce((result, item) => {
    result.total += 1;
    result[item.status] = (result[item.status] ?? 0) + 1;
    if (item.aiIndexStatus === "indexed" && item.status === "approved") result.aiReady += 1;
    return result;
  }, { total: 0, uploaded: 0, pending_approval: 0, approved: 0, rejected: 0, archived: 0, aiReady: 0 } as Record<string, number>);
  res.json({ items: enriched, counts });
});

// Upload: item enters the workflow as "uploaded".
router.post("/knowledge", async (req, res): Promise<void> => {
  const user = await requireRole(req, res, LEGAL_AUTHOR_ROLES, "Only legal staff may upload knowledge content.");
  if (!user) return;
  const parsed = CreateKnowledgeItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (parsed.data.fileObjectPath && (!/^\/objects\/[A-Za-z0-9._/-]+$/.test(parsed.data.fileObjectPath) ||
    !parsed.data.originalFilename || !parsed.data.mimeType || !parsed.data.fileSize || !parsed.data.fileChecksum)) {
    res.status(400).json({ error: "Template uploads require complete private-file metadata." });
    return;
  }
  if (parsed.data.fileObjectPath) {
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(parsed.data.fileObjectPath);
      await objectStorageService.validateObjectEntity(objectFile, {
        size: parsed.data.fileSize!,
        mimeType: parsed.data.mimeType!,
        checksum: parsed.data.fileChecksum!,
      });
    } catch (error) {
      res.status(error instanceof ObjectNotFoundError || (error as { code?: string })?.code?.startsWith("FILE_") ? 400 : 503).json({
        error: error instanceof ObjectNotFoundError ? "Uploaded file was not found in storage." : error instanceof Error ? error.message : "Document storage is unavailable.",
        code: error instanceof ObjectNotFoundError ? "FILE_NOT_FOUND" : (error as { code?: string })?.code ?? "STORAGE_UNAVAILABLE",
      });
      return;
    }
  }

  const item = await db.transaction(async (tx) => {
    const [created] = await tx.insert(knowledgeItemsTable).values({
      ...parsed.data,
      status: "uploaded",
      aiIndexStatus: "none",
      version: 1,
      authorId: user.id,
    }).returning();
    await tx.insert(knowledgeItemVersionsTable).values({
      knowledgeItemId: created.id,
      version: 1,
      title: created.title,
      content: created.content,
      type: created.type,
      category: created.category,
      tags: created.tags ?? [],
      documentType: created.documentType,
      practiceArea: created.practiceArea,
      jurisdiction: created.jurisdiction,
      effectiveDate: created.effectiveDate,
      reviewDate: created.reviewDate,
      fileObjectPath: created.fileObjectPath,
      originalFilename: created.originalFilename,
      mimeType: created.mimeType,
      fileSize: created.fileSize,
      fileChecksum: created.fileChecksum,
      status: created.status,
      wasApproved: false,
      editedById: user.id,
      changeSummary: "Initial upload",
    });
    return created;
  });

  await logAudit({
    action: "knowledge_uploaded",
    entityType: "knowledge",
    entityId: item.id,
    entityTitle: item.title,
    userId: user.id,
    details: `Uploaded ${item.type} "${item.title}" (category: ${item.category}). Version 1.`,
    ipAddress: req.ip,
  });
  res.status(201).json(await enrichItem(item));
});

router.get("/knowledge/:id", async (req, res): Promise<void> => {
  const current = await requireUser(req, res);
  if (!current) return;
  const params = GetKnowledgeItemParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const [item] = await db.select().from(knowledgeItemsTable).where(eq(knowledgeItemsTable.id, params.data.id));
  if (!item) { res.status(404).json({ error: "Knowledge item not found" }); return; }
  if (!REVIEWER_ROLES.includes(current.role as typeof REVIEWER_ROLES[number]) &&
      item.status !== "approved" && item.authorId !== current.id) {
    res.status(403).json({ error: "This template is not available until it is approved.", code: "TEMPLATE_NOT_APPROVED" });
    return;
  }
  res.json(await enrichItem(item));
});

// Edit / categorise. Editing an approved item snapshots the approved version,
// bumps the version number, and sends the item back for re-approval — approved
// legal knowledge is never silently overwritten.
router.patch("/knowledge/:id", async (req, res): Promise<void> => {
  const user = await requireRole(req, res, LEGAL_AUTHOR_ROLES, "Only legal staff may edit knowledge content.");
  if (!user) return;
  const params = UpdateKnowledgeItemParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateKnowledgeItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (parsed.data.fileObjectPath && (!/^\/objects\/[A-Za-z0-9._/-]+$/.test(parsed.data.fileObjectPath) ||
    !parsed.data.originalFilename || !parsed.data.mimeType || !parsed.data.fileSize || !parsed.data.fileChecksum)) {
    res.status(400).json({ error: "File edits require complete private-file metadata." });
    return;
  }
  if (parsed.data.fileObjectPath) {
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(parsed.data.fileObjectPath);
      await objectStorageService.validateObjectEntity(objectFile, {
        size: parsed.data.fileSize!,
        mimeType: parsed.data.mimeType!,
        checksum: parsed.data.fileChecksum!,
      });
    } catch (error) {
      res.status(error instanceof ObjectNotFoundError || (error as { code?: string })?.code?.startsWith("FILE_") ? 400 : 503).json({
        error: error instanceof ObjectNotFoundError ? "Uploaded file was not found in storage." : error instanceof Error ? error.message : "Document storage is unavailable.",
        code: error instanceof ObjectNotFoundError ? "FILE_NOT_FOUND" : (error as { code?: string })?.code ?? "STORAGE_UNAVAILABLE",
      });
      return;
    }
  }

  const updated = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(knowledgeItemsTable).where(eq(knowledgeItemsTable.id, params.data.id)).for("update");
    if (!existing) return null;
    if (existing.status === "archived") { throw Object.assign(new Error("ARCHIVED"), { code: "ARCHIVED" }); }

    const tagsChanged = parsed.data.tags !== undefined &&
      JSON.stringify(parsed.data.tags) !== JSON.stringify(existing.tags ?? []);
    const contentChanged =
      (parsed.data.title !== undefined && parsed.data.title !== existing.title) ||
      (parsed.data.content !== undefined && parsed.data.content !== existing.content) ||
      (parsed.data.type !== undefined && parsed.data.type !== existing.type) ||
      (parsed.data.category !== undefined && parsed.data.category !== existing.category) ||
      (parsed.data.documentType !== undefined && parsed.data.documentType !== existing.documentType) ||
      (parsed.data.practiceArea !== undefined && parsed.data.practiceArea !== existing.practiceArea) ||
      (parsed.data.jurisdiction !== undefined && parsed.data.jurisdiction !== existing.jurisdiction) ||
      (parsed.data.effectiveDate !== undefined && parsed.data.effectiveDate?.getTime() !== existing.effectiveDate?.getTime()) ||
      (parsed.data.reviewDate !== undefined && parsed.data.reviewDate?.getTime() !== existing.reviewDate?.getTime()) ||
      (parsed.data.fileObjectPath !== undefined && parsed.data.fileObjectPath !== existing.fileObjectPath) ||
      (parsed.data.originalFilename !== undefined && parsed.data.originalFilename !== existing.originalFilename) ||
      (parsed.data.mimeType !== undefined && parsed.data.mimeType !== existing.mimeType) ||
      (parsed.data.fileSize !== undefined && parsed.data.fileSize !== existing.fileSize) ||
      (parsed.data.fileChecksum !== undefined && parsed.data.fileChecksum !== existing.fileChecksum) ||
      tagsChanged;
    const wasApproved = existing.status === "approved";

    const set: Record<string, unknown> = { ...parsed.data };
    if (wasApproved && contentChanged) {
      // Snapshot the approved version before it changes.
      await tx.insert(knowledgeItemVersionsTable).values({
        knowledgeItemId: existing.id,
        version: existing.version,
        title: existing.title,
        content: existing.content,
        type: existing.type,
        category: existing.category,
        tags: existing.tags ?? [],
        documentType: existing.documentType,
        practiceArea: existing.practiceArea,
        jurisdiction: existing.jurisdiction,
        effectiveDate: existing.effectiveDate,
        reviewDate: existing.reviewDate,
        fileObjectPath: existing.fileObjectPath,
        originalFilename: existing.originalFilename,
        mimeType: existing.mimeType,
        fileSize: existing.fileSize,
        fileChecksum: existing.fileChecksum,
        status: existing.status,
        wasApproved: true,
        editedById: user.id,
        changeSummary: parsed.data.changeSummary ?? null,
      });
      set.version = existing.version + 1;
      set.status = "pending_approval";
      set.aiIndexStatus = "none";
      set.aiIndexedAt = null;
      set.reviewedById = null;
      set.approvedById = null;
      set.approvedAt = null;
      set.reviewNote = null;
    }
    delete (set as any).changeSummary;

    const [row] = await tx.update(knowledgeItemsTable).set(set).where(eq(knowledgeItemsTable.id, existing.id)).returning();
    return { row, wasApproved, contentChanged };
  }).catch((e) => {
    if (e?.code === "ARCHIVED") return "ARCHIVED" as const;
    throw e;
  });

  if (updated === "ARCHIVED") { res.status(409).json({ error: "Archived items cannot be edited", code: "ARCHIVED" }); return; }
  if (!updated) { res.status(404).json({ error: "Knowledge item not found" }); return; }

  await logAudit({
    action: "knowledge_edited",
    entityType: "knowledge",
    entityId: updated.row.id,
    entityTitle: updated.row.title,
    userId: user.id,
    details: updated.wasApproved && updated.contentChanged
      ? `Edited approved item — previous version ${updated.row.version - 1} preserved; now version ${updated.row.version}, returned to pending approval and removed from AI index.`
      : `Edited knowledge item (version ${updated.row.version}).`,
    ipAddress: req.ip,
  });
  res.json(await enrichItem(updated.row));
});

// Submit for partner review: uploaded | rejected → pending_approval.
router.post("/knowledge/:id/submit-for-review", async (req, res): Promise<void> => {
  const user = await requireRole(req, res, LEGAL_AUTHOR_ROLES, "Only legal staff may submit knowledge content for review.");
  if (!user) return;
  const params = GetKnowledgeItemParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  // Atomic guard: only transitions from uploaded/rejected succeed.
  const [item] = await db.update(knowledgeItemsTable)
    .set({ status: "pending_approval", reviewNote: null })
    .where(and(eq(knowledgeItemsTable.id, params.data.id), inArray(knowledgeItemsTable.status, ["uploaded", "rejected"])))
    .returning();
  if (!item) {
    const [existing] = await db.select().from(knowledgeItemsTable).where(eq(knowledgeItemsTable.id, params.data.id));
    if (!existing) { res.status(404).json({ error: "Knowledge item not found" }); return; }
    res.status(409).json({ error: `Cannot submit an item with status "${existing.status}" for review`, code: "INVALID_STATUS" });
    return;
  }

  await logAudit({
    action: "knowledge_submitted_for_review",
    entityType: "knowledge",
    entityId: item.id,
    entityTitle: item.title,
    userId: user.id,
    details: `Submitted for partner review (version ${item.version}).`,
    ipAddress: req.ip,
  });
  res.json(await enrichItem(item));
});

// Partner/Senior-Partner decision: approve | reject. Approval triggers AI indexing.
router.post("/knowledge/:id/decision", async (req, res): Promise<void> => {
  const user = await requireUser(req, res);
  if (!user) return;
  if (!REVIEWER_ROLES.includes(user.role as typeof REVIEWER_ROLES[number])) {
    res.status(403).json({ error: "Only partners or senior partners can approve knowledge content", code: "FORBIDDEN" });
    return;
  }
  const params = GetKnowledgeItemParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = DecideKnowledgeItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (parsed.data.decision === "reject" && !parsed.data.note?.trim()) {
    res.status(400).json({ error: "A note is required when rejecting", code: "NOTE_REQUIRED" });
    return;
  }

  if (parsed.data.decision === "reject") {
    // Atomic guard: only a pending_approval item can be rejected.
    const [item] = await db.update(knowledgeItemsTable)
      .set({ status: "rejected", reviewedById: user.id, reviewNote: parsed.data.note!.trim() })
      .where(and(eq(knowledgeItemsTable.id, params.data.id), eq(knowledgeItemsTable.status, "pending_approval")))
      .returning();
    if (!item) {
      const [existing] = await db.select().from(knowledgeItemsTable).where(eq(knowledgeItemsTable.id, params.data.id));
      if (!existing) { res.status(404).json({ error: "Knowledge item not found" }); return; }
      res.status(409).json({ error: `Item is not pending approval (status: "${existing.status}")`, code: "INVALID_STATUS" });
      return;
    }
    await logAudit({
      action: "knowledge_rejected",
      entityType: "knowledge",
      entityId: item.id,
      entityTitle: item.title,
      userId: user.id,
      details: `Rejected by ${user.name} (${user.role}). Note: ${parsed.data.note!.trim()}`,
      ipAddress: req.ip,
    });
    res.json(await enrichItem(item));
    return;
  }

  // Approve → trigger real indexing pipeline.
  const now = new Date();
  const [approved] = await db.update(knowledgeItemsTable)
    .set({
      status: "approved",
      reviewedById: user.id,
      approvedById: user.id,
      approvedAt: now,
      reviewNote: parsed.data.note?.trim() || null,
      aiIndexStatus: "indexing",
      aiIndexedAt: null,
    })
    .where(and(eq(knowledgeItemsTable.id, params.data.id), eq(knowledgeItemsTable.status, "pending_approval")))
    .returning();
  if (!approved) {
    const [existing] = await db.select().from(knowledgeItemsTable).where(eq(knowledgeItemsTable.id, params.data.id));
    if (!existing) { res.status(404).json({ error: "Knowledge item not found" }); return; }
    res.status(409).json({ error: `Item is not pending approval (status: "${existing.status}")`, code: "INVALID_STATUS" });
    return;
  }

  await logAudit({
    action: "knowledge_approved",
    entityType: "knowledge",
    entityId: approved.id,
    entityTitle: approved.title,
    userId: user.id,
    details: `Approved by ${user.name} (${user.role}) — version ${approved.version}. AI indexing started.`,
    ipAddress: req.ip,
  });

  if (approved.content && approved.content.trim().length > 0) {
    const indexingResult = await indexKnowledgeItem(approved.id, approved.content, {
      type: approved.type,
      category: approved.category ?? undefined,
      practiceArea: approved.practiceArea ?? undefined,
      jurisdiction: approved.jurisdiction ?? undefined,
      documentType: approved.documentType ?? undefined,
      documentSubtype: approved.documentSubtype ?? undefined,
      authorId: approved.authorId ?? undefined,
      approvedById: approved.approvedById ?? undefined,
      approvedAt: approved.approvedAt?.toISOString(),
      version: approved.version ?? undefined,
    });
    const finalStatus = indexingResult.status === "indexed" ? "indexed" : indexingResult.status === "partial" ? "indexed" : "failed";
    await db.update(knowledgeItemsTable)
      .set({ aiIndexStatus: finalStatus, aiIndexedAt: finalStatus === "indexed" ? new Date() : null })
      .where(eq(knowledgeItemsTable.id, approved.id));
    await logAudit({
      action: "knowledge_indexed",
      entityType: "knowledge",
      entityId: approved.id,
      entityTitle: approved.title,
      userId: user.id,
      details: `AI indexing ${finalStatus} — ${indexingResult.chunksIndexed}/${indexingResult.chunksCreated} chunks indexed${indexingResult.error ? ` (error: ${indexingResult.error})` : ""}`,
      ipAddress: req.ip,
    });
  } else {
    await db.update(knowledgeItemsTable)
      .set({ aiIndexStatus: "indexed", aiIndexedAt: new Date() })
      .where(eq(knowledgeItemsTable.id, approved.id));
    await logAudit({
      action: "knowledge_indexed",
      entityType: "knowledge",
      entityId: approved.id,
      entityTitle: approved.title,
      userId: user.id,
      details: `AI indexing complete — no text content to index (version ${approved.version}).`,
      ipAddress: req.ip,
    });
  }

  const [finalItem] = await db.select().from(knowledgeItemsTable).where(eq(knowledgeItemsTable.id, approved.id));
  res.json(await enrichItem(finalItem));
});

// Archive: removes the item from AI retrieval. Terminal state.
router.post("/knowledge/:id/archive", async (req, res): Promise<void> => {
  const user = await requireRole(req, res, PARTNER_ROLES, "Only partners may archive knowledge content.");
  if (!user) return;
  if (!REVIEWER_ROLES.includes(user.role as typeof REVIEWER_ROLES[number])) {
    res.status(403).json({ error: "Only partners or senior partners can archive knowledge content", code: "FORBIDDEN" });
    return;
  }
  const params = GetKnowledgeItemParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select().from(knowledgeItemsTable).where(eq(knowledgeItemsTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Knowledge item not found" }); return; }

  // Atomic guard: archiving is idempotent-safe — only a non-archived row is updated.
  const [item] = await db.update(knowledgeItemsTable)
    .set({ status: "archived", archivedAt: new Date(), aiIndexStatus: "none", aiIndexedAt: null })
    .where(and(eq(knowledgeItemsTable.id, params.data.id), ne(knowledgeItemsTable.status, "archived")))
    .returning();
  if (!item) { res.status(409).json({ error: "Item is already archived", code: "ALREADY_ARCHIVED" }); return; }

  await db.delete(knowledgeChunksTable).where(eq(knowledgeChunksTable.knowledgeItemId, item.id));

  await logAudit({
    action: "knowledge_archived",
    entityType: "knowledge",
    entityId: item.id,
    entityTitle: item.title,
    userId: user.id,
    details: `Archived (was ${existing.status}, version ${item.version}). Removed from AI retrieval and deleted ${item.id} chunks.`,
    ipAddress: req.ip,
  });
  res.json(await enrichItem(item));
});

// Version history — previous versions are preserved, never overwritten.
router.get("/knowledge/:id/versions", async (req, res): Promise<void> => {
  const current = await requireUser(req, res);
  if (!current) return;
  const params = GetKnowledgeItemParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const [item] = await db.select().from(knowledgeItemsTable).where(eq(knowledgeItemsTable.id, params.data.id));
  if (!item) { res.status(404).json({ error: "Knowledge item not found" }); return; }
  if (!REVIEWER_ROLES.includes(current.role as typeof REVIEWER_ROLES[number]) &&
      item.status !== "approved" && item.authorId !== current.id) {
    res.status(403).json({ error: "This template is not available until it is approved.", code: "TEMPLATE_NOT_APPROVED" });
    return;
  }

  const versions = await db.select().from(knowledgeItemVersionsTable)
    .where(eq(knowledgeItemVersionsTable.knowledgeItemId, item.id))
    .orderBy(desc(knowledgeItemVersionsTable.version));

  const users = await db.select().from(usersTable);
  res.json(versions.map((v) => ({
    ...v,
    tags: v.tags ?? [],
    editedByName: v.editedById == null ? null : users.find((u) => u.id === v.editedById)?.name ?? null,
  })));
});

export default router;
