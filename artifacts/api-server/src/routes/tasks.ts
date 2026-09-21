import { Router, type IRouter } from "express";
import { db, tasksTable, usersTable, mattersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { getCurrentUser, logAudit } from "../lib/context";
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
  const user = await getCurrentUser(req);
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const priority = typeof req.query.priority === "string" ? req.query.priority : undefined;
  const rows = await db.select().from(tasksTable).orderBy(desc(tasksTable.createdAt));
  const restricted = user && ["candidate_attorney", "paralegal", "secretary"].includes(user.role);
  const filtered = rows.filter((task) =>
    (!restricted || task.assignedToId === user?.id) &&
    (!status || task.status === status) && (!priority || task.priority === priority),
  );
  res.json(await Promise.all(filtered.map(enrichGlobalTask)));
});

router.post("/tasks", async (req, res): Promise<void> => {
  const { matterId, title, description, status, priority, dueDate, assignedToId } = req.body ?? {};
  if (!Number.isInteger(Number(matterId)) || !title?.trim()) {
    res.status(400).json({ error: "matterId and title are required" });
    return;
  }
  const [task] = await db.insert(tasksTable).values({
    matterId: Number(matterId),
    title: String(title).trim(),
    description: description || undefined,
    status: status ?? "pending",
    priority: priority ?? "medium",
    dueDate: dueDate || undefined,
    assignedToId: assignedToId ? Number(assignedToId) : undefined,
  }).returning();
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
  const user = await getCurrentUser(req);
  const params = ListMatterTasksParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid matterId" }); return; }

  const allTasks = await db.select().from(tasksTable).where(eq(tasksTable.matterId, params.data.matterId)).orderBy(tasksTable.createdAt);
  const tasks = user && ["candidate_attorney", "paralegal", "secretary"].includes(user.role)
    ? allTasks.filter(task => task.assignedToId === user.id) : allTasks;
  const enriched = await Promise.all(tasks.map(enrichTask));
  res.json(enriched);
});

router.post("/matters/:matterId/tasks", async (req, res): Promise<void> => {
  const params = AddMatterTaskParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid matterId" }); return; }

  const parsed = AddMatterTaskBody.safeParse(req.body);
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

  const [task] = await db.update(tasksTable).set(parsed.data).where(and(eq(tasksTable.matterId, params.data.matterId), eq(tasksTable.id, params.data.id))).returning();
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  const user = await getCurrentUser(req);
  await logAudit({ action: "task_updated", entityType: "task", entityId: task.id, entityTitle: task.title, userId: user?.id, details: `Updated for matter ${params.data.matterId}.`, ipAddress: req.ip });

  res.json(await enrichTask(task));
});

router.delete("/matters/:matterId/tasks/:id", async (req, res): Promise<void> => {
  const params = DeleteMatterTaskParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid params" }); return; }

  const [task] = await db.delete(tasksTable).where(and(eq(tasksTable.matterId, params.data.matterId), eq(tasksTable.id, params.data.id))).returning();
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  const user = await getCurrentUser(req);
  await logAudit({ action: "task_deleted", entityType: "task", entityId: task.id, entityTitle: task.title, userId: user?.id, details: `Deleted from matter ${params.data.matterId}.`, ipAddress: req.ip });
  res.status(204).send();
});

export default router;
