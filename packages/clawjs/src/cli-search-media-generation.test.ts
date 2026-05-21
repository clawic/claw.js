import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { CLI_EXIT_DEGRADED, CLI_EXIT_OK } from "./index.ts";
import { createFakeGenerationScript, runCliCapture, withPatchedEnv } from "./index-test-utils.ts";

test("search rebuild indexes generations.artifacts from workspace generation records", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-generations-"));
  const dataRoot = path.join(workspaceRoot, "data");
  const generationsDir = path.join(workspaceRoot, ".claw", "data", "collections", "generations");
  fs.mkdirSync(generationsDir, { recursive: true });
  fs.writeFileSync(path.join(generationsDir, "gen-demo-image.json"), JSON.stringify({
    id: "gen-demo-image",
    kind: "image",
    status: "succeeded",
    prompt: "Generate a launch dashboard hero image with analytics cards",
    title: "Launch Dashboard Hero",
    backendId: "command",
    backendLabel: "External Command",
    backendType: "command",
    backendSource: "ad_hoc",
    model: "local-test-model",
    createdAt: "2026-05-17T10:00:00.000Z",
    updatedAt: "2026-05-17T10:00:00.000Z",
    metadata: {
      style: "product",
      brief: "Search generated artifact indexing",
      workflow: "generations-metadata-fragment-needle",
      credentials: { token: "generations-metadata-secret-never-index" },
    },
    command: {
      command: "node",
      args: [
        "generate-image.js",
        "--preset",
        "launch-dashboard-preset",
        "--api-key",
        "generations-command-secret-never-index",
        "--token=generations-inline-secret-never-index",
      ],
    },
    outputRelativePath: "generations/image/gen-demo-image.png",
    outputMimeType: "image/png",
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
        indexedBySource: { "generations.artifacts": number };
      };
    };
    assert.equal(rebuildPayload.data.sources.includes("generations.artifacts"), true);
    assert.equal(rebuildPayload.data.pendingSources.includes("generations.artifacts"), false);
    assert.equal(rebuildPayload.data.indexedBySource["generations.artifacts"], 1);
    const query = await runCliCapture([
      "search",
      "query",
      "analytics cards",
      "--domains",
      "generations",
      "--filters",
      "metadata.kind=image,metadata.status=succeeded",
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
        results: Array<{
          source: string;
          domain: string;
          type: string;
          title: string;
          metadata?: { kind?: string; status?: string; backendId?: string; hasOutput?: boolean };
          actions?: Array<{ id: string; kind: string; requiresApproval?: boolean; grant?: string }>;
          fragments?: Array<{ title?: string; snippet?: string }>;
          explanation?: { matchedBy?: string[] };
        }>;
        facets?: Array<{ id: string; label: string }>;
      };
    };
    const result = queryPayload.data.results.find((candidate) => candidate.title === "Launch Dashboard Hero");
    assert.equal(result?.source, "generations.artifacts");
    assert.equal(result?.domain, "generations");
    assert.equal(result?.type, "image");
    assert.equal(result?.metadata?.kind, "image");
    assert.equal(result?.metadata?.status, "succeeded");
    assert.equal(result?.metadata?.backendId, "command");
    assert.equal(result?.metadata?.hasOutput, true);
    assert.equal(result?.actions?.some((action) => action.id === "open" && action.requiresApproval === true && action.grant === "search.generations.open"), true);
    assert.equal(result?.fragments?.some((fragment) => fragment.title === "prompt" && fragment.snippet?.includes("analytics cards")), true);
    assert.equal(result?.fragments?.some((fragment) => fragment.title === "metadata" && fragment.snippet?.includes("generations-metadata-fragment-needle")), true);
    assert.ok(result?.explanation?.matchedBy?.length);
    assert.equal(queryPayload.data.facets?.some((facet) => facet.id === "backendId"), true);
    const metadataQuery = await runCliCapture([
      "search",
      "query",
      "generations-metadata-fragment-needle",
      "--sources",
      "generations.artifacts",
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
    const metadataResult = metadataQueryPayload.data.results.find((entry) => entry.source === "generations.artifacts" && entry.title === "Launch Dashboard Hero");
    assert.equal(metadataResult?.fragments?.some((fragment) => fragment.title === "metadata" && fragment.snippet?.includes("generations-metadata-fragment-needle")), true);
    const commandQuery = await runCliCapture([
      "search",
      "query",
      "launch-dashboard-preset",
      "--sources",
      "generations.artifacts",
      "--workspace",
      workspaceRoot,
      "--data-dir",
      dataRoot,
      "--json",
      "--limit",
      "5",
    ], workspaceRoot);
    assert.equal(commandQuery.code, CLI_EXIT_OK, commandQuery.stderr || commandQuery.stdout);
    const commandQueryPayload = JSON.parse(commandQuery.stdout) as {
      data: { results: Array<{ source: string; title: string }> };
    };
    assert.equal(commandQueryPayload.data.results.some((entry) => entry.source === "generations.artifacts" && entry.title === "Launch Dashboard Hero"), true);
    const metadataSecretQuery = await runCliCapture([
      "search",
      "query",
      "generations-metadata-secret-never-index",
      "--sources",
      "generations.artifacts",
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
    assert.equal(metadataSecretQueryPayload.data.results.some((entry) => entry.source === "generations.artifacts" && entry.title === "Launch Dashboard Hero"), false);
    for (const secretNeedle of ["generations-command-secret-never-index", "generations-inline-secret-never-index"]) {
      const commandSecretQuery = await runCliCapture([
        "search",
        "query",
        secretNeedle,
        "--sources",
        "generations.artifacts",
        "--workspace",
        workspaceRoot,
        "--data-dir",
        dataRoot,
        "--json",
        "--limit",
        "5",
      ], workspaceRoot);
      assert.equal(commandSecretQuery.code, CLI_EXIT_DEGRADED, commandSecretQuery.stderr || commandSecretQuery.stdout);
      const commandSecretQueryPayload = JSON.parse(commandSecretQuery.stdout) as { data: { results: Array<{ source: string; title: string }> } };
      assert.equal(commandSecretQueryPayload.data.results.some((entry) => entry.source === "generations.artifacts" && entry.title === "Launch Dashboard Hero"), false);
    }
  });
});
test("generations create and delete schedule Search artifact events", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-generation-events-"));
  const dataRoot = path.join(workspaceRoot, "data");
  const scriptPath = createFakeGenerationScript();
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const registered = await runCliCapture([
      "generations",
      "register-command",
      "--workspace",
      workspaceRoot,
      "--id",
      "fake-image",
      "--label",
      "Fake Image",
      "--kinds",
      "image",
      "--command",
      scriptPath,
      "--args-json",
      "[\"--out\",\"{outputPath}\"]",
      "--ext",
      "png",
      "--json",
    ], workspaceRoot);
    assert.equal(registered.code, CLI_EXIT_OK);
    const created = await runCliCapture([
      "generations",
      "create",
      "--workspace",
      workspaceRoot,
      "--data-dir",
      dataRoot,
      "--kind",
      "image",
      "--backend",
      "fake-image",
      "--prompt",
      "evented generation search artifact",
      "--json",
    ], workspaceRoot);
    assert.equal(created.code, CLI_EXIT_OK);
    const createdPayload = JSON.parse(created.stdout) as { data: { id: string } };
    assert.match(createdPayload.data.id, /^gen-/);
    const upsertJobs = await runCliCapture(["search", "jobs", "--source", "generations.artifacts", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(upsertJobs.code, CLI_EXIT_OK);
    const upsertJobsPayload = JSON.parse(upsertJobs.stdout) as {
      data: { items: Array<{ source: string; operation: string; resourceId: string; shard: string; payload: { eventDriven?: boolean; generationId?: string } }> };
    };
    const upsertJob = upsertJobsPayload.data.items.find((job) => job.resourceId === createdPayload.data.id && job.operation === "upsert");
    assert.equal(upsertJob?.source, "generations.artifacts");
    assert.equal(upsertJob?.shard, "hot");
    assert.equal(upsertJob?.payload.eventDriven, true);
    assert.equal(upsertJob?.payload.generationId, createdPayload.data.id);
    const generationUpsertRun = await runCliCapture(["search", "service", "run-once", "--source", "generations.artifacts", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(generationUpsertRun.code, CLI_EXIT_OK);
    const generationUpsertRunItem = (JSON.parse(generationUpsertRun.stdout) as any).data.service.worker?.items.find((entry: any) => entry.source === "generations.artifacts");
    assert.deepEqual({ source: generationUpsertRunItem?.source, operation: generationUpsertRunItem?.operation, status: generationUpsertRunItem?.status, indexed: generationUpsertRunItem?.indexed }, { source: "generations.artifacts", operation: "upsert", status: "done", indexed: 1 });
    const generationQuery = await runCliCapture(["search", "query", "evented generation search artifact", "--sources", "generations.artifacts", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(generationQuery.code, CLI_EXIT_OK);
    const generationQueryPayload = JSON.parse(generationQuery.stdout) as any;
    assert.equal(generationQueryPayload.data.results.some((entry: any) => entry.source === "generations.artifacts" && entry.metadata?.generationId === createdPayload.data.id), true);
    const deleted = await runCliCapture([
      "generations",
      "delete",
      "--workspace",
      workspaceRoot,
      "--data-dir",
      dataRoot,
      "--id",
      createdPayload.data.id,
      "--json",
    ], workspaceRoot);
    assert.equal(deleted.code, CLI_EXIT_OK);
    const deleteJobs = await runCliCapture(["search", "jobs", "--source", "generations.artifacts", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleteJobs.code, CLI_EXIT_OK);
    const deleteJobsPayload = JSON.parse(deleteJobs.stdout) as {
      data: { items: Array<{ operation: string; priority: number; resourceId: string; payload: { eventDriven?: boolean; generationId?: string } }> };
    };
    const deleteJob = deleteJobsPayload.data.items.find((job) => job.resourceId === createdPayload.data.id && job.operation === "delete");
    assert.equal(deleteJob?.priority, 80);
    assert.equal(deleteJob?.payload.eventDriven, true);
    assert.equal(deleteJob?.payload.generationId, createdPayload.data.id);
    const generationDeleteRun = await runCliCapture(["search", "service", "run-once", "--source", "generations.artifacts", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(generationDeleteRun.code, CLI_EXIT_OK);
    const generationDeleteRunItem = (JSON.parse(generationDeleteRun.stdout) as any).data.service.worker?.items.find((entry: any) => entry.source === "generations.artifacts");
    assert.deepEqual({ source: generationDeleteRunItem?.source, operation: generationDeleteRunItem?.operation, status: generationDeleteRunItem?.status, indexed: generationDeleteRunItem?.indexed }, { source: "generations.artifacts", operation: "delete", status: "done", indexed: 1 });
    const afterGenerationDelete = await runCliCapture(["search", "query", "evented generation search artifact", "--sources", "generations.artifacts", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(afterGenerationDelete.code, CLI_EXIT_DEGRADED, afterGenerationDelete.stderr || afterGenerationDelete.stdout);
    const afterGenerationDeletePayload = JSON.parse(afterGenerationDelete.stdout) as any;
    assert.equal(afterGenerationDeletePayload.data.results.some((entry: any) => entry.source === "generations.artifacts" && entry.metadata?.generationId === createdPayload.data.id), false);
  });
});
test("image create and delete schedule Search image events", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-image-events-"));
  const dataRoot = path.join(workspaceRoot, "data");
  const scriptPath = createFakeGenerationScript();
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const registered = await runCliCapture([
      "generations",
      "register-command",
      "--workspace",
      workspaceRoot,
      "--id",
      "fake-image",
      "--label",
      "Fake Image",
      "--kinds",
      "image",
      "--command",
      scriptPath,
      "--args-json",
      "[\"--out\",\"{outputPath}\"]",
      "--ext",
      "png",
      "--json",
    ], workspaceRoot);
    assert.equal(registered.code, CLI_EXIT_OK);
    const created = await runCliCapture([
      "image",
      "create",
      "--workspace",
      workspaceRoot,
      "--data-dir",
      dataRoot,
      "--backend",
      "fake-image",
      "--prompt",
      "evented image search artifact",
      "--json",
    ], workspaceRoot);
    assert.equal(created.code, CLI_EXIT_OK);
    const createdPayload = JSON.parse(created.stdout) as { data: { id: string } };
    assert.match(createdPayload.data.id, /^img-/);
    const upsertJobs = await runCliCapture(["search", "jobs", "--source", "images.derived", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(upsertJobs.code, CLI_EXIT_OK);
    const upsertJobsPayload = JSON.parse(upsertJobs.stdout) as {
      data: { items: Array<{ source: string; operation: string; resourceId: string; shard: string; payload: { eventDriven?: boolean; imageId?: string } }> };
    };
    const upsertJob = upsertJobsPayload.data.items.find((job) => job.resourceId === createdPayload.data.id && job.operation === "upsert");
    assert.equal(upsertJob?.source, "images.derived");
    assert.equal(upsertJob?.shard, "hot");
    assert.equal(upsertJob?.payload.eventDriven, true);
    assert.equal(upsertJob?.payload.imageId, createdPayload.data.id);
    const imageUpsertRun = await runCliCapture(["search", "service", "run-once", "--source", "images.derived", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(imageUpsertRun.code, CLI_EXIT_OK);
    const imageUpsertRunItem = (JSON.parse(imageUpsertRun.stdout) as any).data.service.worker?.items.find((entry: any) => entry.source === "images.derived");
    assert.deepEqual({ source: imageUpsertRunItem?.source, operation: imageUpsertRunItem?.operation, status: imageUpsertRunItem?.status, indexed: imageUpsertRunItem?.indexed }, { source: "images.derived", operation: "upsert", status: "done", indexed: 1 });
    const imageQuery = await runCliCapture(["search", "query", "evented image search artifact", "--sources", "images.derived", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(imageQuery.code, CLI_EXIT_OK);
    const imageQueryPayload = JSON.parse(imageQuery.stdout) as any;
    assert.equal(imageQueryPayload.data.results.some((entry: any) => entry.source === "images.derived" && entry.metadata?.imageId === createdPayload.data.id), true);
    const deleted = await runCliCapture([
      "image",
      "delete",
      "--workspace",
      workspaceRoot,
      "--data-dir",
      dataRoot,
      "--id",
      createdPayload.data.id,
      "--json",
    ], workspaceRoot);
    assert.equal(deleted.code, CLI_EXIT_OK);
    const deleteJobs = await runCliCapture(["search", "jobs", "--source", "images.derived", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleteJobs.code, CLI_EXIT_OK);
    const deleteJobsPayload = JSON.parse(deleteJobs.stdout) as {
      data: { items: Array<{ operation: string; priority: number; resourceId: string; payload: { eventDriven?: boolean; imageId?: string } }> };
    };
    const deleteJob = deleteJobsPayload.data.items.find((job) => job.resourceId === createdPayload.data.id && job.operation === "delete");
    assert.equal(deleteJob?.priority, 80);
    assert.equal(deleteJob?.payload.eventDriven, true);
    assert.equal(deleteJob?.payload.imageId, createdPayload.data.id);
    const imageDeleteRun = await runCliCapture(["search", "service", "run-once", "--source", "images.derived", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(imageDeleteRun.code, CLI_EXIT_OK);
    const imageDeleteRunItem = (JSON.parse(imageDeleteRun.stdout) as any).data.service.worker?.items.find((entry: any) => entry.source === "images.derived");
    assert.deepEqual({ source: imageDeleteRunItem?.source, operation: imageDeleteRunItem?.operation, status: imageDeleteRunItem?.status, indexed: imageDeleteRunItem?.indexed }, { source: "images.derived", operation: "delete", status: "done", indexed: 1 });
    const afterImageDelete = await runCliCapture(["search", "query", "evented image search artifact", "--sources", "images.derived", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(afterImageDelete.code), true, afterImageDelete.stderr || afterImageDelete.stdout);
    const afterImageDeletePayload = JSON.parse(afterImageDelete.stdout) as any;
    assert.equal(afterImageDeletePayload.data.results.some((entry: any) => entry.source === "images.derived" && entry.metadata?.imageId === createdPayload.data.id), false);
  });
});
test("typed media generation schedules Search media asset events", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-media-events-"));
  const dataRoot = path.join(workspaceRoot, "data");
  const scriptPath = createFakeGenerationScript();
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const registered = await runCliCapture([
      "generations",
      "register-command",
      "--workspace",
      workspaceRoot,
      "--id",
      "fake-audio",
      "--label",
      "Fake Audio",
      "--kinds",
      "audio",
      "--command",
      scriptPath,
      "--args-json",
      "[\"--out\",\"{outputPath}\"]",
      "--ext",
      "mp3",
      "--json",
    ], workspaceRoot);
    assert.equal(registered.code, CLI_EXIT_OK);
    const created = await runCliCapture([
      "generations",
      "create",
      "--workspace",
      workspaceRoot,
      "--data-dir",
      dataRoot,
      "--kind",
      "audio",
      "--backend",
      "fake-audio",
      "--prompt",
      "evented audio search asset",
      "--json",
    ], workspaceRoot);
    assert.equal(created.code, CLI_EXIT_OK);
    const createdPayload = JSON.parse(created.stdout) as { data: { id: string } };
    assert.match(createdPayload.data.id, /^gen-/);
    const generationJobs = await runCliCapture(["search", "jobs", "--source", "generations.artifacts", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(generationJobs.code, CLI_EXIT_OK);
    const generationJobsPayload = JSON.parse(generationJobs.stdout) as {
      data: { items: Array<{ operation: string; resourceId: string; payload: { eventDriven?: boolean; generationId?: string } }> };
    };
    const generationJob = generationJobsPayload.data.items.find((job) => job.resourceId === createdPayload.data.id && job.operation === "upsert");
    assert.equal(generationJob?.payload.eventDriven, true);
    assert.equal(generationJob?.payload.generationId, createdPayload.data.id);
    const mediaJobs = await runCliCapture(["search", "jobs", "--source", "media.assets", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(mediaJobs.code, CLI_EXIT_OK);
    const mediaJobsPayload = JSON.parse(mediaJobs.stdout) as {
      data: { items: Array<{ operation: string; resourceId: string; shard: string; payload: { eventDriven?: boolean; mediaId?: string } }> };
    };
    const mediaJob = mediaJobsPayload.data.items.find((job) => job.operation === "upsert");
    assert.match(mediaJob?.resourceId ?? "", /^media-/);
    assert.equal(mediaJob?.shard, "hot");
    assert.equal(mediaJob?.payload.eventDriven, true);
    assert.equal(mediaJob?.payload.mediaId, mediaJob?.resourceId);
    const mediaUpsertRun = await runCliCapture(["search", "service", "run-once", "--source", "media.assets", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(mediaUpsertRun.code, CLI_EXIT_OK);
    const mediaUpsertRunItem = (JSON.parse(mediaUpsertRun.stdout) as any).data.service.worker?.items.find((entry: any) => entry.source === "media.assets");
    assert.deepEqual({ source: mediaUpsertRunItem?.source, operation: mediaUpsertRunItem?.operation, status: mediaUpsertRunItem?.status, indexed: mediaUpsertRunItem?.indexed }, { source: "media.assets", operation: "upsert", status: "done", indexed: 1 });
    const mediaQuery = await runCliCapture(["search", "query", "evented audio search asset", "--sources", "media.assets", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(mediaQuery.code, CLI_EXIT_OK);
    const mediaQueryPayload = JSON.parse(mediaQuery.stdout) as any;
    assert.equal(mediaQueryPayload.data.results.some((entry: any) => entry.source === "media.assets" && entry.metadata?.mediaId === mediaJob?.resourceId), true);
    const deleted = await runCliCapture([
      "generations",
      "delete",
      "--workspace",
      workspaceRoot,
      "--data-dir",
      dataRoot,
      "--id",
      createdPayload.data.id,
      "--json",
    ], workspaceRoot);
    assert.equal(deleted.code, CLI_EXIT_OK);
    const deletedMediaJobs = await runCliCapture(["search", "jobs", "--source", "media.assets", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deletedMediaJobs.code, CLI_EXIT_OK);
    const deletedMediaJobsPayload = JSON.parse(deletedMediaJobs.stdout) as {
      data: { items: Array<{ operation: string; priority: number; resourceId: string; payload: { eventDriven?: boolean; mediaId?: string } }> };
    };
    const deletedMediaJob = deletedMediaJobsPayload.data.items.find((job) => job.resourceId === mediaJob?.resourceId && job.operation === "delete");
    assert.equal(deletedMediaJob?.priority, 80);
    assert.equal(deletedMediaJob?.payload.eventDriven, true);
    assert.equal(deletedMediaJob?.payload.mediaId, mediaJob?.resourceId);
    const mediaDeleteRun = await runCliCapture(["search", "service", "run-once", "--source", "media.assets", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(mediaDeleteRun.code, CLI_EXIT_OK);
    const mediaDeleteRunItem = (JSON.parse(mediaDeleteRun.stdout) as any).data.service.worker?.items.find((entry: any) => entry.source === "media.assets");
    assert.deepEqual({ source: mediaDeleteRunItem?.source, operation: mediaDeleteRunItem?.operation, status: mediaDeleteRunItem?.status, indexed: mediaDeleteRunItem?.indexed }, { source: "media.assets", operation: "delete", status: "done", indexed: 1 });
    const afterMediaDelete = await runCliCapture(["search", "query", "evented audio search asset", "--sources", "media.assets", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(afterMediaDelete.code, CLI_EXIT_DEGRADED, afterMediaDelete.stderr || afterMediaDelete.stdout);
    const afterMediaDeletePayload = JSON.parse(afterMediaDelete.stdout) as any;
    assert.equal(afterMediaDeletePayload.data.results.some((entry: any) => entry.source === "media.assets" && entry.metadata?.mediaId === mediaJob?.resourceId), false);
  });
});
