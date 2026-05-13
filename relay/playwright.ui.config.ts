import fs from "node:fs";
import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

const tmpRoot = path.join(process.cwd(), ".tmp", "playwright-ui");
fs.mkdirSync(tmpRoot, { recursive: true });

export default defineConfig({
  testDir: path.join(process.cwd(), "tests", "e2e"),
  testMatch: ["ui.spec.ts"],
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  outputDir: path.join(process.cwd(), "test-results-ui"),
  use: {
    baseURL: "http://127.0.0.1:4410",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 1024 },
  },
  webServer: {
    command: "npx tsx src/bin/server.ts",
    cwd: process.cwd(),
    url: "http://127.0.0.1:4410/v1/health",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      RELAY_HOST: "127.0.0.1",
      PORT: "4410",
      RELAY_DB_PATH: path.join(tmpRoot, "infra.sqlite"),
      RELAY_JWT_SECRET: "relay-playwright-ui-secret",
      RELAY_PUBLIC_BASE_URL: "http://127.0.0.1:4410",
    },
  },
  projects: [
    {
      name: "chromium",
      use: devices["Desktop Chrome"],
    },
  ],
});
