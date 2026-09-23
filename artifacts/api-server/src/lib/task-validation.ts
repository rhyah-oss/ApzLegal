import { z } from "zod";
import { AddMatterTaskBody } from "@workspace/api-zod";

const optionalDate = z.preprocess((value) => value === "" || value == null ? undefined : value,
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dueDate must be a calendar date")
    .refine((value) => { const date = new Date(`${value}T00:00:00Z`); return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value; }, "dueDate must be a calendar date")
    .optional());
const optionalAssignee = z.preprocess((value) => value === "" || value == null ? undefined : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value,
  z.number().int().positive().safe().optional());

/** Creation validation shared by the global and matter-scoped task routes. */
export const CreateTaskBody = AddMatterTaskBody.extend({
  title: z.string().trim().min(1, "title is required"),
  status: z.enum(["pending", "in_progress", "completed", "cancelled"]).default("pending"),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  dueDate: optionalDate,
  assignedToId: optionalAssignee,
});

export const TaskMatterId = z.preprocess((value) => typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value,
  z.number().int().positive());
