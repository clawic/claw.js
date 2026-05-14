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
    baseURL: "http://127.0.0.1:4738",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 980 },
  },
  outputDir: path.join(process.cwd(), "test-results"),
  webServer: {
    command: "rm -rf .tmp/playwright artifacts && npx tsx src/serve-dashboard.ts --root .tmp/playwright/workspace --port 4738",
    cwd: process.cwd(),
    url: "http://127.0.0.1:4738/v1/health",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      CLAW_DAY_ROOT: path.join(outputRoot, "workspace"),
      CLAW_DATA_DIR: path.join(outputRoot, "data"),
    },
  },
  projects: [
    {
      name: "chromium",
      use: devices["Desktop Chrome"],
    },
  ],
});
