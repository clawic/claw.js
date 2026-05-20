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
