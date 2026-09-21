import type { Request, Response } from "express";
import { getCurrentUser, type CurrentUser } from "./context";

/**
 * Phase 1 staff roles. `admin` remains supported for existing accounts and is
 * treated as equivalent to the new super-administrator role.
 */
export const PARTNER_ROLES = ["partner", "managing_partner", "admin", "super_admin"] as const;
export const COMPLIANCE_ROLES = ["compliance_officer", ...PARTNER_ROLES] as const;
export const BILLING_ROLES = ["billing_officer", ...PARTNER_ROLES] as const;
export const LEGAL_AUTHOR_ROLES = [
  "associate_attorney",
  "candidate_attorney",
  "partner",
  "managing_partner",
  "admin",
  "super_admin",
] as const;
export const AI_AUTHOR_ROLES = [
  "associate_attorney",
  "partner",
  "managing_partner",
  "admin",
  "super_admin",
] as const;

export function hasRole(user: CurrentUser, roles: readonly string[]): boolean {
  return roles.includes(user.role);
}

/** Use for elevated workflow decisions after the API-wide staff-auth guard. */
export async function requireRole(
  req: Request,
  res: Response,
  roles: readonly string[],
  message = "You do not have permission to perform this action.",
): Promise<CurrentUser | null> {
  const user = await getCurrentUser(req);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }
  if (!hasRole(user, roles)) {
    res.status(403).json({ error: message, code: "ROLE_REQUIRED" });
    return null;
  }
  return user;
}