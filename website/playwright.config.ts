import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export default defineConfig({
  testDir: path.join(ROOT_DIR, "tests", "e2e"),
  testMatch: ["website-home.spec.ts"],
  fullyParallel: false,
  workers: 1,
  timeout: 240_000,
  outputDir: path.join(ROOT_DIR, "website", "test-results"),
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1600, height: 1000 },
  },
  projects: [
    {
      name: "chromium",
      use: devices["Desktop Chrome"],
    },
  ],
});
