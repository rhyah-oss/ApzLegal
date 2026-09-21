import { db, mattersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// ── Matter lifecycle ─────────────────────────────────────────────────────────
// lead → conflict_check → approved → active → review → completed → closed → archived
// Single source of truth for every status write, whether user-initiated
// (PATCH /matters/:id/status) or system-driven (conflict scan/review).
export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  lead:           ["conflict_check"],
  conflict_check: ["approved", "lead"],
  approved:       ["active", "conflict_check"],
  active:         ["review", "conflict_check"],
  review:         ["completed", "active"],
  completed:      ["closed"],
  closed:         ["archived"],
  archived:       [],
};

export type TransitionCheck =
  | { ok: true }
  | { ok: false; code: "INVALID_TRANSITION" | "COMPLIANCE_BLOCKED"; error: string };

export function checkTransition(
  matter: { status: string; riskLevel: string },
  targetStatus: string,
): TransitionCheck {
  if (targetStatus === matter.status) return { ok: true };
  const allowed = ALLOWED_TRANSITIONS[matter.status] ?? [];
  if (!allowed.includes(targetStatus)) {
    return {
      ok: false,
      code: "INVALID_TRANSITION",
      error: `Invalid lifecycle transition: a matter in "${matter.status}" can only move to ${allowed.length ? allowed.map((s) => `"${s}"`).join(" or ") : "no further status"}.`,
    };
  }
  if (matter.riskLevel === "compliance_blocked") {
    return {
      ok: false,
      code: "COMPLIANCE_BLOCKED",
      error: "Compliance blocked: this matter's compliance block must be resolved before its status can change.",
    };
  }
  return { ok: true };
}

/**
 * System-driven transition (conflict scan/review side effects). Applies the
 * same lifecycle + compliance rules as the user-facing status route; returns
 * false (without writing) when the transition is not permitted.
 */
export async function tryTransitionMatter(
  matter: { id: number; status: string; riskLevel: string },
  targetStatus: string,
  extra: Partial<typeof mattersTable.$inferInsert> = {},
): Promise<boolean> {
  const check = checkTransition(matter, targetStatus);
  if (!check.ok) return false;
  await db.update(mattersTable).set({ status: targetStatus, ...extra }).where(eq(mattersTable.id, matter.id));
  return true;
}
