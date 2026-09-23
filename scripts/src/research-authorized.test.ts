import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ||= "postgresql://localhost:1/apz_research_no_database";
process.env.OLLAMA_BASE_URL = "http://research-fixture.invalid";

const { db, sessionsTable, usersTable } = await import("../../lib/db/src/index");
const { retrieveForResearch } = await import("../../artifacts/api-server/src/lib/retrieval-service");
const { getEmbeddingClient } = await import("../../artifacts/api-server/src/lib/embedding-service");

function selectFixture() {
  return mock.method(db, "select", () => {
    let table: unknown;
    const chain: any = {
      from(value: unknown) { table = value; return chain; },
      where() { return chain; },
      then(resolve: (value: unknown) => unknown) {
        const rows = table === sessionsTable
          ? [{ userId: 7, expiresAt: new Date(Date.now() + 60_000) }]
          : table === usersTable
            ? [{ id: 7, name: "Authorized fixture", email: "authorized@example.test", role: "paralegal", accountStatus: "active" }]
            : [];
        return Promise.resolve(rows).then(resolve);
      },
    };
    return chain;
  });
}

describe("H authorized research retrieval", () => {
  it("retrieves matter-scoped chunks for an authenticated authorized caller", async () => {
    const select = selectFixture();
    const oldFetch = globalThis.fetch;
    const embeddingClient = getEmbeddingClient()!;
    const embedding = mock.method(embeddingClient.embeddings, "create", async () => ({ data: [{ embedding: Array(768).fill(0.01) }] }));
    let executeCalls = 0;
    const execute = mock.method(db, "execute", async () => ({ rows: executeCalls++ === 0 ? [{
      id: 31, text: "Matter 10 authorised source", matterId: 10, similarity: 0.91,
      metadata: { sourceId: 301, documentType: "opinion", matterId: 10 },
    }] : [] }));
    globalThis.fetch = async () => new Response(JSON.stringify({ object: "list", model: "nomic-embed-text", data: [{ object: "embedding", index: 0, embedding: Array(768).fill(0.01) }], usage: { prompt_tokens: 1, total_tokens: 1 } }), { status: 200, headers: { "content-type": "application/json" } });
    try {
      const results = await retrieveForResearch({ cookies: { auth_token: "authorized-fixture" }, headers: {} }, {
        matterId: 10, query: "authorised matter question", topK: 5, includeKnowledge: false,
      });
      assert.equal(results.length, 1);
      assert.equal(results[0].matterId, 10);
      assert.equal(results[0].text, "Matter 10 authorised source");
      assert.equal(execute.mock.callCount(), 2);
    } finally {
      globalThis.fetch = oldFetch;
      embedding.mock.restore();
      execute.mock.restore();
      select.mock.restore();
    }
  });
});
