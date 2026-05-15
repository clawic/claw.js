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
    baseURL: "http://127.0.0.1:4530",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 1040 },
  },
  outputDir: path.join(process.cwd(), "test-results"),
  webServer: {
    command: "cd ui && npx vite build && cd .. && npx tsx src/bin/server.ts",
    cwd: process.cwd(),
    url: "http://127.0.0.1:4530/v1/health",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ERP_HOST: "127.0.0.1",
      ERP_PORT: "4530",
      ERP_DATA_DIR: path.join(outputRoot, "data"),
      ERP_DB_PATH: path.join(outputRoot, "data", "core.sqlite"),
      ERP_JWT_SECRET: "erp-playwright-secret",
      ERP_ADMIN_EMAIL: "admin@erp.local",
      ERP_ADMIN_PASSWORD: "erp-admin",
    },
  },
  projects: [
    {
      name: "chromium",
      use: devices["Desktop Chrome"],
    },
  ],
});
