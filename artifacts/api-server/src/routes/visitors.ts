import { Router, type IRouter } from "express";
import { db, visitorsTable, usersTable, clientsTable, mattersTable, appointmentsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

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
  const { date, status } = req.query as { date?: string; status?: string };
  let rows = await db.select().from(visitorsTable).orderBy(visitorsTable.expectedArrival);
  if (date) {
    const start = new Date(date + "T00:00:00Z");
    const end   = new Date(date + "T23:59:59Z");
    rows = rows.filter(r => {
      if (!r.expectedArrival) return false;
      const t = new Date(r.expectedArrival);
      return t >= start && t <= end;
    });
  }
  if (status) rows = rows.filter(r => r.status === status);
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
  const { name, company, contactInfo, purpose, status,
          hostId, assignedToId, clientId, matterId, appointmentId,
          expectedArrival, expectedDeparture } = req.body;
  if (!name) { res.status(400).json({ error: "name is required" }); return; }
  const [row] = await db.insert(visitorsTable).values({
    name, company, contactInfo, purpose,
    status: status ?? "expected",
    hostId: hostId ?? null, assignedToId: assignedToId ?? null,
    clientId: clientId ?? null, matterId: matterId ?? null,
    appointmentId: appointmentId ?? null,
    expectedArrival: expectedArrival ? new Date(expectedArrival) : null,
    expectedDeparture: expectedDeparture ? new Date(expectedDeparture) : null,
  }).returning();
  res.status(201).json(await enrichVisitor(row));
});

// PUT /api/visitors/:id
router.put("/visitors/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const updates: Partial<typeof visitorsTable.$inferInsert & { checkedInAt?: Date; checkedOutAt?: Date }> = { ...req.body };

  // Auto-stamp check-in / check-out times
  if (req.body.status === "checked_in" && !req.body.checkedInAt)   updates.checkedInAt  = new Date();
  if (req.body.status === "checked_out" && !req.body.checkedOutAt) updates.checkedOutAt = new Date();
  if (req.body.expectedArrival)   updates.expectedArrival   = new Date(req.body.expectedArrival);
  if (req.body.expectedDeparture) updates.expectedDeparture = new Date(req.body.expectedDeparture);

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
