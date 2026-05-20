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
      const row = core.prepare("SELECT source, state, source_set AS sourceSet FROM search_source_config WHERE source = ?").get("commands") as { source: string; state: string; sourceSet: string } | undefined;
      assert.deepEqual(row, { source: "commands", state: "paused", sourceSet: "framework" });
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
