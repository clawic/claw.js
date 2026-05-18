import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import {
  SearchStore,
  createFrameworkSearchSourceManifest,
} from "@clawjs/search";

import { createSearchMcpTools } from "./index.ts";

test("Search MCP monitor evaluation preserves saved search agent budgets", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-mcp-monitor-budget-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "commands",
      domain: "commands",
      name: "Commands",
      resultTypes: ["command"],
    }));
    for (const id of ["one", "two", "three"]) {
      store.upsertDocument({
        id: `commands:${id}`,
        source: "commands",
        domain: "commands",
        type: "command",
        title: `Budget command ${id}`,
        body: "budget marker command result",
      });
    }

    const tools = createSearchMcpTools(store);
    const savedCreateTool = tools.find((tool) => tool.name === "search.saved.create");
    const monitorCreateTool = tools.find((tool) => tool.name === "search.monitors.create");
    const evaluateTool = tools.find((tool) => tool.name === "search.monitors.evaluate");
    assert.ok(savedCreateTool);
    assert.ok(monitorCreateTool);
    assert.ok(evaluateTool);

    savedCreateTool.handler({
      id: "budgeted-mcp-query",
      query: "budget marker",
      sources: ["commands"],
      limit: 10,
      agentBudget: { maxResults: 1, maxResultsPerSource: 1, maxResultsPerDomain: 1 },
    });
    monitorCreateTool.handler({
      id: "budgeted-mcp-monitor",
      savedSearchId: "budgeted-mcp-query",
    });

    const evaluated = evaluateTool.handler({ id: "budgeted-mcp-monitor", limit: 5 }) as {
      items: Array<{
        query?: {
          limit?: number;
          agentBudget?: { maxResults?: number; maxResultsPerSource?: number; maxResultsPerDomain?: number };
        };
        resultCount: number;
        results: unknown[];
      }>;
    };
    assert.equal(evaluated.items[0]?.query?.limit, 5);
    assert.deepEqual(evaluated.items[0]?.query?.agentBudget, {
      maxResults: 1,
      maxResultsPerSource: 1,
      maxResultsPerDomain: 1,
    });
    assert.equal(evaluated.items[0]?.resultCount, 1);
    assert.equal(evaluated.items[0]?.results.length, 1);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
