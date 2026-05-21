import { afterEach, expect, test, vi } from "vitest";

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
