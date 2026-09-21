import { Router, type IRouter } from "express";
import { db, usersTable, notificationPreferencesTable, emailConnectionsTable } from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import crypto from "crypto";
import { getCurrentUser, logAudit } from "../lib/context";
import { s3Client } from "../lib/objectStorage";

const router: IRouter = Router();
const ADMIN_ROLES = new Set(["admin", "super_admin", "managing_partner"]);
const hashPassword = (password: string) => {
  const salt = crypto.randomBytes(16).toString("hex");
  return `scrypt$${salt}$${crypto.scryptSync(password, salt, 64).toString("hex")}`;
};
async function admin(req: any, res: any) {
  const user = await getCurrentUser(req);
  if (!user || !ADMIN_ROLES.has(user.role)) { res.status(403).json({ error: "Administrator access required" }); return null; }
  return user;
}

router.get("/admin/users", async (req, res): Promise<void> => {
  if (!(await admin(req, res))) return;
  const users = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    role: usersTable.role,
    accountStatus: usersTable.accountStatus,
    createdAt: usersTable.createdAt,
  }).from(usersTable).orderBy(asc(usersTable.name));
  res.json(users);
});

router.post("/admin/users", async (req, res): Promise<void> => {
  const current = await admin(req, res); if (!current) return;
  const { name, email, role, temporaryPassword } = req.body ?? {};
  if (!name?.trim() || !email?.trim() || !temporaryPassword || String(temporaryPassword).length < 10) {
    res.status(400).json({ error: "Name, email, role, and a temporary password of at least 10 characters are required." }); return;
  }
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, String(email).trim().toLowerCase()));
  if (existing) { res.status(409).json({ error: "A user with that email already exists." }); return; }
  const [user] = await db.insert(usersTable).values({ name: String(name).trim(), email: String(email).trim().toLowerCase(), role: role || "associate_attorney", passwordHash: hashPassword(String(temporaryPassword)) }).returning();
  await logAudit({ action: "user_invited", entityType: "user", entityId: user.id, entityTitle: user.name, userId: current.id, details: `Created ${user.role} account; provider email delivery is not configured.`, ipAddress: req.ip });
  res.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role, accountStatus: user.accountStatus });
});

router.patch("/admin/users/:id", async (req, res): Promise<void> => {
  const current = await admin(req, res); if (!current) return;
  const id = Number(req.params.id); if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid user id" }); return; }
  const role = typeof req.body?.role === "string" ? req.body.role : undefined;
  const accountStatus = typeof req.body?.accountStatus === "string" ? req.body.accountStatus : undefined;
  if (!role && !accountStatus) { res.status(400).json({ error: "role or accountStatus is required" }); return; }
  if (id === current.id && accountStatus === "inactive") { res.status(409).json({ error: "You cannot deactivate your own account." }); return; }
  const [user] = await db.update(usersTable).set({ ...(role ? { role } : {}), ...(accountStatus ? { accountStatus } : {}) }).where(eq(usersTable.id, id)).returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  await logAudit({ action: accountStatus === "inactive" ? "user_deactivated" : "user_role_changed", entityType: "user", entityId: user.id, entityTitle: user.name, userId: current.id, details: role ? `Role changed to ${role}.` : "Account deactivated.", ipAddress: req.ip });
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role, accountStatus: user.accountStatus });
});

router.get("/admin/connectors", async (req, res): Promise<void> => {
  if (!(await admin(req, res))) return;

  let storageStatus: "connected" | "not_connected" | "misconfigured" = "not_connected";
  if (process.env.PRIVATE_OBJECT_DIR && process.env.PUBLIC_OBJECT_SEARCH_PATHS) {
    try {
      await s3Client.send(new (await import("@aws-sdk/client-s3")).HeadBucketCommand({ Bucket: process.env.S3_BUCKET || "apz-legal-replit" }));
      storageStatus = "connected";
    } catch {
      storageStatus = "misconfigured";
    }
  } else {
    storageStatus = "misconfigured";
  }

  let emailStatus: "connected" | "not_connected" | "misconfigured" | "authentication_expired" = "not_connected";
  if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET && process.env.MICROSOFT_REDIRECT_URI) {
    try {
      const [microsoftConn] = await db.select().from(emailConnectionsTable).where(eq(emailConnectionsTable.provider, "microsoft")).limit(1);
      if (microsoftConn) {
        const expiresAt = microsoftConn.tokenExpiresAt ? new Date(microsoftConn.tokenExpiresAt) : new Date();
        emailStatus = microsoftConn.connectionStatus === "connected" && expiresAt > new Date() ? "connected" : "authentication_expired";
      }
    } catch {
      emailStatus = "misconfigured";
    }
  } else {
    emailStatus = "not_connected";
  }
  const signingStatus = process.env.SIGNING_PROVIDER_URL ? "connected" : "not_connected";
  const legalResearchStatus = "not_connected";

  res.json([
    { id: "app-storage", name: "Private App Storage", status: storageStatus, providerDependent: false },
    { id: "email", name: "Microsoft 365 / Email", status: emailStatus, providerDependent: true },
    { id: "signing", name: "Digital Signing", status: signingStatus, providerDependent: true },
    { id: "legal-research", name: "External Legal Research", status: legalResearchStatus, providerDependent: true, note: "SAFLII/legislation integrations are Phase 1D — results are AI-assisted only" },
  ]);
});

router.post("/admin/connectors/:id/connect", async (req, res): Promise<void> => {
  const current = await admin(req, res); if (!current) return;
  if (req.params.id !== "app-storage") {
    res.status(409).json({ error: "This connector requires an external provider integration.", code: "PROVIDER_REQUIRED" });
    return;
  }
  let storageStatus: "connected" | "not_connected" | "misconfigured" = "not_connected";
  if (process.env.PRIVATE_OBJECT_DIR && process.env.PUBLIC_OBJECT_SEARCH_PATHS) {
    try {
      await s3Client.send(new (await import("@aws-sdk/client-s3")).HeadBucketCommand({ Bucket: process.env.S3_BUCKET || "apz-legal-replit" }));
      storageStatus = "connected";
    } catch {
      storageStatus = "misconfigured";
    }
  } else {
    storageStatus = "misconfigured";
  }
  await logAudit({ action: "connector_checked", entityType: "connector", entityId: 0, userId: current.id, details: `Private App Storage readiness check: ${storageStatus}.`, ipAddress: req.ip });
  res.json({ id: "app-storage", status: storageStatus });
});

export default router;