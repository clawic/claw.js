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
        metadataMarker: "signals-vertical-metadata-fragment-needle",
        label: "Product Signals",
        category: "product",
        description: "Product health measurements for scoped Search ranking.",
        version: "2026.05",
        credentials: { token: "signals-vertical-secret-never-index" },
      },
      variables: [
        {
          definitionMarker: "signals-definition-fragment-needle",
          id: "signal.activation",
          label: "Activation Rate",
          valueType: "number",
          unit: { id: "percent", symbol: "%" },
          category: "growth",
          definition: "Activation percentage from onboarding events.",
          credentials: { apiKey: "signals-definition-secret-never-index" },
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
      JSON.stringify({ marker: "signals-source-fragment-needle", connector: "product-analytics", table: "activation_events", credentials: { token: "signals-source-secret-never-index" } }),
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
    const verticalMetadataQuery = await runCliCapture(["search", "query", "signals-vertical-metadata-fragment-needle", "--sources", "signals.observations", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(verticalMetadataQuery.code, CLI_EXIT_OK);
    const verticalMetadataPayload = JSON.parse(verticalMetadataQuery.stdout) as {
      data: { results: Array<{ title: string; fragments?: Array<{ title?: string; snippet?: string }> }> };
    };
    const verticalResult = verticalMetadataPayload.data.results.find((entry) => entry.title === "Product Signals");
    assert.equal(verticalResult?.fragments?.some((fragment) => fragment.title === "metadata" && fragment.snippet?.includes("signals-vertical-metadata-fragment-needle")), true);
    assert.equal(JSON.stringify(verticalMetadataPayload.data.results).includes("signals-vertical-secret-never-index"), false);
    const definitionQuery = await runCliCapture(["search", "query", "signals-definition-fragment-needle", "--sources", "signals.observations", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(definitionQuery.code, CLI_EXIT_OK);
    const definitionPayload = JSON.parse(definitionQuery.stdout) as {
      data: { results: Array<{ title: string; fragments?: Array<{ title?: string; snippet?: string }> }> };
    };
    const definitionResult = definitionPayload.data.results.find((entry) => entry.title === "Activation Rate");
    assert.equal(definitionResult?.fragments?.some((fragment) => fragment.title === "definition" && fragment.snippet?.includes("signals-definition-fragment-needle")), true);
    assert.equal(JSON.stringify(definitionPayload.data.results).includes("signals-definition-secret-never-index"), false);
    const sourceQuery = await runCliCapture(["search", "query", "signals-source-fragment-needle", "--sources", "signals.observations", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(sourceQuery.code, CLI_EXIT_OK);
    const sourcePayload = JSON.parse(sourceQuery.stdout) as {
      data: { results: Array<{ title: string; fragments?: Array<{ title?: string; snippet?: string }> }> };
    };
    const sourceResult = sourcePayload.data.results.find((entry) => entry.title.includes("Activation Rate"));
    assert.equal(sourceResult?.fragments?.some((fragment) => fragment.title === "source" && fragment.snippet?.includes("signals-source-fragment-needle")), true);
    assert.equal(JSON.stringify(sourcePayload.data.results).includes("signals-source-secret-never-index"), false);
    const deleted = await runCliCapture(["signals", "delete", observationPayload.data.id, "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleted.code, CLI_EXIT_OK);
    const deleteJobs = await runCliCapture(["search", "jobs", "--source", "signals.observations", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleteJobs.code, CLI_EXIT_OK);
    const deleteJobsPayload = JSON.parse(deleteJobs.stdout) as {
      data: { items: Array<{ operation: string; resourceId: string; payload: { observationId?: string } }> };
    };
    const deleteJob = deleteJobsPayload.data.items.find((job) => job.operation === "delete" && job.resourceId === `observation:${observationPayload.data.id}`);
    assert.equal(deleteJob?.payload.observationId, observationPayload.data.id);
    const signalsDeleteRun = await runCliCapture(["search", "service", "run-once", "--source", "signals.observations", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(signalsDeleteRun.code, CLI_EXIT_OK);
    const signalsDeleteRunItem = (JSON.parse(signalsDeleteRun.stdout) as any).data.service.worker?.items.find((entry: any) => entry.source === "signals.observations");
    assert.deepEqual({ source: signalsDeleteRunItem?.source, operation: signalsDeleteRunItem?.operation, status: signalsDeleteRunItem?.status, indexed: signalsDeleteRunItem?.indexed }, { source: "signals.observations", operation: "delete", status: "done", indexed: 1 });
    const afterSignalsDelete = await runCliCapture([
      "search",
      "query",
      "beta users activation",
      "--sources",
      "signals.observations",
      "--filters",
      JSON.stringify({ "metadata.kind": "observation", "metadata.variableId": "signal.activation", redacted: false }),
      "--data-dir",
      dataRoot,
      "--json",
      "--limit",
      "5",
    ], workspaceRoot);
    assert.equal(afterSignalsDelete.code, CLI_EXIT_DEGRADED, afterSignalsDelete.stderr || afterSignalsDelete.stdout);
    const afterSignalsDeletePayload = JSON.parse(afterSignalsDelete.stdout) as any;
    assert.equal(afterSignalsDeletePayload.data.results.some((entry: any) => entry.source === "signals.observations" && entry.metadata?.observationId === observationPayload.data.id), false);
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
      "--description",
      "Review fast path budgets and Search source coverage.",
      "--metadata",
      JSON.stringify({ agenda: "calendar-metadata-fragment-needle", credentials: { apiKey: "calendar-secret-never-index" } }),
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
        results: Array<{
          source: string;
          domain: string;
          type: string;
          title: string;
          metadata?: { eventId?: string; status?: string; startsAt?: string; endsAt?: string; source?: string; hasPage?: boolean };
          fragments?: Array<{ title?: string; snippet?: string }>;
          actions?: Array<{ id: string; kind: string }>;
          explanation?: { matchedBy?: string[] };
        }>;
        facets?: Array<{ id: string }>;
      };
    };
    const result = queryPayload.data.results.find((entry) => entry.metadata?.eventId === "event-search-review");
    assert.equal(result?.source, "calendar.events");
    assert.equal(result?.domain, "calendar");
    assert.equal(result?.type, "event");
    assert.equal(result?.title, "Search Architecture Review");
    assert.equal(result?.metadata?.status, "active");
    assert.equal(result?.metadata?.startsAt, "2026-05-19T09:00:00.000Z");
    assert.equal(result?.metadata?.endsAt, "2026-05-19T10:00:00.000Z");
    assert.equal(result?.metadata?.source, "clawjs-time");
    assert.equal(result?.metadata?.hasPage, false);
    assert.equal(result?.snippet?.includes("fast path budgets") || result?.fragments?.some((fragment) => fragment.title === "metadata" && fragment.snippet?.includes("fast path budgets")), true);
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
    const calendarDeleteRun = await runCliCapture(["search", "service", "run-once", "--source", "calendar.events", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(calendarDeleteRun.code, CLI_EXIT_OK);
    const calendarDeleteRunItem = (JSON.parse(calendarDeleteRun.stdout) as any).data.service.worker?.items.find((entry: any) => entry.source === "calendar.events");
    assert.deepEqual({ source: calendarDeleteRunItem?.source, operation: calendarDeleteRunItem?.operation, status: calendarDeleteRunItem?.status, indexed: calendarDeleteRunItem?.indexed }, { source: "calendar.events", operation: "delete", status: "done", indexed: 1 });
    const afterCalendarDelete = await runCliCapture(["search", "query", "architecture review", "--sources", "calendar.events", "--filters", JSON.stringify({ "metadata.status": "active", redacted: false }), "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(afterCalendarDelete.code, CLI_EXIT_DEGRADED, afterCalendarDelete.stderr || afterCalendarDelete.stdout);
    const afterCalendarDeletePayload = JSON.parse(afterCalendarDelete.stdout) as any;
    assert.equal(afterCalendarDeletePayload.data.results.some((entry: any) => entry.source === "calendar.events" && entry.metadata?.eventId === "event-search-review"), false);
    const sqlite = new Database(resolveClawjsMainDbPath());
    try {
      ensureV1MainSchema(sqlite);
      const now = new Date().toISOString();
      sqlite.prepare(`
        INSERT INTO calendar_events (id, title, starts_at, ends_at, calendar_id, source, external_id, page_id, metadata_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "event-calendar-metadata",
        "Core Calendar Metadata Review",
        "2026-05-20T09:00:00.000Z",
        "2026-05-20T10:00:00.000Z",
        "engineering",
        "core",
        null,
        null,
        JSON.stringify({ agenda: "calendar-metadata-fragment-needle", credentials: { apiKey: "calendar-secret-never-index" } }),
        now,
        now,
      );
    } finally {
      sqlite.close();
    }
    const metadataRebuild = await runCliCapture(["search", "rebuild", "--source", "calendar.events", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(metadataRebuild.code, CLI_EXIT_OK);
    const metadataQuery = await runCliCapture(["search", "query", "calendar-metadata-fragment-needle", "--sources", "calendar.events", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(metadataQuery.code, CLI_EXIT_OK);
    const metadataQueryPayload = JSON.parse(metadataQuery.stdout) as {
      data: { results: Array<{ title: string; fragments?: Array<{ title?: string; snippet?: string }> }> };
    };
    const metadataResult = metadataQueryPayload.data.results.find((entry) => entry.title === "Core Calendar Metadata Review");
    assert.equal(metadataResult?.fragments?.some((fragment) => fragment.title === "metadata" && fragment.snippet?.includes("calendar-metadata-fragment-needle")), true);
    assert.equal(JSON.stringify(metadataQueryPayload.data.results).includes("calendar-secret-never-index"), false);
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
    const sqlite = new Database(resolveClawjsMainDbPath());
    try {
      const row = sqlite.prepare("SELECT data_json FROM records WHERE namespace_id = 'main' AND collection_name = 'transactions' AND id = ?").get(createdPayload.data.id) as { data_json: string };
      const payload = JSON.parse(row.data_json) as Record<string, unknown>;
      payload.metadata = {
        workflow: "finance-metadata-fragment-needle",
        credentials: { token: "finance-metadata-secret-never-index" },
      };
      sqlite.prepare("UPDATE records SET data_json = ?, updated_at = ? WHERE namespace_id = 'main' AND collection_name = 'transactions' AND id = ?").run(JSON.stringify(payload), "2026-05-17T12:00:00.000Z", createdPayload.data.id);
    } finally {
      sqlite.close();
    }
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
    const searchSqlite = new Database(path.join(dataRoot, "search.sqlite"), { readonly: true, fileMustExist: true });
    try {
      const stored = searchSqlite.prepare("SELECT body FROM search_documents WHERE source = 'finance.records' AND resource_id = ?").get(`main:transactions:${createdPayload.data.id}`) as { body: string };
      assert.equal(stored.body.includes("finance-metadata-fragment-needle"), true, stored.body);
      assert.equal(stored.body.includes("finance-metadata-secret-never-index"), false);
    } finally {
      searchSqlite.close();
    }
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
    const metadataQuery = await runCliCapture(["search", "query", "finance-metadata-fragment-needle", "--sources", "finance.records", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(metadataQuery.code, CLI_EXIT_OK, metadataQuery.stderr || metadataQuery.stdout);
    const metadataQueryPayload = JSON.parse(metadataQuery.stdout) as { data: { results: Array<{ metadata?: { recordId?: string } }> } };
    assert.equal(metadataQueryPayload.data.results.some((entry) => entry.metadata?.recordId === createdPayload.data.id), true);
    assert.equal(JSON.stringify(metadataQueryPayload.data.results).includes("finance-metadata-secret-never-index"), false);
    const metadataSecretQuery = await runCliCapture(["search", "query", "finance-metadata-secret-never-index", "--sources", "finance.records", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(metadataSecretQuery.code, CLI_EXIT_DEGRADED, metadataSecretQuery.stderr || metadataSecretQuery.stdout);
    const metadataSecretPayload = JSON.parse(metadataSecretQuery.stdout) as { data: { results: unknown[] } };
    assert.equal(metadataSecretPayload.data.results.length, 0);
    const deleted = await runCliCapture(["transaction", "delete", createdPayload.data.id, "--json"], workspaceRoot);
    assert.equal(deleted.code, CLI_EXIT_OK);
    const deleteJobs = await runCliCapture(["search", "jobs", "--source", "finance.records", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleteJobs.code, CLI_EXIT_OK);
    const deleteJobsPayload = JSON.parse(deleteJobs.stdout) as {
      data: { items: Array<{ operation: string; resourceId: string; payload: { recordId?: string } }> };
    };
    const deleteJob = deleteJobsPayload.data.items.find((job) => job.operation === "delete" && job.resourceId === `main:transactions:${createdPayload.data.id}`);
    assert.equal(deleteJob?.payload.recordId, createdPayload.data.id);
    const financeDeleteRun = await runCliCapture(["search", "service", "run-once", "--source", "finance.records", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(financeDeleteRun.code, CLI_EXIT_OK);
    const financeDeleteRunItem = (JSON.parse(financeDeleteRun.stdout) as any).data.service.worker?.items.find((entry: any) => entry.source === "finance.records");
    assert.deepEqual({ source: financeDeleteRunItem?.source, operation: financeDeleteRunItem?.operation, status: financeDeleteRunItem?.status, indexed: financeDeleteRunItem?.indexed }, { source: "finance.records", operation: "delete", status: "done", indexed: 1 });
    const afterFinanceRecordDelete = await runCliCapture(["search", "query", "travel invoice", "--sources", "finance.records", "--filters", JSON.stringify({ "metadata.currency": "USD", redacted: true }), "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(afterFinanceRecordDelete.code, CLI_EXIT_DEGRADED, afterFinanceRecordDelete.stderr || afterFinanceRecordDelete.stdout);
    const afterFinanceRecordDeletePayload = JSON.parse(afterFinanceRecordDelete.stdout) as any;
    assert.equal(afterFinanceRecordDeletePayload.data.results.some((entry: any) => entry.source === "finance.records" && entry.metadata?.recordId === createdPayload.data.id), false);
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
      "--metadata",
      JSON.stringify({
        workflow: "finance-local-metadata-fragment-needle",
        credentials: { token: "finance-local-metadata-secret-never-index" },
      }),
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
    const metadataQuery = await runCliCapture(["search", "query", "finance-local-metadata-fragment-needle", "--sources", "finance.records", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(metadataQuery.code, CLI_EXIT_OK, metadataQuery.stderr || metadataQuery.stdout);
    const metadataQueryPayload = JSON.parse(metadataQuery.stdout) as { data: { results: Array<{ metadata?: { recordId?: string } }> } };
    assert.equal(metadataQueryPayload.data.results.some((entry) => entry.metadata?.recordId === "finance.local.invoice"), true);
    assert.equal(JSON.stringify(metadataQueryPayload.data.results).includes("finance-local-metadata-secret-never-index"), false);
    const metadataSecretQuery = await runCliCapture(["search", "query", "finance-local-metadata-secret-never-index", "--sources", "finance.records", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(metadataSecretQuery.code, CLI_EXIT_DEGRADED, metadataSecretQuery.stderr || metadataSecretQuery.stdout);
    const metadataSecretPayload = JSON.parse(metadataSecretQuery.stdout) as { data: { results: unknown[] } };
    assert.equal(metadataSecretPayload.data.results.length, 0);
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
    const financeLocalDeleteRun = await runCliCapture(["search", "service", "run-once", "--source", "finance.records", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(financeLocalDeleteRun.code, CLI_EXIT_OK);
    const financeLocalDeleteRunItem = (JSON.parse(financeLocalDeleteRun.stdout) as any).data.service.worker?.items.find((entry: any) => entry.source === "finance.records");
    assert.deepEqual({ source: financeLocalDeleteRunItem?.source, operation: financeLocalDeleteRunItem?.operation, status: financeLocalDeleteRunItem?.status, indexed: financeLocalDeleteRunItem?.indexed }, { source: "finance.records", operation: "delete", status: "done", indexed: 1 });
    const afterFinanceLocalDelete = await runCliCapture(["search", "query", "sensitive launch invoice evidence", "--sources", "finance.records", "--filters", JSON.stringify({ "metadata.table": "finance_records", redacted: true }), "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(afterFinanceLocalDelete.code, CLI_EXIT_DEGRADED, afterFinanceLocalDelete.stderr || afterFinanceLocalDelete.stdout);
    const afterFinanceLocalDeletePayload = JSON.parse(afterFinanceLocalDelete.stdout) as any;
    assert.equal(afterFinanceLocalDeletePayload.data.results.some((entry: any) => entry.source === "finance.records" && entry.metadata?.recordId === "finance.local.invoice"), false);
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
    const elnDeleteRun = await runCliCapture(["search", "service", "run-once", "--source", "eln.records", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(elnDeleteRun.code, CLI_EXIT_OK);
    const elnDeleteRunItem = (JSON.parse(elnDeleteRun.stdout) as any).data.service.worker?.items.find((entry: any) => entry.source === "eln.records");
    assert.deepEqual({ source: elnDeleteRunItem?.source, operation: elnDeleteRunItem?.operation, status: elnDeleteRunItem?.status, indexed: elnDeleteRunItem?.indexed }, { source: "eln.records", operation: "delete", status: "done", indexed: 1 });
    const afterElnDelete = await runCliCapture(["search", "query", "marker dose response", "--sources", "eln.records", "--filters", JSON.stringify({ "metadata.collection": "lab_notebooks", redacted: false }), "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(afterElnDelete.code, CLI_EXIT_DEGRADED, afterElnDelete.stderr || afterElnDelete.stdout);
    const afterElnDeletePayload = JSON.parse(afterElnDelete.stdout) as any;
    assert.equal(afterElnDeletePayload.data.results.some((entry: any) => entry.source === "eln.records" && entry.metadata?.recordId === createdPayload.data.id), false);
  });
});
