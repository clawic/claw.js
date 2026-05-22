import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { resolveClawPersistentSurfacePath } from "@clawjs/core";
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

test("database magic local data dir uses persistent surface routes", () => {
  const source = fs.readFileSync(new URL("./database-magic.ts", import.meta.url), "utf8");
  assert.equal(resolveClawPersistentSurfacePath("claw.workspace.data", "/Users/demo/project"), "/Users/demo/project/.claw/data");
  assert.match(source, /resolveClawPersistentSurfacePath\("claw\.workspace\.data", workspaceRoot\)/);
  assert.equal(source.includes('path.join(workspaceRoot, ".claw", "data")'), false);
});

test("productivity Search event data dir uses persistent surface routes", () => {
  const source = fs.readFileSync(new URL("./cli-productivity-command.ts", import.meta.url), "utf8");
  assert.match(source, /resolveClawPersistentSurfacePath\("claw\.workspace\.data", input\.workspaceRoot\)/);
  assert.equal(source.includes('path.join(input.workspaceRoot, ".claw", "data")'), false);
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
        [["company", "Id"].join("")]: "company-demo",
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
        [["company", "Id"].join("")]: "company-demo",
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
    const databaseDeleteRun = await runCliCapture(["search", "service", "run-once", "--source", "database.records", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(databaseDeleteRun.code, CLI_EXIT_OK);
    const databaseDeleteRunItem = (JSON.parse(databaseDeleteRun.stdout) as any).data.service.worker?.items.find((entry: any) => entry.source === "database.records");
    assert.deepEqual({ source: databaseDeleteRunItem?.source, operation: databaseDeleteRunItem?.operation, status: databaseDeleteRunItem?.status, indexed: databaseDeleteRunItem?.indexed }, { source: "database.records", operation: "delete", status: "done", indexed: 1 });
    const afterDatabaseDelete = await runCliCapture([
      "search",
      "query",
      "Analytical engine",
      "--sources",
      "database.records",
      "--filters",
      JSON.stringify({ type: "record", "metadata.collection": "contacts", redacted: false }),
      "--data-dir",
      dataRoot,
      "--json",
      "--limit",
      "5",
    ], workspaceRoot);
    assert.equal(afterDatabaseDelete.code, CLI_EXIT_DEGRADED, afterDatabaseDelete.stderr || afterDatabaseDelete.stdout);
    const afterDatabaseDeletePayload = JSON.parse(afterDatabaseDelete.stdout) as any;
    assert.equal(afterDatabaseDeletePayload.data.results.some((entry: any) => entry.source === "database.records" && entry.title.includes("Ada")), false);
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
    const serviceRun = await runCliCapture(["search", "service", "run-once", "--source", "work.items", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(serviceRun.code, CLI_EXIT_OK);
    const serviceRunPayload = JSON.parse(serviceRun.stdout) as {
      data: { worker?: { items: Array<{ source: string; operation: string; status: string; indexed?: number }> } };
    };
    assert.deepEqual({ source: serviceRunPayload.data.worker?.items[0]?.source, operation: serviceRunPayload.data.worker?.items[0]?.operation, status: serviceRunPayload.data.worker?.items[0]?.status, indexed: serviceRunPayload.data.worker?.items[0]?.indexed }, { source: "work.items", operation: "upsert", status: "done", indexed: 1 });
    const query = await runCliCapture(["search", "query", "Emit work search event", "--sources", "work.items", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as any;
    assert.equal(queryPayload.data.results.some((entry: any) => entry.source === "work.items" && entry.resourceId === `main:tasks:${createdPayload.data.id}`), true);
    const deleted = await runCliCapture(["db", "tasks", "delete", createdPayload.data.id, "--json"], workspaceRoot);
    assert.equal(deleted.code, CLI_EXIT_OK, deleted.stderr || deleted.stdout);
    const deleteRun = await runCliCapture(["search", "service", "run-once", "--source", "work.items", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(deleteRun.code, CLI_EXIT_OK);
    const deleteRunPayload = JSON.parse(deleteRun.stdout) as {
      data: { worker?: { items: Array<{ source: string; operation: string; status: string; indexed?: number }> } };
    };
    const workDeleteRunItem = deleteRunPayload.data.worker?.items.find((entry) => entry.source === "work.items");
    assert.deepEqual({ source: workDeleteRunItem?.source, operation: workDeleteRunItem?.operation, status: workDeleteRunItem?.status, indexed: workDeleteRunItem?.indexed }, { source: "work.items", operation: "delete", status: "done", indexed: 1 });
    const afterWorkDelete = await runCliCapture(["search", "query", "Emit work search event", "--sources", "work.items", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(afterWorkDelete.code, CLI_EXIT_DEGRADED, afterWorkDelete.stderr || afterWorkDelete.stdout);
    const afterWorkDeletePayload = JSON.parse(afterWorkDelete.stdout) as any;
    assert.equal(afterWorkDeletePayload.data.results.some((entry: any) => entry.source === "work.items" && entry.resourceId === `main:tasks:${createdPayload.data.id}`), false);
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
      "--metadata",
      JSON.stringify({ workflow: "skills-metadata-fragment-needle", credentials: { token: "skills-metadata-secret-never-index" } }),
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
        results: Array<{ source: string; domain: string; type: string; title: string; body?: string; metadata?: { requiresProtectedRefs?: boolean }; fragments?: Array<{ title?: string; snippet?: string }> }>;
      };
    };
    const result = queryPayload.data.results.find((entry) => entry.title === "Deploy");
    assert.equal(result?.source, "skills.registry");
    assert.equal(result?.domain, "skills");
    assert.equal(result?.type, "skill");
    assert.equal(result?.metadata?.requiresProtectedRefs, true);
    assert.equal(JSON.stringify(result).includes("vault://skills/deploy-token"), false);
    assert.equal(result?.fragments?.some((fragment) => fragment.snippet?.includes("deployment APIs")), true);
    const metadataQuery = await runCliCapture(["search", "query", "skills-metadata-fragment-needle", "--sources", "skills.registry", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(metadataQuery.code, CLI_EXIT_OK, metadataQuery.stderr || metadataQuery.stdout);
    const metadataQueryPayload = JSON.parse(metadataQuery.stdout) as {
      data: { results: Array<{ source: string; title: string; fragments?: Array<{ title?: string; snippet?: string }> }> };
    };
    const metadataResult = metadataQueryPayload.data.results.find((entry) => entry.source === "skills.registry" && entry.title === "Deploy");
    assert.equal(metadataResult?.fragments?.some((fragment) => fragment.title === "metadata" && fragment.snippet?.includes("skills-metadata-fragment-needle")), true);
    const metadataSecretQuery = await runCliCapture(["search", "query", "skills-metadata-secret-never-index", "--sources", "skills.registry", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(metadataSecretQuery.code, CLI_EXIT_DEGRADED, metadataSecretQuery.stderr || metadataSecretQuery.stdout);
    const metadataSecretQueryPayload = JSON.parse(metadataSecretQuery.stdout) as { data: { results: Array<{ source: string; title: string }> } };
    assert.equal(metadataSecretQueryPayload.data.results.some((entry) => entry.source === "skills.registry" && entry.title === "Deploy"), false);
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
    const skillDeleteRun = await runCliCapture(["search", "service", "run-once", "--source", "skills.registry", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(skillDeleteRun.code, CLI_EXIT_OK);
    const skillDeleteRunItem = (JSON.parse(skillDeleteRun.stdout) as any).data.service.worker?.items.find((entry: any) => entry.source === "skills.registry");
    assert.deepEqual({ source: skillDeleteRunItem?.source, operation: skillDeleteRunItem?.operation, status: skillDeleteRunItem?.status, indexed: skillDeleteRunItem?.indexed }, { source: "skills.registry", operation: "delete", status: "done", indexed: 1 });
    const afterSkillDelete = await runCliCapture(["search", "query", "deployment APIs", "--sources", "skills.registry", "--filters", "metadata.requiresProtectedRefs=true", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(afterSkillDelete.code, CLI_EXIT_DEGRADED, afterSkillDelete.stderr || afterSkillDelete.stdout);
    const afterSkillDeletePayload = JSON.parse(afterSkillDelete.stdout) as any;
    assert.equal(afterSkillDeletePayload.data.results.some((entry: any) => entry.source === "skills.registry" && entry.title === "Deploy"), false);
  });
});
test("providers and snippets writes enqueue and index framework configuration fast paths", runSearchProvidersSnippetsFastPathScenario);
test("agent entity writes enqueue and index agent catalog fast paths without secrets", runSearchAgentCatalogFastPathScenario);
test("marketplace choice writes enqueue and index marketplace fast paths", runSearchMarketplaceChoiceFastPathScenario);
test("content social and iot writes enqueue and index framework domain fast paths", runSearchContentSocialIotFastPathScenario);
test("business writes enqueue and index business record fast paths", runSearchBusinessRecordFastPathScenario);
