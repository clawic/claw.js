import { test } from "vitest";
import assert from "node:assert/strict";
import { registeredDatabasePath, registeredSearchDatabasePath } from "../../../tests/helpers/stable-surface-test-builders.ts";
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
test("Search MCP package publishes only the public Search binary", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "packages/clawjs-search-mcp/package.json"), "utf8")) as {
    bin?: Record<string, string>;
    dependencies?: Record<string, string>;
  };
  assert.deepEqual(packageJson.bin, { "claw-search-mcp": "bin/claw-search-mcp.mjs" });
  assert.equal(packageJson.dependencies?.["@clawjs/search"], "0.1.2");
  assert.equal(fs.existsSync(path.resolve(process.cwd(), "packages/clawjs-search-mcp/bin/claw-search-mcp.mjs")), true);
  assert.equal(fs.existsSync(path.resolve(process.cwd(), "packages/clawjs-search-mcp/bin", ["clawjs", "index", "mcp"].join("-") + ".mjs")), false);
});
test("search actions honor actor and scope ACLs", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-actions-acl-"));
  const dataRoot = path.join(workspaceRoot, "data");
  const store = new SearchStore(registeredSearchDatabasePath(dataRoot));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "documents.blocks",
      domain: "documents",
      name: "Documents",
      resultTypes: ["document"],
    }));
    store.upsertDocument({
      id: "documents.blocks:restricted",
      source: "documents.blocks",
      domain: "documents",
      type: "document",
      title: "Restricted launch notes",
      body: "Restricted launch notes for scoped action checks.",
      permissions: { allowedActors: ["agent:codex"], requiredScopes: ["project-alpha"] },
      actions: [{ id: "open", kind: "open", label: "Open restricted note", grant: "search.documents.open", requiresApproval: false }],
    });
  } finally {
    store.close();
  }
  const hidden = await runCliCapture(["search", "actions", "documents.blocks:restricted", "--data-dir", dataRoot, "--json"], workspaceRoot);
  assert.equal(hidden.code, CLI_EXIT_OK);
  const hiddenPayload = JSON.parse(hidden.stdout) as { data: { actions: unknown[] } };
  assert.deepEqual(hiddenPayload.data.actions, []);
  const wrongScope = await runCliCapture(["search", "actions", "documents.blocks:restricted", "--actor", "agent:codex", "--filter", "scopeId=project-beta", "--data-dir", dataRoot, "--json"], workspaceRoot);
  assert.equal(wrongScope.code, CLI_EXIT_OK);
  const wrongScopePayload = JSON.parse(wrongScope.stdout) as { data: { actions: unknown[] } };
  assert.deepEqual(wrongScopePayload.data.actions, []);
  const visible = await runCliCapture(["search", "actions", "documents.blocks:restricted", "--actor", "agent:codex", "--filter", "scopeId=project-alpha", "--data-dir", dataRoot, "--json"], workspaceRoot);
  assert.equal(visible.code, CLI_EXIT_OK);
  const visiblePayload = JSON.parse(visible.stdout) as { data: { actions: Array<{ id: string }> } };
  assert.deepEqual(visiblePayload.data.actions.map((action) => action.id), ["open"]);
  const blockedExecute = await runCliCapture(["search", "actions", "execute", "documents.blocks:restricted", "open", "--actor", "agent:codex", "--filter", "scopeId=project-beta", "--dry-run", "--data-dir", dataRoot, "--json"], workspaceRoot);
  assert.equal(blockedExecute.code, CLI_EXIT_FAILURE);
  const blockedExecutePayload = JSON.parse(blockedExecute.stdout) as { error: { code: string } };
  assert.equal(blockedExecutePayload.error.code, "search_action_not_found");
  const allowedExecute = await runCliCapture(["search", "actions", "execute", "documents.blocks:restricted", "open", "--actor", "agent:codex", "--filter", "scopeId=project-alpha", "--dry-run", "--data-dir", dataRoot, "--json"], workspaceRoot);
  assert.equal(allowedExecute.code, CLI_EXIT_OK);
  const allowedExecutePayload = JSON.parse(allowedExecute.stdout) as { data: { plan: { status: string; resultId: string; actionId: string } } };
  assert.equal(allowedExecutePayload.data.plan.status, "planned");
  assert.equal(allowedExecutePayload.data.plan.resultId, "documents.blocks:restricted");
  assert.equal(allowedExecutePayload.data.plan.actionId, "open");
});
test("search indexes native.system only from signed host snapshots", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-native-system-"));
  const dataRoot = path.join(workspaceRoot, "data");
  const snapshotPath = path.join(workspaceRoot, "native-system-snapshot.json");
  fs.writeFileSync(snapshotPath, JSON.stringify({
    source: "native.system",
    domain: "native",
    state: "enabled",
    updatedAt: "2026-05-19T10:00:00.000Z",
    documents: [
      {
        id: "native.system:shortcut:daily-plan",
        source: "native.system",
        domain: "native",
        type: "shortcut",
        title: "Daily Plan",
        subtitle: "Shortcut",
        snippet: "Prepare the daily planning workspace.",
        resourceId: "shortcut:Daily Plan",
        metadata: { kind: "shortcut", name: "Daily Plan" },
        actions: [
          {
            id: "run",
            kind: "run",
            label: "Run Shortcut",
            requiresApproval: true,
            grant: "native.system.shortcut.run",
            risk: "system",
            hostBroker: {
              system: "mac-control",
              capabilityId: "mac.shortcut.run",
              arguments: { name: "Daily Plan" },
              target: { kind: "shortcut", name: "Daily Plan" },
              reason: "Run native Shortcut from Search result",
            },
          },
        ],
      },
    ],
  }));
  const withoutSnapshot = await runCliCapture(["search", "sources", "enable", "native.system", "--source-set", "full", "--data-dir", dataRoot, "--json"], workspaceRoot);
  assert.equal(withoutSnapshot.code, CLI_EXIT_OK);
  const withoutSnapshotPayload = JSON.parse(withoutSnapshot.stdout) as { data: { source: string; state: string } };
  assert.equal(withoutSnapshotPayload.data.source, "native.system");
  assert.equal(withoutSnapshotPayload.data.state, "external_pending");
  const withSnapshot = await runCliCapture(["search", "sources", "enable", "native.system", "--source-set", "full", "--native-system-snapshot", snapshotPath, "--data-dir", dataRoot, "--json"], workspaceRoot);
  assert.equal(withSnapshot.code, CLI_EXIT_OK);
  const withSnapshotPayload = JSON.parse(withSnapshot.stdout) as { data: { source: string; state: string } };
  assert.equal(withSnapshotPayload.data.source, "native.system");
  assert.equal(withSnapshotPayload.data.state, "enabled");
  const rebuild = await runCliCapture(["search", "rebuild", "--source", "native.system", "--source-set", "full", "--native-system-snapshot", snapshotPath, "--data-dir", dataRoot, "--json"], workspaceRoot);
  assert.equal(rebuild.code, CLI_EXIT_OK);
  const rebuildPayload = JSON.parse(rebuild.stdout) as { data: { sources: string[]; indexedBySource: Record<string, number>; pendingSources: string[] } };
  assert.deepEqual(rebuildPayload.data.sources, ["native.system"]);
  assert.equal(rebuildPayload.data.indexedBySource["native.system"], 1);
  assert.equal(rebuildPayload.data.pendingSources.includes("native.system"), false);
  const canonicalDb = new Database(registeredDatabasePath(dataRoot, "claw.database.core"));
  try {
    const rows = canonicalDb.prepare("SELECT source, state FROM search_source_config WHERE source = ?").all("native.system") as Array<{ source: string; state: string }>;
    assert.deepEqual(rows, [{ source: "native.system", state: "enabled" }]);
  } finally {
    canonicalDb.close();
  }
  const query = await runCliCapture(["search", "query", "daily plan", "--source-set", "full", "--sources", "native.system", "--data-dir", dataRoot, "--json"], workspaceRoot);
  assert.equal(query.code, CLI_EXIT_OK, query.stdout);
  const queryPayload = JSON.parse(query.stdout) as { data: { results: Array<{ id: string; source: string; domain: string; actions?: Array<{ id: string; hostBroker?: { capabilityId: string } }> }> } };
  assert.equal(queryPayload.data.results[0]?.id, "native.system:shortcut:daily-plan");
  assert.equal(queryPayload.data.results[0]?.source, "native.system");
  assert.equal(queryPayload.data.results[0]?.domain, "native");
  assert.equal(queryPayload.data.results[0]?.actions?.[0]?.hostBroker?.capabilityId, "mac.shortcut.run");
  const dryRun = await runCliCapture(["search", "actions", "execute", "native.system:shortcut:daily-plan", "run", "--actor", "agent:codex", "--dry-run", "--data-dir", dataRoot, "--json"], workspaceRoot);
  assert.equal(dryRun.code, CLI_EXIT_OK);
  const dryRunPayload = JSON.parse(dryRun.stdout) as { data: { plan: { hostRequest?: { capabilityId: string; dryRun: boolean; command: { action: string } } } } };
  assert.equal(dryRunPayload.data.plan.hostRequest?.capabilityId, "mac.shortcut.run");
  assert.equal(dryRunPayload.data.plan.hostRequest?.dryRun, true);
  assert.equal(dryRunPayload.data.plan.hostRequest?.command.action, "plan");
});
test("search rebuild indexes surface route graph contracts", runSearchSurfaceRouteGraphContractsScenario);
test("search rebuild indexes docs pages and refreshes resource jobs", runSearchDocsPagesScenario);
test("docs.pages event jobs refresh and tombstone individual docs", runSearchDocsPagesEventScenario);
test("docs page writes enqueue and tombstone docs page search events", runSearchDocsPagesCliWriteScenario);
