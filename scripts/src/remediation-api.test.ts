import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { CreateTaskBody } from "../../artifacts/api-server/src/lib/task-validation";

// All persistence is mocked; never connect to an existing database.
process.env.DATABASE_URL ||= "postgresql://localhost:1/apz_remediation_no_database";
const schema = await import("../../lib/db/src/index");
const { db, sessionsTable, usersTable, mattersTable, documentsTable, emailConnectionsTable, tasksTable, invoicesTable, appointmentsTable } = schema;
const documents = (await import("../../artifacts/api-server/src/routes/documents")).default as any;
const research = (await import("../../artifacts/api-server/src/routes/research")).default as any;
const microsoft = (await import("../../artifacts/api-server/src/routes/microsoft")).default as any;
const tasks = (await import("../../artifacts/api-server/src/routes/tasks")).default as any;
const billing = (await import("../../artifacts/api-server/src/routes/billing")).default as any;
const appointments = (await import("../../artifacts/api-server/src/routes/appointments")).default as any;
const providerOperations = (await import("../../artifacts/api-server/src/routes/provider-operations")).default as any;
const emails = (await import("../../artifacts/api-server/src/routes/emails")).default as any;
const productivity = (await import("../../artifacts/api-server/src/routes/productivity")).default as any;
const { PgDialect } = await import("../../artifacts/api-server/node_modules/drizzle-orm/pg-core/index.js");
const dialect = new PgDialect();

function response() {
  return { statusCode: 200, body: undefined as any, headers: {} as Record<string, unknown>,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
    send(body: unknown) { this.body = body; return this; },
    setHeader(key: string, value: unknown) { this.headers[key] = value; },
  };
}
function route(router: any, path: string, method: string) {
  return router.stack.find((layer: any) => layer.route?.path === path && layer.route.methods[method]).route.stack[0].handle;
}
function stubDb(role: string, assignedToId: number | null, present = true) {
  const writes: unknown[] = [];
  const reads: unknown[] = [];
  const select = mock.method(db, "select", () => {
    let table: any; let where: any;
    const chain: any = {
      from(value: unknown) { table = value; reads.push(value); return chain; },
      where(value: unknown) { where = value; return chain; },
      limit() { return chain; }, orderBy() { return chain; },
      then(resolve: any) {
        let rows: any[] = [];
        if (table === sessionsTable) rows = [{ userId: 1, expiresAt: new Date(Date.now() + 60000) }];
        if (table === usersTable) rows = [{ id: 1, role, name: "Fixture", email: "fixture@example.test" }];
        if (table === mattersTable && present) rows = [{ id: 10, assignedToId }];
        if (table === documentsTable && present) rows = [{ id: 20, matterId: 10 }];
        if (table === tasksTable) rows = [{ id: 20, matterId: 10, assignedToId }];
        if (table === invoicesTable) rows = [{ id: 20, createdById: assignedToId }];
        if (table === appointmentsTable) rows = [{ id: 20, assignedToId, createdById: assignedToId }];
        if (table === schema.emailsTable) rows = [{ id: 20, matterId: 10 }];
        if (table === emailConnectionsTable) {
          const values = dialect.sqlToQuery(where).params;
          if (values.includes("subscription-fixture") && values.includes("state-fixture")) rows = [{ id: 3 }];
        }
        return Promise.resolve(rows).then(resolve);
      },
    };
    return chain;
  });
  const insert = mock.method(db, "insert", () => ({ values(value: unknown) { writes.push(value); return { onConflictDoNothing: async () => [] }; } }) as any);
  return { writes, reads, restore() { select.mock.restore(); insert.mock.restore(); } };
}
function request(body = {}) {
  return { cookies: { auth_token: "synthetic-session-fixture" }, headers: {}, params: { matterId: "10", id: "20" }, body, query: {}, method: "POST" } as any;
}

describe("G document guard", () => {
  const guard = documents.stack.find((layer: any) => !layer.route).handle;
  it("covers every document-by-id action before its route handler", () => {
    const paths = documents.stack.filter((layer: any) => layer.route?.path.includes("/documents/:id")).map((layer: any) => layer.route.path);
    for (const action of ["", "/versions", "/status", "/ai-assist", "/verify-citations", "/submit", "/decision", "/approve", "/send-signature", "/sign", "/signature-certificate", "/archive"]) assert.ok(paths.includes(`/matters/:matterId/documents/:id${action}`));
    assert.equal(documents.stack[0].handle, guard);
  });
  for (const role of ["candidate_attorney", "paralegal", "secretary"]) {
    it(`denies ${role} cross-matter access without loading the document`, async () => {
      const stub = stubDb(role, 2); const res = response(); let continued = false;
      try {
        await guard(request(), res, () => { continued = true; });
        assert.equal(res.statusCode, 404); assert.deepEqual(res.body, { error: "Document not found" });
        assert.equal(continued, false); assert.equal(stub.reads.includes(documentsTable), false); assert.equal(stub.writes.length, 0);
      } finally { stub.restore(); }
    });
    it(`permits ${role} assigned-matter access`, async () => {
      const stub = stubDb(role, 1); let continued = false;
      try { await guard(request(), response(), () => { continued = true; }); assert.equal(continued, true); } finally { stub.restore(); }
    });
  }
  for (const role of ["super_admin", "admin", "partner", "managing_partner"]) {
    it(`preserves ${role} firm-wide access`, async () => {
      const stub = stubDb(role, 2); let continued = false;
      try { await guard(request(), response(), () => { continued = true; }); assert.equal(continued, true); } finally { stub.restore(); }
    });
  }
});
describe("H research query authorization", () => {
  for (const present of [true, false]) it(`rejects ${present ? "unassigned" : "missing"} matters before retrieval`, async () => {
    const stub = stubDb("paralegal", 2, present); const res = response();
    try {
      await route(research, "/research/query", "post")(request({ matterId: 10, query: "Synthetic query" }), res);
      assert.equal(res.statusCode, 404); assert.deepEqual(res.body, { error: "Matter not found" }); assert.equal(stub.writes.length, 0);
    } finally { stub.restore(); }
  });
});
describe("I provider confirmation", () => {
  for (const role of ["associate_attorney", "candidate_attorney", "partner", "admin", "super_admin"]) {
    it(`rejects forged confirmation from a ${role} session before accessing operations`, async () => {
      const stub = stubDb(role, 1); const res = response();
      try {
        await route(providerOperations, "/provider-operations/:id/status", "post")(request({
          status: "provider_confirmed", providerName: "fixture", providerRequestId: "forged-request", providerEventId: "forged-event",
        }), res);
        assert.equal(res.statusCode, 403);
        assert.equal(res.body.code, "TRUSTED_PROVIDER_REQUIRED");
        assert.deepEqual(stub.reads, [sessionsTable, usersTable]);
        assert.equal(stub.writes.length, 0);
      } finally { stub.restore(); }
    });
  }
});
describe("I Microsoft webhook", () => {
  it("sends the caller's persisted clientState when creating a subscription", async () => {
    const { MicrosoftGraphClient, MicrosoftGraphProvider } = await import("../../artifacts/api-server/src/lib/microsoft-graph");
    const client = new MicrosoftGraphClient(new MicrosoftGraphProvider(), { accessToken: randomBytes(32).toString("hex"), expiresIn: 3600 }, {} as any);
    const state = randomBytes(32).toString("hex");
    const outgoing = mock.method(client, "request", async (path, options) => {
      assert.equal(path, "/subscriptions");
      assert.equal(JSON.parse(String(options?.body)).clientState, state);
      return { id: "subscription-fixture", expirationDateTime: "2026-09-23T00:00:00Z" };
    });
    try { await client.createSubscription("me/messages", "https://app.example.test/api/microsoft/webhook", "2026-09-23T00:00:00Z", state); }
    finally { outgoing.mock.restore(); }
  });
  it("echoes validation tokens as plain text", async () => {
    const req = request(); req.query.validationToken = "synthetic-validation"; const res = response();
    await route(microsoft, "/microsoft/webhook", "post")(req, res);
    assert.equal(res.body, "synthetic-validation"); assert.equal(res.headers["Content-Type"], "text/plain");
  });
  it("skips null, forged and unknown events while retaining valid batch items", async () => {
    const stub = stubDb("partner", 1); const res = response();
    const valid = { subscriptionId: "subscription-fixture", clientState: "state-fixture", resource: "me/messages/fixture", changeType: "created" };
    try {
      await route(microsoft, "/microsoft/webhook", "post")(request({ value: [null, {}, { ...valid, clientState: "forged" }, { ...valid, subscriptionId: "unknown" }, valid] }), res);
      assert.equal(res.statusCode, 202); assert.equal(stub.writes.length, 1);
      assert.equal((stub.writes[0] as any).subscriptionId, "subscription-fixture");
    } finally { stub.restore(); }
  });
});

describe("L existing ownership policies", () => {
  for (const role of ["candidate_attorney", "paralegal", "secretary"]) {
    for (const method of ["patch", "delete"]) it(`${role} cannot ${method} another user's matter task`, async () => {
      const stub = stubDb(role, 2); const res = response();
      try { await route(tasks, "/matters/:matterId/tasks/:id", method)(request({ title: "Changed" }), res); assert.equal(res.statusCode, 403); assert.equal(stub.writes.length, 0); } finally { stub.restore(); }
    });
    it(`${role} cannot read another user's invoice or appointment`, async () => {
      const stub = stubDb(role, 2);
      try {
        for (const [router, path] of [[billing, "/invoices/:id"], [appointments, "/appointments/:id"]]) {
          const res = response(); await route(router, path, "get")(request(), res); assert.equal(res.statusCode, 404);
        }
      } finally { stub.restore(); }
    });
  }
  it("rejects malformed global task creation before writing", async () => {
    const stub = stubDb("partner", 1); const res = response();
    try { await route(tasks, "/tasks", "post")(request({ matterId: 10, title: {}, priority: "invalid" }), res); assert.equal(res.statusCode, 400); assert.equal(stub.writes.length, 0); } finally { stub.restore(); }
  });
  it("rejects empty titles, malformed dates, and invalid assignee IDs", () => {
    const valid = { title: "Prepare affidavit", matterId: 10, dueDate: "2026-09-22", assignedToId: 7 };
    assert.equal(CreateTaskBody.safeParse(valid).success, true);
    for (const payload of [
      { ...valid, title: "" }, { ...valid, title: "   " },
      { ...valid, dueDate: "not-a-date" }, { ...valid, dueDate: "2026-02-30" },
      { ...valid, assignedToId: 1.5 }, { ...valid, assignedToId: -1 },
    ]) assert.equal(CreateTaskBody.safeParse(payload).success, false);
  });
});

describe("N attachment promotion", () => {
  const path = "/matters/:matterId/emails/:emailId/attachments/:attachmentId/document";
  it("denies a non-legal-author before loading email or attachment content", async () => {
    const stub = stubDb("paralegal", 1); const res = response();
    try {
      await route(emails, path, "post")(request(), res);
      assert.equal(res.statusCode, 403);
      assert.deepEqual(stub.reads, [sessionsTable, usersTable]);
    } finally { stub.restore(); }
  });
  for (const failAudit of [false, true]) it(`keeps document, attachment and audit in one transaction (${failAudit ? "failure" : "success"})`, async () => {
    const stub = stubDb("partner", 1);
    const committed: unknown[] = [];
    const transaction = mock.method(db, "transaction", async (callback: any) => {
      const pending: unknown[] = [];
      const tx = {
        select: () => ({ from: () => ({ where: () => ({ for: async (lock: string) => {
          assert.equal(lock, "update");
          return [{ id: 30, emailId: 20, filename: "fixture.txt", fileObjectPath: "/objects/fixture", documentId: null }];
        } }) }) }),
        insert: (table: unknown) => ({ values(value: any) {
          if (table === schema.auditLogsTable && failAudit) throw new Error("Synthetic audit failure");
          pending.push(table);
          const result: any = Promise.resolve();
          result.returning = async () => [{ id: 40, ...value }];
          return result;
        } }),
        update: (table: unknown) => ({ set: () => ({ where: () => ({ returning: async () => {
          pending.push(table); return [{ id: 30, documentId: 40 }];
        } }) }) }),
      };
      const result = await callback(tx);
      committed.push(...pending);
      return result;
    });
    try {
      const req = request(); req.params.emailId = "20"; req.params.attachmentId = "30";
      const res = response();
      if (failAudit) {
        await assert.rejects(route(emails, path, "post")(req, res), /Synthetic audit failure/);
        assert.equal(committed.length, 0);
      } else {
        await route(emails, path, "post")(req, res);
        assert.equal(res.statusCode, 201);
        assert.deepEqual(committed, [documentsTable, schema.emailAttachmentsTable, schema.auditLogsTable]);
      }
      assert.equal(stub.writes.length, 0, "Promotion must not write outside the transaction");
    } finally { transaction.mock.restore(); stub.restore(); }
  });
});

describe("N ingestion source checks", () => {
  for (const kind of ["missing", "forged", "malformed", "trusted"] as const) {
    it(`handles ${kind} adapter input before accepting correspondence`, async () => {
      const previous = { ...process.env };
      const secret = randomBytes(32).toString("hex");
      process.env.EMAIL_INGESTION_ENABLED = "true";
      process.env.EMAIL_PROVIDER_NAME = "fixture";
      process.env.EMAIL_INGESTION_SECRET = secret;
      const stub = stubDb("partner", 1); const res = response();
      try {
        const req = request({ provider: "fixture", externalMessageId: "fixture", externalThreadId: "fixture", senderEmail: "fixture@example.test", receivedAt: "2026-09-22T00:00:00Z", ...(kind === "malformed" ? { matterId: 99 } : {}) });
        if (kind !== "missing") req.headers["x-email-ingestion-token"] = kind === "forged" ? randomBytes(32).toString("hex") : secret;
        await route(emails, "/emails/ingest", "post")(req, res);
        assert.equal(res.statusCode, kind === "trusted" ? 200 : kind === "malformed" ? 400 : 403);
        if (kind === "trusted") assert.equal(res.body.duplicate, true, "An authenticated adapter can re-deliver an existing message");
        else { assert.equal(stub.writes.length, 0); assert.equal(stub.reads.includes(schema.emailsTable), false); }
      } finally { stub.restore(); process.env = previous; }
    });
  }
});

describe("P productivity range", () => {
  it("rejects excessive ranges before reporting queries", async () => {
    const stub = stubDb("partner", 1); const res = response();
    try {
      const req = request(); req.query = { startDate: "2020-01-01", endDate: "2026-01-01" };
      await route(productivity, "/productivity/summary", "get")(req, res);
      assert.equal(res.statusCode, 400);
      assert.match(res.body.error, /366 days/);
      assert.deepEqual(stub.reads, [sessionsTable, usersTable]);
    } finally { stub.restore(); }
  });
});
