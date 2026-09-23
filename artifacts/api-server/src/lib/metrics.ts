import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
const buckets = [0.05, 0.1, 0.5, 1, 5, 30, 300];
const series = new Map<string, { count: number; sum: number; buckets: number[] }>();
let researchProviderFailures = 0;
export function recordResearchProviderFailure() { researchProviderFailures++; }
const categories = new Set(["auth", "matters", "documents", "storage", "ai", "research", "microsoft", "provider-operations"]);
export const requestMetrics: RequestHandler = (req, res, next) => {
  const segment = req.path.split("/")[2] ?? "";
  const category = categories.has(segment) ? segment : "other";
  const start = performance.now();
  res.once("finish", () => {
    const status = String(res.statusCode);
    const key = `category="${category}",status="${status}"`;
    const value = series.get(key) ?? { count: 0, sum: 0, buckets: buckets.map(() => 0) };
    const duration = (performance.now() - start) / 1000;
    value.count++; value.sum += duration;
    buckets.forEach((bound, index) => { if (duration <= bound) value.buckets[index]++; });
    series.set(key, value);
  });
  next();
};
export const serveMetrics: RequestHandler = (req, res) => {
  const secret = process.env.METRICS_TOKEN;
  const supplied = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
  if (!secret || secret.length < 32 || Buffer.byteLength(secret) !== Buffer.byteLength(supplied) || !timingSafeEqual(Buffer.from(secret), Buffer.from(supplied))) {
    res.status(404).end(); return;
  }
  const lines = [
    "# TYPE apz_research_provider_failures_total counter",
    `apz_research_provider_failures_total ${researchProviderFailures}`,
    "# TYPE apz_http_request_duration_seconds histogram",
  ];
  for (const [labels, value] of series) {
    buckets.forEach((bound, index) => lines.push(`apz_http_request_duration_seconds_bucket{${labels},le="${bound}"} ${value.buckets[index]}`));
    lines.push(`apz_http_request_duration_seconds_bucket{${labels},le="+Inf"} ${value.count}`);
    lines.push(`apz_http_request_duration_seconds_count{${labels}} ${value.count}`);
    lines.push(`apz_http_request_duration_seconds_sum{${labels}} ${value.sum}`);
  }
  res.type("text/plain; version=0.0.4").send(lines.join("\n") + "\n");
};
