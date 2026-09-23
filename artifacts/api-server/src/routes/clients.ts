import { pagination } from "../lib/pagination";
import { z } from "zod";
import { Router, type IRouter } from "express";
import { db, clientsTable, ficaDocumentsTable, mattersTable, relatedPartiesTable, documentsTable, invoicesTable, auditLogsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { eq, sql, ilike, and, desc, type SQL } from "drizzle-orm";
import {
  CreateClientBody, UpdateClientBody,
  GetClientParams, UpdateClientParams, DeleteClientParams,
  GetClientFicaParams, GetClientRiskScoreParams,
  ListClientsQueryParams,
} from "@workspace/api-zod";
import { COMPLIANCE_ROLES, LEGAL_AUTHOR_ROLES, requireRole } from "../lib/permissions";
import { getCurrentUser, logAudit } from "../lib/context";

const router: IRouter = Router();

// ─── helpers ─────────────────────────────────────────────────────────────────
function parseId(s: string): number | null {
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}

async function withMatterCount(client: typeof clientsTable.$inferSelect) {
  const [row] = await db.select({ count: sql<number>`count(*)::int` })
    .from(mattersTable).where(eq(mattersTable.clientId, client.id));
  return { ...client, matterCount: row?.count ?? 0 };
}

export async function canReadClient(clientId: number, user: Awaited<ReturnType<typeof getCurrentUser>>) {
  if (!user || !["candidate_attorney", "paralegal", "secretary"].includes(user.role)) return true;
  const [matter] = await db.select({ id: mattersTable.id }).from(mattersTable)
    .where(and(eq(mattersTable.clientId, clientId), eq(mattersTable.assignedToId, user.id))).limit(1);
  return Boolean(matter);
}

// ─── LIST ─────────────────────────────────────────────────────────────────────
router.get("/clients", async (req, res): Promise<void> => {
  const page = pagination(req, res);
  if (!page) return;
  const current = await getCurrentUser(req);
  const params = ListClientsQueryParams.safeParse(req.query);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const { search, type, status, ficaStatus } = params.data;
  const conditions: SQL[] = [];
  if (search)     conditions.push(ilike(clientsTable.name, `%${search}%`));
  if (type)       conditions.push(eq(clientsTable.type, type));
  if (status)     conditions.push(eq(clientsTable.status, status));
  if (ficaStatus) conditions.push(eq(clientsTable.ficaStatus, ficaStatus));

  const assignedClientIds = current && ["candidate_attorney", "paralegal", "secretary"].includes(current.role)
    ? (await db.select({ clientId: mattersTable.clientId }).from(mattersTable).where(eq(mattersTable.assignedToId, current.id))).map(row => row.clientId)
    : null;
  if (assignedClientIds) conditions.push(assignedClientIds.length ? inArray(clientsTable.id, assignedClientIds) : eq(clientsTable.id, -1));
  const clients = await db.select().from(clientsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(clientsTable.createdAt, clientsTable.id).limit(page.limit).offset(page.offset);

  const matterCounts = await db
    .select({ clientId: mattersTable.clientId, count: sql<number>`count(*)::int` })
    .from(mattersTable).groupBy(mattersTable.clientId);

  const countMap = new Map(matterCounts.map(r => [r.clientId, r.count]));
  res.json(clients.map(c => ({ ...c, matterCount: countMap.get(c.id) ?? 0 })));
});

// ─── CREATE ───────────────────────────────────────────────────────────────────
router.post("/clients", async (req, res): Promise<void> => {
  const user = await requireRole(req, res, LEGAL_AUTHOR_ROLES, "Only legal staff may onboard a client.");
  if (!user) return;
  const parsed = CreateClientBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [client] = await db.insert(clientsTable).values(parsed.data).returning();
  await logAudit({ action: "client_created", entityType: "client", entityId: client.id, entityTitle: client.name, userId: user.id, details: "Client onboarded.", ipAddress: req.ip });
  res.status(201).json({ ...client, matterCount: 0 });
});

// ─── GET ONE ──────────────────────────────────────────────────────────────────
router.get("/clients/:id", async (req, res): Promise<void> => {
  const current = await getCurrentUser(req);
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
  if (!client) { res.status(404).json({ error: "Client not found" }); return; }
  if (current && ["candidate_attorney", "paralegal", "secretary"].includes(current.role)) {
    const [assigned] = await db.select({ id: mattersTable.id }).from(mattersTable).where(and(eq(mattersTable.clientId, id), eq(mattersTable.assignedToId, current.id))).limit(1);
    if (!assigned) { res.status(403).json({ error: "You do not have access to this client.", code: "ASSIGNMENT_REQUIRED" }); return; }
  }
  res.json(await withMatterCount(client));
});

// ─── UPDATE ───────────────────────────────────────────────────────────────────
router.patch("/clients/:id", async (req, res): Promise<void> => {
  const user = await requireRole(req, res, LEGAL_AUTHOR_ROLES, "Only legal staff may edit client records.");
  if (!user) return;
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateClientBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [client] = await db.update(clientsTable).set(parsed.data).where(eq(clientsTable.id, id)).returning();
  if (!client) { res.status(404).json({ error: "Client not found" }); return; }
  await logAudit({ action: "client_updated", entityType: "client", entityId: client.id, entityTitle: client.name, userId: user.id, details: "Client details updated.", ipAddress: req.ip });
  await logAudit({ action: "client_compliance_updated", entityType: "client", entityId: client.id, entityTitle: client.name, userId: user.id, details: `Compliance status changed to ${client.complianceStatus}.`, ipAddress: req.ip });
  res.json(await withMatterCount(client));
});

// ─── UPDATE COMPLIANCE STATUS ─────────────────────────────────────────────────
router.patch("/clients/:id/compliance", async (req, res): Promise<void> => {
  const user = await requireRole(req, res, COMPLIANCE_ROLES, "Only compliance staff may change a client compliance status.");
  if (!user) return;
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = z.object({
    complianceStatus: z.enum(["compliant", "review_required", "blocked"]).optional(),
    complianceBlockReason: z.string().max(2000).nullable().optional(),
    riskLevel: z.enum(["low", "medium", "high"]).optional(),
    riskScore: z.number().int().min(0).max(100).optional(),
  }).strict().refine(value => Object.keys(value).length > 0).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid compliance update" }); return; }
  const [client] = await db.update(clientsTable)
    .set(parsed.data)
    .where(eq(clientsTable.id, id)).returning();
  if (!client) { res.status(404).json({ error: "Client not found" }); return; }
  await logAudit({ action: "client_compliance_updated", entityType: "client", entityId: client.id,
    userId: user.id, details: `Compliance fields updated: ${Object.keys(parsed.data).join(", ")}.`, ipAddress: req.ip });
  res.json(client);
});

// ─── SOFT DELETE ──────────────────────────────────────────────────────────────
router.delete("/clients/:id", async (req, res): Promise<void> => {
  const user = await requireRole(req, res, COMPLIANCE_ROLES, "Only compliance staff may deactivate a client record.");
  if (!user) return;
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const [client] = await db.update(clientsTable).set({ status: "inactive" }).where(eq(clientsTable.id, id)).returning();
  if (!client) { res.status(404).json({ error: "Client not found" }); return; }
  await logAudit({ action: "client_deactivated", entityType: "client", entityId: client.id, entityTitle: client.name, userId: user.id, details: "Client deactivated.", ipAddress: req.ip });
  res.status(204).send();
});

// ─── FICA ─────────────────────────────────────────────────────────────────────
router.get("/clients/:id/fica", async (req, res): Promise<void> => {
  const current = await getCurrentUser(req);
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
  if (!client) { res.status(404).json({ error: "Client not found" }); return; }
  if (!(await canReadClient(id, current))) { res.status(403).json({ error: "You do not have access to this client.", code: "ASSIGNMENT_REQUIRED" }); return; }
  const docs = await db.select().from(ficaDocumentsTable).where(eq(ficaDocumentsTable.clientId, id));
  res.json({
    clientId: client.id,
    overallStatus: client.ficaStatus,
    complianceStatus: client.complianceStatus,
    complianceBlockReason: client.complianceBlockReason,
    riskScore: client.riskScore ?? 0,
    riskLevel: client.riskLevel ?? "low",
    documents: docs.map(d => ({
      id: d.id, type: d.type, status: d.status,
      expiryDate: d.expiryDate ?? null, uploadedAt: d.uploadedAt ?? null,
    })),
  });
});

// ─── RISK SCORE ───────────────────────────────────────────────────────────────
router.get("/clients/:id/risk-score", async (req, res): Promise<void> => {
  const current = await getCurrentUser(req);
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
  if (!client) { res.status(404).json({ error: "Client not found" }); return; }
  if (!(await canReadClient(id, current))) { res.status(403).json({ error: "You do not have access to this client.", code: "ASSIGNMENT_REQUIRED" }); return; }
  const score = client.riskScore ?? 0;
  const level = client.riskLevel ?? (score >= 70 ? "high" : score >= 40 ? "medium" : "low");
  const factors = level === "high"
    ? ["Missing FICA documents", "High-risk jurisdiction", "Beneficial ownership unverified"]
    : level === "medium"
    ? ["Pending document verification", "Address verification outstanding"]
    : ["All documents verified", "Low-risk jurisdiction"];
  res.json({ clientId: client.id, score, level, factors });
});

// ─── RELATED PARTIES ─────────────────────────────────────────────────────────
router.get("/clients/:id/related-parties", async (req, res): Promise<void> => {
  const current = await getCurrentUser(req);
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!(await canReadClient(id, current))) { res.status(403).json({ error: "You do not have access to this client.", code: "ASSIGNMENT_REQUIRED" }); return; }
  const parties = await db.select().from(relatedPartiesTable)
    .where(eq(relatedPartiesTable.clientId, id))
    .orderBy(relatedPartiesTable.role, relatedPartiesTable.name);
  res.json(parties);
});

router.post("/clients/:id/related-parties", async (req, res): Promise<void> => {
  const user = await requireRole(req, res, LEGAL_AUTHOR_ROLES, "Only legal staff may manage related parties.");
  if (!user) return;
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const { role, name, idNumber, passportNo, email, phone, notes, ownershipPct } = req.body;
  if (!role || !name) { res.status(400).json({ error: "role and name are required" }); return; }
  const [party] = await db.insert(relatedPartiesTable)
    .values({ clientId: id, role, name, idNumber, passportNo, email, phone, notes, ownershipPct })
    .returning();
  await logAudit({ action: "related_party_created", entityType: "client", entityId: id, entityTitle: name, userId: user.id, details: `Related party added (${role}).`, ipAddress: req.ip });
  res.status(201).json(party);
});

router.put("/clients/:id/related-parties/:partyId", async (req, res): Promise<void> => {
  const user = await requireRole(req, res, LEGAL_AUTHOR_ROLES, "Only legal staff may manage related parties.");
  if (!user) return;
  const id      = parseId(req.params.id);
  const partyId = parseId(req.params.partyId);
  if (!id || !partyId) { res.status(400).json({ error: "Invalid id" }); return; }
  const { role, name, idNumber, passportNo, email, phone, notes, ownershipPct } = req.body;
  const [party] = await db.update(relatedPartiesTable)
    .set({ role, name, idNumber, passportNo, email, phone, notes, ownershipPct })
    .where(and(eq(relatedPartiesTable.id, partyId), eq(relatedPartiesTable.clientId, id)))
    .returning();
  if (!party) { res.status(404).json({ error: "Not found" }); return; }
  await logAudit({ action: "related_party_updated", entityType: "client", entityId: id, entityTitle: name, userId: user.id, details: `Related party ${partyId} updated.`, ipAddress: req.ip });
  res.json(party);
});

router.delete("/clients/:id/related-parties/:partyId", async (req, res): Promise<void> => {
  const user = await requireRole(req, res, LEGAL_AUTHOR_ROLES, "Only legal staff may manage related parties.");
  if (!user) return;
  const id      = parseId(req.params.id);
  const partyId = parseId(req.params.partyId);
  if (!id || !partyId) { res.status(400).json({ error: "Invalid id" }); return; }
  const [party] = await db.delete(relatedPartiesTable)
    .where(and(eq(relatedPartiesTable.id, partyId), eq(relatedPartiesTable.clientId, id)))
    .returning();
  if (!party) { res.status(404).json({ error: "Not found" }); return; }
  await logAudit({ action: "related_party_deleted", entityType: "client", entityId: id, userId: user.id, details: `Related party ${partyId} deleted.`, ipAddress: req.ip });
  res.status(204).send();
});

// ─── DOCUMENTS (for this client) ─────────────────────────────────────────────
router.get("/clients/:id/documents", async (req, res): Promise<void> => {
  const current = await getCurrentUser(req);
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!(await canReadClient(id, current))) { res.status(403).json({ error: "You do not have access to this client.", code: "ASSIGNMENT_REQUIRED" }); return; }
  // Documents link to matters, not directly to clients — collect via the client's matters
  const clientMatters = await db.select().from(mattersTable).where(eq(mattersTable.clientId, id));
  const matterIds = clientMatters.map((m) => m.id);
  const docs = matterIds.length
    ? await db.select().from(documentsTable)
        .where(inArray(documentsTable.matterId, matterIds))
        .orderBy(desc(documentsTable.createdAt))
    : [];
  res.json(docs);
});

// ─── BILLING SUMMARY (for this client) ───────────────────────────────────────
router.get("/clients/:id/billing", async (req, res): Promise<void> => {
  const current = await getCurrentUser(req);
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!(await canReadClient(id, current))) { res.status(403).json({ error: "You do not have access to this client.", code: "ASSIGNMENT_REQUIRED" }); return; }
  const invoices = await db.select().from(invoicesTable)
    .where(eq(invoicesTable.clientId, id))
    .orderBy(desc(invoicesTable.createdAt));
  const total      = invoices.reduce((s, i) => s + Number(i.total ?? 0), 0);
  const paid       = invoices.filter(i => i.status === "paid").reduce((s, i) => s + Number(i.total ?? 0), 0);
  const outstanding= invoices.filter(i => i.status !== "paid" && i.status !== "cancelled").reduce((s, i) => s + Number(i.total ?? 0), 0);
  res.json({ invoices, total, paid, outstanding });
});

// ─── AUDIT LOG (for this client) ─────────────────────────────────────────────
router.get("/clients/:id/activity", async (req, res): Promise<void> => {
  const current = await getCurrentUser(req);
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!(await canReadClient(id, current))) { res.status(403).json({ error: "You do not have access to this client.", code: "ASSIGNMENT_REQUIRED" }); return; }
  const logs = await db.select().from(auditLogsTable)
    .where(eq(auditLogsTable.entityId, id))
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(50);
  res.json(logs);
});

export default router;
