import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["dist/test/e2e.spec.js"],
    testTimeout: 60000,
    hookTimeout: 60000,
    pool: "forks",
  },
});
