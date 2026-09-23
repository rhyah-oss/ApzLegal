import { pagination } from "../lib/pagination";
import { Router, type IRouter } from "express";
import { db, timeEntriesTable, mattersTable, usersTable } from "@workspace/db";
import { eq, and, or, type SQL, sql } from "drizzle-orm";
import {
  CreateTimeEntryBody,
  UpdateTimeEntryBody,
  UpdateTimeEntryParams,
  DeleteTimeEntryParams,
  ListTimeEntriesQueryParams,
} from "@workspace/api-zod";
import { getCurrentUser, logAudit } from "../lib/context";

const router: IRouter = Router();

async function enrichEntry(e: typeof timeEntriesTable.$inferSelect) {
  const [matter] = await db.select().from(mattersTable).where(eq(mattersTable.id, e.matterId));
  let userName: string | null = null;
  if (e.userId) {
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, e.userId));
    userName = u?.name ?? null;
  }
  return {
    ...e,
    hours: parseFloat(e.hours as string),
    rate: parseFloat(e.rate as string),
    total: parseFloat(e.total as string),
    matterTitle: matter?.title ?? null,
    userName,
  };
}

router.get("/time-entries", async (req, res): Promise<void> => {
  const page = pagination(req, res);
  if (!page) return;
  const user = await getCurrentUser(req);
  const params = ListTimeEntriesQueryParams.safeParse(req.query);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const conditions: SQL[] = [];
  if (params.data.matterId) conditions.push(eq(timeEntriesTable.matterId, params.data.matterId));
  if (params.data.userId) conditions.push(eq(timeEntriesTable.userId, params.data.userId));
  if (params.data.billed !== undefined) conditions.push(eq(timeEntriesTable.billed, params.data.billed));
  if (params.data.startDate) conditions.push(sql`coalesce(${timeEntriesTable.entryDate}, (${timeEntriesTable.createdAt} AT TIME ZONE 'Africa/Johannesburg')::date) >= ${params.data.startDate}`);
  if (params.data.endDate) conditions.push(sql`coalesce(${timeEntriesTable.entryDate}, (${timeEntriesTable.createdAt} AT TIME ZONE 'Africa/Johannesburg')::date) <= ${params.data.endDate}`);
  if (params.data.clientId || params.data.practiceArea) {
    const matterConditions: SQL[] = [];
    if (params.data.clientId) matterConditions.push(eq(mattersTable.clientId, params.data.clientId));
    if (params.data.practiceArea === "Unspecified") {
      matterConditions.push(or(sql`trim(coalesce(${mattersTable.practiceArea}, '')) = ''`)!);
    } else if (params.data.practiceArea) {
      matterConditions.push(eq(mattersTable.practiceArea, params.data.practiceArea));
    }
    const matterIds = await db.select({ id: mattersTable.id }).from(mattersTable).where(and(...matterConditions));
    if (!matterIds.length) { res.json([]); return; }
    conditions.push(sql`${timeEntriesTable.matterId} IN (${sql.join(matterIds.map(({ id }) => sql`${id}`), sql`, `)})`);
  }
  if (user && ["candidate_attorney", "paralegal", "legal_secretary", "secretary"].includes(user.role)) conditions.push(eq(timeEntriesTable.userId, user.id));

  const entries = await db.select().from(timeEntriesTable).where(conditions.length ? and(...conditions) : undefined).orderBy(timeEntriesTable.createdAt, timeEntriesTable.id).limit(page.limit).offset(page.offset);
  const enriched = await Promise.all(entries.map(enrichEntry));
  res.json(enriched);
});

router.post("/time-entries", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  const parsed = CreateTimeEntryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const total = (parsed.data.hours * parsed.data.rate).toFixed(2);
  const { date, ...entryInput } = parsed.data;

  const [entry] = await db.insert(timeEntriesTable).values({
    ...entryInput,
    entryDate: date ? date.toISOString().slice(0, 10) : null,
    userId: user?.id,
    hours: parsed.data.hours.toString(),
    rate: parsed.data.rate.toString(),
    total,
  }).returning();
  await logAudit({ action: "time_entry_created", entityType: "time_entry", entityId: entry.id, userId: user?.id, details: `Time recorded for matter ${entry.matterId}.`, ipAddress: req.ip });

  res.status(201).json(await enrichEntry(entry));
});

router.patch("/time-entries/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  const params = UpdateTimeEntryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateTimeEntryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [ownedEntry] = await db.select().from(timeEntriesTable).where(eq(timeEntriesTable.id, params.data.id));
  if (ownedEntry && user && ["candidate_attorney", "paralegal", "legal_secretary", "secretary"].includes(user.role) && ownedEntry.userId !== user.id) {
    res.status(403).json({ error: "You may only update your own time entries.", code: "ASSIGNMENT_REQUIRED" }); return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.billed !== undefined) updateData.billed = parsed.data.billed;
  if (parsed.data.hours !== undefined) updateData.hours = parsed.data.hours.toString();
  if (parsed.data.rate !== undefined) updateData.rate = parsed.data.rate.toString();
  if (parsed.data.hours !== undefined || parsed.data.rate !== undefined) {
    const [entry] = await db.select().from(timeEntriesTable).where(eq(timeEntriesTable.id, params.data.id));
    if (entry) {
      const h = parsed.data.hours ?? parseFloat(entry.hours as string);
      const r = parsed.data.rate ?? parseFloat(entry.rate as string);
      updateData.total = (h * r).toFixed(2);
    }
  }

  const [entry] = await db.update(timeEntriesTable).set(updateData).where(eq(timeEntriesTable.id, params.data.id)).returning();
  if (!entry) { res.status(404).json({ error: "Time entry not found" }); return; }
  await logAudit({ action: "time_entry_updated", entityType: "time_entry", entityId: entry.id, userId: user?.id, details: "Time entry updated.", ipAddress: req.ip });

  res.json(await enrichEntry(entry));
});

router.delete("/time-entries/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  const params = DeleteTimeEntryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [ownedEntry] = await db.select().from(timeEntriesTable).where(eq(timeEntriesTable.id, params.data.id));
  if (ownedEntry && user && ["candidate_attorney", "paralegal", "legal_secretary", "secretary"].includes(user.role) && ownedEntry.userId !== user.id) {
    res.status(403).json({ error: "You may only delete your own time entries.", code: "ASSIGNMENT_REQUIRED" }); return;
  }

  const [entry] = await db.delete(timeEntriesTable).where(eq(timeEntriesTable.id, params.data.id)).returning();
  if (!entry) { res.status(404).json({ error: "Time entry not found" }); return; }
  await logAudit({ action: "time_entry_deleted", entityType: "time_entry", entityId: entry.id, userId: user?.id, details: "Time entry deleted.", ipAddress: req.ip });
  res.status(204).send();
});

export default router;
