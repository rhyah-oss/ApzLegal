import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { requireStaffSession } from "./lib/context";
import { startSubscriptionRenewalScheduler } from "./lib/microsoft-subscription-renewal";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app: Express = express();

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
app.use(cors({ origin: true, credentials: true }));
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
