import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { clawApiPath } from "@clawjs/core";

import { buildSessionsApp } from "./app.ts";

test("buildSessionsApp and health do not open the sessions database", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-sessions-lazy-app-"));
  const dbPath = path.join(rootDir, "sessions.sqlite");
  const { app } = buildSessionsApp({
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
