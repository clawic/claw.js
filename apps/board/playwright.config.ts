import fs from "node:fs";
import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

const tmpRoot = path.join(process.cwd(), ".tmp", "playwright");
fs.mkdirSync(tmpRoot, { recursive: true });

export default defineConfig({
  testDir: path.join(process.cwd(), "tests", "e2e"),
  testMatch: ["app.spec.ts"],
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  outputDir: path.join(process.cwd(), "test-results"),
  use: {
    baseURL: "http://127.0.0.1:4460",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 1024 },
  },
  webServer: {
    command: "node tests/e2e/test-env.mjs",
    cwd: process.cwd(),
    url: "http://127.0.0.1:4460/api/companies",
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      COMPANY_E2E_ROOT: tmpRoot,
      COMPANY_E2E_APP_PORT: "4460",
      COMPANY_E2E_DATABASE_PORT: "4516",
    },
  },
  projects: [
    {
      name: "chromium",
      use: devices["Desktop Chrome"],
    },
  ],
});
