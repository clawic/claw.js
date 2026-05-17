import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { CLI_EXIT_OK } from "./index.ts";
import { runCliCapture, withPatchedEnv } from "./index-test-utils.ts";

test("search rebuild and query use the Search sidecar without workspace state", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-cli-"));
  const dataRoot = path.join(workspaceRoot, "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const rebuild = await runCliCapture(["search", "rebuild", "--json"], workspaceRoot);
    assert.equal(rebuild.code, CLI_EXIT_OK);
    const rebuildPayload = JSON.parse(rebuild.stdout) as {
      ok: boolean;
      data: {
        rebuilt: boolean;
        reindexed: number;
        embeddings: number;
        storage: { index: string };
        sources: string[];
        pendingSources: string[];
      };
      meta: { canonicalCommand: string; subcommand: string };
    };
    assert.equal(rebuildPayload.ok, true);
    assert.equal(rebuildPayload.meta.canonicalCommand, "search");
    assert.equal(rebuildPayload.meta.subcommand, "rebuild");
    assert.equal(rebuildPayload.data.rebuilt, true);
    assert.equal(rebuildPayload.data.embeddings, 0);
    assert.equal(rebuildPayload.data.storage.index, "search.sqlite");
    assert.equal(fs.existsSync(path.join(dataRoot, "search.sqlite")), true);
    assert.equal(rebuildPayload.data.sources.includes("commands"), true);
    assert.equal(rebuildPayload.data.pendingSources.includes("sessions.chats"), true);
    assert.ok(rebuildPayload.data.reindexed > 0);

    const query = await runCliCapture(["search", "query", "system capabilities", "--json", "--limit", "5", "--explain", "true"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_OK);
    const queryPayload = JSON.parse(query.stdout) as {
      ok: boolean;
      data: {
        query: string;
        profile: string;
        results: Array<{
          id: string;
          source: string;
          domain: string;
          title: string;
          actions?: Array<{ id: string; kind: string }>;
          explanation?: { matchedBy?: string[] };
        }>;
        partial: boolean;
        omittedSources: unknown[];
      };
      meta: { canonicalCommand: string; subcommand: string };
    };
    assert.equal(queryPayload.ok, true);
    assert.equal(queryPayload.meta.canonicalCommand, "search");
    assert.equal(queryPayload.meta.subcommand, "query");
    assert.equal(queryPayload.data.query, "system capabilities");
    assert.equal(queryPayload.data.profile, "framework");
    assert.equal(queryPayload.data.partial, false);
    assert.deepEqual(queryPayload.data.omittedSources, []);
    assert.equal(queryPayload.data.results.some((result) => result.source === "commands" && result.title === "system"), true);
    const systemResult = queryPayload.data.results.find((result) => result.title === "system");
    assert.equal(systemResult?.domain, "commands");
    assert.equal(systemResult?.actions?.some((action) => action.id === "help" && action.kind === "run"), true);
    assert.ok(systemResult?.explanation?.matchedBy?.length);

    const actions = await runCliCapture(["search", "actions", "commands:system", "--json"], workspaceRoot);
    assert.equal(actions.code, CLI_EXIT_OK);
    const actionsPayload = JSON.parse(actions.stdout) as {
      data: {
        resultId: string;
        actions: Array<{ id: string; kind: string }>;
        brokered: boolean;
      };
    };
    assert.equal(actionsPayload.data.resultId, "commands:system");
    assert.equal(actionsPayload.data.actions.some((action) => action.id === "help"), true);
    assert.equal(actionsPayload.data.brokered, true);

    const status = await runCliCapture(["search", "status", "--json"], workspaceRoot);
    assert.equal(status.code, CLI_EXIT_OK);
    const statusPayload = JSON.parse(status.stdout) as {
      data: {
        storage: { index: string };
        sources: Array<{ source: string; state: string; fastPath: boolean; lastIndexedAt?: string }>;
      };
    };
    assert.equal(statusPayload.data.storage.index, "search.sqlite");
    const commandStatus = statusPayload.data.sources.find((source) => source.source === "commands");
    assert.equal(commandStatus?.state, "enabled");
    assert.equal(commandStatus?.fastPath, true);
    assert.ok(commandStatus?.lastIndexedAt);

    const saved = await runCliCapture(["search", "saved", "create", "recent-system", "--query", "system capabilities", "--name", "Recent system", "--json"], workspaceRoot);
    assert.equal(saved.code, CLI_EXIT_OK);
    const savedPayload = JSON.parse(saved.stdout) as {
      data: { item: { id: string; name: string; query: { query: string } }; items: Array<{ id: string }> };
    };
    assert.equal(savedPayload.data.item.id, "recent-system");
    assert.equal(savedPayload.data.item.name, "Recent system");
    assert.equal(savedPayload.data.item.query.query, "system capabilities");
    assert.equal(savedPayload.data.items.some((item) => item.id === "recent-system"), true);

    const monitor = await runCliCapture(["search", "monitors", "create", "monitor-system", "--saved-search", "recent-system", "--cadence", "hourly", "--json"], workspaceRoot);
    assert.equal(monitor.code, CLI_EXIT_OK);
    const monitorPayload = JSON.parse(monitor.stdout) as {
      data: { item: { id: string; savedSearchId: string; cadence: string }; items: Array<{ id: string; enabled: boolean }> };
    };
    assert.equal(monitorPayload.data.item.id, "monitor-system");
    assert.equal(monitorPayload.data.item.savedSearchId, "recent-system");
    assert.equal(monitorPayload.data.item.cadence, "hourly");
    assert.equal(monitorPayload.data.items.some((item) => item.id === "monitor-system" && item.enabled), true);
  });
});
