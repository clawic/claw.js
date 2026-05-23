import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { test, vi } from "vitest";

import { buildSessionsApp } from "./app.ts";
import { importCodexSessionsDir } from "./adapters/codex.ts";
import { SessionsServiceStore } from "./store.ts";

const THREAD_A = ["019e2b9c", "bfc0", "7ed2", "ad43", "a81cf8904302"].join("-");
const THREAD_B = ["019e2b9c", "c2e8", "7a70", "a03f", "76d065697122"].join("-");

function tempRoot(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function rolloutPath(rootDir: string, threadId: string): string {
  const dir = path.join(rootDir, "2026", "05", "20");
  fs.mkdirSync(dir, { recursive: true });
  const rolloutPrefix = ["rollout", "2026-05-20T10-00-00"].join("-");
  return path.join(dir, `${rolloutPrefix}-${threadId}.jsonl`);
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

function writeLargeRollout(rootDir: string, index: number, messageCount: number): string {
  const threadId = `019e5${String(index).padStart(3, "0")}-cafe-7000-8000-${String(index).padStart(12, "0")}`;
  const dir = path.join(rootDir, "2026", "05", "23");
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `rollout-2026-05-23T11-00-${String(index % 60).padStart(2, "0")}-${threadId}.jsonl`);
  const lines: unknown[] = [
    {
      timestamp: "2026-05-23T11:00:00.000Z",
      type: "session_meta",
      payload: {
        id: threadId,
        timestamp: "2026-05-23T11:00:00.000Z",
        cwd: rootDir,
        originator: "codex-cli",
        cli_version: "test",
        git: { branch: "main" },
      },
    },
  ];
  for (let messageIndex = 0; messageIndex < messageCount; messageIndex += 1) {
    lines.push({
      timestamp: `2026-05-23T11:${String(Math.floor(messageIndex / 60)).padStart(2, "0")}:${String(messageIndex % 60).padStart(2, "0")}.000Z`,
      type: "response_item",
      payload: {
        type: "message",
        role: messageIndex % 2 === 0 ? "user" : "assistant",
        content: [{ type: messageIndex % 2 === 0 ? "input_text" : "output_text", text: `large import needle ${index}-${messageIndex}` }],
      },
    });
  }
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

function appendRolloutLine(filePath: string, line: Record<string, unknown>): void {
  fs.appendFileSync(filePath, `${JSON.stringify(line)}\n`);
}

function fileSnapshot(rootDir: string): Array<{ relativePath: string; size: number; mtimeMs: number; mode: number }> {
  const snapshot: Array<{ relativePath: string; size: number; mtimeMs: number; mode: number }> = [];
  const stack = [rootDir];
  while (stack.length) {
    const dir = stack.pop();
    if (!dir) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const stat = fs.statSync(full);
      snapshot.push({
        relativePath: path.relative(rootDir, full),
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        mode: stat.mode,
      });
    }
  }
  return snapshot.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
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
  assert.equal(store.listSessionEvents({ sessionId: THREAD_A }).length, 2);

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
  assert.equal(store.listSessionEvents({ sessionId: THREAD_A }).length, 2);
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
  assert.deepEqual(
    store.listSessionEvents({ sessionId: THREAD_A }).map((event) => event.eventType),
    ["session_meta", "response_item.message", "response_item.message"],
  );
  const updatedOrigin = store.findOriginByPath(filePath);
  assert.equal(updatedOrigin?.sourceCursorLine, 2);
  assert.notEqual(updatedOrigin?.sourceCursorHash, initialOrigin?.sourceCursorHash);
  store.close();
});

test("Codex import stores structured tool, patch, compaction and unknown events", async () => {
  const rootDir = tempRoot("clawjs-codex-events-");
  const dbPath = path.join(rootDir, "sessions.sqlite");
  const codexDir = path.join(rootDir, "codex-sessions");
  const filePath = writeRollout(codexDir, THREAD_A, "first message");
  appendRolloutLine(filePath, {
    timestamp: "2026-05-20T10:00:02.000Z",
    type: "response_item",
    payload: {
      type: "function_call",
      name: "exec_command",
      call_id: "call_exec",
      turn_id: "turn_1",
      arguments: "{\"cmd\":\"false\"}",
    },
  });
  appendRolloutLine(filePath, {
    timestamp: "2026-05-20T10:00:03.000Z",
    type: "response_item",
    payload: {
      type: "function_call_output",
      call_id: "call_exec",
      turn_id: "turn_1",
      output: "Process exited with code 1\nOutput:\nboom failure",
    },
  });
  appendRolloutLine(filePath, {
    timestamp: "2026-05-20T10:00:04.000Z",
    type: "event_msg",
    payload: {
      type: "patch_apply_end",
      call_id: "call_patch",
      turn_id: "turn_1",
      status: "success",
      stdout: "changed file",
    },
  });
  appendRolloutLine(filePath, {
    timestamp: "2026-05-20T10:00:05.000Z",
    type: "event_msg",
    payload: {
      type: "context_compacted",
      turn_id: "turn_1",
      text: "Context compacted",
    },
  });
  appendRolloutLine(filePath, {
    timestamp: "2026-05-20T10:00:06.000Z",
    type: "event_msg",
    payload: {
      type: "token_count",
      turn_id: "turn_1",
      input_tokens: 12,
      output_tokens: 7,
    },
  });
  appendRolloutLine(filePath, {
    timestamp: "2026-05-20T10:00:07.000Z",
    type: "event_msg",
    payload: {
      type: "turn_aborted",
      turn_id: "turn_1",
      status: "interrupted",
    },
  });
  appendRolloutLine(filePath, {
    timestamp: "2026-05-20T10:00:08.000Z",
    type: "mystery_event",
    payload: {
      text: "unknown but preserved",
    },
  });
  const store = new SessionsServiceStore(dbPath);

  const result = await importCodexSessionsDir(store, codexDir);

  assert.equal(result.changedFiles, 1);
  const events = store.listSessionEvents({ sessionId: THREAD_A });
  assert.deepEqual(events.map((event) => event.eventKind), [
    "lifecycle",
    "message",
    "tool_call",
    "tool_output",
    "patch",
    "compaction",
    "usage",
    "lifecycle",
    "unknown",
  ]);
  assert.equal(events.find((event) => event.callId === "call_exec")?.eventType, "response_item.function_call");
  assert.equal(events.find((event) => event.eventKind === "tool_output")?.searchableText?.includes("boom failure"), true);
  assert.equal(store.searchSessionEvents({ query: "boom", eventKind: "tool_output" }).length, 1);
  const projection = store.rebuildSessionProjection(THREAD_A);
  assert.equal(projection.meta.projectionStatus, "current");
  assert.equal(projection.meta.eventCount, events.length);
  assert.equal(projection.summaries.length, 1);
  assert.equal(projection.summaries[0]?.turnId, "turn_1");
  assert.equal(projection.summaries[0]?.status, "aborted");
  assert.equal(projection.summaries[0]?.completedAt, Date.parse("2026-05-20T10:00:07.000Z"));
  assert.equal(projection.summaries[0]?.toolCallCount, 1);
  assert.equal(projection.summaries[0]?.failedToolCallCount, 1);
  assert.equal(projection.summaries[0]?.diffFileCount, 1);
  assert.equal(projection.summaries[0]?.hasCompaction, true);
  assert.equal(projection.summaries[0]?.tokenInput, 12);
  assert.equal(projection.summaries[0]?.tokenOutput, 7);
  assert.equal(projection.summaries[0]?.aborted, true);
  assert.equal(projection.summaries[0]?.interrupted, true);

  const reimport = await importCodexSessionsDir(store, codexDir, { forceReimport: true });
  assert.equal(reimport.imported[0]?.messagesImported, 0);
  assert.equal(store.listSessionEvents({ sessionId: THREAD_A }).length, events.length);
  store.close();
});

test("Codex import and projection rebuild leave the source rollout tree read-only", async () => {
  const rootDir = tempRoot("clawjs-codex-readonly-");
  const dbPath = path.join(rootDir, "sessions.sqlite");
  const codexDir = path.join(rootDir, "codex-sessions");
  writeRollout(codexDir, THREAD_A, "read-only source");
  const before = fileSnapshot(codexDir);
  const store = new SessionsServiceStore(dbPath);

  const result = await importCodexSessionsDir(store, codexDir);
  assert.equal(result.changedFiles, 1);
  assert.equal(store.rebuildSessionProjection(THREAD_A).meta.projectionStatus, "current");

  assert.deepEqual(fileSnapshot(codexDir), before);
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

  const importedSessionId = (body.imported[0] as { sessionId: string | null }).sessionId;
  assert.ok(importedSessionId);
  const eventsResponse = await app.inject({
    method: "GET",
    url: `/v1/sessions/${encodeURIComponent(importedSessionId)}/events?limit=10`,
    headers: { authorization: "Bearer test-secret" },
  });
  assert.equal(eventsResponse.statusCode, 200);
  const eventsBody = JSON.parse(eventsResponse.body) as { items: Array<{ eventType: string; searchableText: string | null }> };
  assert.deepEqual(eventsBody.items.map((event) => event.eventType), ["session_meta", "response_item.message"]);
  const importedMessageText = eventsBody.items.find((event) => event.eventType === "response_item.message")?.searchableText;
  assert.ok(importedMessageText);

  const eventSearchResponse = await app.inject({
    method: "GET",
    url: `/v1/sessions/events/search?q=${encodeURIComponent(importedMessageText)}&eventKind=message`,
    headers: { authorization: "Bearer test-secret" },
  });
  assert.equal(eventSearchResponse.statusCode, 200);
  const eventSearchBody = JSON.parse(eventSearchResponse.body) as { items: unknown[] };
  assert.equal(eventSearchBody.items.length, 1);

  const projectionResponse = await app.inject({
    method: "POST",
    url: `/v1/sessions/${encodeURIComponent(importedSessionId)}/projection/rebuild`,
    headers: { authorization: "Bearer test-secret" },
  });
  assert.equal(projectionResponse.statusCode, 200);
  const projectionBody = JSON.parse(projectionResponse.body) as { meta: { projectionStatus: string; eventCount: number; summaryCount: number } };
  assert.equal(projectionBody.meta.projectionStatus, "current");
  assert.equal(projectionBody.meta.eventCount, 2);
  assert.equal(projectionBody.meta.summaryCount, 0);
  await app.close();
});

test("Codex JSONL import measures bounded synthetic rollout ingestion and hot reads", async () => {
  const rootDir = tempRoot("clawjs-codex-large-import-");
  const dbPath = path.join(rootDir, "sessions.sqlite");
  const codexDir = path.join(rootDir, "codex-sessions");
  const fileCount = 24;
  const messagesPerFile = 12;
  for (let index = 0; index < fileCount; index += 1) {
    writeLargeRollout(codexDir, index + 1, messagesPerFile);
  }
  const beforeSnapshot = fileSnapshot(codexDir);
  const store = new SessionsServiceStore(dbPath);
  try {
    const importStart = performance.now();
    const result = await importCodexSessionsDir(store, codexDir, {
      mode: "incremental",
      batchSize: 12,
    });
    const importMs = performance.now() - importStart;

    const sidebarStart = performance.now();
    const sidebar = store.sidebarBootstrap({ recentLimit: 50 });
    const sidebarMs = performance.now() - sidebarStart;

    const importedSessionId = result.imported.find((item) => item.sessionId)?.sessionId;
    assert.ok(importedSessionId);
    const hydrateStart = performance.now();
    const hydrated = store.hydrateSession({ sessionId: importedSessionId, messageLimit: 12 });
    const hydrateMs = performance.now() - hydrateStart;

    const rebuildStart = performance.now();
    const projection = store.rebuildSessionProjection(importedSessionId);
    const rebuildMs = performance.now() - rebuildStart;

    const metrics = {
      importMs: Math.round(importMs),
      sidebarMs: Math.round(sidebarMs),
      hydrateMs: Math.round(hydrateMs),
      rebuildMs: Math.round(rebuildMs),
      scanned: result.scanned,
      changedFiles: result.changedFiles,
      importedMessages: result.imported.reduce((sum, item) => sum + item.messagesImported, 0),
      sidebarRecent: sidebar.recent.length,
      hydratedMessages: hydrated?.messages.length ?? 0,
      projectionStatus: projection.meta.projectionStatus,
    };
    console.info("session jsonl import hot-path measurement", metrics);

    assert.equal(result.scanned, fileCount);
    assert.equal(result.changedFiles, fileCount);
    assert.equal(metrics.importedMessages, fileCount * messagesPerFile);
    assert.equal(sidebar.recent.length, fileCount);
    assert.equal(hydrated?.messages.length, 12);
    assert.equal(projection.meta.projectionStatus, "current");
    assert.deepEqual(fileSnapshot(codexDir), beforeSnapshot);

    assert.ok(importMs < 10_000, `session import took ${importMs}ms`);
    assert.ok(sidebarMs < 1_000, `sidebar after import took ${sidebarMs}ms`);
    assert.ok(hydrateMs < 1_000, `hydrate after import took ${hydrateMs}ms`);
    assert.ok(rebuildMs < 2_000, `projection rebuild after import took ${rebuildMs}ms`);
  } finally {
    store.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
