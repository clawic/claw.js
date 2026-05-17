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

test("search rebuild indexes documents.blocks from document records", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-documents-"));
  const dataRoot = path.join(workspaceRoot, "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const createDocument = await runCliCapture([
      "db",
      "documents",
      "create",
      "--data",
      JSON.stringify({
        companyId: "company-demo",
        title: "Implementation Blueprint",
        content: "Search sections need independent document fast paths.",
        scopeKind: "project",
        scopeId: "project-search",
        accessLevel: "PUBLIC",
      }),
      "--json",
    ], workspaceRoot);
    assert.equal(createDocument.code, CLI_EXIT_OK);
    const createDocumentPayload = JSON.parse(createDocument.stdout) as { data: { id: string } };
    assert.ok(createDocumentPayload.data.id);

    const createBlock = await runCliCapture([
      "db",
      "document_blocks",
      "create",
      "--data",
      JSON.stringify({
        documentId: createDocumentPayload.data.id,
        type: "paragraph",
        position: 1,
        content: { text: "The blueprint includes scoped block search and fast snippets." },
      }),
      "--json",
    ], workspaceRoot);
    assert.equal(createBlock.code, CLI_EXIT_OK);

    const rebuild = await runCliCapture(["search", "rebuild", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(rebuild.code, CLI_EXIT_OK);
    const rebuildPayload = JSON.parse(rebuild.stdout) as {
      data: {
        sources: string[];
        pendingSources: string[];
        indexedBySource: { "documents.blocks": number };
      };
    };
    assert.equal(rebuildPayload.data.sources.includes("documents.blocks"), true);
    assert.equal(rebuildPayload.data.pendingSources.includes("documents.blocks"), false);
    assert.equal(rebuildPayload.data.indexedBySource["documents.blocks"], 1);

    const query = await runCliCapture([
      "search",
      "query",
      "scoped block search",
      "--domains",
      "documents",
      "--filters",
      JSON.stringify({ "metadata.scopeKind": "project", redacted: false }),
      "--data-dir",
      dataRoot,
      "--json",
      "--limit",
      "5",
      "--explain",
      "true",
    ], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as {
      data: {
        indexedFastPaths: { "documents.blocks": number };
        results: Array<{
          source: string;
          domain: string;
          type: string;
          title: string;
          subtitle?: string;
          metadata?: { scopeKind?: string; blockCount?: number; blockType?: string[] };
          permissions?: { redacted?: boolean };
          actions?: Array<{ id: string; kind: string }>;
          fragments?: Array<{ title?: string; snippet?: string }>;
          explanation?: { matchedBy?: string[] };
        }>;
        facets?: Array<{ id: string; label: string }>;
      };
    };
    assert.equal(queryPayload.data.indexedFastPaths["documents.blocks"], 1);
    const result = queryPayload.data.results.find((candidate) => candidate.title === "Implementation Blueprint");
    assert.equal(result?.source, "documents.blocks");
    assert.equal(result?.domain, "documents");
    assert.equal(result?.type, "document");
    assert.equal(result?.subtitle, "project/project-search");
    assert.equal(result?.metadata?.scopeKind, "project");
    assert.equal(result?.metadata?.blockCount, 1);
    assert.deepEqual(result?.metadata?.blockType, ["paragraph"]);
    assert.equal(result?.permissions?.redacted, false);
    assert.equal(result?.actions?.some((action) => action.id === "open" && action.kind === "open"), true);
    assert.equal(result?.fragments?.some((fragment) => fragment.title === "paragraph" && fragment.snippet?.includes("scoped block search")), true);
    assert.ok(result?.explanation?.matchedBy?.length);
    assert.equal(queryPayload.data.facets?.some((facet) => facet.id === "scopeKind"), true);
  });
});

test("search rebuild indexes images.derived from image library records", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-images-"));
  const dataRoot = path.join(workspaceRoot, "data");
  const imagePath = path.join(workspaceRoot, "launch-badge.png");
  fs.writeFileSync(imagePath, Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64",
  ));
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const imported = await runCliCapture([
      "image",
      "import",
      "--file",
      imagePath,
      "--title",
      "Launch Badge",
      "--prompt",
      "Blue launch badge with product mark",
      "--type",
      "logo",
      "--tags",
      "launch,badge",
      "--workspace",
      workspaceRoot,
      "--runtime",
      "demo",
      "--json",
    ], workspaceRoot);
    assert.equal(imported.code, CLI_EXIT_OK);
    const importedPayload = JSON.parse(imported.stdout) as { data: { id: string; title: string } };
    assert.ok(importedPayload.data.id);
    assert.equal(importedPayload.data.title, "Launch Badge");

    const rebuild = await runCliCapture(["search", "rebuild", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(rebuild.code, CLI_EXIT_OK);
    const rebuildPayload = JSON.parse(rebuild.stdout) as {
      data: {
        sources: string[];
        pendingSources: string[];
        indexedBySource: { "images.derived": number };
      };
    };
    assert.equal(rebuildPayload.data.sources.includes("images.derived"), true);
    assert.equal(rebuildPayload.data.pendingSources.includes("images.derived"), false);
    assert.equal(rebuildPayload.data.indexedBySource["images.derived"], 1);

    const query = await runCliCapture([
      "search",
      "query",
      "product mark",
      "--domains",
      "images",
      "--filters",
      "metadata.imageType=logo",
      "--workspace",
      workspaceRoot,
      "--data-dir",
      dataRoot,
      "--json",
      "--limit",
      "5",
      "--explain",
      "true",
    ], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as {
      data: {
        indexedFastPaths: { "images.derived": number };
        results: Array<{
          source: string;
          domain: string;
          type: string;
          title: string;
          metadata?: { imageType?: string; provenance?: string; tag?: string[] };
          actions?: Array<{ id: string; kind: string; requiresApproval?: boolean; grant?: string }>;
          fragments?: Array<{ title?: string; snippet?: string }>;
          explanation?: { matchedBy?: string[] };
        }>;
        facets?: Array<{ id: string; label: string }>;
      };
    };
    assert.equal(queryPayload.data.indexedFastPaths["images.derived"], 1);
    const result = queryPayload.data.results.find((candidate) => candidate.title === "Launch Badge");
    assert.equal(result?.source, "images.derived");
    assert.equal(result?.domain, "images");
    assert.equal(result?.type, "image");
    assert.equal(result?.metadata?.imageType, "logo");
    assert.equal(result?.metadata?.provenance, "imported-manual");
    assert.deepEqual(result?.metadata?.tag, ["launch", "badge"]);
    assert.equal(result?.actions?.some((action) => action.id === "open" && action.requiresApproval === true && action.grant === "search.images.open"), true);
    assert.equal(result?.fragments?.some((fragment) => fragment.title === "prompt" && fragment.snippet?.includes("product mark")), true);
    assert.ok(result?.explanation?.matchedBy?.length);
    assert.equal(queryPayload.data.facets?.some((facet) => facet.id === "imageType"), true);
  });
});

test("search rebuild indexes media.assets from workspace media records", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-media-"));
  const dataRoot = path.join(workspaceRoot, "data");
  const mediaDir = path.join(workspaceRoot, ".claw", "data", "collections", "media");
  fs.mkdirSync(mediaDir, { recursive: true });
  fs.writeFileSync(path.join(mediaDir, "media-demo-document.json"), JSON.stringify({
    mediaId: "media-demo-document",
    name: "Requirements Brief.pdf",
    mimeType: "application/pdf",
    kind: "document",
    origin: "imported",
    direction: "inbound",
    workspaceId: "workspace-demo",
    projectId: "project-search",
    agentId: "agent-search",
    sessionId: "session-media",
    sourceText: "Requirements brief covering media indexing and retrieval.",
    metadata: {
      description: "Signed PDF with launch requirements",
    },
    createdAt: "2026-05-17T10:00:00.000Z",
    updatedAt: "2026-05-17T10:00:00.000Z",
    shareIds: [],
  }, null, 2));

  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const rebuild = await runCliCapture(["search", "rebuild", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(rebuild.code, CLI_EXIT_OK);
    const rebuildPayload = JSON.parse(rebuild.stdout) as {
      data: {
        sources: string[];
        pendingSources: string[];
        indexedBySource: { "media.assets": number };
      };
    };
    assert.equal(rebuildPayload.data.sources.includes("media.assets"), true);
    assert.equal(rebuildPayload.data.pendingSources.includes("media.assets"), false);
    assert.equal(rebuildPayload.data.indexedBySource["media.assets"], 1);

    const query = await runCliCapture([
      "search",
      "query",
      "media indexing",
      "--domains",
      "media",
      "--filters",
      "metadata.kind=document,metadata.project=project-search",
      "--workspace",
      workspaceRoot,
      "--data-dir",
      dataRoot,
      "--json",
      "--limit",
      "5",
      "--explain",
      "true",
    ], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as {
      data: {
        indexedFastPaths: { "media.assets": number };
        results: Array<{
          source: string;
          domain: string;
          type: string;
          title: string;
          metadata?: { kind?: string; project?: string; sessionId?: string };
          actions?: Array<{ id: string; kind: string; requiresApproval?: boolean; grant?: string }>;
          fragments?: Array<{ title?: string; snippet?: string }>;
          explanation?: { matchedBy?: string[] };
        }>;
        facets?: Array<{ id: string; label: string }>;
      };
    };
    assert.equal(queryPayload.data.indexedFastPaths["media.assets"], 1);
    const result = queryPayload.data.results.find((candidate) => candidate.title === "Requirements Brief.pdf");
    assert.equal(result?.source, "media.assets");
    assert.equal(result?.domain, "media");
    assert.equal(result?.type, "document");
    assert.equal(result?.metadata?.kind, "document");
    assert.equal(result?.metadata?.project, "project-search");
    assert.equal(result?.metadata?.sessionId, "session-media");
    assert.equal(result?.actions?.some((action) => action.id === "open" && action.requiresApproval === true && action.grant === "search.media.open"), true);
    assert.equal(result?.fragments?.some((fragment) => fragment.title === "source text" && fragment.snippet?.includes("media indexing")), true);
    assert.ok(result?.explanation?.matchedBy?.length);
    assert.equal(queryPayload.data.facets?.some((facet) => facet.id === "kind"), true);
  });
});

test("search rebuild indexes generations.artifacts from workspace generation records", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-generations-"));
  const dataRoot = path.join(workspaceRoot, "data");
  const generationsDir = path.join(workspaceRoot, ".claw", "data", "collections", "generations");
  fs.mkdirSync(generationsDir, { recursive: true });
  fs.writeFileSync(path.join(generationsDir, "gen-demo-image.json"), JSON.stringify({
    id: "gen-demo-image",
    kind: "image",
    status: "succeeded",
    prompt: "Generate a launch dashboard hero image with analytics cards",
    title: "Launch Dashboard Hero",
    backendId: "command",
    backendLabel: "External Command",
    backendType: "command",
    backendSource: "ad_hoc",
    model: "local-test-model",
    createdAt: "2026-05-17T10:00:00.000Z",
    updatedAt: "2026-05-17T10:00:00.000Z",
    metadata: {
      style: "product",
      brief: "Search generated artifact indexing",
    },
    command: {
      command: "node",
      args: ["generate-image.js"],
    },
    outputRelativePath: "generations/image/gen-demo-image.png",
    outputMimeType: "image/png",
  }, null, 2));

  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const rebuild = await runCliCapture(["search", "rebuild", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(rebuild.code, CLI_EXIT_OK);
    const rebuildPayload = JSON.parse(rebuild.stdout) as {
      data: {
        sources: string[];
        pendingSources: string[];
        indexedBySource: { "generations.artifacts": number };
      };
    };
    assert.equal(rebuildPayload.data.sources.includes("generations.artifacts"), true);
    assert.equal(rebuildPayload.data.pendingSources.includes("generations.artifacts"), false);
    assert.equal(rebuildPayload.data.indexedBySource["generations.artifacts"], 1);

    const query = await runCliCapture([
      "search",
      "query",
      "analytics cards",
      "--domains",
      "generations",
      "--filters",
      "metadata.kind=image,metadata.status=succeeded",
      "--workspace",
      workspaceRoot,
      "--data-dir",
      dataRoot,
      "--json",
      "--limit",
      "5",
      "--explain",
      "true",
    ], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as {
      data: {
        indexedFastPaths: { "generations.artifacts": number };
        results: Array<{
          source: string;
          domain: string;
          type: string;
          title: string;
          metadata?: { kind?: string; status?: string; backendId?: string; hasOutput?: boolean };
          actions?: Array<{ id: string; kind: string; requiresApproval?: boolean; grant?: string }>;
          fragments?: Array<{ title?: string; snippet?: string }>;
          explanation?: { matchedBy?: string[] };
        }>;
        facets?: Array<{ id: string; label: string }>;
      };
    };
    assert.equal(queryPayload.data.indexedFastPaths["generations.artifacts"], 1);
    const result = queryPayload.data.results.find((candidate) => candidate.title === "Launch Dashboard Hero");
    assert.equal(result?.source, "generations.artifacts");
    assert.equal(result?.domain, "generations");
    assert.equal(result?.type, "image");
    assert.equal(result?.metadata?.kind, "image");
    assert.equal(result?.metadata?.status, "succeeded");
    assert.equal(result?.metadata?.backendId, "command");
    assert.equal(result?.metadata?.hasOutput, true);
    assert.equal(result?.actions?.some((action) => action.id === "open" && action.requiresApproval === true && action.grant === "search.generations.open"), true);
    assert.equal(result?.fragments?.some((fragment) => fragment.title === "prompt" && fragment.snippet?.includes("analytics cards")), true);
    assert.ok(result?.explanation?.matchedBy?.length);
    assert.equal(queryPayload.data.facets?.some((facet) => facet.id === "backendId"), true);
  });
});

test("search rebuild can refresh one source without clearing sibling fast paths", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-scoped-rebuild-"));
  const dataRoot = path.join(workspaceRoot, "data");
  const mediaDir = path.join(workspaceRoot, ".claw", "data", "collections", "media");
  const generationsDir = path.join(workspaceRoot, ".claw", "data", "collections", "generations");
  fs.mkdirSync(mediaDir, { recursive: true });
  fs.mkdirSync(generationsDir, { recursive: true });
  fs.writeFileSync(path.join(mediaDir, "media-audited-receipt.json"), JSON.stringify({
    mediaId: "media-audited-receipt",
    name: "Audited Receipt.pdf",
    mimeType: "application/pdf",
    kind: "document",
    origin: "imported",
    direction: "inbound",
    sourceText: "Audited receipt content must survive generation-only rebuilds.",
    createdAt: "2026-05-17T10:00:00.000Z",
    updatedAt: "2026-05-17T10:00:00.000Z",
  }, null, 2));
  const generationPath = path.join(generationsDir, "gen-campaign-brief.json");
  fs.writeFileSync(generationPath, JSON.stringify({
    id: "gen-campaign-brief",
    kind: "document",
    status: "succeeded",
    title: "Campaign Brief",
    prompt: "Initial campaign analytics brief",
    backendId: "command",
    backendSource: "ad_hoc",
    createdAt: "2026-05-17T10:00:00.000Z",
    updatedAt: "2026-05-17T10:00:00.000Z",
  }, null, 2));

  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const fullRebuild = await runCliCapture(["search", "rebuild", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(fullRebuild.code, CLI_EXIT_OK);

    fs.writeFileSync(generationPath, JSON.stringify({
      id: "gen-campaign-brief",
      kind: "document",
      status: "succeeded",
      title: "Campaign Market Maps",
      prompt: "Updated generation prompt with market maps and channel forecasts",
      backendId: "command",
      backendSource: "ad_hoc",
      createdAt: "2026-05-17T10:00:00.000Z",
      updatedAt: "2026-05-17T10:05:00.000Z",
    }, null, 2));

    const scopedRebuild = await runCliCapture([
      "search",
      "rebuild",
      "--source",
      "generations.artifacts",
      "--workspace",
      workspaceRoot,
      "--data-dir",
      dataRoot,
      "--json",
    ], workspaceRoot);
    assert.equal(scopedRebuild.code, CLI_EXIT_OK);
    const scopedPayload = JSON.parse(scopedRebuild.stdout) as {
      data: {
        mode: string;
        selectedSources: string[];
        sources: string[];
        pendingSources: string[];
        indexedBySource: { "generations.artifacts": number; "media.assets": number };
      };
    };
    assert.equal(scopedPayload.data.mode, "scoped");
    assert.deepEqual(scopedPayload.data.selectedSources, ["generations.artifacts"]);
    assert.deepEqual(scopedPayload.data.sources, ["generations.artifacts"]);
    assert.deepEqual(scopedPayload.data.pendingSources, []);
    assert.equal(scopedPayload.data.indexedBySource["generations.artifacts"], 1);
    assert.equal(scopedPayload.data.indexedBySource["media.assets"], 0);

    const mediaQuery = await runCliCapture(["search", "query", "Audited Receipt", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(mediaQuery.code, CLI_EXIT_OK);
    const mediaPayload = JSON.parse(mediaQuery.stdout) as { data: { results: Array<{ source: string; title: string }> } };
    assert.equal(mediaPayload.data.results.some((result) => result.source === "media.assets" && result.title === "Audited Receipt.pdf"), true);

    const generationQuery = await runCliCapture(["search", "query", "market maps", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(generationQuery.code, CLI_EXIT_OK);
    const generationPayload = JSON.parse(generationQuery.stdout) as { data: { results: Array<{ source: string; title: string }> } };
    assert.equal(generationPayload.data.results.some((result) => result.source === "generations.artifacts" && result.title === "Campaign Market Maps"), true);
  });
});

test("search indexes scoped code.symbols without broadening other domains", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-code-"));
  const dataRoot = path.join(workspaceRoot, "data");
  const sourceRoot = path.join(workspaceRoot, "project");
  fs.mkdirSync(path.join(sourceRoot, "src"), { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, "README.md"), [
    "# Search Adapter Notes",
    "",
    "The framework search adapter keeps domain fast paths independent.",
    "",
  ].join("\n"));
  fs.writeFileSync(path.join(sourceRoot, "src", "feature-search.ts"), [
    "export interface SearchNeedleConfig {",
    "  enabled: boolean;",
    "}",
    "",
    "export function makeNeedleSymbol(config: SearchNeedleConfig) {",
    "  return config.enabled ? \"needle-ready\" : \"needle-off\";",
    "}",
    "",
  ].join("\n"));

  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const rebuild = await runCliCapture(["search", "rebuild", "--data-dir", dataRoot, "--code-root", sourceRoot, "--json"], workspaceRoot);
    assert.equal(rebuild.code, CLI_EXIT_OK);
    const rebuildPayload = JSON.parse(rebuild.stdout) as {
      data: {
        sources: string[];
        pendingSources: string[];
        indexedBySource: { "code.symbols": number };
      };
    };
    assert.equal(rebuildPayload.data.sources.includes("code.symbols"), true);
    assert.equal(rebuildPayload.data.pendingSources.includes("code.symbols"), false);
    assert.equal(rebuildPayload.data.indexedBySource["code.symbols"], 2);

    const query = await runCliCapture([
      "search",
      "query",
      "makeNeedleSymbol",
      "--domains",
      "code",
      "--filters",
      "metadata.language=typescript",
      "--data-dir",
      dataRoot,
      "--code-root",
      sourceRoot,
      "--json",
      "--limit",
      "5",
      "--explain",
      "true",
    ], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as {
      data: {
        indexedFastPaths: { "code.symbols": number };
        results: Array<{
          source: string;
          domain: string;
          type: string;
          title: string;
          path?: string;
          metadata?: { language?: string; relativePath?: string; symbolCount?: number };
          actions?: Array<{ id: string; kind: string; requiresApproval?: boolean; grant?: string }>;
          fragments?: Array<{ title?: string; snippet?: string }>;
          explanation?: { matchedBy?: string[] };
        }>;
        facets?: Array<{ id: string; label: string }>;
      };
    };
    assert.equal(queryPayload.data.indexedFastPaths["code.symbols"], 2);
    const result = queryPayload.data.results.find((candidate) => candidate.title === "feature-search.ts");
    assert.equal(result?.source, "code.symbols");
    assert.equal(result?.domain, "code");
    assert.equal(result?.type, "file");
    assert.equal(result?.metadata?.language, "typescript");
    assert.equal(result?.metadata?.relativePath, "src/feature-search.ts");
    assert.equal(result?.metadata?.symbolCount, 2);
    assert.equal(result?.path, path.join(sourceRoot, "src", "feature-search.ts"));
    assert.equal(result?.actions?.some((action) => action.id === "open" && action.requiresApproval === true && action.grant === "search.code.open"), true);
    assert.equal(result?.fragments?.some((fragment) => fragment.title === "function makeNeedleSymbol" && fragment.snippet?.includes("makeNeedleSymbol")), true);
    assert.ok(result?.explanation?.matchedBy?.length);
    assert.equal(queryPayload.data.facets?.some((facet) => facet.id === "language"), true);

    const chatOnly = await runCliCapture(["search", "query", "makeNeedleSymbol", "--domains", "sessions", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(chatOnly.code, CLI_EXIT_DEGRADED);
    const chatOnlyPayload = JSON.parse(chatOnly.stdout) as {
      data: { indexedFastPaths: Record<string, number>; results: unknown[] };
    };
    assert.equal("code.symbols" in chatOnlyPayload.data.indexedFastPaths, false);
    assert.deepEqual(chatOnlyPayload.data.results, []);
  });
});
