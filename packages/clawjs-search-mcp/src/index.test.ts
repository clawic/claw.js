import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { SearchStore } from "@clawjs/search";

import { createSearchMcpTools } from "./index.ts";

test("Search MCP exposes profile, entrypoint, and explain tools", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-mcp-tools-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    const tools = createSearchMcpTools(store);
    const toolNames = new Set(tools.map((tool) => tool.name));

    for (const name of [
      "search.query",
      "search.sources.list",
      "search.status",
      "search.profiles.list",
      "search.entrypoints.list",
      "search.explain",
      "search.actions.list",
      "search.saved.list",
      "search.monitors.list",
      "search.audit.list",
      "search.jobs.list",
    ]) {
      assert.equal(toolNames.has(name), true, `${name} should be exposed`);
    }

    const profilesTool = tools.find((tool) => tool.name === "search.profiles.list");
    const profiles = profilesTool?.handler({}) as { profiles: Array<{ id: string; defaultEnabled: boolean }> };
    assert.equal(profiles.profiles.find((profile) => profile.id === "framework")?.defaultEnabled, true);
    assert.equal(profiles.profiles.find((profile) => profile.id === "full")?.defaultEnabled, false);

    const entrypointsTool = tools.find((tool) => tool.name === "search.entrypoints.list");
    const entrypoints = entrypointsTool?.handler({}) as {
      rootSearchShortcutState: string;
      chatSearchIsolation: boolean;
      entrypoints: Array<{ id: string; route?: string; queryScope: string; shortcut: { bindingId: string; state: string; reservedChord?: string } }>;
    };
    assert.equal(entrypoints.rootSearchShortcutState, "external_pending");
    assert.equal(entrypoints.chatSearchIsolation, true);
    assert.equal(entrypoints.entrypoints.find((entrypoint) => entrypoint.id === "root-search")?.route, "/search");
    assert.equal(entrypoints.entrypoints.find((entrypoint) => entrypoint.id === "root-search")?.shortcut.bindingId, "search.root.global");
    assert.equal(entrypoints.entrypoints.find((entrypoint) => entrypoint.id === "chat-search")?.queryScope, "conversations_only");
    assert.equal(entrypoints.entrypoints.find((entrypoint) => entrypoint.id === "chat-search")?.shortcut.reservedChord, "Command-G");

    const explainTool = tools.find((tool) => tool.name === "search.explain");
    const explanation = explainTool?.handler({ query: "release branch" }) as { query: string; budgets: { sourceTimeoutMs: number }; ranking: string[] };
    assert.equal(explanation.query, "release branch");
    assert.equal(explanation.budgets.sourceTimeoutMs, 75);
    assert.equal(explanation.ranking.includes("local frecency"), true);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
