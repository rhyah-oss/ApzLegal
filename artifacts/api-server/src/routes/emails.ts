import { trustedIngestion, InboundEmailBody } from "../lib/trusted-ingestion";
import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, documentsTable, emailAttachmentsTable, emailLinkCandidatesTable, emailThreadsTable, emailsTable, auditLogsTable } from "@workspace/db";
import { getCurrentUser, logAudit } from "../lib/context";
import {
  getAccessibleMatter,
  getAuthorizedEmail,
  getEmailAttachments,
  getEmailThread,
  ingestNormalizedEmail,
  listMatterEmails,
  normalizeEmailRecord,
  searchAuthorizedEmails,
  type NormalizedInboundEmail,
} from "../lib/email-service";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import { Readable } from "stream";
import { PARTNER_ROLES, LEGAL_AUTHOR_ROLES, requireRole } from "../lib/permissions";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

async function requireAuthenticated(req: Request, res: Response) {
  const user = await getCurrentUser(req);
  if (!user) {
    res.status(401).json({ error: "Not authenticated", code: "AUTH_REQUIRED" });
    return null;
  }
  return user;
}

router.get("/email/readiness", async (req, res): Promise<void> => {
  const user = await requireAuthenticated(req, res);
  if (!user) return;
  res.json({
    provider: process.env.EMAIL_PROVIDER_NAME ?? null,
    status: process.env.EMAIL_PROVIDER_CONNECTED === "true" ? "connected" : "not_connected",
    ingestionEnabled: process.env.EMAIL_INGESTION_ENABLED === "true",
    message: process.env.EMAIL_PROVIDER_CONNECTED === "true"
      ? "Email provider is connected."
      : "No email provider is connected. Normalized ingestion is available only when explicitly enabled.",
  });
});

router.post("/emails/ingest", async (req, res): Promise<void> => {
  const user = await requireAuthenticated(req, res);
  if (!user) return;
  if (process.env.EMAIL_INGESTION_ENABLED !== "true") {
    res.status(409).json({
      error: "No email provider is connected. Configure a provider before accepting inbound mail.",
      code: "EMAIL_PROVIDER_NOT_CONNECTED",
    });
    return;
  }
  if (!trustedIngestion(req.headers["x-email-ingestion-token"], process.env.EMAIL_INGESTION_SECRET)) {
    res.status(403).json({ error: "Trusted ingestion source required", code: "INGESTION_SOURCE_REQUIRED" }); return;
  }
  const parsed = InboundEmailBody.safeParse(req.body);
  if (!parsed.success || parsed.data.provider !== process.env.EMAIL_PROVIDER_NAME) {
    res.status(400).json({ error: "Invalid provider email payload" }); return;
  }
  try {
    const result = await ingestNormalizedEmail(parsed.data);
    await logAudit({
      action: result.duplicate ? "email_ingest_duplicate" : "email_ingested",
      entityType: "email",
      entityId: result.email.id,
      entityTitle: result.email.subject ?? "Email",
      userId: user.id,
      details: result.duplicate ? "Provider message was already ingested; no duplicate created." : "Normalized provider email ingested.",
      ipAddress: req.ip,
    });
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error: any) {
    req.log.error("Email ingestion failed");
    res.status(502).json({ error: "Unable to ingest normalized email.", code: "EMAIL_INGESTION_FAILED" });
  }
});

router.get("/emails/search", async (req, res): Promise<void> => {
  const user = await requireAuthenticated(req, res);
  if (!user) return;
  const search = String(req.query.search ?? "").trim();
  if (search.length < 2) {
    res.status(400).json({ error: "Search must contain at least two characters." });
    return;
  }
  const matterId = req.query.matterId != null ? Number(req.query.matterId) : undefined;
  const rows = await searchAuthorizedEmails(user, search, Number.isFinite(matterId) ? matterId : undefined);
  res.json(rows.map(normalizeEmailRecord));
});

router.get("/emails/unlinked", async (req, res): Promise<void> => {
  const user = await requireRole(req, res, PARTNER_ROLES, "Only partners and administrators may triage unlinked email.");
  if (!user) return;
  const rows = await db.select().from(emailsTable).where(and(
    isNull(emailsTable.matterId),
    inArray(emailsTable.linkStatus, ["unlinked", "suggested"]),
  )).orderBy(desc(emailsTable.receivedAt)).limit(100);
  const result = await Promise.all(rows.map(async (email) => ({
    ...normalizeEmailRecord(email),
    candidates: await db.select().from(emailLinkCandidatesTable)
      .where(eq(emailLinkCandidatesTable.emailId, email.id))
      .orderBy(desc(emailLinkCandidatesTable.score)),
  })));
  res.json(result);
});

router.post("/emails/:emailId/link", async (req, res): Promise<void> => {
  const user = await requireRole(req, res, PARTNER_ROLES, "Only partners and administrators may triage unlinked email.");
  if (!user) return;
  const emailId = Number(req.params.emailId);
  const [email] = await db.select().from(emailsTable).where(eq(emailsTable.id, emailId));
  if (!email) {
    res.status(404).json({ error: "Email not found." });
    return;
  }
  const action = String(req.body?.action ?? "");
  const targetMatterId = action === "link" ? Number(req.body?.targetMatterId) : null;
  if (!["link", "leave_unlinked"].includes(action) || (action === "link" && !Number.isInteger(targetMatterId))) {
    res.status(400).json({ error: "Use link with targetMatterId, or leave_unlinked." });
    return;
  }
  const targetMatter = targetMatterId == null ? null : await getAccessibleMatter(user, targetMatterId);
  if (targetMatterId != null && !targetMatter) {
    res.status(403).json({ error: "You do not have access to the target Matter." });
    return;
  }
  const updated = await db.transaction(async (tx) => {
    const common = {
      matterId: targetMatterId,
      clientId: targetMatter?.clientId ?? null,
      linkStatus: targetMatterId == null ? "reviewed_unlinked" : "linked",
    };
    const [row] = await tx.update(emailsTable).set({
      ...common,
      matchReason: targetMatterId == null ? `Deliberately left unlinked by ${user.name}.` : `Linked by ${user.name}.`,
      matchConfidence: targetMatterId == null ? null : 100,
    }).where(eq(emailsTable.id, emailId)).returning();
    await tx.update(emailsTable).set(common).where(eq(emailsTable.threadId, email.threadId));
    await tx.update(emailThreadsTable).set({ matterId: targetMatterId, clientId: targetMatter?.clientId ?? null }).where(eq(emailThreadsTable.id, email.threadId));
    if (targetMatterId != null) {
      await tx.update(emailLinkCandidatesTable).set({ decision: "rejected", decidedById: user.id, decidedAt: new Date() }).where(eq(emailLinkCandidatesTable.emailId, emailId));
      await tx.update(emailLinkCandidatesTable).set({ decision: "accepted", decidedById: user.id, decidedAt: new Date() }).where(and(eq(emailLinkCandidatesTable.emailId, emailId), eq(emailLinkCandidatesTable.matterId, targetMatterId)));
    }
    return row;
  });
  await logAudit({
    action: targetMatterId == null ? "email_left_unlinked" : "email_linked",
    entityType: "email",
    entityId: emailId,
    entityTitle: email.subject ?? "Email",
    userId: user.id,
    details: targetMatterId == null ? "Email deliberately left unlinked during triage." : `Email linked to Matter ${targetMatter?.reference} during triage.`,
    ipAddress: req.ip,
  });
  res.json(normalizeEmailRecord(updated ?? email));
});

router.get("/matters/:matterId/emails", async (req, res): Promise<void> => {
  const user = await requireAuthenticated(req, res);
  if (!user) return;
  const matterId = Number(req.params.matterId);
  if (!Number.isInteger(matterId)) {
    res.status(400).json({ error: "Invalid matter id." });
    return;
  }
  const rows = await listMatterEmails(user, matterId, {
    search: req.query.search ? String(req.query.search) : undefined,
    unread: req.query.unread === "true",
    linkStatus: req.query.linkStatus ? String(req.query.linkStatus) : undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
  });
  if (!rows) {
    res.status(403).json({ error: "You do not have access to this matter.", code: "MATTER_ACCESS_REQUIRED" });
    return;
  }
  res.json(rows.map(normalizeEmailRecord));
});

router.get("/matters/:matterId/emails/:emailId", async (req, res): Promise<void> => {
  const user = await requireAuthenticated(req, res);
  if (!user) return;
  const matterId = Number(req.params.matterId);
  const emailId = Number(req.params.emailId);
  const selected = await getAuthorizedEmail(user, emailId, matterId);
  if (!selected) {
    res.status(404).json({ error: "Email not found in this Matter." });
    return;
  }
  const [attachments, candidates] = await Promise.all([
    getEmailAttachments(emailId),
    db.select().from(emailLinkCandidatesTable).where(eq(emailLinkCandidatesTable.emailId, emailId)),
  ]);
  res.json({ ...normalizeEmailRecord(selected.email), attachments, candidates });
});

router.get("/matters/:matterId/emails/:emailId/thread", async (req, res): Promise<void> => {
  const user = await requireAuthenticated(req, res);
  if (!user) return;
  const matterId = Number(req.params.matterId);
  const emailId = Number(req.params.emailId);
  const thread = await getEmailThread(user, emailId, matterId);
  if (!thread) {
    res.status(404).json({ error: "Email thread not found in this Matter." });
    return;
  }
  res.json(thread.map(normalizeEmailRecord));
});

router.patch("/matters/:matterId/emails/:emailId/read", async (req, res): Promise<void> => {
  const user = await requireAuthenticated(req, res);
  if (!user) return;
  const matterId = Number(req.params.matterId);
  const emailId = Number(req.params.emailId);
  const selected = await getAuthorizedEmail(user, emailId, matterId);
  if (!selected) {
    res.status(404).json({ error: "Email not found in this Matter." });
    return;
  }
  const [updated] = await db.update(emailsTable).set({ isRead: req.body?.isRead !== false }).where(eq(emailsTable.id, emailId)).returning();
  res.json(normalizeEmailRecord(updated ?? selected.email));
});

router.post("/matters/:matterId/emails/:emailId/link", async (req, res): Promise<void> => {
  const user = await requireRole(req, res, PARTNER_ROLES, "Only partners and administrators may change email Matter links.");
  if (!user) return;
  const matterId = Number(req.params.matterId);
  const emailId = Number(req.params.emailId);
  const selected = await getAuthorizedEmail(user, emailId, matterId);
  if (!selected) {
    res.status(404).json({ error: "Email not found in this Matter." });
    return;
  }
  const action = String(req.body?.action ?? "");
  if (!["link", "change", "remove", "leave_unlinked"].includes(action)) {
    res.status(400).json({ error: "Action must be link, change, remove, or leave_unlinked." });
    return;
  }
  const targetMatterId = action === "link" || action === "change" ? Number(req.body?.targetMatterId ?? matterId) : null;
  if ((action === "link" || action === "change") && !Number.isInteger(targetMatterId)) {
    res.status(400).json({ error: "targetMatterId is required when linking an email." });
    return;
  }
  const targetMatter = targetMatterId == null ? null : await getAccessibleMatter(user, targetMatterId);
  if ((action === "link" || action === "change") && !targetMatter) {
    res.status(403).json({ error: "You do not have access to the target Matter.", code: "MATTER_ACCESS_REQUIRED" });
    return;
  }
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx.update(emailsTable).set({
      matterId: targetMatterId,
      clientId: targetMatter?.clientId ?? null,
      linkStatus: targetMatterId == null ? "reviewed_unlinked" : "linked",
      matchReason: targetMatterId == null ? `Left unlinked by ${user.name}.` : `Linked by ${user.name}.`,
      matchConfidence: targetMatterId == null ? null : 100,
    }).where(eq(emailsTable.id, emailId)).returning();
    await tx.update(emailsTable).set({
      matterId: targetMatterId,
      clientId: targetMatter?.clientId ?? null,
      linkStatus: targetMatterId == null ? "reviewed_unlinked" : "linked",
    }).where(eq(emailsTable.threadId, selected.email.threadId));
    await tx.update(emailThreadsTable).set({ matterId: targetMatterId, clientId: targetMatter?.clientId ?? null }).where(eq(emailThreadsTable.id, selected.email.threadId));
    await tx.update(emailLinkCandidatesTable).set({
      decision: targetMatterId === matterId ? "accepted" : "rejected",
      decidedById: user.id,
      decidedAt: new Date(),
    }).where(and(eq(emailLinkCandidatesTable.emailId, emailId), eq(emailLinkCandidatesTable.matterId, matterId)));
    return row;
  });
  await logAudit({
    action: `email_${action}`,
    entityType: "email",
    entityId: emailId,
    entityTitle: selected.email.subject ?? "Email",
    userId: user.id,
    details: targetMatterId == null ? "Email deliberately left unlinked." : `Email linked to Matter ${targetMatter?.reference}.`,
    ipAddress: req.ip,
  });
  res.json(normalizeEmailRecord(updated ?? selected.email));
});

router.get("/email-attachments/:attachmentId", async (req, res): Promise<void> => {
  try {
    const user = await requireAuthenticated(req, res);
    if (!user) return;
    const attachmentId = Number(req.params.attachmentId);
    const [attachment] = await db.select().from(emailAttachmentsTable).where(eq(emailAttachmentsTable.id, attachmentId));
    if (!attachment?.fileObjectPath) {
      res.status(404).json({ error: "Attachment is not available." });
      return;
    }
    const [email] = await db.select().from(emailsTable).where(eq(emailsTable.id, attachment.emailId));
    if (!email?.matterId || !(await getAccessibleMatter(user, email.matterId))) {
      res.status(403).json({ error: "You do not have access to this attachment." });
      return;
    }
    const objectFile = await objectStorageService.getObjectEntityFile(attachment.fileObjectPath);
    const hasObjectAccess = await objectStorageService.canAccessObjectEntity({
      userId: String(user.id),
      objectFile,
    });
    if (!hasObjectAccess) {
      res.status(403).json({ error: "The private attachment policy does not permit access." });
      return;
    }
    const response = await objectStorageService.downloadObject(objectFile);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.setHeader("Content-Disposition", `inline; filename="${attachment.filename.replace(/[\u0000-\u001f\u007f"\\]/g, "_").slice(0, 255)}"`);
    await logAudit({
      action: "email_attachment_accessed",
      entityType: "email_attachment",
      entityId: attachment.id,
      entityTitle: attachment.filename,
      userId: user.id,
      details: `Private email attachment retrieved for Matter ${email.matterId}.`,
      ipAddress: req.ip,
    });
    if (response.body) Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    else res.end();
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Attachment object not found." });
      return;
    }
    req.log.error({ err: error }, "Email attachment access failed");
    res.status(500).json({ error: "Unable to serve email attachment." });
  }
});

router.post("/matters/:matterId/emails/:emailId/attachments/:attachmentId/document", async (req, res): Promise<void> => {
  const user = await requireRole(req, res, LEGAL_AUTHOR_ROLES, "Only legal staff may promote attachments.");
  if (!user) return;
  const matterId = Number(req.params.matterId);
  const emailId = Number(req.params.emailId);
  const attachmentId = Number(req.params.attachmentId);
  const selected = await getAuthorizedEmail(user, emailId, matterId);
  if (!selected) {
    res.status(404).json({ error: "Email not found in this Matter." });
    return;
  }
  const result = await db.transaction(async tx => {
  const [attachment] = await tx.select().from(emailAttachmentsTable).where(and(
    eq(emailAttachmentsTable.id, attachmentId), eq(emailAttachmentsTable.emailId, emailId),
  )).for("update");
  if (!attachment) {
    return { status: 404, body: { error: "Attachment not found on this email." } };
  }
  if (attachment.documentId) {
    const [existing] = await tx.select().from(documentsTable).where(eq(documentsTable.id, attachment.documentId));
    return { status: 200, body: existing ?? { documentId: attachment.documentId } };
  }
  if (!attachment.fileObjectPath) {
    return { status: 409, body: { error: "The attachment has no private stored object to promote.", code: "ATTACHMENT_OBJECT_REQUIRED" } };
  }
  const [document] = await tx.insert(documentsTable).values({
    matterId,
    title: req.body?.title ? String(req.body.title).slice(0, 255) : attachment.filename,
    documentType: "correspondence",
    fileObjectPath: attachment.fileObjectPath,
    originalFilename: attachment.filename,
    mimeType: attachment.mimeType,
    fileSize: attachment.fileSize,
    fileChecksum: attachment.fileChecksum,
    contentOrigin: "human",
    createdById: user.id,
  }).returning();
  if (!document) {
    throw new Error("Unable to create governed document");
  }
  const [updatedAttachment] = await tx.update(emailAttachmentsTable)
    .set({ documentId: document.id })
    .where(eq(emailAttachmentsTable.id, attachment.id))
    .returning();
  await tx.insert(auditLogsTable).values({
    action: "email_attachment_promoted_to_document",
    entityType: "document",
    entityId: document.id,
    entityTitle: document.title,
    userId: user.id,
    details: `Governed Matter document created from Email ${emailId}; original attachment remains traceable.`,
    ipAddress: req.ip,
  });
  return { status: 201, body: { document, attachment: updatedAttachment ?? attachment } };
  });
  res.status(result.status).json(result.body);
});

export default router;