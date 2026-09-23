import { pagination } from "../lib/pagination";
import { Router, type IRouter } from "express";
import { tryTransitionMatter } from "../lib/matter-lifecycle";
import {
  db,
  conflictsTable,
  mattersTable,
  clientsTable,
  usersTable,
  relatedPartiesTable,
  knowledgeItemsTable,
  notificationsTable,
} from "@workspace/db";
import { eq, ilike, and, or, desc, inArray, type SQL } from "drizzle-orm";
import {
  RunConflictCheckBody,
  ListConflictsQueryParams,
  ReviewConflictBody,
  ReviewConflictParams,
} from "@workspace/api-zod";
import { getCurrentUser, logAudit } from "../lib/context";
import { PARTNER_ROLES } from "../lib/permissions";

const router: IRouter = Router();

type Severity = "low" | "medium" | "high";

interface ConflictItem {
  type: string;
  description: string;
  severity: Severity;
  relatedMatterId: number | null;
  existingClient?: string | null;
  existingMatterRef?: string | null;
  relatedParty?: string | null;
  reason?: string | null;
}

const SEVERITY_ORDER = { none: 0, low: 1, medium: 2, high: 3 } as const;

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

function namesMatch(a: string, b: string): boolean {
  const al = a.toLowerCase().trim();
  const bl = b.toLowerCase().trim();
  if (!al || !bl) return false;
  if (al === bl) return true;
  if (al.includes(bl) || bl.includes(al)) return true;
  const at = nameTokens(a);
  const bt = nameTokens(b);
  // Require at least 2 shared tokens, or 1 shared token when either name is a single token
  const shared = at.filter((t) => bt.includes(t));
  const minTokens = Math.min(at.length, bt.length);
  return shared.length >= Math.min(2, Math.max(1, minTokens));
}

router.post("/conflicts/check", async (req, res): Promise<void> => {
  const parsed = RunConflictCheckBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const user = await getCurrentUser(req);
  const { opposingParty, matterId } = parsed.data;
  let { clientName } = parsed.data;

  // When the scan is bound to a matter, the client identity comes from the
  // matter record itself — callers cannot substitute a different party name
  // to manufacture a clean scan.
  if (matterId) {
    const [m] = await db.select().from(mattersTable).where(eq(mattersTable.id, matterId));
    if (!m) { res.status(404).json({ error: "Matter not found" }); return; }
    const [c] = await db.select().from(clientsTable).where(eq(clientsTable.id, m.clientId));
    if (!c) { res.status(409).json({ error: "Matter has no valid client record" }); return; }
    clientName = c.name;
  }

  const [allClients, allMatters, allParties] = await Promise.all([
    db.select().from(clientsTable),
    db.select().from(mattersTable),
    db.select().from(relatedPartiesTable),
  ]);

  const clientById = new Map(allClients.map((c) => [c.id, c]));
  const matterRef = (id: number | null) =>
    id != null ? (allMatters.find((m) => m.id === id)?.reference ?? null) : null;

  const conflicts: ConflictItem[] = [];
  const scanned: string[] = [];

  // 1. Opposing party vs existing clients (highest risk)
  if (opposingParty) {
    for (const c of allClients) {
      if (!namesMatch(c.name, opposingParty)) continue;
      const cMatters = allMatters.filter((m) => m.clientId === c.id);
      const active = cMatters.filter((m) => ["active", "approved", "review"].includes(m.status));
      conflicts.push({
        type: "opposing_party_is_client",
        description: `Proposed opposing party matches existing client "${c.name}"${active.length ? ` with ${active.length} active matter(s)` : ""}.`,
        severity: active.length ? "high" : "medium",
        relatedMatterId: cMatters[0]?.id ?? null,
        existingClient: c.name,
        existingMatterRef: matterRef(cMatters[0]?.id ?? null),
        reason: "The proposed opposing party is associated with an existing client — acting against them would be a direct conflict of interest.",
      });
    }
    scanned.push("existing clients vs opposing party");

    // 2. Opposing party vs related parties (directors, beneficial owners, etc.)
    for (const p of allParties) {
      if (!namesMatch(p.name, opposingParty)) continue;
      const pc = clientById.get(p.clientId);
      const cMatters = allMatters.filter((m) => m.clientId === p.clientId);
      conflicts.push({
        type: "opposing_party_related_party",
        description: `Proposed opposing party matches ${p.role.replace(/_/g, " ")} "${p.name}" of client "${pc?.name ?? "Unknown"}".`,
        severity: ["director", "beneficial_owner"].includes(p.role) ? "high" : "medium",
        relatedMatterId: cMatters[0]?.id ?? null,
        existingClient: pc?.name ?? null,
        existingMatterRef: matterRef(cMatters[0]?.id ?? null),
        relatedParty: `${p.name} (${p.role.replace(/_/g, " ")})`,
        reason: `The proposed opposing party is recorded as a ${p.role.replace(/_/g, " ")} of an existing client.`,
      });
    }
    scanned.push("related parties (directors, beneficial owners) vs opposing party");

    // 3. Opposing party appearing in historical matters (as client of past matters)
  }

  // 4. New client vs opposing parties recorded on other clients
  for (const p of allParties.filter((p) => p.role === "opposing_party")) {
    if (!namesMatch(p.name, clientName)) continue;
    const pc = clientById.get(p.clientId);
    const cMatters = allMatters.filter((m) => m.clientId === p.clientId);
    conflicts.push({
      type: "client_is_opposing_party",
      description: `Proposed client "${clientName}" is recorded as an opposing party against existing client "${pc?.name ?? "Unknown"}".`,
      severity: "high",
      relatedMatterId: cMatters[0]?.id ?? null,
      existingClient: pc?.name ?? null,
      existingMatterRef: matterRef(cMatters[0]?.id ?? null),
      relatedParty: `${p.name} (opposing party)`,
      reason: "The firm has previously acted against this party on behalf of an existing client.",
    });
  }
  scanned.push("recorded opposing parties vs proposed client");

  // 5. New client matches an existing client with active/historical matters (duplicate / dual representation awareness)
  for (const c of allClients) {
    if (!namesMatch(c.name, clientName)) continue;
    const cMatters = allMatters.filter((m) => m.clientId === c.id && m.id !== (matterId ?? -1));
    if (cMatters.length === 0) continue;
    const active = cMatters.filter((m) => ["active", "approved", "review"].includes(m.status));
    if (cMatters.length > 0) {
      conflicts.push({
        type: "existing_client",
        description: `Client "${c.name}" already exists with ${cMatters.length} matter(s)${active.length ? ` (${active.length} active)` : ""}.`,
        severity: active.length ? "medium" : "low",
        relatedMatterId: cMatters[0]?.id ?? null,
        existingClient: c.name,
        existingMatterRef: matterRef(cMatters[0]?.id ?? null),
        reason: "Historical matters exist for this client — verify no adverse positions across matters.",
      });
    }
  }
  scanned.push("historical matters of matching clients");

  // 6. Knowledge base references
  const kbConditions: SQL[] = [ilike(knowledgeItemsTable.title, `%${clientName}%`)];
  if (opposingParty) kbConditions.push(ilike(knowledgeItemsTable.title, `%${opposingParty}%`));
  const kbHits = await db
    .select()
    .from(knowledgeItemsTable)
    .where(or(...kbConditions));
  for (const k of kbHits) {
    conflicts.push({
      type: "knowledge_base_reference",
      description: `Knowledge base item "${k.title}" (${k.type}) references a party in this check.`,
      severity: "low",
      relatedMatterId: null,
      reason: "A knowledge base record mentions one of the parties — review for prior involvement or opinions.",
    });
  }
  scanned.push("knowledge base references");

  const hasConflicts = conflicts.length > 0;
  const maxSeverity = conflicts.reduce<"none" | Severity>(
    (acc, c) => (SEVERITY_ORDER[c.severity] > SEVERITY_ORDER[acc] ? c.severity : acc),
    "none",
  );

  const aiReasoning = hasConflicts
    ? `Scanned ${allClients.length} clients, ${allParties.length} related parties, ${allMatters.length} matters and the knowledge base (${scanned.join("; ")}). ${conflicts.length} potential conflict(s) identified — highest severity ${maxSeverity}. ${conflicts.filter((c) => c.severity === "high").length ? "High-severity matches indicate the firm may hold duties to an adverse party; partner review is mandatory before this matter can proceed." : "Partner review is required to clear or reject the flagged items."}`
    : `Scanned ${allClients.length} clients, ${allParties.length} related parties, ${allMatters.length} matters and the knowledge base (${scanned.join("; ")}). No matching parties or adverse relationships detected.`;

  // Save conflict record — cleared scans pass automatically; any flag requires partner review
  const [record] = await db
    .insert(conflictsTable)
    .values({
      matterId: matterId ?? undefined,
      clientName,
      opposingParty: opposingParty ?? undefined,
      severity: maxSeverity,
      status: hasConflicts ? "pending" : "cleared",
      conflictData: conflicts as unknown,
      aiReasoning,
    })
    .returning();

  // Move the matter into conflict_check while review is outstanding.
  // Goes through the shared lifecycle validator, so compliance-blocked
  // matters and invalid transitions are never advanced.
  if (matterId) {
    const [m] = await db.select().from(mattersTable).where(eq(mattersTable.id, matterId));
    if (m && hasConflicts && m.status === "lead") {
      await tryTransitionMatter(m, "conflict_check");
    }
  }

  await logAudit({
    action: hasConflicts ? "conflict_flagged" : "conflict_scan_cleared",
    entityType: "conflict",
    entityId: record.id,
    entityTitle: `${clientName}${opposingParty ? ` vs ${opposingParty}` : ""}`,
    userId: user?.id ?? null,
    details: `Conflict scan run${matterId ? ` for matter #${matterId}` : ""}: ${conflicts.length} flag(s), severity ${maxSeverity}. ${aiReasoning}`,
    ipAddress: req.ip,
  });
  if (hasConflicts) {
    await db.insert(notificationsTable).values({
      targetRole: "partner",
      type: "conflict_review",
      title: "Conflict awaiting partner review",
      message: `${clientName}${opposingParty ? ` vs ${opposingParty}` : ""} has ${conflicts.length} flagged item(s), highest severity ${maxSeverity}.`,
      link: matterId ? `/matters/${matterId}?tab=conflicts` : "/conflicts",
    });
  }

  res.json({
    id: record.id,
    hasConflicts,
    severity: maxSeverity,
    status: record.status,
    conflicts,
    aiReasoning,
  });
});

router.post("/conflicts/:id/review", async (req, res): Promise<void> => {
  const params = ReviewConflictParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = ReviewConflictBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const user = await getCurrentUser(req);
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  if (!PARTNER_ROLES.includes(user.role as (typeof PARTNER_ROLES)[number])) {
    res.status(403).json({ error: "Only a partner may review conflict results" });
    return;
  }

  const [conflict] = await db.select().from(conflictsTable).where(eq(conflictsTable.id, params.data.id));
  if (!conflict) { res.status(404).json({ error: "Conflict record not found" }); return; }
  // "flagged" is accepted for legacy records created before the review
  // workflow existed — they are review-required just like "pending".
  if (!["pending", "further_review", "flagged"].includes(conflict.status)) {
    res.status(409).json({ error: `Conflict record is already ${conflict.status} and cannot be re-reviewed` });
    return;
  }

  const { decision, reason } = parsed.data;
  const statusMap = {
    approve: "approved",
    reject: "rejected",
    request_further_review: "further_review",
  } as const;
  const newStatus = statusMap[decision];

  const [updated] = await db
    .update(conflictsTable)
    .set({
      status: newStatus,
      reviewedById: user.id,
      reviewDecision: decision,
      reviewReason: reason,
      reviewedAt: new Date(),
    })
    .where(eq(conflictsTable.id, params.data.id))
    .returning();

  // Reflect the decision on the linked matter — only if this record is the
  // latest conflict check for the matter (older reviews must not override a
  // newer pending/rejected scan).
  if (conflict.matterId) {
    const [latestForMatter] = await db
      .select()
      .from(conflictsTable)
      .where(eq(conflictsTable.matterId, conflict.matterId))
      .orderBy(desc(conflictsTable.checkedAt), desc(conflictsTable.id))
      .limit(1);
    const isLatest = latestForMatter?.id === conflict.id;
    const [m] = await db.select().from(mattersTable).where(eq(mattersTable.id, conflict.matterId));
    if (m && isLatest) {
      // System-driven transitions run through the shared lifecycle validator:
      // compliance-blocked matters and out-of-sequence moves are never applied.
      if (decision === "approve" && m.status === "conflict_check") {
        await tryTransitionMatter(m, "approved");
      } else if (decision === "reject") {
        const moved = ["approved", "active"].includes(m.status)
          ? await tryTransitionMatter(m, "conflict_check", { riskFlag: true })
          : false;
        if (!moved && m.status === "conflict_check") {
          await db.update(mattersTable).set({ riskFlag: true }).where(eq(mattersTable.id, m.id));
        }
      }
      await logAudit({
        action: `matter_conflict_${decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "further_review_requested"}`,
        entityType: "matter",
        entityId: m.id,
        entityTitle: m.title,
        userId: user.id,
        details: `Partner ${user.name} ${decision.replace(/_/g, " ")}d conflict review #${conflict.id}. Reason: ${reason}`,
        ipAddress: req.ip,
      });
    }
  }

  await logAudit({
    action: `conflict_review_${decision}`,
    entityType: "conflict",
    entityId: conflict.id,
    entityTitle: `${conflict.clientName}${conflict.opposingParty ? ` vs ${conflict.opposingParty}` : ""}`,
    userId: user.id,
    details: `Decision: ${decision}. Reviewer: ${user.name} (${user.role}). Reason: ${reason}`,
    ipAddress: req.ip,
  });

  res.json({
    id: updated.id,
    status: updated.status,
    reviewDecision: updated.reviewDecision,
    reviewReason: updated.reviewReason,
    reviewedByName: user.name,
    reviewedAt: updated.reviewedAt,
  });
});

router.get("/conflicts", async (req, res): Promise<void> => {
  const page = pagination(req, res);
  if (!page) return;
  const params = ListConflictsQueryParams.safeParse(req.query);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const conditions: SQL[] = [];
  if (params.data.matterId) conditions.push(eq(conflictsTable.matterId, params.data.matterId));
  if (params.data.severity) conditions.push(eq(conflictsTable.severity, params.data.severity));
  if (params.data.status) conditions.push(eq(conflictsTable.status, params.data.status));

  const records = await db
    .select()
    .from(conflictsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(conflictsTable.checkedAt), conflictsTable.id).limit(page.limit).offset(page.offset);

  const reviewerIds = records.map((record) => record.reviewedById).filter((id): id is number => id != null);
  const reviewers = reviewerIds.length ? await db.select().from(usersTable).where(inArray(usersTable.id, reviewerIds)) : [];
  const enriched = records.map((r) => {
    const reviewedByName = r.reviewedById == null ? null : reviewers.find((u) => u.id === r.reviewedById)?.name ?? null;
    return {
      id: r.id,
      matterId: r.matterId,
      clientName: r.clientName,
      opposingParty: r.opposingParty,
      severity: r.severity,
      status: r.status,
      conflicts: (r.conflictData as unknown[]) ?? [],
      aiReasoning: r.aiReasoning,
      reviewedByName,
      reviewDecision: r.reviewDecision,
      reviewReason: r.reviewReason,
      reviewedAt: r.reviewedAt,
      checkedAt: r.checkedAt,
    };
  });

  res.json(enriched);
});

export default router;
