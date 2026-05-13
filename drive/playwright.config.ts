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
    baseURL: "http://127.0.0.1:4632",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 980 },
  },
  outputDir: path.join(process.cwd(), "test-results"),
  webServer: {
    command: "rm -rf .tmp/playwright/data && npm run start",
    cwd: process.cwd(),
    url: "http://127.0.0.1:4632/v1/health",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      CLAW_DRIVE_HOST: "127.0.0.1",
      CLAW_DRIVE_PORT: "4632",
      CLAW_DRIVE_DATA_DIR: path.join(outputRoot, "data"),
      CLAW_DRIVE_DB_PATH: path.join(outputRoot, "data", "drive.sqlite"),
      CLAW_DRIVE_JWT_SECRET: "drive-playwright-secret",
      CLAW_DRIVE_UI_DIST_DIR: path.join(process.cwd(), "ui", "dist"),
      CLAW_DRIVE_CONVERTER_MODE: "mock",
    },
  },
  projects: [
    {
      name: "chromium",
      use: devices["Desktop Chrome"],
    },
  ],
});
