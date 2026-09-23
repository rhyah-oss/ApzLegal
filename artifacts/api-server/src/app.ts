import express, { type Express } from "express";
import cors from "cors";
import { allowedOrigins, isAllowedOrigin } from "./lib/cors-policy";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { requireStaffSession } from "./lib/context";
import { startSubscriptionRenewalScheduler } from "./lib/microsoft-subscription-renewal";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { securityHeaders } from "./lib/http-security";
import { requestMetrics, serveMetrics } from "./lib/metrics";

const app: Express = express();
app.disable("x-powered-by");
app.use(securityHeaders);
app.use(requestMetrics);
app.get("/api/metrics", serveMetrics);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
allowedOrigins(); // Validate configuration before serving traffic.
app.use((req, res, next) => {
  if (!isAllowedOrigin(req.headers.origin)) {
    res.status(403).json({ error: "Origin not allowed", code: "ORIGIN_NOT_ALLOWED" }); return;
  }
  next();
});
app.use(cors({ origin: (origin, callback) => callback(null, isAllowedOrigin(origin)), credentials: true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "..", "public");

app.use(express.static(publicDir, {
  maxAge: "1h",
  etag: true,
}));

// Health checks and auth session creation are deliberately the only public
// API endpoints. Every other route is a staff-only application surface.
app.use("/api", (req, res, next) => {
  const publicPath = req.path === "/healthz" || req.path.startsWith("/auth/") || req.path === "/microsoft/webhook";
  if (publicPath) {
    next();
    return;
  }
  void requireStaffSession(req, res, next);
});
app.use("/api", router);

app.get("/{*splat}", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

const stopSubscriptionRenewal = startSubscriptionRenewalScheduler();

process.on("SIGTERM", () => stopSubscriptionRenewal());
process.on("SIGINT", () => stopSubscriptionRenewal());

export default app;
