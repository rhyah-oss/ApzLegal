import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { installSessionExpiryHandler } from "../../artifacts/apz-legal/src/lib/session-expiry";
import { installPagedFetch } from "../../artifacts/apz-legal/src/lib/paged-fetch";

function fakeWindow(path: string, fetcher: typeof fetch) {
  const redirects: string[] = [];
  const previous = globalThis.window;
  (globalThis as any).window = {
    fetch: fetcher,
    location: { href: `https://app.example.test${path}`, origin: "https://app.example.test", pathname: path, replace: (url: string) => redirects.push(url) },
  };
  return { redirects, restore() { (globalThis as any).window = previous; } };
}
describe("J session expiry", () => {
  it("clears state and redirects only once on concurrent expired requests", async () => {
    const fixture = fakeWindow("/matters", async () => Response.json({ code: "AUTH_REQUIRED" }, { status: 401 }));
    let cleared = 0;
    try {
      installSessionExpiryHandler(() => { cleared++; }, "/");
      await window.fetch("/api/matters"); await window.fetch("/api/documents");
      assert.equal(cleared, 1); assert.deepEqual(fixture.redirects, ["/login"]);
    } finally { fixture.restore(); }
  });
  it("does not loop on login, auth failures, external services or Graph token expiry", async () => {
    for (const [path, url, code] of [["/login", "/api/matters", "AUTH_REQUIRED"], ["/", "/api/auth/login", ""], ["/email", "/api/microsoft/sync", "MICROSOFT_AUTH_EXPIRED"], ["/", "https://storage.example.test/api/file", ""]]) {
      const fixture = fakeWindow(path, async () => Response.json({ code }, { status: 401 }));
      try { installSessionExpiryHandler(() => assert.fail("Must not clear session"), "/"); await window.fetch(url); assert.equal(fixture.redirects.length, 0); } finally { fixture.restore(); }
    }
  });
});
describe("P browser pagination compatibility", () => {
  it("collects bounded pages and preserves explicit page requests", async () => {
    const visited: string[] = [];
    const fixture = fakeWindow("/", async input => {
      const url = new URL(String(input), "https://app.example.test"); visited.push(url.search);
      return url.searchParams.has("page") ? Response.json([{ id: 2 }]) : Response.json([{ id: 1 }], { headers: { "X-Next-Page": "2" } });
    });
    try {
      installPagedFetch("/");
      assert.deepEqual(await (await window.fetch("/api/tasks")).json(), [{ id: 1 }, { id: 2 }]);
      assert.deepEqual(visited, ["", "?page=2"]);
      visited.length = 0;
      assert.deepEqual(await (await window.fetch("/api/tasks?page=2")).json(), [{ id: 2 }]);
      assert.equal(visited.length, 1);
    } finally { fixture.restore(); }
  });
  it("does not disguise a failed later page as a complete list", async () => {
    let calls = 0;
    const fixture = fakeWindow("/", async () => ++calls === 1 ? Response.json([{ id: 1 }], { headers: { "X-Next-Page": "2" } }) : Response.json({ code: "AUTH_REQUIRED" }, { status: 401 }));
    try { installPagedFetch("/"); assert.equal((await window.fetch("/api/tasks")).status, 401); } finally { fixture.restore(); }
  });
});
