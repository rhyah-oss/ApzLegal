import { Router, type IRouter } from "express";
import { db, usersTable, sessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { LoginBody } from "@workspace/api-zod";
import crypto from "crypto";
import { getCurrentUser, logAudit, sessionTokenHash } from "../lib/context";

const router: IRouter = Router();

function legacyHashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "apz_legal_salt").digest("hex");
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derivedKey}`;
}

function verifyPassword(password: string, storedHash: string): { valid: boolean; legacy: boolean } {
  const [algorithm, salt, expected] = storedHash.split("$");
  if (algorithm === "scrypt" && salt && expected) {
    const actual = crypto.scryptSync(password, salt, 64).toString("hex");
    const expectedBuffer = Buffer.from(expected, "hex");
    const actualBuffer = Buffer.from(actual, "hex");
    return {
      valid: expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer),
      legacy: false,
    };
  }

  const actual = legacyHashPassword(password);
  const expectedBuffer = Buffer.from(storedHash, "hex");
  const actualBuffer = Buffer.from(actual, "hex");
  return {
    valid: expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer),
    legacy: true,
  };
}

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

const failedAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function loginAttemptKey(req: { ip?: string }, email: string): string {
  return `${req.ip ?? "unknown"}:${email.toLowerCase()}`;
}

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;
  const attemptKey = loginAttemptKey(req, email);
  const prior = failedAttempts.get(attemptKey);
  if (prior && prior.resetAt > Date.now() && prior.count >= MAX_LOGIN_ATTEMPTS) {
    res.status(429).json({ error: "Too many failed login attempts. Please try again later.", code: "LOGIN_RATE_LIMITED" });
    return;
  }
  if (prior && prior.resetAt <= Date.now()) failedAttempts.delete(attemptKey);

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  const passwordCheck = user ? verifyPassword(password, user.passwordHash) : { valid: false, legacy: false };

  if (!user || !passwordCheck.valid) {
    const existing = failedAttempts.get(attemptKey);
    failedAttempts.set(attemptKey, {
      count: (existing?.count ?? 0) + 1,
      resetAt: existing?.resetAt && existing.resetAt > Date.now() ? existing.resetAt : Date.now() + LOGIN_WINDOW_MS,
    });
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  failedAttempts.delete(attemptKey);

  // Existing accounts are upgraded after their first successful sign-in, so
  // strengthening password storage never strands a legitimate staff account.
  if (passwordCheck.legacy) {
    await db.update(usersTable).set({ passwordHash: hashPassword(password) }).where(eq(usersTable.id, user.id));
  }
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await db.insert(sessionsTable).values({ userId: user.id, token: sessionTokenHash(token), expiresAt });

  res.cookie("auth_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
    },
  });
  await logAudit({
    action: "user_logged_in",
    entityType: "user",
    entityId: user.id,
    entityTitle: user.name,
    userId: user.id,
    details: "Staff session created",
    ipAddress: req.ip,
  });
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  const token = req.cookies?.auth_token;
  if (token) {
    await db.delete(sessionsTable).where(eq(sessionsTable.token, sessionTokenHash(token)));
    res.clearCookie("auth_token");
  }
  res.json({ ok: true });
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const token = req.cookies?.auth_token || req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.token, sessionTokenHash(token)));
  if (!session || session.expiresAt < new Date()) {
    res.status(401).json({ error: "Session expired" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.userId));
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
  });
});

router.patch("/auth/profile", async (req, res): Promise<void> => {
  const current = await getCurrentUser(req);
  if (!current) { res.status(401).json({ error: "Not authenticated" }); return; }
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!name || !email || !email.includes("@")) { res.status(400).json({ error: "A valid name and email are required." }); return; }
  const [user] = await db.update(usersTable).set({ name, email }).where(eq(usersTable.id, current.id)).returning();
  await logAudit({ action: "profile_updated", entityType: "user", entityId: user.id, entityTitle: user.name, userId: user.id, details: "Staff profile updated.", ipAddress: req.ip });
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role, avatarUrl: user.avatarUrl, createdAt: user.createdAt });
});

router.post("/auth/password", async (req, res): Promise<void> => {
  const current = await getCurrentUser(req);
  if (!current) { res.status(401).json({ error: "Not authenticated" }); return; }
  const { currentPassword, newPassword } = req.body ?? {};
  if (typeof currentPassword !== "string" || typeof newPassword !== "string" || newPassword.length < 10) {
    res.status(400).json({ error: "Current password and a new password of at least 10 characters are required." }); return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, current.id));
  if (!user || !verifyPassword(currentPassword, user.passwordHash).valid) { res.status(403).json({ error: "Current password is incorrect." }); return; }
  await db.update(usersTable).set({ passwordHash: hashPassword(newPassword) }).where(eq(usersTable.id, current.id));
  await logAudit({ action: "password_changed", entityType: "user", entityId: current.id, entityTitle: current.name, userId: current.id, details: "Staff password changed.", ipAddress: req.ip });
  res.json({ ok: true });
});

export default router;
