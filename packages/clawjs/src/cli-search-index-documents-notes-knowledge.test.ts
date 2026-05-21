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
        [["company", "Id"].join("")]: "company-demo",
        title: "Implementation Blueprint",
        content: "Search sections need independent document fast paths.",
        contentData: {
          summary: "documents-content-data-fragment-needle",
          metadata: { secretToken: "documents-content-data-secret-never-index" },
        },
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
    const contentDataQuery = await runCliCapture([
      "search",
      "query",
      "documents-content-data-fragment-needle",
      "--sources",
      "documents.blocks",
      "--data-dir",
      dataRoot,
      "--json",
      "--limit",
      "5",
    ], workspaceRoot);
    assert.equal(contentDataQuery.code, CLI_EXIT_OK, contentDataQuery.stderr || contentDataQuery.stdout);
    const contentDataQueryPayload = JSON.parse(contentDataQuery.stdout) as {
      data: { results: Array<{ source: string; title: string; fragments?: Array<{ title?: string; snippet?: string }> }> };
    };
    const contentDataResult = contentDataQueryPayload.data.results.find((entry) => entry.source === "documents.blocks" && entry.title === "Implementation Blueprint");
    assert.equal(contentDataResult?.fragments?.some((fragment) => fragment.title === "content data" && fragment.snippet?.includes("documents-content-data-fragment-needle")), true);
    const contentDataSecretQuery = await runCliCapture([
      "search",
      "query",
      "documents-content-data-secret-never-index",
      "--sources",
      "documents.blocks",
      "--data-dir",
      dataRoot,
      "--json",
      "--limit",
      "5",
    ], workspaceRoot);
    assert.equal(contentDataSecretQuery.code, CLI_EXIT_DEGRADED, contentDataSecretQuery.stderr || contentDataSecretQuery.stdout);
    const contentDataSecretQueryPayload = JSON.parse(contentDataSecretQuery.stdout) as { data: { results: Array<{ source: string; title: string }> } };
    assert.equal(contentDataSecretQueryPayload.data.results.some((entry) => entry.source === "documents.blocks" && entry.title === "Implementation Blueprint"), false);

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
    const providerEmbeddingsJob = await runCliCapture([
      "search",
      "jobs",
      "enqueue",
      "embed",
      "--source",
      "documents.blocks",
      "--id",
      "job:documents:provider-embed",
      "--payload",
      JSON.stringify({ model: "provider-text-v1", limit: 10 }),
      "--data-dir",
      dataRoot,
      "--json",
    ], workspaceRoot);
    assert.equal(providerEmbeddingsJob.code, CLI_EXIT_OK);
    const providerEmbeddingsServiceRun = await runCliCapture(["search", "service", "run-once", "--source", "documents.blocks", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(providerEmbeddingsServiceRun.code, CLI_EXIT_OK);
    const providerEmbeddingsServiceRunPayload = JSON.parse(providerEmbeddingsServiceRun.stdout) as {
      data: { worker?: { items: Array<{ id: string; source: string; operation: string; status: string; error?: string }> } };
    };
    assert.equal(providerEmbeddingsServiceRunPayload.data.worker?.items[0]?.id, "job:documents:provider-embed");
    assert.equal(providerEmbeddingsServiceRunPayload.data.worker?.items[0]?.source, "documents.blocks");
    assert.equal(providerEmbeddingsServiceRunPayload.data.worker?.items[0]?.operation, "embed");
    assert.equal(providerEmbeddingsServiceRunPayload.data.worker?.items[0]?.status, "failed");
    assert.match(providerEmbeddingsServiceRunPayload.data.worker?.items[0]?.error ?? "", /SEARCH_EMBEDDING_PROVIDER_PENDING/);
    assert.match(providerEmbeddingsServiceRunPayload.data.worker?.items[0]?.error ?? "", /EXTERNAL PENDING/);
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
test("document writes enqueue and tombstone documents.blocks jobs", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-document-delete-"));
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
        [["company", "Id"].join("")]: "company-delete",
        title: "Delete Me Document",
        content: "Document block delete sentinel",
        scopeKind: "project",
        scopeId: "project-delete",
        accessLevel: "PUBLIC",
      }),
      "--json",
    ], workspaceRoot);
    assert.equal(createDocument.code, CLI_EXIT_OK, createDocument.stderr || createDocument.stdout);
    const createDocumentPayload = JSON.parse(createDocument.stdout) as { data: { id: string } };
    const upsertRun = await runCliCapture(["search", "service", "run-once", "--source", "documents.blocks", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(upsertRun.code, CLI_EXIT_OK);
    const upsertRunPayload = JSON.parse(upsertRun.stdout) as {
      data: { worker?: { items: Array<{ source: string; operation: string; status: string; indexed?: number }> } };
    };
    assert.deepEqual({ source: upsertRunPayload.data.worker?.items[0]?.source, operation: upsertRunPayload.data.worker?.items[0]?.operation, status: upsertRunPayload.data.worker?.items[0]?.status, indexed: upsertRunPayload.data.worker?.items[0]?.indexed }, { source: "documents.blocks", operation: "upsert", status: "done", indexed: 1 });
    const query = await runCliCapture(["search", "query", "delete sentinel", "--sources", "documents.blocks", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK, query.stderr || query.stdout);
    const queryPayload = JSON.parse(query.stdout) as any;
    assert.equal(queryPayload.data.results.some((entry: any) => entry.source === "documents.blocks" && entry.resourceId === `main:documents:${createDocumentPayload.data.id}`), true);
    const deleted = await runCliCapture(["db", "documents", "delete", createDocumentPayload.data.id, "--json"], workspaceRoot);
    assert.equal(deleted.code, CLI_EXIT_OK, deleted.stderr || deleted.stdout);
    const deleteRun = await runCliCapture(["search", "service", "run-once", "--source", "documents.blocks", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(deleteRun.code, CLI_EXIT_OK);
    const deleteRunPayload = JSON.parse(deleteRun.stdout) as {
      data: { worker?: { items: Array<{ source: string; operation: string; status: string; indexed?: number }> } };
    };
    const documentDeleteRunItem = deleteRunPayload.data.worker?.items.find((entry) => entry.source === "documents.blocks");
    assert.deepEqual({ source: documentDeleteRunItem?.source, operation: documentDeleteRunItem?.operation, status: documentDeleteRunItem?.status, indexed: documentDeleteRunItem?.indexed }, { source: "documents.blocks", operation: "delete", status: "done", indexed: 1 });
    const afterDocumentDelete = await runCliCapture(["search", "query", "delete sentinel", "--sources", "documents.blocks", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(afterDocumentDelete.code, CLI_EXIT_DEGRADED, afterDocumentDelete.stderr || afterDocumentDelete.stdout);
    const afterDocumentDeletePayload = JSON.parse(afterDocumentDelete.stdout) as any;
    assert.equal(afterDocumentDeletePayload.data.results.some((entry: any) => entry.source === "documents.blocks" && entry.resourceId === `main:documents:${createDocumentPayload.data.id}`), false);
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
    const mainDb = new Database(resolveClawjsMainDbPath());
    try {
      mainDb.prepare("UPDATE pages SET properties_json = ?, updated_at = ? WHERE id = ?").run(JSON.stringify({
        workflow: "notes-properties-fragment-needle",
        metadata: { apiKey: "notes-properties-secret-never-index" },
      }), new Date().toISOString(), createdPayload.data.id);
    } finally {
      mainDb.close();
    }
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
    const propertiesQuery = await runCliCapture([
      "search",
      "query",
      "notes-properties-fragment-needle",
      "--sources",
      "notes.pages",
      "--data-dir",
      dataRoot,
      "--json",
      "--limit",
      "5",
    ], workspaceRoot);
    assert.equal(propertiesQuery.code, CLI_EXIT_OK, propertiesQuery.stderr || propertiesQuery.stdout);
    const propertiesQueryPayload = JSON.parse(propertiesQuery.stdout) as {
      data: { results: Array<{ source: string; title: string; fragments?: Array<{ title?: string; snippet?: string }> }> };
    };
    const propertiesResult = propertiesQueryPayload.data.results.find((entry) => entry.source === "notes.pages" && entry.title === "Quarterly planning");
    assert.equal(propertiesResult?.fragments?.some((fragment) => fragment.title === "properties" && fragment.snippet?.includes("notes-properties-fragment-needle")), true);
    const secretQuery = await runCliCapture([
      "search",
      "query",
      "notes-properties-secret-never-index",
      "--sources",
      "notes.pages",
      "--data-dir",
      dataRoot,
      "--json",
      "--limit",
      "5",
    ], workspaceRoot);
    assert.equal(secretQuery.code, CLI_EXIT_DEGRADED, secretQuery.stderr || secretQuery.stdout);
    const secretQueryPayload = JSON.parse(secretQuery.stdout) as { data: { results: Array<{ source: string; title: string }> } };
    assert.equal(secretQueryPayload.data.results.some((entry) => entry.source === "notes.pages" && entry.title === "Quarterly planning"), false);
    const deleted = await runCliCapture(["notes", "delete", createdPayload.data.id, "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleted.code, CLI_EXIT_OK);
    const deleteJobs = await runCliCapture(["search", "jobs", "--source", "notes.pages", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleteJobs.code, CLI_EXIT_OK);
    const deleteJobsPayload = JSON.parse(deleteJobs.stdout) as {
      data: { items: Array<{ operation: string; resourceId: string; payload: { pageId?: string } }> };
    };
    const deleteJob = deleteJobsPayload.data.items.find((job) => job.operation === "delete" && job.resourceId === createdPayload.data.id);
    assert.equal(deleteJob?.payload.pageId, createdPayload.data.id);
    const notesDeleteRun = await runCliCapture(["search", "service", "run-once", "--source", "notes.pages", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(notesDeleteRun.code, CLI_EXIT_OK);
    const notesDeleteRunItem = (JSON.parse(notesDeleteRun.stdout) as any).data.service.worker?.items.find((entry: any) => entry.source === "notes.pages");
    assert.deepEqual({ source: notesDeleteRunItem?.source, operation: notesDeleteRunItem?.operation, status: notesDeleteRunItem?.status, indexed: notesDeleteRunItem?.indexed }, { source: "notes.pages", operation: "delete", status: "done", indexed: 1 });
    const afterNotesDelete = await runCliCapture([
      "search",
      "query",
      "launch priorities",
      "--sources",
      "notes.pages",
      "--filters",
      JSON.stringify({ "metadata.space": "notes", redacted: false }),
      "--data-dir",
      dataRoot,
      "--json",
      "--limit",
      "5",
    ], workspaceRoot);
    assert.equal(afterNotesDelete.code, CLI_EXIT_DEGRADED, afterNotesDelete.stderr || afterNotesDelete.stdout);
    const afterNotesDeletePayload = JSON.parse(afterNotesDelete.stdout) as any;
    assert.equal(afterNotesDeletePayload.data.results.some((entry: any) => entry.source === "notes.pages" && entry.title === "Quarterly planning"), false);
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
      JSON.stringify({ marker: "knowledge-properties-fragment-needle", sourceSteward: "search", stage: "initial", credentials: { token: "knowledge-properties-secret-never-index" } }),
      "--provenance",
      JSON.stringify({ marker: "knowledge-entity-provenance-fragment-needle", source: "fixture", credentials: { apiKey: "knowledge-entity-provenance-secret-never-index" } }),
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
      "--scope",
      JSON.stringify({ marker: "knowledge-scope-fragment-needle", workspace: "search", credentials: { token: "knowledge-scope-secret-never-index" } }),
      "--provenance",
      JSON.stringify({ marker: "knowledge-fact-provenance-fragment-needle", source: "fixture", credentials: { apiKey: "knowledge-fact-provenance-secret-never-index" } }),
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
    const propertiesQuery = await runCliCapture(["search", "query", "knowledge-properties-fragment-needle", "--sources", "knowledge.graph", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(propertiesQuery.code, CLI_EXIT_OK);
    const propertiesPayload = JSON.parse(propertiesQuery.stdout) as {
      data: { results: Array<{ title: string; fragments?: Array<{ title?: string; snippet?: string }> }> };
    };
    const propertiesResult = propertiesPayload.data.results.find((entry) => entry.title === "Search System");
    assert.equal(propertiesResult?.fragments?.some((fragment) => fragment.title === "properties" && fragment.snippet?.includes("knowledge-properties-fragment-needle")), true);
    assert.equal(JSON.stringify(propertiesPayload.data.results).includes("knowledge-properties-secret-never-index"), false);
    const entityProvenanceQuery = await runCliCapture(["search", "query", "knowledge-entity-provenance-fragment-needle", "--sources", "knowledge.graph", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(entityProvenanceQuery.code, CLI_EXIT_OK);
    const entityProvenancePayload = JSON.parse(entityProvenanceQuery.stdout) as {
      data: { results: Array<{ title: string; fragments?: Array<{ title?: string; snippet?: string }> }> };
    };
    const entityProvenanceResult = entityProvenancePayload.data.results.find((entry) => entry.title === "Search System");
    assert.equal(entityProvenanceResult?.fragments?.some((fragment) => fragment.title === "provenance" && fragment.snippet?.includes("knowledge-entity-provenance-fragment-needle")), true);
    assert.equal(JSON.stringify(entityProvenancePayload.data.results).includes("knowledge-entity-provenance-secret-never-index"), false);
    const scopeQuery = await runCliCapture(["search", "query", "knowledge-scope-fragment-needle", "--sources", "knowledge.graph", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(scopeQuery.code, CLI_EXIT_OK);
    const scopePayload = JSON.parse(scopeQuery.stdout) as {
      data: { results: Array<{ title: string; fragments?: Array<{ title?: string; snippet?: string }> }> };
    };
    const scopeResult = scopePayload.data.results.find((entry) => entry.title.includes("prefers"));
    assert.equal(scopeResult?.fragments?.some((fragment) => fragment.title === "scope" && fragment.snippet?.includes("knowledge-scope-fragment-needle")), true);
    assert.equal(JSON.stringify(scopePayload.data.results).includes("knowledge-scope-secret-never-index"), false);
    const factProvenanceQuery = await runCliCapture(["search", "query", "knowledge-fact-provenance-fragment-needle", "--sources", "knowledge.graph", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(factProvenanceQuery.code, CLI_EXIT_OK);
    const factProvenancePayload = JSON.parse(factProvenanceQuery.stdout) as {
      data: { results: Array<{ title: string; fragments?: Array<{ title?: string; snippet?: string }> }> };
    };
    const factProvenanceResult = factProvenancePayload.data.results.find((entry) => entry.title.includes("prefers"));
    assert.equal(factProvenanceResult?.fragments?.some((fragment) => fragment.title === "provenance" && fragment.snippet?.includes("knowledge-fact-provenance-fragment-needle")), true);
    assert.equal(JSON.stringify(factProvenancePayload.data.results).includes("knowledge-fact-provenance-secret-never-index"), false);
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
    const knowledgeDeleteRun = await runCliCapture(["search", "service", "run-once", "--source", "knowledge.graph", "--data-dir", dataRoot, "--json", "--limit", "2"], workspaceRoot);
    assert.equal(knowledgeDeleteRun.code, CLI_EXIT_OK);
    const knowledgeDeleteRunItems = (JSON.parse(knowledgeDeleteRun.stdout) as any).data.service.worker?.items.filter((entry: any) => entry.source === "knowledge.graph" && entry.operation === "delete") ?? [];
    assert.equal(knowledgeDeleteRunItems.length, 2);
    assert.equal(knowledgeDeleteRunItems.every((entry: any) => entry.status === "done" && entry.indexed === 1), true);
    assert.deepEqual({ source: knowledgeDeleteRunItems[0]?.source, operation: knowledgeDeleteRunItems[0]?.operation, status: knowledgeDeleteRunItems[0]?.status, indexed: knowledgeDeleteRunItems[0]?.indexed }, { source: "knowledge.graph", operation: "delete", status: "done", indexed: 1 });
    const afterKnowledgeFactDelete = await runCliCapture([
      "search",
      "query",
      "fast scoped Search results",
      "--sources",
      "knowledge.graph",
      "--filters",
      JSON.stringify({ "metadata.kind": "fact", "metadata.predicate": "prefers", redacted: false }),
      "--data-dir",
      dataRoot,
      "--json",
      "--limit",
      "5",
    ], workspaceRoot);
    assert.equal(afterKnowledgeFactDelete.code, CLI_EXIT_DEGRADED, afterKnowledgeFactDelete.stderr || afterKnowledgeFactDelete.stdout);
    const afterKnowledgeFactDeletePayload = JSON.parse(afterKnowledgeFactDelete.stdout) as any;
    assert.equal(afterKnowledgeFactDeletePayload.data.results.some((entry: any) => entry.source === "knowledge.graph" && entry.metadata?.factId === "fact-search-preference"), false);
    const afterKnowledgeEntityDelete = await runCliCapture([
      "search",
      "query",
      "framework knowledge launcher ranking",
      "--sources",
      "knowledge.graph",
      "--filters",
      JSON.stringify({ "metadata.kind": "entity", redacted: false }),
      "--data-dir",
      dataRoot,
      "--json",
      "--limit",
      "5",
    ], workspaceRoot);
    assert.equal(afterKnowledgeEntityDelete.code, CLI_EXIT_DEGRADED, afterKnowledgeEntityDelete.stderr || afterKnowledgeEntityDelete.stdout);
    const afterKnowledgeEntityDeletePayload = JSON.parse(afterKnowledgeEntityDelete.stdout) as any;
    assert.equal(afterKnowledgeEntityDeletePayload.data.results.some((entry: any) => entry.source === "knowledge.graph" && entry.metadata?.entityId === "entity-search-system"), false);
  });
});
