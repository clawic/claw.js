import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, vi } from "vitest";

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

function appendAssistantMessage(filePath: string, text: string, seconds = 2): void {
  fs.appendFileSync(filePath, `${JSON.stringify({
    timestamp: `2026-05-20T10:00:${String(seconds).padStart(2, "0")}.000Z`,
    type: "response_item",
    payload: {
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text }],
    },
  })}\n`);
}

test("Codex import persists file fingerprints and skips unchanged files without rereading JSONL", async () => {
  const rootDir = tempRoot("clawjs-codex-import-");
  const dbPath = path.join(rootDir, "sessions.sqlite");
  const codexDir = path.join(rootDir, "codex-sessions");
  const filePath = writeRollout(codexDir, THREAD_A, "first message");
  const store = new SessionsServiceStore(dbPath);

  const first = await importCodexSessionsDir(store, codexDir);
  assert.equal(first.scanned, 1);
  assert.equal(first.changedFiles, 1);
  assert.equal(first.imported[0]?.messagesImported, 1);

  const origin = store.findOriginByPath(filePath);
  assert.equal(origin?.sourceSize, fs.statSync(filePath).size);
  assert.equal(typeof origin?.sourceMtimeMs, "number");
  assert.equal(typeof origin?.sourceIno, "number");
  assert.equal(typeof origin?.sourceDev, "number");
  assert.equal(origin?.sourceCursorLine, 1);
  assert.equal(typeof origin?.sourceCursorHash, "string");

  const second = await importCodexSessionsDir(store, codexDir);
  assert.equal(second.changedFiles, 0);
  assert.equal(second.skipped, 1);
  assert.equal(second.imported[0]?.reason, "unchanged_fingerprint");
  assert.equal(store.getSessionWithMessages(THREAD_A)?.messages.length, 1);
  store.close();
});

test("Codex import never uses readFileSync for rollout JSONL files", async () => {
  const rootDir = tempRoot("clawjs-codex-streaming-");
  const dbPath = path.join(rootDir, "sessions.sqlite");
  const codexDir = path.join(rootDir, "codex-sessions");
  writeRollout(codexDir, THREAD_A, "first message");
  const store = new SessionsServiceStore(dbPath);
  const readFileSyncSpy = vi.spyOn(fs, "readFileSync");

  const result = await importCodexSessionsDir(store, codexDir);

  assert.equal(result.changedFiles, 1);
  assert.equal(readFileSyncSpy.mock.calls.length, 0);
  readFileSyncSpy.mockRestore();
  store.close();
});

test("Codex import only parses appended rollout lines when cursor prefix matches", async () => {
  const rootDir = tempRoot("clawjs-codex-append-");
  const dbPath = path.join(rootDir, "sessions.sqlite");
  const codexDir = path.join(rootDir, "codex-sessions");
  const filePath = writeRollout(codexDir, THREAD_A, "first message");
  const store = new SessionsServiceStore(dbPath);

  const initial = await importCodexSessionsDir(store, codexDir);
  assert.equal(initial.imported[0]?.messagesImported, 1);
  const initialOrigin = store.findOriginByPath(filePath);
  assert.equal(initialOrigin?.sourceCursorLine, 1);

  appendAssistantMessage(filePath, "appended reply");
  const incremental = await importCodexSessionsDir(store, codexDir);

  assert.equal(incremental.changedFiles, 1);
  assert.equal(incremental.imported[0]?.messagesImported, 1);
  assert.deepEqual(
    store.getSessionWithMessages(THREAD_A)?.messages.map((message) => message.contentText),
    ["first message", "appended reply"],
  );
  const updatedOrigin = store.findOriginByPath(filePath);
  assert.equal(updatedOrigin?.sourceCursorLine, 2);
  assert.notEqual(updatedOrigin?.sourceCursorHash, initialOrigin?.sourceCursorHash);
  store.close();
});

test("Codex import falls back to full streaming reimport when cursor prefix changed", async () => {
  const rootDir = tempRoot("clawjs-codex-rewrite-");
  const dbPath = path.join(rootDir, "sessions.sqlite");
  const codexDir = path.join(rootDir, "codex-sessions");
  const filePath = writeRollout(codexDir, THREAD_A, "first message");
  const store = new SessionsServiceStore(dbPath);

  await importCodexSessionsDir(store, codexDir);
  const original = fs.readFileSync(filePath, "utf8");
  fs.writeFileSync(filePath, original.replace("first message", "rewritten message"));

  const reimport = await importCodexSessionsDir(store, codexDir);

  assert.equal(reimport.changedFiles, 1);
  assert.equal(reimport.imported[0]?.messagesImported, 0);
  assert.deepEqual(
    store.getSessionWithMessages(THREAD_A)?.messages.map((message) => message.contentText),
    ["first message"],
  );
  assert.equal(store.findOriginByPath(filePath)?.sourceCursorLine, 1);
  store.close();
});

test("Codex import batches large rollout imports transactionally", async () => {
  const rootDir = tempRoot("clawjs-codex-batch-");
  const dbPath = path.join(rootDir, "sessions.sqlite");
  const codexDir = path.join(rootDir, "codex-sessions");
  const filePath = writeRollout(codexDir, THREAD_A, "first message");
  for (let index = 0; index < 12; index += 1) {
    appendAssistantMessage(filePath, `batch reply ${index}`, index + 2);
  }
  const store = new SessionsServiceStore(dbPath);

  const result = await importCodexSessionsDir(store, codexDir, { batchSize: 3 });

  assert.equal(result.imported[0]?.messagesImported, 13);
  const session = store.getSessionWithMessages(THREAD_A, 20);
  assert.equal(session?.session.messageCount, 13);
  assert.equal(session?.messages.length, 13);
  assert.equal(store.findOriginByPath(filePath)?.sourceCursorLine, 13);
  store.close();
});

test("Codex import only reparses changed files and budget limits processed files", async () => {
  const rootDir = tempRoot("clawjs-codex-incremental-");
  const dbPath = path.join(rootDir, "sessions.sqlite");
  const codexDir = path.join(rootDir, "codex-sessions");
  const fileA = writeRollout(codexDir, THREAD_A, "first message");
  writeRollout(codexDir, THREAD_B, "second message");
  const store = new SessionsServiceStore(dbPath);

  const initial = await importCodexSessionsDir(store, codexDir);
  assert.equal(initial.scanned, 2);
  assert.equal(initial.changedFiles, 2);

  appendAssistantMessage(fileA, "changed file reply");

  const incremental = await importCodexSessionsDir(store, codexDir);
  assert.equal(incremental.scanned, 2);
  assert.equal(incremental.changedFiles, 1);
  assert.equal(incremental.skipped, 1);
  assert.equal(store.getSessionWithMessages(THREAD_A)?.messages.length, 2);
  assert.equal(store.getSessionWithMessages(THREAD_B)?.messages.length, 1);

  const limited = await importCodexSessionsDir(store, codexDir, { maxFiles: 1 });
  assert.equal(limited.scanned, 1);
  assert.equal(limited.imported.length, 1);
  assert.equal(limited.budgetExhausted, true);
  store.close();
});

test("Codex force import bypasses the fingerprint fast path without duplicating messages", async () => {
  const rootDir = tempRoot("clawjs-codex-force-");
  const dbPath = path.join(rootDir, "sessions.sqlite");
  const codexDir = path.join(rootDir, "codex-sessions");
  writeRollout(codexDir, THREAD_A, "first message");
  const store = new SessionsServiceStore(dbPath);

  assert.equal((await importCodexSessionsDir(store, codexDir)).changedFiles, 1);
  const forced = await importCodexSessionsDir(store, codexDir, { forceReimport: true });
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
