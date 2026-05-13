import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

const outputRoot = path.join(process.cwd(), ".tmp", "playwright");

export default defineConfig({
  testDir: path.join(process.cwd(), "tests", "e2e"),
  testMatch: ["ui.spec.ts"],
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  use: {
    baseURL: "http://127.0.0.1:4650",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 1040 },
  },
  outputDir: path.join(process.cwd(), "test-results"),
  webServer: {
    command: "npx tsx src/bin/server.ts",
    cwd: process.cwd(),
    url: "http://127.0.0.1:4650/v1/health",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      CONTENT_HOST: "127.0.0.1",
      CONTENT_PORT: "4650",
      CONTENT_DATA_DIR: path.join(outputRoot, "data"),
      CONTENT_DB_PATH: path.join(outputRoot, "data", "clawjs.sqlite"),
      CONTENT_JWT_SECRET: "content-playwright-secret",
      CONTENT_ADMIN_EMAIL: "admin@content.local",
      CONTENT_ADMIN_PASSWORD: "content-admin",
      CONTENT_TIME_BASE_URL: "http://127.0.0.1:4730"
    },
  },
  projects: [
    {
      name: "chromium",
      use: devices["Desktop Chrome"],
    },
  ],
});
