import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { SearchStore, createFrameworkSearchSourceManifest } from "@clawjs/search";
import { CLI_EXIT_DEGRADED, CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE } from "./index.ts";
import { captureStream, createFakeGenerationScript, runCliCapture, runInternalV1Cli, withPatchedEnv } from "./index-test-utils.ts";
import { scheduleCodeSymbolsSearchEvent, scheduleSessionChatSearchEvent } from "./cli-search-events.ts";
import { runSearchDocsPagesEventScenario, runSearchDocsPagesScenario } from "./cli-search-docs-pages-test-utils.ts";
import { runSearchLocalFilesEventScenario } from "./cli-search-local-files-test-utils.ts";
import { runSearchSurfaceRouteGraphContractsScenario } from "./cli-search-surface-routes-test-utils.ts";
import { runSearchExternalCacheEventScenario, runSearchWebIngestedEventScenario } from "./cli-search-web-external-test-utils.ts";
import { ensureV1MainSchema, resolveClawjsMainDbPath } from "./v1-data-core.ts";

test("Search MCP package publishes only the public Search binary", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "packages/clawjs-search-mcp/package.json"), "utf8")) as {
    bin?: Record<string, string>;
    dependencies?: Record<string, string>;
  };

  assert.deepEqual(packageJson.bin, { "claw-search-mcp": "bin/claw-search-mcp.mjs" });
  assert.equal(packageJson.dependencies?.["@clawjs/search"], "0.1.2");
  assert.equal(fs.existsSync(path.resolve(process.cwd(), "packages/clawjs-search-mcp/bin/claw-search-mcp.mjs")), true);
  assert.equal(fs.existsSync(path.resolve(process.cwd(), "packages/clawjs-search-mcp/bin", ["clawjs", "index", "mcp"].join("-") + ".mjs")), false);
});

test("search actions honor actor and scope ACLs", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-actions-acl-"));
  const dataRoot = path.join(workspaceRoot, "data");
  const store = new SearchStore(path.join(dataRoot, "search.sqlite"));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "documents.blocks",
      domain: "documents",
      name: "Documents",
      resultTypes: ["document"],
    }));
    store.upsertDocument({
      id: "documents.blocks:restricted",
      source: "documents.blocks",
      domain: "documents",
      type: "document",
      title: "Restricted launch notes",
      body: "Restricted launch notes for scoped action checks.",
      permissions: { allowedActors: ["agent:codex"], requiredScopes: ["project-alpha"] },
      actions: [{ id: "open", kind: "open", label: "Open restricted note", grant: "search.documents.open", requiresApproval: false }],
    });
  } finally {
    store.close();
  }

  const hidden = await runCliCapture(["search", "actions", "documents.blocks:restricted", "--data-dir", dataRoot, "--json"], workspaceRoot);
  assert.equal(hidden.code, CLI_EXIT_OK);
  const hiddenPayload = JSON.parse(hidden.stdout) as { data: { actions: unknown[] } };
  assert.deepEqual(hiddenPayload.data.actions, []);

  const wrongScope = await runCliCapture(["search", "actions", "documents.blocks:restricted", "--actor", "agent:codex", "--filter", "scopeId=project-beta", "--data-dir", dataRoot, "--json"], workspaceRoot);
  assert.equal(wrongScope.code, CLI_EXIT_OK);
  const wrongScopePayload = JSON.parse(wrongScope.stdout) as { data: { actions: unknown[] } };
  assert.deepEqual(wrongScopePayload.data.actions, []);

  const visible = await runCliCapture(["search", "actions", "documents.blocks:restricted", "--actor", "agent:codex", "--filter", "scopeId=project-alpha", "--data-dir", dataRoot, "--json"], workspaceRoot);
  assert.equal(visible.code, CLI_EXIT_OK);
  const visiblePayload = JSON.parse(visible.stdout) as { data: { actions: Array<{ id: string }> } };
  assert.deepEqual(visiblePayload.data.actions.map((action) => action.id), ["open"]);

  const blockedExecute = await runCliCapture(["search", "actions", "execute", "documents.blocks:restricted", "open", "--actor", "agent:codex", "--filter", "scopeId=project-beta", "--dry-run", "--data-dir", dataRoot, "--json"], workspaceRoot);
  assert.equal(blockedExecute.code, CLI_EXIT_FAILURE);
  const blockedExecutePayload = JSON.parse(blockedExecute.stdout) as { error: { code: string } };
  assert.equal(blockedExecutePayload.error.code, "search_action_not_found");

  const allowedExecute = await runCliCapture(["search", "actions", "execute", "documents.blocks:restricted", "open", "--actor", "agent:codex", "--filter", "scopeId=project-alpha", "--dry-run", "--data-dir", dataRoot, "--json"], workspaceRoot);
  assert.equal(allowedExecute.code, CLI_EXIT_OK);
  const allowedExecutePayload = JSON.parse(allowedExecute.stdout) as { data: { plan: { status: string; resultId: string; actionId: string } } };
  assert.equal(allowedExecutePayload.data.plan.status, "planned");
  assert.equal(allowedExecutePayload.data.plan.resultId, "documents.blocks:restricted");
  assert.equal(allowedExecutePayload.data.plan.actionId, "open");
});

test("search rebuild indexes surface route graph contracts", runSearchSurfaceRouteGraphContractsScenario);

test("search rebuild indexes docs pages and refreshes resource jobs", runSearchDocsPagesScenario);

test("docs.pages event jobs refresh and tombstone individual docs", runSearchDocsPagesEventScenario);

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

    const defaultShardQuery = await runCliCapture(["search", "query", "system capabilities", "--data-dir", dataRoot, "--json", "--limit", "5", "--shards", "default"], workspaceRoot);
    assert.equal(defaultShardQuery.code, CLI_EXIT_OK);
    const defaultShardPayload = JSON.parse(defaultShardQuery.stdout) as { data: { results: Array<{ source: string; title: string; shard?: string }> } };
    assert.equal(defaultShardPayload.data.results.some((result) => result.source === "commands" && result.title === "system" && result.shard === undefined), true);

    const cursorStore = new SearchStore(path.join(dataRoot, "search.sqlite"));
    try {
      cursorStore.setCursor({
        source: "commands",
        shard: "hot",
        cursor: "commands-cursor-1",
        watermark: "2026-05-18T10:00:00.000Z",
        metadata: { registryVersion: 1 },
      });
    } finally {
      cursorStore.close();
    }
    const cursorStatus = await runCliCapture(["search", "status", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(cursorStatus.code, CLI_EXIT_OK);
    const cursorStatusPayload = JSON.parse(cursorStatus.stdout) as { data: { cursors: Array<{ source: string; shard: string; cursor: string; watermark: string; checksum: string; metadata: Record<string, unknown> }> } };
    const commandsCursor = cursorStatusPayload.data.cursors.find((cursor) => cursor.source === "commands" && cursor.shard === "hot");
    assert.equal(commandsCursor?.cursor, "commands-cursor-1");
    assert.equal(commandsCursor?.watermark, "2026-05-18T10:00:00.000Z");
    assert.equal(commandsCursor?.checksum.length, 64);
    assert.deepEqual(commandsCursor?.metadata, { registryVersion: 1 });

    const budgetedQuery = await runCliCapture(["search", "query", "search", "--domains", "commands", "--data-dir", dataRoot, "--json", "--limit", "5", "--agent-result-limit", "1"], workspaceRoot);
    assert.equal(budgetedQuery.code, CLI_EXIT_OK);
    const budgetedPayload = JSON.parse(budgetedQuery.stdout) as { data: { agentBudget: { maxResults: number }; results: unknown[] } };
    assert.equal(budgetedPayload.data.agentBudget.maxResults, 1);
    assert.equal(budgetedPayload.data.results.length, 1);

    const enqueueJob = await runCliCapture(["search", "jobs", "enqueue", "backfill", "--source", "commands", "--id", "job:commands", "--shard", "default", "--resource-id", "commands", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(enqueueJob.code, CLI_EXIT_OK);
    const enqueuePayload = JSON.parse(enqueueJob.stdout) as { data: { item?: { id: string; operation: string; shard: string }; items: Array<{ id: string }> } };
    assert.equal(enqueuePayload.data.item?.id, "job:commands");
    assert.equal(enqueuePayload.data.item?.operation, "backfill");
    assert.equal(enqueuePayload.data.item?.shard, "default");
    assert.equal(enqueuePayload.data.items.some((item) => item.id === "job:commands"), true);

    const scheduledEvent = await runCliCapture([
      "search",
      "jobs",
      "schedule",
      "upsert",
      "--source",
      "commands",
      "--resource-id",
      "system",
      "--payload",
      JSON.stringify({ reason: "registry_changed" }),
      "--observed-at",
      "2026-05-17T10:00:00.000Z",
      "--scheduled-at",
      "2026-05-18T10:00:00.000Z",
      "--data-dir",
      dataRoot,
      "--json",
    ], workspaceRoot);
    assert.equal(scheduledEvent.code, CLI_EXIT_OK);
    const scheduledEventPayload = JSON.parse(scheduledEvent.stdout) as {
      data: { item: { id: string; source: string; shard: string; operation: string; resourceId: string; priority: number; payload: { eventDriven?: boolean; reason?: string; observedAt?: string } } };
    };
    assert.equal(scheduledEventPayload.data.item.id, "event:commands:hot:upsert:system");
    assert.equal(scheduledEventPayload.data.item.source, "commands");
    assert.equal(scheduledEventPayload.data.item.shard, "hot");
    assert.equal(scheduledEventPayload.data.item.operation, "upsert");
    assert.equal(scheduledEventPayload.data.item.resourceId, "system");
    assert.equal(scheduledEventPayload.data.item.priority, 60);
    assert.equal(scheduledEventPayload.data.item.payload.eventDriven, true);
    assert.equal(scheduledEventPayload.data.item.payload.reason, "registry_changed");
    assert.equal(scheduledEventPayload.data.item.payload.observedAt, "2026-05-17T10:00:00.000Z");

    const claimJob = await runCliCapture(["search", "jobs", "claim", "--source", "commands", "--shard", "default", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(claimJob.code, CLI_EXIT_OK);
    const claimPayload = JSON.parse(claimJob.stdout) as { data: { items: Array<{ id: string; status: string }> } };
    assert.deepEqual(claimPayload.data.items.map((item) => [item.id, item.status]), [["job:commands", "leased"]]);

    const hybridQuery = await runCliCapture(["search", "query", "system capabilities", "--data-dir", dataRoot, "--json", "--limit", "5", "--strategy", "hybrid", "--embedding-model", "local-test", "--embedding", "[1,0,0]"], workspaceRoot);
    assert.equal(hybridQuery.code, CLI_EXIT_OK);
    const hybridPayload = JSON.parse(hybridQuery.stdout) as {
      data: { strategy?: string; embeddingModel?: string; results: Array<{ source: string; title: string }> };
    };
    assert.equal(hybridPayload.data.strategy, "hybrid");
    assert.equal(hybridPayload.data.embeddingModel, "local-test");
    assert.equal(hybridPayload.data.results.some((result) => result.source === "commands" && result.title === "system"), true);

    const enqueuedJob = await runCliCapture(["search", "jobs", "enqueue", "backfill", "--source", "commands", "--id", "job:commands:backfill", "--shard", "hot", "--priority", "90", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(enqueuedJob.code, CLI_EXIT_OK);
    const enqueuedJobPayload = JSON.parse(enqueuedJob.stdout) as { data: { item: { id: string; source: string; shard: string; operation: string; status: string; priority: number } } };
    assert.deepEqual({
      id: enqueuedJobPayload.data.item.id,
      source: enqueuedJobPayload.data.item.source,
      shard: enqueuedJobPayload.data.item.shard,
      operation: enqueuedJobPayload.data.item.operation,
      status: enqueuedJobPayload.data.item.status,
      priority: enqueuedJobPayload.data.item.priority,
    }, { id: "job:commands:backfill", source: "commands", shard: "hot", operation: "backfill", status: "queued", priority: 90 });

    const claimedJob = await runCliCapture(["search", "jobs", "claim", "--shards", "hot", "--limit", "1", "--lease-ms", "1000", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(claimedJob.code, CLI_EXIT_OK);
    const claimedJobPayload = JSON.parse(claimedJob.stdout) as { data: { items: Array<{ id: string; status: string; attempts: number }> } };
    assert.deepEqual(claimedJobPayload.data.items.map((job) => ({ id: job.id, status: job.status, attempts: job.attempts })), [{ id: "job:commands:backfill", status: "leased", attempts: 1 }]);

    const completedJob = await runCliCapture(["search", "jobs", "complete", "job:commands:backfill", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(completedJob.code, CLI_EXIT_OK);
    const completedJobPayload = JSON.parse(completedJob.stdout) as { data: { item: { id: string; status: string } } };
    assert.equal(completedJobPayload.data.item.id, "job:commands:backfill");
    assert.equal(completedJobPayload.data.item.status, "done");

    const fullSources = await runCliCapture(["search", "sources", "--profile", "full", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(fullSources.code, CLI_EXIT_OK);
    const fullSourcesPayload = JSON.parse(fullSources.stdout) as { data: { sources: Array<{ id: string; profile: string; defaultState: string; state: string; fastPath: boolean }> } };
    const localFilesSource = fullSourcesPayload.data.sources.find((source) => source.id === "local.files");
    assert.equal(localFilesSource?.profile, "full");
    assert.equal(localFilesSource?.defaultState, "off");
    assert.equal(localFilesSource?.state, "disabled");
    assert.equal(localFilesSource?.fastPath, false);
    assert.equal(fullSourcesPayload.data.sources.some((source) => source.id === "web.ingested"), true);
    assert.equal(fullSourcesPayload.data.sources.some((source) => source.id === "external.cache"), true);

    const fileRoot = path.join(workspaceRoot, "local-files");
    fs.mkdirSync(path.join(fileRoot, "docs"), { recursive: true });
    fs.mkdirSync(path.join(fileRoot, "node_modules", "ignored"), { recursive: true });
    fs.writeFileSync(path.join(fileRoot, "docs", "launch-plan.txt"), "Offline invoice launch plan with local file content.");
    fs.writeFileSync(path.join(fileRoot, "node_modules", "ignored", "hidden.txt"), "This dependency copy must not be indexed.");

    const localFileDefaultQuery = await runCliCapture(["search", "query", "offline invoice", "--domains", "files", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(localFileDefaultQuery.code, CLI_EXIT_DEGRADED);
    const localFileDefaultPayload = JSON.parse(localFileDefaultQuery.stdout) as {
      data: { results: unknown[]; omittedSources: Array<{ source: string; reason: string }> };
    };
    assert.deepEqual(localFileDefaultPayload.data.results, []);
    assert.equal(localFileDefaultPayload.data.omittedSources.some((source) => source.source === "local.files" && source.reason === "profile"), true);

    const enableLocalFiles = await runCliCapture(["search", "sources", "enable", "local.files", "--profile", "full", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(enableLocalFiles.code, CLI_EXIT_OK);
    const enableLocalFilesPayload = JSON.parse(enableLocalFiles.stdout) as { data: { state: string } };
    assert.equal(enableLocalFilesPayload.data.state, "enabled");

    const localFilesRebuild = await runCliCapture(["search", "rebuild", "--source", "local.files", "--profile", "full", "--file-root", fileRoot, "--file-limit", "20", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(localFilesRebuild.code, CLI_EXIT_OK);
    const localFilesRebuildPayload = JSON.parse(localFilesRebuild.stdout) as {
      data: { sources: string[]; indexedBySource: { "local.files": number }; pendingSources: string[] };
    };
    assert.equal(localFilesRebuildPayload.data.sources.includes("local.files"), true);
    assert.equal(localFilesRebuildPayload.data.indexedBySource["local.files"], 1);
    assert.equal(localFilesRebuildPayload.data.pendingSources.includes("local.files"), false);

    const localFileQuery = await runCliCapture(["search", "query", "offline invoice", "--domains", "files", "--profile", "full", "--file-root", fileRoot, "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(localFileQuery.code, CLI_EXIT_OK);
    const localFileQueryPayload = JSON.parse(localFileQuery.stdout) as {
      data: {
        indexedFastPaths: { "local.files": number };
        results: Array<{ source: string; domain: string; type: string; title: string; path?: string; metadata?: { kind?: string; indexedContent?: boolean; relativePath?: string }; actions?: Array<{ id: string; kind: string }> }>;
      };
    };
    assert.equal(localFileQueryPayload.data.indexedFastPaths["local.files"], 1);
    const fileResult = localFileQueryPayload.data.results.find((result) => result.title === "launch-plan.txt");
    assert.equal(fileResult?.source, "local.files");
    assert.equal(fileResult?.domain, "files");
    assert.equal(fileResult?.type, "file");
    assert.equal(fileResult?.metadata?.kind, "text");
    assert.equal(fileResult?.metadata?.indexedContent, true);
    assert.equal(fileResult?.metadata?.relativePath, "docs/launch-plan.txt");
    assert.equal(fileResult?.actions?.some((action) => action.id === "open" && action.kind === "open"), true);
    assert.equal(localFileQueryPayload.data.results.some((result) => result.title === "hidden.txt"), false);

    const webRoot = path.join(workspaceRoot, "web-cache");
    fs.mkdirSync(webRoot, { recursive: true });
    fs.writeFileSync(path.join(webRoot, "release.html"), [
      "<html><head><title>Release Notes</title>",
      "<meta name=\"description\" content=\"Framework release notes\"></head>",
      "<body><h1>Release Notes</h1><p>Semantic crawler cache and explicit web ingestion.</p></body></html>",
    ].join(""));
    fs.writeFileSync(path.join(webRoot, "provider.json"), JSON.stringify({
      url: "https://example.com/provider",
      title: "Provider Cache",
      description: "External provider notes",
      text: "Provider cache mentions ingestion contracts.",
      crawlScope: "manual",
      updatedAt: "2026-05-17T10:00:00.000Z",
    }));

    const webDefaultQuery = await runCliCapture(["search", "query", "semantic crawler", "--domains", "web", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(webDefaultQuery.code, CLI_EXIT_DEGRADED);
    const webDefaultPayload = JSON.parse(webDefaultQuery.stdout) as {
      data: { results: unknown[]; omittedSources: Array<{ source: string; reason: string }> };
    };
    assert.deepEqual(webDefaultPayload.data.results, []);
    assert.equal(webDefaultPayload.data.omittedSources.some((source) => source.source === "web.ingested" && source.reason === "profile"), true);

    const enableWeb = await runCliCapture(["search", "sources", "enable", "web.ingested", "--profile", "full", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(enableWeb.code, CLI_EXIT_OK);

    const webRebuild = await runCliCapture(["search", "rebuild", "--source", "web.ingested", "--profile", "full", "--web-root", webRoot, "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(webRebuild.code, CLI_EXIT_OK);
    const webRebuildPayload = JSON.parse(webRebuild.stdout) as {
      data: { sources: string[]; indexedBySource: { "web.ingested": number }; pendingSources: string[] };
    };
    assert.equal(webRebuildPayload.data.sources.includes("web.ingested"), true);
    assert.equal(webRebuildPayload.data.indexedBySource["web.ingested"], 2);
    assert.equal(webRebuildPayload.data.pendingSources.includes("web.ingested"), false);

    const webQuery = await runCliCapture(["search", "query", "semantic crawler", "--domains", "web", "--profile", "full", "--web-root", webRoot, "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(webQuery.code, CLI_EXIT_OK);
    const webQueryPayload = JSON.parse(webQuery.stdout) as {
      data: {
        indexedFastPaths: { "web.ingested": number };
        results: Array<{ source: string; domain: string; type: string; title: string; metadata?: { host?: string; crawlScope?: string; contentType?: string }; actions?: Array<{ id: string; kind: string }> }>;
      };
    };
    assert.equal(webQueryPayload.data.indexedFastPaths["web.ingested"], 2);
    const webResult = webQueryPayload.data.results.find((result) => result.title === "Release Notes");
    assert.equal(webResult?.source, "web.ingested");
    assert.equal(webResult?.domain, "web");
    assert.equal(webResult?.type, "page");
    assert.equal(webResult?.metadata?.crawlScope, "explicit_cache");
    assert.equal(webResult?.metadata?.contentType, "text/html");
    assert.equal(webResult?.actions?.some((action) => action.id === "open" && action.kind === "open"), true);

    const webServiceJob = await runCliCapture(["search", "jobs", "enqueue", "rebuild", "--source", "web.ingested", "--id", "job:service:web", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(webServiceJob.code, CLI_EXIT_OK);
    const webServiceRun = await runCliCapture(["search", "service", "run-once", "--source", "web.ingested", "--web-root", webRoot, "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(webServiceRun.code, CLI_EXIT_OK);
    const webServiceRunPayload = JSON.parse(webServiceRun.stdout) as {
      data: { worker?: { items: Array<{ id: string; source: string; status: string; indexed?: number }> } };
    };
    assert.equal(webServiceRunPayload.data.worker?.items[0]?.id, "job:service:web");
    assert.equal(webServiceRunPayload.data.worker?.items[0]?.source, "web.ingested");
    assert.equal(webServiceRunPayload.data.worker?.items[0]?.status, "done");
    assert.equal(webServiceRunPayload.data.worker?.items[0]?.indexed, 2);

    const externalRoot = path.join(workspaceRoot, "external-cache");
    fs.mkdirSync(externalRoot, { recursive: true });
    fs.writeFileSync(path.join(externalRoot, "slack-thread.json"), JSON.stringify({
      provider: "slack",
      app: "team-chat",
      externalId: "thread-123",
      type: "thread",
      title: "Release thread",
      summary: "Launch checklist discussion",
      text: "The team discussed semantic search ingestion from external provider caches.",
      syncMode: "manual",
      updatedAt: "2026-05-17T11:00:00.000Z",
      apiToken: "should-not-be-indexed",
    }));
    fs.writeFileSync(path.join(externalRoot, "notes.txt"), "Provider export fallback mentions external cache invoices.");

    const externalDefaultQuery = await runCliCapture(["search", "query", "provider caches", "--domains", "external", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(externalDefaultQuery.code, CLI_EXIT_DEGRADED);
    const externalDefaultPayload = JSON.parse(externalDefaultQuery.stdout) as {
      data: { results: unknown[]; omittedSources: Array<{ source: string; reason: string }> };
    };
    assert.deepEqual(externalDefaultPayload.data.results, []);
    assert.equal(externalDefaultPayload.data.omittedSources.some((source) => source.source === "external.cache" && source.reason === "profile"), true);

    const enableExternal = await runCliCapture(["search", "sources", "enable", "external.cache", "--profile", "full", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(enableExternal.code, CLI_EXIT_OK);

    const externalRebuild = await runCliCapture(["search", "rebuild", "--source", "external.cache", "--profile", "full", "--external-root", externalRoot, "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(externalRebuild.code, CLI_EXIT_OK);
    const externalRebuildPayload = JSON.parse(externalRebuild.stdout) as {
      data: { sources: string[]; indexedBySource: { "external.cache": number }; pendingSources: string[] };
    };
    assert.equal(externalRebuildPayload.data.sources.includes("external.cache"), true);
    assert.equal(externalRebuildPayload.data.indexedBySource["external.cache"], 2);
    assert.equal(externalRebuildPayload.data.pendingSources.includes("external.cache"), false);

    const externalQuery = await runCliCapture(["search", "query", "semantic search ingestion", "--domains", "external", "--profile", "full", "--external-root", externalRoot, "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(externalQuery.code, CLI_EXIT_OK);
    const externalQueryPayload = JSON.parse(externalQuery.stdout) as {
      data: {
        indexedFastPaths: { "external.cache": number };
        results: Array<{ source: string; domain: string; type: string; title: string; body?: string; metadata?: { provider?: string; app?: string; syncMode?: string; externalId?: string }; actions?: Array<{ id: string; kind: string }> }>;
      };
    };
    assert.equal(externalQueryPayload.data.indexedFastPaths["external.cache"], 2);
    const externalResult = externalQueryPayload.data.results.find((result) => result.title === "Release thread");
    assert.equal(externalResult?.source, "external.cache");
    assert.equal(externalResult?.domain, "external");
    assert.equal(externalResult?.type, "thread");
    assert.equal(externalResult?.metadata?.provider, "slack");
    assert.equal(externalResult?.metadata?.app, "team-chat");
    assert.equal(externalResult?.metadata?.syncMode, "manual");
    assert.equal(externalResult?.metadata?.externalId, "thread-123");
    assert.equal(externalResult?.actions?.some((action) => action.id === "open" && action.kind === "open"), true);
    assert.equal(JSON.stringify(externalQueryPayload.data.results).includes("should-not-be-indexed"), false);

    const externalServiceJob = await runCliCapture(["search", "jobs", "enqueue", "rebuild", "--source", "external.cache", "--id", "job:service:external", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(externalServiceJob.code, CLI_EXIT_OK);
    const externalServiceRun = await runCliCapture(["search", "service", "run-once", "--source", "external.cache", "--external-root", externalRoot, "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(externalServiceRun.code, CLI_EXIT_OK);
    const externalServiceRunPayload = JSON.parse(externalServiceRun.stdout) as {
      data: { worker?: { items: Array<{ id: string; source: string; status: string; indexed?: number }> } };
    };
    assert.equal(externalServiceRunPayload.data.worker?.items[0]?.id, "job:service:external");
    assert.equal(externalServiceRunPayload.data.worker?.items[0]?.source, "external.cache");
    assert.equal(externalServiceRunPayload.data.worker?.items[0]?.status, "done");
    assert.equal(externalServiceRunPayload.data.worker?.items[0]?.indexed, 2);

    const sensitiveQuery = await runCliCapture(["search", "query", "password zqxj-token", "--data-dir", dataRoot, "--json", "--actor", "agent:codex", "--surface", "cli"], workspaceRoot);
    assert.ok([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(sensitiveQuery.code));
    const sensitiveAudit = await runCliCapture(["search", "audit", "--type", "sensitive_query", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(sensitiveAudit.code, CLI_EXIT_OK);
    const sensitiveAuditPayload = JSON.parse(sensitiveAudit.stdout) as {
      data: { items: Array<{ type: string; query?: string; actor?: string; surface?: string; reason?: string }> };
    };
    assert.equal(sensitiveAuditPayload.data.items[0]?.type, "sensitive_query");
    assert.equal(sensitiveAuditPayload.data.items[0]?.query, "password zqxj-token");
    assert.equal(sensitiveAuditPayload.data.items[0]?.actor, "agent:codex");
    assert.equal(sensitiveAuditPayload.data.items[0]?.surface, "cli");
    assert.equal(sensitiveAuditPayload.data.items[0]?.reason, "sensitive_query_or_redacted_result");

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

    const actionApproved = await runCliCapture(["search", "actions", "execute", "commands:system", "help", "--host-approval-id", "approval-search-1", "--actor", "agent:codex", "--surface", "cli", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(actionApproved.code, CLI_EXIT_OK);
    const actionApprovedPayload = JSON.parse(actionApproved.stdout) as { data: { plan: { status: string; hostApprovalId?: string } } };
    assert.equal(actionApprovedPayload.data.plan.status, "brokered");
    assert.equal(actionApprovedPayload.data.plan.hostApprovalId, "approval-search-1");

    const frecencyQuery = await runCliCapture(["search", "query", "system capabilities", "--domains", "commands", "--actor", "agent:codex", "--surface", "cli", "--data-dir", dataRoot, "--json", "--explain", "true"], workspaceRoot);
    assert.equal(frecencyQuery.code, CLI_EXIT_OK);
    const frecencyPayload = JSON.parse(frecencyQuery.stdout) as {
      data: { results: Array<{ id: string; explanation?: { rankingHints?: { localFrecency?: number }; scoreBreakdown?: { frecency?: number } } }> };
    };
    const frecencyResult = frecencyPayload.data.results.find((result) => result.id === "commands:system");
    assert.ok((frecencyResult?.explanation?.rankingHints?.localFrecency ?? 0) > 0);
    assert.ok((frecencyResult?.explanation?.scoreBreakdown?.frecency ?? 0) > 0);

    const actionAudit = await runCliCapture(["search", "audit", "--type", "action", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(actionAudit.code, CLI_EXIT_OK);
    const actionAuditPayload = JSON.parse(actionAudit.stdout) as {
      data: { items: Array<{ type: string; resultId?: string; actionId?: string; status?: string; grant?: string; risk?: string }> };
    };
    const blockedAudit = actionAuditPayload.data.items.find((item) => item.status === "blocked");
    const brokeredAudit = actionAuditPayload.data.items.find((item) => item.status === "brokered");
    assert.equal(blockedAudit?.type, "action");
    assert.equal(blockedAudit?.resultId, "commands:system");
    assert.equal(blockedAudit?.actionId, "help");
    assert.equal(blockedAudit?.grant, "search.commands.run");
    assert.equal(blockedAudit?.risk, "system");
    assert.equal(brokeredAudit?.resultId, "commands:system");
    assert.equal(brokeredAudit?.actionId, "help");

    const actionBrokered = await runCliCapture(["search", "actions", "execute", "commands:system", "help", "--host-approval-id", "approval_search_help", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(actionBrokered.code, CLI_EXIT_OK);
    const actionBrokeredPayload = JSON.parse(actionBrokered.stdout) as {
      data: { plan: { status: string; hostApprovalId?: string; broker: { sideEffects: string } } };
    };
    assert.equal(actionBrokeredPayload.data.plan.status, "brokered");
    assert.equal(actionBrokeredPayload.data.plan.hostApprovalId, "approval_search_help");
    assert.equal(actionBrokeredPayload.data.plan.broker.sideEffects, "host_brokered");

    const privateTokenQuery = await runCliCapture(["search", "query", "password qzx-private-token", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.ok([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(privateTokenQuery.code));

    const audit = await runCliCapture(["search", "audit", "--data-dir", dataRoot, "--json", "--limit", "10"], workspaceRoot);
    assert.equal(audit.code, CLI_EXIT_OK);
    const auditPayload = JSON.parse(audit.stdout) as {
      data: {
        items: Array<{
          type: string;
          query?: string;
          resultId?: string;
          actionId?: string;
          status?: string;
          risk?: string;
          grant?: string;
          metadata?: { hostApprovalId?: string };
        }>;
      };
    };
    assert.equal(auditPayload.data.items.some((item) => item.type === "sensitive_query" && item.query === "password qzx-private-token"), true);
    assert.equal(auditPayload.data.items.some((item) => item.type === "action" && item.resultId === "commands:system" && item.actionId === "help" && item.status === "brokered" && item.risk === "system" && item.grant === "search.commands.run" && item.metadata?.hostApprovalId === "approval_search_help"), true);

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

    const serviceStatus = await runCliCapture(["search", "service", "status", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(serviceStatus.code, CLI_EXIT_OK);
    const serviceStatusPayload = JSON.parse(serviceStatus.stdout) as {
      data: { service: { state: string; mode: string }; queuedJobs: number; sources: Array<{ source: string }> };
    };
    assert.equal(serviceStatusPayload.data.service.state, "ready");
    assert.equal(serviceStatusPayload.data.service.mode, "embedded");
    assert.equal(serviceStatusPayload.data.sources.some((source) => source.source === "commands"), true);

    const entrypoints = await runCliCapture(["search", "entrypoints", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(entrypoints.code, CLI_EXIT_OK);
    const entrypointsPayload = JSON.parse(entrypoints.stdout) as {
      data: {
        rootSearchShortcutState: string;
        chatSearchIsolation: boolean;
        entrypoints: Array<{ id: string; route?: string; queryScope: string; shortcut: { bindingId: string; state: string; reservedChord?: string } }>;
      };
    };
    assert.equal(entrypointsPayload.data.rootSearchShortcutState, "external_pending");
    assert.equal(entrypointsPayload.data.chatSearchIsolation, true);
    assert.equal(entrypointsPayload.data.entrypoints.find((entrypoint) => entrypoint.id === "root-search")?.route, "/search");
    assert.equal(entrypointsPayload.data.entrypoints.find((entrypoint) => entrypoint.id === "root-search")?.shortcut.bindingId, "search.root.global");
    assert.equal(entrypointsPayload.data.entrypoints.find((entrypoint) => entrypoint.id === "chat-search")?.queryScope, "conversations_only");
    assert.equal(entrypointsPayload.data.entrypoints.find((entrypoint) => entrypoint.id === "chat-search")?.shortcut.reservedChord, "Command-G");

    const aliases = await runCliCapture(["search", "aliases", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(aliases.code, CLI_EXIT_OK);
    const aliasesPayload = JSON.parse(aliases.stdout) as {
      data: {
        count: number;
        rootSearchShortcutState: string;
        chatSearchIsolation: boolean;
        aliases: Array<{ alias: string; canonicalName: string; source: string; searchDomain: string; resultId: string | null }>;
      };
    };
    assert.equal(aliasesPayload.data.count, aliasesPayload.data.aliases.length);
    assert.equal(aliasesPayload.data.rootSearchShortcutState, "external_pending");
    assert.equal(aliasesPayload.data.chatSearchIsolation, true);
    const dbAlias = aliasesPayload.data.aliases.find((alias) => alias.alias === "db");
    assert.equal(dbAlias?.canonicalName, "database");
    assert.equal(dbAlias?.source, "command");
    assert.equal(dbAlias?.searchDomain, "commands");
    assert.equal(dbAlias?.resultId, "commands:database");
    const imageAlias = aliasesPayload.data.aliases.find((alias) => alias.alias === "image");
    assert.equal(imageAlias?.canonicalName, "images");
    assert.equal(imageAlias?.resultId, "commands:images");

    const serviceStart = await runCliCapture(["search", "service", "start", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(serviceStart.code, CLI_EXIT_OK);
    const serviceStartPayload = JSON.parse(serviceStart.stdout) as { data: { service: { state: string; mode: string; startedAt?: string } } };
    assert.equal(serviceStartPayload.data.service.state, "ready");
    assert.equal(serviceStartPayload.data.service.mode, "embedded");
    assert.ok(serviceStartPayload.data.service.startedAt);
    assert.equal(fs.existsSync(path.join(dataRoot, "search-service.json")), true);

    const serviceJob = await runCliCapture(["search", "jobs", "enqueue", "rebuild", "--source", "commands", "--id", "job:service:commands", "--priority", "90", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(serviceJob.code, CLI_EXIT_OK);

    const serviceRun = await runCliCapture(["search", "service", "run-once", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(serviceRun.code, CLI_EXIT_OK);
    const serviceRunPayload = JSON.parse(serviceRun.stdout) as {
      data: {
        service: { state: string; worker?: { claimed: number; completed: number; failed: number } };
        worker?: { items: Array<{ id: string; status: string; indexed?: number }> };
      };
    };
    assert.equal(serviceRunPayload.data.service.state, "ready");
    assert.equal(serviceRunPayload.data.service.worker?.claimed, 1);
    assert.equal(serviceRunPayload.data.service.worker?.completed, 1);
    assert.equal(serviceRunPayload.data.service.worker?.failed, 0);
    assert.equal(serviceRunPayload.data.worker?.items[0]?.id, "job:service:commands");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.status, "done");
    assert.ok((serviceRunPayload.data.worker?.items[0]?.indexed ?? 0) > 0);

    const serviceStop = await runCliCapture(["search", "service", "stop", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(serviceStop.code, CLI_EXIT_OK);
    const serviceStopPayload = JSON.parse(serviceStop.stdout) as { data: { service: { state: string; mode: string; stoppedAt?: string } } };
    assert.equal(serviceStopPayload.data.service.state, "stopped");
    assert.equal(serviceStopPayload.data.service.mode, "embedded");
    assert.ok(serviceStopPayload.data.service.stoppedAt);

    const daemonStart = await runCliCapture(["search", "service", "start", "--mode", "daemon", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(daemonStart.code, CLI_EXIT_DEGRADED);
    const daemonStartPayload = JSON.parse(daemonStart.stdout) as { data: { service: { state: string; mode: string; reason?: string } } };
    assert.equal(daemonStartPayload.data.service.state, "external_pending");
    assert.equal(daemonStartPayload.data.service.mode, "daemon");
    assert.equal(daemonStartPayload.data.service.reason?.includes("host supervisor"), true);

    const saved = await runCliCapture([
      "search",
      "saved",
      "create",
      "recent-system",
      "--query",
      "system capabilities",
      "--name",
      "Recent system",
      "--domains",
      "commands",
      "--sources",
      "commands",
      "--shards",
      "default",
      "--strategy",
      "hybrid",
      "--local-embedding",
      "true",
      "--filters",
      "type=command",
      "--actor",
      "agent:test",
      "--surface",
      "cli",
      "--limit",
      "4",
      "--explain",
      "true",
      "--data-dir",
      dataRoot,
      "--json",
    ], workspaceRoot);
    assert.equal(saved.code, CLI_EXIT_OK);
    const savedPayload = JSON.parse(saved.stdout) as {
      data: {
        item: {
          id: string;
          name: string;
          query: {
            query: string;
            domains?: string[];
            sources?: string[];
            shards?: string[];
            strategy?: string;
            embedding?: { model: string; vector: number[] };
            filters?: Record<string, unknown>;
            actor?: string;
            surface?: string;
            limit?: number;
            explain?: boolean;
          };
        };
        items: Array<{ id: string }>;
      };
    };
    assert.equal(savedPayload.data.item.id, "recent-system");
    assert.equal(savedPayload.data.item.name, "Recent system");
    assert.equal(savedPayload.data.item.query.query, "system capabilities");
    assert.deepEqual(savedPayload.data.item.query.domains, ["commands"]);
    assert.deepEqual(savedPayload.data.item.query.sources, ["commands"]);
    assert.deepEqual(savedPayload.data.item.query.shards, ["default"]);
    assert.equal(savedPayload.data.item.query.strategy, "hybrid");
    assert.equal(savedPayload.data.item.query.embedding?.model, "local-text-v1");
    assert.equal(savedPayload.data.item.query.embedding?.vector.length, 64);
    assert.deepEqual(savedPayload.data.item.query.filters, { type: "command" });
    assert.equal(savedPayload.data.item.query.actor, "agent:test");
    assert.equal(savedPayload.data.item.query.surface, "cli");
    assert.equal(savedPayload.data.item.query.limit, 4);
    assert.equal(savedPayload.data.item.query.explain, true);
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

    const monitorRun = await runCliCapture(["search", "monitors", "run", "monitor-system", "--data-dir", dataRoot, "--json", "--limit", "3"], workspaceRoot);
    assert.equal(monitorRun.code, CLI_EXIT_OK);
    const monitorRunPayload = JSON.parse(monitorRun.stdout) as {
      data: {
        action: string;
        state: string;
        items: Array<{
          monitorId: string;
          savedSearchId: string;
          state: string;
          query: { query: string; limit: number; domains?: string[]; sources?: string[]; shards?: string[]; filters?: Record<string, unknown> };
          resultCount: number;
          partial: boolean;
          results: Array<{ source: string; domain: string; title: string }>;
          evaluatedAt: string;
        }>;
      };
    };
    assert.equal(monitorRunPayload.data.action, "run");
    assert.equal(monitorRunPayload.data.state, "ready");
    assert.equal(monitorRunPayload.data.items[0]?.monitorId, "monitor-system");
    assert.equal(monitorRunPayload.data.items[0]?.savedSearchId, "recent-system");
    assert.equal(monitorRunPayload.data.items[0]?.state, "ready");
    assert.equal(monitorRunPayload.data.items[0]?.query.query, "system capabilities");
    assert.equal(monitorRunPayload.data.items[0]?.query.limit, 3);
    assert.deepEqual(monitorRunPayload.data.items[0]?.query.domains, ["commands"]);
    assert.deepEqual(monitorRunPayload.data.items[0]?.query.sources, ["commands"]);
    assert.deepEqual(monitorRunPayload.data.items[0]?.query.shards, ["default"]);
    assert.deepEqual(monitorRunPayload.data.items[0]?.query.filters, { type: "command" });
    assert.ok(monitorRunPayload.data.items[0]?.resultCount > 0);
    assert.equal(monitorRunPayload.data.items[0]?.partial, false);
    assert.ok(monitorRunPayload.data.items[0]?.results.some((result) => result.source === "commands"));
    assert.ok(monitorRunPayload.data.items[0]?.evaluatedAt);

    const monitorDelete = await runCliCapture(["search", "monitors", "delete", "monitor-system", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(monitorDelete.code, CLI_EXIT_OK);
    const monitorDeletePayload = JSON.parse(monitorDelete.stdout) as { data: { id: string; deleted: boolean; items: Array<{ id: string }> } };
    assert.equal(monitorDeletePayload.data.id, "monitor-system");
    assert.equal(monitorDeletePayload.data.deleted, true);
    assert.equal(monitorDeletePayload.data.items.some((item) => item.id === "monitor-system"), false);

    const cascadeMonitor = await runCliCapture(["search", "monitors", "create", "monitor-system-cascade", "--saved-search", "recent-system", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(cascadeMonitor.code, CLI_EXIT_OK);
    const savedDelete = await runCliCapture(["search", "saved", "delete", "recent-system", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(savedDelete.code, CLI_EXIT_OK);
    const savedDeletePayload = JSON.parse(savedDelete.stdout) as { data: { id: string; deleted: boolean; items: Array<{ id: string }> } };
    assert.equal(savedDeletePayload.data.id, "recent-system");
    assert.equal(savedDeletePayload.data.deleted, true);
    assert.equal(savedDeletePayload.data.items.some((item) => item.id === "recent-system"), false);
    const monitorsAfterSavedDelete = await runCliCapture(["search", "monitors", "list", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(monitorsAfterSavedDelete.code, CLI_EXIT_OK);
    const monitorsAfterSavedDeletePayload = JSON.parse(monitorsAfterSavedDelete.stdout) as { data: { items: Array<{ id: string }> } };
    assert.equal(monitorsAfterSavedDeletePayload.data.items.some((item) => item.id === "monitor-system-cascade"), false);

    const paused = await runCliCapture(["search", "sources", "pause", "commands", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(paused.code, CLI_EXIT_OK);
    const pausedPayload = JSON.parse(paused.stdout) as {
      data: { source: string; state: string; sources: Array<{ id: string; state: string }> };
    };
    assert.equal(pausedPayload.data.source, "commands");
    assert.equal(pausedPayload.data.state, "paused");
    assert.equal(pausedPayload.data.sources.find((source) => source.id === "commands")?.state, "paused");
    const configDb = new Database(resolveClawjsMainDbPath({ ...process.env, CLAW_DATA_DIR: dataRoot }));
    try {
      const configRow = configDb.prepare("SELECT source, state, profile, surface FROM search_source_config WHERE source = ?").get("commands") as {
        source: string;
        state: string;
        profile: string;
        surface: string;
      };
      assert.deepEqual(configRow, {
        source: "commands",
        state: "paused",
        profile: "framework",
        surface: "claw.search.sources",
      });
    } finally {
      configDb.close();
    }

    const pausedQuery = await runCliCapture(["search", "query", "system capabilities", "--sources", "commands", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
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

test("local.files event jobs refresh and tombstone individual files", runSearchLocalFilesEventScenario);

test("web.ingested event jobs refresh and tombstone individual cache files", runSearchWebIngestedEventScenario);

test("external.cache event jobs refresh and tombstone individual cache files", runSearchExternalCacheEventScenario);

test("search service run-once obeys worker resource budgets", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-worker-budgets-"));
  const dataRoot = path.join(workspaceRoot, "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    await runCliCapture(["search", "jobs", "enqueue", "rebuild", "--source", "commands", "--id", "job:budget:one", "--data-dir", dataRoot, "--json"], workspaceRoot);
    await runCliCapture(["search", "jobs", "enqueue", "rebuild", "--source", "commands", "--id", "job:budget:two", "--data-dir", dataRoot, "--json"], workspaceRoot);

    const limitedRun = await runCliCapture(["search", "service", "run-once", "--data-dir", dataRoot, "--json", "--max-jobs", "1", "--max-runtime-ms", "30000"], workspaceRoot);
    assert.equal(limitedRun.code, CLI_EXIT_OK);
    const limitedPayload = JSON.parse(limitedRun.stdout) as {
      data: {
        service: { worker?: { claimed: number; stoppedReason?: string; budgets?: { maxJobs: number; maxRuntimeMs: number } } };
        worker?: { items: Array<{ id: string; status: string }> };
      };
    };
    assert.equal(limitedPayload.data.service.worker?.claimed, 1);
    assert.equal(limitedPayload.data.service.worker?.stoppedReason, "job_limit");
    assert.equal(limitedPayload.data.service.worker?.budgets?.maxJobs, 1);
    assert.equal(limitedPayload.data.service.worker?.budgets?.maxRuntimeMs, 30000);
    assert.equal(limitedPayload.data.worker?.items[0]?.id, "job:budget:one");
    assert.equal(limitedPayload.data.worker?.items[0]?.status, "done");

    await runCliCapture(["search", "service", "run-once", "--data-dir", dataRoot, "--json", "--source", "commands", "--max-jobs", "10"], workspaceRoot);

    const store = new SearchStore(path.join(dataRoot, "search.sqlite"));
    try {
      store.registerSource(createFrameworkSearchSourceManifest({
        id: "missing.source",
        domain: "missing",
        name: "Missing source",
        resultTypes: ["missing"],
      }));
    } finally {
      store.close();
    }

    await runCliCapture(["search", "jobs", "enqueue", "rebuild", "--source", "missing.source", "--id", "job:budget:bad-one", "--data-dir", dataRoot, "--json"], workspaceRoot);
    await runCliCapture(["search", "jobs", "enqueue", "rebuild", "--source", "missing.source", "--id", "job:budget:bad-two", "--data-dir", dataRoot, "--json"], workspaceRoot);
    const failureRun = await runCliCapture(["search", "service", "run-once", "--data-dir", dataRoot, "--json", "--max-jobs", "10", "--max-failures", "1"], workspaceRoot);
    assert.equal(failureRun.code, CLI_EXIT_OK);
    const failurePayload = JSON.parse(failureRun.stdout) as {
      data: {
        service: { worker?: { claimed: number; failed: number; stoppedReason?: string; budgets?: { maxFailures: number } } };
        worker?: { items: Array<{ source: string; status: string; error?: string }> };
      };
    };
    assert.equal(failurePayload.data.service.worker?.claimed, 1);
    assert.equal(failurePayload.data.service.worker?.failed, 1);
    assert.equal(failurePayload.data.service.worker?.stoppedReason, "failure_budget");
    assert.equal(failurePayload.data.service.worker?.budgets?.maxFailures, 1);
    assert.equal(failurePayload.data.worker?.items[0]?.source, "missing.source");
    assert.equal(failurePayload.data.worker?.items[0]?.status, "failed");
    assert.equal(failurePayload.data.worker?.items[0]?.error?.includes("cannot index source"), true);
  });
});

test("search source controls persist canonical config in core.sqlite", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-core-config-"));
  const dataRoot = path.join(workspaceRoot, "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const paused = await runCliCapture(["search", "sources", "pause", "commands", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(paused.code, CLI_EXIT_OK);

    const core = new Database(path.join(dataRoot, "core.sqlite"));
    try {
      const row = core.prepare("SELECT source, state, profile FROM search_source_config WHERE source = ?").get("commands") as { source: string; state: string; profile: string } | undefined;
      assert.deepEqual(row, { source: "commands", state: "paused", profile: "framework" });
    } finally {
      core.close();
    }

    fs.rmSync(path.join(dataRoot, "search.sqlite"), { force: true });
    const status = await runCliCapture(["search", "status", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(status.code, CLI_EXIT_OK);
    const statusPayload = JSON.parse(status.stdout) as {
      data: { sources: Array<{ source: string; state: string }> };
    };
    assert.equal(statusPayload.data.sources.find((source) => source.source === "commands")?.state, "paused");

    const query = await runCliCapture(["search", "query", "system capabilities", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_DEGRADED);
    const queryPayload = JSON.parse(query.stdout) as {
      data: { partial: boolean; omittedSources: Array<{ source: string; reason: string; message?: string }> };
    };
    assert.equal(queryPayload.data.partial, true);
    assert.equal(queryPayload.data.omittedSources.some((source) => source.source === "commands" && source.reason === "disabled" && source.message?.includes("paused")), true);

    const resumed = await runCliCapture(["search", "sources", "resume", "commands", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(resumed.code, CLI_EXIT_OK);
    const resumedCore = new Database(path.join(dataRoot, "core.sqlite"));
    try {
      const state = (resumedCore.prepare("SELECT state FROM search_source_config WHERE source = ?").get("commands") as { state: string } | undefined)?.state;
      assert.equal(state, "enabled");
    } finally {
      resumedCore.close();
    }
  });
});

test("search command fallback is explicit and does not broaden section search by default", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-command-fallback-"));
  const dataRoot = path.join(workspaceRoot, "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const scoped = await runCliCapture(["search", "query", "system capabilities", "--domains", "database", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(scoped.code, CLI_EXIT_DEGRADED);
    const scopedPayload = JSON.parse(scoped.stdout) as {
      data: { results: Array<{ source: string }>; commandFallback: { policy: string; applied: boolean; reason: string; added: number } };
    };
    assert.deepEqual(scopedPayload.data.results, []);
    assert.deepEqual(scopedPayload.data.commandFallback, { policy: "off", applied: false, reason: "disabled", added: 0 });

    const fallback = await runCliCapture([
      "search",
      "query",
      "system capabilities",
      "--domains",
      "database",
      "--command-fallback",
      "empty",
      "--command-fallback-limit",
      "2",
      "--data-dir",
      dataRoot,
      "--json",
      "--limit",
      "5",
      "--explain",
      "true",
    ], workspaceRoot);
    assert.equal(fallback.code, CLI_EXIT_OK);
    const fallbackPayload = JSON.parse(fallback.stdout) as {
      data: { results: Array<{ source: string; domain: string; title: string }>; commandFallback: { policy: string; applied: boolean; reason: string; added: number } };
    };
    assert.equal(fallbackPayload.data.results.some((result) => result.source === "commands" && result.domain === "commands" && result.title === "system"), true);
    assert.equal(fallbackPayload.data.commandFallback.policy, "empty");
    assert.equal(fallbackPayload.data.commandFallback.applied, true);
    assert.equal(fallbackPayload.data.commandFallback.reason, "queried");
    assert.equal(fallbackPayload.data.commandFallback.added, fallbackPayload.data.results.filter((result) => result.source === "commands").length);
    assert.ok(fallbackPayload.data.commandFallback.added >= 1);
    assert.ok(fallbackPayload.data.commandFallback.added <= 2);
  });
});

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
        companyId: "company-demo",
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
        companyId: "company-demo",
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

    const scheduled = scheduleSessionChatSearchEvent({
      operation: "upsert",
      sessionId,
      dataDir: dataRoot,
    });
    assert.equal(scheduled.ok, true, scheduled.error);
    assert.equal(scheduled.job?.source, "sessions.chats");
    assert.equal(scheduled.job?.operation, "upsert");
    assert.equal(scheduled.job?.resourceId, sessionId);
    assert.equal(scheduled.job?.shard, "hot");
    assert.equal(scheduled.job?.payload.eventDriven, true);
    assert.equal(scheduled.job?.payload.sessionId, sessionId);

    const serviceRun = await runCliCapture(["search", "service", "run-once", "--source", "sessions.chats", "--data-dir", dataRoot, "--sessions-db-path", sessionsDbPath, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(serviceRun.code, CLI_EXIT_OK);
    const serviceRunPayload = JSON.parse(serviceRun.stdout) as {
      data: { worker?: { items: Array<{ id: string; source: string; status: string; indexed?: number }> } };
    };
    assert.equal(serviceRunPayload.data.worker?.items[0]?.id, scheduled.job?.id);
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

    const deleted = scheduleSessionChatSearchEvent({
      operation: "delete",
      sessionId,
      dataDir: dataRoot,
    });
    assert.equal(deleted.ok, true, deleted.error);
    assert.equal(deleted.job?.operation, "delete");

    const deleteRun = await runCliCapture(["search", "service", "run-once", "--source", "sessions.chats", "--data-dir", dataRoot, "--sessions-db-path", sessionsDbPath, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(deleteRun.code, CLI_EXIT_OK);

    const afterDelete = await runCliCapture(["search", "query", "session-event-refresh-needle", "--data-dir", dataRoot, "--sessions-db-path", sessionsDbPath, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(afterDelete.code, CLI_EXIT_DEGRADED);
    const afterDeletePayload = JSON.parse(afterDelete.stdout) as { data: { results: unknown[] } };
    assert.deepEqual(afterDeletePayload.data.results, []);
  });
});

test("search rebuild indexes database.records from core.sqlite", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-database-"));
  const dataRoot = path.join(workspaceRoot, ".claw", "data");
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

    const createdJobs = await runCliCapture(["search", "jobs", "--source", "database.records", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(createdJobs.code, CLI_EXIT_OK);
    const createdJobsPayload = JSON.parse(createdJobs.stdout) as {
      data: { items: Array<{ id: string; source: string; operation: string; resourceId: string; shard: string; payload: { eventDriven?: boolean; collection?: string; recordId?: string } }> };
    };
    const createdJob = createdJobsPayload.data.items.find((job) => job.resourceId === `main:contacts:${createPayload.data.id}`);
    assert.equal(createdJob?.source, "database.records");
    assert.equal(createdJob?.operation, "upsert");
    assert.equal(createdJob?.shard, "hot");
    assert.equal(createdJob?.payload.eventDriven, true);
    assert.equal(createdJob?.payload.collection, "contacts");
    assert.equal(createdJob?.payload.recordId, createPayload.data.id);

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

    const deleted = await runCliCapture(["db", "contacts", "delete", createPayload.data.id, "--json"], workspaceRoot);
    assert.equal(deleted.code, CLI_EXIT_OK, deleted.stderr || deleted.stdout);
    const deletedJobs = await runCliCapture(["search", "jobs", "--source", "database.records", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deletedJobs.code, CLI_EXIT_OK);
    const deletedJobsPayload = JSON.parse(deletedJobs.stdout) as {
      data: { items: Array<{ operation: string; priority: number; resourceId: string; payload: { eventDriven?: boolean; recordId?: string } }> };
    };
    const deletedJob = deletedJobsPayload.data.items.find((job) => job.resourceId === `main:contacts:${createPayload.data.id}` && job.operation === "delete");
    assert.equal(deletedJob?.priority, 80);
    assert.equal(deletedJob?.payload.eventDriven, true);
    assert.equal(deletedJob?.payload.recordId, createPayload.data.id);
  });
});

test("search rebuild indexes work.items from productivity records", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-work-"));
  const dataRoot = path.join(workspaceRoot, ".claw", "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    fs.mkdirSync(dataRoot, { recursive: true });
    const sqlite = new Database(resolveClawjsMainDbPath());
    try {
      ensureV1MainSchema(sqlite);
      const now = "2026-05-17T12:00:00.000Z";
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS records (
          namespace_id TEXT NOT NULL,
          collection_name TEXT NOT NULL,
          id TEXT NOT NULL,
          data_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (namespace_id, collection_name, id)
        )
      `);
      sqlite.prepare(`
        INSERT INTO records (namespace_id, collection_name, id, data_json, created_at, updated_at)
        VALUES ('main', 'tasks', 'task-search-fast-path', ?, ?, ?)
      `).run(JSON.stringify({
        id: "task-search-fast-path",
        title: "Review Search fast path",
        status: "todo",
        priority: "high",
        projectId: "project-search",
        assigneeActorId: "agent:codex",
      }), now, now);
      sqlite.prepare(`
        INSERT INTO records (namespace_id, collection_name, id, data_json, created_at, updated_at)
        VALUES ('main', 'goals', 'goal-search-v1', ?, ?, ?)
      `).run(JSON.stringify({
        id: "goal-search-v1",
        title: "Ship Search v1.1",
        status: "active",
        description: "Framework-wide work search coverage",
      }), now, now);
    } finally {
      sqlite.close();
    }

    const rebuild = await runCliCapture(["search", "rebuild", "--source", "work.items", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(rebuild.code, CLI_EXIT_OK);
    const rebuildPayload = JSON.parse(rebuild.stdout) as {
      data: {
        sources: string[];
        pendingSources: string[];
        indexedBySource: { "work.items": number };
      };
    };
    assert.deepEqual(rebuildPayload.data.sources, ["work.items"]);
    assert.deepEqual(rebuildPayload.data.pendingSources, []);
    assert.equal(rebuildPayload.data.indexedBySource["work.items"], 2);

    const query = await runCliCapture([
      "search",
      "query",
      "Search fast path",
      "--domains",
      "work",
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
        indexedFastPaths: { "work.items": number };
        results: Array<{
          source: string;
          domain: string;
          type: string;
          title: string;
          subtitle?: string;
          shard?: string;
          metadata?: { collection?: string; priority?: string; projectId?: string; assigneeActorId?: string };
          actions?: Array<{ id: string; kind: string }>;
          explanation?: { matchedBy?: string[] };
        }>;
        facets?: Array<{ id: string; label: string }>;
      };
    };
    assert.equal(queryPayload.data.indexedFastPaths["work.items"], 2);
    const result = queryPayload.data.results.find((item) => item.title === "Review Search fast path");
    assert.equal(result?.source, "work.items");
    assert.equal(result?.domain, "work");
    assert.equal(result?.type, "task");
    assert.equal(result?.subtitle, "tasks · main");
    assert.equal(result?.shard, "hot");
    assert.equal(result?.metadata?.collection, "tasks");
    assert.equal(result?.metadata?.priority, "high");
    assert.equal(result?.metadata?.projectId, "project-search");
    assert.equal(result?.metadata?.assigneeActorId, "agent:codex");
    assert.equal(result?.actions?.some((action) => action.id === "open" && action.kind === "open"), true);
    assert.ok(result?.explanation?.matchedBy?.length);
    assert.equal(queryPayload.data.facets?.some((facet) => facet.id === "collection"), true);
  });
});

test("database writes enqueue work.items refresh jobs", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-work-events-"));
  const dataRoot = path.join(workspaceRoot, ".claw", "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const created = await runCliCapture([
      "db",
      "tasks",
      "create",
      "Emit work search event",
      "--set",
      "status=todo",
      "--json",
    ], workspaceRoot);
    assert.equal(created.code, CLI_EXIT_OK, created.stderr || created.stdout);
    const createdPayload = JSON.parse(created.stdout) as { data: { id: string } };

    const jobs = await runCliCapture(["search", "jobs", "--source", "work.items", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(jobs.code, CLI_EXIT_OK);
    const jobsPayload = JSON.parse(jobs.stdout) as {
      data: { items: Array<{ source: string; operation: string; resourceId: string; shard: string; payload: { eventDriven?: boolean; collection?: string; recordId?: string } }> };
    };
    const job = jobsPayload.data.items.find((item) => item.resourceId === `main:tasks:${createdPayload.data.id}`);
    assert.equal(job?.source, "work.items");
    assert.equal(job?.operation, "upsert");
    assert.equal(job?.shard, "hot");
    assert.equal(job?.payload.eventDriven, true);
    assert.equal(job?.payload.collection, "tasks");
    assert.equal(job?.payload.recordId, createdPayload.data.id);
  });
});

test("search rebuild indexes skills.registry from core.sqlite without secret refs", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-skills-"));
  const dataRoot = path.join(workspaceRoot, ".claw", "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const upsert = await runCliCapture([
      "skills",
      "upsert",
      "deploy",
      "--name",
      "Deploy",
      "--body",
      "Use deployment APIs by reference",
      "--secret-refs",
      "vault://skills/deploy-token",
      "--json",
    ], workspaceRoot);
    assert.equal(upsert.code, CLI_EXIT_OK);

    const createdJobs = await runCliCapture(["search", "jobs", "--source", "skills.registry", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(createdJobs.code, CLI_EXIT_OK);
    const createdJobsPayload = JSON.parse(createdJobs.stdout) as {
      data: { items: Array<{ source: string; operation: string; resourceId: string; shard: string; payload: { eventDriven?: boolean; slug?: string } }> };
    };
    const createdJob = createdJobsPayload.data.items.find((job) => job.resourceId === "deploy");
    assert.equal(createdJob?.source, "skills.registry");
    assert.equal(createdJob?.operation, "upsert");
    assert.equal(createdJob?.shard, "hot");
    assert.equal(createdJob?.payload.eventDriven, true);
    assert.equal(createdJob?.payload.slug, "deploy");

    const rebuild = await runCliCapture(["search", "rebuild", "--source", "skills.registry", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(rebuild.code, CLI_EXIT_OK);
    const rebuildPayload = JSON.parse(rebuild.stdout) as {
      data: { sources: string[]; pendingSources: string[]; indexedBySource: { "skills.registry": number } };
    };
    assert.equal(rebuildPayload.data.sources.includes("skills.registry"), true);
    assert.equal(rebuildPayload.data.pendingSources.includes("skills.registry"), false);
    assert.equal(rebuildPayload.data.indexedBySource["skills.registry"], 1);

    const query = await runCliCapture(["search", "query", "deployment APIs", "--domains", "skills", "--filters", "metadata.requiresProtectedRefs=true", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as {
      data: {
        indexedFastPaths: { "skills.registry": number };
        results: Array<{ source: string; domain: string; type: string; title: string; body?: string; metadata?: { requiresProtectedRefs?: boolean }; fragments?: Array<{ snippet?: string }> }>;
      };
    };
    assert.equal(queryPayload.data.indexedFastPaths["skills.registry"], 1);
    const result = queryPayload.data.results.find((entry) => entry.title === "Deploy");
    assert.equal(result?.source, "skills.registry");
    assert.equal(result?.domain, "skills");
    assert.equal(result?.type, "skill");
    assert.equal(result?.metadata?.requiresProtectedRefs, true);
    assert.equal(JSON.stringify(result).includes("vault://skills/deploy-token"), false);
    assert.equal(result?.fragments?.some((fragment) => fragment.snippet?.includes("deployment APIs")), true);

    const deleted = await runCliCapture(["skills", "delete", "deploy", "--json"], workspaceRoot);
    assert.equal(deleted.code, CLI_EXIT_OK, deleted.stderr || deleted.stdout);
    const deleteJobs = await runCliCapture(["search", "jobs", "--source", "skills.registry", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleteJobs.code, CLI_EXIT_OK);
    const deleteJobsPayload = JSON.parse(deleteJobs.stdout) as {
      data: { items: Array<{ operation: string; priority: number; resourceId: string; payload: { eventDriven?: boolean; slug?: string } }> };
    };
    const deleteJob = deleteJobsPayload.data.items.find((job) => job.resourceId === "deploy" && job.operation === "delete");
    assert.equal(deleteJob?.priority, 80);
    assert.equal(deleteJob?.payload.eventDriven, true);
    assert.equal(deleteJob?.payload.slug, "deploy");
  });
});

test("providers and snippets writes enqueue and index framework configuration fast paths", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-providers-snippets-"));
  const dataRoot = path.join(workspaceRoot, ".claw", "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const providerRoute = await runCliCapture([
      "providers",
      "routing",
      "set",
      "quickask",
      "--capability",
      "chat",
      "--provider",
      "provider_alpha",
      "--model",
      "generic-chat-large",
      "--account-ref",
      "vault://providers/provider_alpha/main",
      "--policy",
      JSON.stringify({ maxCost: "low", approval: "auto" }),
      "--json",
    ], workspaceRoot);
    assert.equal(providerRoute.code, CLI_EXIT_OK, providerRoute.stderr || providerRoute.stdout);

    const providerSetting = await runCliCapture([
      "providers",
      "settings",
      "set",
      "provider_alpha",
      "--enabled",
      "true",
      "--policy",
      JSON.stringify({ region: "local" }),
      "--json",
    ], workspaceRoot);
    assert.equal(providerSetting.code, CLI_EXIT_OK, providerSetting.stderr || providerSetting.stdout);

    const snippet = await runCliCapture([
      "snippets",
      "upsert",
      "quickask-review",
      "--title",
      "QuickAsk Review",
      "--body",
      "Review the current selection before sending the provider request",
      "--kind",
      "prompt",
      "--shortcut",
      "qa-review",
      "--skill-refs",
      "skill:review",
      "--json",
    ], workspaceRoot);
    assert.equal(snippet.code, CLI_EXIT_OK, snippet.stderr || snippet.stdout);

    const providerJobs = await runCliCapture(["search", "jobs", "--source", "providers.routing", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(providerJobs.code, CLI_EXIT_OK);
    const providerJobsPayload = JSON.parse(providerJobs.stdout) as {
      data: { items: Array<{ source: string; operation: string; resourceId: string; payload: { eventDriven?: boolean; kind?: string; provider?: string; feature?: string; capability?: string } }> };
    };
    const routeJob = providerJobsPayload.data.items.find((job) => job.resourceId === "routing:quickask:chat");
    assert.equal(routeJob?.source, "providers.routing");
    assert.equal(routeJob?.operation, "upsert");
    assert.equal(routeJob?.payload.eventDriven, true);
    assert.equal(routeJob?.payload.feature, "quickask");
    const settingJob = providerJobsPayload.data.items.find((job) => job.resourceId === "setting:provider_alpha");
    assert.equal(settingJob?.payload.kind, "setting");
    assert.equal(settingJob?.payload.provider, "provider_alpha");

    const snippetJobs = await runCliCapture(["search", "jobs", "--source", "snippets.library", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(snippetJobs.code, CLI_EXIT_OK);
    const snippetJobsPayload = JSON.parse(snippetJobs.stdout) as any;
    const snippetJob = snippetJobsPayload.data.items.find((job) => job.resourceId === "quickask-review");
    assert.deepEqual({ source: snippetJob?.source, operation: snippetJob?.operation, eventDriven: snippetJob?.payload.eventDriven, slug: snippetJob?.payload.slug }, { source: "snippets.library", operation: "upsert", eventDriven: true, slug: "quickask-review" });
    const providerRun = await runCliCapture(["search", "service", "run-once", "--source", "providers.routing", "--data-dir", dataRoot, "--json", "--limit", "2"], workspaceRoot);
    assert.equal(providerRun.code, CLI_EXIT_OK);
    const snippetRun = await runCliCapture(["search", "service", "run-once", "--source", "snippets.library", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(snippetRun.code, CLI_EXIT_OK);
    const providerQuery = await runCliCapture(["search", "query", "quickask generic-chat-large", "--domains", "providers", "--filters", "metadata.hasAccountRef=true", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(providerQuery.code, CLI_EXIT_OK);
    const providerQueryPayload = JSON.parse(providerQuery.stdout) as any;
    assert.equal(providerQueryPayload.data.indexedFastPaths["providers.routing"], 2);
    const providerResult = providerQueryPayload.data.results.find((entry) => entry.type === "routing_rule");
    assert.deepEqual({ source: providerResult?.source, domain: providerResult?.domain, provider: providerResult?.metadata?.provider, hasAccountRef: providerResult?.metadata?.hasAccountRef }, { source: "providers.routing", domain: "providers", provider: "provider_alpha", hasAccountRef: true });
    assert.equal(JSON.stringify(providerQueryPayload.data.results).includes("vault://providers/provider_alpha/main"), false);
    const providerSettingQuery = await runCliCapture(["search", "query", "provider_alpha local", "--sources", "providers.routing", "--filters", "metadata.kind=setting", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(providerSettingQuery.code, CLI_EXIT_OK);
    const providerSettingPayload = JSON.parse(providerSettingQuery.stdout) as any;
    const providerSettingResult = providerSettingPayload.data.results.find((entry) => entry.type === "provider_setting");
    assert.deepEqual({ source: providerSettingResult?.source, provider: providerSettingResult?.metadata?.provider, enabled: providerSettingResult?.metadata?.enabled }, { source: "providers.routing", provider: "provider_alpha", enabled: true });
    const snippetQuery = await runCliCapture(["search", "query", "current selection", "--domains", "snippets", "--filters", "metadata.kind=prompt", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(snippetQuery.code, CLI_EXIT_OK);
    const snippetQueryPayload = JSON.parse(snippetQuery.stdout) as any;
    assert.equal(snippetQueryPayload.data.indexedFastPaths["snippets.library"], 1);
    const snippetResult = snippetQueryPayload.data.results.find((entry) => entry.title === "QuickAsk Review");
    assert.deepEqual({ source: snippetResult?.source, domain: snippetResult?.domain, type: snippetResult?.type, shortcut: snippetResult?.metadata?.shortcut, skillRef: snippetResult?.metadata?.skillRef }, { source: "snippets.library", domain: "snippets", type: "prompt", shortcut: "qa-review", skillRef: ["skill:review"] });
    assert.equal(snippetResult?.fragments?.some((fragment) => fragment.snippet?.includes("current selection")), true);
    const deletedSnippet = await runCliCapture(["snippets", "delete", "quickask-review", "--json"], workspaceRoot);
    assert.equal(deletedSnippet.code, CLI_EXIT_OK);
    const deletedRoute = await runCliCapture(["providers", "routing", "delete", "quickask", "--capability", "chat", "--json"], workspaceRoot);
    assert.equal(deletedRoute.code, CLI_EXIT_OK);
    const providerDeleteJobs = await runCliCapture(["search", "jobs", "--source", "providers.routing", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(providerDeleteJobs.code, CLI_EXIT_OK);
    const providerDeleteJobsPayload = JSON.parse(providerDeleteJobs.stdout) as any;
    const providerDeleteJob = providerDeleteJobsPayload.data.items.find((job) => job.resourceId === "routing:quickask:chat" && job.operation === "delete");
    assert.deepEqual({ priority: providerDeleteJob?.priority, eventDriven: providerDeleteJob?.payload.eventDriven, kind: providerDeleteJob?.payload.kind, feature: providerDeleteJob?.payload.feature, capability: providerDeleteJob?.payload.capability }, { priority: 80, eventDriven: true, kind: "routing", feature: "quickask", capability: "chat" });
    const providerDeleteRun = await runCliCapture(["search", "service", "run-once", "--source", "providers.routing", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(providerDeleteRun.code, CLI_EXIT_OK, providerDeleteRun.stderr || providerDeleteRun.stdout);
    const providerDeleteRunPayload = JSON.parse(providerDeleteRun.stdout) as any;
    const providerDeleteRunItem = providerDeleteRunPayload.data.worker?.items?.[0];
    assert.deepEqual({ claimed: providerDeleteRunPayload.data.service.worker?.claimed, completed: providerDeleteRunPayload.data.service.worker?.completed, source: providerDeleteRunItem?.source, operation: providerDeleteRunItem?.operation, status: providerDeleteRunItem?.status, indexed: providerDeleteRunItem?.indexed }, { claimed: 1, completed: 1, source: "providers.routing", operation: "delete", status: "done", indexed: 1 });
    const afterProviderDelete = await runCliCapture(["search", "query", "quickask generic-chat-large", "--sources", "providers.routing", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(afterProviderDelete.code, CLI_EXIT_DEGRADED, afterProviderDelete.stderr || afterProviderDelete.stdout);
    const afterProviderDeletePayload = JSON.parse(afterProviderDelete.stdout) as any;
    assert.equal(afterProviderDeletePayload.data.results.some((entry) => entry.type === "routing_rule" && entry.metadata?.feature === "quickask" && entry.metadata?.capability === "chat"), false);
    const deletedProviderSetting = await runCliCapture(["providers", "settings", "delete", "provider_alpha", "--json"], workspaceRoot);
    assert.equal(deletedProviderSetting.code, CLI_EXIT_OK);
    const settingDeleteJobs = await runCliCapture(["search", "jobs", "--source", "providers.routing", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(settingDeleteJobs.code, CLI_EXIT_OK);
    const settingDeleteJobsPayload = JSON.parse(settingDeleteJobs.stdout) as any;
    const settingDeleteJob = settingDeleteJobsPayload.data.items.find((job) => job.resourceId === "setting:provider_alpha" && job.operation === "delete");
    assert.deepEqual({ priority: settingDeleteJob?.priority, eventDriven: settingDeleteJob?.payload.eventDriven, kind: settingDeleteJob?.payload.kind, provider: settingDeleteJob?.payload.provider }, { priority: 80, eventDriven: true, kind: "setting", provider: "provider_alpha" });
    const settingDeleteRun = await runCliCapture(["search", "service", "run-once", "--source", "providers.routing", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(settingDeleteRun.code, CLI_EXIT_OK);
    const settingDeleteRunItem = (JSON.parse(settingDeleteRun.stdout) as any).data.worker?.items?.[0];
    assert.deepEqual({ source: settingDeleteRunItem?.source, operation: settingDeleteRunItem?.operation, status: settingDeleteRunItem?.status, indexed: settingDeleteRunItem?.indexed }, { source: "providers.routing", operation: "delete", status: "done", indexed: 1 });
    const afterSettingDelete = await runCliCapture(["search", "query", "provider_alpha local", "--sources", "providers.routing", "--filters", "metadata.kind=setting", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(afterSettingDelete.code, CLI_EXIT_DEGRADED, afterSettingDelete.stderr || afterSettingDelete.stdout);
    const afterSettingDeletePayload = JSON.parse(afterSettingDelete.stdout) as any;
    assert.equal(afterSettingDeletePayload.data.results.some((entry) => entry.type === "provider_setting" && entry.metadata?.provider === "provider_alpha"), false);
    const deleteJobs = await runCliCapture(["search", "jobs", "--source", "snippets.library", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleteJobs.code, CLI_EXIT_OK);
    const deleteJobsPayload = JSON.parse(deleteJobs.stdout) as any;
    const deleteJob = deleteJobsPayload.data.items.find((job) => job.resourceId === "quickask-review" && job.operation === "delete");
    assert.deepEqual({ eventDriven: deleteJob?.payload.eventDriven, slug: deleteJob?.payload.slug }, { eventDriven: true, slug: "quickask-review" });
  });
});
test("agent entity writes enqueue and index agent catalog fast paths without secrets", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-agents-catalog-"));
  const dataRoot = path.join(workspaceRoot, ".claw", "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const agent = await runCliCapture([
      "agents",
      "upsert",
      "agent.ops",
      "--name",
      "Ops Sentinel",
      "--role",
      "Support",
      "--runtime",
      "codex",
      "--model",
      "generic-agent",
      "--secret-ref",
      "vault://agents/ops",
      "--json",
    ], workspaceRoot);
    assert.equal(agent.code, CLI_EXIT_OK);

    const personality = await runCliCapture([
      "personalities",
      "upsert",
      "personality.review",
      "--name",
      "Evidence Reviewer",
      "--prompt",
      "Review changes with concrete evidence before escalation",
      "--json",
    ], workspaceRoot);
    assert.equal(personality.code, CLI_EXIT_OK);

    const collection = await runCliCapture([
      "skill-collections",
      "upsert",
      "collection.review",
      "--name",
      "Review Toolkit",
      "--description",
      "Reusable review and code evidence skills",
      "--tags",
      "review,code",
      "--json",
    ], workspaceRoot);
    assert.equal(collection.code, CLI_EXIT_OK);

    const connection = await runCliCapture([
      "connections",
      "upsert",
      "github.ops",
      "--provider",
      "github",
      "--label",
      "GitHub Ops",
      "--secret-ref",
      "vault://connections/github",
      "--scopes",
      "issues,pulls",
      "--json",
    ], workspaceRoot);
    assert.equal(connection.code, CLI_EXIT_OK);

    const jobs = await runCliCapture(["search", "jobs", "--source", "agents.catalog", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(jobs.code, CLI_EXIT_OK);
    const jobsPayload = JSON.parse(jobs.stdout) as {
      data: { items: Array<{ source: string; operation: string; resourceId: string; payload: { eventDriven?: boolean; kind?: string; id?: string } }> };
    };
    const agentJob = jobsPayload.data.items.find((job) => job.resourceId === "agent:agent.ops");
    assert.equal(agentJob?.source, "agents.catalog");
    assert.equal(agentJob?.operation, "upsert");
    assert.equal(agentJob?.payload.eventDriven, true);
    assert.equal(agentJob?.payload.kind, "agent");
    assert.equal(agentJob?.payload.id, "agent.ops");
    assert.equal(jobsPayload.data.items.some((job) => job.resourceId === "personality:personality.review"), true);
    assert.equal(jobsPayload.data.items.some((job) => job.resourceId === "skill_collection:collection.review"), true);
    assert.equal(jobsPayload.data.items.some((job) => job.resourceId === "connection:github.ops"), true);

    const run = await runCliCapture(["search", "service", "run-once", "--source", "agents.catalog", "--data-dir", dataRoot, "--json", "--limit", "4"], workspaceRoot);
    assert.equal(run.code, CLI_EXIT_OK);

    const query = await runCliCapture(["search", "query", "Ops Sentinel generic-agent", "--domains", "agents", "--filters", "metadata.kind=agent", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as {
      data: {
        indexedFastPaths: { "agents.catalog": number };
        results: Array<{ source: string; domain: string; type: string; title: string; metadata?: { kind?: string; runtime?: string; model?: string; hasProtectedRef?: boolean } }>;
      };
    };
    assert.equal(queryPayload.data.indexedFastPaths["agents.catalog"], 4);
    const agentResult = queryPayload.data.results.find((entry) => entry.title === "Ops Sentinel");
    assert.equal(agentResult?.source, "agents.catalog");
    assert.equal(agentResult?.domain, "agents");
    assert.equal(agentResult?.type, "agent");
    assert.equal(agentResult?.metadata?.runtime, "codex");
    assert.equal(agentResult?.metadata?.model, "generic-agent");
    assert.equal(agentResult?.metadata?.hasProtectedRef, true);
    assert.equal(JSON.stringify(queryPayload.data.results).includes("vault://agents/ops"), false);

    const connectionQuery = await runCliCapture(["search", "query", "GitHub Ops pulls", "--domains", "agents", "--filters", "metadata.kind=connection", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(connectionQuery.code, CLI_EXIT_OK);
    const connectionPayload = JSON.parse(connectionQuery.stdout) as {
      data: { results: Array<{ type: string; title: string; metadata?: { provider?: string; hasProtectedRef?: boolean; scopes?: string[] } }> };
    };
    const connectionResult = connectionPayload.data.results.find((entry) => entry.title === "GitHub Ops");
    assert.equal(connectionResult?.type, "connection");
    assert.equal(connectionResult?.metadata?.provider, "github");
    assert.equal(connectionResult?.metadata?.hasProtectedRef, true);
    assert.deepEqual(connectionResult?.metadata?.scopes, ["issues", "pulls"]);
    assert.equal(JSON.stringify(connectionPayload.data.results).includes("vault://connections/github"), false);

    const deleted = await runCliCapture(["connections", "delete", "github.ops", "--json"], workspaceRoot);
    assert.equal(deleted.code, CLI_EXIT_OK);
    const deleteJobs = await runCliCapture(["search", "jobs", "--source", "agents.catalog", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleteJobs.code, CLI_EXIT_OK);
    const deleteJobsPayload = JSON.parse(deleteJobs.stdout) as {
      data: { items: Array<{ operation: string; resourceId: string; payload: { eventDriven?: boolean; kind?: string; id?: string } }> };
    };
    const deleteJob = deleteJobsPayload.data.items.find((job) => job.resourceId === "connection:github.ops" && job.operation === "delete");
    assert.equal(deleteJob?.payload.eventDriven, true);
    assert.equal(deleteJob?.payload.kind, "connection");
    assert.equal(deleteJob?.payload.id, "github.ops");
  });
});

test("marketplace choice writes enqueue and index marketplace fast paths", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-marketplace-"));
  const dataRoot = path.join(workspaceRoot, ".claw", "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const choice = await runCliCapture([
      "marketplace",
      "choice",
      "upsert",
      "choice.provider.default",
      "--target",
      "default-ai-provider",
      "--choice",
      "provider_alpha",
      "--kind",
      "provider",
      "--rationale",
      "Use provider alpha for local low-cost routing",
      "--json",
    ], workspaceRoot);
    assert.equal(choice.code, CLI_EXIT_OK);

    const jobs = await runCliCapture(["search", "jobs", "--source", "marketplace.choices", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(jobs.code, CLI_EXIT_OK);
    const jobsPayload = JSON.parse(jobs.stdout) as {
      data: { items: Array<{ source: string; operation: string; resourceId: string; payload: { eventDriven?: boolean; choiceId?: string } }> };
    };
    const job = jobsPayload.data.items.find((entry) => entry.resourceId === "choice.provider.default");
    assert.equal(job?.source, "marketplace.choices");
    assert.equal(job?.operation, "upsert");
    assert.equal(job?.payload.eventDriven, true);
    assert.equal(job?.payload.choiceId, "choice.provider.default");

    const run = await runCliCapture(["search", "service", "run-once", "--source", "marketplace.choices", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(run.code, CLI_EXIT_OK);

    const query = await runCliCapture(["search", "query", "default-ai-provider provider alpha", "--domains", "marketplace", "--filters", "metadata.kind=provider", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as {
      data: {
        indexedFastPaths: { "marketplace.choices": number };
        results: Array<{ source: string; domain: string; type: string; title: string; metadata?: { target?: string; choice?: string; status?: string }; fragments?: Array<{ snippet?: string }> }>;
      };
    };
    assert.equal(queryPayload.data.indexedFastPaths["marketplace.choices"], 1);
    const result = queryPayload.data.results.find((entry) => entry.title === "default-ai-provider: provider_alpha");
    assert.equal(result?.source, "marketplace.choices");
    assert.equal(result?.domain, "marketplace");
    assert.equal(result?.type, "provider");
    assert.equal(result?.metadata?.target, "default-ai-provider");
    assert.equal(result?.metadata?.choice, "provider_alpha");
    assert.equal(result?.metadata?.status, "active");
    assert.equal(result?.fragments?.some((fragment) => fragment.snippet?.includes("low-cost routing")), true);

    const deleted = await runCliCapture(["marketplace", "choice", "delete", "choice.provider.default", "--json"], workspaceRoot);
    assert.equal(deleted.code, CLI_EXIT_OK);
    const deleteJobs = await runCliCapture(["search", "jobs", "--source", "marketplace.choices", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleteJobs.code, CLI_EXIT_OK);
    const deleteJobsPayload = JSON.parse(deleteJobs.stdout) as {
      data: { items: Array<{ operation: string; resourceId: string; payload: { eventDriven?: boolean; choiceId?: string } }> };
    };
    const deleteJob = deleteJobsPayload.data.items.find((entry) => entry.resourceId === "choice.provider.default" && entry.operation === "delete");
    assert.equal(deleteJob?.payload.eventDriven, true);
    assert.equal(deleteJob?.payload.choiceId, "choice.provider.default");
  });
});

test("content social and iot writes enqueue and index framework domain fast paths", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-content-social-iot-"));
  const dataRoot = path.join(workspaceRoot, ".claw", "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const contentStdout = captureStream();
    const contentStderr = captureStream();
    const content = await runInternalV1Cli([
      "content",
      "upsert",
      "--id",
      "content.launch",
      "--title",
      "Launch Narrative",
      "--kind",
      "campaign_item",
      "--status",
      "draft",
      "--brand-id",
      "brand.alpha",
      "--campaign-id",
      "campaign.spring",
      "--body",
      "Publish the launch story with evidence from the product team",
      "--json",
    ], { stdout: contentStdout.stream, stderr: contentStderr.stream, cwd: workspaceRoot });
    assert.equal(content, CLI_EXIT_OK);

    const socialStdout = captureStream();
    const socialStderr = captureStream();
    const social = await runInternalV1Cli([
      "social",
      "upsert",
      "--id",
      "post.launch",
      "--title",
      "Launch Social Draft",
      "--status",
      "scheduled",
      "--channel",
      JSON.stringify({ name: "linkedin", audience: "builders" }),
      "--scheduled-at",
      "2026-05-20T10:00:00.000Z",
      "--body",
      "Share the launch story with builder notes",
      "--json",
    ], { stdout: socialStdout.stream, stderr: socialStderr.stream, cwd: workspaceRoot });
    assert.equal(social, CLI_EXIT_OK);

    const iotStdout = captureStream();
    const iotStderr = captureStream();
    const iot = await runInternalV1Cli([
      "iot",
      "config",
      "set",
      "thermostat.lab",
      "--name",
      "Lab Thermostat",
      "--kind",
      "thermostat",
      "--config",
      JSON.stringify({ room: "lab", mode: "eco", apiKey: "iot-secret-token" }),
      "--secret-ref",
      "vault://iot/thermostat",
      "--json",
    ], { stdout: iotStdout.stream, stderr: iotStderr.stream, cwd: workspaceRoot });
    assert.equal(iot, CLI_EXIT_OK);

    const contentJobs = await runCliCapture(["search", "jobs", "--source", "content.items", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(contentJobs.code, CLI_EXIT_OK);
    const contentJobsPayload = JSON.parse(contentJobs.stdout) as {
      data: { items: Array<{ source: string; operation: string; resourceId: string; payload: { eventDriven?: boolean; itemId?: string } }> };
    };
    const contentJob = contentJobsPayload.data.items.find((entry) => entry.resourceId === "content.launch");
    assert.equal(contentJob?.source, "content.items");
    assert.equal(contentJob?.operation, "upsert");
    assert.equal(contentJob?.payload.eventDriven, true);
    assert.equal(contentJob?.payload.itemId, "content.launch");

    const socialJobs = await runCliCapture(["search", "jobs", "--source", "social.posts", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(socialJobs.code, CLI_EXIT_OK);
    const socialJobsPayload = JSON.parse(socialJobs.stdout) as {
      data: { items: Array<{ source: string; operation: string; resourceId: string; payload: { eventDriven?: boolean; postId?: string } }> };
    };
    const socialJob = socialJobsPayload.data.items.find((entry) => entry.resourceId === "post.launch");
    assert.equal(socialJob?.source, "social.posts");
    assert.equal(socialJob?.operation, "upsert");
    assert.equal(socialJob?.payload.eventDriven, true);
    assert.equal(socialJob?.payload.postId, "post.launch");

    const iotJobs = await runCliCapture(["search", "jobs", "--source", "iot.config", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(iotJobs.code, CLI_EXIT_OK);
    const iotJobsPayload = JSON.parse(iotJobs.stdout) as {
      data: { items: Array<{ source: string; operation: string; resourceId: string; payload: { eventDriven?: boolean; configId?: string } }> };
    };
    const iotJob = iotJobsPayload.data.items.find((entry) => entry.resourceId === "thermostat.lab");
    assert.equal(iotJob?.source, "iot.config");
    assert.equal(iotJob?.operation, "upsert");
    assert.equal(iotJob?.payload.eventDriven, true);
    assert.equal(iotJob?.payload.configId, "thermostat.lab");

    assert.equal((await runCliCapture(["search", "service", "run-once", "--source", "content.items", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot)).code, CLI_EXIT_OK);
    assert.equal((await runCliCapture(["search", "service", "run-once", "--source", "social.posts", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot)).code, CLI_EXIT_OK);
    assert.equal((await runCliCapture(["search", "service", "run-once", "--source", "iot.config", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot)).code, CLI_EXIT_OK);

    const contentQuery = await runCliCapture(["search", "query", "product team", "--domains", "content", "--filters", "metadata.kind=campaign_item", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(contentQuery.code, CLI_EXIT_OK);
    const contentPayload = JSON.parse(contentQuery.stdout) as {
      data: { indexedFastPaths: { "content.items": number }; results: Array<{ source: string; title: string; metadata?: { brandId?: string; campaignId?: string }; fragments?: Array<{ snippet?: string }> }> };
    };
    assert.equal(contentPayload.data.indexedFastPaths["content.items"], 1);
    const contentResult = contentPayload.data.results.find((entry) => entry.title === "Launch Narrative");
    assert.equal(contentResult?.source, "content.items");
    assert.equal(contentResult?.metadata?.brandId, "brand.alpha");
    assert.equal(contentResult?.metadata?.campaignId, "campaign.spring");
    assert.equal(contentResult?.fragments?.some((fragment) => fragment.snippet?.includes("product team")), true);

    const socialQuery = await runCliCapture(["search", "query", "builder notes", "--domains", "social", "--filters", "metadata.channel=linkedin", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(socialQuery.code, CLI_EXIT_OK);
    const socialPayload = JSON.parse(socialQuery.stdout) as {
      data: { indexedFastPaths: { "social.posts": number }; results: Array<{ source: string; title: string; metadata?: { channel?: string; scheduled?: boolean } }> };
    };
    assert.equal(socialPayload.data.indexedFastPaths["social.posts"], 1);
    const socialResult = socialPayload.data.results.find((entry) => entry.title === "Launch Social Draft");
    assert.equal(socialResult?.source, "social.posts");
    assert.equal(socialResult?.metadata?.channel, "linkedin");
    assert.equal(socialResult?.metadata?.scheduled, true);

    const iotQuery = await runCliCapture(["search", "query", "Lab Thermostat", "--domains", "iot", "--filters", "metadata.enabled=true", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(iotQuery.code, CLI_EXIT_OK);
    const iotPayload = JSON.parse(iotQuery.stdout) as {
      data: { indexedFastPaths: { "iot.config": number }; results: Array<{ source: string; title: string; metadata?: { enabled?: boolean; hasProtectedRef?: boolean } }> };
    };
    assert.equal(iotPayload.data.indexedFastPaths["iot.config"], 1);
    const iotResult = iotPayload.data.results.find((entry) => entry.title === "Lab Thermostat");
    assert.equal(iotResult?.source, "iot.config");
    assert.equal(iotResult?.metadata?.enabled, true);
    assert.equal(iotResult?.metadata?.hasProtectedRef, true);
    assert.equal(JSON.stringify(iotPayload.data.results).includes("vault://iot/thermostat"), false);
    assert.equal(JSON.stringify(iotPayload.data.results).includes("iot-secret-token"), false);

    assert.equal(await runInternalV1Cli(["content", "delete", "content.launch", "--json"], { stdout: captureStream().stream, stderr: captureStream().stream, cwd: workspaceRoot }), CLI_EXIT_OK);
    assert.equal(await runInternalV1Cli(["social", "delete", "post.launch", "--json"], { stdout: captureStream().stream, stderr: captureStream().stream, cwd: workspaceRoot }), CLI_EXIT_OK);
    assert.equal(await runInternalV1Cli(["iot", "config", "delete", "thermostat.lab", "--json"], { stdout: captureStream().stream, stderr: captureStream().stream, cwd: workspaceRoot }), CLI_EXIT_OK);
    const deleteIotJobs = await runCliCapture(["search", "jobs", "--source", "iot.config", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleteIotJobs.code, CLI_EXIT_OK);
    const deleteIotJobsPayload = JSON.parse(deleteIotJobs.stdout) as {
      data: { items: Array<{ operation: string; resourceId: string; payload: { eventDriven?: boolean; configId?: string } }> };
    };
    const deleteIotJob = deleteIotJobsPayload.data.items.find((entry) => entry.resourceId === "thermostat.lab" && entry.operation === "delete");
    assert.equal(deleteIotJob?.payload.eventDriven, true);
    assert.equal(deleteIotJob?.payload.configId, "thermostat.lab");
  });
});

test("business writes enqueue and index business record fast paths", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-business-"));
  const dataRoot = path.join(workspaceRoot, ".claw", "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const stdout = captureStream();
    const stderr = captureStream();
    const upsert = await runInternalV1Cli([
      "business",
      "upsert",
      "--id",
      "biz.customer.alpha",
      "--name",
      "Alpha Customer",
      "--kind",
      "customer",
      "--status",
      "active",
      "--body",
      "Customer renewal evidence and account notes",
      "--json",
    ], { stdout: stdout.stream, stderr: stderr.stream, cwd: workspaceRoot });
    assert.equal(upsert, CLI_EXIT_OK);

    const jobs = await runCliCapture(["search", "jobs", "--source", "business.records", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(jobs.code, CLI_EXIT_OK);
    const jobsPayload = JSON.parse(jobs.stdout) as {
      data: { items: Array<{ source: string; operation: string; resourceId: string; payload: { eventDriven?: boolean; recordId?: string } }> };
    };
    const job = jobsPayload.data.items.find((entry) => entry.resourceId === "biz.customer.alpha");
    assert.equal(job?.source, "business.records");
    assert.equal(job?.operation, "upsert");
    assert.equal(job?.payload.eventDriven, true);
    assert.equal(job?.payload.recordId, "biz.customer.alpha");

    const run = await runCliCapture(["search", "service", "run-once", "--source", "business.records", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(run.code, CLI_EXIT_OK);

    const query = await runCliCapture(["search", "query", "renewal evidence", "--domains", "business", "--filters", "metadata.kind=customer", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as {
      data: {
        indexedFastPaths: { "business.records": number };
        results: Array<{ source: string; domain: string; type: string; title: string; metadata?: { status?: string }; fragments?: Array<{ snippet?: string }> }>;
      };
    };
    assert.equal(queryPayload.data.indexedFastPaths["business.records"], 1);
    const result = queryPayload.data.results.find((entry) => entry.title === "Alpha Customer");
    assert.equal(result?.source, "business.records");
    assert.equal(result?.domain, "business");
    assert.equal(result?.type, "customer");
    assert.equal(result?.metadata?.status, "active");
    assert.equal(result?.fragments?.some((fragment) => fragment.snippet?.includes("account notes")), true);

    const deleted = await runInternalV1Cli(["business", "delete", "biz.customer.alpha", "--json"], { stdout: captureStream().stream, stderr: captureStream().stream, cwd: workspaceRoot });
    assert.equal(deleted, CLI_EXIT_OK);
    const deleteJobs = await runCliCapture(["search", "jobs", "--source", "business.records", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleteJobs.code, CLI_EXIT_OK);
    const deleteJobsPayload = JSON.parse(deleteJobs.stdout) as {
      data: { items: Array<{ operation: string; resourceId: string; payload: { eventDriven?: boolean; recordId?: string } }> };
    };
    const deleteJob = deleteJobsPayload.data.items.find((entry) => entry.resourceId === "biz.customer.alpha" && entry.operation === "delete");
    assert.equal(deleteJob?.payload.eventDriven, true);
    assert.equal(deleteJob?.payload.recordId, "biz.customer.alpha");
  });
});

test("search rebuild indexes connectors.catalog from control-plane operations without secrets", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-connectors-"));
  const dataRoot = path.join(workspaceRoot, ".claw", "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    fs.mkdirSync(dataRoot, { recursive: true });
    const sqlite = new Database(resolveClawjsMainDbPath());
    try {
      ensureV1MainSchema(sqlite);
      const now = "2026-05-17T12:00:00.000Z";
      sqlite.prepare(`
        INSERT INTO connector_providers (id, display_name, trust_tier, enabled, metadata_json, created_at, updated_at)
        VALUES ('openai', 'OpenAI', 'external_saas', 1, '{"region":"us"}', ?, ?)
      `).run(now, now);
      sqlite.prepare(`
        INSERT INTO connector_capabilities (id, domain, action, facet, summary, created_at, updated_at)
        VALUES ('image.edit.background', 'image', 'edit', 'background', 'Edit image backgrounds through a brokered connector.', ?, ?)
      `).run(now, now);
      sqlite.prepare(`
        INSERT INTO connector_network_policies (id, required, egress_profile_id, vpn_profile_id, allowed_hosts_json, created_at, updated_at)
        VALUES ('openai-egress', 1, 'egress.default', 'vpn.openai', '["api.openai.com"]', ?, ?)
      `).run(now, now);
      sqlite.prepare(`
        INSERT INTO connector_operations (
          id, provider_id, runtime_kind, support, native_name, capability_ids_json,
          risk_tiers_json, credential_required, cost_risk, requires_approval,
          network_policy_id, metadata_json, created_at, updated_at
        )
        VALUES (
          'openai.images.edit', 'openai', 'api', 'supported', 'images.edit',
          '["image.edit.background"]', '["cost"]', 1, 'cost', 1,
          'openai-egress', '{"notes":"background replacement connector operation"}', ?, ?
        )
      `).run(now, now);
      sqlite.prepare(`
        INSERT INTO connector_credential_bindings (id, provider_id, secret_ref, scopes_json, operation_ids_json, created_at, updated_at)
        VALUES ('openai.key.admin', 'openai', 'vault://connectors/openai/admin', '["images"]', '["openai.images.edit"]', ?, ?)
      `).run(now, now);
    } finally {
      sqlite.close();
    }

    const rebuild = await runCliCapture(["search", "rebuild", "--source", "connectors.catalog", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(rebuild.code, CLI_EXIT_OK);
    const rebuildPayload = JSON.parse(rebuild.stdout) as {
      data: { sources: string[]; pendingSources: string[]; indexedBySource: { "connectors.catalog": number } };
    };
    assert.equal(rebuildPayload.data.sources.includes("connectors.catalog"), true);
    assert.equal(rebuildPayload.data.pendingSources.includes("connectors.catalog"), false);
    assert.equal(rebuildPayload.data.indexedBySource["connectors.catalog"], 1);

    const query = await runCliCapture(["search", "query", "image backgrounds", "--domains", "connectors", "--filters", "metadata.provider=openai", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as {
      data: {
        indexedFastPaths: { "connectors.catalog": number };
        results: Array<{
          source: string;
          domain: string;
          type: string;
          title: string;
          metadata?: { provider?: string; support?: string; requiresApproval?: boolean; costRisk?: string; capabilityId?: string[] };
          actions?: Array<{ id: string; kind: string; requiresApproval?: boolean; grant?: string }>;
          fragments?: Array<{ title?: string; snippet?: string }>;
        }>;
      };
    };
    assert.equal(queryPayload.data.indexedFastPaths["connectors.catalog"], 1);
    const result = queryPayload.data.results.find((entry) => entry.title === "OpenAI images.edit");
    assert.equal(result?.source, "connectors.catalog");
    assert.equal(result?.domain, "connectors");
    assert.equal(result?.type, "operation");
    assert.equal(result?.metadata?.provider, "openai");
    assert.equal(result?.metadata?.support, "supported");
    assert.equal(result?.metadata?.requiresApproval, true);
    assert.equal(result?.metadata?.costRisk, "cost");
    assert.deepEqual(result?.metadata?.capabilityId, ["image.edit.background"]);
    assert.equal(result?.actions?.some((action) => action.id === "execute" && action.kind === "custom" && action.requiresApproval === true && action.grant === "search.connectors.execute"), true);
    assert.equal(result?.fragments?.some((fragment) => fragment.title === "image.edit.background" && fragment.snippet?.includes("brokered connector")), true);
    assert.equal(JSON.stringify(result).includes("vault://connectors/openai/admin"), false);
  });
});

test("search service resource jobs refresh only the targeted connector operation", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-connectors-resource-"));
  const dataRoot = path.join(workspaceRoot, ".claw", "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    fs.mkdirSync(dataRoot, { recursive: true });
    const sqlite = new Database(resolveClawjsMainDbPath());
    try {
      ensureV1MainSchema(sqlite);
      const now = "2026-05-17T12:00:00.000Z";
      sqlite.prepare(`
        INSERT INTO connector_providers (id, display_name, trust_tier, enabled, metadata_json, created_at, updated_at)
        VALUES ('openai', 'OpenAI', 'external_saas', 1, '{}', ?, ?)
      `).run(now, now);
      sqlite.prepare(`
        INSERT INTO connector_capabilities (id, domain, action, facet, summary, created_at, updated_at)
        VALUES ('image.edit.background', 'image', 'edit', 'background', 'Edit image backgrounds through a brokered connector.', ?, ?)
      `).run(now, now);
      sqlite.prepare(`
        INSERT INTO connector_operations (
          id, provider_id, runtime_kind, support, native_name, capability_ids_json,
          risk_tiers_json, credential_required, cost_risk, requires_approval,
          network_policy_id, metadata_json, created_at, updated_at
        )
        VALUES (?, 'openai', 'api', 'supported', ?, '["image.edit.background"]', '["cost"]', 1, 'cost', 1, NULL, ?, ?, ?)
      `).run("openai.images.edit", "images.edit", JSON.stringify({ notes: "needle connector alpha only" }), now, now);
      sqlite.prepare(`
        INSERT INTO connector_operations (
          id, provider_id, runtime_kind, support, native_name, capability_ids_json,
          risk_tiers_json, credential_required, cost_risk, requires_approval,
          network_policy_id, metadata_json, created_at, updated_at
        )
        VALUES (?, 'openai', 'api', 'supported', ?, '["image.edit.background"]', '["cost"]', 1, 'cost', 1, NULL, ?, ?, ?)
      `).run("openai.images.generate", "images.generate", JSON.stringify({ notes: "needle connector beta only" }), now, now);
    } finally {
      sqlite.close();
    }

    const scheduled = await runCliCapture([
      "search",
      "jobs",
      "schedule",
      "upsert",
      "--source",
      "connectors.catalog",
      "--resource-id",
      "openai.images.edit",
      "--payload",
      JSON.stringify({ operationId: "openai.images.edit" }),
      "--data-dir",
      dataRoot,
      "--json",
    ], workspaceRoot);
    assert.equal(scheduled.code, CLI_EXIT_OK);
    const scheduledPayload = JSON.parse(scheduled.stdout) as {
      data: { item: { source: string; operation: string; resourceId: string; payload: { eventDriven?: boolean; operationId?: string } } };
    };
    assert.equal(scheduledPayload.data.item.source, "connectors.catalog");
    assert.equal(scheduledPayload.data.item.operation, "upsert");
    assert.equal(scheduledPayload.data.item.resourceId, "openai.images.edit");
    assert.equal(scheduledPayload.data.item.payload.eventDriven, true);
    assert.equal(scheduledPayload.data.item.payload.operationId, "openai.images.edit");

    const serviceRun = await runCliCapture(["search", "service", "run-once", "--source", "connectors.catalog", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(serviceRun.code, CLI_EXIT_OK);
    const serviceRunPayload = JSON.parse(serviceRun.stdout) as {
      data: { worker?: { items: Array<{ source: string; operation: string; status: string; indexed?: number }> } };
    };
    assert.equal(serviceRunPayload.data.worker?.items[0]?.source, "connectors.catalog");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.operation, "upsert");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.status, "done");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.indexed, 1);

    const store = new SearchStore(path.join(dataRoot, "search.sqlite"));
    try {
      assert.equal(store.query({ query: "images edit", sources: ["connectors.catalog"] }).results.length, 1);
      const generatedRow = store.db.prepare("SELECT id FROM search_documents WHERE source = ? AND resource_id = ? AND deleted_at IS NULL").get("connectors.catalog", "openai.images.generate");
      assert.equal(generatedRow, undefined);
    } finally {
      store.close();
    }
  });
});

test("search rebuild indexes mcp.servers without secret values", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-mcp-"));
  const dataRoot = path.join(workspaceRoot, ".claw", "data");
  const configPath = path.join(workspaceRoot, "codex-config.toml");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    fs.writeFileSync(configPath, [
      "[mcp_servers.docs]",
      "command = \"node\"",
      "args = [\"server.js\", \"--token\", \"secret-arg-value\"]",
      "cwd = \"/tmp/docs-server\"",
      "env_passthrough = [\"SAFE_TOKEN\"]",
      "",
      "[mcp_servers.docs.env]",
      "API_TOKEN = \"super-secret-env-value\"",
      "",
      "[mcp_servers.docs.headers]",
      "Authorization = \"Bearer super-secret-header-value\"",
      "",
      "[mcp_servers.docs.headers_from_env]",
      "X_API_KEY = \"DOCS_API_KEY\"",
    ].join("\n"));

    const rebuild = await runCliCapture(["search", "rebuild", "--source", "mcp.servers", "--mcp-config", configPath, "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(rebuild.code, CLI_EXIT_OK);
    const rebuildPayload = JSON.parse(rebuild.stdout) as {
      data: { sources: string[]; pendingSources: string[]; indexedBySource: { "mcp.servers": number } };
    };
    assert.equal(rebuildPayload.data.sources.includes("mcp.servers"), true);
    assert.equal(rebuildPayload.data.pendingSources.includes("mcp.servers"), false);
    assert.equal(rebuildPayload.data.indexedBySource["mcp.servers"], 1);

    const query = await runCliCapture(["search", "query", "docs node API_TOKEN", "--domains", "mcp", "--mcp-config", configPath, "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as {
      data: {
        indexedFastPaths: { "mcp.servers": number };
        results: Array<{
          source: string;
          domain: string;
          type: string;
          title: string;
          metadata?: { transport?: string; enabled?: boolean; envKey?: unknown; headerKey?: unknown; headersFromEnvKey?: unknown };
          fragments?: Array<{ title?: string; snippet?: string; metadata?: { redactedValues?: boolean } }>;
        }>;
      };
    };
    assert.equal(queryPayload.data.indexedFastPaths["mcp.servers"], 1);
    const result = queryPayload.data.results.find((entry) => entry.title === "docs");
    assert.equal(result?.source, "mcp.servers");
    assert.equal(result?.domain, "mcp");
    assert.equal(result?.type, "server");
    assert.equal(result?.metadata?.transport, "stdio");
    assert.equal(result?.metadata?.enabled, true);
    assert.equal(result?.metadata?.envKey, "[REDACTED]");
    assert.equal(result?.metadata?.headerKey, "[REDACTED]");
    assert.equal(result?.metadata?.headersFromEnvKey, "[REDACTED]");
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes("super-secret-env-value"), false);
    assert.equal(serialized.includes("super-secret-header-value"), false);
    assert.equal(serialized.includes("secret-arg-value"), false);
  });
});

test("mcp writes enqueue and refresh mcp.servers jobs", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-mcp-events-"));
  const dataRoot = path.join(workspaceRoot, ".claw", "data");
  const configPath = path.join(workspaceRoot, "codex-config.toml");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const stdout = captureStream();
    const stderr = captureStream();
    const upsert = await runInternalV1Cli([
      "mcp",
      "upsert",
      "localdocs",
      "--command",
      "node",
      "--args",
      JSON.stringify(["server.js"]),
      "--env",
      JSON.stringify({ DOCS_TOKEN: "hidden-token" }),
      "--config",
      configPath,
      "--json",
    ], { stdout: stdout.stream, stderr: stderr.stream, cwd: workspaceRoot });
    assert.equal(upsert, CLI_EXIT_OK);

    const jobs = await runCliCapture(["search", "jobs", "--source", "mcp.servers", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(jobs.code, CLI_EXIT_OK);
    const jobsPayload = JSON.parse(jobs.stdout) as {
      data: { items: Array<{ source: string; operation: string; resourceId: string; shard: string; payload: { eventDriven?: boolean; serverId?: string; configPath?: string } }> };
    };
    const job = jobsPayload.data.items.find((item) => item.resourceId === "localdocs");
    assert.equal(job?.source, "mcp.servers");
    assert.equal(job?.operation, "upsert");
    assert.equal(job?.shard, "hot");
    assert.equal(job?.payload.eventDriven, true);
    assert.equal(job?.payload.serverId, "localdocs");
    assert.equal(job?.payload.configPath, configPath);

    const serviceRun = await runCliCapture(["search", "service", "run-once", "--source", "mcp.servers", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(serviceRun.code, CLI_EXIT_OK);

    const query = await runCliCapture(["search", "query", "localdocs DOCS_TOKEN", "--domains", "mcp", "--mcp-config", configPath, "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as {
      data: { results: Array<{ source: string; domain: string; type: string; title: string; metadata?: { envKey?: unknown }; fragments?: Array<{ snippet?: string; metadata?: { redactedValues?: boolean } }> }> };
    };
    const result = queryPayload.data.results.find((entry) => entry.title === "localdocs");
    assert.equal(result?.source, "mcp.servers");
    assert.equal(result?.domain, "mcp");
    assert.equal(result?.type, "server");
    assert.equal(result?.metadata?.envKey, "[REDACTED]");
    assert.equal(JSON.stringify(result).includes("hidden-token"), false);
  });
});

test("apps and design writes enqueue and index section fast paths", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-apps-design-"));
  const dataRoot = path.join(workspaceRoot, ".claw", "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const appUpsert = await runInternalV1Cli(["apps", "upsert", "canvas-lab", "--name", "Canvas Lab", "--description", "Interactive canvas prototyping app", "--path", path.join(workspaceRoot, "apps", "canvas-lab"), "--manifest", JSON.stringify({ category: "design", entrypoint: "index.html" }), "--pinned", "true", "--json"], { stdout: captureStream().stream, stderr: captureStream().stream, cwd: workspaceRoot });
    assert.equal(appUpsert, CLI_EXIT_OK);
    const designUpsert = await runInternalV1Cli(["design", "upsert", "template", "deck-template", "--name", "Launch Deck Template", "--manifest", JSON.stringify({ tags: ["launch", "slides"], format: "pptx" }), "--builtin", "true", "--json"], { stdout: captureStream().stream, stderr: captureStream().stream, cwd: workspaceRoot });
    assert.equal(designUpsert, CLI_EXIT_OK);

    const appJobs = await runCliCapture(["search", "jobs", "--source", "apps.catalog", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(appJobs.code, CLI_EXIT_OK);
    const appJobsPayload = JSON.parse(appJobs.stdout) as any;
    const appJob = appJobsPayload.data.items.find((job) => job.resourceId === "app-canvas-lab");
    assert.deepEqual({ source: appJob?.source, operation: appJob?.operation, appId: appJob?.payload.appId, eventDriven: appJob?.payload.eventDriven }, { source: "apps.catalog", operation: "upsert", appId: "app-canvas-lab", eventDriven: true });

    const designJobs = await runCliCapture(["search", "jobs", "--source", "design.resources", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(designJobs.code, CLI_EXIT_OK);
    const designJobsPayload = JSON.parse(designJobs.stdout) as any;
    const designJob = designJobsPayload.data.items.find((job) => job.resourceId === "deck-template");
    assert.deepEqual({ source: designJob?.source, operation: designJob?.operation, resourceId: designJob?.payload.resourceId, eventDriven: designJob?.payload.eventDriven }, { source: "design.resources", operation: "upsert", resourceId: "deck-template", eventDriven: true });

    const appRun = await runCliCapture(["search", "service", "run-once", "--source", "apps.catalog", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(appRun.code, CLI_EXIT_OK);
    const designRun = await runCliCapture(["search", "service", "run-once", "--source", "design.resources", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(designRun.code, CLI_EXIT_OK);

    const appQuery = await runCliCapture(["search", "query", "canvas prototyping", "--domains", "apps", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(appQuery.code, CLI_EXIT_OK);
    const appQueryPayload = JSON.parse(appQuery.stdout) as any;
    assert.equal(appQueryPayload.data.indexedFastPaths["apps.catalog"], 1);
    const appResult = appQueryPayload.data.results.find((entry) => entry.title === "Canvas Lab");
    assert.deepEqual({ source: appResult?.source, domain: appResult?.domain, type: appResult?.type, slug: appResult?.metadata?.slug, pinned: appResult?.metadata?.pinned }, { source: "apps.catalog", domain: "apps", type: "app", slug: "canvas-lab", pinned: true });

    const appDelete = await runInternalV1Cli(["apps", "delete", "canvas-lab", "--json"], { stdout: captureStream().stream, stderr: captureStream().stream, cwd: workspaceRoot });
    assert.equal(appDelete, CLI_EXIT_OK);
    const appDeleteJobs = await runCliCapture(["search", "jobs", "--source", "apps.catalog", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(appDeleteJobs.code, CLI_EXIT_OK);
    const appDeleteJobsPayload = JSON.parse(appDeleteJobs.stdout) as any;
    const appDeleteJob = appDeleteJobsPayload.data.items.find((job) => job.resourceId === "app-canvas-lab" && job.operation === "delete");
    assert.deepEqual({ priority: appDeleteJob?.priority, appId: appDeleteJob?.payload.appId, eventDriven: appDeleteJob?.payload.eventDriven }, { priority: 80, appId: "app-canvas-lab", eventDriven: true });
    const appDeleteRun = await runCliCapture(["search", "service", "run-once", "--source", "apps.catalog", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(appDeleteRun.code, CLI_EXIT_OK);
    const appDeleteRunItem = (JSON.parse(appDeleteRun.stdout) as any).data.worker?.items?.[0];
    assert.deepEqual({ source: appDeleteRunItem?.source, operation: appDeleteRunItem?.operation, status: appDeleteRunItem?.status, indexed: appDeleteRunItem?.indexed }, { source: "apps.catalog", operation: "delete", status: "done", indexed: 1 });
    const afterAppDelete = await runCliCapture(["search", "query", "canvas prototyping", "--sources", "apps.catalog", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(afterAppDelete.code, CLI_EXIT_DEGRADED, afterAppDelete.stderr || afterAppDelete.stdout);
    const afterAppDeletePayload = JSON.parse(afterAppDelete.stdout) as any;
    assert.equal(afterAppDeletePayload.data.results.some((entry) => entry.source === "apps.catalog" && entry.title === "Canvas Lab"), false);

    const designQuery = await runCliCapture(["search", "query", "launch deck", "--domains", "design", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(designQuery.code, CLI_EXIT_OK);
    const designQueryPayload = JSON.parse(designQuery.stdout) as any;
    assert.equal(designQueryPayload.data.indexedFastPaths["design.resources"], 1);
    const designResult = designQueryPayload.data.results.find((entry) => entry.title === "Launch Deck Template");
    assert.deepEqual({ source: designResult?.source, domain: designResult?.domain, type: designResult?.type, kind: designResult?.metadata?.kind, builtin: designResult?.metadata?.builtin }, { source: "design.resources", domain: "design", type: "template", kind: "template", builtin: true });

    const designDelete = await runInternalV1Cli(["design", "delete", "deck-template", "--json"], { stdout: captureStream().stream, stderr: captureStream().stream, cwd: workspaceRoot });
    assert.equal(designDelete, CLI_EXIT_OK);
    const designDeleteJobs = await runCliCapture(["search", "jobs", "--source", "design.resources", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(designDeleteJobs.code, CLI_EXIT_OK);
    const designDeleteJobsPayload = JSON.parse(designDeleteJobs.stdout) as any;
    const designDeleteJob = designDeleteJobsPayload.data.items.find((job) => job.resourceId === "deck-template" && job.operation === "delete");
    assert.deepEqual({ priority: designDeleteJob?.priority, resourceId: designDeleteJob?.payload.resourceId, eventDriven: designDeleteJob?.payload.eventDriven }, { priority: 80, resourceId: "deck-template", eventDriven: true });
    const designDeleteRun = await runCliCapture(["search", "service", "run-once", "--source", "design.resources", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(designDeleteRun.code, CLI_EXIT_OK);
    const designDeleteRunItem = (JSON.parse(designDeleteRun.stdout) as any).data.worker?.items?.[0];
    assert.deepEqual({ source: designDeleteRunItem?.source, operation: designDeleteRunItem?.operation, status: designDeleteRunItem?.status, indexed: designDeleteRunItem?.indexed }, { source: "design.resources", operation: "delete", status: "done", indexed: 1 });
    const afterDesignDelete = await runCliCapture(["search", "query", "launch deck", "--sources", "design.resources", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(afterDesignDelete.code, CLI_EXIT_DEGRADED, afterDesignDelete.stderr || afterDesignDelete.stdout);
    const afterDesignDeletePayload = JSON.parse(afterDesignDelete.stdout) as any;
    assert.equal(afterDesignDeletePayload.data.results.some((entry) => entry.source === "design.resources" && entry.title === "Launch Deck Template"), false);
  });
});

test("search shards lists physical shard catalog state", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-shards-cli-"));
  const dataRoot = path.join(workspaceRoot, ".claw", "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    fs.mkdirSync(dataRoot, { recursive: true });
    const store = new SearchStore(path.join(dataRoot, "search.sqlite"));
    try {
      store.registerSource(createFrameworkSearchSourceManifest({
        id: "images.derived",
        domain: "images",
        name: "Images",
        resultTypes: ["image"],
      }));
      store.upsertDocument({
        id: "images.derived:hot:board",
        source: "images.derived",
        shard: "hot",
        domain: "images",
        type: "image",
        title: "Hot board",
        body: "search shard inspection",
        fragments: [{
          id: "images.derived:hot:board:ocr",
          title: "ocr",
          body: "pipeline labels",
        }],
      });
      store.upsertDocument({
        id: "images.derived:cold:board",
        source: "images.derived",
        shard: "cold",
        domain: "images",
        type: "image",
        title: "Cold board",
        body: "archive shard inspection",
      });
    } finally {
      store.close();
    }

    const shards = await runCliCapture(["search", "shards", "--source", "images.derived", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(shards.code, CLI_EXIT_OK);
    const payload = JSON.parse(shards.stdout) as {
      data: {
        state: string;
        source: string;
        domain: string | null;
        shards: Array<{ source: string; shard: string; domain: string; state: string; documentCount: number; fragmentCount: number }>;
      };
    };
    assert.equal(payload.data.state, "ready");
    assert.equal(payload.data.source, "images.derived");
    assert.equal(payload.data.domain, null);
    assert.deepEqual(payload.data.shards.map((shard) => [shard.source, shard.shard, shard.domain, shard.state, shard.documentCount, shard.fragmentCount]), [
      ["images.derived", "cold", "images", "active", 1, 0],
      ["images.derived", "hot", "images", "active", 1, 1],
    ]);

    const human = await runCliCapture(["search", "shards", "--domain", "images", "--data-dir", dataRoot], workspaceRoot);
    assert.equal(human.code, CLI_EXIT_OK);
    assert.match(human.stdout, /images\.derived\thot\timages\tactive\tdocuments=1\tfragments=1/);
  });
});

test("search rebuild indexes runtime.events from runtime and operational sidecars", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-runtime-"));
  const dataRoot = path.join(workspaceRoot, "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    fs.mkdirSync(dataRoot, { recursive: true });
    const now = new Date().toISOString();
    const runtimeDb = new Database(path.join(dataRoot, "runtime.sqlite"));
    try {
      runtimeDb.exec(`
        CREATE TABLE runtime_jobs (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          title TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'queued',
          claim_owner TEXT,
          run_at TEXT,
          attempts INTEGER NOT NULL DEFAULT 0,
          payload_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE runtime_events (
          id TEXT PRIMARY KEY,
          job_id TEXT,
          kind TEXT NOT NULL,
          level TEXT NOT NULL DEFAULT 'info',
          message TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          metadata_json TEXT NOT NULL DEFAULT '{}'
        );
      `);
      runtimeDb.prepare(`
        INSERT INTO runtime_jobs (id, kind, title, status, claim_owner, run_at, attempts, payload_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run("job-runtime-worker", "search-worker", "Search worker backfill", "queued", null, now, 0, JSON.stringify({ shard: "cold", source: "documents.blocks" }), now, now);
      runtimeDb.prepare(`
        INSERT INTO runtime_events (id, job_id, kind, level, message, created_at, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run("event-runtime-worker", "job-runtime-worker", "worker", "error", "Search worker failed during cold shard backfill", now, JSON.stringify({ source: "documents.blocks", shard: "cold" }));
    } finally {
      runtimeDb.close();
    }
    const monitorDb = new Database(path.join(dataRoot, "monitor.sqlite"));
    try {
      monitorDb.exec(`
        CREATE TABLE operational_events (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          level TEXT NOT NULL DEFAULT 'info',
          message TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          metadata_json TEXT NOT NULL DEFAULT '{}'
        );
      `);
      monitorDb.prepare(`
        INSERT INTO operational_events (id, kind, level, message, created_at, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run("monitor-runtime-lag", "uptime", "warn", "Runtime queue lag exceeded threshold", now, JSON.stringify({ queue: "search", lagMs: 1200 }));
    } finally {
      monitorDb.close();
    }

    const rebuild = await runCliCapture(["search", "rebuild", "--source", "runtime.events", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(rebuild.code, CLI_EXIT_OK);
    const rebuildPayload = JSON.parse(rebuild.stdout) as {
      data: { sources: string[]; pendingSources: string[]; indexedBySource: { "runtime.events": number } };
    };
    assert.equal(rebuildPayload.data.sources.includes("runtime.events"), true);
    assert.equal(rebuildPayload.data.pendingSources.includes("runtime.events"), false);
    assert.equal(rebuildPayload.data.indexedBySource["runtime.events"], 3);

    const query = await runCliCapture([
      "search",
      "query",
      "worker failed",
      "--domains",
      "runtime",
      "--filters",
      "metadata.level=error",
      "--data-dir",
      dataRoot,
      "--json",
      "--limit",
      "5",
    ], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as {
      data: {
        indexedFastPaths: { "runtime.events": number };
        results: Array<{
          source: string;
          domain: string;
          type: string;
          title: string;
          metadata?: { kind?: string; level?: string; jobId?: string; sidecar?: string };
          fragments?: Array<{ title?: string; snippet?: string }>;
        }>;
      };
    };
    assert.equal(queryPayload.data.indexedFastPaths["runtime.events"], 3);
    const result = queryPayload.data.results.find((entry) => entry.title.includes("Search worker failed"));
    assert.equal(result?.source, "runtime.events");
    assert.equal(result?.domain, "runtime");
    assert.equal(result?.type, "event");
    assert.equal(result?.metadata?.kind, "worker");
    assert.equal(result?.metadata?.level, "error");
    assert.equal(result?.metadata?.jobId, "job-runtime-worker");
    assert.equal(result?.metadata?.sidecar, "runtime.sqlite");
    assert.equal(result?.fragments?.some((fragment) => fragment.title === "metadata" && fragment.snippet?.includes("documents.blocks")), true);
  });
});

test("operational writes enqueue and refresh runtime.events jobs", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-runtime-events-"));
  const dataRoot = path.join(workspaceRoot, "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const recordedStdout = captureStream();
    const recordedStderr = captureStream();
    const recorded = await runInternalV1Cli([
      "monitor",
      "event",
      "Runtime queue lag exceeded threshold",
      "--id",
      "monitor-runtime-lag",
      "--kind",
      "uptime",
      "--level",
      "warn",
      "--metadata",
      JSON.stringify({ queue: "search", lagMs: 1200 }),
      "--json",
    ], { stdout: recordedStdout.stream, stderr: recordedStderr.stream, cwd: workspaceRoot });
    assert.equal(recorded, CLI_EXIT_OK);

    const jobs = await runCliCapture(["search", "jobs", "--source", "runtime.events", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(jobs.code, CLI_EXIT_OK);
    const jobsPayload = JSON.parse(jobs.stdout) as {
      data: { items: Array<{ source: string; operation: string; resourceId: string; shard: string; payload: { eventDriven?: boolean; runtimeKind?: string; domain?: string; id?: string } }> };
    };
    const job = jobsPayload.data.items.find((item) => item.resourceId === "operational:monitor:monitor-runtime-lag");
    assert.equal(job?.source, "runtime.events");
    assert.equal(job?.operation, "upsert");
    assert.equal(job?.shard, "hot");
    assert.equal(job?.payload.eventDriven, true);
    assert.equal(job?.payload.runtimeKind, "operational");
    assert.equal(job?.payload.domain, "monitor");
    assert.equal(job?.payload.id, "monitor-runtime-lag");

    const serviceRun = await runCliCapture(["search", "service", "run-once", "--source", "runtime.events", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(serviceRun.code, CLI_EXIT_OK);

    const query = await runCliCapture(["search", "query", "queue lag threshold", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as {
      data: { results: Array<{ source: string; domain: string; type: string; title: string; metadata?: { sidecar?: string; operationalDomain?: string; level?: string } }> };
    };
    const result = queryPayload.data.results.find((entry) => entry.title.includes("Runtime queue lag"));
    assert.equal(result?.source, "runtime.events");
    assert.equal(result?.domain, "runtime");
    assert.equal(result?.type, "operational_event");
    assert.equal(result?.metadata?.sidecar, "monitor.sqlite");
    assert.equal(result?.metadata?.operationalDomain, "monitor");
    assert.equal(result?.metadata?.level, "warn");
  });
});

test("search rebuild indexes documents.blocks from document records", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-documents-"));
  const dataRoot = path.join(workspaceRoot, ".claw", "data");
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

    const documentJobs = await runCliCapture(["search", "jobs", "--source", "documents.blocks", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(documentJobs.code, CLI_EXIT_OK);
    const documentJobsPayload = JSON.parse(documentJobs.stdout) as {
      data: { items: Array<{ source: string; operation: string; resourceId: string; shard: string; payload: { eventDriven?: boolean; collection?: string; documentId?: string; recordId?: string } }> };
    };
    const documentJob = documentJobsPayload.data.items.find((job) => job.resourceId === `main:documents:${createDocumentPayload.data.id}`);
    assert.equal(documentJob?.source, "documents.blocks");
    assert.equal(documentJob?.operation, "upsert");
    assert.equal(documentJob?.shard, "hot");
    assert.equal(documentJob?.payload.eventDriven, true);
    assert.equal(documentJob?.payload.collection, "documents");
    assert.equal(documentJob?.payload.documentId, createDocumentPayload.data.id);
    assert.equal(documentJob?.payload.recordId, createDocumentPayload.data.id);

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
    const createBlockPayload = JSON.parse(createBlock.stdout) as { data: { id: string } };
    assert.ok(createBlockPayload.data.id);

    const blockJobs = await runCliCapture(["search", "jobs", "--source", "documents.blocks", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(blockJobs.code, CLI_EXIT_OK);
    const blockJobsPayload = JSON.parse(blockJobs.stdout) as {
      data: { items: Array<{ operation: string; priority: number; resourceId: string; payload: { eventDriven?: boolean; collection?: string; documentId?: string; recordId?: string } }> };
    };
    const blockJob = blockJobsPayload.data.items.find((job) => job.resourceId === `main:documents:${createDocumentPayload.data.id}`);
    assert.equal(blockJob?.operation, "upsert");
    assert.equal(blockJob?.priority, 60);
    assert.equal(blockJob?.payload.eventDriven, true);
    assert.equal(blockJob?.payload.collection, "document_blocks");
    assert.equal(blockJob?.payload.documentId, createDocumentPayload.data.id);
    assert.equal(blockJob?.payload.recordId, createBlockPayload.data.id);

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

    const embeddingsIndex = await runCliCapture(["search", "embeddings", "index", "--source", "documents.blocks", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(embeddingsIndex.code, CLI_EXIT_OK);
    const embeddingsIndexPayload = JSON.parse(embeddingsIndex.stdout) as {
      data: { model: string; documents: number; indexed: number; selectedSources: string[] };
    };
    assert.equal(embeddingsIndexPayload.data.model, "local-text-v1");
    assert.equal(embeddingsIndexPayload.data.documents, 1);
    assert.equal(embeddingsIndexPayload.data.indexed, 1);
    assert.deepEqual(embeddingsIndexPayload.data.selectedSources, ["documents.blocks"]);

    const providerEmbeddingCreate = await runCliCapture([
      "search",
      "embeddings",
      "create",
      "scoped block search",
      "--model",
      "provider-text-v1",
      "--data-dir",
      dataRoot,
      "--json",
    ], workspaceRoot);
    assert.equal(providerEmbeddingCreate.code, CLI_EXIT_USAGE);
    const providerEmbeddingCreatePayload = JSON.parse(providerEmbeddingCreate.stdout) as {
      error: { code: string; message: string };
    };
    assert.equal(providerEmbeddingCreatePayload.error.code, "SEARCH_EMBEDDING_PROVIDER_PENDING");
    assert.match(providerEmbeddingCreatePayload.error.message, /EXTERNAL PENDING/);

    const providerEmbeddingIndex = await runCliCapture([
      "search",
      "embeddings",
      "index",
      "--source",
      "documents.blocks",
      "--model",
      "provider-text-v1",
      "--data-dir",
      dataRoot,
      "--json",
    ], workspaceRoot);
    assert.equal(providerEmbeddingIndex.code, CLI_EXIT_USAGE);
    const providerEmbeddingIndexPayload = JSON.parse(providerEmbeddingIndex.stdout) as {
      error: { code: string; message: string };
    };
    assert.equal(providerEmbeddingIndexPayload.error.code, "SEARCH_EMBEDDING_PROVIDER_PENDING");
    assert.match(providerEmbeddingIndexPayload.error.message, /EXTERNAL PENDING/);

    const embeddingsStatus = await runCliCapture(["search", "embeddings", "status", "--source", "documents.blocks", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(embeddingsStatus.code, CLI_EXIT_OK);
    const embeddingsStatusPayload = JSON.parse(embeddingsStatus.stdout) as {
      data: { items: Array<{ source: string; shard: string; model: string; documents: number; vectors: number }> };
    };
    assert.equal(embeddingsStatusPayload.data.items.some((item) => item.source === "documents.blocks" && item.model === "local-text-v1" && item.documents === 1 && item.vectors === 1), true);

    const semanticQuery = await runCliCapture([
      "search",
      "query",
      "scoped block search",
      "--domains",
      "documents",
      "--strategy",
      "semantic",
      "--embedding-model",
      "local-text-v1",
      "--data-dir",
      dataRoot,
      "--json",
      "--limit",
      "5",
      "--explain",
      "true",
    ], workspaceRoot);
    assert.equal(semanticQuery.code, CLI_EXIT_OK);
    const semanticQueryPayload = JSON.parse(semanticQuery.stdout) as {
      data: { results: Array<{ source: string; title: string; explanation?: { matchedBy?: string[] } }> };
    };
    const semanticResult = semanticQueryPayload.data.results.find((candidate) => candidate.title === "Implementation Blueprint");
    assert.equal(semanticResult?.source, "documents.blocks");
    assert.equal(semanticResult?.explanation?.matchedBy?.includes("semantic"), true);

    const embeddingsJob = await runCliCapture([
      "search",
      "jobs",
      "enqueue",
      "embed",
      "--source",
      "documents.blocks",
      "--id",
      "job:documents:embed",
      "--payload",
      JSON.stringify({ limit: 10 }),
      "--data-dir",
      dataRoot,
      "--json",
    ], workspaceRoot);
    assert.equal(embeddingsJob.code, CLI_EXIT_OK);
    const embeddingsJobPayload = JSON.parse(embeddingsJob.stdout) as { data: { item: { id: string; operation: string } } };
    assert.equal(embeddingsJobPayload.data.item.id, "job:documents:embed");
    assert.equal(embeddingsJobPayload.data.item.operation, "embed");

    const embeddingsServiceRun = await runCliCapture(["search", "service", "run-once", "--source", "documents.blocks", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(embeddingsServiceRun.code, CLI_EXIT_OK);
    const embeddingsServiceRunPayload = JSON.parse(embeddingsServiceRun.stdout) as {
      data: { worker?: { items: Array<{ id: string; source: string; operation: string; status: string; indexed?: number }> } };
    };
    assert.equal(embeddingsServiceRunPayload.data.worker?.items[0]?.id, "job:documents:embed");
    assert.equal(embeddingsServiceRunPayload.data.worker?.items[0]?.source, "documents.blocks");
    assert.equal(embeddingsServiceRunPayload.data.worker?.items[0]?.operation, "embed");
    assert.equal(embeddingsServiceRunPayload.data.worker?.items[0]?.status, "done");
    assert.equal(embeddingsServiceRunPayload.data.worker?.items[0]?.indexed, 1);

    const deleteBlock = await runCliCapture(["db", "document_blocks", "delete", createBlockPayload.data.id, "--json"], workspaceRoot);
    assert.equal(deleteBlock.code, CLI_EXIT_OK);
    const deletedBlockJobs = await runCliCapture(["search", "jobs", "--source", "documents.blocks", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deletedBlockJobs.code, CLI_EXIT_OK);
    const deletedBlockJobsPayload = JSON.parse(deletedBlockJobs.stdout) as {
      data: { items: Array<{ operation: string; resourceId: string; payload: { eventDriven?: boolean; collection?: string; documentId?: string; recordId?: string } }> };
    };
    const deletedBlockJob = deletedBlockJobsPayload.data.items.find((job) => job.resourceId === `main:documents:${createDocumentPayload.data.id}`);
    assert.equal(deletedBlockJob?.operation, "upsert");
    assert.equal(deletedBlockJob?.payload.eventDriven, true);
    assert.equal(deletedBlockJob?.payload.collection, "document_blocks");
    assert.equal(deletedBlockJob?.payload.documentId, createDocumentPayload.data.id);
    assert.equal(deletedBlockJob?.payload.recordId, createBlockPayload.data.id);
  });
});

test("search rebuild indexes notes.pages from pages and blocks", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-notes-"));
  const dataRoot = path.join(workspaceRoot, "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const created = await runCliCapture([
      "notes",
      "create",
      "Quarterly planning",
      "--body",
      "Meeting notes include launch priorities and scoped search followups.",
      "--tags",
      "planning,search",
      "--json",
    ], workspaceRoot);
    assert.equal(created.code, CLI_EXIT_OK);
    const createdPayload = JSON.parse(created.stdout) as { data: { id: string; title: string } };
    assert.ok(createdPayload.data.id);

    const jobs = await runCliCapture(["search", "jobs", "--source", "notes.pages", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(jobs.code, CLI_EXIT_OK);
    const jobsPayload = JSON.parse(jobs.stdout) as {
      data: { items: Array<{ source: string; operation: string; resourceId: string; shard: string; payload: { eventDriven?: boolean; pageId?: string } }> };
    };
    const noteJob = jobsPayload.data.items.find((job) => job.resourceId === createdPayload.data.id);
    assert.equal(noteJob?.source, "notes.pages");
    assert.equal(noteJob?.operation, "upsert");
    assert.equal(noteJob?.shard, "hot");
    assert.equal(noteJob?.payload.eventDriven, true);
    assert.equal(noteJob?.payload.pageId, createdPayload.data.id);

    const rebuild = await runCliCapture(["search", "rebuild", "--source", "notes.pages", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(rebuild.code, CLI_EXIT_OK);
    const rebuildPayload = JSON.parse(rebuild.stdout) as {
      data: { sources: string[]; pendingSources: string[]; indexedBySource: { "notes.pages": number } };
    };
    assert.equal(rebuildPayload.data.sources.includes("notes.pages"), true);
    assert.equal(rebuildPayload.data.pendingSources.includes("notes.pages"), false);
    assert.equal(rebuildPayload.data.indexedBySource["notes.pages"], 1);

    const query = await runCliCapture([
      "search",
      "query",
      "launch priorities",
      "--domains",
      "notes",
      "--filters",
      JSON.stringify({ "metadata.space": "notes", redacted: false }),
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
        indexedFastPaths: { "notes.pages": number };
        results: Array<{
          source: string;
          domain: string;
          type: string;
          title: string;
          metadata?: { pageId?: string; space?: string; surface?: string; tag?: string[]; blockCount?: number };
          fragments?: Array<{ title?: string; snippet?: string }>;
          actions?: Array<{ id: string; kind: string }>;
          explanation?: { matchedBy?: string[] };
        }>;
        facets?: Array<{ id: string }>;
      };
    };
    assert.equal(queryPayload.data.indexedFastPaths["notes.pages"], 1);
    const result = queryPayload.data.results.find((entry) => entry.title === "Quarterly planning");
    assert.equal(result?.source, "notes.pages");
    assert.equal(result?.domain, "notes");
    assert.equal(result?.type, "note");
    assert.equal(result?.metadata?.pageId, createdPayload.data.id);
    assert.equal(result?.metadata?.space, "notes");
    assert.equal(result?.metadata?.surface, "note");
    assert.deepEqual(result?.metadata?.tag, ["planning", "search"]);
    assert.equal(result?.metadata?.blockCount, 1);
    assert.equal(result?.fragments?.some((fragment) => fragment.title === "paragraph" && fragment.snippet?.includes("launch priorities")), true);
    assert.equal(result?.actions?.some((action) => action.id === "open" && action.kind === "open"), true);
    assert.ok(result?.explanation?.matchedBy?.length);
    assert.equal(queryPayload.data.facets?.some((facet) => facet.id === "space"), true);

    const deleted = await runCliCapture(["notes", "delete", createdPayload.data.id, "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleted.code, CLI_EXIT_OK);
    const deleteJobs = await runCliCapture(["search", "jobs", "--source", "notes.pages", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleteJobs.code, CLI_EXIT_OK);
    const deleteJobsPayload = JSON.parse(deleteJobs.stdout) as {
      data: { items: Array<{ operation: string; resourceId: string; payload: { pageId?: string } }> };
    };
    const deleteJob = deleteJobsPayload.data.items.find((job) => job.operation === "delete" && job.resourceId === createdPayload.data.id);
    assert.equal(deleteJob?.payload.pageId, createdPayload.data.id);
  });
});

test("search rebuild indexes knowledge.graph from entities and facts", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-knowledge-"));
  const dataRoot = path.join(workspaceRoot, "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const entity = await runCliCapture([
      "knowledge",
      "entity",
      "entity-search-system",
      "--type",
      "system",
      "--label",
      "Search System",
      "--description",
      "Stores framework knowledge for launcher ranking and entity lookup.",
      "--properties",
      JSON.stringify({ owner: "search", stage: "initial" }),
      "--json",
    ], workspaceRoot);
    assert.equal(entity.code, CLI_EXIT_OK);
    const entityPayload = JSON.parse(entity.stdout) as { data: { id: string } };
    assert.equal(entityPayload.data.id, "entity-search-system");

    const fact = await runCliCapture([
      "knowledge",
      "fact",
      "--id",
      "fact-search-preference",
      "--subject",
      "entity-search-system",
      "--predicate",
      "prefers",
      "--value",
      "fast scoped Search results",
      "--confidence",
      "0.91",
      "--json",
    ], workspaceRoot);
    assert.equal(fact.code, CLI_EXIT_OK);
    const factPayload = JSON.parse(fact.stdout) as { data: { id: string } };
    assert.equal(factPayload.data.id, "fact-search-preference");

    const jobs = await runCliCapture(["search", "jobs", "--source", "knowledge.graph", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(jobs.code, CLI_EXIT_OK);
    const jobsPayload = JSON.parse(jobs.stdout) as {
      data: { items: Array<{ operation: string; resourceId: string; shard: string; payload: { kind?: string; knowledgeResourceId?: string; entityId?: string; factId?: string } }> };
    };
    const entityJob = jobsPayload.data.items.find((job) => job.resourceId === "entity:entity-search-system");
    assert.equal(entityJob?.operation, "upsert");
    assert.equal(entityJob?.shard, "hot");
    assert.equal(entityJob?.payload.kind, "entity");
    assert.equal(entityJob?.payload.entityId, "entity-search-system");
    const factJob = jobsPayload.data.items.find((job) => job.resourceId === "fact:fact-search-preference");
    assert.equal(factJob?.operation, "upsert");
    assert.equal(factJob?.payload.kind, "fact");
    assert.equal(factJob?.payload.factId, "fact-search-preference");

    const rebuild = await runCliCapture(["search", "rebuild", "--source", "knowledge.graph", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(rebuild.code, CLI_EXIT_OK);
    const rebuildPayload = JSON.parse(rebuild.stdout) as {
      data: { sources: string[]; pendingSources: string[]; indexedBySource: { "knowledge.graph": number } };
    };
    assert.equal(rebuildPayload.data.sources.includes("knowledge.graph"), true);
    assert.equal(rebuildPayload.data.pendingSources.includes("knowledge.graph"), false);
    assert.equal(rebuildPayload.data.indexedBySource["knowledge.graph"], 2);

    const query = await runCliCapture([
      "search",
      "query",
      "fast scoped Search results",
      "--domains",
      "knowledge",
      "--filters",
      JSON.stringify({ "metadata.kind": "fact", "metadata.predicate": "prefers", redacted: false }),
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
        indexedFastPaths: { "knowledge.graph": number };
        results: Array<{
          source: string;
          domain: string;
          type: string;
          title: string;
          metadata?: { kind?: string; factId?: string; subjectId?: string; predicate?: string; confidence?: number };
          fragments?: Array<{ title?: string; snippet?: string }>;
          actions?: Array<{ id: string; kind: string }>;
          explanation?: { matchedBy?: string[] };
        }>;
        facets?: Array<{ id: string }>;
      };
    };
    assert.equal(queryPayload.data.indexedFastPaths["knowledge.graph"], 2);
    const result = queryPayload.data.results.find((entry) => entry.metadata?.factId === "fact-search-preference");
    assert.equal(result?.source, "knowledge.graph");
    assert.equal(result?.domain, "knowledge");
    assert.equal(result?.type, "fact");
    assert.equal(result?.metadata?.kind, "fact");
    assert.equal(result?.metadata?.subjectId, "entity-search-system");
    assert.equal(result?.metadata?.predicate, "prefers");
    assert.equal(result?.metadata?.confidence, 0.91);
    assert.equal(result?.fragments?.some((fragment) => fragment.title === "prefers" && fragment.snippet?.includes("fast scoped Search")), true);
    assert.equal(result?.actions?.some((action) => action.id === "open" && action.kind === "open"), true);
    assert.ok(result?.explanation?.matchedBy?.length);
    assert.equal(queryPayload.data.facets?.some((facet) => facet.id === "predicate"), true);

    const deletedFact = await runCliCapture(["knowledge", "delete", "fact-search-preference", "--kind", "fact", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deletedFact.code, CLI_EXIT_OK);
    const deletedEntity = await runCliCapture(["knowledge", "delete", "entity-search-system", "--kind", "entity", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deletedEntity.code, CLI_EXIT_OK);
    const deleteJobs = await runCliCapture(["search", "jobs", "--source", "knowledge.graph", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleteJobs.code, CLI_EXIT_OK);
    const deleteJobsPayload = JSON.parse(deleteJobs.stdout) as {
      data: { items: Array<{ operation: string; resourceId: string; payload: { kind?: string; factId?: string; entityId?: string } }> };
    };
    const deletedFactJob = deleteJobsPayload.data.items.find((job) => job.operation === "delete" && job.resourceId === "fact:fact-search-preference");
    assert.equal(deletedFactJob?.payload.kind, "fact");
    assert.equal(deletedFactJob?.payload.factId, "fact-search-preference");
    const deletedEntityJob = deleteJobsPayload.data.items.find((job) => job.operation === "delete" && job.resourceId === "entity:entity-search-system");
    assert.equal(deletedEntityJob?.payload.kind, "entity");
    assert.equal(deletedEntityJob?.payload.entityId, "entity-search-system");
  });
});

test("search rebuild indexes signals.observations from signal catalog and observations", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-signals-"));
  const dataRoot = path.join(workspaceRoot, "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const catalogPath = path.join(workspaceRoot, "signals-catalog.json");
    fs.writeFileSync(catalogPath, JSON.stringify({
      vertical: {
        label: "Product Signals",
        category: "product",
        description: "Product health measurements for scoped Search ranking.",
        version: "2026.05",
      },
      variables: [
        {
          id: "signal.activation",
          label: "Activation Rate",
          valueType: "number",
          unit: { id: "percent", symbol: "%" },
          category: "growth",
          definition: "Activation percentage from onboarding events.",
        },
      ],
    }));

    const seeded = await runCliCapture([
      "signals",
      "seed-catalog",
      "--vertical",
      "product",
      "--file",
      catalogPath,
      "--data-dir",
      dataRoot,
      "--json",
    ], workspaceRoot);
    assert.equal(seeded.code, CLI_EXIT_OK);

    const observation = await runCliCapture([
      "signals",
      "observe",
      "--variable",
      "signal.activation",
      "--value",
      JSON.stringify({ value: 0.71, segment: "beta users" }),
      "--unit",
      "percent",
      "--at",
      "2026-05-17T10:15:00.000Z",
      "--source",
      JSON.stringify({ connector: "product-analytics", table: "activation_events" }),
      "--data-dir",
      dataRoot,
      "--json",
    ], workspaceRoot);
    assert.equal(observation.code, CLI_EXIT_OK);
    const observationPayload = JSON.parse(observation.stdout) as { data: { id: string; variableId: string } };
    assert.equal(observationPayload.data.variableId, "signal.activation");

    const jobs = await runCliCapture(["search", "jobs", "--source", "signals.observations", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(jobs.code, CLI_EXIT_OK);
    const jobsPayload = JSON.parse(jobs.stdout) as {
      data: { items: Array<{ operation: string; resourceId: string; shard: string; payload: { kind?: string; signalsResourceId?: string; verticalId?: string; variableId?: string; observationId?: string } }> };
    };
    const verticalJob = jobsPayload.data.items.find((job) => job.resourceId === "vertical:product");
    assert.equal(verticalJob?.operation, "upsert");
    assert.equal(verticalJob?.shard, "hot");
    assert.equal(verticalJob?.payload.kind, "vertical");
    const variableJob = jobsPayload.data.items.find((job) => job.resourceId === "variable:signal.activation");
    assert.equal(variableJob?.operation, "upsert");
    assert.equal(variableJob?.payload.variableId, "signal.activation");
    const observationJob = jobsPayload.data.items.find((job) => job.resourceId === `observation:${observationPayload.data.id}`);
    assert.equal(observationJob?.operation, "upsert");
    assert.equal(observationJob?.payload.observationId, observationPayload.data.id);

    const rebuild = await runCliCapture(["search", "rebuild", "--source", "signals.observations", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(rebuild.code, CLI_EXIT_OK);
    const rebuildPayload = JSON.parse(rebuild.stdout) as {
      data: { sources: string[]; pendingSources: string[]; indexedBySource: { "signals.observations": number } };
    };
    assert.equal(rebuildPayload.data.sources.includes("signals.observations"), true);
    assert.equal(rebuildPayload.data.pendingSources.includes("signals.observations"), false);
    assert.equal(rebuildPayload.data.indexedBySource["signals.observations"], 3);

    const query = await runCliCapture([
      "search",
      "query",
      "beta users activation",
      "--domains",
      "signals",
      "--filters",
      JSON.stringify({ "metadata.kind": "observation", "metadata.variableId": "signal.activation", redacted: false }),
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
        indexedFastPaths: { "signals.observations": number };
        results: Array<{
          source: string;
          domain: string;
          type: string;
          title: string;
          metadata?: { kind?: string; observationId?: string; verticalId?: string; variableId?: string; unit?: string; recordedAt?: string };
          fragments?: Array<{ title?: string; snippet?: string }>;
          actions?: Array<{ id: string; kind: string }>;
          explanation?: { matchedBy?: string[] };
        }>;
        facets?: Array<{ id: string }>;
      };
    };
    assert.equal(queryPayload.data.indexedFastPaths["signals.observations"], 3);
    const result = queryPayload.data.results.find((entry) => entry.metadata?.observationId === observationPayload.data.id);
    assert.equal(result?.source, "signals.observations");
    assert.equal(result?.domain, "signals");
    assert.equal(result?.type, "observation");
    assert.equal(result?.metadata?.kind, "observation");
    assert.equal(result?.metadata?.verticalId, "product");
    assert.equal(result?.metadata?.variableId, "signal.activation");
    assert.equal(result?.metadata?.unit, "percent");
    assert.equal(result?.metadata?.recordedAt, "2026-05-17T10:15:00.000Z");
    assert.equal(result?.fragments?.some((fragment) => fragment.title === "value" && fragment.snippet?.includes("beta users")), true);
    assert.equal(result?.actions?.some((action) => action.id === "open" && action.kind === "open"), true);
    assert.ok(result?.explanation?.matchedBy?.length);
    assert.equal(queryPayload.data.facets?.some((facet) => facet.id === "variableId"), true);

    const deleted = await runCliCapture(["signals", "delete", observationPayload.data.id, "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleted.code, CLI_EXIT_OK);
    const deleteJobs = await runCliCapture(["search", "jobs", "--source", "signals.observations", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleteJobs.code, CLI_EXIT_OK);
    const deleteJobsPayload = JSON.parse(deleteJobs.stdout) as {
      data: { items: Array<{ operation: string; resourceId: string; payload: { observationId?: string } }> };
    };
    const deleteJob = deleteJobsPayload.data.items.find((job) => job.operation === "delete" && job.resourceId === `observation:${observationPayload.data.id}`);
    assert.equal(deleteJob?.payload.observationId, observationPayload.data.id);
  });
});

test("search rebuild indexes calendar.events from core.sqlite", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-calendar-"));
  const dataRoot = path.join(workspaceRoot, "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const created = await runCliCapture([
      "calendar",
      "create",
      "--id",
      "event-search-review",
      "--title",
      "Search Architecture Review",
      "--starts-at",
      "2026-05-19T09:00:00.000Z",
      "--ends-at",
      "2026-05-19T10:00:00.000Z",
      "--calendar-id",
      "framework",
      "--metadata",
      JSON.stringify({ agenda: "Review fast path budgets and Search source coverage." }),
      "--data-dir",
      dataRoot,
      "--json",
    ], workspaceRoot);
    assert.equal(created.code, CLI_EXIT_OK);

    const jobs = await runCliCapture(["search", "jobs", "--source", "calendar.events", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(jobs.code, CLI_EXIT_OK);
    const jobsPayload = JSON.parse(jobs.stdout) as {
      data: { items: Array<{ operation: string; resourceId: string; shard: string; payload: { eventId?: string } }> };
    };
    const eventJob = jobsPayload.data.items.find((job) => job.resourceId === "event-search-review");
    assert.equal(eventJob?.operation, "upsert");
    assert.equal(eventJob?.shard, "hot");
    assert.equal(eventJob?.payload.eventId, "event-search-review");

    const rebuild = await runCliCapture(["search", "rebuild", "--source", "calendar.events", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(rebuild.code, CLI_EXIT_OK);
    const rebuildPayload = JSON.parse(rebuild.stdout) as {
      data: { sources: string[]; pendingSources: string[]; indexedBySource: { "calendar.events": number } };
    };
    assert.equal(rebuildPayload.data.sources.includes("calendar.events"), true);
    assert.equal(rebuildPayload.data.pendingSources.includes("calendar.events"), false);
    assert.equal(rebuildPayload.data.indexedBySource["calendar.events"], 1);

    const query = await runCliCapture([
      "search",
      "query",
      "architecture review",
      "--domains",
      "calendar",
      "--filters",
      JSON.stringify({ "metadata.calendarId": "framework" }),
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
        indexedFastPaths: { "calendar.events": number };
        results: Array<{
          source: string;
          domain: string;
          type: string;
          title: string;
          metadata?: { eventId?: string; calendarId?: string; startsAt?: string; endsAt?: string; source?: string; hasPage?: boolean };
          fragments?: Array<{ title?: string; snippet?: string }>;
          actions?: Array<{ id: string; kind: string }>;
          explanation?: { matchedBy?: string[] };
        }>;
        facets?: Array<{ id: string }>;
      };
    };
    assert.equal(queryPayload.data.indexedFastPaths["calendar.events"], 1);
    const result = queryPayload.data.results.find((entry) => entry.metadata?.eventId === "event-search-review");
    assert.equal(result?.source, "calendar.events");
    assert.equal(result?.domain, "calendar");
    assert.equal(result?.type, "event");
    assert.equal(result?.title, "Search Architecture Review");
    assert.equal(result?.metadata?.calendarId, "framework");
    assert.equal(result?.metadata?.startsAt, "2026-05-19T09:00:00.000Z");
    assert.equal(result?.metadata?.endsAt, "2026-05-19T10:00:00.000Z");
    assert.equal(result?.metadata?.source, "clawjs");
    assert.equal(result?.metadata?.hasPage, false);
    assert.equal(result?.fragments?.some((fragment) => fragment.title === "metadata" && fragment.snippet?.includes("fast path budgets")), true);
    assert.equal(result?.actions?.some((action) => action.id === "open" && action.kind === "open"), true);
    assert.ok(result?.explanation?.matchedBy?.length);
    assert.equal(queryPayload.data.facets?.some((facet) => facet.id === "calendarId"), true);

    const deleted = await runCliCapture(["calendar", "delete", "event-search-review", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleted.code, CLI_EXIT_OK);
    const deleteJobs = await runCliCapture(["search", "jobs", "--source", "calendar.events", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleteJobs.code, CLI_EXIT_OK);
    const deleteJobsPayload = JSON.parse(deleteJobs.stdout) as {
      data: { items: Array<{ operation: string; resourceId: string; payload: { eventId?: string } }> };
    };
    const deleteJob = deleteJobsPayload.data.items.find((job) => job.operation === "delete" && job.resourceId === "event-search-review");
    assert.equal(deleteJob?.payload.eventId, "event-search-review");
  });
});

test("search rebuild indexes finance.records with redacted previews", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-finance-"));
  const dataRoot = path.join(workspaceRoot, ".claw", "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const created = await runCliCapture([
      "transaction",
      "create",
      "Travel invoice for Search launch planning",
      "--amount-cents",
      "12945",
      "--currency",
      "USD",
      "--category",
      "travel",
      "--account-id",
      "acct-operating",
      "--json",
    ], workspaceRoot);
    assert.equal(created.code, CLI_EXIT_OK);
    const createdPayload = JSON.parse(created.stdout) as { data: { id: string } };

    const jobs = await runCliCapture(["search", "jobs", "--source", "finance.records", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(jobs.code, CLI_EXIT_OK);
    const jobsPayload = JSON.parse(jobs.stdout) as {
      data: { items: Array<{ operation: string; resourceId: string; shard: string; payload: { recordId?: string } }> };
    };
    const recordJob = jobsPayload.data.items.find((job) => job.resourceId === `main:transactions:${createdPayload.data.id}`);
    assert.equal(recordJob?.operation, "upsert");
    assert.equal(recordJob?.shard, "hot");
    assert.equal(recordJob?.payload.recordId, createdPayload.data.id);

    const rebuild = await runCliCapture(["search", "rebuild", "--source", "finance.records", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(rebuild.code, CLI_EXIT_OK);
    const rebuildPayload = JSON.parse(rebuild.stdout) as {
      data: { sources: string[]; pendingSources: string[]; indexedBySource: { "finance.records": number } };
    };
    assert.equal(rebuildPayload.data.sources.includes("finance.records"), true);
    assert.equal(rebuildPayload.data.pendingSources.includes("finance.records"), false);
    assert.equal(rebuildPayload.data.indexedBySource["finance.records"], 1);

    const query = await runCliCapture([
      "search",
      "query",
      "travel invoice",
      "--domains",
      "finance",
      "--filters",
      JSON.stringify({ "metadata.currency": "USD", redacted: true }),
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
        indexedFastPaths: { "finance.records": number };
        results: Array<{
          source: string;
          domain: string;
          type: string;
          title: string;
          snippet?: string;
          metadata?: { recordId?: string; kind?: string; accountId?: string; currency?: string; category?: string; sensitive?: boolean; legalOutputLabels?: string[] };
          fragments?: Array<{ title?: string; snippet?: string }>;
          permissions?: { redacted?: boolean; canPreview?: boolean };
          actions?: Array<{ id: string; kind: string; requiresApproval?: boolean }>;
          explanation?: { matchedBy?: string[] };
        }>;
        facets?: Array<{ id: string }>;
      };
    };
    assert.equal(queryPayload.data.indexedFastPaths["finance.records"], 1);
    const result = queryPayload.data.results.find((entry) => entry.metadata?.recordId === createdPayload.data.id);
    assert.equal(result?.source, "finance.records");
    assert.equal(result?.domain, "finance");
    assert.equal(result?.type, "transaction");
    assert.equal(result?.snippet, "[redacted]");
    assert.equal(result?.permissions?.redacted, true);
    assert.equal(result?.permissions?.canPreview, false);
    assert.deepEqual(result?.fragments ?? [], []);
    assert.equal(result?.metadata?.accountId, "acct-operating");
    assert.equal(result?.metadata?.currency, "USD");
    assert.equal(result?.metadata?.sensitive === true && ["not_professional_advice", "human_review_required", "regulated_domain:finance"].every((label) => result?.metadata?.legalOutputLabels?.includes(label)), true);
    assert.equal(result?.actions?.some((action) => action.id === "open" && action.kind === "open" && action.requiresApproval === true), true);
    assert.ok(result?.explanation?.matchedBy?.length);
    assert.equal(queryPayload.data.facets?.some((facet) => facet.id === "currency"), true);
    assert.equal(JSON.stringify(result).includes("Travel invoice"), false);
    assert.equal(JSON.stringify(result).includes("12945"), false);

    const deleted = await runCliCapture(["transaction", "delete", createdPayload.data.id, "--json"], workspaceRoot);
    assert.equal(deleted.code, CLI_EXIT_OK);
    const deleteJobs = await runCliCapture(["search", "jobs", "--source", "finance.records", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleteJobs.code, CLI_EXIT_OK);
    const deleteJobsPayload = JSON.parse(deleteJobs.stdout) as {
      data: { items: Array<{ operation: string; resourceId: string; payload: { recordId?: string } }> };
    };
    const deleteJob = deleteJobsPayload.data.items.find((job) => job.operation === "delete" && job.resourceId === `main:transactions:${createdPayload.data.id}`);
    assert.equal(deleteJob?.payload.recordId, createdPayload.data.id);
  });
});

test("search service indexes local finance_records with redacted previews", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-finance-local-"));
  const dataRoot = path.join(workspaceRoot, ".claw", "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const created = await runCliCapture([
      "finance",
      "upsert",
      "--id",
      "finance.local.invoice",
      "--amount",
      "88.50",
      "--currency",
      "USD",
      "--kind",
      "invoice",
      "--account-id",
      "acct-local",
      "--merchant",
      "Launch Vendor",
      "--category",
      "ops",
      "--notes",
      "Sensitive launch invoice evidence",
      "--data-dir",
      dataRoot,
      "--json",
    ], workspaceRoot);
    assert.equal(created.code, CLI_EXIT_OK);

    const jobs = await runCliCapture(["search", "jobs", "--source", "finance.records", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(jobs.code, CLI_EXIT_OK);
    const jobsPayload = JSON.parse(jobs.stdout) as {
      data: { items: Array<{ operation: string; resourceId: string; shard: string; payload: { table?: string; recordId?: string } }> };
    };
    const recordJob = jobsPayload.data.items.find((job) => job.resourceId === "finance_records:finance.local.invoice");
    assert.equal(recordJob?.operation, "upsert");
    assert.equal(recordJob?.shard, "hot");
    assert.equal(recordJob?.payload.table, "finance_records");
    assert.equal(recordJob?.payload.recordId, "finance.local.invoice");

    const serviceRun = await runCliCapture(["search", "service", "run-once", "--source", "finance.records", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(serviceRun.code, CLI_EXIT_OK);
    const serviceRunPayload = JSON.parse(serviceRun.stdout) as {
      data: { worker?: { items: Array<{ source: string; operation: string; status: string; indexed?: number }> } };
    };
    assert.equal(serviceRunPayload.data.worker?.items[0]?.source, "finance.records");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.operation, "upsert");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.status, "done");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.indexed, 1);

    const query = await runCliCapture([
      "search",
      "query",
      "sensitive launch invoice evidence",
      "--domains",
      "finance",
      "--filters",
      JSON.stringify({ "metadata.table": "finance_records", redacted: true }),
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
        indexedFastPaths: { "finance.records": number };
        results: Array<{
          source: string;
          domain: string;
          type: string;
          title: string;
          snippet?: string;
          metadata?: { recordId?: string; table?: string; kind?: string; accountId?: string; currency?: string; category?: string; sensitive?: boolean; hasLinkedPage?: boolean; legalOutputLabels?: string[] };
          fragments?: Array<{ title?: string; snippet?: string }>;
          permissions?: { redacted?: boolean; canPreview?: boolean };
          actions?: Array<{ id: string; kind: string; requiresApproval?: boolean }>;
          explanation?: { matchedBy?: string[] };
        }>;
      };
    };
    assert.equal(queryPayload.data.indexedFastPaths["finance.records"], 1);
    const result = queryPayload.data.results.find((entry) => entry.metadata?.recordId === "finance.local.invoice");
    assert.equal(result?.source, "finance.records");
    assert.equal(result?.domain, "finance");
    assert.equal(result?.type, "invoice");
    assert.equal(result?.snippet, "[redacted]");
    assert.equal(result?.permissions?.redacted, true);
    assert.equal(result?.permissions?.canPreview, false);
    assert.deepEqual(result?.fragments ?? [], []);
    assert.equal(result?.metadata?.table, "finance_records");
    assert.equal(result?.metadata?.accountId, "acct-local");
    assert.equal(result?.metadata?.currency, "USD");
    assert.equal(result?.metadata?.category, "ops");
    assert.equal(result?.metadata?.sensitive === true && ["not_professional_advice", "human_review_required", "regulated_domain:finance"].every((label) => result?.metadata?.legalOutputLabels?.includes(label)), true);
    assert.equal(result?.metadata?.hasLinkedPage, true);
    assert.equal(result?.actions?.some((action) => action.id === "open" && action.kind === "open" && action.requiresApproval === true), true);
    assert.ok(result?.explanation?.matchedBy?.length);
    assert.equal(JSON.stringify(result).includes("Sensitive launch invoice evidence"), false);
    assert.equal(JSON.stringify(result).includes("88.5"), false);

    const deleted = await runCliCapture(["finance", "delete", "--id", "finance.local.invoice", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleted.code, CLI_EXIT_OK, deleted.stderr || deleted.stdout);
    const deleteJobs = await runCliCapture(["search", "jobs", "--source", "finance.records", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleteJobs.code, CLI_EXIT_OK);
    const deleteJobsPayload = JSON.parse(deleteJobs.stdout) as {
      data: { items: Array<{ operation: string; resourceId: string; payload: { table?: string; recordId?: string } }> };
    };
    const deleteJob = deleteJobsPayload.data.items.find((job) => job.operation === "delete" && job.resourceId === "finance_records:finance.local.invoice");
    assert.equal(deleteJob?.payload.table, "finance_records");
    assert.equal(deleteJob?.payload.recordId, "finance.local.invoice");
  });
});

test("search service indexes ELN records from dense database writes", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-eln-"));
  const dataRoot = path.join(workspaceRoot, ".claw", "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const created = await runCliCapture([
      "db",
      "lab_notebooks",
      "create",
      "--data",
      JSON.stringify({
        id: "eln.notebook.search",
        title: "Dose Response Notebook",
        status: "active",
        studyId: "study-search",
        biologyExperimentId: "experiment-search",
        purpose: "ELN evidence for marker dose response search",
      }),
      "--json",
    ], workspaceRoot);
    assert.equal(created.code, CLI_EXIT_OK);
    const createdPayload = JSON.parse(created.stdout) as { data: { id: string } };

    const databaseJobs = await runCliCapture(["search", "jobs", "--source", "database.records", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(databaseJobs.code, CLI_EXIT_OK);
    assert.notEqual(JSON.parse(databaseJobs.stdout).data.items.length, 0, created.stdout);

    const jobs = await runCliCapture(["search", "jobs", "--source", "eln.records", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(jobs.code, CLI_EXIT_OK);
    const jobsPayload = JSON.parse(jobs.stdout) as {
      data: { items: Array<{ operation: string; resourceId: string; shard: string; payload: { namespaceId?: string; collection?: string; recordId?: string } }> };
    };
    const recordJob = jobsPayload.data.items.find((job) => job.resourceId === `main:lab_notebooks:${createdPayload.data.id}`);
    assert.equal(recordJob?.operation, "upsert", JSON.stringify({ eln: jobsPayload.data.items, database: JSON.parse(databaseJobs.stdout).data.items }));
    assert.equal(recordJob?.shard, "hot");
    assert.equal(recordJob?.payload.namespaceId, "main");
    assert.equal(recordJob?.payload.collection, "lab_notebooks");
    assert.equal(recordJob?.payload.recordId, createdPayload.data.id);

    const serviceRun = await runCliCapture(["search", "service", "run-once", "--source", "eln.records", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(serviceRun.code, CLI_EXIT_OK);
    const serviceRunPayload = JSON.parse(serviceRun.stdout) as {
      data: { worker?: { items: Array<{ source: string; operation: string; status: string; indexed?: number }> } };
    };
    assert.equal(serviceRunPayload.data.worker?.items[0]?.source, "eln.records");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.operation, "upsert");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.status, "done");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.indexed, 1);

    const query = await runCliCapture([
      "search",
      "query",
      "marker dose response",
      "--domains",
      "eln",
      "--filters",
      JSON.stringify({ "metadata.collection": "lab_notebooks" }),
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
        indexedFastPaths: { "eln.records": number };
        results: Array<{
          source: string;
          domain: string;
          type: string;
          title: string;
          snippet?: string;
          metadata?: { recordId?: string; collection?: string; status?: string; studyId?: string; experimentId?: string; sensitive?: boolean; legalOutputLabels?: string[] };
          fragments?: Array<{ title?: string; snippet?: string }>;
          permissions?: { redacted?: boolean; canPreview?: boolean };
          actions?: Array<{ id: string; kind: string }>;
          explanation?: { matchedBy?: string[] };
        }>;
      };
    };
    assert.equal(queryPayload.data.indexedFastPaths["eln.records"], 1);
    const result = queryPayload.data.results.find((entry) => entry.metadata?.recordId === createdPayload.data.id);
    assert.equal(result?.source, "eln.records");
    assert.equal(result?.domain, "eln");
    assert.equal(result?.type, "lab_notebook");
    assert.equal(result?.title, "Dose Response Notebook");
    assert.equal(result?.metadata?.collection, "lab_notebooks");
    assert.equal(result?.metadata?.status, "active");
    assert.equal(result?.metadata?.studyId, "study-search");
    assert.equal(result?.metadata?.experimentId, "experiment-search");
    assert.equal(result?.metadata?.sensitive === false && ["not_professional_advice", "human_review_required", "regulated_domain:labs_research"].every((label) => result?.metadata?.legalOutputLabels?.includes(label)), true);
    assert.equal(result?.permissions?.redacted, false);
    assert.equal(result?.permissions?.canPreview, true);
    assert.equal(result?.snippet?.includes("Dose Response") || result?.fragments?.some((fragment) => fragment.snippet?.includes("Dose Response")), true);
    assert.equal(result?.actions?.some((action) => action.id === "open" && action.kind === "open"), true);
    assert.ok(result?.explanation?.matchedBy?.length);

    const deleted = await runCliCapture(["db", "lab_notebooks", "delete", createdPayload.data.id, "--json"], workspaceRoot);
    assert.equal(deleted.code, CLI_EXIT_OK);
    const deleteJobs = await runCliCapture(["search", "jobs", "--source", "eln.records", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleteJobs.code, CLI_EXIT_OK);
    const deleteJobsPayload = JSON.parse(deleteJobs.stdout) as {
      data: { items: Array<{ operation: string; resourceId: string; payload: { collection?: string; recordId?: string } }> };
    };
    const deleteJob = deleteJobsPayload.data.items.find((job) => job.operation === "delete" && job.resourceId === `main:lab_notebooks:${createdPayload.data.id}`);
    assert.equal(deleteJob?.payload.collection, "lab_notebooks");
    assert.equal(deleteJob?.payload.recordId, createdPayload.data.id);
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
    const imageRecordDir = path.join(workspaceRoot, ".claw", "data", "collections", "images");
    const imageRecordFile = fs.readdirSync(imageRecordDir)
      .map((entry) => path.join(imageRecordDir, entry))
      .find((entry) => entry.endsWith(".json") && (JSON.parse(fs.readFileSync(entry, "utf8")) as { id?: string }).id === importedPayload.data.id);
    assert.ok(imageRecordFile);
    const imageRecord = JSON.parse(fs.readFileSync(imageRecordFile, "utf8")) as Record<string, unknown>;
    fs.writeFileSync(imageRecordFile, JSON.stringify({
      ...imageRecord,
      ocrText: "LAUNCH SYSTEM MARK",
      visionLabels: ["product mark", "blue badge"],
      vision: {
        caption: "Blue launch badge on a clean product surface",
        objects: [{ name: "badge" }, { label: "wordmark" }],
      },
    }, null, 2));

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
          metadata?: { imageType?: string; provenance?: string; tag?: string[]; ocrTextIndexed?: boolean; visionLabel?: string[]; visionObject?: string[]; caption?: string };
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
    assert.equal(result?.metadata?.ocrTextIndexed, true);
    assert.deepEqual(result?.metadata?.visionLabel, ["product mark", "blue badge"]);
    assert.deepEqual(result?.metadata?.visionObject, ["badge", "wordmark"]);
    assert.equal(result?.metadata?.caption, "Blue launch badge on a clean product surface");
    assert.equal(result?.actions?.some((action) => action.id === "open" && action.requiresApproval === true && action.grant === "search.images.open"), true);
    assert.equal(result?.fragments?.some((fragment) => fragment.title === "prompt" && fragment.snippet?.includes("product mark")), true);
    assert.equal(result?.fragments?.some((fragment) => fragment.title === "ocr text" && fragment.snippet?.includes("LAUNCH SYSTEM MARK")), true);
    assert.equal(result?.fragments?.some((fragment) => fragment.title === "vision labels" && fragment.snippet?.includes("blue badge")), true);
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
  fs.writeFileSync(path.join(mediaDir, "media-demo-audio.json"), JSON.stringify({
    mediaId: "media-demo-audio",
    name: "Planning Call.wav",
    mimeType: "audio/wav",
    kind: "audio",
    origin: "recorded",
    direction: "inbound",
    workspaceId: "workspace-demo",
    projectId: "project-search",
    sessionId: "session-media",
    transcription: {
      text: "Transcript mentions async extractor scheduling and budgeted media indexing.",
      language: "en",
      segments: [
        { text: "async extractor scheduling" },
        { text: "budgeted media indexing" },
      ],
    },
    createdAt: "2026-05-17T11:00:00.000Z",
    updatedAt: "2026-05-17T11:00:00.000Z",
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
    assert.equal(rebuildPayload.data.indexedBySource["media.assets"], 2);

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
          metadata?: { kind?: string; project?: string; sessionId?: string; transcriptionIndexed?: boolean; transcriptionLanguage?: string; transcriptionSegmentCount?: number };
          actions?: Array<{ id: string; kind: string; requiresApproval?: boolean; grant?: string }>;
          fragments?: Array<{ title?: string; snippet?: string }>;
          explanation?: { matchedBy?: string[] };
        }>;
        facets?: Array<{ id: string; label: string }>;
      };
    };
    assert.equal(queryPayload.data.indexedFastPaths["media.assets"], 2);
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

    const transcriptQuery = await runCliCapture([
      "search",
      "query",
      "async extractor scheduling",
      "--domains",
      "media",
      "--filters",
      "metadata.kind=audio",
      "--workspace",
      workspaceRoot,
      "--data-dir",
      dataRoot,
      "--json",
      "--limit",
      "5",
    ], workspaceRoot);
    assert.equal(transcriptQuery.code, CLI_EXIT_OK);
    const transcriptPayload = JSON.parse(transcriptQuery.stdout) as {
      data: {
        results: Array<{
          title: string;
          metadata?: { transcriptionIndexed?: boolean; transcriptionLanguage?: string; transcriptionSegmentCount?: number };
          fragments?: Array<{ title?: string; snippet?: string }>;
        }>;
      };
    };
    const audioResult = transcriptPayload.data.results.find((candidate) => candidate.title === "Planning Call.wav");
    assert.equal(audioResult?.metadata?.transcriptionIndexed, true);
    assert.equal(audioResult?.metadata?.transcriptionLanguage, "en");
    assert.equal(audioResult?.metadata?.transcriptionSegmentCount, 2);
    const transcriptFragment = audioResult?.fragments?.find((fragment) => fragment.title === "transcription");
    assert.equal(transcriptFragment?.snippet?.includes("async extractor scheduling"), true);
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

test("generations create and delete schedule Search artifact events", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-generation-events-"));
  const dataRoot = path.join(workspaceRoot, "data");
  const scriptPath = createFakeGenerationScript();
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const registered = await runCliCapture([
      "generations",
      "register-command",
      "--workspace",
      workspaceRoot,
      "--id",
      "fake-image",
      "--label",
      "Fake Image",
      "--kinds",
      "image",
      "--command",
      scriptPath,
      "--args-json",
      "[\"--out\",\"{outputPath}\"]",
      "--ext",
      "png",
      "--json",
    ], workspaceRoot);
    assert.equal(registered.code, CLI_EXIT_OK);

    const created = await runCliCapture([
      "generations",
      "create",
      "--workspace",
      workspaceRoot,
      "--data-dir",
      dataRoot,
      "--kind",
      "image",
      "--backend",
      "fake-image",
      "--prompt",
      "evented generation search artifact",
      "--json",
    ], workspaceRoot);
    assert.equal(created.code, CLI_EXIT_OK);
    const createdPayload = JSON.parse(created.stdout) as { data: { id: string } };
    assert.match(createdPayload.data.id, /^gen-/);

    const upsertJobs = await runCliCapture(["search", "jobs", "--source", "generations.artifacts", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(upsertJobs.code, CLI_EXIT_OK);
    const upsertJobsPayload = JSON.parse(upsertJobs.stdout) as {
      data: { items: Array<{ source: string; operation: string; resourceId: string; shard: string; payload: { eventDriven?: boolean; generationId?: string } }> };
    };
    const upsertJob = upsertJobsPayload.data.items.find((job) => job.resourceId === createdPayload.data.id && job.operation === "upsert");
    assert.equal(upsertJob?.source, "generations.artifacts");
    assert.equal(upsertJob?.shard, "hot");
    assert.equal(upsertJob?.payload.eventDriven, true);
    assert.equal(upsertJob?.payload.generationId, createdPayload.data.id);

    const deleted = await runCliCapture([
      "generations",
      "delete",
      "--workspace",
      workspaceRoot,
      "--data-dir",
      dataRoot,
      "--id",
      createdPayload.data.id,
      "--json",
    ], workspaceRoot);
    assert.equal(deleted.code, CLI_EXIT_OK);

    const deleteJobs = await runCliCapture(["search", "jobs", "--source", "generations.artifacts", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleteJobs.code, CLI_EXIT_OK);
    const deleteJobsPayload = JSON.parse(deleteJobs.stdout) as {
      data: { items: Array<{ operation: string; priority: number; resourceId: string; payload: { eventDriven?: boolean; generationId?: string } }> };
    };
    const deleteJob = deleteJobsPayload.data.items.find((job) => job.resourceId === createdPayload.data.id && job.operation === "delete");
    assert.equal(deleteJob?.priority, 80);
    assert.equal(deleteJob?.payload.eventDriven, true);
    assert.equal(deleteJob?.payload.generationId, createdPayload.data.id);
  });
});

test("image create and delete schedule Search image events", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-image-events-"));
  const dataRoot = path.join(workspaceRoot, "data");
  const scriptPath = createFakeGenerationScript();
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const registered = await runCliCapture([
      "generations",
      "register-command",
      "--workspace",
      workspaceRoot,
      "--id",
      "fake-image",
      "--label",
      "Fake Image",
      "--kinds",
      "image",
      "--command",
      scriptPath,
      "--args-json",
      "[\"--out\",\"{outputPath}\"]",
      "--ext",
      "png",
      "--json",
    ], workspaceRoot);
    assert.equal(registered.code, CLI_EXIT_OK);

    const created = await runCliCapture([
      "image",
      "create",
      "--workspace",
      workspaceRoot,
      "--data-dir",
      dataRoot,
      "--backend",
      "fake-image",
      "--prompt",
      "evented image search artifact",
      "--json",
    ], workspaceRoot);
    assert.equal(created.code, CLI_EXIT_OK);
    const createdPayload = JSON.parse(created.stdout) as { data: { id: string } };
    assert.match(createdPayload.data.id, /^img-/);

    const upsertJobs = await runCliCapture(["search", "jobs", "--source", "images.derived", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(upsertJobs.code, CLI_EXIT_OK);
    const upsertJobsPayload = JSON.parse(upsertJobs.stdout) as {
      data: { items: Array<{ source: string; operation: string; resourceId: string; shard: string; payload: { eventDriven?: boolean; imageId?: string } }> };
    };
    const upsertJob = upsertJobsPayload.data.items.find((job) => job.resourceId === createdPayload.data.id && job.operation === "upsert");
    assert.equal(upsertJob?.source, "images.derived");
    assert.equal(upsertJob?.shard, "hot");
    assert.equal(upsertJob?.payload.eventDriven, true);
    assert.equal(upsertJob?.payload.imageId, createdPayload.data.id);

    const deleted = await runCliCapture([
      "image",
      "delete",
      "--workspace",
      workspaceRoot,
      "--data-dir",
      dataRoot,
      "--id",
      createdPayload.data.id,
      "--json",
    ], workspaceRoot);
    assert.equal(deleted.code, CLI_EXIT_OK);

    const deleteJobs = await runCliCapture(["search", "jobs", "--source", "images.derived", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleteJobs.code, CLI_EXIT_OK);
    const deleteJobsPayload = JSON.parse(deleteJobs.stdout) as {
      data: { items: Array<{ operation: string; priority: number; resourceId: string; payload: { eventDriven?: boolean; imageId?: string } }> };
    };
    const deleteJob = deleteJobsPayload.data.items.find((job) => job.resourceId === createdPayload.data.id && job.operation === "delete");
    assert.equal(deleteJob?.priority, 80);
    assert.equal(deleteJob?.payload.eventDriven, true);
    assert.equal(deleteJob?.payload.imageId, createdPayload.data.id);
  });
});

test("typed media generation schedules Search media asset events", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-media-events-"));
  const dataRoot = path.join(workspaceRoot, "data");
  const scriptPath = createFakeGenerationScript();
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const registered = await runCliCapture([
      "generations",
      "register-command",
      "--workspace",
      workspaceRoot,
      "--id",
      "fake-audio",
      "--label",
      "Fake Audio",
      "--kinds",
      "audio",
      "--command",
      scriptPath,
      "--args-json",
      "[\"--out\",\"{outputPath}\"]",
      "--ext",
      "mp3",
      "--json",
    ], workspaceRoot);
    assert.equal(registered.code, CLI_EXIT_OK);

    const created = await runCliCapture([
      "generations",
      "create",
      "--workspace",
      workspaceRoot,
      "--data-dir",
      dataRoot,
      "--kind",
      "audio",
      "--backend",
      "fake-audio",
      "--prompt",
      "evented audio search asset",
      "--json",
    ], workspaceRoot);
    assert.equal(created.code, CLI_EXIT_OK);
    const createdPayload = JSON.parse(created.stdout) as { data: { id: string } };
    assert.match(createdPayload.data.id, /^gen-/);

    const generationJobs = await runCliCapture(["search", "jobs", "--source", "generations.artifacts", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(generationJobs.code, CLI_EXIT_OK);
    const generationJobsPayload = JSON.parse(generationJobs.stdout) as {
      data: { items: Array<{ operation: string; resourceId: string; payload: { eventDriven?: boolean; generationId?: string } }> };
    };
    const generationJob = generationJobsPayload.data.items.find((job) => job.resourceId === createdPayload.data.id && job.operation === "upsert");
    assert.equal(generationJob?.payload.eventDriven, true);
    assert.equal(generationJob?.payload.generationId, createdPayload.data.id);

    const mediaJobs = await runCliCapture(["search", "jobs", "--source", "media.assets", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(mediaJobs.code, CLI_EXIT_OK);
    const mediaJobsPayload = JSON.parse(mediaJobs.stdout) as {
      data: { items: Array<{ operation: string; resourceId: string; shard: string; payload: { eventDriven?: boolean; mediaId?: string } }> };
    };
    const mediaJob = mediaJobsPayload.data.items.find((job) => job.operation === "upsert");
    assert.match(mediaJob?.resourceId ?? "", /^media-/);
    assert.equal(mediaJob?.shard, "hot");
    assert.equal(mediaJob?.payload.eventDriven, true);
    assert.equal(mediaJob?.payload.mediaId, mediaJob?.resourceId);

    const deleted = await runCliCapture([
      "generations",
      "delete",
      "--workspace",
      workspaceRoot,
      "--data-dir",
      dataRoot,
      "--id",
      createdPayload.data.id,
      "--json",
    ], workspaceRoot);
    assert.equal(deleted.code, CLI_EXIT_OK);

    const deletedMediaJobs = await runCliCapture(["search", "jobs", "--source", "media.assets", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deletedMediaJobs.code, CLI_EXIT_OK);
    const deletedMediaJobsPayload = JSON.parse(deletedMediaJobs.stdout) as {
      data: { items: Array<{ operation: string; priority: number; resourceId: string; payload: { eventDriven?: boolean; mediaId?: string } }> };
    };
    const deletedMediaJob = deletedMediaJobsPayload.data.items.find((job) => job.resourceId === mediaJob?.resourceId && job.operation === "delete");
    assert.equal(deletedMediaJob?.priority, 80);
    assert.equal(deletedMediaJob?.payload.eventDriven, true);
    assert.equal(deletedMediaJob?.payload.mediaId, mediaJob?.resourceId);
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

test("search rebuild can refresh one shard without clearing sibling shard fast paths", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-shard-rebuild-"));
  const dataRoot = path.join(workspaceRoot, "data");

  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const store = new SearchStore(path.join(dataRoot, "search.sqlite"));
    try {
      store.registerSource(createFrameworkSearchSourceManifest({
        id: "images.derived",
        domain: "images",
        name: "Images",
        resultTypes: ["image"],
      }));
      store.upsertDocument({
        id: "images.derived:hot:gallery",
        source: "images.derived",
        shard: "hot",
        domain: "images",
        type: "image",
        resourceId: "hot-gallery",
        title: "Hot Gallery",
        body: "hot gallery preview remains searchable",
        updatedAt: "2026-05-17T12:00:00.000Z",
      });
      store.upsertDocument({
        id: "images.derived:cold:archive",
        source: "images.derived",
        shard: "cold",
        domain: "images",
        type: "image",
        resourceId: "cold-archive",
        title: "Cold Archive",
        body: "cold archive entry should be cleared",
        updatedAt: "2026-05-17T12:00:00.000Z",
      });
    } finally {
      store.close();
    }

    const missingSource = await runCliCapture(["search", "rebuild", "--shard", "cold", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(missingSource.code, CLI_EXIT_USAGE);
    const missingSourcePayload = JSON.parse(missingSource.stdout) as { error: { code: string } };
    assert.equal(missingSourcePayload.error.code, "missing_source");

    const shardRebuild = await runCliCapture([
      "search",
      "rebuild",
      "--source",
      "images.derived",
      "--shard",
      "cold",
      "--workspace",
      workspaceRoot,
      "--data-dir",
      dataRoot,
      "--json",
    ], workspaceRoot);
    assert.equal(shardRebuild.code, CLI_EXIT_OK, JSON.stringify(shardRebuild));
    const shardPayload = JSON.parse(shardRebuild.stdout) as {
      data: {
        mode: string;
        selectedSources: string[];
        selectedShards: string[];
        indexedBySource: { "images.derived": number };
      };
    };
    assert.equal(shardPayload.data.mode, "shard_scoped");
    assert.deepEqual(shardPayload.data.selectedSources, ["images.derived"]);
    assert.deepEqual(shardPayload.data.selectedShards, ["cold"]);
    assert.equal(shardPayload.data.indexedBySource["images.derived"], 0);

    const verified = new SearchStore(path.join(dataRoot, "search.sqlite"));
    try {
      assert.deepEqual(verified.listShards({ source: "images.derived" }).map((shard) => [shard.shard, shard.state, shard.documentCount]), [
        ["cold", "empty", 0],
        ["hot", "active", 1],
      ]);
      assert.deepEqual(verified.query({ query: "hot gallery", sources: ["images.derived"], shards: ["hot"] }).results.map((result) => result.id), ["images.derived:hot:gallery"]);
      assert.deepEqual(verified.query({ query: "cold archive", sources: ["images.derived"], shards: ["cold"] }).results, []);
    } finally {
      verified.close();
    }
  });
});

test("search rebuild can enqueue background shard rebuilds for the service worker", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-background-rebuild-"));
  const dataRoot = path.join(workspaceRoot, "data");

  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const store = new SearchStore(path.join(dataRoot, "search.sqlite"));
    try {
      store.registerSource(createFrameworkSearchSourceManifest({
        id: "images.derived",
        domain: "images",
        name: "Images",
        resultTypes: ["image"],
      }));
      store.upsertDocument({
        id: "images.derived:hot:background",
        source: "images.derived",
        shard: "hot",
        domain: "images",
        type: "image",
        resourceId: "hot-background",
        title: "Hot Background Gallery",
        body: "hot background gallery remains searchable",
        updatedAt: "2026-05-17T12:00:00.000Z",
      });
      store.upsertDocument({
        id: "images.derived:cold:background",
        source: "images.derived",
        shard: "cold",
        domain: "images",
        type: "image",
        resourceId: "cold-background",
        title: "Cold Background Archive",
        body: "cold background archive should be cleared by worker",
        updatedAt: "2026-05-17T12:00:00.000Z",
      });
    } finally {
      store.close();
    }

    const queued = await runCliCapture([
      "search",
      "rebuild",
      "--source",
      "images.derived",
      "--shard",
      "cold",
      "--enqueue",
      "--workspace",
      workspaceRoot,
      "--data-dir",
      dataRoot,
      "--json",
    ], workspaceRoot);
    assert.equal(queued.code, CLI_EXIT_OK);
    const queuedPayload = JSON.parse(queued.stdout) as {
      data: {
        rebuilt: boolean;
        enqueued: boolean;
        mode: string;
        jobs: Array<{ id: string; source: string; shard: string; operation: string; status: string }>;
      };
    };
    assert.equal(queuedPayload.data.rebuilt, false);
    assert.equal(queuedPayload.data.enqueued, true);
    assert.equal(queuedPayload.data.mode, "queued_shard_scoped");
    assert.deepEqual(queuedPayload.data.jobs.map((job) => ({ source: job.source, shard: job.shard, operation: job.operation, status: job.status })), [
      { source: "images.derived", shard: "cold", operation: "rebuild", status: "queued" },
    ]);

    const serviceRun = await runCliCapture([
      "search",
      "service",
      "run-once",
      "--source",
      "images.derived",
      "--shard",
      "cold",
      "--workspace",
      workspaceRoot,
      "--data-dir",
      dataRoot,
      "--json",
    ], workspaceRoot);
    assert.equal(serviceRun.code, CLI_EXIT_OK);
    const servicePayload = JSON.parse(serviceRun.stdout) as {
      data: { service: { worker?: { claimed: number; completed: number; items: Array<{ source: string; operation: string; status: string; indexed?: number }> } } };
    };
    assert.equal(servicePayload.data.service.worker?.claimed, 1);
    assert.equal(servicePayload.data.service.worker?.completed, 1);
    assert.deepEqual(servicePayload.data.service.worker?.items.map((item) => ({ source: item.source, operation: item.operation, status: item.status, indexed: item.indexed })), [
      { source: "images.derived", operation: "rebuild", status: "done", indexed: 0 },
    ]);

    const verified = new SearchStore(path.join(dataRoot, "search.sqlite"));
    try {
      assert.deepEqual(verified.listShards({ source: "images.derived" }).map((shard) => [shard.shard, shard.state, shard.documentCount]), [
        ["cold", "empty", 0],
        ["hot", "active", 1],
      ]);
      assert.deepEqual(verified.query({ query: "hot background", sources: ["images.derived"], shards: ["hot"] }).results.map((result) => result.id), ["images.derived:hot:background"]);
      assert.deepEqual(verified.query({ query: "cold background", sources: ["images.derived"], shards: ["cold"] }).results, []);
    } finally {
      verified.close();
    }
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

    const semanticQuery = await runCliCapture([
      "search",
      "query",
      "makeNeedleSymbol enabled",
      "--domains",
      "code",
      "--strategy",
      "semantic",
      "--embedding-model",
      "local-text-v1",
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
    assert.equal(semanticQuery.code, CLI_EXIT_OK);
    const semanticPayload = JSON.parse(semanticQuery.stdout) as {
      data: { results: Array<{ source: string; title: string; explanation?: { matchedBy?: string[]; scoreBreakdown?: { semantic?: number } } }> };
    };
    const semanticResult = semanticPayload.data.results.find((candidate) => candidate.title === "feature-search.ts");
    assert.equal(semanticResult?.source, "code.symbols");
    assert.equal(semanticResult?.explanation?.matchedBy?.includes("semantic"), true);
    assert.ok((semanticResult?.explanation?.scoreBreakdown?.semantic ?? 0) > 0);

    const chatOnly = await runCliCapture(["search", "query", "makeNeedleSymbol", "--domains", "sessions", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(chatOnly.code, CLI_EXIT_DEGRADED);
    const chatOnlyPayload = JSON.parse(chatOnly.stdout) as {
      data: { indexedFastPaths: Record<string, number>; results: unknown[] };
    };
    assert.equal("code.symbols" in chatOnlyPayload.data.indexedFastPaths, false);
    assert.deepEqual(chatOnlyPayload.data.results, []);
  });
});

test("code.symbols event jobs refresh and tombstone individual files", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-code-events-"));
  const dataRoot = path.join(workspaceRoot, "data");
  const sourceRoot = path.join(workspaceRoot, "project");
  const filePath = path.join(sourceRoot, "src", "event-refresh.ts");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, [
    "export function eventDrivenNeedle() {",
    "  return \"code-symbol-event-ready\";",
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
    const scheduled = scheduleCodeSymbolsSearchEvent({
      operation: "upsert",
      root: sourceRoot,
      filePath,
      dataDir: dataRoot,
      flags: { "code-root": sourceRoot },
    });
    assert.equal(scheduled.ok, true, scheduled.error);
    assert.equal(scheduled.job?.source, "code.symbols");
    assert.equal(scheduled.job?.operation, "upsert");
    assert.equal(scheduled.job?.resourceId, "src/event-refresh.ts");
    assert.equal(scheduled.job?.shard, "hot");
    assert.equal(scheduled.job?.payload.eventDriven, true);
    assert.equal(scheduled.job?.payload.relativePath, "src/event-refresh.ts");

    const serviceRun = await runCliCapture(["search", "service", "run-once", "--source", "code.symbols", "--data-dir", dataRoot, "--code-root", sourceRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(serviceRun.code, CLI_EXIT_OK);

    const query = await runCliCapture(["search", "query", "eventDrivenNeedle", "--domains", "code", "--data-dir", dataRoot, "--code-root", sourceRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as {
      data: { results: Array<{ source: string; domain: string; title: string; resourceId?: string; fragments?: Array<{ title?: string }> }> };
    };
    const result = queryPayload.data.results.find((entry) => entry.title === "event-refresh.ts");
    assert.equal(result?.source, "code.symbols");
    assert.equal(result?.domain, "code");
    assert.equal(result?.resourceId, "src/event-refresh.ts");
    assert.equal(result?.fragments?.some((fragment) => fragment.title === "function eventDrivenNeedle"), true);

    fs.rmSync(filePath);
    const deleted = scheduleCodeSymbolsSearchEvent({
      operation: "delete",
      root: sourceRoot,
      filePath,
      dataDir: dataRoot,
      flags: { "code-root": sourceRoot },
    });
    assert.equal(deleted.ok, true, deleted.error);

    const deleteRun = await runCliCapture(["search", "service", "run-once", "--source", "code.symbols", "--data-dir", dataRoot, "--code-root", sourceRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(deleteRun.code, CLI_EXIT_OK);

    const afterDelete = await runCliCapture(["search", "query", "eventDrivenNeedle", "--domains", "code", "--data-dir", dataRoot, "--code-root", sourceRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(afterDelete.code, CLI_EXIT_DEGRADED);
    const afterDeletePayload = JSON.parse(afterDelete.stdout) as { data: { results: unknown[] } };
    assert.deepEqual(afterDeletePayload.data.results, []);
  });
});

test("search keeps optional full sources out of scoped domain queries", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-scoped-full-"));
  const dataRoot = path.join(workspaceRoot, "data");
  const fileRoot = path.join(workspaceRoot, "file-root");
  const webRoot = path.join(workspaceRoot, "web-root");
  const externalRoot = path.join(workspaceRoot, "external-root");
  fs.mkdirSync(path.join(fileRoot, "docs"), { recursive: true });
  fs.mkdirSync(webRoot, { recursive: true });
  fs.mkdirSync(externalRoot, { recursive: true });
  fs.writeFileSync(path.join(fileRoot, "docs", "sentinel.txt"), "Optional full source sentinel from local files.");
  fs.writeFileSync(path.join(webRoot, "sentinel.html"), "<html><body>Optional full source sentinel from web ingestion.</body></html>");
  fs.writeFileSync(path.join(externalRoot, "sentinel.json"), JSON.stringify({
    provider: "fixture",
    type: "thread",
    title: "Optional full source sentinel",
    text: "Optional full source sentinel from external cache.",
  }));

  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const query = await runCliCapture([
      "search",
      "query",
      "Optional full source sentinel",
      "--domains",
      "sessions",
      "--profile",
      "full",
      "--file-root",
      fileRoot,
      "--web-root",
      webRoot,
      "--external-root",
      externalRoot,
      "--data-dir",
      dataRoot,
      "--json",
      "--limit",
      "5",
    ], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_DEGRADED);
    const queryPayload = JSON.parse(query.stdout) as {
      data: {
        indexedFastPaths: Record<string, number>;
        results: Array<{ source: string }>;
      };
    };
    assert.equal("local.files" in queryPayload.data.indexedFastPaths, false);
    assert.equal("web.ingested" in queryPayload.data.indexedFastPaths, false);
    assert.equal("external.cache" in queryPayload.data.indexedFastPaths, false);
    assert.equal(queryPayload.data.results.some((result) => result.source === "local.files" || result.source === "web.ingested" || result.source === "external.cache"), false);

    const verified = new SearchStore(path.join(dataRoot, "search.sqlite"));
    try {
      assert.deepEqual(verified.query({
        query: "Optional full source sentinel",
        sources: ["local.files", "web.ingested", "external.cache"],
      }).results, []);
    } finally {
      verified.close();
    }
  });
});
