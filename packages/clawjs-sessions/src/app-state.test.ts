import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { clawApiPath } from "@clawjs/core";

import { buildSessionsApp } from "./app.ts";

test("sessions exposes authenticated host app-state apply and projection", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-sessions-app-state-"));
  const previousEnv = {
    CLAW_DB_PATH: process.env.CLAW_DB_PATH,
    CLAW_FILES_DIR: process.env.CLAW_FILES_DIR,
  };
  process.env.CLAW_DB_PATH = path.join(rootDir, "core.sqlite");
  process.env.CLAW_FILES_DIR = path.join(rootDir, "files");

  const built = buildSessionsApp({
    config: {
      sharedSecret: "test-secret",
      dataDir: path.join(rootDir, "sessions"),
      dbPath: path.join(rootDir, "sessions.sqlite"),
    },
  });
  const app = built.app;
  try {
    await app.ready();

    const apply = await app.inject({
      method: "POST",
      url: clawApiPath("host/app-state/apply"),
      headers: { authorization: "Bearer test-secret" },
      payload: {
        requestId: "req-sessions-app-state",
        hostId: "clawix-test",
        operations: [
          { kind: "project.upsert", id: "proj-http", resourceId: "res_http", name: "HTTP", path: rootDir, sortOrder: 1000 },
          { kind: "title.upsert", threadId: "thread-http", title: "HTTP thread", source: "test" },
        ],
      },
    });
    assert.equal(apply.statusCode, 200);
    const applied = JSON.parse(apply.body) as {
      receipt: { requestId: string; hostId: string; status: string };
      projection: { projects: Array<{ id: string; resourceId: string }> };
    };
    assert.equal(applied.receipt.requestId, "req-sessions-app-state");
    assert.equal(applied.receipt.hostId, "clawix-test");
    assert.equal(applied.receipt.status, "applied");
    assert.equal(applied.projection.projects[0]?.resourceId, "res_http");

    const projection = await app.inject({
      method: "GET",
      url: `${clawApiPath("host/app-state/projection")}?limit=50&receiptLimit=5`,
      headers: { authorization: "Bearer test-secret" },
    });
    assert.equal(projection.statusCode, 200);
    const projected = JSON.parse(projection.body) as {
      titles: Array<{ threadId: string; title: string }>;
      receipts: Array<{ requestId: string }>;
    };
    assert.equal(projected.titles[0]?.title, "HTTP thread");
    assert.equal(projected.receipts[0]?.requestId, "req-sessions-app-state");
  } finally {
    await app.close();
    if (previousEnv.CLAW_DB_PATH === undefined) delete process.env.CLAW_DB_PATH;
    else process.env.CLAW_DB_PATH = previousEnv.CLAW_DB_PATH;
    if (previousEnv.CLAW_FILES_DIR === undefined) delete process.env.CLAW_FILES_DIR;
    else process.env.CLAW_FILES_DIR = previousEnv.CLAW_FILES_DIR;
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
