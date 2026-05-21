import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { clawApiPath } from "@clawjs/core";

import { buildRuntimeApp } from "./app.ts";

test("buildRuntimeApp and health do not open the runtime database", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-runtime-lazy-app-"));
  const dbPath = path.join(rootDir, "runtime.sqlite");
  const { app } = buildRuntimeApp({
    config: {
      dataDir: rootDir,
      dbPath,
      sharedSecret: "test-secret",
    },
  });

  assert.equal(fs.existsSync(dbPath), false);
  const health = await app.inject({ method: "GET", url: clawApiPath("health") });
  assert.equal(health.statusCode, 200);
  assert.equal(fs.existsSync(dbPath), false);
  await app.close();
});
