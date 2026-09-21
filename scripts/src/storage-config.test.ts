import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getStorageEnvStatus, assertProductionStorageConfigured } from "../../artifacts/api-server/src/lib/objectStorage";

const REQUIRED = [
  "S3_ENDPOINT",
  "S3_BUCKET",
  "S3_ACCESS_KEY",
  "S3_SECRET_KEY",
  "PRIVATE_OBJECT_DIR",
  "PUBLIC_OBJECT_SEARCH_PATHS",
] as const;

const PRESET = {
  S3_ENDPOINT: "http://infra-minio:9000",
  S3_BUCKET: "apz-legal-replit",
  S3_ACCESS_KEY: "minioadmin",
  S3_SECRET_KEY: "supersecret",
  PRIVATE_OBJECT_DIR: "apz-legal-replit/private",
  PUBLIC_OBJECT_SEARCH_PATHS: "apz-legal-replit/public",
} as const;

function withClearedStorageEnv<T>(run: () => T): T {
  const previous: Record<string, string | undefined> = {};
  for (const key of REQUIRED) {
    previous[key] = process.env[key];
    delete process.env[key];
  }
  try {
    return run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function setEnv(patch: Record<string, string>): () => void {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(patch)) {
    previous[key] = process.env[key];
    process.env[key] = value;
  }
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

describe("production object-storage configuration validation", () => {
  it("reports every required variable as missing when none are set", () => {
    withClearedStorageEnv(() => {
      const status = getStorageEnvStatus();
      assert.equal(status.ok, false);
      assert.deepEqual([...status.missing].sort(), [...REQUIRED].sort());
      assert.match(status.error ?? "", /S3_ENDPOINT, S3_BUCKET/);
      assert.match(status.error ?? "", /PRIVATE_OBJECT_DIR/);
      assert.match(status.error ?? "", /PUBLIC_OBJECT_SEARCH_PATHS/);
      assert.match(status.error ?? "", /S3_SECRET_KEY/);
    });
  });

  it("reports only the absent variables when some are present", () => {
    withClearedStorageEnv(() => {
      const restore = setEnv({ S3_ENDPOINT: PRESET.S3_ENDPOINT, S3_BUCKET: PRESET.S3_BUCKET });
      try {
        const status = getStorageEnvStatus();
        assert.equal(status.ok, false);
        assert.deepEqual([...status.missing].sort(), ["PRIVATE_OBJECT_DIR", "PUBLIC_OBJECT_SEARCH_PATHS", "S3_ACCESS_KEY", "S3_SECRET_KEY"]);
      } finally {
        restore();
      }
    });
  });

  it("is ok when every required variable is present", () => {
    withClearedStorageEnv(() => {
      const restore = setEnv(PRESET);
      try {
        const status = getStorageEnvStatus();
        assert.equal(status.ok, true);
        assert.equal(status.missing.length, 0);
      } finally {
        restore();
      }
    });
  });

  it("assertProductionStorageConfigured throws a clear, aggregated error when config is absent", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    withClearedStorageEnv(() => {
      process.env.NODE_ENV = "production";
      assert.throws(() => assertProductionStorageConfigured(), (err: Error) => {
        assert.match(err.message, /not configured/);
        assert.match(err.message, /S3_SECRET_KEY/);
        assert.match(err.message, /PRIVATE_OBJECT_DIR/);
        return true;
      });
    });
    process.env.NODE_ENV = previousNodeEnv;
  });

  it("assertProductionStorageConfigured does not throw when fully configured", () => {
    withClearedStorageEnv(() => {
      const restore = setEnv(PRESET);
      try {
        assert.doesNotThrow(() => assertProductionStorageConfigured());
      } finally {
        restore();
      }
    });
  });
});
