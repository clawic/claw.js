import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { CLI_EXIT_DEGRADED, CLI_EXIT_OK, CLI_EXIT_USAGE } from "./index.ts";
import { runCliCapture, withPatchedEnv } from "./index-test-utils.ts";

export async function runSearchLocalFilesEventScenario(): Promise<void> {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-local-file-events-"));
  const dataRoot = path.join(workspaceRoot, "data");
  const fileRoot = path.join(workspaceRoot, "local-files");
  const filePath = path.join(fileRoot, "docs", "event-file.md");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, [
    "# Event File",
    "",
    "Intro text for the local file fixture.",
    "",
    "## Local File Section",
    "",
    "A local-file-event-refresh-needle proves file event refresh.",
    "",
  ].join("\n"));

  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const enabled = await runCliCapture(["search", "sources", "enable", "local.files", "--source-set", "full", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(enabled.code, CLI_EXIT_OK);

    const scheduled = await runCliCapture(["search", "changes", "schedule", "upsert", "--source", "local.files", "--root", fileRoot, "--path", filePath, "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(scheduled.code, CLI_EXIT_OK, scheduled.stderr || scheduled.stdout);
    const scheduledPayload = JSON.parse(scheduled.stdout) as {
      data: { item?: { id: string; source: string; operation: string; resourceId?: string; shard?: string; payload?: { eventDriven?: boolean; relativePath?: string; root?: string } } };
    };
    assert.equal(scheduledPayload.data.item?.source, "local.files");
    assert.equal(scheduledPayload.data.item?.operation, "upsert");
    assert.equal(scheduledPayload.data.item?.resourceId, "docs/event-file.md");
    assert.equal(scheduledPayload.data.item?.shard, "hot");
    assert.equal(scheduledPayload.data.item?.payload?.eventDriven, true);
    assert.equal(scheduledPayload.data.item?.payload?.relativePath, "docs/event-file.md");
    assert.equal(scheduledPayload.data.item?.payload?.root, path.resolve(fileRoot));

    const outsideRoot = await runCliCapture(["search", "changes", "schedule", "upsert", "--source", "local.files", "--root", fileRoot, "--path", path.join(workspaceRoot, "outside.txt"), "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(outsideRoot.code, CLI_EXIT_USAGE);
    const outsideRootPayload = JSON.parse(outsideRoot.stdout) as { error: { message: string } };
    assert.match(outsideRootPayload.error.message, /outside root/);

    const serviceRun = await runCliCapture(["search", "service", "run-once", "--source", "local.files", "--source-set", "full", "--file-root", fileRoot, "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(serviceRun.code, CLI_EXIT_OK);
    const serviceRunPayload = JSON.parse(serviceRun.stdout) as {
      data: { worker?: { items: Array<{ id: string; source: string; status: string; indexed?: number }> } };
    };
    assert.equal(serviceRunPayload.data.worker?.items[0]?.id, scheduledPayload.data.item?.id);
    assert.equal(serviceRunPayload.data.worker?.items[0]?.source, "local.files");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.status, "done");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.indexed, 1);

    const query = await runCliCapture(["search", "query", "local-file-event-refresh-needle", "--source-set", "full", "--file-root", fileRoot, "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as {
      data: { results: Array<{ source: string; domain: string; resourceId?: string; metadata?: { indexedContent?: boolean }; fragments?: Array<{ title?: string; snippet?: string }> }> };
    };
    const result = queryPayload.data.results.find((entry) => entry.resourceId === "docs/event-file.md");
    assert.equal(result?.source, "local.files");
    assert.equal(result?.domain, "files");
    assert.equal(result?.metadata?.indexedContent, true);
    assert.equal(result?.fragments?.some((fragment) => fragment.title === "Local File Section" && fragment.snippet?.includes("local-file-event-refresh-needle")), true);

    fs.rmSync(filePath);
    const deleted = await runCliCapture(["search", "changes", "schedule", "delete", "--source", "local.files", "--root", fileRoot, "--path", filePath, "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleted.code, CLI_EXIT_OK, deleted.stderr || deleted.stdout);
    const deletedPayload = JSON.parse(deleted.stdout) as {
      data: { item?: { source: string; operation: string; resourceId?: string; payload?: { eventDriven?: boolean; relativePath?: string } } };
    };
    assert.equal(deletedPayload.data.item?.source, "local.files");
    assert.equal(deletedPayload.data.item?.operation, "delete");
    assert.equal(deletedPayload.data.item?.resourceId, "docs/event-file.md");
    assert.equal(deletedPayload.data.item?.payload?.eventDriven, true);
    assert.equal(deletedPayload.data.item?.payload?.relativePath, "docs/event-file.md");

    const deleteRun = await runCliCapture(["search", "service", "run-once", "--source", "local.files", "--source-set", "full", "--file-root", fileRoot, "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(deleteRun.code, CLI_EXIT_OK);
    const deleteRunPayload = JSON.parse(deleteRun.stdout) as {
      data: { worker?: { items: Array<{ source: string; operation: string; status: string; indexed?: number }> } };
    };
    const localFileDeleteRunItem = deleteRunPayload.data.worker?.items.find((entry) => entry.source === "local.files");
    assert.deepEqual({ source: localFileDeleteRunItem?.source, operation: localFileDeleteRunItem?.operation, status: localFileDeleteRunItem?.status, indexed: localFileDeleteRunItem?.indexed }, { source: "local.files", operation: "delete", status: "done", indexed: 1 });

    const afterDelete = await runCliCapture(["search", "query", "local-file-event-refresh-needle", "--source-set", "full", "--file-root", fileRoot, "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(afterDelete.code, CLI_EXIT_DEGRADED);
    const afterDeletePayload = JSON.parse(afterDelete.stdout) as { data: { results: unknown[] } };
    assert.deepEqual(afterDeletePayload.data.results, []);
  });
}
