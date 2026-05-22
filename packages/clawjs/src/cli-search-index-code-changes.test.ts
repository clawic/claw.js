import { test } from "vitest";
import assert from "node:assert/strict";
import { registeredDatabasePath, registeredSearchDatabasePath } from "../../../tests/helpers/stable-surface-test-builders.ts";
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
    "export type SearchNeedleMode = \"compact\" | \"expanded\";",
    "",
    "export function makeNeedleSymbol(config: SearchNeedleConfig) {",
    "  return config.enabled ? \"needle-ready\" : \"needle-off\";",
    "}",
    "",
    "export const makeTypedNeedle = (value: string): string => value;",
    "",
    "export class SearchNeedleController {",
    "  public resolveNeedle(config: SearchNeedleConfig): string {",
    "    return makeNeedleSymbol(config);",
    "  }",
    "}",
    "",
    "export default function SearchPanelView() {",
    "  return makeNeedleSymbol({ enabled: true });",
    "}",
    "",
    "export const searchConfig = { enabled: true };",
    "export const typedSearchLimit: number = 5;",
    "",
    "test(\"renders local result\", () => {",
    "  makeNeedleSymbol(searchConfig);",
    "});",
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
    const result = queryPayload.data.results.find((candidate) => candidate.title === "feature-search.ts");
    assert.equal(result?.source, "code.symbols");
    assert.equal(result?.domain, "code");
    assert.equal(result?.type, "file");
    assert.equal(result?.metadata?.language, "typescript");
    assert.equal(result?.metadata?.relativePath, "src/feature-search.ts");
    assert.equal(result?.metadata?.symbolCount, 10);
    assert.equal(result?.path, path.join(sourceRoot, "src", "feature-search.ts"));
    assert.equal(result?.actions?.some((action) => action.id === "open" && action.requiresApproval === true && action.grant === "search.code.open"), true);
    assert.equal(result?.fragments?.some((fragment) => fragment.title === "type SearchNeedleConfig"), true);
    assert.equal(result?.fragments?.some((fragment) => fragment.title === "type SearchNeedleMode"), true);
    assert.equal(result?.fragments?.some((fragment) => fragment.title === "function makeNeedleSymbol" && fragment.snippet?.includes("makeNeedleSymbol")), true);
    assert.equal(result?.fragments?.some((fragment) => fragment.title === "function makeTypedNeedle"), true);
    assert.equal(result?.fragments?.some((fragment) => fragment.title === "type SearchNeedleController"), true);
    assert.ok(result?.explanation?.matchedBy?.length);
    assert.equal(queryPayload.data.facets?.some((facet) => facet.id === "language"), true);
    const db = new Database(registeredSearchDatabasePath(dataRoot), { readonly: true });
    try {
      const fragmentTitles = (db.prepare("SELECT title FROM search_fragments WHERE source = ? ORDER BY sort_order ASC").all("code.symbols") as Array<{ title: string }>).map((row) => row.title);
      assert.equal(fragmentTitles.includes("method resolveNeedle"), true);
      assert.equal(fragmentTitles.includes("function SearchPanelView"), true);
      assert.equal(fragmentTitles.includes("constant searchConfig"), true);
      assert.equal(fragmentTitles.includes("constant typedSearchLimit"), true);
      assert.equal(fragmentTitles.includes("test renders local result"), true);
    } finally {
      db.close();
    }
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
      data: { results: unknown[] };
    };
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
    const scheduled = await runCliCapture(["search", "changes", "schedule", "upsert", "--source", "code.symbols", "--root", sourceRoot, "--path", filePath, "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(scheduled.code, CLI_EXIT_OK, scheduled.stderr || scheduled.stdout);
    const scheduledPayload = JSON.parse(scheduled.stdout) as {
      data: { item?: { id: string; source: string; operation: string; resourceId?: string; shard?: string; payload?: { eventDriven?: boolean; relativePath?: string; root?: string } } };
    };
    assert.equal(scheduledPayload.data.item?.source, "code.symbols");
    assert.equal(scheduledPayload.data.item?.operation, "upsert");
    assert.equal(scheduledPayload.data.item?.resourceId, "src/event-refresh.ts");
    assert.equal(scheduledPayload.data.item?.shard, "hot");
    assert.equal(scheduledPayload.data.item?.payload?.eventDriven, true);
    assert.equal(scheduledPayload.data.item?.payload?.relativePath, "src/event-refresh.ts");
    assert.equal(scheduledPayload.data.item?.payload?.root, path.resolve(sourceRoot));
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
    const deleted = await runCliCapture(["search", "changes", "schedule", "delete", "--source", "code.symbols", "--root", sourceRoot, "--path", filePath, "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleted.code, CLI_EXIT_OK, deleted.stderr || deleted.stdout);
    const deletedPayload = JSON.parse(deleted.stdout) as {
      data: { item?: { source: string; operation: string; resourceId?: string; payload?: { eventDriven?: boolean; relativePath?: string } } };
    };
    assert.equal(deletedPayload.data.item?.source, "code.symbols");
    assert.equal(deletedPayload.data.item?.operation, "delete");
    assert.equal(deletedPayload.data.item?.resourceId, "src/event-refresh.ts");
    assert.equal(deletedPayload.data.item?.payload?.eventDriven, true);
    assert.equal(deletedPayload.data.item?.payload?.relativePath, "src/event-refresh.ts");
    const deleteRun = await runCliCapture(["search", "service", "run-once", "--source", "code.symbols", "--data-dir", dataRoot, "--code-root", sourceRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(deleteRun.code, CLI_EXIT_OK);
    const deleteRunPayload = JSON.parse(deleteRun.stdout) as {
      data: { worker?: { items: Array<{ source: string; operation: string; status: string; indexed?: number }> } };
    };
    const codeDeleteRunItem = deleteRunPayload.data.worker?.items.find((entry) => entry.source === "code.symbols");
    assert.deepEqual({ source: codeDeleteRunItem?.source, operation: codeDeleteRunItem?.operation, status: codeDeleteRunItem?.status, indexed: codeDeleteRunItem?.indexed }, { source: "code.symbols", operation: "delete", status: "done", indexed: 1 });
    const afterDelete = await runCliCapture(["search", "query", "eventDrivenNeedle", "--domains", "code", "--data-dir", dataRoot, "--code-root", sourceRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(afterDelete.code, CLI_EXIT_DEGRADED);
    const afterDeletePayload = JSON.parse(afterDelete.stdout) as { data: { results: unknown[] } };
    assert.deepEqual(afterDeletePayload.data.results, []);
  });
});
test("search changes schedule enqueues typed code.symbols refresh jobs", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-code-changes-"));
  const dataRoot = path.join(workspaceRoot, "data");
  const sourceRoot = path.join(workspaceRoot, "project");
  const filePath = path.join(sourceRoot, "src", "changed-refresh.ts");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, [
    "export function changedScheduleNeedle() {",
    "  return \"code-symbol-changed-ready\";",
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
    const schedule = await runCliCapture(["search", "changes", "schedule", "upsert", "--source", "code.symbols", "--root", sourceRoot, "--path", filePath, "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(schedule.code, CLI_EXIT_OK);
    const schedulePayload = JSON.parse(schedule.stdout) as {
      data: { item?: { source: string; operation: string; resourceId?: string; shard?: string; payload?: { relativePath?: string; root?: string } } };
    };
    assert.equal(schedulePayload.data.item?.source, "code.symbols");
    assert.equal(schedulePayload.data.item?.operation, "upsert");
    assert.equal(schedulePayload.data.item?.resourceId, "src/changed-refresh.ts");
    assert.equal(schedulePayload.data.item?.shard, "hot");
    assert.equal(schedulePayload.data.item?.payload?.relativePath, "src/changed-refresh.ts");
    assert.equal(schedulePayload.data.item?.payload?.root, sourceRoot);
    const outside = await runCliCapture(["search", "changes", "schedule", "upsert", "--source", "code.symbols", "--root", sourceRoot, "--path", path.join(workspaceRoot, "outside.ts"), "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(outside.code, CLI_EXIT_USAGE);
    const outsidePayload = JSON.parse(outside.stdout) as { error: { code: string; message: string } };
    assert.equal(outsidePayload.error.code, "search_changed_event_error");
    assert.equal(outsidePayload.error.message.includes("outside root"), true);
    const serviceRun = await runCliCapture(["search", "service", "run-once", "--source", "code.symbols", "--data-dir", dataRoot, "--code-root", sourceRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(serviceRun.code, CLI_EXIT_OK);
    const serviceRunPayload = JSON.parse(serviceRun.stdout) as {
      data: { worker?: { items: Array<{ source: string; operation: string; status: string; indexed?: number }> } };
    };
    const changedRunItem = serviceRunPayload.data.worker?.items.find((entry) => entry.source === "code.symbols");
    assert.deepEqual({ source: changedRunItem?.source, operation: changedRunItem?.operation, status: changedRunItem?.status, indexed: changedRunItem?.indexed }, { source: "code.symbols", operation: "upsert", status: "done", indexed: 1 });
    const query = await runCliCapture(["search", "query", "changedScheduleNeedle", "--domains", "code", "--data-dir", dataRoot, "--code-root", sourceRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as { data: { results: Array<{ source: string; resourceId?: string; fragments?: Array<{ title?: string }> }> } };
    const result = queryPayload.data.results.find((entry) => entry.resourceId === "src/changed-refresh.ts");
    assert.equal(result?.source, "code.symbols");
    assert.equal(result?.fragments?.some((fragment) => fragment.title === "function changedScheduleNeedle"), true);
  });
});
