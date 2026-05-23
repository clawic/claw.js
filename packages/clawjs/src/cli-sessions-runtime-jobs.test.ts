import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { CLI_EXIT_OK } from "./index.ts";
import { runCliCapture, withPatchedEnv } from "./index-test-utils.ts";
import { SessionsServiceStore } from "../../clawjs-sessions/src/store.ts";

const THREAD_ID = ["019e5236", "7e72", "77e3", "aef2", "bfe4c2628c72"].join("-");

test("sessions runtime CLI runs Codex import jobs and emits session Search invalidations", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-sessions-runtime-cli-"));
  const dataRoot = path.join(workspaceRoot, ".claw", "data");
  const codexDir = path.join(workspaceRoot, "codex-sessions");
  writeRollout(codexDir, THREAD_ID, "automatic events needle");

  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
    CLAW_SESSIONS_DB_PATH: undefined,
    CLAW_SESSIONS_DATA_DIR: undefined,
  }, async () => {
    const enqueue = await runCliCapture([
      "sessions",
      "runtime",
      "enqueue",
      "import-codex",
      "--dir",
      codexDir,
      "--data-dir",
      dataRoot,
      "--id",
      "job-import-codex",
      "--json",
    ], workspaceRoot);
    assert.equal(enqueue.code, CLI_EXIT_OK, enqueue.stderr || enqueue.stdout);
    const enqueuePayload = JSON.parse(enqueue.stdout) as { data: { item: { id: string; kind: string; status: string } } };
    assert.deepEqual(
      {
        id: enqueuePayload.data.item.id,
        kind: enqueuePayload.data.item.kind,
        status: enqueuePayload.data.item.status,
      },
      { id: "job-import-codex", kind: "sessions.import_codex", status: "queued" },
    );

    const run = await runCliCapture([
      "sessions",
      "runtime",
      "run-once",
      "--data-dir",
      dataRoot,
      "--max-jobs",
      "1",
      "--json",
    ], workspaceRoot);
    assert.equal(run.code, CLI_EXIT_OK, run.stderr || run.stdout);
    const runPayload = JSON.parse(run.stdout) as {
      data: {
        worker: { completed: number; items: Array<{ id: string; status: string }> };
        searchEvents: Array<{ source: string; sessionId: string; result: { ok: boolean } }>;
      };
    };
    assert.equal(runPayload.data.worker.completed, 1);
    assert.equal(runPayload.data.worker.items[0]?.status, "done");
    assert.equal(runPayload.data.searchEvents.some((event) => event.source === "sessions.chats" && event.sessionId === THREAD_ID && event.result.ok), true);
    assert.equal(runPayload.data.searchEvents.some((event) => event.source === "sessions.events" && event.sessionId === THREAD_ID && event.result.ok), true);
    assert.equal(runPayload.data.searchEvents.some((event) => event.source === "sessions.turns" && event.sessionId === THREAD_ID && event.result.ok), true);

    const runtimeEvents = await runCliCapture([
      "sessions",
      "runtime",
      "events",
      "--job-id",
      "job-import-codex",
      "--data-dir",
      dataRoot,
      "--json",
    ], workspaceRoot);
    assert.equal(runtimeEvents.code, CLI_EXIT_OK, runtimeEvents.stderr || runtimeEvents.stdout);
    const runtimeEventsPayload = JSON.parse(runtimeEvents.stdout) as { data: { items: Array<{ kind: string; jobId: string; redacted: boolean }> } };
    assert.equal(runtimeEventsPayload.data.items.some((event) => event.kind === "job.done" && event.jobId === "job-import-codex"), true);

    const retention = await runCliCapture([
      "sessions",
      "runtime",
      "retention",
      "--data-dir",
      dataRoot,
      "--dry-run",
      "true",
      "--json",
    ], workspaceRoot);
    assert.equal(retention.code, CLI_EXIT_OK, retention.stderr || retention.stdout);
    const retentionPayload = JSON.parse(retention.stdout) as { data: { retention: { dryRun: boolean; deleted: { events: number; logs: number; jobs: number } } } };
    assert.equal(retentionPayload.data.retention.dryRun, true);
    assert.equal(typeof retentionPayload.data.retention.deleted.events, "number");

    const eventsRun = await runCliCapture([
      "search",
      "service",
      "run-once",
      "--source",
      "sessions.events",
      "--data-dir",
      dataRoot,
      "--json",
      "--limit",
      "1",
    ], workspaceRoot);
    assert.equal(eventsRun.code, CLI_EXIT_OK, eventsRun.stderr || eventsRun.stdout);

    const query = await runCliCapture([
      "search",
      "query",
      "automatic events needle",
      "--sources",
      "sessions.events",
      "--data-dir",
      dataRoot,
      "--json",
      "--limit",
      "5",
    ], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK, query.stderr || query.stdout);
    const queryPayload = JSON.parse(query.stdout) as { data: { results: Array<{ source: string; resourceId: string; metadata: Record<string, unknown> }> } };
    assert.equal(queryPayload.data.results.some((result) => (
      result.source === "sessions.events"
      && result.resourceId === THREAD_ID
      && result.metadata.sessionId === THREAD_ID
    )), true);
  });
});

test("sessions runtime CLI enqueues project-scoped projection rebuild jobs", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-sessions-runtime-rebuild-cli-"));
  const dataRoot = path.join(workspaceRoot, ".claw", "data");
  const sessionsDbPath = path.join(dataRoot, "sessions.sqlite");
  const projectPath = path.join(workspaceRoot, "project-a");
  fs.mkdirSync(dataRoot, { recursive: true });
  const seed = new SessionsServiceStore(sessionsDbPath);
  try {
    seed.createProject({ id: "project-a", path: projectPath, displayName: "Project A" });
    seed.createSession({ id: "session-rebuild-cli", agent: "codex", title: "Rebuild", projectId: "project-a", projectPath });
    seed.appendSessionEvent({
      sessionId: "session-rebuild-cli",
      turnId: "turn-rebuild-cli",
      eventKind: "message",
      eventType: "event_msg.user_message",
      role: "user",
      timestamp: 10,
      sourceNativeId: "session-rebuild-cli:line:1",
      payloadJson: { message: "rebuild cli needle" },
      renderedSummary: "rebuild cli needle",
      searchableText: "rebuild cli needle",
    });
  } finally {
    seed.close();
  }

  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
    CLAW_SESSIONS_DB_PATH: undefined,
    CLAW_SESSIONS_DATA_DIR: undefined,
  }, async () => {
    const enqueue = await runCliCapture([
      "sessions",
      "runtime",
      "enqueue",
      "rebuild-projections",
      "--project-id",
      "project-a",
      "--max-sessions",
      "5",
      "--data-dir",
      dataRoot,
      "--id",
      "job-rebuild-project",
      "--json",
    ], workspaceRoot);
    assert.equal(enqueue.code, CLI_EXIT_OK, enqueue.stderr || enqueue.stdout);
    const enqueuePayload = JSON.parse(enqueue.stdout) as { data: { item: { id: string; kind: string; resourceId: string } } };
    assert.equal(enqueuePayload.data.item.id, "job-rebuild-project");
    assert.equal(enqueuePayload.data.item.kind, "sessions.rebuild_projections");
    assert.equal(enqueuePayload.data.item.resourceId, "project-a");

    const run = await runCliCapture([
      "sessions",
      "runtime",
      "run-once",
      "--data-dir",
      dataRoot,
      "--max-jobs",
      "1",
      "--json",
    ], workspaceRoot);
    assert.equal(run.code, CLI_EXIT_OK, run.stderr || run.stdout);
    const runPayload = JSON.parse(run.stdout) as {
      data: {
        worker: { completed: number; items: Array<{ kind: string; result: { sessionsProcessed: number } }> };
        searchEvents: Array<{ source: string; sessionId: string; result: { ok: boolean } }>;
      };
    };
    assert.equal(runPayload.data.worker.completed, 1);
    assert.equal(runPayload.data.worker.items[0]?.kind, "sessions.rebuild_projections");
    assert.equal(runPayload.data.worker.items[0]?.result.sessionsProcessed, 1);
    assert.equal(runPayload.data.searchEvents.some((event) => event.source === "sessions.events" && event.sessionId === "session-rebuild-cli" && event.result.ok), true);
    assert.equal(runPayload.data.searchEvents.some((event) => event.source === "sessions.turns" && event.sessionId === "session-rebuild-cli" && event.result.ok), true);
  });
});

test("sessions runtime CLI enqueues memory-base extraction jobs", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-sessions-runtime-memory-cli-"));
  const dataRoot = path.join(workspaceRoot, ".claw", "data");
  const sessionsDbPath = path.join(dataRoot, "sessions.sqlite");
  const projectPath = path.join(workspaceRoot, "project-memory");
  fs.mkdirSync(dataRoot, { recursive: true });
  const seed = new SessionsServiceStore(sessionsDbPath);
  try {
    seed.createProject({ id: "project-memory", path: projectPath, displayName: "Project Memory" });
    seed.createSession({ id: "session-memory-cli", agent: "codex", title: "Memory", projectId: "project-memory", projectPath });
    seed.appendSessionEvent({
      sessionId: "session-memory-cli",
      turnId: "turn-memory-cli",
      eventKind: "message",
      eventType: "event_msg.user_message",
      role: "user",
      timestamp: 10,
      sourceNativeId: "session-memory-cli:line:1",
      payloadJson: { message: "memory cli needle" },
      renderedSummary: "memory cli needle",
      searchableText: "memory cli needle",
    });
    seed.rebuildSessionProjection("session-memory-cli");
  } finally {
    seed.close();
  }

  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
    CLAW_SESSIONS_DB_PATH: undefined,
    CLAW_SESSIONS_DATA_DIR: undefined,
  }, async () => {
    const enqueue = await runCliCapture([
      "sessions",
      "runtime",
      "enqueue",
      "extract-memory-base",
      "--project-id",
      "project-memory",
      "--max-sessions",
      "1",
      "--data-dir",
      dataRoot,
      "--id",
      "job-memory-base",
      "--json",
    ], workspaceRoot);
    assert.equal(enqueue.code, CLI_EXIT_OK, enqueue.stderr || enqueue.stdout);
    const enqueuePayload = JSON.parse(enqueue.stdout) as { data: { item: { id: string; kind: string; resourceId: string } } };
    assert.equal(enqueuePayload.data.item.id, "job-memory-base");
    assert.equal(enqueuePayload.data.item.kind, "sessions.extract_memory_base");
    assert.equal(enqueuePayload.data.item.resourceId, "project-memory");

    const run = await runCliCapture([
      "sessions",
      "runtime",
      "run-once",
      "--data-dir",
      dataRoot,
      "--max-jobs",
      "1",
      "--json",
    ], workspaceRoot);
    assert.equal(run.code, CLI_EXIT_OK, run.stderr || run.stdout);
    const runPayload = JSON.parse(run.stdout) as {
      data: {
        worker: { completed: number; items: Array<{ kind: string; result: { sessionsProcessed: number; sessionIds: string[] } }> };
      };
    };
    assert.equal(runPayload.data.worker.completed, 1);
    assert.equal(runPayload.data.worker.items[0]?.kind, "sessions.extract_memory_base");
    assert.equal(runPayload.data.worker.items[0]?.result.sessionsProcessed, 1);

    const check = new SessionsServiceStore(sessionsDbPath);
    try {
      const sessionId = runPayload.data.worker.items[0]?.result.sessionIds[0];
      assert.equal(check.getSessionMemoryExtract(sessionId ?? "")?.status, "current");
      assert.equal(check.listPendingSessionMemoryExtractions({ projectId: "project-memory" }).total, 0);
    } finally {
      check.close();
    }
  });
});

function writeRollout(rootDir: string, threadId: string, message: string): void {
  const dir = path.join(rootDir, "2026", "05", "23");
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `rollout-2026-05-23T10-00-00-${threadId}.jsonl`);
  const lines = [
    {
      timestamp: "2026-05-23T10:00:00.000Z",
      type: "session_meta",
      payload: {
        id: threadId,
        timestamp: "2026-05-23T10:00:00.000Z",
        cwd: rootDir,
        originator: "codex-cli",
        cli_version: "test",
        git: { branch: "main" },
      },
    },
    {
      timestamp: "2026-05-23T10:00:01.000Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: message }],
      },
    },
  ];
  fs.writeFileSync(filePath, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`);
}
