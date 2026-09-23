import { pagination } from "../lib/pagination";
import { Router, type IRouter } from "express";
import { db, visitorsTable, usersTable, clientsTable, mattersTable, appointmentsTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";

import { VisitorBody } from "../lib/visitor-validation";

const router: IRouter = Router();

async function enrichVisitor(v: typeof visitorsTable.$inferSelect) {
  let hostName: string | null = null;
  let clientName: string | null = null;
  let matterTitle: string | null = null;
  let matterReference: string | null = null;

  if (v.hostId) {
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, v.hostId));
    hostName = u?.name ?? null;
  }
  if (v.clientId) {
    const [c] = await db.select().from(clientsTable).where(eq(clientsTable.id, v.clientId));
    clientName = c?.name ?? null;
  }
  if (v.matterId) {
    const [m] = await db.select().from(mattersTable).where(eq(mattersTable.id, v.matterId));
    matterTitle = m?.title ?? null;
    matterReference = m?.reference ?? null;
  }

  return { ...v, hostName, clientName, matterTitle, matterReference };
}

// GET /api/visitors — all visitors, optionally filtered by date
router.get("/visitors", async (req, res): Promise<void> => {
  const page = pagination(req, res);
  if (!page) return;
  const conditions = [];
  if (typeof req.query.date === "string") {
    const date = req.query.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) { res.status(400).json({ error: "Invalid date" }); return; }
    conditions.push(sql`${visitorsTable.expectedArrival} >= ${date + "T00:00:00Z"} AND ${visitorsTable.expectedArrival} < ${new Date(Date.parse(date) + 86400000).toISOString()}`);
  }
  if (typeof req.query.status === "string") conditions.push(eq(visitorsTable.status, req.query.status));
  const rows = await db.select().from(visitorsTable).where(and(...conditions))
    .orderBy(visitorsTable.expectedArrival, visitorsTable.id).limit(page.limit).offset(page.offset);
  res.json(await Promise.all(rows.map(enrichVisitor)));

});

// GET /api/visitors/today
router.get("/visitors/today", async (req, res): Promise<void> => {
  const now   = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString();
  const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();
  const rows  = await db.select().from(visitorsTable)
    .where(sql`expected_arrival >= ${start} AND expected_arrival <= ${end}`)
    .orderBy(visitorsTable.expectedArrival);
  res.json(await Promise.all(rows.map(enrichVisitor)));
});

// GET /api/visitors/:id
router.get("/visitors/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(visitorsTable).where(eq(visitorsTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(await enrichVisitor(row));
});

// POST /api/visitors
router.post("/visitors", async (req, res): Promise<void> => {
  const parsed = VisitorBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid visitor payload" }); return; }
  const [row] = await db.insert(visitorsTable).values(parsed.data).returning();
  res.status(201).json(await enrichVisitor(row));
});

// PUT /api/visitors/:id
router.put("/visitors/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = VisitorBody.partial().refine(value => Object.keys(value).length > 0).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid visitor update" }); return; }
  const updates: Partial<typeof visitorsTable.$inferInsert> = parsed.data;
  if (updates.status === "checked_in") updates.checkedInAt = new Date();
  if (updates.status === "checked_out") updates.checkedOutAt = new Date();

  const [row] = await db.update(visitorsTable).set(updates).where(eq(visitorsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(await enrichVisitor(row));
});

// DELETE /api/visitors/:id
router.delete("/visitors/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(visitorsTable).where(eq(visitorsTable.id, id));
  res.status(204).send();
});

export default router;
