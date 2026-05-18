import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { CLI_EXIT_OK } from "./index.ts";
import { runCliCapture, withPatchedEnv } from "./index-test-utils.ts";

export async function runSearchSurfaceRouteGraphContractsScenario(): Promise<void> {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-surfaces-"));
  const dataRoot = path.join(workspaceRoot, "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const rebuild = await runCliCapture(["search", "rebuild", "--source", "surfaces.routes", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(rebuild.code, CLI_EXIT_OK);
    const rebuildPayload = JSON.parse(rebuild.stdout) as {
      data: { sources: string[]; indexedBySource: { "surfaces.routes": number }; pendingSources: string[] };
    };
    assert.equal(rebuildPayload.data.sources.includes("surfaces.routes"), true);
    assert.equal(rebuildPayload.data.pendingSources.includes("surfaces.routes"), false);
    assert.ok(rebuildPayload.data.indexedBySource["surfaces.routes"] > 0);

    const query = await runCliCapture(["search", "query", "Search index sync", "--domains", "surfaces", "--data-dir", dataRoot, "--json", "--limit", "5", "--explain", "true"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as {
      data: {
        indexedFastPaths: { "surfaces.routes": number };
        results: Array<{ source: string; domain: string; type: string; title: string; subtitle?: string; metadata?: { fromId?: string; toId?: string; stepCount?: number }; fragments?: Array<unknown>; actions?: Array<{ id: string; kind: string }> }>;
      };
    };
    assert.ok(queryPayload.data.indexedFastPaths["surfaces.routes"] > 0);
    const result = queryPayload.data.results.find((candidate) => candidate.title === "Search index sync");
    assert.equal(result?.source, "surfaces.routes");
    assert.equal(result?.domain, "surfaces");
    assert.equal(result?.type, "route");
    assert.equal(result?.subtitle, "claw.sync -> claw.search");
    assert.equal(result?.metadata?.fromId, "claw.sync");
    assert.equal(result?.metadata?.toId, "claw.search");
    assert.ok((result?.metadata?.stepCount ?? 0) > 0);
    assert.ok((result?.fragments?.length ?? 0) > 0);
    assert.equal(result?.actions?.some((action) => action.id === "open" && action.kind === "open"), true);

    const event = await runCliCapture(["search", "jobs", "enqueue", "upsert", "--source", "surfaces.routes", "--resource-id", "sync.searchIndex", "--id", "job:surface-route", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(event.code, CLI_EXIT_OK);
    const serviceRun = await runCliCapture(["search", "service", "run-once", "--source", "surfaces.routes", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(serviceRun.code, CLI_EXIT_OK);
    const serviceRunPayload = JSON.parse(serviceRun.stdout) as {
      data: { worker?: { items: Array<{ id: string; source: string; status: string; indexed?: number }> } };
    };
    assert.equal(serviceRunPayload.data.worker?.items[0]?.id, "job:surface-route");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.source, "surfaces.routes");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.status, "done");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.indexed, 1);
  });
}
