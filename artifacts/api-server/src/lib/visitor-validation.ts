import { z } from "zod";
const optionalId = z.number().int().positive().nullable().optional();
const optionalText = z.string().max(2000).nullable().optional();
export const VisitorBody = z.object({
  name: z.string().trim().min(1).max(255),
  company: optionalText, contactInfo: optionalText, purpose: optionalText,
  status: z.enum(["expected", "checked_in", "with_attorney", "checked_out", "cancelled", "no_show"]).optional(),
  hostId: optionalId, assignedToId: optionalId, clientId: optionalId, matterId: optionalId, appointmentId: optionalId,
  expectedArrival: z.string().datetime({ offset: true }).transform(value => new Date(value)).nullable().optional(),
  expectedDeparture: z.string().datetime({ offset: true }).transform(value => new Date(value)).nullable().optional(),
}).strict();
