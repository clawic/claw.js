import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { SearchStore } from "@clawjs/search";

import { CLI_EXIT_DEGRADED, CLI_EXIT_OK } from "./index.ts";
import { runCliCapture, withPatchedEnv } from "./index-test-utils.ts";

type DiscoverabilityGoldenQuery = {
  id: string;
  query: string;
  domains: string[];
  expectSource: string;
  expectType: string;
  expectResourceId: string;
  maxRank: number;
};

function readDiscoverabilityGoldenQueries(rootDir: string): DiscoverabilityGoldenQuery[] {
  const fixturePath = path.join(rootDir, "docs/discoverability-golden-queries.json");
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as { queries: DiscoverabilityGoldenQuery[] };
  return fixture.queries;
}

export async function runSearchSurfaceRouteGraphContractsScenario(): Promise<void> {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-surfaces-"));
  const dataRoot = path.join(workspaceRoot, "data");
  const rootDir = process.cwd();
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
    const registryRebuild = await runCliCapture(["search", "rebuild", "--source", "surfaces.registry", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(registryRebuild.code, CLI_EXIT_OK);
    const registryRebuildPayload = JSON.parse(registryRebuild.stdout) as {
      data: { sources: string[]; indexedBySource: { "surfaces.registry": number }; pendingSources: string[] };
    };
    assert.equal(registryRebuildPayload.data.sources.includes("surfaces.registry"), true);
    assert.equal(registryRebuildPayload.data.pendingSources.includes("surfaces.registry"), false);
    assert.ok(registryRebuildPayload.data.indexedBySource["surfaces.registry"] > 0);

    const query = await runCliCapture(["search", "query", "Search index sync", "--domains", "surfaces", "--data-dir", dataRoot, "--json", "--limit", "5", "--explain", "true"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as {
      data: {
        results: Array<{ source: string; domain: string; type: string; title: string; subtitle?: string; metadata?: { fromId?: string; toId?: string; stepCount?: number }; fragments?: Array<unknown>; actions?: Array<{ id: string; kind: string }> }>;
      };
    };
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

    const nodeQuery = await runCliCapture(["search", "query", "claw.relay", "--domains", "surfaces", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal(nodeQuery.code, CLI_EXIT_OK);
    const nodeQueryPayload = JSON.parse(nodeQuery.stdout) as {
      data: { results: Array<{ source: string; domain: string; type: string; resourceId?: string; path?: string; metadata?: { hasSource?: boolean; routeCount?: number } }> };
    };
    const nodeResult = nodeQueryPayload.data.results.find((candidate) => candidate.source === "surfaces.registry" && candidate.resourceId === "claw.relay");
    assert.equal(nodeResult?.domain, "surfaces");
    assert.equal(nodeResult?.type, "surface");
    assert.equal(nodeResult?.metadata?.hasSource, true);
    assert.ok((nodeResult?.metadata?.routeCount ?? 0) > 0);

    for (const golden of readDiscoverabilityGoldenQueries(rootDir)) {
      const goldenQuery = await runCliCapture([
        "search",
        "query",
        golden.query,
        "--domains",
        golden.domains.join(","),
        "--data-dir",
        dataRoot,
        "--json",
        "--limit",
        String(Math.max(5, golden.maxRank)),
      ], workspaceRoot);
      assert.equal(goldenQuery.code, CLI_EXIT_OK, goldenQuery.stderr || goldenQuery.stdout);
      const goldenPayload = JSON.parse(goldenQuery.stdout) as {
        data: { results: Array<{ source: string; type: string; resourceId?: string }> };
      };
      const rank = goldenPayload.data.results.findIndex((candidate) => (
        candidate.source === golden.expectSource &&
        candidate.type === golden.expectType &&
        candidate.resourceId === golden.expectResourceId
      ));
      assert.ok(rank >= 0, `${golden.id} should return ${golden.expectResourceId}`);
      assert.ok(rank + 1 <= golden.maxRank, `${golden.id} returned ${golden.expectResourceId} at rank ${rank + 1}, expected <= ${golden.maxRank}`);
    }

    const event = await runCliCapture(["search", "changes", "schedule", "upsert", "--source", "surfaces.routes", "--route-id", "sync.searchIndex", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(event.code, CLI_EXIT_OK, event.stderr || event.stdout);
    const eventPayload = JSON.parse(event.stdout) as {
      data: { item?: { id: string; source: string; operation: string; resourceId?: string; shard?: string; payload?: { eventDriven?: boolean; routeId?: string } } };
    };
    assert.equal(eventPayload.data.item?.source, "surfaces.routes");
    assert.equal(eventPayload.data.item?.operation, "upsert");
    assert.equal(eventPayload.data.item?.resourceId, "sync.searchIndex");
    assert.equal(eventPayload.data.item?.shard, "hot");
    assert.equal(eventPayload.data.item?.payload?.eventDriven, true);
    assert.equal(eventPayload.data.item?.payload?.routeId, "sync.searchIndex");

    const serviceRun = await runCliCapture(["search", "service", "run-once", "--source", "surfaces.routes", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(serviceRun.code, CLI_EXIT_OK);
    const serviceRunPayload = JSON.parse(serviceRun.stdout) as {
      data: { worker?: { items: Array<{ id: string; source: string; status: string; indexed?: number }> } };
    };
    assert.equal(serviceRunPayload.data.worker?.items[0]?.id, eventPayload.data.item?.id);
    assert.equal(serviceRunPayload.data.worker?.items[0]?.source, "surfaces.routes");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.status, "done");
    assert.equal(serviceRunPayload.data.worker?.items[0]?.indexed, 1);

    const surfaceEvent = await runCliCapture(["search", "changes", "schedule", "upsert", "--source", "surfaces.registry", "--surface-id", "claw.relay", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(surfaceEvent.code, CLI_EXIT_OK, surfaceEvent.stderr || surfaceEvent.stdout);
    const surfaceEventPayload = JSON.parse(surfaceEvent.stdout) as {
      data: { item?: { source: string; operation: string; resourceId?: string; payload?: { eventDriven?: boolean; surfaceId?: string } } };
    };
    assert.equal(surfaceEventPayload.data.item?.source, "surfaces.registry");
    assert.equal(surfaceEventPayload.data.item?.operation, "upsert");
    assert.equal(surfaceEventPayload.data.item?.resourceId, "claw.relay");
    assert.equal(surfaceEventPayload.data.item?.payload?.surfaceId, "claw.relay");

    const staleRouteId = "missing.surfaceRoute";
    const store = new SearchStore(path.join(dataRoot, "search.sqlite"));
    try {
      store.upsertDocument({
        id: `surfaces.routes:${staleRouteId}`,
        source: "surfaces.routes",
        domain: "surfaces",
        type: "route",
        title: "Stale Surface Route",
        body: "stale surface route tombstone sentinel",
        resourceId: staleRouteId,
      });
    } finally {
      store.close();
    }
    const deleted = await runCliCapture(["search", "changes", "schedule", "delete", "--source", "surfaces.routes", "--route-id", staleRouteId, "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(deleted.code, CLI_EXIT_OK, deleted.stderr || deleted.stdout);
    const deletedPayload = JSON.parse(deleted.stdout) as {
      data: { item?: { source: string; operation: string; resourceId?: string; payload?: { eventDriven?: boolean; routeId?: string } } };
    };
    assert.equal(deletedPayload.data.item?.source, "surfaces.routes");
    assert.equal(deletedPayload.data.item?.operation, "delete");
    assert.equal(deletedPayload.data.item?.resourceId, staleRouteId);
    assert.equal(deletedPayload.data.item?.payload?.eventDriven, true);
    assert.equal(deletedPayload.data.item?.payload?.routeId, staleRouteId);
    const deleteRun = await runCliCapture(["search", "service", "run-once", "--source", "surfaces.routes", "--data-dir", dataRoot, "--json", "--limit", "1"], workspaceRoot);
    assert.equal(deleteRun.code, CLI_EXIT_OK);
    const deleteRunPayload = JSON.parse(deleteRun.stdout) as {
      data: { worker?: { items: Array<{ source: string; operation: string; status: string; indexed?: number }> } };
    };
    const routeDeleteRunItem = deleteRunPayload.data.worker?.items.find((entry) => entry.source === "surfaces.routes");
    assert.deepEqual({ source: routeDeleteRunItem?.source, operation: routeDeleteRunItem?.operation, status: routeDeleteRunItem?.status, indexed: routeDeleteRunItem?.indexed }, { source: "surfaces.routes", operation: "delete", status: "done", indexed: 1 });
    const afterRouteDelete = await runCliCapture(["search", "query", "stale surface route tombstone sentinel", "--domains", "surfaces", "--data-dir", dataRoot, "--json", "--limit", "5"], workspaceRoot);
    assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(afterRouteDelete.code), true, afterRouteDelete.stderr || afterRouteDelete.stdout);
    const afterRouteDeletePayload = JSON.parse(afterRouteDelete.stdout) as { data: { results: Array<{ source: string; resourceId?: string }> } };
    assert.equal(afterRouteDeletePayload.data.results.some((entry) => entry.source === "surfaces.routes" && entry.resourceId === staleRouteId), false);
  });
}
