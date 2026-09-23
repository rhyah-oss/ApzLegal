import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

// Route tests use synthetic in-memory persistence only.
process.env.DATABASE_URL ||= "postgresql://localhost:1/apz_remediation_no_database";
const { db, usersTable, sessionsTable, clientsTable, mattersTable, conflictsTable } = await import("../../lib/db/src/index");
const auth = (await import("../../artifacts/api-server/src/routes/auth")).default as any;
const matters = (await import("../../artifacts/api-server/src/routes/matters")).default as any;
const { DEV_ACCOUNTS } = await import("../../artifacts/api-server/src/lib/devAccounts");
const { sessionTokenHash } = await import("../../artifacts/api-server/src/lib/context");
const { PgDialect } = await import("../../artifacts/api-server/node_modules/drizzle-orm/pg-core/index.js");
const dialect = new PgDialect();

function handler(router: any, path: string, method = "post") {
  return router.stack.find((layer: any) => layer.route?.path === path && layer.route.methods[method]).route.stack[0].handle;
}
function response() {
  return { statusCode: 200, body: undefined as any, token: "",
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
    cookie(_name: string, token: string) { this.token = token; return this; },
  };
}

describe("D actual dev-login to auth/me route identity", () => {
  for (const [index, account] of DEV_ACCOUNTS.entries()) {
    it(`retains the selected ${account.role} through session creation and lookup`, async () => {
      const user = { ...account, id: index + 1, accountStatus: "active" };
      let session: any;
      const select = mock.method(db, "select", () => ({ from(table: unknown) {
        return { where(predicate: any) {
          const values = dialect.sqlToQuery(predicate).params;
          if (table === usersTable) return Promise.resolve(values.includes(user.email) || values.includes(user.id) ? [user] : []);
          if (table === sessionsTable) return Promise.resolve(session && values.includes(session.token) ? [session] : []);
          return Promise.resolve([]);
        } };
      } }) as any);
      const insert = mock.method(db, "insert", (table: unknown) => ({ values(value: unknown) {
        assert.notEqual(table, usersTable, "Existing demo accounts must be reused");
        if (table === sessionsTable) session = value;
        return Promise.resolve();
      } }) as any);
      try {
        const login = response();
        await handler(auth, "/auth/dev-login")({ body: account }, login);
        assert.equal(login.statusCode, 200);
        assert.equal(session.userId, user.id);
        assert.equal(session.token, sessionTokenHash(login.token));
        const me = response();
        await handler(auth, "/auth/me", "get")({ cookies: { auth_token: login.token }, headers: {} }, me);
        assert.equal(me.statusCode, 200);
        assert.deepEqual([me.body.id, me.body.name, me.body.email, me.body.role], [user.id, account.name, account.email, account.role]);
      } finally { select.mock.restore(); insert.mock.restore(); }
    });
  }
});

describe("E/F matter compliance creation contract", () => {
  for (const complianceStatus of ["compliant", "review_required", "blocked"]) {
    it(`${complianceStatus} follows the existing FICA-before-creation rule`, async () => {
      const client = { id: 1, name: "Synthetic client", complianceStatus };
      let matter: any;
      let conflict: any;
      const writes: unknown[] = [];
      const select = mock.method(db, "select", () => {
        let table: unknown;
        const chain: any = {
          from(value: unknown) { table = value; return chain; }, where() { return chain; }, orderBy() { return chain; }, limit() { return chain; },
          then(resolve: any) { return Promise.resolve(table === clientsTable ? [client] : table === mattersTable && matter ? [matter] : table === conflictsTable && conflict ? [conflict] : []).then(resolve); },
        };
        return chain;
      });
      const count = mock.method(db, "$count", async () => 0);
      const insert = mock.method(db, "insert", (table: unknown) => ({ values(value: any) {
        writes.push(table);
        if (table === mattersTable) matter = { id: 10, status: "lead", riskLevel: "low", ...value };
        if (table === conflictsTable) conflict = { id: 20, ...value };
        const result: any = Promise.resolve();
        result.returning = async () => [table === mattersTable ? matter : conflict];
        return result;
      } }) as any);
      const update = mock.method(db, "update", () => ({ set(value: any) { return { where() { Object.assign(matter, value); return Promise.resolve(); } }; } }) as any);
      try {
        const res = response();
        await handler(matters, "/matters")({ body: { clientId: 1, title: "Synthetic matter" }, cookies: {}, headers: {} }, res);
        if (complianceStatus === "compliant") {
          assert.equal(res.statusCode, 201);
          assert.equal(res.body.clientId, 1);
          assert.equal(res.body.status, "conflict_check", "The existing onboarding conflict workflow remains active");
          assert.ok(writes.includes(conflictsTable));
        } else {
          assert.equal(res.statusCode, 409);
          assert.equal(res.body.code, "FICA_COMPLIANCE_REQUIRED");
          assert.equal(res.body.complianceStatus, complianceStatus);
          assert.equal(writes.length, 0);
        }
      } finally { select.mock.restore(); count.mock.restore(); insert.mock.restore(); update.mock.restore(); }
    });
  }
  it("rejects a missing client before database work", async () => {
    const count = mock.method(db, "$count", () => { throw new Error("Unexpected database access"); });
    try {
      const res = response();
      await handler(matters, "/matters")({ body: { title: "Synthetic matter" } }, res);
      assert.equal(res.statusCode, 400);
      assert.equal(count.mock.callCount(), 0);
    } finally { count.mock.restore(); }
  });
});
