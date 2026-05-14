import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["tests/setup/vitest-node-test-compat.ts"],
    include: [
      "packages/**/*.test.ts",
      "apps/board/src/lib/**/*.test.ts",
      "bridge/tests/**/*.test.ts",
      "delegation/src/**/*.test.ts",
      "examples/showcase/src/lib/**/*.test.ts",
      "publishing/tests/unit/**/*.test.ts",
      "relay/src/**/*.test.ts",
      "time/src/**/*.test.ts",
      "scripts/**/*.test.mjs",
    ],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.tmp*/**",
      "**/tests/e2e/**",
      "tests/e2e/**",
      "**/ui/**",
    ],
    passWithNoTests: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: "forks",
    fileParallelism: false,
  },
});
