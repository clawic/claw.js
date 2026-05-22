import { afterEach, expect, test, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveClawGlobalDataStorageDir } from "@clawjs/core";
import { loadConfig } from "../../src/server/config.ts";

const WORKER_ENV_KEYS = [
  "CLAW_PUBLISHING_WORKER_TICK_MS",
  "CLAW_PUBLISHING_WORKER_IDLE_MIN_MS",
  "CLAW_PUBLISHING_WORKER_IDLE_MAX_MS",
  "CLAW_PUBLISHING_WORKER_BUDGET",
];
const ORIGINAL_WORKER_ENV = new Map(WORKER_ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  vi.unstubAllEnvs();
  restoreWorkerEnv();
});

test("publishing worker uses adaptive idle defaults", () => {
  clearWorkerEnv();

  const config = loadConfig();

  expect(config.workerIdleMinMs).toBe(1000);
  expect(config.workerIdleMaxMs).toBe(30000);
  expect(config.workerBudget).toBe(25);
});

test("publishing accepts legacy worker tick env as idle min alias", () => {
  clearWorkerEnv();
  vi.stubEnv("CLAW_PUBLISHING_WORKER_TICK_MS", "2500");

  const config = loadConfig();

  expect(config.workerIdleMinMs).toBe(2500);
});

test("publishing global data fallback uses the central global data storage helper", () => {
  const source = fs.readFileSync(new URL("../../src/server/config.ts", import.meta.url), "utf8");

  expect(resolveClawGlobalDataStorageDir({ homeDir: "/Users/demo" })).toBe("/Users/demo/.claw/data");
  expect(source).toMatch(/resolveClawGlobalDataStorageDir/);
  expect(/path\.join\(expandHome\(process\.env\.CLAW_HOME\), "data"\)/.test(source)).toBe(false);
  expect(/resolveClawPersistentSurfacePath\("claw\.global\.data"\)/.test(source)).toBe(false);
  expect(/clawGlobalHomeLayout[.]data/.test(source)).toBe(false);
});

test("publishing config preserves service and shared global data override precedence", () => {
  withPatchedEnv(
    {
      CLAW_PUBLISHING_DATA_DIR: path.join(os.tmpdir(), "publishing-service-data"),
      CLAW_DATA_DIR: path.join(os.tmpdir(), "publishing-shared-data"),
      CLAW_HOME: path.join(os.tmpdir(), "publishing-home"),
    },
    () => {
      expect(loadConfig().dataDir).toBe(path.join(os.tmpdir(), "publishing-service-data"));
    },
  );

  withPatchedEnv(
    {
      CLAW_PUBLISHING_DATA_DIR: undefined,
      CLAW_DATA_DIR: path.join(os.tmpdir(), "publishing-shared-data"),
      CLAW_HOME: path.join(os.tmpdir(), "publishing-home"),
    },
    () => {
      expect(loadConfig().dataDir).toBe(path.join(os.tmpdir(), "publishing-shared-data"));
    },
  );

  withPatchedEnv(
    {
      CLAW_PUBLISHING_DATA_DIR: undefined,
      CLAW_DATA_DIR: undefined,
      CLAW_HOME: path.join(os.tmpdir(), "publishing-home"),
    },
    () => {
      expect(loadConfig().dataDir).toBe(path.join(os.tmpdir(), "publishing-home", "data"));
    },
  );
});

function clearWorkerEnv(): void {
  for (const key of WORKER_ENV_KEYS) delete process.env[key];
}

function restoreWorkerEnv(): void {
  for (const key of WORKER_ENV_KEYS) {
    const value = ORIGINAL_WORKER_ENV.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function withPatchedEnv<TValue>(env: Record<string, string | undefined>, fn: () => TValue): TValue {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
