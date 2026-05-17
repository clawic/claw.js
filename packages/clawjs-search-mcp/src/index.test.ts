import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { SearchStore, createFrameworkSearchSourceManifest } from "@clawjs/search";

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
      "search.actions.execute",
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

test("Search MCP action execution returns brokered plans and audit records", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-mcp-actions-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "commands",
      domain: "commands",
      name: "Commands",
      resultTypes: ["command"],
    }));
    store.upsertDocument({
      id: "commands:system",
      source: "commands",
      domain: "commands",
      type: "command",
      title: "system",
      body: "system help",
      actions: [{ id: "help", kind: "run", label: "Show help", requiresApproval: true, risk: "system", grant: "search.commands.run" }],
    });

    const tools = createSearchMcpTools(store);
    const executeTool = tools.find((tool) => tool.name === "search.actions.execute");
    assert.ok(executeTool);

    const dryRun = executeTool.handler({ resultId: "commands:system", actionId: "help", dryRun: true, actor: "agent:test", surface: "mcp" }) as {
      plan: { status: string; dryRun: boolean; broker: { sideEffects: string }; actor?: string; surface?: string };
      blocked: boolean;
    };
    assert.equal(dryRun.plan.status, "planned");
    assert.equal(dryRun.plan.dryRun, true);
    assert.equal(dryRun.plan.broker.sideEffects, "none");
    assert.equal(dryRun.plan.actor, "agent:test");
    assert.equal(dryRun.plan.surface, "mcp");
    assert.equal(dryRun.blocked, false);

    const blocked = executeTool.handler({ resultId: "commands:system", actionId: "help" }) as {
      plan: { status: string; requiresApproval: boolean };
      blocked: boolean;
    };
    assert.equal(blocked.plan.status, "blocked");
    assert.equal(blocked.plan.requiresApproval, true);
    assert.equal(blocked.blocked, true);

    const brokered = executeTool.handler({ resultId: "commands:system", actionId: "help", hostApprovalId: "approval_search_help" }) as {
      plan: { status: string; hostApprovalId?: string; broker: { sideEffects: string } };
      brokered: boolean;
    };
    assert.equal(brokered.plan.status, "brokered");
    assert.equal(brokered.plan.hostApprovalId, "approval_search_help");
    assert.equal(brokered.plan.broker.sideEffects, "host_brokered");
    assert.equal(brokered.brokered, true);

    const audit = store.listAuditEvents({ type: "action" });
    assert.equal(audit.some((item) => item.resultId === "commands:system" && item.actionId === "help" && item.status === "planned"), true);
    assert.equal(audit.some((item) => item.resultId === "commands:system" && item.actionId === "help" && item.status === "blocked"), true);
    assert.equal(audit.some((item) => item.resultId === "commands:system" && item.actionId === "help" && item.status === "brokered" && item.metadata?.hostApprovalId === "approval_search_help"), true);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
