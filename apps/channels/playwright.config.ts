import path from "path";

import { defineConfig, devices } from "@playwright/test";

const appRoot = process.cwd();

export default defineConfig({
  testDir: path.join(appRoot, "tests", "e2e"),
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  outputDir: path.join(appRoot, "test-results"),
  use: {
    baseURL: "http://127.0.0.1:4361",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1512, height: 982 },
  },
  webServer: [
    {
      command: "cd ../../notify && npm run start",
      url: "http://127.0.0.1:24112/v1/health",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NOTIFY_PORT: "24112",
        NOTIFY_HOST: "127.0.0.1",
        NOTIFY_DATA_DIR: path.join(appRoot, ".tmp", "notify-data"),
        NOTIFY_DB_PATH: path.join(appRoot, ".tmp", "notify-data", "notify.sqlite"),
      },
    },
    {
      command: "NEXT_DIST_DIR=.next-e2e NOTIFY_BASE_URL=http://127.0.0.1:24112 npx next start --port 4361",
      url: "http://127.0.0.1:4361",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        PORT: "4361",
        NOTIFY_BASE_URL: "http://127.0.0.1:24112",
      },
    },
  ],
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
