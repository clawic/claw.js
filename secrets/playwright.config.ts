import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

const outputRoot = path.join(process.cwd(), ".tmp", "playwright");
const testPort = 25103;

export default defineConfig({
  testDir: path.join(process.cwd(), "tests", "e2e"),
  testMatch: ["admin.spec.ts"],
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  use: {
    baseURL: `http://127.0.0.1:${testPort}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 1040 },
  },
  outputDir: path.join(process.cwd(), "test-results"),
  webServer: {
    command: "rm -rf .tmp/playwright/data && npm run start",
    cwd: process.cwd(),
    url: `http://127.0.0.1:${testPort}/v1/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      CLAW_SECRETS_HOST: "127.0.0.1",
      CLAW_SECRETS_PORT: String(testPort),
      CLAW_SECRETS_DATA_DIR: path.join(outputRoot, "data"),
      CLAW_SECRETS_DB_PATH: path.join(outputRoot, "data", "vault.sqlite"),
      CLAW_SECRETS_JWT_SECRET: "secrets-playwright-secret",
      CLAW_SECRETS_ADMIN_TOKEN: "secrets-admin",
      CLAW_SECRETS_SIGNED_HOST_TOKEN: "secrets-test-signed-host",
      CLAW_SECRETS_UI_DIST_DIR: path.join(process.cwd(), "ui", "dist"),
    },
  },
  projects: [
    {
      name: "chromium",
      use: devices["Desktop Chrome"],
    },
  ],
});
