import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

const outputRoot = path.join(process.cwd(), ".tmp", "playwright");

export default defineConfig({
  testDir: path.join(process.cwd(), "tests", "e2e"),
  testMatch: ["admin.spec.ts"],
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  use: {
    baseURL: "http://127.0.0.1:4510",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 1040 },
  },
  outputDir: path.join(process.cwd(), "test-results"),
  webServer: {
    command: "npx tsx src/bin/server.ts",
    cwd: process.cwd(),
    url: "http://127.0.0.1:4510/v1/health",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      CLAW_DATABASE_HOST: "127.0.0.1",
      CLAW_DATABASE_PORT: "4510",
      CLAW_DATABASE_DATA_DIR: path.join(outputRoot, "data"),
      CLAW_DATABASE_DB_PATH: path.join(outputRoot, "data", "core.sqlite"),
      CLAW_DATABASE_FILES_DIR: path.join(outputRoot, "data", "files"),
      CLAW_DATABASE_JWT_SECRET: "database-playwright-secret",
    },
  },
  projects: [
    {
      name: "chromium",
      use: devices["Desktop Chrome"],
    },
  ],
});
