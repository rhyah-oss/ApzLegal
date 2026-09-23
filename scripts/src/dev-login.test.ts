import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEV_ACCOUNTS,
  DEV_ACCOUNT_BY_ROLE,
  resolveDevAccount,
  decideDevLogin,
  type DevAccount,
} from "../../artifacts/api-server/src/lib/devAccounts";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://dev-test:dev-test@localhost:1/devtest";
}

describe("Dev Mode identity mapping", () => {
  for (const account of DEV_ACCOUNTS) {
    it(`resolves the ${account.role} selection to the exact identity (${account.email})`, () => {
      const resolution = resolveDevAccount({ role: account.role, email: account.email, name: account.name });
      assert.equal(resolution.ok, true);
      if (!resolution.ok) throw new Error("expected a resolved dev account");
      assert.equal(resolution.account.email, account.email, "selected identity email is exact");
      assert.equal(resolution.account.role, account.role, "selected identity role is exact");
      assert.equal(resolution.account.name, account.name, "selected identity name is exact");
    });

    it(`authenticates ${account.role} as itself: selected identity -> /auth/me identity -> role`, () => {
      const resolution = resolveDevAccount({ role: account.role, email: account.email, name: account.name });
      assert.equal(resolution.ok, true);
      if (!resolution.ok) throw new Error("expected a resolved dev account");
      const resolved = resolution.account;

      const seeded = { id: 1, name: resolved.name, email: resolved.email, role: resolved.role };
      const decision = decideDevLogin(resolved, seeded);

      assert.equal(decision.action, "use", `${resolved.role} dev identity must reuse its exact seeded user`);
      if (decision.action !== "use") throw new Error("expected use");

      const reported = decision.user;
      assert.equal(reported.email, resolved.email, "/auth/me must report the selected identity email");
      assert.equal(reported.role, resolved.role, "/auth/me must report the selected identity role");
      if (resolved.role !== "super_admin") {
        assert.notEqual(reported.role, "super_admin", `${resolved.role} must not be reported as super_admin`);
      }
    });
  }

  it("makes a missing dev account available without falling back to super_admin", () => {
    const paralegal = DEV_ACCOUNT_BY_ROLE.get("paralegal") as DevAccount;
    const decision = decideDevLogin(paralegal, null);
    assert.equal(decision.action, "create", "an unseeded dev account is provisioned, never resolved to super_admin");
  });

  it("does not resolve the Sarah -> super_admin email collision to super_admin", () => {
    const sarah = DEV_ACCOUNT_BY_ROLE.get("managing_partner") as DevAccount;

    const resolution = resolveDevAccount({
      role: "managing_partner",
      email: "admin@apzlegal.co.za",
      name: "Sarah van der Merwe",
    });
    assert.equal(resolution.ok, false, "the super_admin email must not bind to the managing_partner dev identity");
    assert.equal(resolution.code, "DEV_EMAIL_MISMATCH");

    const adminSeed = { id: 1, name: "Admin User", email: "admin@apzlegal.co.za", role: "super_admin" };
    const decision = decideDevLogin(sarah, adminSeed);
    assert.equal(decision.action, "reject", "the shared super_admin seed must never authenticate the managing_partner identity");
    assert.equal(decision.code, "DEV_ROLE_MISMATCH");
  });

  it("rejects an unknown dev role with a clear error instead of falling back to super_admin", () => {
    const resolution = resolveDevAccount({ role: "intern", email: "intern@apzlegal.co.za", name: "Intern" });
    assert.equal(resolution.ok, false);
    assert.equal(resolution.code, "DEV_ROLE_UNKNOWN");
  });

  it("never trusts a client-supplied role to escalate beyond the dev account set", () => {
    const superAdmin = DEV_ACCOUNT_BY_ROLE.get("super_admin") as DevAccount;
    const resolution = resolveDevAccount({ role: "super_admin", email: superAdmin.email, name: superAdmin.name });
    assert.equal(resolution.ok, true);
    if (!resolution.ok) throw new Error("expected ok");
    assert.equal(resolution.account.role, "super_admin");
    assert.equal(resolution.account.email, "superadmin@apzlegal.co.za");
  });

  describe("authorization: a restricted dev role gains no super_admin permissions", () => {
    it("paralegal dev identity is denied a super_admin-only gate while super_admin is allowed", async () => {
      const { hasRole } = await import("../../artifacts/api-server/src/lib/permissions");

      const paralegal = DEV_ACCOUNT_BY_ROLE.get("paralegal") as DevAccount;
      const superAdmin = DEV_ACCOUNT_BY_ROLE.get("super_admin") as DevAccount;

      const restricted = { id: 1, name: paralegal.name, email: paralegal.email, role: paralegal.role };
      const privileged = { id: 2, name: superAdmin.name, email: superAdmin.email, role: superAdmin.role };

      assert.equal(restricted.role, "paralegal");
      assert.equal(hasRole(restricted, ["super_admin"]), false, "restricted dev role must not satisfy a super_admin gate");
      assert.equal(hasRole(privileged, ["super_admin"]), true, "the super_admin dev identity satisfies a super_admin gate");
      assert.equal(hasRole(restricted, ["admin", "super_admin", "managing_partner"]), false, "restricted dev role is not elevated to administrator");
    });
  });
});
