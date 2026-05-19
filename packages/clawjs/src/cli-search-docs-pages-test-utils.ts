import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { CLI_EXIT_DEGRADED, CLI_EXIT_OK, CLI_EXIT_USAGE } from "./index.ts";
import { runCliCapture, withPatchedEnv } from "./index-test-utils.ts";

export async function runSearchDocsPagesScenario(): Promise<void> {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-docs-"));
  const dataRoot = path.join(workspaceRoot, "data");
  const docsRoot = path.join(workspaceRoot, "docs");
  const adrRoot = path.join(docsRoot, "adr");
  fs.mkdirSync(adrRoot, { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, "README.md"), [
    "# Workspace Readme",
    "",
    "Root public docs include a docs-pages-root-needle.",
    "",
  ].join("\n"));
  fs.writeFileSync(path.join(docsRoot, "search-fixture.md"), [
    "---",
    "title: Frontmatter Search Fixture",
    "description: docs-pages-frontmatter-description-needle proves frontmatter extraction.",
    "---",
    "",
    "# Search Fixture",
    "",
    "The docs pages adapter indexes the public docs needle.",
    "",
    "## Runtime Contract",
    "",
    "A docs-pages-runtime-needle section verifies fragment extraction.",
    "",
  ].join("\n"));
  fs.writeFileSync(path.join(adrRoot, "0099-docs-search-fixture.md"), [
    "# ADR 0099 Docs Search Fixture",
    "",
    "## Decision",
    "",
    "A docs-pages-adr-needle confirms ADR classification.",
    "",
  ].join("\n"));

  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const rebuild = await runCliCapture(["search", "rebuild", "--source", "docs.pages", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(rebuild.code, CLI_EXIT_OK);
    const rebuildPayload = JSON.parse(rebuild.stdout) as {
      data: { sources: string[]; pendingSources: string[]; indexedBySource: { "docs.pages": number } };
    };
    assert.equal(rebuildPayload.data.sources.includes("docs.pages"), true);
    assert.equal(rebuildPayload.data.pendingSources.includes("docs.pages"), false);
    assert.equal(rebuildPayload.data.indexedBySource["docs.pages"], 3);

    const query = await runCliCapture(["search", "query", "docs-pages-runtime-needle", "--domains", "docs", "--data-dir", dataRoot, "--json", "--limit", "5", "--explain", "true"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as {
      data: {
        indexedFastPaths: { "docs.pages": number };
        results: Array<{
          source: string;
          domain: string;
          type: string;
          title: string;
          snippet?: string;
          resourceId?: string;
          path?: string;
          metadata?: { kind?: string; category?: string; relativePath?: string; frontmatterTitle?: string; frontmatterDescription?: string };
          fragments?: Array<{ title?: string; snippet?: string }>;
        }>;
        facets?: Array<{ id: string; label: string }>;
      };
    };
    assert.equal(queryPayload.data.indexedFastPaths["docs.pages"], 3);
    const docResult = queryPayload.data.results.find((entry) => entry.resourceId === "docs/search-fixture.md");
    assert.equal(docResult?.source, "docs.pages");
    assert.equal(docResult?.domain, "docs");
    assert.equal(docResult?.type, "doc");
    assert.equal(docResult?.title, "Frontmatter Search Fixture");
    assert.equal(docResult?.snippet, "docs-pages-frontmatter-description-needle proves frontmatter extraction.");
    assert.equal(docResult?.metadata?.kind, "doc");
    assert.equal(docResult?.metadata?.category, "docs");
    assert.equal(docResult?.metadata?.frontmatterTitle, "Frontmatter Search Fixture");
    assert.equal(docResult?.metadata?.frontmatterDescription, "docs-pages-frontmatter-description-needle proves frontmatter extraction.");
    assert.equal(docResult?.path, path.join(docsRoot, "search-fixture.md"));
    assert.equal(docResult?.fragments?.some((fragment) => fragment.title === "Runtime Contract"), true);
    assert.equal(queryPayload.data.facets?.some((facet) => facet.id === "kind"), true);

    const frontmatterQuery = await runCliCapture(["search", "query", "docs-pages-frontmatter-description-needle", "--domains", "docs", "--filters", "metadata.relativePath=docs/search-fixture.md", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(frontmatterQuery.code, CLI_EXIT_OK);
    const frontmatterPayload = JSON.parse(frontmatterQuery.stdout) as {
      data: { results: Array<{ source: string; resourceId?: string; snippet?: string; metadata?: { frontmatterDescription?: string } }> };
    };
    const frontmatterResult = frontmatterPayload.data.results.find((entry) => entry.resourceId === "docs/search-fixture.md");
    assert.equal(frontmatterResult?.source, "docs.pages");
    assert.equal(frontmatterResult?.snippet, "docs-pages-frontmatter-description-needle proves frontmatter extraction.");
    assert.equal(frontmatterResult?.metadata?.frontmatterDescription, "docs-pages-frontmatter-description-needle proves frontmatter extraction.");

    const rootQuery = await runCliCapture(["search", "query", "docs-pages-root-needle", "--domains", "docs", "--filters", "metadata.category=root", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(rootQuery.code, CLI_EXIT_OK);
    const rootPayload = JSON.parse(rootQuery.stdout) as {
      data: { results: Array<{ source: string; metadata?: { category?: string }; resourceId?: string }> };
    };
    const rootResult = rootPayload.data.results.find((entry) => entry.resourceId === "README.md");
    assert.equal(rootResult?.source, "docs.pages");
    assert.equal(rootResult?.metadata?.category, "root");

    const adrQuery = await runCliCapture(["search", "query", "docs-pages-adr-needle", "--domains", "docs", "--filters", "metadata.kind=adr", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(adrQuery.code, CLI_EXIT_OK);
    const adrPayload = JSON.parse(adrQuery.stdout) as {
      data: { results: Array<{ source: string; type: string; metadata?: { kind?: string; category?: string }; resourceId?: string }> };
    };
    const adrResult = adrPayload.data.results.find((entry) => entry.resourceId === "docs/adr/0099-docs-search-fixture.md");
    assert.equal(adrResult?.source, "docs.pages");
    assert.equal(adrResult?.type, "adr");
    assert.equal(adrResult?.metadata?.kind, "adr");
    assert.equal(adrResult?.metadata?.category, "adr");

    const semanticQuery = await runCliCapture(["search", "query", "runtime contract extraction", "--domains", "docs", "--strategy", "semantic", "--embedding-model", "local-text-v1", "--data-dir", dataRoot, "--json", "--limit", "5", "--explain", "true"], workspaceRoot);
    assert.equal(semanticQuery.code, CLI_EXIT_OK);
    const semanticPayload = JSON.parse(semanticQuery.stdout) as {
      data: { results: Array<{ source: string; resourceId?: string; explanation?: { matchedBy?: string[]; scoreBreakdown?: { semantic?: number } } }> };
    };
    const semanticResult = semanticPayload.data.results.find((entry) => entry.resourceId === "docs/search-fixture.md");
    assert.equal(semanticResult?.source, "docs.pages");
    assert.equal(semanticResult?.explanation?.matchedBy?.includes("semantic"), true);
    assert.ok((semanticResult?.explanation?.scoreBreakdown?.semantic ?? 0) > 0);

    fs.writeFileSync(path.join(docsRoot, "search-fixture.md"), [
      "# Search Fixture",
      "",
      "## Resource Refresh",
      "",
      "A docs-pages-resource-refresh-needle confirms resource job refresh.",
      "",
    ].join("\n"));
    const scheduled = await runCliCapture(["search", "jobs", "schedule", "upsert", "--source", "docs.pages", "--resource-id", "docs/search-fixture.md", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(scheduled.code, CLI_EXIT_OK);
    const serviceRun = await runCliCapture(["search", "service", "run-once", "--source", "docs.pages", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(serviceRun.code, CLI_EXIT_OK);

    const refreshed = await runCliCapture(["search", "query", "docs-pages-resource-refresh-needle", "--domains", "docs", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(refreshed.code, CLI_EXIT_OK);
    const refreshedPayload = JSON.parse(refreshed.stdout) as { data: { results: Array<{ resourceId?: string; fragments?: Array<{ title?: string }> }> } };
    const refreshedResult = refreshedPayload.data.results.find((entry) => entry.resourceId === "docs/search-fixture.md");
    assert.equal(refreshedResult?.fragments?.some((fragment) => fragment.title === "Resource Refresh"), true);
  });
}

export async function runSearchDocsPagesEventScenario(): Promise<void> {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-doc-events-"));
  const dataRoot = path.join(workspaceRoot, "data");
  const docPath = path.join(workspaceRoot, "docs", "event-refresh.md");
  fs.mkdirSync(path.dirname(docPath), { recursive: true });
  fs.writeFileSync(docPath, [
    "# Docs Event Refresh",
    "",
    "A docs-pages-event-refresh-needle proves event refresh.",
    "",
  ].join("\n"));

  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const scheduled = await runCliCapture(["search", "changes", "schedule", "upsert", "--source", "docs.pages", "--workspace", workspaceRoot, "--path", docPath, "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(scheduled.code, CLI_EXIT_OK, scheduled.stderr || scheduled.stdout);
    const scheduledPayload = JSON.parse(scheduled.stdout) as {
      data: { item?: { source: string; operation: string; resourceId?: string; shard?: string; payload?: { eventDriven?: boolean; relativePath?: string } } };
    };
    assert.equal(scheduledPayload.data.item?.source, "docs.pages");
    assert.equal(scheduledPayload.data.item?.operation, "upsert");
    assert.equal(scheduledPayload.data.item?.resourceId, "docs/event-refresh.md");
    assert.equal(scheduledPayload.data.item?.shard, "hot");
    assert.equal(scheduledPayload.data.item?.payload?.eventDriven, true);
    assert.equal(scheduledPayload.data.item?.payload?.relativePath, "docs/event-refresh.md");

    const outsidePublicScope = await runCliCapture(["search", "changes", "schedule", "upsert", "--source", "docs.pages", "--workspace", workspaceRoot, "--path", path.join(workspaceRoot, "private-notes.md"), "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(outsidePublicScope.code, CLI_EXIT_USAGE);
    const outsidePublicScopePayload = JSON.parse(outsidePublicScope.stdout) as { error: { message: string } };
    assert.match(outsidePublicScopePayload.error.message, /outside public docs scope/);

    const serviceRun = await runCliCapture(["search", "service", "run-once", "--source", "docs.pages", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(serviceRun.code, CLI_EXIT_OK);

    const query = await runCliCapture(["search", "query", "docs-pages-event-refresh-needle", "--domains", "docs", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as {
      data: { results: Array<{ source: string; domain: string; resourceId?: string; title: string }> };
    };
    const result = queryPayload.data.results.find((entry) => entry.resourceId === "docs/event-refresh.md");
    assert.equal(result?.source, "docs.pages");
    assert.equal(result?.domain, "docs");
    assert.equal(result?.title, "Docs Event Refresh");

    fs.rmSync(docPath);
    const deleted = await runCliCapture(["search", "changes", "schedule", "delete", "--source", "docs.pages", "--workspace", workspaceRoot, "--path", docPath, "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleted.code, CLI_EXIT_OK, deleted.stderr || deleted.stdout);
    const deletedPayload = JSON.parse(deleted.stdout) as {
      data: { item?: { source: string; operation: string; resourceId?: string; payload?: { eventDriven?: boolean; relativePath?: string } } };
    };
    assert.equal(deletedPayload.data.item?.source, "docs.pages");
    assert.equal(deletedPayload.data.item?.operation, "delete");
    assert.equal(deletedPayload.data.item?.resourceId, "docs/event-refresh.md");
    assert.equal(deletedPayload.data.item?.payload?.eventDriven, true);
    assert.equal(deletedPayload.data.item?.payload?.relativePath, "docs/event-refresh.md");

    const deleteRun = await runCliCapture(["search", "service", "run-once", "--source", "docs.pages", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(deleteRun.code, CLI_EXIT_OK);
    const deleteRunPayload = JSON.parse(deleteRun.stdout) as {
      data: { worker?: { items: Array<{ source: string; operation: string; status: string; indexed?: number }> } };
    };
    const docsDeleteRunItem = deleteRunPayload.data.worker?.items.find((entry) => entry.source === "docs.pages");
    assert.deepEqual({ source: docsDeleteRunItem?.source, operation: docsDeleteRunItem?.operation, status: docsDeleteRunItem?.status, indexed: docsDeleteRunItem?.indexed }, { source: "docs.pages", operation: "delete", status: "done", indexed: 1 });

    const afterDelete = await runCliCapture(["search", "query", "docs-pages-event-refresh-needle", "--domains", "docs", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(afterDelete.code, CLI_EXIT_DEGRADED);
    const afterDeletePayload = JSON.parse(afterDelete.stdout) as { data: { results: unknown[] } };
    assert.deepEqual(afterDeletePayload.data.results, []);
  });
}

export async function runSearchDocsPagesCliWriteScenario(): Promise<void> {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-docs-writes-"));
  const dataRoot = path.join(workspaceRoot, "data");

  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const created = await runCliCapture([
      "docs",
      "page",
      "upsert",
      "cli-event-refresh",
      "--title",
      "CLI Docs Event Refresh",
      "--description",
      "docs-pages-cli-frontmatter-needle",
      "--body",
      "# CLI Docs Event Refresh\n\nA docs-pages-cli-event-refresh-needle proves CLI write refresh.",
      "--workspace",
      workspaceRoot,
      "--data-dir",
      dataRoot,
      "--json",
    ], workspaceRoot);
    assert.equal(created.code, CLI_EXIT_OK, created.stderr || created.stdout);

    const jobs = await runCliCapture(["search", "jobs", "list", "--source", "docs.pages", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(jobs.code, CLI_EXIT_OK);
    const jobsPayload = JSON.parse(jobs.stdout) as {
      data: { items: Array<{ source: string; operation: string; resourceId?: string; shard?: string; payload?: Record<string, unknown> }> };
    };
    const upsertJob = jobsPayload.data.items.find((job) => job.resourceId === "docs/cli-event-refresh.md" && job.operation === "upsert");
    assert.equal(upsertJob?.source, "docs.pages");
    assert.equal(upsertJob?.shard, "hot");
    assert.equal(upsertJob?.payload?.eventDriven, true);
    assert.equal(upsertJob?.payload?.relativePath, "docs/cli-event-refresh.md");

    const serviceRun = await runCliCapture(["search", "service", "run-once", "--source", "docs.pages", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(serviceRun.code, CLI_EXIT_OK);
    const serviceRunPayload = JSON.parse(serviceRun.stdout) as {
      data: { worker?: { items: Array<{ source: string; operation: string; status: string; indexed?: number }> } };
    };
    assert.equal(serviceRunPayload.data.worker?.items[0]?.source, "docs.pages");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.operation, "upsert");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.status, "done");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.indexed, 1);

    const query = await runCliCapture(["search", "query", "docs-pages-cli-event-refresh-needle", "--domains", "docs", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK, query.stderr || query.stdout);
    const queryPayload = JSON.parse(query.stdout) as {
      data: { results: Array<{ source: string; domain: string; resourceId?: string; title: string; snippet?: string; metadata?: { frontmatterDescription?: string } }> };
    };
    const result = queryPayload.data.results.find((entry) => entry.resourceId === "docs/cli-event-refresh.md");
    assert.equal(result?.source, "docs.pages");
    assert.equal(result?.domain, "docs");
    assert.equal(result?.title, "CLI Docs Event Refresh");
    assert.equal(result?.metadata?.frontmatterDescription, "docs-pages-cli-frontmatter-needle");

    const deleted = await runCliCapture(["docs", "page", "delete", "cli-event-refresh", "--workspace", workspaceRoot, "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleted.code, CLI_EXIT_OK, deleted.stderr || deleted.stdout);
    const deleteRun = await runCliCapture(["search", "service", "run-once", "--source", "docs.pages", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(deleteRun.code, CLI_EXIT_OK);
    const deleteRunPayload = JSON.parse(deleteRun.stdout) as {
      data: { worker?: { items: Array<{ source: string; operation: string; status: string; indexed?: number }> } };
    };
    const docsDeleteRunItem = deleteRunPayload.data.worker?.items.find((entry) => entry.source === "docs.pages");
    assert.deepEqual({ source: docsDeleteRunItem?.source, operation: docsDeleteRunItem?.operation, status: docsDeleteRunItem?.status, indexed: docsDeleteRunItem?.indexed }, { source: "docs.pages", operation: "delete", status: "done", indexed: 1 });
    const afterDelete = await runCliCapture(["search", "query", "docs-pages-cli-event-refresh-needle", "--domains", "docs", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(afterDelete.code, CLI_EXIT_DEGRADED, afterDelete.stderr || afterDelete.stdout);
    const afterDeletePayload = JSON.parse(afterDelete.stdout) as { data: { results: unknown[] } };
    assert.deepEqual(afterDeletePayload.data.results, []);
  });
}
