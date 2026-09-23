import { pagination } from "../lib/pagination";
import { Router, type IRouter } from "express";
import { db, auditLogsTable, usersTable, documentsTable, aiConversationsTable, researchRecordsTable } from "@workspace/db";
import { eq, and, or, gte, lte, inArray, type SQL } from "drizzle-orm";
import { ListAuditLogsQueryParams } from "@workspace/api-zod";
import { getCurrentUser } from "../lib/context";
import { COMPLIANCE_ROLES, requireRole } from "../lib/permissions";

const router: IRouter = Router();

router.get("/audit-logs", async (req, res): Promise<void> => {
  const page = pagination(req, res);
  if (!page) return;
  const user = await requireRole(req, res, COMPLIANCE_ROLES, "Only compliance staff may view the audit record.");
  if (!user) return;
  const params = ListAuditLogsQueryParams.safeParse(req.query);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const conditions: SQL[] = [];
  // matterId collects every audit entry belonging to a matter: the matter's own
  // entries plus those of its documents and AI outputs.
  const matterId = req.query.matterId != null ? parseInt(String(req.query.matterId), 10) : NaN;
  if (!isNaN(matterId)) {
    const [docs, aiOutputs, research] = await Promise.all([
      db.select({ id: documentsTable.id }).from(documentsTable).where(eq(documentsTable.matterId, matterId)),
      db.select({ id: aiConversationsTable.id }).from(aiConversationsTable).where(eq(aiConversationsTable.matterId, matterId)),
      db.select({ id: researchRecordsTable.id }).from(researchRecordsTable).where(eq(researchRecordsTable.matterId, matterId)),
    ]);
    const branches: SQL[] = [and(eq(auditLogsTable.entityType, "matter"), eq(auditLogsTable.entityId, matterId))!];
    if (docs.length) branches.push(and(eq(auditLogsTable.entityType, "document"), inArray(auditLogsTable.entityId, docs.map((d) => d.id)))!);
    if (aiOutputs.length) branches.push(and(eq(auditLogsTable.entityType, "ai_output"), inArray(auditLogsTable.entityId, aiOutputs.map((a) => a.id)))!);
    if (research.length) branches.push(and(eq(auditLogsTable.entityType, "research"), inArray(auditLogsTable.entityId, research.map((r) => r.id)))!);
    conditions.push(or(...branches)!);
  }
  if (params.data.entityType) conditions.push(eq(auditLogsTable.entityType, params.data.entityType));
  if (params.data.entityId) conditions.push(eq(auditLogsTable.entityId, params.data.entityId));
  if (params.data.userId) conditions.push(eq(auditLogsTable.userId, params.data.userId));
  if (params.data.from) conditions.push(gte(auditLogsTable.createdAt, new Date(params.data.from)));
  if (params.data.to) conditions.push(lte(auditLogsTable.createdAt, new Date(params.data.to)));

  const logs = await db.select().from(auditLogsTable).where(conditions.length ? and(...conditions) : undefined).orderBy(auditLogsTable.createdAt, auditLogsTable.id).limit(page.limit).offset(page.offset);

  const userIds = logs.map((log) => log.userId).filter((id): id is number => id != null);
  const users = userIds.length ? await db.select().from(usersTable).where(inArray(usersTable.id, userIds)) : [];
  const enriched = logs.map((l) => ({ ...l, userName: l.userId == null ? null : users.find((u) => u.id === l.userId)?.name ?? null }));

  res.json(enriched);
});

router.get("/audit-logs/export", async (req, res): Promise<void> => {
  const user = await requireRole(req, res, COMPLIANCE_ROLES, "Only compliance staff may export audit records.");
  if (!user) return;
  const params = ListAuditLogsQueryParams.safeParse(req.query);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const conditions: SQL[] = [];
  if (params.data.entityType) conditions.push(eq(auditLogsTable.entityType, params.data.entityType));
  if (params.data.entityId) conditions.push(eq(auditLogsTable.entityId, params.data.entityId));
  if (params.data.userId) conditions.push(eq(auditLogsTable.userId, params.data.userId));
  if (params.data.from) conditions.push(gte(auditLogsTable.createdAt, new Date(params.data.from)));
  if (params.data.to) conditions.push(lte(auditLogsTable.createdAt, new Date(params.data.to)));
  const logs = await db.select().from(auditLogsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(auditLogsTable.createdAt);
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [
    ["Timestamp", "Action", "Entity type", "Entity ID", "Entity title", "User ID", "Details", "IP address"].map(escape).join(","),
    ...logs.map((log) => [
      log.createdAt.toISOString(), log.action, log.entityType, log.entityId,
      log.entityTitle, log.userId, log.details, log.ipAddress,
    ].map(escape).join(",")),
  ].join("\n");
  res
    .setHeader("content-type", "text/csv; charset=utf-8")
    .setHeader("content-disposition", `attachment; filename="apz-audit-${new Date().toISOString().slice(0, 10)}.csv"`)
    .send(csv);
});

export default router;
