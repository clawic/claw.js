import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["dist/test/*.spec.js"],
    exclude: ["dist/test/e2e.spec.js"],
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: "forks",
  },
});
