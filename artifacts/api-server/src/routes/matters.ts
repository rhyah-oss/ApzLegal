import { pagination } from "../lib/pagination";
import { Router, type IRouter } from "express";
import {
  db, mattersTable, clientsTable, usersTable, conflictsTable,
  documentsTable, tasksTable, aiConversationsTable, researchRecordsTable, timeEntriesTable,
  invoicesTable, auditLogsTable, relatedPartiesTable, knowledgeItemsTable, notificationsTable,
} from "@workspace/db";
import { eq, ilike, and, desc, inArray, ne, type SQL } from "drizzle-orm";
import { getCurrentUser, logAudit } from "../lib/context";
import { tryTransitionMatter } from "../lib/matter-lifecycle";
import { PARTNER_ROLES } from "../lib/permissions";
import {
  CreateMatterBody,
  UpdateMatterBody,
  UpdateMatterStatusBody,
  GetMatterParams,
  UpdateMatterParams,
  UpdateMatterStatusParams,
  GetMatterSummaryParams,
  ListMattersQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

import { checkTransition } from "../lib/matter-lifecycle";
import { recomputeCompliance } from "../lib/fica-compliance";

const RESTRICTED_MATTER_ROLES = new Set(["candidate_attorney", "paralegal", "legal_secretary", "secretary"]);
const ASSIGNABLE_MATTER_ROLES = [
  "admin",
  "super_admin",
  "managing_partner",
  "partner",
  "associate_attorney",
  "candidate_attorney",
  "paralegal",
  "legal_secretary",
  "secretary",
] as const;

function hasMatterAccess(
  current: Awaited<ReturnType<typeof getCurrentUser>>,
  matter: typeof mattersTable.$inferSelect,
): boolean {
  return !current || !RESTRICTED_MATTER_ROLES.has(current.role) || matter.assignedToId === current.id;
}

function canAssignMatter(current: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>): boolean {
  return PARTNER_ROLES.includes(current.role as typeof PARTNER_ROLES[number]);
}

async function latestConflictFor(matterId: number) {
  const [c] = await db
    .select()
    .from(conflictsTable)
    .where(eq(conflictsTable.matterId, matterId))
    .orderBy(desc(conflictsTable.checkedAt), desc(conflictsTable.id))
    .limit(1);
  return c ?? null;
}

function computeNextAction(status: string, conflictStatus: string | null, riskLevel: string): string | null {
  if (riskLevel === "compliance_blocked") return "Resolve the compliance block before any further progress";
  switch (status) {
    case "lead":           return "Run the mandatory conflict scan to begin conflict check";
    case "conflict_check":
      if (!conflictStatus) return "Run the conflict scan";
      if (["pending", "further_review", "flagged"].includes(conflictStatus)) return "Partner must review the flagged conflict scan";
      if (conflictStatus === "rejected") return "Conflict rejected — matter cannot proceed";
      return "Approve the matter to proceed";
    case "approved":       return "Activate the matter to begin work";
    case "active":         return riskLevel === "review_required" ? "Risk review required — move the matter to Review" : "Move to Review when work is ready for final review";
    case "review":         return "Complete the review, then mark the matter Completed";
    case "completed":      return "Close the matter";
    case "closed":         return "Archive the matter";
    default:               return null;
  }
}

async function enrichMatter(m: typeof mattersTable.$inferSelect) {
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, m.clientId));
  let assignedToName: string | null = null;
  if (m.assignedToId) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, m.assignedToId));
    assignedToName = user?.name ?? null;
  }
  const latestConflict = await latestConflictFor(m.id);
  const conflictStatus = latestConflict?.status ?? null;
  return {
    ...m,
    value: m.value != null ? parseFloat(m.value as string) : null,
    clientName: client?.name ?? "Unknown",
    assignedToName,
    conflictStatus,
    nextAction: computeNextAction(m.status, conflictStatus, m.riskLevel),
  };
}

/**
 * A new matter always enters the conflict workflow with an initial, recorded
 * screen. This catches known adverse-party and knowledge-base references
 * before anyone can request approval or start substantive work.
 */
async function runOnboardingConflictScreen(
  matter: typeof mattersTable.$inferSelect,
  client: typeof clientsTable.$inferSelect,
  userId: number | null,
  ipAddress: string | null,
): Promise<void> {
  const [adversePartyMatches, knowledgeMatches] = await Promise.all([
    db.select().from(relatedPartiesTable)
      .where(and(eq(relatedPartiesTable.role, "opposing_party"), ilike(relatedPartiesTable.name, `%${client.name}%`))),
    db.select().from(knowledgeItemsTable).where(ilike(knowledgeItemsTable.title, `%${client.name}%`)),
  ]);
  const flags = [
    ...adversePartyMatches.map((party) => ({
      type: "client_is_opposing_party",
      description: `Client name matches an opposing party recorded for client #${party.clientId}.`,
      severity: "high",
      relatedMatterId: null,
    })),
    ...knowledgeMatches.map((item) => ({
      type: "knowledge_base_reference",
      description: `Knowledge base item "${item.title}" references the client.`,
      severity: "low",
      relatedMatterId: null,
    })),
  ];
  const severity = flags.some((f) => f.severity === "high") ? "high" : flags.length ? "low" : "none";
  const status = flags.length ? "pending" : "cleared";
  const [record] = await db.insert(conflictsTable).values({
    matterId: matter.id,
    clientName: client.name,
    severity,
    status,
    conflictData: flags,
    aiReasoning: flags.length
      ? `Automatic onboarding screen found ${flags.length} potential conflict reference(s). Partner review is required before this matter can proceed.`
      : "Automatic onboarding screen found no matching adverse-party, prior-matter, or knowledge-base references.",
  }).returning();
  await tryTransitionMatter(matter, "conflict_check");
  await logAudit({
    action: flags.length ? "conflict_flagged" : "conflict_scan_cleared",
    entityType: "conflict",
    entityId: record.id,
    entityTitle: `${client.name} onboarding screen`,
    userId,
    details: `Automatic conflict screen run when ${matter.reference} was opened: ${flags.length} flag(s), severity ${severity}.`,
    ipAddress,
  });
  if (flags.length) {
    await db.insert(notificationsTable).values({
      targetRole: "partner",
      type: "conflict_review",
      title: "Conflict review required for new matter",
      message: `${matter.reference} — ${matter.title} has ${flags.length} conflict screen flag(s) and is waiting for partner review.`,
      link: `/matters/${matter.id}?tab=conflicts`,
    });
  }
}

router.get("/matters", async (req, res): Promise<void> => {
  const page = pagination(req, res);
  if (!page) return;
  const current = await getCurrentUser(req);
  const params = ListMattersQueryParams.safeParse(req.query);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const { search, status, clientId, assignedTo } = params.data;
  const conditions: SQL[] = [];
  if (search) conditions.push(ilike(mattersTable.title, `%${search}%`));
  if (status) conditions.push(eq(mattersTable.status, status));
  if (clientId) conditions.push(eq(mattersTable.clientId, clientId));
  if (assignedTo) conditions.push(eq(mattersTable.assignedToId, assignedTo));
  if (current && ["candidate_attorney", "paralegal", "secretary"].includes(current.role)) conditions.push(eq(mattersTable.assignedToId, current.id));

  const matters = await db.select().from(mattersTable).where(conditions.length ? and(...conditions) : undefined).orderBy(mattersTable.createdAt, mattersTable.id).limit(page.limit).offset(page.offset);
  const [clients, users, conflicts] = await Promise.all([
    matters.length ? db.select().from(clientsTable).where(inArray(clientsTable.id, matters.map(m => m.clientId))) : Promise.resolve([] as (typeof clientsTable.$inferSelect)[]),
    matters.length ? db.select().from(usersTable).where(inArray(usersTable.id, matters.map(m => m.assignedToId).filter((id): id is number => id != null))) : Promise.resolve([] as (typeof usersTable.$inferSelect)[]),
    matters.length ? db.selectDistinctOn([conflictsTable.matterId]).from(conflictsTable)
      .where(inArray(conflictsTable.matterId, matters.map(m => m.id)))
      .orderBy(conflictsTable.matterId, desc(conflictsTable.checkedAt), desc(conflictsTable.id)) : Promise.resolve([] as (typeof conflictsTable.$inferSelect)[]),
  ]);
  const enriched = matters.map(m => {
    const conflictStatus = conflicts.find(c => c.matterId === m.id)?.status ?? null;
    return { ...m, value: m.value != null ? parseFloat(m.value as string) : null,
      clientName: clients.find(c => c.id === m.clientId)?.name ?? "Unknown",
      assignedToName: users.find(u => u.id === m.assignedToId)?.name ?? null,
      conflictStatus, nextAction: computeNextAction(m.status, conflictStatus, m.riskLevel) };
  });
  res.json(enriched);
});

router.post("/matters", async (req, res): Promise<void> => {
  const parsed = CreateMatterBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const count = await db.$count(mattersTable);
  const reference = `APZ-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, parsed.data.clientId));
  if (!client) { res.status(404).json({ error: "Client not found" }); return; }
  if (client.complianceStatus !== "compliant") {
    res.status(409).json({
      error: "Matter creation is blocked until the client's critical FICA requirements are compliant.",
      code: "FICA_COMPLIANCE_REQUIRED",
      complianceStatus: client.complianceStatus,
      complianceBlockReason: client.complianceBlockReason,
    });
    return;
  }
  const [matter] = await db.insert(mattersTable).values({ ...parsed.data, reference, value: parsed.data.value?.toString() }).returning();
  const user = await getCurrentUser(req);
  await runOnboardingConflictScreen(matter, client, user?.id ?? null, req.ip ?? null);
  const [screenedMatter] = await db.select().from(mattersTable).where(eq(mattersTable.id, matter.id));
  res.status(201).json(await enrichMatter(screenedMatter ?? matter));
});

router.get("/matters/:id", async (req, res): Promise<void> => {
  const current = await getCurrentUser(req);
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [matter] = await db.select().from(mattersTable).where(eq(mattersTable.id, id));
  if (!matter) { res.status(404).json({ error: "Matter not found" }); return; }
  if (!hasMatterAccess(current, matter)) {
    res.status(403).json({ error: "You do not have access to this matter.", code: "ASSIGNMENT_REQUIRED" }); return;
  }

  res.json(await enrichMatter(matter));
});

router.patch("/matters/:id", async (req, res): Promise<void> => {
  const params = UpdateMatterParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateMatterBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [existing] = await db.select().from(mattersTable).where(eq(mattersTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Matter not found" }); return; }
  const current = await getCurrentUser(req);
  if (!current || !hasMatterAccess(current, existing)) {
    res.status(403).json({ error: "You do not have access to update this matter.", code: "ASSIGNMENT_REQUIRED" }); return;
  }

  const hasAssignmentChange = Object.prototype.hasOwnProperty.call(parsed.data, "assignedToId");
  if (hasAssignmentChange && !canAssignMatter(current)) {
    res.status(403).json({ error: "Only partners and administrators may assign matter team members.", code: "ROLE_REQUIRED" }); return;
  }

  if (hasAssignmentChange && parsed.data.assignedToId != null) {
    const [assignee] = await db.select().from(usersTable)
      .where(and(
        eq(usersTable.id, parsed.data.assignedToId),
        eq(usersTable.accountStatus, "active"),
        inArray(usersTable.role, ASSIGNABLE_MATTER_ROLES),
      ));
    if (!assignee) {
      res.status(400).json({ error: "Select an active legal-workspace staff member for this matter.", code: "INVALID_ASSIGNEE" }); return;
    }
  }

  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.value !== undefined) updateData.value = parsed.data.value == null ? null : parsed.data.value.toString();
  // Defense in depth: status may never be changed through the generic update
  // route — all status transitions must go through PATCH /matters/:id/status,
  // where the mandatory conflict gate is enforced.
  delete updateData.status;

  const [matter] = await db.update(mattersTable).set(updateData).where(eq(mattersTable.id, params.data.id)).returning();
  if (!matter) { res.status(404).json({ error: "Matter not found" }); return; }

  const changedFields = Object.keys(updateData);
  if (changedFields.length) {
    await logAudit({
      action: hasAssignmentChange ? "matter_assignment_updated" : "matter_details_updated",
      entityType: "matter",
      entityId: matter.id,
      entityTitle: matter.title,
      userId: current.id,
      details: hasAssignmentChange
        ? `Responsible team member changed from ${existing.assignedToId ?? "unassigned"} to ${matter.assignedToId ?? "unassigned"}; updated fields: ${changedFields.join(", ")}.`
        : `Updated matter fields: ${changedFields.join(", ")}.`,
      ipAddress: req.ip,
    });
  }

  res.json(await enrichMatter(matter));
});

router.get("/matters/:id/assignees", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [matter] = await db.select().from(mattersTable).where(eq(mattersTable.id, id));
  if (!matter) { res.status(404).json({ error: "Matter not found" }); return; }
  const current = await getCurrentUser(req);
  if (!current || !canAssignMatter(current)) {
    res.status(403).json({ error: "Only partners and administrators can assign matters.", code: "ROLE_REQUIRED" }); return;
  }
  if (!hasMatterAccess(current, matter)) {
    res.status(403).json({ error: "You do not have access to this matter.", code: "ASSIGNMENT_REQUIRED" }); return;
  }

  const assignees = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    role: usersTable.role,
    accountStatus: usersTable.accountStatus,
  }).from(usersTable).where(and(
    eq(usersTable.accountStatus, "active"),
    inArray(usersTable.role, ASSIGNABLE_MATTER_ROLES),
  ));
  res.json(assignees);
});

router.get("/matters/:id/export", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [matter] = await db.select().from(mattersTable).where(eq(mattersTable.id, id));
  if (!matter) { res.status(404).json({ error: "Matter not found" }); return; }
  const current = await getCurrentUser(req);
  if (!current || !hasMatterAccess(current, matter)) {
    res.status(403).json({ error: "You do not have access to export this matter.", code: "ASSIGNMENT_REQUIRED" }); return;
  }

  const [client, documents, matterTasks, research, aiOutputs, conflicts, matterAudits, users] = await Promise.all([
    db.select().from(clientsTable).where(eq(clientsTable.id, matter.clientId)),
    db.select().from(documentsTable).where(eq(documentsTable.matterId, id)),
    db.select().from(tasksTable).where(eq(tasksTable.matterId, id)),
    db.select().from(researchRecordsTable).where(eq(researchRecordsTable.matterId, id)),
    db.select().from(aiConversationsTable).where(eq(aiConversationsTable.matterId, id)),
    db.select().from(conflictsTable).where(eq(conflictsTable.matterId, id)),
    db.select().from(auditLogsTable).where(and(eq(auditLogsTable.entityType, "matter"), eq(auditLogsTable.entityId, id))),
    db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable),
  ]);
  const [clientRecord] = client;
  if (!clientRecord) { res.status(409).json({ error: "The matter's client record is unavailable.", code: "CLIENT_RECORD_MISSING" }); return; }

  const [documentAudits, aiAudits, researchAudits] = await Promise.all([
    documents.length
      ? db.select().from(auditLogsTable).where(and(eq(auditLogsTable.entityType, "document"), inArray(auditLogsTable.entityId, documents.map((document) => document.id))))
      : Promise.resolve([]),
    aiOutputs.length
      ? db.select().from(auditLogsTable).where(and(eq(auditLogsTable.entityType, "ai_output"), inArray(auditLogsTable.entityId, aiOutputs.map((output) => output.id))))
      : Promise.resolve([]),
    research.length
      ? db.select().from(auditLogsTable).where(and(eq(auditLogsTable.entityType, "research"), inArray(auditLogsTable.entityId, research.map((record) => record.id))))
      : Promise.resolve([]),
  ]);
  const nameFor = (userId: number | null | undefined) => userId == null ? null : users.find((user) => user.id === userId)?.name ?? null;
  const auditLogs = [...matterAudits, ...documentAudits, ...aiAudits, ...researchAudits]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const timeline = [
    { id: `matter-${matter.id}`, category: "matter", title: "Matter created", detail: `${matter.reference} — ${matter.title}`, actorName: nameFor(matter.assignedToId), occurredAt: matter.createdAt },
    ...documents.map((document) => ({ id: `document-${document.id}`, category: "document", title: `Document added: ${document.title}`, detail: `Status: ${document.status}`, actorName: nameFor(document.createdById), occurredAt: document.createdAt })),
    ...matterTasks.map((task) => ({ id: `task-${task.id}`, category: "task", title: `Task: ${task.title}`, detail: `Status: ${task.status}`, actorName: nameFor(task.assignedToId), occurredAt: task.createdAt })),
    ...research.map((record) => ({ id: `research-${record.id}`, category: "research", title: `Research performed: ${record.query.slice(0, 100)}`, detail: `Sources: ${record.sourcesRequested.join(", ")}`, actorName: nameFor(record.userId), occurredAt: record.createdAt })),
    ...aiOutputs.map((output) => ({ id: `ai-${output.id}`, category: "ai", title: output.title ? `AI output: ${output.title}` : "AI consultation", detail: `${output.riskLevel} risk · review ${output.reviewStatus}`, actorName: nameFor(output.userId), occurredAt: output.createdAt })),
    ...conflicts.map((conflict) => ({ id: `conflict-${conflict.id}`, category: "conflict", title: conflict.status === "cleared" ? "Conflict scan cleared" : `Conflict scan: ${conflict.status}`, detail: conflict.aiReasoning ?? null, actorName: nameFor(conflict.reviewedById), occurredAt: conflict.checkedAt })),
    ...auditLogs.map((audit) => ({ id: `audit-${audit.id}`, category: "audit", title: audit.action.replace(/_/g, " "), detail: audit.details ?? null, actorName: nameFor(audit.userId), occurredAt: audit.createdAt })),
  ].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  await logAudit({
    action: "matter_exported",
    entityType: "matter",
    entityId: matter.id,
    entityTitle: matter.title,
    userId: current.id,
    details: "Downloaded matter dossier metadata export.",
    ipAddress: req.ip,
  });

  res
    .setHeader("content-type", "application/json; charset=utf-8")
    .setHeader("content-disposition", `attachment; filename="${matter.reference.toLowerCase()}-matter-dossier.json"`)
    .json({
      generatedAt: new Date(),
      matter: await enrichMatter(matter),
      client: {
        id: clientRecord.id,
        name: clientRecord.name,
        type: clientRecord.type,
        status: clientRecord.status,
        ficaStatus: clientRecord.ficaStatus,
      },
      timeline,
      documents: documents.map((document) => ({
        id: document.id,
        title: document.title,
        documentType: document.documentType,
        status: document.status,
        version: document.version,
        approvalStatus: document.approvalStatus,
        signatureStatus: document.signatureStatus,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
      })),
      tasks: matterTasks.map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate,
        assignedToId: task.assignedToId,
        assignedToName: nameFor(task.assignedToId),
        createdAt: task.createdAt,
      })),
      research: research.map((record) => ({
        id: record.id,
        query: record.query,
        sourcesRequested: record.sourcesRequested,
        aiStatus: record.aiStatus,
        savedToMatter: record.savedToMatter,
        citationCount: record.citations?.length ?? 0,
        createdAt: record.createdAt,
      })),
      aiOutputs: aiOutputs.map((output) => ({
        id: output.id,
        workflowLabel: output.workflow.replace(/_/g, " "),
        title: output.title,
        riskLevel: output.riskLevel,
        reviewStatus: output.reviewStatus,
        documentId: output.documentId,
        createdAt: output.createdAt,
      })),
      conflicts: conflicts.map((conflict) => ({
        id: conflict.id,
        clientName: conflict.clientName,
        opposingParty: conflict.opposingParty,
        severity: conflict.severity,
        status: conflict.status,
        reviewDecision: conflict.reviewDecision,
        reviewReason: conflict.reviewReason,
        reviewedAt: conflict.reviewedAt,
        checkedAt: conflict.checkedAt,
      })),
      auditLogs: auditLogs.map((audit) => ({
        id: audit.id,
        action: audit.action,
        entityType: audit.entityType,
        entityId: audit.entityId,
        entityTitle: audit.entityTitle,
        userId: audit.userId,
        userName: nameFor(audit.userId),
        details: audit.details,
        createdAt: audit.createdAt,
      })),
    });
});

router.patch("/matters/:id/status", async (req, res): Promise<void> => {
  const params = UpdateMatterStatusParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateMatterStatusBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [existing] = await db.select().from(mattersTable).where(eq(mattersTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Matter not found" }); return; }

  const targetStatus = parsed.data.status;

  const blockTransition = async (code: string, error: string): Promise<void> => {
    const user = await getCurrentUser(req);
    await logAudit({
      action: "matter_status_change_blocked",
      entityType: "matter",
      entityId: existing.id,
      entityTitle: existing.title,
      userId: user?.id ?? null,
      details: `Attempted transition ${existing.status} → ${targetStatus} blocked: ${code}`,
      ipAddress: req.ip,
    });
    res.status(409).json({ error, code });
  };

  // ── Lifecycle + compliance enforcement via the shared validator.
  const transition = checkTransition(existing, targetStatus);
  if (!transition.ok) {
    await blockTransition(transition.code, transition.error);
    return;
  }

  // ── Conflict gating: a matter cannot become approved/active until the
  //    mandatory conflict review is complete. Enforced server-side.
  if (["approved", "active"].includes(targetStatus)) {
    const latestConflict = await latestConflictFor(existing.id);

    if (!latestConflict) {
      await blockTransition("CONFLICT_CHECK_REQUIRED", "Conflict check required: run a conflict scan for this matter before it can be approved or activated.");
      return;
    }
    if (latestConflict.status === "rejected") {
      await blockTransition("CONFLICT_REJECTED", "Conflict rejected: a partner rejected the conflict review — this matter cannot be approved or activated.");
      return;
    }
    // Whitelist: only cleared (no conflicts found) or approved (partner-approved)
    // may proceed. Any other status — pending, further_review, or legacy values
    // such as "flagged" — requires partner review first.
    if (!["cleared", "approved"].includes(latestConflict.status)) {
      await blockTransition("CONFLICT_REVIEW_PENDING", "Conflict review pending: the flagged conflict scan must be reviewed and approved by a partner before this matter can proceed.");
      return;
    }
  }

  // ── FICA gating: a matter cannot become approved/active while its client is
  //    compliance-blocked (missing/rejected/expired FICA verification).
  if (["approved", "active"].includes(targetStatus)) {
    const compliance = await recomputeCompliance(existing.clientId);
    if (compliance.status !== "compliant") {
      await blockTransition("FICA_BLOCKED", `FICA compliance is not current${compliance.reason ? `: ${compliance.reason}` : ""}. The client's FICA verification must be resolved before this matter can be approved or activated.`);
      return;
    }
  }

  const [matter] = await db.update(mattersTable).set({ status: targetStatus }).where(eq(mattersTable.id, params.data.id)).returning();
  if (!matter) { res.status(404).json({ error: "Matter not found" }); return; }

  const user = await getCurrentUser(req);
  await logAudit({
    action: "matter_status_changed",
    entityType: "matter",
    entityId: matter.id,
    entityTitle: matter.title,
    userId: user?.id ?? null,
    details: `Status changed from ${existing.status} to ${targetStatus}`,
    ipAddress: req.ip,
  });

  res.json(await enrichMatter(matter));
});

router.get("/matters/:id/summary", async (req, res): Promise<void> => {
  const params = GetMatterSummaryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const [matter] = await db.select().from(mattersTable).where(eq(mattersTable.id, params.data.id));
  if (!matter) { res.status(404).json({ error: "Matter not found" }); return; }

  const enriched = await enrichMatter(matter);

  res.json({
    matterId: matter.id,
    summary: `Matter ${matter.reference} — ${matter.title}. Current status: ${matter.status}. Practice area: ${matter.practiceArea ?? "General"}. Client: ${enriched.clientName}.`,
    timeline: [
      { id: 1, type: "created", description: "Matter created and assigned", occurredAt: matter.createdAt, userId: null, userName: enriched.assignedToName },
      { id: 2, type: "status_change", description: `Status set to ${matter.status}`, occurredAt: matter.updatedAt, userId: null, userName: null },
    ],
  });
});

// ── Consolidated matter timeline ─────────────────────────────────────────────
router.get("/matters/:id/timeline", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [matter] = await db.select().from(mattersTable).where(eq(mattersTable.id, id));
  if (!matter) { res.status(404).json({ error: "Matter not found" }); return; }

  const [conflicts, documents, tasks, aiConvos, research, timeEntries, invoices, audits, users] = await Promise.all([
    db.select().from(conflictsTable).where(eq(conflictsTable.matterId, id)),
    db.select().from(documentsTable).where(eq(documentsTable.matterId, id)),
    db.select().from(tasksTable).where(eq(tasksTable.matterId, id)),
    db.select().from(aiConversationsTable).where(eq(aiConversationsTable.matterId, id)),
    db.select().from(researchRecordsTable).where(eq(researchRecordsTable.matterId, id)),
    db.select().from(timeEntriesTable).where(eq(timeEntriesTable.matterId, id)),
    db.select().from(invoicesTable).where(eq(invoicesTable.matterId, id)),
    db.select().from(auditLogsTable).where(and(eq(auditLogsTable.entityType, "matter"), eq(auditLogsTable.entityId, id))),
    db.select().from(usersTable),
  ]);
  const docAudits = documents.length
    ? await db.select().from(auditLogsTable).where(and(eq(auditLogsTable.entityType, "document"), inArray(auditLogsTable.entityId, documents.map((d) => d.id))))
    : [];
  const aiAudits = aiConvos.length
    ? await db.select().from(auditLogsTable).where(and(eq(auditLogsTable.entityType, "ai_output"), inArray(auditLogsTable.entityId, aiConvos.map((a) => a.id))))
    : [];
  const userName = (uid: number | null | undefined): string | null =>
    uid ? users.find((u) => u.id === uid)?.name ?? null : null;

  type Event = { id: string; category: string; title: string; detail: string | null; actorName: string | null; occurredAt: Date };
  const events: Event[] = [];

  events.push({ id: `matter-${matter.id}`, category: "matter", title: "Matter created", detail: `${matter.reference} — ${matter.title}`, actorName: userName(matter.assignedToId), occurredAt: matter.createdAt });

  for (const c of conflicts) {
    events.push({ id: `conflict-${c.id}`, category: "conflict", title: c.severity === "none" || c.status === "cleared" ? "Conflict scan cleared" : `Conflict scan flagged (${c.severity})`, detail: `${c.clientName}${c.opposingParty ? ` vs ${c.opposingParty}` : ""} — status ${c.status}`, actorName: null, occurredAt: c.checkedAt });
    if (c.reviewedAt) {
      events.push({ id: `conflict-review-${c.id}`, category: "conflict", title: `Partner review: ${c.reviewDecision ?? "decided"}`, detail: c.reviewReason ?? null, actorName: userName(c.reviewedById), occurredAt: c.reviewedAt });
    }
  }
  for (const d of documents) {
    const cat = d.status === "signed" ? "signature" : "document";
    events.push({ id: `document-${d.id}`, category: cat, title: d.status === "signed" ? `Document signed: ${d.title}` : `Document added: ${d.title}`, detail: `Status: ${d.status}`, actorName: null, occurredAt: d.createdAt });
  }
  for (const t of tasks) {
    events.push({ id: `task-${t.id}`, category: "task", title: `Task: ${t.title}`, detail: `Status: ${t.status}`, actorName: userName(t.assignedToId), occurredAt: t.createdAt });
  }
  for (const a of aiConvos) {
    events.push({ id: `ai-${a.id}`, category: "ai", title: a.title ? `AI output: ${a.title}` : "AI consultation", detail: `${a.riskLevel} risk · review ${a.reviewStatus}${a.documentId ? " · saved to matter" : ""}`, actorName: userName(a.userId), occurredAt: a.createdAt });
  }
  for (const r of research) {
    events.push({ id: `research-${r.id}`, category: "research", title: `Research performed: ${r.query.slice(0, 100)}`, detail: `Sources: ${r.sourcesRequested.join(", ")} · ${(r.citations ?? []).length} citation(s) · AI ${r.aiStatus}`, actorName: userName(r.userId), occurredAt: r.createdAt });
    if (r.savedToMatter && r.savedAt) {
      events.push({ id: `research-saved-${r.id}`, category: "research", title: `Research saved: ${r.query.slice(0, 100)}`, detail: `Sources: ${r.sourcesRequested.join(", ")} — now part of the formal matter record`, actorName: userName(r.savedById), occurredAt: r.savedAt });
    }
  }
  for (const te of timeEntries) {
    events.push({ id: `time-${te.id}`, category: "billing", title: `Time recorded: ${te.hours}h`, detail: te.description, actorName: userName(te.userId), occurredAt: te.createdAt });
  }
  for (const inv of invoices) {
    events.push({ id: `invoice-${inv.id}`, category: "billing", title: `Invoice ${inv.invoiceNumber} (${inv.status})`, detail: `Total R${inv.total}`, actorName: null, occurredAt: inv.createdAt });
  }
  for (const log of audits) {
    const isStatus = log.action.startsWith("matter_status");
    events.push({ id: `audit-${log.id}`, category: isStatus ? "status" : "audit", title: log.action.replace(/_/g, " "), detail: log.details ?? null, actorName: userName(log.userId), occurredAt: log.createdAt });
  }
  for (const log of docAudits) {
    if (log.action === "document_created") continue; // already covered by the document creation event
    const cat = ["document_sent_for_signature", "document_signed"].includes(log.action) ? "signature" : "document";
    events.push({ id: `docaudit-${log.id}`, category: cat, title: log.action.replace(/_/g, " "), detail: log.details ?? null, actorName: userName(log.userId), occurredAt: log.createdAt });
  }
  for (const log of aiAudits) {
    if (log.action === "ai_output_generated") continue; // already covered by the AI output event
    events.push({ id: `aiaudit-${log.id}`, category: "ai", title: log.action.replace(/_/g, " "), detail: log.details ?? null, actorName: userName(log.userId), occurredAt: log.createdAt });
  }

  events.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  res.json(events);
});

export default router;
