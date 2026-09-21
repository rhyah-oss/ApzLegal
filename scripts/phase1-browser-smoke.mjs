import assert from "node:assert/strict";

const webBase = process.env.APZ_WEB_URL || "http://127.0.0.1:18593";
const apiBase = process.env.APZ_API_URL || "http://127.0.0.1:8080/api";
const criticalRoutes = [
  "/",
  "/clients",
  "/matters",
  "/documents",
  "/email",
  "/workflow",
  "/conflicts",
  "/fica",
  "/ai",
];

const health = await fetch(`${apiBase}/healthz`);
assert.equal(health.status, 200, `API health check failed: ${health.status}`);

for (const route of criticalRoutes) {
  const response = await fetch(`${webBase}${route}`, { redirect: "manual" });
  const html = await response.text();
  assert.equal(response.status, 200, `browser route ${route} failed: ${response.status}`);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/i, `browser route ${route} did not serve HTML`);
  assert.match(html, /<div id="root"><\/div>/, `browser route ${route} is missing the React mount`);
  assert.match(html, /src="\/src\/main\.tsx(?:\?|")/, `browser route ${route} is not served by the APZ Vite app`);
}

console.log(`Phase 1 browser smoke passed: ${criticalRoutes.length} critical UI routes served by the live app`);