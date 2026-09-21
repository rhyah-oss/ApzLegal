import { Router, type IRouter } from "express";
import { db, clientsTable, mattersTable, documentsTable, invoicesTable, auditLogsTable, usersTable, timeEntriesTable, tasksTable } from "@workspace/db";
import { and, eq, gte, sql, desc } from "drizzle-orm";
import { getCurrentUser } from "../lib/context";

const router: IRouter = Router();

router.get("/dashboard/stats", async (req, res): Promise<void> => {
  const [{ totalClients }]           = await db.select({ totalClients:           sql<number>`count(*)::int`                          }).from(clientsTable);
  const [{ activeMatters }]          = await db.select({ activeMatters:          sql<number>`count(*)::int`                          }).from(mattersTable).where(eq(mattersTable.status, "active"));
  const [{ mattersAwaitingApproval }]= await db.select({ mattersAwaitingApproval:sql<number>`count(*)::int`                          }).from(mattersTable).where(eq(mattersTable.status, "approved"));
  const [{ conflictsPending }]       = await db.select({ conflictsPending:       sql<number>`count(*)::int`                          }).from(mattersTable).where(eq(mattersTable.status, "conflict_check"));
  const [{ mattersAtRisk }]          = await db.select({ mattersAtRisk:          sql<number>`count(*)::int`                          }).from(mattersTable).where(eq(mattersTable.riskFlag, true));
  const [{ pendingDocuments }]       = await db.select({ pendingDocuments:        sql<number>`count(*)::int`                          }).from(documentsTable).where(eq(documentsTable.status, "review"));
  const [{ aiHighRiskDocs }]         = await db.select({ aiHighRiskDocs:          sql<number>`count(*)::int`                          }).from(documentsTable).where(eq(documentsTable.aiRiskLevel, "high"));
  const [{ openInvoices }]           = await db.select({ openInvoices:            sql<number>`count(*)::int`                          }).from(invoicesTable).where(eq(invoicesTable.status, "sent"));
  const [{ totalBilled }]            = await db.select({ totalBilled:             sql<number>`coalesce(sum(total::numeric), 0)`        }).from(invoicesTable).where(eq(invoicesTable.status, "paid"));
  const [{ compliant }]              = await db.select({ compliant:               sql<number>`count(*)::int`                          }).from(clientsTable).where(eq(clientsTable.ficaStatus, "compliant"));
  const [{ ficaIssues }]             = await db.select({ ficaIssues:              sql<number>`count(*)::int`                          }).from(clientsTable).where(sql`fica_status IN ('expired','blocked')`);
  const [{ overdueTaskCount }]       = await db.select({ overdueTaskCount:        sql<number>`count(*)::int`                          }).from(tasksTable).where(sql`status NOT IN ('completed','cancelled') AND due_date IS NOT NULL AND due_date < CURRENT_DATE`);
  const [{ unbilledHoursRaw }]       = await db.select({ unbilledHoursRaw:        sql<number>`coalesce(sum(hours::numeric), 0)`        }).from(timeEntriesTable).where(eq(timeEntriesTable.billed, false));

  const ficaCompliantRate = totalClients > 0 ? (compliant / totalClients) * 100 : 0;

  res.json({
    totalClients,
    activeMatters,
    mattersAwaitingApproval,
    conflictsPending,
    mattersAtRisk,
    pendingDocuments,
    aiHighRiskDocs,
    openInvoices,
    totalBilled: parseFloat(totalBilled?.toString() ?? "0"),
    ficaCompliantRate: parseFloat(ficaCompliantRate.toFixed(1)),
    ficaIssues,
    overdueTaskCount,
    unbilledHours: parseFloat(parseFloat(unbilledHoursRaw?.toString() ?? "0").toFixed(1)),
  });
});

router.get("/dashboard/recent-activity", async (req, res): Promise<void> => {
  const limit = parseInt((req.query.limit as string) ?? "20", 10);

  const logs = await db.select().from(auditLogsTable).orderBy(desc(auditLogsTable.createdAt)).limit(limit);

  const enriched = await Promise.all(logs.map(async (l) => {
    let userName: string | null = null;
    if (l.userId) {
      const [u] = await db.select().from(usersTable).where(eq(usersTable.id, l.userId));
      userName = u?.name ?? null;
    }
    return {
      id: l.id,
      type: l.action,
      description: l.details ?? `${l.action} on ${l.entityType}`,
      entityType: l.entityType,
      entityId: l.entityId,
      userName,
      occurredAt: l.createdAt,
    };
  }));

  res.json(enriched);
});

router.get("/dashboard/matter-pipeline", async (req, res): Promise<void> => {
  const statuses = ["lead", "conflict_check", "approved", "active", "review", "completed", "closed", "archived"];
  const labels: Record<string, string> = {
    lead: "Lead", conflict_check: "Conflict Check", approved: "Approved", active: "Active",
    review: "Review", completed: "Completed", closed: "Closed", archived: "Archived",
  };

  const counts = await db
    .select({ status: mattersTable.status, count: sql<number>`count(*)::int`, value: sql<number>`coalesce(sum(value::numeric), 0)` })
    .from(mattersTable)
    .groupBy(mattersTable.status);

  const countMap = new Map(counts.map((r) => [r.status, r]));

  const pipeline = statuses.map((s) => ({
    status: s,
    label: labels[s],
    count: countMap.get(s)?.count ?? 0,
    value: parseFloat((countMap.get(s)?.value ?? 0).toString()),
  }));

  res.json(pipeline);
});

router.get("/dashboard/fica-overview", async (req, res): Promise<void> => {
  const [{ compliant }] = await db.select({ compliant: sql<number>`count(*)::int` }).from(clientsTable).where(eq(clientsTable.ficaStatus, "compliant"));
  const [{ pending }]   = await db.select({ pending:   sql<number>`count(*)::int` }).from(clientsTable).where(eq(clientsTable.ficaStatus, "pending"));
  const [{ expired }]   = await db.select({ expired:   sql<number>`count(*)::int` }).from(clientsTable).where(eq(clientsTable.ficaStatus, "expired"));
  const [{ blocked }]   = await db.select({ blocked:   sql<number>`count(*)::int` }).from(clientsTable).where(eq(clientsTable.ficaStatus, "blocked"));
  const [{ total }]     = await db.select({ total:     sql<number>`count(*)::int` }).from(clientsTable);

  res.json({ compliant, pending, expired, blocked, total });
});

router.get("/dashboard/billing-summary", async (req, res): Promise<void> => {
  const [{ totalRevenue }] = await db.select({ totalRevenue: sql<number>`coalesce(sum(total::numeric), 0)` }).from(invoicesTable).where(eq(invoicesTable.status, "paid"));
  const [{ outstanding }]  = await db.select({ outstanding:  sql<number>`coalesce(sum(total::numeric), 0)` }).from(invoicesTable).where(eq(invoicesTable.status, "sent"));
  const [{ overdue }]      = await db.select({ overdue:      sql<number>`coalesce(sum(total::numeric), 0)` }).from(invoicesTable).where(eq(invoicesTable.status, "overdue"));
  const [{ paid }]         = await db.select({ paid:         sql<number>`coalesce(sum(total::numeric), 0)` }).from(invoicesTable).where(eq(invoicesTable.status, "paid"));

  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const paidInvoices = await db
    .select({ createdAt: invoicesTable.createdAt, total: invoicesTable.total })
    .from(invoicesTable)
    .where(and(eq(invoicesTable.status, "paid"), gte(invoicesTable.createdAt, sixMonthsAgo)));
  const trendByMonth = new Map<string, number>();
  for (const invoice of paidInvoices) {
    const key = `${invoice.createdAt.getFullYear()}-${String(invoice.createdAt.getMonth() + 1).padStart(2, "0")}`;
    trendByMonth.set(key, (trendByMonth.get(key) ?? 0) + parseFloat(invoice.total.toString()));
  }
  const monthlyTrend = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return {
      month: d.toLocaleString("en-ZA", { month: "short", year: "numeric" }),
      revenue: parseFloat((trendByMonth.get(key) ?? 0).toFixed(2)),
    };
  });

  res.json({
    totalRevenue: parseFloat(totalRevenue?.toString() ?? "0"),
    outstanding:  parseFloat(outstanding?.toString()  ?? "0"),
    overdue:      parseFloat(overdue?.toString()       ?? "0"),
    paid:         parseFloat(paid?.toString()           ?? "0"),
    monthlyTrend,
  });
});

router.get("/dashboard/workload", async (req, res): Promise<void> => {
  const monthStart = new Date().toISOString().slice(0, 7) + "-01";
  const [users, matterCounts, taskCounts, hours] = await Promise.all([
    db.select().from(usersTable),
    db.select({ userId: mattersTable.assignedToId, count: sql<number>`count(*)::int` }).from(mattersTable).groupBy(mattersTable.assignedToId),
    db.select({ userId: tasksTable.assignedToId, count: sql<number>`count(*)::int` })
      .from(tasksTable)
      .where(sql`${tasksTable.status} NOT IN ('completed', 'cancelled')`)
      .groupBy(tasksTable.assignedToId),
    db.select({ userId: timeEntriesTable.userId, total: sql<number>`coalesce(sum(${timeEntriesTable.hours}::numeric), 0)` })
      .from(timeEntriesTable)
      .where(gte(timeEntriesTable.entryDate, monthStart))
      .groupBy(timeEntriesTable.userId),
  ]);
  const matterCountByUser = new Map(matterCounts.filter((row) => row.userId != null).map((row) => [row.userId!, row.count]));
  const taskCountByUser = new Map(taskCounts.filter((row) => row.userId != null).map((row) => [row.userId!, row.count]));
  const hoursByUser = new Map(hours.filter((row) => row.userId != null).map((row) => [row.userId!, row.total]));
  const workload = users.map((u) => ({
    userId: u.id,
    userName: u.name,
    role: u.role,
    matterCount: matterCountByUser.get(u.id) ?? 0,
    taskCount: taskCountByUser.get(u.id) ?? 0,
    hoursThisMonth: parseFloat((hoursByUser.get(u.id) ?? 0).toString()),
  }));

  res.json(workload);
});

router.get("/dashboard/personal-work", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [[assignedMatters], [openTasks]] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` })
      .from(mattersTable)
      .where(and(
        eq(mattersTable.assignedToId, user.id),
        sql`${mattersTable.status} NOT IN ('completed', 'closed', 'archived')`,
      )),
    db.select({ count: sql<number>`count(*)::int` })
      .from(tasksTable)
      .where(and(
        eq(tasksTable.assignedToId, user.id),
        sql`${tasksTable.status} NOT IN ('completed', 'cancelled')`,
      )),
  ]);

  res.json({
    assignedMatters: assignedMatters?.count ?? 0,
    openTasks: openTasks?.count ?? 0,
    actionsLink: "/actions",
  });
});

export default router;
