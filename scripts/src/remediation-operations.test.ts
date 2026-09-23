import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import { requestMetrics, serveMetrics, recordResearchProviderFailure } from "../../artifacts/api-server/src/lib/metrics";
import { securityHeaders } from "../../artifacts/api-server/src/lib/http-security";
import { runAsyncAction } from "../../artifacts/apz-legal/src/lib/async-action";

function response() {
  return Object.assign(new EventEmitter(), {
    statusCode: 200, body: "", headers: {} as Record<string, string>,
    status(code: number) { this.statusCode = code; return this; },
    end() { return this; }, type(value: string) { this.headers["Content-Type"] = value; return this; },
    send(value: string) { this.body = value; return this; },
    setHeader(name: string, value: string) { this.headers[name] = value; },
  });
}

describe("Q rejected async actions", () => {
  it("handles a network rejection without propagating it to the event loop", async () => {
    await assert.doesNotReject(runAsyncAction(async () => { throw new Error("Synthetic network failure"); }));
  });
});

describe("S production headers", () => {
  it("sets safe headers and includes only configured storage origins in CSP", () => {
    const previous = { ...process.env };
    try {
      process.env.NODE_ENV = "production";
      process.env.CSP_STORAGE_ORIGINS = "https://storage.example.test";
      delete process.env.CSP_ENFORCE;
      const res = response(); let continued = false;
      securityHeaders({} as any, res as any, () => { continued = true; });
      assert.equal(continued, true);
      assert.equal(res.headers["X-Content-Type-Options"], "nosniff");
      assert.equal(res.headers["X-Frame-Options"], "DENY");
      assert.equal(res.headers["Strict-Transport-Security"], "max-age=31536000");
      assert.match(res.headers["Content-Security-Policy-Report-Only"], /connect-src 'self' https:\/\/storage.example.test/);
      process.env.CSP_ENFORCE = "true";
      const enforced = response();
      securityHeaders({} as any, enforced as any, () => {});
      assert.ok(enforced.headers["Content-Security-Policy"]);
      assert.equal(enforced.headers["Content-Security-Policy-Report-Only"], undefined);
    } finally { process.env = previous; }
  });
});

describe("T private metrics", () => {
  it("rejects absent credentials and records failures without request PII", () => {
    const previous = process.env.METRICS_TOKEN;
    const secret = randomBytes(32).toString("hex");
    process.env.METRICS_TOKEN = secret;
    try {
      const denied = response();
      serveMetrics({ headers: {} } as any, denied as any, () => {});
      assert.equal(denied.statusCode, 404);
      const req = { path: "/api/auth/login", body: { email: "private@example.test" } };
      const res = response(); res.statusCode = 401;
      requestMetrics(req as any, res as any, () => {});
      res.emit("finish");
      recordResearchProviderFailure();
      const metrics = response();
      serveMetrics({ headers: { authorization: `Bearer ${secret}` } } as any, metrics as any, () => {});
      assert.equal(metrics.statusCode, 200);
      assert.match(metrics.body, /apz_research_provider_failures_total 1/);
      assert.match(metrics.body, /category="auth",status="401"/);
      assert.doesNotMatch(metrics.body, /private@example|login/);
      assert.equal(metrics.body.includes(secret), false);
    } finally {
      if (previous === undefined) delete process.env.METRICS_TOKEN;
      else process.env.METRICS_TOKEN = previous;
    }
  });
});
