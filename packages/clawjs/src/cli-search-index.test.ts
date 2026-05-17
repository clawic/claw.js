import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { CLI_EXIT_OK } from "./index.ts";
import { runCliCapture, withPatchedEnv } from "./index-test-utils.ts";

test("search rebuild and query use the Search sidecar without workspace state", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-cli-"));
  const dataRoot = path.join(workspaceRoot, "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const rebuild = await runCliCapture(["search", "rebuild", "--json"], workspaceRoot);
    assert.equal(rebuild.code, CLI_EXIT_OK);
    const rebuildPayload = JSON.parse(rebuild.stdout) as {
      ok: boolean;
      data: {
        rebuilt: boolean;
        reindexed: number;
        embeddings: number;
        storage: { index: string };
        sources: string[];
        pendingSources: string[];
      };
      meta: { canonicalCommand: string; subcommand: string };
    };
    assert.equal(rebuildPayload.ok, true);
    assert.equal(rebuildPayload.meta.canonicalCommand, "search");
    assert.equal(rebuildPayload.meta.subcommand, "rebuild");
    assert.equal(rebuildPayload.data.rebuilt, true);
    assert.equal(rebuildPayload.data.embeddings, 0);
    assert.equal(rebuildPayload.data.storage.index, "search.sqlite");
    assert.equal(fs.existsSync(path.join(dataRoot, "search.sqlite")), true);
    assert.equal(rebuildPayload.data.sources.includes("commands"), true);
    assert.equal(rebuildPayload.data.pendingSources.includes("sessions.chats"), true);
    assert.ok(rebuildPayload.data.reindexed > 0);

    const query = await runCliCapture(["search", "query", "system capabilities", "--json", "--limit", "5", "--explain", "true"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as {
      ok: boolean;
      data: {
        query: string;
        profile: string;
        results: Array<{
          id: string;
          source: string;
          domain: string;
          title: string;
          actions?: Array<{ id: string; kind: string }>;
          explanation?: { matchedBy?: string[] };
        }>;
        partial: boolean;
        omittedSources: unknown[];
      };
      meta: { canonicalCommand: string; subcommand: string };
    };
    assert.equal(queryPayload.ok, true);
    assert.equal(queryPayload.meta.canonicalCommand, "search");
    assert.equal(queryPayload.meta.subcommand, "query");
    assert.equal(queryPayload.data.query, "system capabilities");
    assert.equal(queryPayload.data.profile, "framework");
    assert.equal(queryPayload.data.partial, false);
    assert.deepEqual(queryPayload.data.omittedSources, []);
    assert.equal(queryPayload.data.results.some((result) => result.source === "commands" && result.title === "system"), true);
    const systemResult = queryPayload.data.results.find((result) => result.title === "system");
    assert.equal(systemResult?.domain, "commands");
    assert.equal(systemResult?.actions?.some((action) => action.id === "help" && action.kind === "run"), true);
    assert.ok(systemResult?.explanation?.matchedBy?.length);

    const actions = await runCliCapture(["search", "actions", "commands:system", "--json"], workspaceRoot);
    assert.equal(actions.code, CLI_EXIT_OK);
    const actionsPayload = JSON.parse(actions.stdout) as {
      data: {
        resultId: string;
        actions: Array<{ id: string; kind: string }>;
        brokered: boolean;
      };
    };
    assert.equal(actionsPayload.data.resultId, "commands:system");
    assert.equal(actionsPayload.data.actions.some((action) => action.id === "help"), true);
    assert.equal(actionsPayload.data.brokered, true);

    const status = await runCliCapture(["search", "status", "--json"], workspaceRoot);
    assert.equal(status.code, CLI_EXIT_OK);
    const statusPayload = JSON.parse(status.stdout) as {
      data: {
        storage: { index: string };
        sources: Array<{ source: string; state: string; fastPath: boolean; lastIndexedAt?: string }>;
      };
    };
    assert.equal(statusPayload.data.storage.index, "search.sqlite");
    const commandStatus = statusPayload.data.sources.find((source) => source.source === "commands");
    assert.equal(commandStatus?.state, "enabled");
    assert.equal(commandStatus?.fastPath, true);
    assert.ok(commandStatus?.lastIndexedAt);

    const saved = await runCliCapture(["search", "saved", "create", "recent-system", "--query", "system capabilities", "--name", "Recent system", "--json"], workspaceRoot);
    assert.equal(saved.code, CLI_EXIT_OK);
    const savedPayload = JSON.parse(saved.stdout) as {
      data: { item: { id: string; name: string; query: { query: string } }; items: Array<{ id: string }> };
    };
    assert.equal(savedPayload.data.item.id, "recent-system");
    assert.equal(savedPayload.data.item.name, "Recent system");
    assert.equal(savedPayload.data.item.query.query, "system capabilities");
    assert.equal(savedPayload.data.items.some((item) => item.id === "recent-system"), true);

    const monitor = await runCliCapture(["search", "monitors", "create", "monitor-system", "--saved-search", "recent-system", "--cadence", "hourly", "--json"], workspaceRoot);
    assert.equal(monitor.code, CLI_EXIT_OK);
    const monitorPayload = JSON.parse(monitor.stdout) as {
      data: { item: { id: string; savedSearchId: string; cadence: string }; items: Array<{ id: string; enabled: boolean }> };
    };
    assert.equal(monitorPayload.data.item.id, "monitor-system");
    assert.equal(monitorPayload.data.item.savedSearchId, "recent-system");
    assert.equal(monitorPayload.data.item.cadence, "hourly");
    assert.equal(monitorPayload.data.items.some((item) => item.id === "monitor-system" && item.enabled), true);
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
    fs.mkdirSync(sessionsRoot, { recursive: true });
    const sessionId = "22222222-3333-4444-8555-666666666666";
    fs.writeFileSync(path.join(sessionsRoot, `rollout-${sessionId}.jsonl`), [
      JSON.stringify({ type: "session_meta", payload: { id: sessionId, cwd: workspaceRoot, timestamp: "2026-05-12T10:00:00.000Z" } }),
      JSON.stringify({ type: "event_msg", payload: { type: "user_message", message: "Index the large rollout and keep chat search fast" } }),
      "",
    ].join("\n"));

    const index = await runCliCapture(["sessions", "index", "--root", sessionsRoot, "--json"], workspaceRoot);
    assert.equal(index.code, CLI_EXIT_OK);

    const rebuild = await runCliCapture(["search", "rebuild", "--json"], workspaceRoot);
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

    const query = await runCliCapture(["search", "query", "large rollout", "--domains", "sessions", "--json", "--limit", "5"], workspaceRoot);
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

    const status = await runCliCapture(["search", "status", "--json"], workspaceRoot);
    assert.equal(status.code, CLI_EXIT_OK);
    const statusPayload = JSON.parse(status.stdout) as {
      data: { sources: Array<{ source: string; state: string; lastIndexedAt?: string }> };
    };
    const sessionsStatus = statusPayload.data.sources.find((source) => source.source === "sessions.chats");
    assert.equal(sessionsStatus?.state, "enabled");
    assert.ok(sessionsStatus?.lastIndexedAt);
  });
});

test("search rebuild indexes database.records from core.sqlite", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-database-"));
  const dataRoot = path.join(workspaceRoot, "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const create = await runCliCapture([
      "db",
      "contacts",
      "create",
      "--data",
      JSON.stringify({
        companyId: "company-demo",
        email: "ada@example.com",
        firstName: "Ada",
        lastName: "Lovelace",
        notes: "Analytical engine rollout owner",
      }),
      "--json",
    ], workspaceRoot);
    assert.equal(create.code, CLI_EXIT_OK);
    const createPayload = JSON.parse(create.stdout) as { data: { id: string } };
    assert.ok(createPayload.data.id);

    const sensitive = await runCliCapture([
      "db",
      "contacts",
      "create",
      "--data",
      JSON.stringify({
        companyId: "company-demo",
        email: "private@example.com",
        firstName: "Private",
        lastName: "Contact",
        notes: "Restricted launch details",
        sensitivity: "sensitive",
      }),
      "--json",
    ], workspaceRoot);
    assert.equal(sensitive.code, CLI_EXIT_OK);

    const rebuild = await runCliCapture(["search", "rebuild", "--json"], workspaceRoot);
    assert.equal(rebuild.code, CLI_EXIT_OK);
    const rebuildPayload = JSON.parse(rebuild.stdout) as {
      data: {
        sources: string[];
        pendingSources: string[];
        indexedBySource: { "database.records": number };
      };
    };
    assert.equal(rebuildPayload.data.sources.includes("database.records"), true);
    assert.equal(rebuildPayload.data.pendingSources.includes("database.records"), false);
    assert.equal(rebuildPayload.data.indexedBySource["database.records"], 2);

    const query = await runCliCapture(["search", "query", "Analytical engine", "--domains", "database", "--json", "--limit", "5", "--explain", "true"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as {
      data: {
        indexedFastPaths: { "database.records": number };
        results: Array<{
          source: string;
          domain: string;
          type: string;
          title: string;
          subtitle?: string;
          permissions?: { canPreview?: boolean; redacted?: boolean };
          fragments?: Array<{ title?: string; snippet?: string }>;
          explanation?: { matchedBy?: string[] };
        }>;
      };
    };
    assert.equal(queryPayload.data.indexedFastPaths["database.records"], 2);
    const record = queryPayload.data.results.find((result) => result.title.includes("Ada"));
    assert.equal(record?.source, "database.records");
    assert.equal(record?.domain, "database");
    assert.equal(record?.type, "record");
    assert.equal(record?.subtitle, "main/contacts");
    assert.equal(record?.permissions?.redacted, false);
    assert.equal(record?.fragments?.some((fragment) => fragment.title === "notes" && fragment.snippet?.includes("Analytical engine")), true);
    assert.ok(record?.explanation?.matchedBy?.length);

    const redacted = await runCliCapture(["search", "query", "Restricted launch", "--domains", "database", "--json", "--limit", "5"], workspaceRoot);
    assert.equal(redacted.code, CLI_EXIT_OK);
    const redactedPayload = JSON.parse(redacted.stdout) as {
      data: { results: Array<{ title: string; snippet?: string; permissions?: { canPreview?: boolean; redacted?: boolean }; fragments?: unknown[] }> };
    };
    const sensitiveResult = redactedPayload.data.results.find((result) => result.title.includes("Private"));
    assert.equal(sensitiveResult?.snippet, "[redacted]");
    assert.equal(sensitiveResult?.permissions?.canPreview, false);
    assert.equal(sensitiveResult?.permissions?.redacted, true);
    assert.deepEqual(sensitiveResult?.fragments ?? [], []);
  });
});
