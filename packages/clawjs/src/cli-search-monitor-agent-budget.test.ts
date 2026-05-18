import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { CLI_EXIT_OK } from "./index.ts";
import { runCliCapture } from "./index-test-utils.ts";

test("search monitor run preserves saved search agent budgets", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-monitor-budget-"));
  const dataRoot = path.join(workspaceRoot, "data");
  try {
    const saved = await runCliCapture([
      "search",
      "saved",
      "create",
      "budgeted-command-query",
      "--query",
      "command",
      "--sources",
      "commands",
      "--limit",
      "10",
      "--agent-result-limit",
      "1",
      "--agent-source-limit",
      "1",
      "--agent-domain-limit",
      "1",
      "--data-dir",
      dataRoot,
      "--json",
    ], workspaceRoot);
    assert.equal(saved.code, CLI_EXIT_OK, saved.stderr || saved.stdout);
    const savedPayload = JSON.parse(saved.stdout) as {
      data: {
        item: {
          query: {
            limit?: number;
            agentBudget?: { maxResults?: number; maxResultsPerSource?: number; maxResultsPerDomain?: number };
          };
        };
      };
    };
    assert.equal(savedPayload.data.item.query.limit, 10);
    assert.deepEqual(savedPayload.data.item.query.agentBudget, {
      maxResults: 1,
      maxResultsPerSource: 1,
      maxResultsPerDomain: 1,
    });

    const monitor = await runCliCapture([
      "search",
      "monitors",
      "create",
      "budgeted-command-monitor",
      "--saved-search",
      "budgeted-command-query",
      "--data-dir",
      dataRoot,
      "--json",
    ], workspaceRoot);
    assert.equal(monitor.code, CLI_EXIT_OK, monitor.stderr || monitor.stdout);

    const run = await runCliCapture([
      "search",
      "monitors",
      "run",
      "budgeted-command-monitor",
      "--limit",
      "5",
      "--data-dir",
      dataRoot,
      "--json",
    ], workspaceRoot);
    assert.equal(run.code, CLI_EXIT_OK, run.stderr || run.stdout);
    const runPayload = JSON.parse(run.stdout) as {
      data: {
        items: Array<{
          query?: {
            limit?: number;
            agentBudget?: { maxResults?: number; maxResultsPerSource?: number; maxResultsPerDomain?: number };
          };
          resultCount: number;
          results: unknown[];
        }>;
      };
    };
    assert.equal(runPayload.data.items[0]?.query?.limit, 5);
    assert.deepEqual(runPayload.data.items[0]?.query?.agentBudget, {
      maxResults: 1,
      maxResultsPerSource: 1,
      maxResultsPerDomain: 1,
    });
    assert.equal(runPayload.data.items[0]?.resultCount, 1);
    assert.equal(runPayload.data.items[0]?.results.length, 1);
  } finally {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
