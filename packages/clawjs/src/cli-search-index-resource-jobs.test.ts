import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { SearchStore, createFrameworkSearchSourceManifest } from "@clawjs/search";
import { CLI_EXIT_DEGRADED, CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE } from "./index.ts";
import { captureStream, runCliCapture, runInternalV1Cli, withPatchedEnv } from "./index-test-utils.ts";
import { runSearchDocsPagesCliWriteScenario, runSearchDocsPagesEventScenario, runSearchDocsPagesScenario } from "./cli-search-docs-pages-test-utils.ts";
import { runSearchLocalFilesEventScenario } from "./cli-search-local-files-test-utils.ts";
import { runSearchSurfaceRouteGraphContractsScenario } from "./cli-search-surface-routes-test-utils.ts";
import { runSearchExternalCacheEventScenario, runSearchWebIngestedEventScenario } from "./cli-search-web-external-test-utils.ts";
import {
  runSearchAgentCatalogFastPathScenario,
  runSearchBusinessRecordFastPathScenario,
  runSearchContentSocialIotFastPathScenario,
  runSearchMarketplaceChoiceFastPathScenario,
  runSearchProvidersSnippetsFastPathScenario,
} from "./cli-search-framework-fast-path-test-utils.ts";
import { ensureV1MainSchema, resolveClawjsMainDbPath } from "./v1-data-core.ts";
test("search service upsert jobs refresh only the targeted database resource", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-resource-db-"));
  const dataRoot = path.join(workspaceRoot, ".claw", "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const first = await runCliCapture([
      "db",
      "contacts",
      "create",
      "--data",
      JSON.stringify({
        [["company", "Id"].join("")]: "company-demo",
        email: "alpha@example.com",
        firstName: "Alpha",
        lastName: "Contact",
        notes: "needle-alpha-only",
      }),
      "--json",
    ], workspaceRoot);
    assert.equal(first.code, CLI_EXIT_OK);
    const firstPayload = JSON.parse(first.stdout) as { data: { id: string } };
    const second = await runCliCapture([
      "db",
      "contacts",
      "create",
      "--data",
      JSON.stringify({
        [["company", "Id"].join("")]: "company-demo",
        email: "beta@example.com",
        firstName: "Beta",
        lastName: "Contact",
        notes: "needle-beta-only",
      }),
      "--json",
    ], workspaceRoot);
    assert.equal(second.code, CLI_EXIT_OK);
    const secondPayload = JSON.parse(second.stdout) as { data: { id: string } };
    const serviceRun = await runCliCapture(["search", "service", "run-once", "--source", "database.records", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(serviceRun.code, CLI_EXIT_OK);
    const serviceRunPayload = JSON.parse(serviceRun.stdout) as {
      data: { worker?: { items: Array<{ source: string; operation: string; status: string; indexed?: number }> } };
    };
    assert.equal(serviceRunPayload.data.worker?.items[0]?.status, "done");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.indexed, 1);
    const jobs = await runCliCapture(["search", "jobs", "--source", "database.records", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(jobs.code, CLI_EXIT_OK);
    const jobsPayload = JSON.parse(jobs.stdout) as { data: { items: Array<{ status: string; resourceId: string }> } };
    const doneJob = jobsPayload.data.items.find((job) => job.status === "done");
    const queuedJob = jobsPayload.data.items.find((job) => job.status === "queued");
    assert.ok(doneJob);
    assert.ok(queuedJob);
    const doneTerm = doneJob.resourceId.endsWith(`:${firstPayload.data.id}`) ? "needle-alpha-only" : "needle-beta-only";
    const queuedTerm = queuedJob.resourceId.endsWith(`:${secondPayload.data.id}`) ? "needle-beta-only" : "needle-alpha-only";
    const store = new SearchStore(path.join(dataRoot, "search.sqlite"));
    try {
      assert.equal(store.query({ query: doneTerm, sources: ["database.records"] }).results.length, 1);
      assert.equal(store.query({ query: queuedTerm, sources: ["database.records"] }).results.length, 0);
    } finally {
      store.close();
    }
  });
});
test("search service upsert jobs refresh only the targeted media resource", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-resource-media-"));
  const dataRoot = path.join(workspaceRoot, "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const mediaDir = path.join(workspaceRoot, ".claw", "data", "collections", "media");
    fs.mkdirSync(mediaDir, { recursive: true });
    fs.writeFileSync(path.join(mediaDir, "media-alpha.json"), `${JSON.stringify({
      mediaId: "media-alpha",
      kind: "document",
      name: "Alpha media",
      sourceText: "needle-media-alpha-only",
      createdAt: "2026-05-17T00:00:00.000Z",
    })}\n`);
    fs.writeFileSync(path.join(mediaDir, "media-beta.json"), `${JSON.stringify({
      mediaId: "media-beta",
      kind: "document",
      name: "Beta media",
      sourceText: "needle-media-beta-only",
      createdAt: "2026-05-17T00:00:00.000Z",
    })}\n`);
    const scheduled = await runCliCapture([
      "search",
      "jobs",
      "schedule",
      "upsert",
      "--source",
      "media.assets",
      "--resource-id",
      "media-alpha",
      "--payload",
      JSON.stringify({ mediaId: "media-alpha" }),
      "--data-dir",
      dataRoot,
      "--json",
    ], workspaceRoot);
    assert.equal(scheduled.code, CLI_EXIT_OK);
    const serviceRun = await runCliCapture(["search", "service", "run-once", "--source", "media.assets", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(serviceRun.code, CLI_EXIT_OK);
    const serviceRunPayload = JSON.parse(serviceRun.stdout) as {
      data: { worker?: { items: Array<{ source: string; operation: string; status: string; indexed?: number }> } };
    };
    assert.equal(serviceRunPayload.data.worker?.items[0]?.status, "done");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.indexed, 1);
    const store = new SearchStore(path.join(dataRoot, "search.sqlite"));
    try {
      assert.equal(store.query({ query: "needle-media-alpha-only", sources: ["media.assets"] }).results.length, 1);
      assert.equal(store.query({ query: "needle-media-beta-only", sources: ["media.assets"] }).results.length, 0);
    } finally {
      store.close();
    }
  });
});
test("search rebuild indexes sessions.chats from the sessions sidecar", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-sessions-"));
  const dataRoot = path.join(workspaceRoot, "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
    CLAW_SESSIONS_DB_PATH: undefined,
  }, async () => {
    const sessionsRoot = path.join(workspaceRoot, "codex-sessions");
    const sessionsDbPath = path.join(dataRoot, "sessions.sqlite");
    fs.mkdirSync(sessionsRoot, { recursive: true });
    const sessionId = "22222222-3333-4444-8555-666666666666";
    fs.writeFileSync(path.join(sessionsRoot, `rollout-${sessionId}.jsonl`), [
      JSON.stringify({ type: "session_meta", payload: { id: sessionId, cwd: workspaceRoot, timestamp: "2026-05-12T10:00:00.000Z" } }),
      JSON.stringify({ type: "event_msg", payload: { type: "user_message", message: "Index the large rollout and keep chat search fast" } }),
      "",
    ].join("\n"));
    const index = await runCliCapture(["sessions", "index", "--root", sessionsRoot, "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(index.code, CLI_EXIT_OK);
    const rebuild = await runCliCapture(["search", "rebuild", "--data-dir", dataRoot, "--sessions-db-path", sessionsDbPath, "--json"], workspaceRoot);
    assert.equal(rebuild.code, CLI_EXIT_OK);
    const rebuildPayload = JSON.parse(rebuild.stdout) as {
      data: {
        sources: string[];
        pendingSources: string[];
        indexedBySource: { "sessions.chats": number };
      };
    };
    assert.equal(rebuildPayload.data.sources.includes("sessions.chats"), true);
    assert.equal(rebuildPayload.data.pendingSources.includes("sessions.chats"), false);
    assert.equal(rebuildPayload.data.indexedBySource["sessions.chats"], 1);
    const query = await runCliCapture(["search", "query", "large rollout", "--domains", "sessions", "--data-dir", dataRoot, "--sessions-db-path", sessionsDbPath, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as {
      data: {
        results: Array<{
          id: string;
          source: string;
          domain: string;
          type: string;
          resourceId?: string;
          actions?: Array<{ id: string; kind: string }>;
          fragments?: Array<{ title?: string; snippet?: string }>;
        }>;
      };
    };
    const sessionResult = queryPayload.data.results.find((result) => result.resourceId === sessionId);
    assert.equal(sessionResult?.id, `sessions.chats:${sessionId}`);
    assert.equal(sessionResult?.source, "sessions.chats");
    assert.equal(sessionResult?.domain, "sessions");
    assert.equal(sessionResult?.type, "chat");
    assert.equal(sessionResult?.actions?.some((action) => action.id === "open" && action.kind === "open"), true);
    assert.equal(sessionResult?.fragments?.some((fragment) => fragment.snippet?.includes("keep chat search fast")), true);
    const status = await runCliCapture(["search", "status", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(status.code, CLI_EXIT_OK);
    const statusPayload = JSON.parse(status.stdout) as {
      data: { sources: Array<{ source: string; state: string; lastIndexedAt?: string }> };
    };
    const sessionsStatus = statusPayload.data.sources.find((source) => source.source === "sessions.chats");
    assert.equal(sessionsStatus?.state, "enabled");
    assert.ok(sessionsStatus?.lastIndexedAt);
  });
});
test("sessions index enqueues sessions.chats search refresh jobs", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-session-index-events-"));
  const dataRoot = path.join(workspaceRoot, "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
    CLAW_SESSIONS_DB_PATH: undefined,
  }, async () => {
    const sessionsRoot = path.join(workspaceRoot, "codex-sessions");
    const sessionsDbPath = path.join(dataRoot, "sessions.sqlite");
    fs.mkdirSync(sessionsRoot, { recursive: true });
    const sessionId = "24242424-3535-4646-8787-989898989898";
    fs.writeFileSync(path.join(sessionsRoot, `rollout-${sessionId}.jsonl`), [
      JSON.stringify({ type: "session_meta", payload: { id: sessionId, cwd: workspaceRoot, timestamp: "2026-05-14T10:00:00.000Z" } }),
      JSON.stringify({ type: "event_msg", payload: { type: "user_message", message: "sessions-index-emitter-needle should reach Search via queued refresh" } }),
      "",
    ].join("\n"));
    const index = await runCliCapture(["sessions", "index", "--root", sessionsRoot, "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(index.code, CLI_EXIT_OK);
    const serviceRun = await runCliCapture(["search", "service", "run-once", "--source", "sessions.chats", "--data-dir", dataRoot, "--sessions-db-path", sessionsDbPath, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(serviceRun.code, CLI_EXIT_OK);
    const serviceRunPayload = JSON.parse(serviceRun.stdout) as {
      data: { worker?: { items: Array<{ source: string; operation: string; status: string; indexed?: number }> } };
    };
    const sessionRunItem = serviceRunPayload.data.worker?.items.find((entry) => entry.source === "sessions.chats");
    assert.deepEqual({ source: sessionRunItem?.source, operation: sessionRunItem?.operation, status: sessionRunItem?.status, indexed: sessionRunItem?.indexed }, { source: "sessions.chats", operation: "upsert", status: "done", indexed: 1 });
    const query = await runCliCapture(["search", "query", "sessions-index-emitter-needle", "--domains", "sessions", "--data-dir", dataRoot, "--sessions-db-path", sessionsDbPath, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as { data: { results: Array<{ source: string; resourceId?: string; fragments?: Array<{ snippet?: string }> }> } };
    const result = queryPayload.data.results.find((entry) => entry.resourceId === sessionId);
    assert.equal(result?.source, "sessions.chats");
    assert.equal(result?.fragments?.some((fragment) => fragment.snippet?.includes("sessions-index-emitter-needle")), true);
    fs.rmSync(path.join(sessionsRoot, `rollout-${sessionId}.jsonl`));
    const archivedRoot = path.join(sessionsRoot, "archived_sessions");
    fs.mkdirSync(archivedRoot, { recursive: true });
    fs.writeFileSync(path.join(archivedRoot, `rollout-${sessionId}.jsonl`), [
      JSON.stringify({ type: "session_meta", payload: { id: sessionId, cwd: workspaceRoot, timestamp: "2026-05-14T10:00:00.000Z" } }),
      JSON.stringify({ type: "event_msg", payload: { type: "user_message", message: "sessions-index-emitter-needle should be deleted from Search" } }),
      "",
    ].join("\n"));
    const archiveIndex = await runCliCapture(["sessions", "index", "--root", sessionsRoot, "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(archiveIndex.code, CLI_EXIT_OK);
    const deleteRun = await runCliCapture(["search", "service", "run-once", "--source", "sessions.chats", "--data-dir", dataRoot, "--sessions-db-path", sessionsDbPath, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(deleteRun.code, CLI_EXIT_OK);
    const deleteRunPayload = JSON.parse(deleteRun.stdout) as {
      data: { worker?: { items: Array<{ source: string; operation: string; status: string; indexed?: number }> } };
    };
    const sessionDeleteRunItem = deleteRunPayload.data.worker?.items.find((entry) => entry.source === "sessions.chats");
    assert.deepEqual({ source: sessionDeleteRunItem?.source, operation: sessionDeleteRunItem?.operation, status: sessionDeleteRunItem?.status, indexed: sessionDeleteRunItem?.indexed }, { source: "sessions.chats", operation: "delete", status: "done", indexed: 1 });
    const afterArchive = await runCliCapture(["search", "query", "sessions-index-emitter-needle", "--domains", "sessions", "--data-dir", dataRoot, "--sessions-db-path", sessionsDbPath, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(afterArchive.code, CLI_EXIT_DEGRADED);
    const afterArchivePayload = JSON.parse(afterArchive.stdout) as { data: { results: unknown[] } };
    assert.deepEqual(afterArchivePayload.data.results, []);
  });
});
test("sessions.chats event jobs refresh and tombstone individual chats", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-session-events-"));
  const dataRoot = path.join(workspaceRoot, "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
    CLAW_SESSIONS_DB_PATH: undefined,
  }, async () => {
    const sessionsRoot = path.join(workspaceRoot, "codex-sessions");
    const sessionsDbPath = path.join(dataRoot, "sessions.sqlite");
    fs.mkdirSync(sessionsRoot, { recursive: true });
    const sessionId = "33333333-4444-4555-8666-777777777777";
    fs.writeFileSync(path.join(sessionsRoot, `rollout-${sessionId}.jsonl`), [
      JSON.stringify({ type: "session_meta", payload: { id: sessionId, cwd: workspaceRoot, timestamp: "2026-05-13T10:00:00.000Z" } }),
      JSON.stringify({ type: "event_msg", payload: { type: "user_message", message: "A session-event-refresh-needle proves chat event refresh" } }),
      "",
    ].join("\n"));
    const index = await runCliCapture(["sessions", "index", "--root", sessionsRoot, "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(index.code, CLI_EXIT_OK);
    const scheduled = await runCliCapture(["search", "changes", "schedule", "upsert", "--source", "sessions.chats", "--session-id", sessionId, "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(scheduled.code, CLI_EXIT_OK, scheduled.stderr || scheduled.stdout);
    const scheduledPayload = JSON.parse(scheduled.stdout) as {
      data: { item?: { id: string; source: string; operation: string; resourceId?: string; shard?: string; payload?: { eventDriven?: boolean; sessionId?: string } } };
    };
    assert.equal(scheduledPayload.data.item?.source, "sessions.chats");
    assert.equal(scheduledPayload.data.item?.operation, "upsert");
    assert.equal(scheduledPayload.data.item?.resourceId, sessionId);
    assert.equal(scheduledPayload.data.item?.shard, "hot");
    assert.equal(scheduledPayload.data.item?.payload?.eventDriven, true);
    assert.equal(scheduledPayload.data.item?.payload?.sessionId, sessionId);
    const serviceRun = await runCliCapture(["search", "service", "run-once", "--source", "sessions.chats", "--data-dir", dataRoot, "--sessions-db-path", sessionsDbPath, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(serviceRun.code, CLI_EXIT_OK);
    const serviceRunPayload = JSON.parse(serviceRun.stdout) as {
      data: { worker?: { items: Array<{ id: string; source: string; status: string; indexed?: number }> } };
    };
    assert.equal(serviceRunPayload.data.worker?.items[0]?.id, scheduledPayload.data.item?.id);
    assert.equal(serviceRunPayload.data.worker?.items[0]?.source, "sessions.chats");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.status, "done");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.indexed, 1);
    const query = await runCliCapture(["search", "query", "session-event-refresh-needle", "--data-dir", dataRoot, "--sessions-db-path", sessionsDbPath, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as {
      data: { results: Array<{ source: string; domain: string; resourceId?: string; fragments?: Array<{ snippet?: string }> }> };
    };
    const result = queryPayload.data.results.find((entry) => entry.resourceId === sessionId);
    assert.equal(result?.source, "sessions.chats");
    assert.equal(result?.domain, "sessions");
    assert.equal(result?.fragments?.some((fragment) => fragment.snippet?.includes("session-event-refresh-needle")), true);
    const sessionsDb = new Database(sessionsDbPath);
    try {
      sessionsDb.prepare("UPDATE conversation_sessions SET archived = 1 WHERE session_id = ?").run(sessionId);
    } finally {
      sessionsDb.close();
    }
    const deleted = await runCliCapture(["search", "changes", "schedule", "delete", "--source", "sessions.chats", "--session-id", sessionId, "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleted.code, CLI_EXIT_OK, deleted.stderr || deleted.stdout);
    const deletedPayload = JSON.parse(deleted.stdout) as {
      data: { item?: { source: string; operation: string; resourceId?: string; payload?: { eventDriven?: boolean; sessionId?: string } } };
    };
    assert.equal(deletedPayload.data.item?.source, "sessions.chats");
    assert.equal(deletedPayload.data.item?.operation, "delete");
    assert.equal(deletedPayload.data.item?.resourceId, sessionId);
    assert.equal(deletedPayload.data.item?.payload?.eventDriven, true);
    assert.equal(deletedPayload.data.item?.payload?.sessionId, sessionId);
    const deleteRun = await runCliCapture(["search", "service", "run-once", "--source", "sessions.chats", "--data-dir", dataRoot, "--sessions-db-path", sessionsDbPath, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(deleteRun.code, CLI_EXIT_OK);
    const deleteRunPayload = JSON.parse(deleteRun.stdout) as {
      data: { worker?: { items: Array<{ source: string; operation: string; status: string; indexed?: number }> } };
    };
    const sessionDeleteRunItem = deleteRunPayload.data.worker?.items.find((entry) => entry.source === "sessions.chats");
    assert.deepEqual({ source: sessionDeleteRunItem?.source, operation: sessionDeleteRunItem?.operation, status: sessionDeleteRunItem?.status, indexed: sessionDeleteRunItem?.indexed }, { source: "sessions.chats", operation: "delete", status: "done", indexed: 1 });
    const afterDelete = await runCliCapture(["search", "query", "session-event-refresh-needle", "--data-dir", dataRoot, "--sessions-db-path", sessionsDbPath, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(afterDelete.code, CLI_EXIT_DEGRADED);
    const afterDeletePayload = JSON.parse(afterDelete.stdout) as { data: { results: unknown[] } };
    assert.deepEqual(afterDeletePayload.data.results, []);
  });
});
