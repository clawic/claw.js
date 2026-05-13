import fs from "node:fs";
import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

const tmpRoot = path.join(process.cwd(), ".tmp", "playwright");
fs.mkdirSync(tmpRoot, { recursive: true });

export default defineConfig({
  testDir: path.join(process.cwd(), "tests", "e2e"),
  testMatch: ["ui.spec.ts"],
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  outputDir: path.join(process.cwd(), "test-results"),
  use: {
    baseURL: "http://127.0.0.1:24114",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 1024 },
  },
  webServer: {
    command: "npx tsx src/server/main.ts",
    cwd: process.cwd(),
    url: "http://127.0.0.1:24114/api/summary",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      CLAW_MONITOR_HOST: "127.0.0.1",
      CLAW_MONITOR_PORT: "24114",
      CLAW_MONITOR_DB_PATH: path.join(tmpRoot, "monitor.sqlite"),
      CLAW_MONITOR_RELAY_URL: "http://127.0.0.1:9",
      CLAW_MONITOR_COLLECT_INTERVAL_MS: "600000",
    },
  },
  projects: [
    {
      name: "chromium",
      use: devices["Desktop Chrome"],
    },
  ],
});
