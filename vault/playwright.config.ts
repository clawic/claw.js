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
    baseURL: "http://127.0.0.1:4610",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 1040 },
  },
  outputDir: path.join(process.cwd(), "test-results"),
  webServer: {
    command: "rm -rf .tmp/playwright/data && npm run start",
    cwd: process.cwd(),
    url: "http://127.0.0.1:4610/v1/health",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VAULT_HOST: "127.0.0.1",
      VAULT_PORT: "4610",
      VAULT_DATA_DIR: path.join(outputRoot, "data"),
      VAULT_DB_PATH: path.join(outputRoot, "data", "vault.sqlite"),
      VAULT_JWT_SECRET: "vault-playwright-secret",
      VAULT_UI_DIST_DIR: path.join(process.cwd(), "ui", "dist"),
    },
  },
  projects: [
    {
      name: "chromium",
      use: devices["Desktop Chrome"],
    },
  ],
});
