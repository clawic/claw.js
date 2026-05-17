import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { CLI_EXIT_DEGRADED, CLI_EXIT_FAILURE, CLI_EXIT_OK } from "./index.ts";
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
    const rebuild = await runCliCapture(["search", "rebuild", "--data-dir", dataRoot, "--json"], workspaceRoot);
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

    const query = await runCliCapture(["search", "query", "system capabilities", "--data-dir", dataRoot, "--json", "--limit", "5", "--explain", "true"], workspaceRoot);
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

    const actions = await runCliCapture(["search", "actions", "commands:system", "--data-dir", dataRoot, "--json"], workspaceRoot);
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

    const actionPreview = await runCliCapture(["search", "actions", "execute", "commands:system", "help", "--dry-run", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(actionPreview.code, CLI_EXIT_OK);
    const actionPreviewPayload = JSON.parse(actionPreview.stdout) as {
      data: {
        plan: {
          resultId: string;
          actionId: string;
          status: string;
          dryRun: boolean;
          requiresApproval: boolean;
          grant: string;
          risk: string;
          broker: { operation: string; sideEffects: string };
        };
      };
    };
    assert.equal(actionPreviewPayload.data.plan.resultId, "commands:system");
    assert.equal(actionPreviewPayload.data.plan.actionId, "help");
    assert.equal(actionPreviewPayload.data.plan.status, "planned");
    assert.equal(actionPreviewPayload.data.plan.dryRun, true);
    assert.equal(actionPreviewPayload.data.plan.requiresApproval, true);
    assert.equal(actionPreviewPayload.data.plan.grant, "search.commands.run");
    assert.equal(actionPreviewPayload.data.plan.risk, "system");
    assert.equal(actionPreviewPayload.data.plan.broker.operation, "search.action.execute");
    assert.equal(actionPreviewPayload.data.plan.broker.sideEffects, "none");

    const actionBlocked = await runCliCapture(["search", "actions", "execute", "commands:system", "help", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(actionBlocked.code, CLI_EXIT_FAILURE);
    const actionBlockedPayload = JSON.parse(actionBlocked.stdout) as {
      ok: boolean;
      error: { code: string };
      meta: { brokeredPlan?: { status: string; reasons: string[] } };
    };
    assert.equal(actionBlockedPayload.ok, false);
    assert.equal(actionBlockedPayload.error.code, "host_approval_required");
    assert.equal(actionBlockedPayload.meta.brokeredPlan?.status, "blocked");
    assert.equal(actionBlockedPayload.meta.brokeredPlan?.reasons.includes("host_approval_required"), true);

    const actionBrokered = await runCliCapture(["search", "actions", "execute", "commands:system", "help", "--host-approval-id", "approval_search_help", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(actionBrokered.code, CLI_EXIT_OK);
    const actionBrokeredPayload = JSON.parse(actionBrokered.stdout) as {
      data: { plan: { status: string; hostApprovalId?: string; broker: { sideEffects: string } } };
    };
    assert.equal(actionBrokeredPayload.data.plan.status, "brokered");
    assert.equal(actionBrokeredPayload.data.plan.hostApprovalId, "approval_search_help");
    assert.equal(actionBrokeredPayload.data.plan.broker.sideEffects, "host_brokered");

    const status = await runCliCapture(["search", "status", "--data-dir", dataRoot, "--json"], workspaceRoot);
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

    const saved = await runCliCapture(["search", "saved", "create", "recent-system", "--query", "system capabilities", "--name", "Recent system", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(saved.code, CLI_EXIT_OK);
    const savedPayload = JSON.parse(saved.stdout) as {
      data: { item: { id: string; name: string; query: { query: string } }; items: Array<{ id: string }> };
    };
    assert.equal(savedPayload.data.item.id, "recent-system");
    assert.equal(savedPayload.data.item.name, "Recent system");
    assert.equal(savedPayload.data.item.query.query, "system capabilities");
    assert.equal(savedPayload.data.items.some((item) => item.id === "recent-system"), true);

    const monitor = await runCliCapture(["search", "monitors", "create", "monitor-system", "--saved-search", "recent-system", "--cadence", "hourly", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(monitor.code, CLI_EXIT_OK);
    const monitorPayload = JSON.parse(monitor.stdout) as {
      data: { item: { id: string; savedSearchId: string; cadence: string }; items: Array<{ id: string; enabled: boolean }> };
    };
    assert.equal(monitorPayload.data.item.id, "monitor-system");
    assert.equal(monitorPayload.data.item.savedSearchId, "recent-system");
    assert.equal(monitorPayload.data.item.cadence, "hourly");
    assert.equal(monitorPayload.data.items.some((item) => item.id === "monitor-system" && item.enabled), true);

    const paused = await runCliCapture(["search", "sources", "pause", "commands", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(paused.code, CLI_EXIT_OK);
    const pausedPayload = JSON.parse(paused.stdout) as {
      data: { source: string; state: string; sources: Array<{ id: string; state: string }> };
    };
    assert.equal(pausedPayload.data.source, "commands");
    assert.equal(pausedPayload.data.state, "paused");
    assert.equal(pausedPayload.data.sources.find((source) => source.id === "commands")?.state, "paused");

    const pausedQuery = await runCliCapture(["search", "query", "system capabilities", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(pausedQuery.code, CLI_EXIT_DEGRADED);
    const pausedQueryPayload = JSON.parse(pausedQuery.stdout) as {
      data: { results: unknown[]; partial: boolean; omittedSources: Array<{ source: string; reason: string; message?: string }> };
    };
    assert.deepEqual(pausedQueryPayload.data.results, []);
    assert.equal(pausedQueryPayload.data.partial, true);
    assert.equal(pausedQueryPayload.data.omittedSources.some((source) => source.source === "commands" && source.reason === "disabled" && source.message?.includes("paused")), true);

    const pausedRebuild = await runCliCapture(["search", "rebuild", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(pausedRebuild.code, CLI_EXIT_OK);
    const pausedRebuildPayload = JSON.parse(pausedRebuild.stdout) as {
      data: { indexedBySource: { commands: number }; sources: string[] };
    };
    assert.equal(pausedRebuildPayload.data.indexedBySource.commands, 0);
    assert.equal(pausedRebuildPayload.data.sources.includes("commands"), false);

    const resumed = await runCliCapture(["search", "sources", "resume", "commands", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(resumed.code, CLI_EXIT_OK);
    const resumedPayload = JSON.parse(resumed.stdout) as { data: { state: string } };
    assert.equal(resumedPayload.data.state, "enabled");
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

    const rebuild = await runCliCapture(["search", "rebuild", "--data-dir", dataRoot, "--json"], workspaceRoot);
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

    const query = await runCliCapture(["search", "query", "Analytical engine", "--domains", "database", "--data-dir", dataRoot, "--json", "--limit", "5", "--explain", "true"], workspaceRoot);
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
        facets?: Array<{ id: string; label: string }>;
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
    assert.equal(queryPayload.data.facets?.some((facet) => facet.id === "collection"), true);

    const filtered = await runCliCapture([
      "search",
      "query",
      "Analytical engine",
      "--domains",
      "database",
      "--filters",
      JSON.stringify({ type: "record", "metadata.collection": "contacts", redacted: false }),
      "--data-dir",
      dataRoot,
      "--json",
      "--limit",
      "5",
    ], workspaceRoot);
    assert.equal(filtered.code, CLI_EXIT_OK);
    const filteredPayload = JSON.parse(filtered.stdout) as {
      data: { results: Array<{ title: string; metadata?: { collection?: string } }> };
    };
    assert.equal(filteredPayload.data.results.some((result) => result.title.includes("Ada") && result.metadata?.collection === "contacts"), true);

    const filteredOut = await runCliCapture([
      "search",
      "query",
      "Analytical engine",
      "--domains",
      "database",
      "--filters",
      "metadata.collection=companies",
      "--data-dir",
      dataRoot,
      "--json",
      "--limit",
      "5",
    ], workspaceRoot);
    assert.equal(filteredOut.code, CLI_EXIT_DEGRADED);
    const filteredOutPayload = JSON.parse(filteredOut.stdout) as { data: { results: unknown[] } };
    assert.deepEqual(filteredOutPayload.data.results, []);

    const redacted = await runCliCapture(["search", "query", "Restricted launch", "--domains", "database", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
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
