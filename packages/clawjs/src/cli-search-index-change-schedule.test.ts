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
test("search changes schedule enqueues typed framework ID-source jobs", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-simple-changes-"));
  const dataRoot = path.join(workspaceRoot, "data");
  const simpleCases: Array<{
    source: string;
    args: string[];
    resourceId: string;
    payload: Record<string, string>;
    workspace?: boolean;
  }> = [
    { source: "images.derived", args: ["--image-id", "image-alpha"], resourceId: "image-alpha", payload: { imageId: "image-alpha" } },
    { source: "media.assets", args: ["--media-id", "media-alpha"], resourceId: "media-alpha", payload: { mediaId: "media-alpha" } },
    { source: "generations.artifacts", args: ["--generation-id", "generation-alpha"], resourceId: "generation-alpha", payload: { generationId: "generation-alpha" } },
    { source: "slides.decks", args: ["--deck-id", "deck-alpha"], resourceId: "deck-alpha", payload: { deckId: "deck-alpha" }, workspace: true },
    { source: "skills.registry", args: ["--slug", "skill-alpha"], resourceId: "skill-alpha", payload: { slug: "skill-alpha" } },
    { source: "snippets.library", args: ["--slug", "snippet-alpha"], resourceId: "snippet-alpha", payload: { slug: "snippet-alpha" } },
    { source: "marketplace.choices", args: ["--choice-id", "choice-alpha"], resourceId: "choice-alpha", payload: { choiceId: "choice-alpha" } },
    { source: "content.items", args: ["--item-id", "item-alpha"], resourceId: "item-alpha", payload: { itemId: "item-alpha" } },
    { source: "business.records", args: ["--record-id", "business-alpha"], resourceId: "business-alpha", payload: { recordId: "business-alpha" } },
    { source: "social.posts", args: ["--post-id", "post-alpha"], resourceId: "post-alpha", payload: { postId: "post-alpha" } },
    { source: "iot.config", args: ["--config-id", "config-alpha"], resourceId: "config-alpha", payload: { configId: "config-alpha" } },
    { source: "notes.pages", args: ["--page-id", "note-alpha"], resourceId: "note-alpha", payload: { pageId: "note-alpha" } },
    { source: "calendar.events", args: ["--event-id", "event-alpha"], resourceId: "event-alpha", payload: { eventId: "event-alpha" } },
    { source: "connectors.catalog", args: ["--operation-id", "connector.operation"], resourceId: "connector.operation", payload: { operationId: "connector.operation" } },
    { source: "apps.catalog", args: ["--app-id", "app-alpha"], resourceId: "app-alpha", payload: { appId: "app-alpha" } },
    { source: "design.resources", args: ["--resource-id", "design-alpha"], resourceId: "design-alpha", payload: { resourceId: "design-alpha" }, workspace: true },
  ];
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    for (const simpleCase of simpleCases) {
      const scheduleArgs = ["search", "changes", "schedule", "upsert", "--source", simpleCase.source, ...simpleCase.args, "--data-dir", dataRoot, "--json"];
      if (simpleCase.workspace) scheduleArgs.push("--workspace", workspaceRoot);
      const scheduled = await runCliCapture(scheduleArgs, workspaceRoot);
      assert.equal(scheduled.code, CLI_EXIT_OK, scheduled.stderr || scheduled.stdout);
      const payload = JSON.parse(scheduled.stdout) as {
        data: { item?: { source: string; operation: string; resourceId?: string; shard?: string; payload?: Record<string, unknown> } };
      };
      assert.equal(payload.data.item?.source, simpleCase.source);
      assert.equal(payload.data.item?.operation, "upsert");
      assert.equal(payload.data.item?.resourceId, simpleCase.resourceId);
      assert.equal(payload.data.item?.shard, "hot");
      assert.equal(payload.data.item?.payload?.eventDriven, true);
      for (const [key, value] of Object.entries(simpleCase.payload)) {
        assert.equal(payload.data.item?.payload?.[key], value);
      }
      if (simpleCase.workspace) assert.equal(payload.data.item?.payload?.workspaceRoot, workspaceRoot);
    }
  });
});
test("search changes schedule enqueues typed non-simple framework jobs", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-nonsimple-changes-"));
  const dataRoot = path.join(workspaceRoot, "data");
  const cases: Array<{
    source: string;
    args: string[];
    resourceId: string;
    payload: Record<string, string>;
  }> = [
    {
      source: "database.records",
      args: ["--namespace", "main", "--collection", "contacts", "--record-id", "ada"],
      resourceId: "main:contacts:ada",
      payload: { namespaceId: "main", collection: "contacts", recordId: "ada" },
    },
    {
      source: "work.items",
      args: ["--namespace", "main", "--collection", "tasks", "--record-id", "task-alpha"],
      resourceId: "main:tasks:task-alpha",
      payload: { namespaceId: "main", collection: "tasks", recordId: "task-alpha" },
    },
    {
      source: "documents.blocks",
      args: ["--namespace", "main", "--document-id", "doc-alpha"],
      resourceId: "main:documents:doc-alpha",
      payload: { namespaceId: "main", collection: "documents", recordId: "doc-alpha", documentId: "doc-alpha" },
    },
    {
      source: "documents.blocks",
      args: ["--namespace", "main", "--document-id", "doc-alpha", "--collection", "document_blocks", "--record-id", "block-alpha"],
      resourceId: "main:documents:doc-alpha",
      payload: { namespaceId: "main", collection: "document_blocks", recordId: "block-alpha", documentId: "doc-alpha" },
    },
    {
      source: "knowledge.graph",
      args: ["--kind", "entity", "--id", "entity-alpha"],
      resourceId: "entity:entity-alpha",
      payload: { kind: "entity", knowledgeResourceId: "entity:entity-alpha", entityId: "entity-alpha" },
    },
    {
      source: "knowledge.graph",
      args: ["--kind", "fact", "--fact-id", "fact-alpha"],
      resourceId: "fact:fact-alpha",
      payload: { kind: "fact", knowledgeResourceId: "fact:fact-alpha", factId: "fact-alpha" },
    },
    {
      source: "signals.observations",
      args: ["--kind", "vertical", "--vertical-id", "vertical-alpha"],
      resourceId: "vertical:vertical-alpha",
      payload: { kind: "vertical", signalsResourceId: "vertical:vertical-alpha", verticalId: "vertical-alpha" },
    },
    {
      source: "signals.observations",
      args: ["--kind", "observation", "--id", "observation-alpha"],
      resourceId: "observation:observation-alpha",
      payload: { kind: "observation", signalsResourceId: "observation:observation-alpha", observationId: "observation-alpha" },
    },
    {
      source: "finance.records",
      args: ["--namespace", "main", "--collection", "transactions", "--record-id", "txn-alpha"],
      resourceId: "main:transactions:txn-alpha",
      payload: { namespaceId: "main", collection: "transactions", recordId: "txn-alpha" },
    },
    {
      source: "finance.records",
      args: ["--table", "finance_records", "--record-id", "finance-local-alpha"],
      resourceId: "finance_records:finance-local-alpha",
      payload: { table: "finance_records", recordId: "finance-local-alpha" },
    },
    {
      source: "eln.records",
      args: ["--namespace", "main", "--collection", "lab_notebooks", "--record-id", "notebook-alpha"],
      resourceId: "main:lab_notebooks:notebook-alpha",
      payload: { namespaceId: "main", collection: "lab_notebooks", recordId: "notebook-alpha" },
    },
    {
      source: "providers.routing",
      args: ["--kind", "routing", "--provider", "provider-alpha", "--feature", "chat", "--capability", "llm"],
      resourceId: "routing:chat:llm",
      payload: { kind: "routing", provider: "provider-alpha", feature: "chat", capability: "llm" },
    },
    {
      source: "providers.routing",
      args: ["--kind", "setting", "--provider", "provider-alpha"],
      resourceId: "setting:provider-alpha",
      payload: { kind: "setting", provider: "provider-alpha" },
    },
    {
      source: "agents.catalog",
      args: ["--kind", "agent", "--agent-id", "agent-alpha"],
      resourceId: "agent:agent-alpha",
      payload: { kind: "agent", id: "agent-alpha" },
    },
    {
      source: "agents.catalog",
      args: ["--kind", "skill-collection", "--id", "collection-alpha"],
      resourceId: "skill_collection:collection-alpha",
      payload: { kind: "skill_collection", id: "collection-alpha" },
    },
    {
      source: "mcp.servers",
      args: ["--server-id", "docs-server", "--config-path", "mcp.json"],
      resourceId: "docs-server",
      payload: { serverId: "docs-server", configPath: path.join(workspaceRoot, "mcp.json") },
    },
    {
      source: "runtime.events",
      args: ["--kind", "job", "--job-id", "runtime-job-alpha"],
      resourceId: "job:runtime-job-alpha",
      payload: { runtimeKind: "job", runtimeResourceId: "job:runtime-job-alpha", id: "runtime-job-alpha" },
    },
    {
      source: "runtime.events",
      args: ["--kind", "operational", "--domain", "monitor", "--id", "operational-alpha"],
      resourceId: "operational:monitor:operational-alpha",
      payload: { runtimeKind: "operational", runtimeResourceId: "operational:monitor:operational-alpha", id: "operational-alpha", domain: "monitor" },
    },
  ];
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    for (const entry of cases) {
      const scheduled = await runCliCapture(["search", "changes", "schedule", "upsert", "--source", entry.source, ...entry.args, "--data-dir", dataRoot, "--json"], workspaceRoot);
      assert.equal(scheduled.code, CLI_EXIT_OK, scheduled.stderr || scheduled.stdout);
      const payload = JSON.parse(scheduled.stdout) as {
        data: { item?: { source: string; operation: string; resourceId?: string; shard?: string; payload?: Record<string, unknown> } };
      };
      assert.equal(payload.data.item?.source, entry.source);
      assert.equal(payload.data.item?.operation, "upsert");
      assert.equal(payload.data.item?.resourceId, entry.resourceId);
      assert.equal(payload.data.item?.shard, "hot");
      assert.equal(payload.data.item?.payload?.eventDriven, true);
      for (const [key, value] of Object.entries(entry.payload)) {
        assert.equal(payload.data.item?.payload?.[key], value);
      }
    }
    const invalidDocument = await runCliCapture(["search", "changes", "schedule", "upsert", "--source", "documents.blocks", "--namespace", "main", "--document-id", "doc-alpha", "--collection", "private_records", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(invalidDocument.code, CLI_EXIT_USAGE);
    const invalidPayload = JSON.parse(invalidDocument.stdout) as { error: { code: string; message: string } };
    assert.equal(invalidPayload.error.code, "search_changed_event_error");
    assert.equal(invalidPayload.error.message.includes("documents.blocks"), true);
    const invalidKind = await runCliCapture(["search", "changes", "schedule", "upsert", "--source", "knowledge.graph", "--kind", "topic", "--id", "topic-alpha", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(invalidKind.code, CLI_EXIT_USAGE);
    const invalidKindPayload = JSON.parse(invalidKind.stdout) as { error: { code: string; message: string } };
    assert.equal(invalidKindPayload.error.code, "search_changed_event_error");
    assert.equal(invalidKindPayload.error.message.includes("knowledge.graph"), true);
  });
});
test("search changes scan schedules upserts and deletes from a root snapshot", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-code-scan-"));
  const dataRoot = path.join(workspaceRoot, "data");
  const sourceRoot = path.join(workspaceRoot, "project");
  const filePath = path.join(sourceRoot, "src", "scan-refresh.ts");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, [
    "export function scanScheduleNeedle() {",
    "  return \"code-symbol-scan-ready\";",
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
    const firstScan = await runCliCapture(["search", "changes", "scan", "--source", "code.symbols", "--root", sourceRoot, "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(firstScan.code, CLI_EXIT_OK);
    const firstPayload = JSON.parse(firstScan.stdout) as {
      data: { source: string; scanned: number; scheduledUpserts: number; scheduledDeletes: number; jobs: Array<{ source: string; operation: string; resourceId?: string }> };
      meta: { subcommand?: string };
    };
    assert.equal(firstPayload.meta.subcommand, "changes");
    assert.equal(firstPayload.data.source, "code.symbols");
    assert.equal(firstPayload.data.scanned, 1);
    assert.equal(firstPayload.data.scheduledUpserts, 1);
    assert.equal(firstPayload.data.scheduledDeletes, 0);
    assert.equal(firstPayload.data.jobs[0]?.resourceId, "src/scan-refresh.ts");
    const secondScan = await runCliCapture(["search", "changes", "scan", "--source", "code.symbols", "--root", sourceRoot, "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(secondScan.code, CLI_EXIT_OK);
    const secondPayload = JSON.parse(secondScan.stdout) as { data: { scheduledUpserts: number; scheduledDeletes: number; state: string } };
    assert.equal(secondPayload.data.scheduledUpserts, 0);
    assert.equal(secondPayload.data.scheduledDeletes, 0);
    assert.equal(secondPayload.data.state, "empty");
    fs.writeFileSync(filePath, [
      "export function scanScheduleNeedleChanged() {",
      "  return \"code-symbol-scan-ready-changed\";",
      "}",
      "",
    ].join("\n"));
    fs.utimesSync(filePath, new Date("2026-05-21T10:00:00.000Z"), new Date("2026-05-21T10:00:00.000Z"));
    const modifiedScan = await runCliCapture(["search", "changes", "scan", "--source", "code.symbols", "--root", sourceRoot, "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(modifiedScan.code, CLI_EXIT_OK);
    const modifiedPayload = JSON.parse(modifiedScan.stdout) as { data: { scanned: number; scheduledUpserts: number; scheduledDeletes: number; jobs: Array<{ source: string; operation: string; resourceId?: string }> } };
    assert.equal(modifiedPayload.data.scanned, 1);
    assert.equal(modifiedPayload.data.scheduledUpserts, 1);
    assert.equal(modifiedPayload.data.scheduledDeletes, 0);
    assert.deepEqual({ source: modifiedPayload.data.jobs[0]?.source, operation: modifiedPayload.data.jobs[0]?.operation, resourceId: modifiedPayload.data.jobs[0]?.resourceId }, { source: "code.symbols", operation: "upsert", resourceId: "src/scan-refresh.ts" });
    fs.rmSync(filePath);
    const deleteScan = await runCliCapture(["search", "changes", "scan", "--source", "code.symbols", "--root", sourceRoot, "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleteScan.code, CLI_EXIT_OK);
    const deletePayload = JSON.parse(deleteScan.stdout) as { data: { scanned: number; scheduledUpserts: number; scheduledDeletes: number; jobs: Array<{ source: string; operation: string; resourceId?: string }> } };
    assert.equal(deletePayload.data.scanned, 0);
    assert.equal(deletePayload.data.scheduledUpserts, 0);
    assert.equal(deletePayload.data.scheduledDeletes, 1);
    assert.deepEqual({ source: deletePayload.data.jobs[0]?.source, operation: deletePayload.data.jobs[0]?.operation, resourceId: deletePayload.data.jobs[0]?.resourceId }, { source: "code.symbols", operation: "delete", resourceId: "src/scan-refresh.ts" });
  });
});
test("search changes scan incrementally tracks file sources", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-file-source-scan-"));
  const dataRoot = path.join(workspaceRoot, "data");
  const cases = [
    { source: "local.files", rootName: "files", relativePath: "docs/local.txt", content: "local file scan needle", rootFlag: "--root" },
    { source: "web.ingested", rootName: "web", relativePath: "page.html", content: "<html><body>web scan needle</body></html>", rootFlag: "--root" },
    { source: "external.cache", rootName: "external", relativePath: "record.json", content: JSON.stringify({ title: "External scan", text: "external scan needle" }), rootFlag: "--root" },
  ];
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    for (const entry of cases) {
      const root = path.join(workspaceRoot, entry.rootName);
      const filePath = path.join(root, entry.relativePath);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, entry.content);
      const firstScan = await runCliCapture(["search", "changes", "scan", "--source", entry.source, entry.rootFlag, root, "--data-dir", dataRoot, "--json"], workspaceRoot);
      assert.equal(firstScan.code, CLI_EXIT_OK, firstScan.stderr || firstScan.stdout);
      const firstPayload = JSON.parse(firstScan.stdout) as { data: { scanned: number; scheduledUpserts: number; scheduledDeletes: number; jobs: Array<{ source: string; operation: string; resourceId?: string }> } };
      assert.equal(firstPayload.data.scanned, 1);
      assert.equal(firstPayload.data.scheduledUpserts, 1);
      assert.equal(firstPayload.data.scheduledDeletes, 0);
      assert.deepEqual({ source: firstPayload.data.jobs[0]?.source, operation: firstPayload.data.jobs[0]?.operation, resourceId: firstPayload.data.jobs[0]?.resourceId }, { source: entry.source, operation: "upsert", resourceId: entry.relativePath });
      const secondScan = await runCliCapture(["search", "changes", "scan", "--source", entry.source, "--root", root, "--data-dir", dataRoot, "--json"], workspaceRoot);
      assert.equal(secondScan.code, CLI_EXIT_OK, secondScan.stderr || secondScan.stdout);
      const secondPayload = JSON.parse(secondScan.stdout) as { data: { scheduledUpserts: number; scheduledDeletes: number; state: string } };
      assert.equal(secondPayload.data.scheduledUpserts, 0);
      assert.equal(secondPayload.data.scheduledDeletes, 0);
      assert.equal(secondPayload.data.state, "empty");
    }
  });
});
test("search changes scan resumes bounded file-source ticks without duplicate jobs", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-file-source-budget-"));
  const dataRoot = path.join(workspaceRoot, "data");
  const sourceRoot = path.join(workspaceRoot, "project");
  fs.mkdirSync(sourceRoot, { recursive: true });
  for (const name of ["one.ts", "two.ts", "three.ts"]) {
    fs.writeFileSync(path.join(sourceRoot, name), `export const ${name.replace(".ts", "")}Needle = "${name}";\n`);
  }
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const seen = new Set<string>();
    for (let index = 0; index < 3; index += 1) {
      const scan = await runCliCapture(["search", "changes", "scan", "--source", "code.symbols", "--root", sourceRoot, "--limit", "1", "--data-dir", dataRoot, "--json"], workspaceRoot);
      assert.equal(scan.code, CLI_EXIT_OK, scan.stderr || scan.stdout);
      const payload = JSON.parse(scan.stdout) as { data: { scheduledUpserts: number; jobs: Array<{ resourceId?: string }>; pending: boolean; budgetExhausted: boolean } };
      assert.equal(payload.data.scheduledUpserts, 1);
      assert.equal(payload.data.budgetExhausted, true);
      const resourceId = payload.data.jobs[0]?.resourceId;
      assert.equal(typeof resourceId, "string");
      assert.equal(seen.has(resourceId as string), false);
      seen.add(resourceId as string);
    }
    assert.deepEqual([...seen].sort(), ["one.ts", "three.ts", "two.ts"]);
    const finalScan = await runCliCapture(["search", "changes", "scan", "--source", "code.symbols", "--root", sourceRoot, "--limit", "1", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(finalScan.code, CLI_EXIT_OK, finalScan.stderr || finalScan.stdout);
    const finalPayload = JSON.parse(finalScan.stdout) as { data: { scheduledUpserts: number; scheduledDeletes: number; pending: boolean } };
    assert.equal(finalPayload.data.scheduledUpserts, 0);
    assert.equal(finalPayload.data.scheduledDeletes, 0);
    assert.equal(finalPayload.data.pending, false);
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
      "--source-set",
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
        results: Array<{ source: string }>;
      };
    };
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
