import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { CLI_EXIT_DEGRADED, CLI_EXIT_OK } from "./index.ts";
import { scheduleExternalCacheSearchEvent, scheduleWebIngestedSearchEvent } from "./cli-search-events.ts";
import { runCliCapture, withPatchedEnv } from "./index-test-utils.ts";

export async function runSearchWebIngestedEventScenario(): Promise<void> {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-web-events-"));
  const dataRoot = path.join(workspaceRoot, "data");
  const webRoot = path.join(workspaceRoot, "web-cache");
  const pagePath = path.join(webRoot, "pages", "event-page.json");
  fs.mkdirSync(path.dirname(pagePath), { recursive: true });
  fs.writeFileSync(pagePath, JSON.stringify({
    url: "https://example.com/event-page",
    title: "Event Page",
    text: [
      "# Event Page",
      "",
      "Intro text for the web cache fixture.",
      "",
      "## Web Cache Section",
      "",
      "A web-ingested-event-refresh-needle proves web cache event refresh.",
      "",
    ].join("\n"),
    crawlScope: "explicit_cache",
  }));

  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const enabled = await runCliCapture(["search", "sources", "enable", "web.ingested", "--profile", "full", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(enabled.code, CLI_EXIT_OK);

    const scheduled = scheduleWebIngestedSearchEvent({
      operation: "upsert",
      root: webRoot,
      filePath: pagePath,
      dataDir: dataRoot,
      flags: { "web-root": webRoot },
    });
    assert.equal(scheduled.ok, true, scheduled.error);
    assert.equal(scheduled.job?.source, "web.ingested");
    assert.equal(scheduled.job?.operation, "upsert");
    assert.equal(scheduled.job?.resourceId, "pages/event-page.json");
    assert.equal(scheduled.job?.shard, "hot");
    assert.equal(scheduled.job?.payload.eventDriven, true);
    assert.equal(scheduled.job?.payload.relativePath, "pages/event-page.json");

    const outsideRoot = scheduleWebIngestedSearchEvent({
      operation: "upsert",
      root: webRoot,
      filePath: path.join(workspaceRoot, "outside.json"),
      dataDir: dataRoot,
    });
    assert.equal(outsideRoot.ok, false);
    assert.match(outsideRoot.error ?? "", /outside root/);

    const serviceRun = await runCliCapture(["search", "service", "run-once", "--source", "web.ingested", "--profile", "full", "--web-root", webRoot, "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(serviceRun.code, CLI_EXIT_OK);
    const serviceRunPayload = JSON.parse(serviceRun.stdout) as {
      data: { worker?: { items: Array<{ id: string; source: string; status: string; indexed?: number }> } };
    };
    assert.equal(serviceRunPayload.data.worker?.items[0]?.id, scheduled.job?.id);
    assert.equal(serviceRunPayload.data.worker?.items[0]?.source, "web.ingested");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.status, "done");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.indexed, 1);

    const query = await runCliCapture(["search", "query", "web-ingested-event-refresh-needle", "--profile", "full", "--web-root", webRoot, "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as {
      data: { results: Array<{ source: string; domain: string; resourceId?: string; metadata?: { url?: string }; fragments?: Array<{ title?: string; snippet?: string }> }> };
    };
    const result = queryPayload.data.results.find((entry) => entry.resourceId === "pages/event-page.json");
    assert.equal(result?.source, "web.ingested");
    assert.equal(result?.domain, "web");
    assert.equal(result?.metadata?.url, "https://example.com/event-page");
    assert.equal(result?.fragments?.some((fragment) => fragment.title === "Web Cache Section" && fragment.snippet?.includes("web-ingested-event-refresh-needle")), true);

    fs.rmSync(pagePath);
    const deleted = scheduleWebIngestedSearchEvent({
      operation: "delete",
      root: webRoot,
      filePath: pagePath,
      dataDir: dataRoot,
      flags: { "web-root": webRoot },
    });
    assert.equal(deleted.ok, true, deleted.error);
    assert.equal(deleted.job?.operation, "delete");

    const deleteRun = await runCliCapture(["search", "service", "run-once", "--source", "web.ingested", "--profile", "full", "--web-root", webRoot, "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(deleteRun.code, CLI_EXIT_OK);
    const deleteRunPayload = JSON.parse(deleteRun.stdout) as {
      data: { worker?: { items: Array<{ source: string; operation: string; status: string; indexed?: number }> } };
    };
    const webDeleteRunItem = deleteRunPayload.data.worker?.items.find((entry) => entry.source === "web.ingested");
    assert.deepEqual({ source: webDeleteRunItem?.source, operation: webDeleteRunItem?.operation, status: webDeleteRunItem?.status, indexed: webDeleteRunItem?.indexed }, { source: "web.ingested", operation: "delete", status: "done", indexed: 1 });

    const afterDelete = await runCliCapture(["search", "query", "web-ingested-event-refresh-needle", "--profile", "full", "--web-root", webRoot, "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(afterDelete.code, CLI_EXIT_DEGRADED);
    const afterDeletePayload = JSON.parse(afterDelete.stdout) as { data: { results: unknown[] } };
    assert.deepEqual(afterDeletePayload.data.results, []);
  });
}

export async function runSearchExternalCacheEventScenario(): Promise<void> {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-external-events-"));
  const dataRoot = path.join(workspaceRoot, "data");
  const externalRoot = path.join(workspaceRoot, "external-cache");
  const recordPath = path.join(externalRoot, "provider", "event-record.json");
  fs.mkdirSync(path.dirname(recordPath), { recursive: true });
  fs.writeFileSync(recordPath, JSON.stringify({
    provider: "notes",
    app: "team-notes",
    externalId: "external-event-1",
    type: "note",
    title: "External Event Record",
    text: [
      "# External Event Record",
      "",
      "Intro text for the external cache fixture.",
      "",
      "## External Cache Section",
      "",
      "An external-cache-event-refresh-needle proves external cache event refresh.",
      "",
    ].join("\n"),
    syncMode: "manual",
    apiToken: "should-not-be-indexed",
  }));

  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const enabled = await runCliCapture(["search", "sources", "enable", "external.cache", "--profile", "full", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(enabled.code, CLI_EXIT_OK);

    const scheduled = scheduleExternalCacheSearchEvent({
      operation: "upsert",
      root: externalRoot,
      filePath: recordPath,
      dataDir: dataRoot,
      flags: { "external-root": externalRoot },
    });
    assert.equal(scheduled.ok, true, scheduled.error);
    assert.equal(scheduled.job?.source, "external.cache");
    assert.equal(scheduled.job?.operation, "upsert");
    assert.equal(scheduled.job?.resourceId, "provider/event-record.json");
    assert.equal(scheduled.job?.shard, "hot");
    assert.equal(scheduled.job?.payload.eventDriven, true);
    assert.equal(scheduled.job?.payload.relativePath, "provider/event-record.json");

    const outsideRoot = scheduleExternalCacheSearchEvent({
      operation: "upsert",
      root: externalRoot,
      filePath: path.join(workspaceRoot, "outside.json"),
      dataDir: dataRoot,
    });
    assert.equal(outsideRoot.ok, false);
    assert.match(outsideRoot.error ?? "", /outside root/);

    const serviceRun = await runCliCapture(["search", "service", "run-once", "--source", "external.cache", "--profile", "full", "--external-root", externalRoot, "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(serviceRun.code, CLI_EXIT_OK);
    const serviceRunPayload = JSON.parse(serviceRun.stdout) as {
      data: { worker?: { items: Array<{ id: string; source: string; status: string; indexed?: number }> } };
    };
    assert.equal(serviceRunPayload.data.worker?.items[0]?.id, scheduled.job?.id);
    assert.equal(serviceRunPayload.data.worker?.items[0]?.source, "external.cache");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.status, "done");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.indexed, 1);

    const query = await runCliCapture(["search", "query", "external-cache-event-refresh-needle", "--profile", "full", "--external-root", externalRoot, "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as {
      data: { results: Array<{ source: string; domain: string; resourceId?: string; metadata?: { externalId?: string }; fragments?: Array<{ title?: string; snippet?: string }> }> };
    };
    const result = queryPayload.data.results.find((entry) => entry.resourceId === "provider/event-record.json");
    assert.equal(result?.source, "external.cache");
    assert.equal(result?.domain, "external");
    assert.equal(result?.metadata?.externalId, "external-event-1");
    assert.equal(result?.fragments?.some((fragment) => fragment.title === "External Cache Section" && fragment.snippet?.includes("external-cache-event-refresh-needle")), true);
    assert.equal(JSON.stringify(queryPayload.data.results).includes("should-not-be-indexed"), false);

    fs.rmSync(recordPath);
    const deleted = scheduleExternalCacheSearchEvent({
      operation: "delete",
      root: externalRoot,
      filePath: recordPath,
      dataDir: dataRoot,
      flags: { "external-root": externalRoot },
    });
    assert.equal(deleted.ok, true, deleted.error);
    assert.equal(deleted.job?.operation, "delete");

    const deleteRun = await runCliCapture(["search", "service", "run-once", "--source", "external.cache", "--profile", "full", "--external-root", externalRoot, "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(deleteRun.code, CLI_EXIT_OK);
    const deleteRunPayload = JSON.parse(deleteRun.stdout) as {
      data: { worker?: { items: Array<{ source: string; operation: string; status: string; indexed?: number }> } };
    };
    const externalDeleteRunItem = deleteRunPayload.data.worker?.items.find((entry) => entry.source === "external.cache");
    assert.deepEqual({ source: externalDeleteRunItem?.source, operation: externalDeleteRunItem?.operation, status: externalDeleteRunItem?.status, indexed: externalDeleteRunItem?.indexed }, { source: "external.cache", operation: "delete", status: "done", indexed: 1 });

    const afterDelete = await runCliCapture(["search", "query", "external-cache-event-refresh-needle", "--profile", "full", "--external-root", externalRoot, "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(afterDelete.code, CLI_EXIT_DEGRADED);
    const afterDeletePayload = JSON.parse(afterDelete.stdout) as { data: { results: unknown[] } };
    assert.deepEqual(afterDeletePayload.data.results, []);
  });
}
