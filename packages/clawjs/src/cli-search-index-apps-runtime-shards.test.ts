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
    const appUpsert = await runInternalV1Cli(["apps", "upsert", "canvas-lab", "--name", "Canvas Lab", "--description", "Interactive canvas prototyping app", "--path", path.join(workspaceRoot, "apps", "canvas-lab"), "--manifest", JSON.stringify({ category: "design", entrypoint: "index.html", summary: "app-manifest-fragment-needle", credentials: { apiKey: "app-manifest-secret-never-index" } }), "--permissions", JSON.stringify({ grant: "canvas.write", note: "app-permissions-fragment-needle", credentials: { token: "app-permission-secret-never-index" } }), "--pinned", "true", "--json"], { stdout: captureStream().stream, stderr: captureStream().stream, cwd: workspaceRoot });
    assert.equal(appUpsert, CLI_EXIT_OK);
    const designUpsert = await runInternalV1Cli(["design", "upsert", "template", "deck-template", "--name", "Launch Deck Template", "--manifest", JSON.stringify({ tags: ["launch", "slides"], format: "pptx", notes: "design-manifest-fragment-needle", credentials: { apiKey: "design-secret-never-index" } }), "--builtin", "true", "--json"], { stdout: captureStream().stream, stderr: captureStream().stream, cwd: workspaceRoot });
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
    const appResult = appQueryPayload.data.results.find((entry) => entry.title === "Canvas Lab");
    assert.deepEqual({ source: appResult?.source, domain: appResult?.domain, type: appResult?.type, slug: appResult?.metadata?.slug, pinned: appResult?.metadata?.pinned }, { source: "apps.catalog", domain: "apps", type: "app", slug: "canvas-lab", pinned: true });
    assert.equal(appResult?.fragments?.some((fragment) => fragment.title === "manifest" && fragment.snippet?.includes("app-manifest-fragment-needle")), true);
    assert.equal(appResult?.fragments?.some((fragment) => fragment.title === "permissions" && fragment.snippet?.includes("app-permissions-fragment-needle")), true);
    assert.equal(JSON.stringify(appQueryPayload.data.results).includes("app-manifest-secret-never-index"), false);
    assert.equal(JSON.stringify(appQueryPayload.data.results).includes("app-permission-secret-never-index"), false);
    const appPermissionsQuery = await runCliCapture(["search", "query", "app-permissions-fragment-needle", "--sources", "apps.catalog", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(appPermissionsQuery.code, CLI_EXIT_OK);
    const appPermissionsPayload = JSON.parse(appPermissionsQuery.stdout) as any;
    const appPermissionsResult = appPermissionsPayload.data.results.find((entry) => entry.title === "Canvas Lab");
    assert.equal(appPermissionsResult?.fragments?.some((fragment) => fragment.title === "permissions" && fragment.snippet?.includes("app-permissions-fragment-needle")), true);
    assert.equal(JSON.stringify(appPermissionsPayload.data.results).includes("app-permission-secret-never-index"), false);
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
    const designResult = designQueryPayload.data.results.find((entry) => entry.title === "Launch Deck Template");
    assert.deepEqual({ source: designResult?.source, domain: designResult?.domain, type: designResult?.type, kind: designResult?.metadata?.kind, builtin: designResult?.metadata?.builtin }, { source: "design.resources", domain: "design", type: "template", kind: "template", builtin: true });
    assert.equal(designResult?.fragments?.some((fragment) => fragment.title === "manifest" && fragment.snippet?.includes("design-manifest-fragment-needle")), true);
    assert.equal(JSON.stringify(designQueryPayload.data.results).includes("design-secret-never-index"), false);
    const designManifestQuery = await runCliCapture(["search", "query", "design-manifest-fragment-needle", "--sources", "design.resources", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(designManifestQuery.code, CLI_EXIT_OK);
    const designManifestPayload = JSON.parse(designManifestQuery.stdout) as any;
    const designManifestResult = designManifestPayload.data.results.find((entry) => entry.title === "Launch Deck Template");
    assert.equal(designManifestResult?.fragments?.some((fragment) => fragment.title === "manifest" && fragment.snippet?.includes("design-manifest-fragment-needle")), true);
    assert.equal(JSON.stringify(designManifestPayload.data.results).includes("design-secret-never-index"), false);
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
      `).run("job-runtime-worker", "search-worker", "Search worker backfill", "queued", null, now, 0, JSON.stringify({ shard: "cold", source: "documents.blocks", marker: "runtime-payload-fragment-needle", credentials: { token: "runtime-payload-secret-never-index" } }), now, now);
      runtimeDb.prepare(`
        INSERT INTO runtime_events (id, job_id, kind, level, message, created_at, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run("event-runtime-worker", "job-runtime-worker", "worker", "error", "Search worker failed during cold shard backfill", now, JSON.stringify({ source: "documents.blocks", shard: "cold", marker: "runtime-metadata-fragment-needle", credentials: { apiKey: "runtime-metadata-secret-never-index" } }));
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
      `).run("monitor-runtime-lag", "uptime", "warn", "Runtime queue lag exceeded threshold", now, JSON.stringify({ queue: "search", lagMs: 1200, marker: "operational-metadata-fragment-needle", credentials: { token: "operational-secret-never-index" } }));
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
    const result = queryPayload.data.results.find((entry) => entry.title.includes("Search worker failed"));
    assert.equal(result?.source, "runtime.events");
    assert.equal(result?.domain, "runtime");
    assert.equal(result?.type, "event");
    assert.equal(result?.metadata?.kind, "worker");
    assert.equal(result?.metadata?.level, "error");
    assert.equal(result?.metadata?.jobId, "job-runtime-worker");
    assert.equal(result?.metadata?.sidecar, "runtime.sqlite");
    assert.equal(result?.fragments?.some((fragment) => fragment.title === "metadata" && fragment.snippet?.includes("documents.blocks")), true);
    assert.equal(result?.fragments?.some((fragment) => fragment.title === "metadata" && fragment.snippet?.includes("runtime-metadata-fragment-needle")), true);
    assert.equal(JSON.stringify(queryPayload.data.results).includes("runtime-metadata-secret-never-index"), false);
    const payloadQuery = await runCliCapture(["search", "query", "runtime-payload-fragment-needle", "--sources", "runtime.events", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(payloadQuery.code, CLI_EXIT_OK);
    const payloadQueryPayload = JSON.parse(payloadQuery.stdout) as {
      data: { results: Array<{ title: string; fragments?: Array<{ title?: string; snippet?: string }> }> };
    };
    const payloadResult = payloadQueryPayload.data.results.find((entry) => entry.title === "Search worker backfill");
    assert.equal(payloadResult?.fragments?.some((fragment) => fragment.title === "payload" && fragment.snippet?.includes("runtime-payload-fragment-needle")), true);
    assert.equal(JSON.stringify(payloadQueryPayload.data.results).includes("runtime-payload-secret-never-index"), false);
    const operationalQuery = await runCliCapture(["search", "query", "operational-metadata-fragment-needle", "--sources", "runtime.events", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(operationalQuery.code, CLI_EXIT_OK);
    const operationalQueryPayload = JSON.parse(operationalQuery.stdout) as {
      data: { results: Array<{ title: string; fragments?: Array<{ title?: string; snippet?: string }> }> };
    };
    const operationalResult = operationalQueryPayload.data.results.find((entry) => entry.title.includes("Runtime queue lag"));
    assert.equal(operationalResult?.fragments?.some((fragment) => fragment.title === "metadata" && fragment.snippet?.includes("operational-metadata-fragment-needle")), true);
    assert.equal(JSON.stringify(operationalQueryPayload.data.results).includes("operational-secret-never-index"), false);
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
    const queuedStdout = captureStream();
    const queuedStderr = captureStream();
    const queued = await runInternalV1Cli([
      "runtime",
      "queue",
      "Search runtime tombstone job",
      "--id",
      "runtime-search-tombstone",
      "--kind",
      "search-worker",
      "--payload",
      JSON.stringify({ source: "runtime.events" }),
      "--json",
    ], { stdout: queuedStdout.stream, stderr: queuedStderr.stream, cwd: workspaceRoot });
    assert.equal(queued, CLI_EXIT_OK);
    const runtimeJobRun = await runCliCapture(["search", "service", "run-once", "--source", "runtime.events", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(runtimeJobRun.code, CLI_EXIT_OK);
    const runtimeJobQuery = await runCliCapture(["search", "query", "runtime tombstone", "--sources", "runtime.events", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(runtimeJobQuery.code, CLI_EXIT_OK, runtimeJobQuery.stderr || runtimeJobQuery.stdout);
    const runtimeJobQueryPayload = JSON.parse(runtimeJobQuery.stdout) as any;
    assert.equal(runtimeJobQueryPayload.data.results.some((entry: any) => entry.source === "runtime.events" && entry.resourceId === "job:runtime-search-tombstone"), true);
    const deletedStdout = captureStream();
    const deletedStderr = captureStream();
    const deleted = await runInternalV1Cli(["runtime", "job", "delete", "runtime-search-tombstone", "--json"], { stdout: deletedStdout.stream, stderr: deletedStderr.stream, cwd: workspaceRoot });
    assert.equal(deleted, CLI_EXIT_OK);
    const deleteRun = await runCliCapture(["search", "service", "run-once", "--source", "runtime.events", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(deleteRun.code, CLI_EXIT_OK);
    const deleteRunPayload = JSON.parse(deleteRun.stdout) as {
      data: { worker?: { items: Array<{ source: string; operation: string; status: string; indexed?: number }> } };
    };
    const runtimeDeleteRunItem = deleteRunPayload.data.worker?.items.find((entry) => entry.source === "runtime.events");
    assert.deepEqual({ source: runtimeDeleteRunItem?.source, operation: runtimeDeleteRunItem?.operation, status: runtimeDeleteRunItem?.status, indexed: runtimeDeleteRunItem?.indexed }, { source: "runtime.events", operation: "delete", status: "done", indexed: 1 });
    const afterRuntimeDelete = await runCliCapture(["search", "query", "runtime tombstone", "--sources", "runtime.events", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(afterRuntimeDelete.code), true, afterRuntimeDelete.stderr || afterRuntimeDelete.stdout);
    const afterRuntimeDeletePayload = JSON.parse(afterRuntimeDelete.stdout) as any;
    assert.equal(afterRuntimeDeletePayload.data.results.some((entry: any) => entry.source === "runtime.events" && entry.resourceId === "job:runtime-search-tombstone"), false);
  });
});
