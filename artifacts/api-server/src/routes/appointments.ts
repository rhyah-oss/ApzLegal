import { Router, type IRouter } from "express";
import { db, appointmentsTable, visitorsTable, usersTable, clientsTable, mattersTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { getCurrentUser, logAudit } from "../lib/context";

const router: IRouter = Router();

async function enrichAppointment(a: typeof appointmentsTable.$inferSelect) {
  let assignedToName: string | null = null;
  let createdByName: string | null = null;
  let clientName: string | null = null;
  let matterTitle: string | null = null;
  let matterReference: string | null = null;

  if (a.assignedToId) {
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, a.assignedToId));
    assignedToName = u?.name ?? null;
  }
  if (a.createdById) {
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, a.createdById));
    createdByName = u?.name ?? null;
  }
  if (a.clientId) {
    const [c] = await db.select().from(clientsTable).where(eq(clientsTable.id, a.clientId));
    clientName = c?.name ?? null;
  }
  if (a.matterId) {
    const [m] = await db.select().from(mattersTable).where(eq(mattersTable.id, a.matterId));
    matterTitle = m?.title ?? null;
    matterReference = m?.reference ?? null;
  }

  return { ...a, assignedToName, createdByName, clientName, matterTitle, matterReference };
}

// GET /api/appointments — list, optionally filtered by date
router.get("/appointments", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  const { date, status } = req.query as { date?: string; status?: string };
  let rows = await db.select().from(appointmentsTable).orderBy(appointmentsTable.date, appointmentsTable.startTime);
  if (user && ["candidate_attorney", "paralegal", "secretary"].includes(user.role)) rows = rows.filter(row => row.assignedToId === user.id || row.createdById === user.id);
  if (date) rows = rows.filter(r => r.date === date);
  if (status) rows = rows.filter(r => r.status === status);
  const enriched = await Promise.all(rows.map(enrichAppointment));
  res.json(enriched);
});

// GET /api/appointments/today
router.get("/appointments/today", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  const today = new Date().toISOString().split("T")[0];
  const rows = await db.select().from(appointmentsTable)
    .where(eq(appointmentsTable.date, today))
    .orderBy(appointmentsTable.startTime);
  const enriched = await Promise.all(rows.filter(row => !user || !["candidate_attorney", "paralegal", "secretary"].includes(user.role) || row.assignedToId === user.id || row.createdById === user.id).map(enrichAppointment));
  res.json(enriched);
});

// GET /api/appointments/upcoming
router.get("/appointments/upcoming", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  const today = new Date().toISOString().split("T")[0];
  const rows = await db.select().from(appointmentsTable)
    .where(sql`date >= ${today}`)
    .orderBy(appointmentsTable.date, appointmentsTable.startTime);
  res.json(await Promise.all(rows.filter(row => !user || !["candidate_attorney", "paralegal", "secretary"].includes(user.role) || row.assignedToId === user.id || row.createdById === user.id).map(enrichAppointment)));
});

// GET /api/appointments/:id
router.get("/appointments/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(appointmentsTable).where(eq(appointmentsTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const user = await getCurrentUser(req);
  if (user && ["candidate_attorney", "paralegal", "secretary"].includes(user.role) && row.assignedToId !== user.id && row.createdById !== user.id) {
    res.status(404).json({ error: "Not found" }); return;
  }
  res.json(await enrichAppointment(row));
});

// POST /api/appointments
router.post("/appointments", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const { title, type, status, date, startTime, endTime, durationMinutes,
          location, virtualMeetingUrl, notes, externalAttendees,
          clientId, matterId, assignedToId, createdById } = req.body;
  if (!title || !date || !startTime) {
    res.status(400).json({ error: "title, date, and startTime are required" }); return;
  }
  const [row] = await db.insert(appointmentsTable).values({
    title, type: type ?? "consultation", status: status ?? "scheduled",
    date, startTime, endTime, durationMinutes,
    location, virtualMeetingUrl, notes,
    externalAttendees: externalAttendees ?? [],
    clientId: clientId ?? null, matterId: matterId ?? null,
    assignedToId: assignedToId ?? user.id, createdById: user.id,
  }).returning();
  await logAudit({ action: "appointment_created", entityType: "appointment", entityId: row.id, entityTitle: row.title, userId: user?.id, details: `Appointment scheduled for ${row.date}.`, ipAddress: req.ip });
  res.status(201).json(await enrichAppointment(row));
});

// PUT /api/appointments/:id
router.put("/appointments/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [existing] = await db.select().from(appointmentsTable).where(eq(appointmentsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (user && ["candidate_attorney", "paralegal", "secretary"].includes(user.role) && existing.assignedToId !== user.id && existing.createdById !== user.id) {
    res.status(403).json({ error: "You may only update your own appointments.", code: "ASSIGNMENT_REQUIRED" }); return;
  }
  const { title, type, status, date, startTime, endTime, durationMinutes,
          location, virtualMeetingUrl, notes, externalAttendees,
          clientId, matterId, assignedToId } = req.body;
  const [row] = await db.update(appointmentsTable)
    .set({ title, type, status, date, startTime, endTime, durationMinutes,
           location, virtualMeetingUrl, notes, externalAttendees,
           clientId, matterId, assignedToId })
    .where(eq(appointmentsTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  await logAudit({ action: "appointment_updated", entityType: "appointment", entityId: row.id, entityTitle: row.title, userId: user?.id, details: "Appointment updated.", ipAddress: req.ip });
  res.json(await enrichAppointment(row));
});

// DELETE /api/appointments/:id
router.delete("/appointments/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [existing] = await db.select().from(appointmentsTable).where(eq(appointmentsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (user && ["candidate_attorney", "paralegal", "secretary"].includes(user.role) && existing.assignedToId !== user.id && existing.createdById !== user.id) {
    res.status(403).json({ error: "You may only delete your own appointments.", code: "ASSIGNMENT_REQUIRED" }); return;
  }
  const [row] = await db.delete(appointmentsTable).where(eq(appointmentsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  await logAudit({ action: "appointment_deleted", entityType: "appointment", entityId: row.id, entityTitle: row.title, userId: user?.id, details: "Appointment deleted.", ipAddress: req.ip });
  res.status(204).send();
});

export default router;
