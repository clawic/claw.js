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
