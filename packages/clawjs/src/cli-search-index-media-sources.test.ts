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
      metadata: {
        campaign: "images-metadata-fragment-needle",
        credentials: { token: "images-metadata-secret-never-index" },
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
    assert.equal(result?.fragments?.some((fragment) => fragment.title === "metadata" && fragment.snippet?.includes("images-metadata-fragment-needle")), true);
    assert.ok(result?.explanation?.matchedBy?.length);
    assert.equal(queryPayload.data.facets?.some((facet) => facet.id === "imageType"), true);
    const metadataQuery = await runCliCapture([
      "search",
      "query",
      "images-metadata-fragment-needle",
      "--sources",
      "images.derived",
      "--workspace",
      workspaceRoot,
      "--data-dir",
      dataRoot,
      "--json",
      "--limit",
      "5",
    ], workspaceRoot);
    assert.equal(metadataQuery.code, CLI_EXIT_OK, metadataQuery.stderr || metadataQuery.stdout);
    const metadataQueryPayload = JSON.parse(metadataQuery.stdout) as {
      data: { results: Array<{ source: string; title: string; fragments?: Array<{ title?: string; snippet?: string }> }> };
    };
    const metadataResult = metadataQueryPayload.data.results.find((entry) => entry.source === "images.derived" && entry.title === "Launch Badge");
    assert.equal(metadataResult?.fragments?.some((fragment) => fragment.title === "metadata" && fragment.snippet?.includes("images-metadata-fragment-needle")), true);
    const metadataSecretQuery = await runCliCapture([
      "search",
      "query",
      "images-metadata-secret-never-index",
      "--sources",
      "images.derived",
      "--workspace",
      workspaceRoot,
      "--data-dir",
      dataRoot,
      "--json",
      "--limit",
      "5",
    ], workspaceRoot);
    assert.equal(metadataSecretQuery.code, CLI_EXIT_DEGRADED, metadataSecretQuery.stderr || metadataSecretQuery.stdout);
    const metadataSecretQueryPayload = JSON.parse(metadataSecretQuery.stdout) as { data: { results: Array<{ source: string; title: string }> } };
    assert.equal(metadataSecretQueryPayload.data.results.some((entry) => entry.source === "images.derived" && entry.title === "Launch Badge"), false);
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
      workflow: "media-metadata-fragment-needle",
      credentials: { token: "media-metadata-secret-never-index" },
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
    assert.equal(result?.fragments?.some((fragment) => fragment.title === "metadata" && fragment.snippet?.includes("media-metadata-fragment-needle")), true);
    assert.ok(result?.explanation?.matchedBy?.length);
    assert.equal(queryPayload.data.facets?.some((facet) => facet.id === "kind"), true);
    const metadataQuery = await runCliCapture([
      "search",
      "query",
      "media-metadata-fragment-needle",
      "--sources",
      "media.assets",
      "--workspace",
      workspaceRoot,
      "--data-dir",
      dataRoot,
      "--json",
      "--limit",
      "5",
    ], workspaceRoot);
    assert.equal(metadataQuery.code, CLI_EXIT_OK, metadataQuery.stderr || metadataQuery.stdout);
    const metadataQueryPayload = JSON.parse(metadataQuery.stdout) as {
      data: { results: Array<{ source: string; title: string; fragments?: Array<{ title?: string; snippet?: string }> }> };
    };
    const metadataResult = metadataQueryPayload.data.results.find((entry) => entry.source === "media.assets" && entry.title === "Requirements Brief.pdf");
    assert.equal(metadataResult?.fragments?.some((fragment) => fragment.title === "metadata" && fragment.snippet?.includes("media-metadata-fragment-needle")), true);
    const metadataSecretQuery = await runCliCapture([
      "search",
      "query",
      "media-metadata-secret-never-index",
      "--sources",
      "media.assets",
      "--workspace",
      workspaceRoot,
      "--data-dir",
      dataRoot,
      "--json",
      "--limit",
      "5",
    ], workspaceRoot);
    assert.equal(metadataSecretQuery.code, CLI_EXIT_DEGRADED, metadataSecretQuery.stderr || metadataSecretQuery.stdout);
    const metadataSecretQueryPayload = JSON.parse(metadataSecretQuery.stdout) as { data: { results: Array<{ source: string; title: string }> } };
    assert.equal(metadataSecretQueryPayload.data.results.some((entry) => entry.source === "media.assets" && entry.title === "Requirements Brief.pdf"), false);
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
