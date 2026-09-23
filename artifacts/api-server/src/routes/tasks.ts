import { pagination } from "../lib/pagination";
import { Router, type IRouter } from "express";
import { db, tasksTable, usersTable, mattersTable } from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { getCurrentUser, logAudit } from "../lib/context";
import { CreateTaskBody, TaskMatterId } from "../lib/task-validation";
import {
  AddMatterTaskBody,
  UpdateMatterTaskBody,
  ListMatterTasksParams,
  AddMatterTaskParams,
  UpdateMatterTaskParams,
  DeleteMatterTaskParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function enrichGlobalTask(t: typeof tasksTable.$inferSelect) {
  const [matter] = await db.select().from(mattersTable).where(eq(mattersTable.id, t.matterId));
  const enriched = await enrichTask(t);
  return {
    ...enriched,
    matterReference: matter?.reference ?? null,
    matterTitle: matter?.title ?? null,
  };
}

// Global work queue. Matter-level task routes remain the canonical CRUD
// implementation; these endpoints only provide the cross-matter projection.
router.get("/tasks", async (req, res): Promise<void> => {
  const page = pagination(req, res);
  if (!page) return;
  const user = await getCurrentUser(req);
  const conditions = [];
  if (typeof req.query.status === "string") conditions.push(eq(tasksTable.status, req.query.status));
  if (typeof req.query.priority === "string") conditions.push(eq(tasksTable.priority, req.query.priority));
  if (user && ["candidate_attorney", "paralegal", "secretary"].includes(user.role)) conditions.push(eq(tasksTable.assignedToId, user.id));
  const rows = await db.select({ task: tasksTable, matterReference: mattersTable.reference, matterTitle: mattersTable.title, assignedToName: usersTable.name })
    .from(tasksTable).leftJoin(mattersTable, eq(mattersTable.id, tasksTable.matterId))
    .leftJoin(usersTable, eq(usersTable.id, tasksTable.assignedToId))
    .where(and(...conditions)).orderBy(desc(tasksTable.createdAt), tasksTable.id).limit(page.limit).offset(page.offset);
  res.json(rows.map(({ task, ...names }) => ({ ...task, ...names })));

});

router.post("/tasks", async (req, res): Promise<void> => {
  const parsed = CreateTaskBody.extend({ matterId: TaskMatterId }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid task payload" }); return; }
  const [task] = await db.insert(tasksTable).values(parsed.data).returning();
  const user = await getCurrentUser(req);
  await logAudit({ action: "task_created", entityType: "task", entityId: task.id, entityTitle: task.title, userId: user?.id, details: "Created from global task queue", ipAddress: req.ip });
  res.status(201).json(await enrichGlobalTask(task));
});

router.patch("/tasks/:id", async (req, res): Promise<void> => {
  const current = await getCurrentUser(req);
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid task id" }); return; }
  const allowed = ["title", "description", "status", "priority", "dueDate", "assignedToId"] as const;
  const values = Object.fromEntries(Object.entries(req.body ?? {}).filter(([key]) => allowed.includes(key as typeof allowed[number])));
  if (Object.keys(values).length === 0) { res.status(400).json({ error: "No task changes supplied" }); return; }
  const [existing] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
  if (!existing) { res.status(404).json({ error: "Task not found" }); return; }
  if (current && ["candidate_attorney", "paralegal", "secretary"].includes(current.role) && existing.assignedToId !== current.id) {
    res.status(403).json({ error: "You may only update tasks assigned to you.", code: "ASSIGNMENT_REQUIRED" }); return;
  }
  const [task] = await db.update(tasksTable).set(values).where(eq(tasksTable.id, id)).returning();
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  const user = await getCurrentUser(req);
  await logAudit({ action: "task_updated", entityType: "task", entityId: task.id, entityTitle: task.title, userId: user?.id, details: "Updated from global task queue", ipAddress: req.ip });
  res.json(await enrichGlobalTask(task));
});

async function enrichTask(t: typeof tasksTable.$inferSelect) {
  let assignedToName: string | null = null;
  if (t.assignedToId) {
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, t.assignedToId));
    assignedToName = u?.name ?? null;
  }
  return { ...t, assignedToName };
}

router.get("/matters/:matterId/tasks", async (req, res): Promise<void> => {
  const page = pagination(req, res);
  if (!page) return;
  const user = await getCurrentUser(req);
  const params = ListMatterTasksParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid matterId" }); return; }

  const conditions = [eq(tasksTable.matterId, params.data.matterId)];
  if (user && ["candidate_attorney", "paralegal", "secretary"].includes(user.role)) conditions.push(eq(tasksTable.assignedToId, user.id));
  const tasks = await db.select().from(tasksTable).where(and(...conditions)).orderBy(tasksTable.createdAt, tasksTable.id).limit(page.limit).offset(page.offset);
  const assignedIds = tasks.map((task) => task.assignedToId).filter((id): id is number => id != null);
  const assigned = assignedIds.length ? await db.select().from(usersTable).where(inArray(usersTable.id, assignedIds)) : [];
  const enriched = tasks.map((task) => ({ ...task, assignedToName: assigned.find((u) => u.id === task.assignedToId)?.name ?? null }));
  res.json(enriched);
});

router.post("/matters/:matterId/tasks", async (req, res): Promise<void> => {
  const params = AddMatterTaskParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid matterId" }); return; }

  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [task] = await db.insert(tasksTable).values({ ...parsed.data, matterId: params.data.matterId }).returning();
  const user = await getCurrentUser(req);
  await logAudit({ action: "task_created", entityType: "task", entityId: task.id, entityTitle: task.title, userId: user?.id, details: `Created for matter ${params.data.matterId}.`, ipAddress: req.ip });
  res.status(201).json(await enrichTask(task));
});

router.patch("/matters/:matterId/tasks/:id", async (req, res): Promise<void> => {
  const params = UpdateMatterTaskParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid params" }); return; }

  const parsed = UpdateMatterTaskBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const current = await getCurrentUser(req);
  const [existing] = await db.select().from(tasksTable).where(and(
    eq(tasksTable.id, params.data.id), eq(tasksTable.matterId, params.data.matterId),
  ));
  if (!existing) { res.status(404).json({ error: "Task not found" }); return; }
  if (current && ["candidate_attorney", "paralegal", "secretary"].includes(current.role) && existing.assignedToId !== current.id) {
    res.status(403).json({ error: "You may only change tasks assigned to you.", code: "ASSIGNMENT_REQUIRED" }); return;
  }
  const [task] = await db.update(tasksTable).set(parsed.data).where(and(eq(tasksTable.matterId, params.data.matterId), eq(tasksTable.id, params.data.id))).returning();
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  const user = await getCurrentUser(req);
  await logAudit({ action: "task_updated", entityType: "task", entityId: task.id, entityTitle: task.title, userId: user?.id, details: `Updated for matter ${params.data.matterId}.`, ipAddress: req.ip });

  res.json(await enrichTask(task));
});

router.delete("/matters/:matterId/tasks/:id", async (req, res): Promise<void> => {
  const params = DeleteMatterTaskParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid params" }); return; }

  const current = await getCurrentUser(req);
  const [existing] = await db.select().from(tasksTable).where(and(
    eq(tasksTable.id, params.data.id), eq(tasksTable.matterId, params.data.matterId),
  ));
  if (!existing) { res.status(404).json({ error: "Task not found" }); return; }
  if (current && ["candidate_attorney", "paralegal", "secretary"].includes(current.role) && existing.assignedToId !== current.id) {
    res.status(403).json({ error: "You may only change tasks assigned to you.", code: "ASSIGNMENT_REQUIRED" }); return;
  }
  const [task] = await db.delete(tasksTable).where(and(eq(tasksTable.matterId, params.data.matterId), eq(tasksTable.id, params.data.id))).returning();
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  const user = await getCurrentUser(req);
  await logAudit({ action: "task_deleted", entityType: "task", entityId: task.id, entityTitle: task.title, userId: user?.id, details: `Deleted from matter ${params.data.matterId}.`, ipAddress: req.ip });
  res.status(204).send();
});

export default router;
