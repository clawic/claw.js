import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { buildSessionsApp } from "./app.ts";
import { importCodexSessionsDir } from "./adapters/codex.ts";
import { SessionsServiceStore } from "./store.ts";

const THREAD_A = "019e2b9c-bfc0-7ed2-ad43-a81cf8904302";
const THREAD_B = "019e2b9c-c2e8-7a70-a03f-76d065697122";

function tempRoot(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function rolloutPath(rootDir: string, threadId: string): string {
  const dir = path.join(rootDir, "2026", "05", "20");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `rollout-2026-05-20T10-00-00-${threadId}.jsonl`);
}

function writeRollout(rootDir: string, threadId: string, message: string): string {
  const filePath = rolloutPath(rootDir, threadId);
  const lines = [
    {
      timestamp: "2026-05-20T10:00:00.000Z",
      type: "session_meta",
      payload: {
        id: threadId,
        timestamp: "2026-05-20T10:00:00.000Z",
        cwd: rootDir,
        originator: "codex-cli",
        cli_version: "test",
        git: { branch: "main" },
      },
    },
    {
      timestamp: "2026-05-20T10:00:01.000Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: message }],
      },
    },
  ];
  fs.writeFileSync(filePath, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`);
  return filePath;
}

test("Codex import persists file fingerprints and skips unchanged files without rereading JSONL", () => {
  const rootDir = tempRoot("clawjs-codex-import-");
  const dbPath = path.join(rootDir, "sessions.sqlite");
  const codexDir = path.join(rootDir, "codex-sessions");
  const filePath = writeRollout(codexDir, THREAD_A, "first message");
  const store = new SessionsServiceStore(dbPath);

  const first = importCodexSessionsDir(store, codexDir);
  assert.equal(first.scanned, 1);
  assert.equal(first.changedFiles, 1);
  assert.equal(first.imported[0]?.messagesImported, 1);

  const origin = store.findOriginByPath(filePath);
  assert.equal(origin?.sourceSize, fs.statSync(filePath).size);
  assert.equal(typeof origin?.sourceMtimeMs, "number");
  assert.equal(typeof origin?.sourceIno, "number");
  assert.equal(typeof origin?.sourceDev, "number");

  const second = importCodexSessionsDir(store, codexDir);
  assert.equal(second.changedFiles, 0);
  assert.equal(second.skipped, 1);
  assert.equal(second.imported[0]?.reason, "unchanged_fingerprint");
  assert.equal(store.getSessionWithMessages(THREAD_A)?.messages.length, 1);
  store.close();
});

test("Codex import only reparses changed files and budget limits processed files", () => {
  const rootDir = tempRoot("clawjs-codex-incremental-");
  const dbPath = path.join(rootDir, "sessions.sqlite");
  const codexDir = path.join(rootDir, "codex-sessions");
  const fileA = writeRollout(codexDir, THREAD_A, "first message");
  writeRollout(codexDir, THREAD_B, "second message");
  const store = new SessionsServiceStore(dbPath);

  const initial = importCodexSessionsDir(store, codexDir);
  assert.equal(initial.scanned, 2);
  assert.equal(initial.changedFiles, 2);

  fs.appendFileSync(fileA, `${JSON.stringify({
    timestamp: "2026-05-20T10:00:02.000Z",
    type: "response_item",
    payload: {
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: "changed file reply" }],
    },
  })}\n`);

  const incremental = importCodexSessionsDir(store, codexDir);
  assert.equal(incremental.scanned, 2);
  assert.equal(incremental.changedFiles, 1);
  assert.equal(incremental.skipped, 1);
  assert.equal(store.getSessionWithMessages(THREAD_A)?.messages.length, 2);
  assert.equal(store.getSessionWithMessages(THREAD_B)?.messages.length, 1);

  const limited = importCodexSessionsDir(store, codexDir, { maxFiles: 1 });
  assert.equal(limited.scanned, 1);
  assert.equal(limited.imported.length, 1);
  assert.equal(limited.budgetExhausted, true);
  store.close();
});

test("Codex force import bypasses the fingerprint fast path without duplicating messages", () => {
  const rootDir = tempRoot("clawjs-codex-force-");
  const dbPath = path.join(rootDir, "sessions.sqlite");
  const codexDir = path.join(rootDir, "codex-sessions");
  writeRollout(codexDir, THREAD_A, "first message");
  const store = new SessionsServiceStore(dbPath);

  assert.equal(importCodexSessionsDir(store, codexDir).changedFiles, 1);
  const forced = importCodexSessionsDir(store, codexDir, { forceReimport: true });
  assert.equal(forced.changedFiles, 1);
  assert.equal(forced.imported[0]?.skipped, false);
  assert.equal(forced.imported[0]?.messagesImported, 0);
  assert.equal(store.getSessionWithMessages(THREAD_A)?.messages.length, 1);
  store.close();
});

test("sessions import/codex endpoint accepts incremental budget options", async () => {
  const rootDir = tempRoot("clawjs-codex-endpoint-");
  const dataDir = path.join(rootDir, "data");
  const codexDir = path.join(rootDir, "codex-sessions");
  writeRollout(codexDir, THREAD_A, "first message");
  writeRollout(codexDir, THREAD_B, "second message");
  const { app } = buildSessionsApp({
    config: {
      dataDir,
      dbPath: path.join(dataDir, "sessions.sqlite"),
      codexSessionsDir: codexDir,
      sharedSecret: "test-secret",
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/v1/sessions/import/codex",
    headers: { authorization: "Bearer test-secret" },
    payload: {
      mode: "incremental",
      budgetMs: 1000,
      maxFiles: 1,
    },
  });
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body) as { scanned: number; imported: unknown[]; budgetExhausted: boolean; changedFiles: number };
  assert.equal(body.scanned, 1);
  assert.equal(body.imported.length, 1);
  assert.equal(body.budgetExhausted, true);
  assert.equal(body.changedFiles, 1);
  await app.close();
});
