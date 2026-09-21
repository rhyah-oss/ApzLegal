import type { NextFunction, Request, Response } from "express";
import { db, sessionsTable, usersTable, auditLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

export interface CurrentUser {
  id: number;
  name: string;
  email: string;
  role: string;
  accountStatus?: string;
}

const STAFF_ROLES = new Set([
  "admin", "super_admin", "managing_partner", "partner", "associate_attorney",
  "candidate_attorney", "paralegal", "secretary", "compliance_officer", "billing_officer",
]);

export function sessionTokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Resolve the authenticated user from the session cookie / bearer token. */
export async function getCurrentUser(req: Request): Promise<CurrentUser | null> {
  const token =
    req.cookies?.auth_token || req.headers.authorization?.replace("Bearer ", "");
  if (!token) return null;
  const hashedToken = sessionTokenHash(token);

  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.token, hashedToken));
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await db.delete(sessionsTable).where(eq(sessionsTable.id, session.id));
    return null;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, session.userId));
  if (!user) return null;
  if (user.accountStatus === "inactive") return null;

  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

/**
 * All staff APIs are authenticated by default. Route-level policies remain
 * responsible for elevated decisions such as partner approvals.
 */
export async function requireStaffSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = await getCurrentUser(req);
  if (!user) {
    res.status(401).json({ error: "Not authenticated", code: "AUTH_REQUIRED" });
    return;
  }
  if (!STAFF_ROLES.has(user.role)) {
    res.status(403).json({ error: "This account is not permitted to access the staff workspace.", code: "STAFF_ACCESS_REQUIRED" });
    return;
  }
  next();
}

/** Append an entry to the immutable audit trail. */
export async function logAudit(entry: {
  action: string;
  entityType: string;
  entityId: number;
  entityTitle?: string | null;
  userId?: number | null;
  details?: string | null;
  ipAddress?: string | null;
}): Promise<void> {
  await db.insert(auditLogsTable).values({
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    entityTitle: entry.entityTitle ?? undefined,
    userId: entry.userId ?? undefined,
    details: entry.details ?? undefined,
    ipAddress: entry.ipAddress ?? undefined,
  });
}
