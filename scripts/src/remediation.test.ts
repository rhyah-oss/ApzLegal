import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { isAllowedOrigin } from "../../artifacts/api-server/src/lib/cors-policy";
import { parsePagination } from "../../artifacts/api-server/src/lib/pagination";
import { VisitorBody } from "../../artifacts/api-server/src/lib/visitor-validation";
import { encryptField, decryptField } from "../../artifacts/api-server/src/lib/field-encryption";
import { trustedIngestion, InboundEmailBody } from "../../artifacts/api-server/src/lib/trusted-ingestion";
import { matterCreationError } from "../../artifacts/apz-legal/src/lib/matter-errors";
import { visiblePrompt, uniqueSources } from "../../artifacts/apz-legal/src/lib/ai-presentation";

describe("E/F actionable matter errors", () => {
  it("maps review-required and blocked FICA errors without exposing server details", () => {
    for (const complianceStatus of ["review_required", "blocked"]) {
      const message = matterCreationError({ data: { code: "FICA_COMPLIANCE_REQUIRED", complianceStatus, error: "private details" } });
      assert.match(message, /Compliance tab/); assert.doesNotMatch(message, /private details/);
    }
    assert.equal(matterCreationError(new Error("private details")), "Failed to create matter. Please try again.");
  });
});
describe("J CORS policy", () => {
  const env = { NODE_ENV: "production", APP_URL: "https://legal.example.test" };
  it("allows exact configured origins and server-to-server requests", () => {
    assert.equal(isAllowedOrigin(env.APP_URL, env), true);
    assert.equal(isAllowedOrigin(undefined, env), true);
  });
  it("rejects reflected, suffix-spoofed, null and local production origins", () => {
    for (const origin of ["https://attacker.test", "https://legal.example.test.attacker.test", "null", "http://localhost:8080"]) assert.equal(isAllowedOrigin(origin, env), false);
    assert.equal(isAllowedOrigin("http://localhost:8080", { NODE_ENV: "development" }), true);
  });
});
describe("L visitor validation", () => {
  it("accepts intended visitor fields and converts dates", () => {
    const value = VisitorBody.parse({ name: "Visitor fixture", expectedArrival: "2026-09-21T12:00:00Z", hostId: 1 });
    assert.ok(value.expectedArrival instanceof Date);
  });
  it("rejects mass assignment and invalid fields", () => {
    for (const payload of [{ id: 1 }, { createdAt: "2026-01-01" }, { checkedInAt: "2026-01-01" }, { status: "invalid" }, { hostId: "1" }, { expectedArrival: "invalid" }]) assert.equal(VisitorBody.safeParse({ name: "Fixture", ...payload }).success, false);
  });
});
describe("N trusted ingestion", () => {
  it("rejects absent or forged adapter credentials", () => {
    const secret = randomBytes(32).toString("hex");
    assert.equal(trustedIngestion(secret, secret), true);
    assert.equal(trustedIngestion(randomBytes(32).toString("hex"), secret), false);
    assert.equal(trustedIngestion(undefined, secret), false);
    assert.equal(trustedIngestion(secret, undefined), false);
  });
  it("validates normalized payloads and rejects spoofed matter linkage", () => {
    const value = { provider: "fixture", externalMessageId: "message", externalThreadId: "thread", senderEmail: "fixture@example.test", receivedAt: "2026-09-21T12:00:00Z" };
    assert.equal(InboundEmailBody.safeParse(value).success, true);
    assert.equal(InboundEmailBody.safeParse({ ...value, matterId: 2 }).success, false);
    assert.equal(InboundEmailBody.safeParse({ ...value, senderEmail: {} }).success, false);
  });
});
describe("O versioned encryption abstraction", () => {
  it("round trips, randomizes ciphertext and supports retained keys", () => {
    const keys = { old: randomBytes(32), current: randomBytes(32) };
    const first = encryptField("synthetic fixture", "clients:1:id", "old", keys);
    assert.equal(decryptField(first, "clients:1:id", keys), "synthetic fixture");
    assert.notEqual(first, encryptField("synthetic fixture", "clients:1:id", "old", keys));
    assert.equal(decryptField(encryptField("", "clients:1:id", "current", keys), "clients:1:id", keys), "");
    for (const action of [() => decryptField(first, "clients:2:id", keys), () => decryptField(first, "clients:1:id", { old: randomBytes(32) }), () => decryptField(first.replace(":v1:", ":v2:"), "clients:1:id", keys), () => decryptField("plaintext", "clients:1:id", keys)]) assert.throws(action, /Unable to decrypt protected field/);
  });
});
describe("P pagination bounds", () => {
  it("provides safe defaults, clamps limits, and navigates pages", () => {
    assert.deepEqual(parsePagination({}), { page: 1, limit: 100, offset: 0 });
    assert.deepEqual(parsePagination({ page: "2", limit: "999" }), { page: 2, limit: 200, offset: 200 });
    for (const query of [{ page: -1 }, { limit: 0 }, { page: "1.5" }, { limit: "invalid" }, { page: 10001 }]) assert.equal(parsePagination(query), null);
  });
});
describe("R history presentation", () => {
  it("keeps normal prompts and extracts instructions from legacy retrieval payloads", () => {
    assert.equal(visiblePrompt({ query: "Normal question" }), "Normal question");
    assert.equal(visiblePrompt({ query: "CURRENT MATTER FACTS:\nprivate\n\nRETRIEVED MATTER DOCUMENTS:\nprivate chunk\n\nATTORNEY INSTRUCTIONS:\nSummarise" }), "Summarise");
    assert.equal(visiblePrompt({ query: "CURRENT MATTER FACTS:\nprivate" }), "Matter workflow request");
    assert.equal(visiblePrompt({ query: "legacy", params: { query: "User question" } }), "User question");
  });
  it("deduplicates sources without changing source order", () => {
    assert.deepEqual(uniqueSources([{ type: "document", id: 1 }, { type: "document", id: 1 }, { type: "knowledge", id: 1 }]), [{ type: "document", id: 1 }, { type: "knowledge", id: 1 }]);
    assert.deepEqual(uniqueSources([]), []);
  });
});
