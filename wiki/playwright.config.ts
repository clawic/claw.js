import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

const tmpRoot = path.join(process.cwd(), ".tmp", "playwright");

export default defineConfig({
  testDir: path.join(process.cwd(), "tests", "e2e"),
  testMatch: ["ui.spec.ts"],
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  outputDir: path.join(process.cwd(), "test-results"),
  use: {
    baseURL: "http://127.0.0.1:4520",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 1024 },
  },
  webServer: {
    command: "npm run start",
    cwd: process.cwd(),
    url: "http://127.0.0.1:4520/v1/health",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      WIKI_HOST: "127.0.0.1",
      WIKI_PORT: "4520",
      WIKI_DATA_DIR: path.join(tmpRoot, "data"),
      WIKI_DB_PATH: path.join(tmpRoot, "data", "wiki.sqlite"),
      WIKI_JWT_SECRET: "wiki-playwright-secret",
    },
  },
  projects: [
    {
      name: "chromium",
      use: devices["Desktop Chrome"],
    },
  ],
});
