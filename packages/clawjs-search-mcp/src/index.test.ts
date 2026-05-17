import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import {
  LOCAL_TEXT_EMBEDDING_DIMENSIONS,
  LOCAL_TEXT_EMBEDDING_MODEL,
  SearchStore,
  createFrameworkSearchSourceManifest,
  createLocalTextEmbedding,
} from "@clawjs/search";

import { createSearchMcpTools } from "./index.ts";

test("Search MCP exposes profile, entrypoint, and explain tools", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-mcp-tools-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    const tools = createSearchMcpTools(store);
    const toolNames = new Set(tools.map((tool) => tool.name));

    for (const name of [
      "search.query",
      "search.embeddings.create",
      "search.sources.list",
      "search.sources.set_state",
      "search.status",
      "search.shards.list",
      "search.profiles.list",
      "search.entrypoints.list",
      "search.aliases.list",
      "search.explain",
      "search.actions.list",
      "search.actions.execute",
      "search.saved.list",
      "search.monitors.list",
      "search.monitors.evaluate",
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

    const aliasesTool = tools.find((tool) => tool.name === "search.aliases.list");
    const aliases = aliasesTool?.handler({}) as {
      count: number;
      rootSearchShortcutState: string;
      chatSearchIsolation: boolean;
      aliases: Array<{ alias: string; canonicalName: string; source: string; searchDomain: string; resultId: string | null }>;
    };
    assert.equal(aliases.count, aliases.aliases.length);
    assert.equal(aliases.rootSearchShortcutState, "external_pending");
    assert.equal(aliases.chatSearchIsolation, true);
    const dbAlias = aliases.aliases.find((alias) => alias.alias === "db");
    assert.equal(dbAlias?.canonicalName, "database");
    assert.equal(dbAlias?.source, "command");
    assert.equal(dbAlias?.searchDomain, "commands");
    assert.equal(dbAlias?.resultId, "commands:database");
    const imageAlias = aliases.aliases.find((alias) => alias.alias === "image");
    assert.equal(imageAlias?.canonicalName, "images");
    assert.equal(imageAlias?.resultId, "commands:images");

    const explainTool = tools.find((tool) => tool.name === "search.explain");
    const explanation = explainTool?.handler({ query: "release branch" }) as { query: string; budgets: { sourceTimeoutMs: number }; ranking: string[] };
    assert.equal(explanation.query, "release branch");
    assert.equal(explanation.budgets.sourceTimeoutMs, 75);
    assert.equal(explanation.ranking.includes("local frecency"), true);

    store.registerSource(createFrameworkSearchSourceManifest({
      id: "commands",
      domain: "commands",
      name: "Commands",
      resultTypes: ["command"],
    }));
    const setStateTool = tools.find((tool) => tool.name === "search.sources.set_state");
    const paused = setStateTool?.handler({ source: "commands", state: "paused", backlog: 3 }) as {
      source: string;
      state: string;
      backlog: number;
    };
    assert.equal(paused.source, "commands");
    assert.equal(paused.state, "paused");
    assert.equal(paused.backlog, 3);
    const enabled = setStateTool?.handler({ source: "commands", state: "enabled" }) as { state: string };
    assert.equal(enabled.state, "enabled");
    assert.throws(() => setStateTool?.handler({ source: "missing", state: "enabled" }), /Search source not found/);

    store.upsertDocument({
      id: "commands:search",
      source: "commands",
      domain: "commands",
      type: "command",
      title: "search",
      body: "search help",
      shard: "hot",
      fragments: [{ id: "commands:search:usage", title: "usage", body: "search usage", sortOrder: 0 }],
    });
    const shardsTool = tools.find((tool) => tool.name === "search.shards.list");
    const shards = shardsTool?.handler({ source: "commands" }) as {
      state: string;
      shards: Array<{ source: string; domain: string; shard: string; state: string; documentCount: number; fragmentCount: number }>;
    };
    assert.equal(shards.state, "ready");
    assert.equal(shards.shards[0]?.source, "commands");
    assert.equal(shards.shards[0]?.domain, "commands");
    assert.equal(shards.shards[0]?.shard, "hot");
    assert.equal(shards.shards[0]?.state, "active");
    assert.equal(shards.shards[0]?.documentCount, 1);
    assert.equal(shards.shards[0]?.fragmentCount, 1);
    const emptyShards = shardsTool?.handler({ domain: "missing" }) as { state: string; shards: unknown[] };
    assert.equal(emptyShards.state, "empty");
    assert.deepEqual(emptyShards.shards, []);

    store.saveSearch({ id: "saved-search", name: "Search command", query: { query: "search", domains: ["commands"] } });
    store.saveMonitor({ id: "monitor-search", savedSearchId: "saved-search", name: "Search monitor", cadence: "hourly" });
    const evaluateTool = tools.find((tool) => tool.name === "search.monitors.evaluate");
    const evaluated = evaluateTool?.handler({ id: "monitor-search", limit: 1 }) as {
      state: string;
      items: Array<{
        monitorId: string;
        state: string;
        resultCount: number;
        partial: boolean;
        query?: { limit?: number };
        omittedSources?: Array<{ source: string; reason: string }>;
        results: Array<{ id: string }>;
      }>;
    };
    assert.equal(evaluated.state, "ready");
    assert.equal(evaluated.items[0]?.monitorId, "monitor-search");
    assert.equal(evaluated.items[0]?.state, "ready");
    assert.equal(evaluated.items[0]?.resultCount, 1);
    assert.equal(evaluated.items[0]?.partial, false);
    assert.equal(evaluated.items[0]?.query?.limit, 1);
    assert.equal(evaluated.items[0]?.results[0]?.id, "commands:search");

    store.saveMonitor({ id: "monitor-disabled", savedSearchId: "saved-search", name: "Disabled monitor", enabled: false });
    const enabledOnly = evaluateTool?.handler({}) as { items: Array<{ monitorId: string }> };
    assert.equal(enabledOnly.items.some((item) => item.monitorId === "monitor-disabled"), false);
    const allMonitors = evaluateTool?.handler({ all: true }) as { items: Array<{ monitorId: string }> };
    assert.equal(allMonitors.items.some((item) => item.monitorId === "monitor-disabled"), true);

    store.setSourceState("commands", "paused", { error: "maintenance" });
    const partial = evaluateTool?.handler({ monitorId: "monitor-search" }) as {
      state: string;
      items: Array<{ monitorId: string; state: string; partial: boolean; resultCount: number; omittedSources: Array<{ source: string; reason: string }> }>;
    };
    assert.equal(partial.state, "partial");
    assert.equal(partial.items[0]?.monitorId, "monitor-search");
    assert.equal(partial.items[0]?.state, "ready");
    assert.equal(partial.items[0]?.partial, true);
    assert.equal(partial.items[0]?.resultCount, 0);
    assert.equal(partial.items[0]?.omittedSources[0]?.source, "commands");
    assert.equal(partial.items[0]?.omittedSources[0]?.reason, "disabled");

  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Search MCP derives local embeddings for semantic queries", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-mcp-embeddings-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "documents.blocks",
      domain: "documents",
      name: "Documents",
      resultTypes: ["document"],
      capabilities: { semantic: "optional" },
    }));
    store.upsertDocument({
      id: "documents.blocks:alpha",
      source: "documents.blocks",
      domain: "documents",
      type: "document",
      title: "Design rationale",
      body: "Architecture notes about quiet interfaces.",
    });
    store.upsertDocument({
      id: "documents.blocks:beta",
      source: "documents.blocks",
      domain: "documents",
      type: "document",
      title: "Release notes",
      body: "Changelog for packaging.",
    });
    store.upsertVector({
      documentId: "documents.blocks:alpha",
      model: LOCAL_TEXT_EMBEDDING_MODEL,
      embedding: createLocalTextEmbedding("quiet architecture interface").vector,
    });
    store.upsertVector({
      documentId: "documents.blocks:beta",
      model: LOCAL_TEXT_EMBEDDING_MODEL,
      embedding: createLocalTextEmbedding("packaging changelog release").vector,
    });

    const tools = createSearchMcpTools(store);
    const embeddingsTool = tools.find((tool) => tool.name === "search.embeddings.create");
    assert.ok(embeddingsTool);
    const embedding = embeddingsTool.handler({ text: "quiet architecture interface" }) as { model: string; vector: number[] };
    assert.equal(embedding.model, LOCAL_TEXT_EMBEDDING_MODEL);
    assert.equal(embedding.vector.length, LOCAL_TEXT_EMBEDDING_DIMENSIONS);
    assert.deepEqual(embedding.vector, createLocalTextEmbedding("quiet architecture interface").vector);

    const queryTool = tools.find((tool) => tool.name === "search.query");
    assert.ok(queryTool);
    const semantic = queryTool.handler({
      query: "quiet architecture interface",
      domains: ["documents"],
      strategy: "semantic",
      embeddingModel: LOCAL_TEXT_EMBEDDING_MODEL,
      explain: true,
    }) as { results: Array<{ id: string; explanation?: { matchedBy?: string[]; scoreBreakdown?: { semantic?: number } } }> };
    assert.equal(semantic.results[0]?.id, "documents.blocks:alpha");
    assert.equal(semantic.results[0]?.explanation?.matchedBy?.includes("semantic"), true);
    assert.ok((semantic.results[0]?.explanation?.scoreBreakdown?.semantic ?? 0) > 0);

    const shorthand = queryTool.handler({
      query: "packaging changelog release",
      domains: ["documents"],
      strategy: "semantic",
      localEmbedding: true,
    }) as { results: Array<{ id: string }> };
    assert.equal(shorthand.results[0]?.id, "documents.blocks:beta");
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
