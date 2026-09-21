import app from "./app";
import { logger } from "./lib/logger";
import { assertProductionStorageConfigured, getStorageEnvStatus } from "./lib/objectStorage";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// In production, fail fast and clearly when mandatory object-storage
// configuration is absent, instead of letting authenticated callers hit 500s
// at request time. In non-production modes storage is optional, so only a
// warning is emitted.
if (process.env.NODE_ENV === "production") {
  assertProductionStorageConfigured();
} else {
  const status = getStorageEnvStatus();
  if (!status.ok) {
    logger.warn(
      { missing: status.missing },
      "Production object-storage configuration is not set in non-production mode; storage endpoints will be unavailable.",
    );
  }
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
