import { Router, type IRouter } from "express";
import {
  db, mattersTable, clientsTable, conflictsTable, documentsTable, invoicesTable,
  knowledgeItemsTable, ficaDocumentsTable, timeEntriesTable, usersTable, providerOperationsTable,
} from "@workspace/db";
import { eq, and, desc, inArray, notInArray, sql } from "drizzle-orm";
import { getCurrentUser } from "../lib/context";
import { PARTNER_ROLES } from "../lib/permissions";
import { WORKFLOW_DEFINITIONS, makeInstance, type WorkflowInstance } from "../lib/workflow-engine";

const router: IRouter = Router();

async function requireUser(req: any, res: any) {
  const user = await getCurrentUser(req);
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return null; }
  return user;
}

// Latest conflict record per matter id.
async function latestConflictsByMatter(matterIds: number[]) {
  if (matterIds.length === 0) return new Map<number, typeof conflictsTable.$inferSelect>();
  const rows = await db.select().from(conflictsTable)
    .where(inArray(conflictsTable.matterId, matterIds))
    .orderBy(desc(conflictsTable.checkedAt), desc(conflictsTable.id));
  const map = new Map<number, typeof conflictsTable.$inferSelect>();
  for (const r of rows) if (r.matterId != null && !map.has(r.matterId)) map.set(r.matterId, r);
  return map;
}

async function projectInstances(): Promise<WorkflowInstance[]> {
  const instances: WorkflowInstance[] = [];

  const [matters, clients, docs, providerOperations, invoices, knowledge, unbilled] = await Promise.all([
    db.select().from(mattersTable).where(inArray(mattersTable.status, ["lead", "conflict_check", "approved", "active"])),
    db.select().from(clientsTable),
    db.select().from(documentsTable).where(notInArray(documentsTable.status, ["archived"])),
    db.select().from(providerOperationsTable).where(eq(providerOperationsTable.kind, "signature")).orderBy(desc(providerOperationsTable.createdAt)),
    db.select().from(invoicesTable).where(notInArray(invoicesTable.status, ["paid"])),
    db.select().from(knowledgeItemsTable).where(notInArray(knowledgeItemsTable.status, ["archived"])),
    db.select({
      matterId: timeEntriesTable.matterId,
      total: sql<string>`sum(${timeEntriesTable.total})`,
      count: sql<number>`count(*)::int`,
    }).from(timeEntriesTable).where(eq(timeEntriesTable.billed, false)).groupBy(timeEntriesTable.matterId),
  ]);
  const clientOf = (id: number) => clients.find((c) => c.id === id);
  const conflictMap = await latestConflictsByMatter(matters.map((m) => m.id));
  const latestSignatureOperationByDocument = new Map<number, typeof providerOperationsTable.$inferSelect>();
  for (const operation of providerOperations) {
    if (operation.documentId != null && !latestSignatureOperationByDocument.has(operation.documentId)) {
      latestSignatureOperationByDocument.set(operation.documentId, operation);
    }
  }

  // ── Workflow 1: New Matter ────────────────────────────────────────────────
  for (const m of matters) {
    const client = clientOf(m.clientId);
    const ficaBlocked = client?.complianceStatus === "blocked";
    const conflict = conflictMap.get(m.id);
    let idx: number; let blockedBy: string | null = null;

    if (m.status === "lead") {
      idx = 1;
      blockedBy = ficaBlocked ? "Client is FICA compliance-blocked" : null;
    } else if (m.status === "conflict_check") {
      if (!conflict) { idx = 2; blockedBy = "Conflict scan required before approval"; }
      else if (conflict.status === "rejected") { idx = 4; blockedBy = "Conflict rejected by partner — matter cannot proceed"; }
      else if (["cleared", "approved"].includes(conflict.status)) {
        idx = 5;
        blockedBy = ficaBlocked ? "Client is FICA compliance-blocked" : null;
      } else { idx = 4; blockedBy = "Flagged conflict awaiting partner review"; }
    } else if (m.status === "approved") {
      idx = 5; // approval granted — awaiting activation into an active matter
      blockedBy = m.riskLevel === "compliance_blocked" ? "Compliance block must be resolved" : null;
    } else { // active — workflow complete at the final step
      idx = 6;
      blockedBy = null;
    }
    if (ficaBlocked && !blockedBy) blockedBy = "Client is FICA compliance-blocked";

    instances.push(makeInstance("new_matter", idx, {
      entityId: m.id,
      title: m.title,
      subtitle: `${m.reference} · ${client?.name ?? "Unknown client"}`,
      status: m.status,
      blockedBy,
      dueDate: null,
      link: `/matters/${m.id}`,
    }));
  }

  // ── Workflows 2 & 5: Document + Signature ─────────────────────────────────
  const DOC_STEP: Record<string, number> = { draft: 0, ai_assist: 1, review: 2, partner_approval: 3, client_signing: 4 };
  for (const d of docs) {
    const idx = DOC_STEP[d.status] ?? 0;
    instances.push(makeInstance("document", idx, {
      entityId: d.id,
      title: d.title,
      subtitle: `v${d.version}`,
      status: d.status,
      blockedBy: d.status === "partner_approval" ? "Awaiting partner approval decision" : null,
      dueDate: null,
      link: `/matters/${d.matterId}/documents/${d.id}`,
    }));

    if (d.status === "client_signing") {
      const operation = latestSignatureOperationByDocument.get(d.id);
      let sIdx = 1; let sBlocked: string | null = null;
      if (d.signatureStatus === "not_sent" || !operation) { sIdx = 1; sBlocked = null; }
      else if (operation.status === "failed") { sIdx = 1; sBlocked = `Provider failed: ${operation.errorMessage ?? "action required"}`; }
      else if (operation.status === "queued") { sIdx = 1; sBlocked = operation.providerName === "not_connected" ? "Signature request queued — provider not connected" : "Signature request queued for provider"; }
      else if (d.signatureStatus === "sent") { sIdx = 2; sBlocked = "Provider confirmed — awaiting client signature"; }
      else if (d.signatureStatus === "signed") { sIdx = 4; sBlocked = "Signed — awaiting archive to matter"; }
      instances.push(makeInstance("signature", sIdx, {
        entityId: d.id,
        title: d.title,
        subtitle: `v${d.version} · ${operation?.status ?? d.signatureStatus.replace("_", " ")}`,
        status: d.signatureStatus === "signed" ? "signed" : operation?.status === "provider_confirmed" ? "provider_confirmed" : operation?.status === "failed" ? "failed" : "queued",
        blockedBy: sBlocked,
        dueDate: null,
        link: `/matters/${d.matterId}/documents/${d.id}`,
      }));
    }
  }

  // ── Workflow 3: Billing ───────────────────────────────────────────────────
  for (const u of unbilled) {
    const m = matters.find((x) => x.id === u.matterId) ?? (await db.select().from(mattersTable).where(eq(mattersTable.id, u.matterId)))[0];
    if (!m) continue;
    instances.push(makeInstance("billing", 0, {
      entityId: m.id,
      title: `${m.title} — unbilled time`,
      subtitle: `${u.count} unbilled entr${u.count === 1 ? "y" : "ies"} · R ${parseFloat(u.total).toFixed(2)}`,
      status: "unbilled_time",
      blockedBy: null,
      dueDate: null,
      link: `/time?matter=${m.id}`,
    }));
  }
  const INV_STEP: Record<string, { idx: number; blocked: string | null }> = {
    draft: { idx: 1, blocked: "Awaiting submission for billing review" },
    pending_review: { idx: 2, blocked: "Awaiting partner billing review" },
    approved: { idx: 2, blocked: null }, // review complete — ready to send, but not yet sent
    sent: { idx: 3, blocked: null },
    overdue: { idx: 3, blocked: "Invoice overdue" },
  };
  for (const inv of invoices) {
    const s = INV_STEP[inv.status] ?? INV_STEP.draft;
    instances.push(makeInstance("billing", s.idx, {
      entityId: inv.id,
      title: inv.invoiceNumber,
      subtitle: `R ${parseFloat(inv.total as string).toFixed(2)}`,
      status: inv.status,
      blockedBy: s.blocked,
      dueDate: inv.dueDate ?? null,
      link: `/billing?invoice=${inv.id}`,
    }));
  }

  // ── Workflow 4: Knowledge Base ────────────────────────────────────────────
  const KB_STEP: Record<string, { idx: number; blocked: string | null }> = {
    uploaded: { idx: 1, blocked: "Awaiting submission for partner review" },
    pending_approval: { idx: 2, blocked: "Awaiting partner review decision" },
    rejected: { idx: 1, blocked: "Rejected — revise and resubmit" },
    approved: { idx: 4, blocked: null },
  };
  for (const k of knowledge) {
    const s = KB_STEP[k.status] ?? KB_STEP.uploaded;
    const blocked = k.status === "approved" && k.aiIndexStatus !== "indexed" ? "Indexing in progress" : s.blocked;
    instances.push(makeInstance("knowledge", s.idx, {
      entityId: k.id,
      title: k.title,
      subtitle: `v${k.version} · ${k.category ?? k.type}`,
      status: k.status,
      blockedBy: blocked,
      dueDate: null,
      link: `/knowledge?item=${k.id}`,
    }));
  }

  return instances;
}

// ── GET /workflows: definitions + live instances ─────────────────────────────
router.get("/workflows", async (req, res): Promise<void> => {
  if (!(await requireUser(req, res))) return;
  const instances = await projectInstances();
  res.json({ definitions: WORKFLOW_DEFINITIONS, instances });
});

// ── GET /actions: the central pending-action queue for the current user ─────
router.get("/actions", async (req, res): Promise<void> => {
  const user = await requireUser(req, res);
  if (!user) return;
  const isPartner = PARTNER_ROLES.includes(user.role as typeof PARTNER_ROLES[number]);

  const [pendingConflicts, pendingDocs, myDrafts, pendingKb, myRejectedKb, invs, pendingFica, sentSigs] = await Promise.all([
    db.select().from(conflictsTable).where(inArray(conflictsTable.status, ["pending", "further_review", "flagged"])),
    db.select().from(documentsTable).where(eq(documentsTable.status, "partner_approval")),
    db.select().from(documentsTable).where(and(inArray(documentsTable.status, ["draft", "ai_assist", "review"]), eq(documentsTable.createdById, user.id))),
    db.select().from(knowledgeItemsTable).where(eq(knowledgeItemsTable.status, "pending_approval")),
    db.select().from(knowledgeItemsTable).where(and(eq(knowledgeItemsTable.status, "rejected"), eq(knowledgeItemsTable.authorId, user.id))),
    db.select().from(invoicesTable).where(inArray(invoicesTable.status, ["draft", "pending_review", "approved", "overdue"])),
    db.select().from(ficaDocumentsTable).where(inArray(ficaDocumentsTable.status, ["uploaded", "pending_verification"])),
    db.select().from(documentsTable).where(and(eq(documentsTable.status, "client_signing"), eq(documentsTable.signatureStatus, "sent"))),
  ]);

  type Action = {
    id: string; type: string; title: string; description: string | null;
    entityType: string; entityId: number; link: string;
    severity: "normal" | "high"; dueDate: string | null; createdAt: string | Date | null;
  };
  const actions: Action[] = [];

  if (isPartner) {
    for (const c of pendingConflicts) actions.push({
      id: `conflict-${c.id}`, type: "conflict_review",
      title: "Conflict awaiting partner review",
      description: `${c.clientName}${c.opposingParty ? ` vs ${c.opposingParty}` : ""} · severity ${c.severity}`,
      entityType: "conflict", entityId: c.id, link: "/conflicts",
      severity: c.severity === "high" ? "high" : "normal", dueDate: null, createdAt: c.checkedAt,
    });
    for (const d of pendingDocs) actions.push({
      id: `doc-approval-${d.id}`, type: "document_approval",
      title: "Document awaiting partner approval",
      description: `"${d.title}" (v${d.version})`,
      entityType: "document", entityId: d.id, link: `/matters/${d.matterId}/documents/${d.id}`,
      severity: "high", dueDate: null, createdAt: d.updatedAt,
    });
    for (const k of pendingKb) actions.push({
      id: `kb-${k.id}`, type: "knowledge_review",
      title: "Knowledge item awaiting partner review",
      description: `"${k.title}" (v${k.version})`,
      entityType: "knowledge", entityId: k.id, link: `/knowledge?item=${k.id}`,
      severity: "normal", dueDate: null, createdAt: k.updatedAt,
    });
    for (const i of invs.filter((x) => x.status === "pending_review")) actions.push({
      id: `invoice-review-${i.id}`, type: "invoice_review",
      title: "Invoice awaiting billing review",
      description: `${i.invoiceNumber} · R ${parseFloat(i.total as string).toFixed(2)}`,
      entityType: "invoice", entityId: i.id, link: `/billing?invoice=${i.id}`,
      severity: "normal", dueDate: i.dueDate ?? null, createdAt: i.updatedAt,
    });
    for (const f of pendingFica) actions.push({
      id: `fica-${f.id}`, type: "fica_verification",
      title: "FICA document awaiting verification",
      description: `${f.type ?? "Document"} for client #${f.clientId}`,
      entityType: "fica_document", entityId: f.id, link: `/clients/${f.clientId}`,
      severity: "high", dueDate: null, createdAt: f.createdAt,
    });
  }

  for (const d of myDrafts) actions.push({
    id: `doc-mine-${d.id}`, type: "document_in_progress",
    title: d.status === "review" ? "Document in review — submit for approval" : "Document draft in progress",
    description: `"${d.title}" (v${d.version}) · ${d.status.replace("_", " ")}`,
    entityType: "document", entityId: d.id, link: `/matters/${d.matterId}/documents/${d.id}`,
    severity: "normal", dueDate: null, createdAt: d.updatedAt,
  });

  for (const k of myRejectedKb) actions.push({
    id: `kb-rejected-${k.id}`, type: "knowledge_returned",
    title: "Knowledge item returned — revise and resubmit",
    description: `"${k.title}"${k.reviewNote ? ` · ${k.reviewNote}` : ""}`,
    entityType: "knowledge", entityId: k.id, link: `/knowledge?item=${k.id}`,
    severity: "normal", dueDate: null, createdAt: k.updatedAt,
  });

  for (const i of invs) {
    if (i.status === "draft" && (isPartner || i.createdById === user.id)) actions.push({
      id: `invoice-draft-${i.id}`, type: "invoice_draft",
      title: "Draft invoice awaiting submission for billing review",
      description: `${i.invoiceNumber} · R ${parseFloat(i.total as string).toFixed(2)}`,
      entityType: "invoice", entityId: i.id, link: `/billing?invoice=${i.id}`,
      severity: "normal", dueDate: i.dueDate ?? null, createdAt: i.updatedAt,
    });
    if (i.status === "approved" && (isPartner || i.createdById === user.id)) actions.push({
      id: `invoice-send-${i.id}`, type: "invoice_send",
      title: "Approved invoice ready to send",
      description: `${i.invoiceNumber} · R ${parseFloat(i.total as string).toFixed(2)}`,
      entityType: "invoice", entityId: i.id, link: `/billing?invoice=${i.id}`,
      severity: "normal", dueDate: i.dueDate ?? null, createdAt: i.updatedAt,
    });
    if (i.status === "overdue" && isPartner) actions.push({
      id: `invoice-overdue-${i.id}`, type: "invoice_overdue",
      title: "Invoice overdue",
      description: `${i.invoiceNumber} · R ${parseFloat(i.total as string).toFixed(2)}`,
      entityType: "invoice", entityId: i.id, link: `/billing?invoice=${i.id}`,
      severity: "high", dueDate: i.dueDate ?? null, createdAt: i.updatedAt,
    });
  }

  for (const d of sentSigs) actions.push({
    id: `sig-${d.id}`, type: "signature_pending",
    title: "Signature awaiting client",
    description: `"${d.title}" (v${d.version})`,
    entityType: "document", entityId: d.id, link: `/matters/${d.matterId}/documents/${d.id}`,
    severity: "normal", dueDate: null, createdAt: d.updatedAt,
  });

  actions.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1));
  res.json({ actions, counts: { total: actions.length, high: actions.filter((a) => a.severity === "high").length } });
});

export default router;
