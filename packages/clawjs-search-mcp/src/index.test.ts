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
  createFullSearchSourceManifest,
  createLocalTextEmbedding,
} from "@clawjs/search";

import { createSearchMcpTools } from "./index.ts";

test("Search MCP exposes source-set, entrypoint, and explain tools", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-mcp-tools-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "documents.blocks",
      domain: "documents",
      name: "Documents",
      resultTypes: ["document"],
    }));
    const tools = createSearchMcpTools(store);
    const toolNames = new Set(tools.map((tool) => tool.name));

    for (const name of [
      "search.query",
      "search.embeddings.create",
      "search.embeddings.index",
      "search.embeddings.status",
      "search.sources.list",
      "search.sources.set_state",
      "search.status",
      "search.cursors.list",
      "search.shards.list",
      "search.profiles.list",
      "search.entrypoints.list",
      "search.aliases.list",
      "search.explain",
      "search.actions.list",
      "search.actions.execute",
      "search.saved.list",
      "search.saved.delete",
      "search.saved.create",
      "search.monitors.list",
      "search.monitors.delete",
      "search.monitors.create",
      "search.monitors.evaluate",
      "search.audit.list",
      "search.jobs.list",
      "search.jobs.enqueue",
      "search.jobs.schedule",
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
    store.setCursor({
      source: "commands",
      shard: "hot",
      cursor: "commands-mcp-cursor",
      watermark: "2026-05-18T11:00:00.000Z",
      metadata: { registryVersion: 2 },
    });
    const cursorsTool = tools.find((tool) => tool.name === "search.cursors.list");
    const cursors = cursorsTool?.handler({ source: "commands", shard: "hot" }) as {
      state: string;
      cursors: Array<{ source: string; shard: string; cursor: string; watermark: string; checksum: string; metadata: Record<string, unknown> }>;
    };
    assert.equal(cursors.state, "ready");
    assert.equal(cursors.cursors[0]?.source, "commands");
    assert.equal(cursors.cursors[0]?.shard, "hot");
    assert.equal(cursors.cursors[0]?.cursor, "commands-mcp-cursor");
    assert.equal(cursors.cursors[0]?.watermark, "2026-05-18T11:00:00.000Z");
    assert.equal(cursors.cursors[0]?.checksum.length, 64);
    assert.deepEqual(cursors.cursors[0]?.metadata, { registryVersion: 2 });
    const emptyCursors = cursorsTool?.handler({ source: "commands", shard: "cold" }) as { state: string; cursors: unknown[] };
    assert.equal(emptyCursors.state, "empty");
    assert.deepEqual(emptyCursors.cursors, []);

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
    const savedCreateTool = tools.find((tool) => tool.name === "search.saved.create");
    assert.ok(savedCreateTool);
    const savedSemantic = savedCreateTool.handler({
      id: "saved-semantic",
      name: "Semantic command",
      query: "search help",
      domains: ["commands"],
      sources: ["commands"],
      shards: ["hot"],
      strategy: "hybrid",
      localEmbedding: true,
      limit: 2,
      agentBudget: { maxResults: 2, maxResultsPerSource: 1, maxResultsPerDomain: 1 },
      filters: { type: "command" },
      explain: true,
      actor: "agent:test",
      surface: "mcp",
    }) as {
      id: string;
      name: string;
      query: {
        query: string;
        domains?: string[];
        sources?: string[];
        shards?: string[];
        strategy?: string;
        embedding?: { model: string; vector: number[] };
        filters?: Record<string, unknown>;
        limit?: number;
        agentBudget?: { maxResults?: number; maxResultsPerSource?: number; maxResultsPerDomain?: number };
        explain?: boolean;
        actor?: string;
        surface?: string;
      };
    };
    assert.equal(savedSemantic.id, "saved-semantic");
    assert.equal(savedSemantic.name, "Semantic command");
    assert.deepEqual(savedSemantic.query.domains, ["commands"]);
    assert.deepEqual(savedSemantic.query.sources, ["commands"]);
    assert.deepEqual(savedSemantic.query.shards, ["hot"]);
    assert.equal(savedSemantic.query.strategy, "hybrid");
    assert.equal(savedSemantic.query.embedding?.model, LOCAL_TEXT_EMBEDDING_MODEL);
    assert.equal(savedSemantic.query.embedding?.vector.length, LOCAL_TEXT_EMBEDDING_DIMENSIONS);
    assert.deepEqual(savedSemantic.query.filters, { type: "command" });
    assert.equal(savedSemantic.query.limit, 2);
    assert.deepEqual(savedSemantic.query.agentBudget, { maxResults: 2, maxResultsPerSource: 1, maxResultsPerDomain: 1 });
    assert.equal(savedSemantic.query.explain, true);
    assert.equal(savedSemantic.query.actor, "agent:test");
    assert.equal(savedSemantic.query.surface, "mcp");

    const monitorsCreateTool = tools.find((tool) => tool.name === "search.monitors.create");
    assert.ok(monitorsCreateTool);
    const createdMonitor = monitorsCreateTool.handler({
      id: "monitor-semantic",
      savedSearchId: "saved-semantic",
      name: "Semantic monitor",
      cadence: "daily",
      enabled: false,
    }) as { id: string; savedSearchId: string; name?: string; cadence?: string; enabled: boolean };
    assert.equal(createdMonitor.id, "monitor-semantic");
    assert.equal(createdMonitor.savedSearchId, "saved-semantic");
    assert.equal(createdMonitor.name, "Semantic monitor");
    assert.equal(createdMonitor.cadence, "daily");
    assert.equal(createdMonitor.enabled, false);

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

    const monitorsDeleteTool = tools.find((tool) => tool.name === "search.monitors.delete");
    assert.ok(monitorsDeleteTool);
    const deletedMonitor = monitorsDeleteTool.handler({ id: "monitor-semantic" }) as { id: string; deleted: boolean; items: Array<{ id: string }> };
    assert.equal(deletedMonitor.id, "monitor-semantic");
    assert.equal(deletedMonitor.deleted, true);
    assert.equal(deletedMonitor.items.some((item) => item.id === "monitor-semantic"), false);

    const savedDeleteTool = tools.find((tool) => tool.name === "search.saved.delete");
    assert.ok(savedDeleteTool);
    const deletedSaved = savedDeleteTool.handler({ id: "saved-search" }) as { id: string; deleted: boolean; items: Array<{ id: string }> };
    assert.equal(deletedSaved.id, "saved-search");
    assert.equal(deletedSaved.deleted, true);
    assert.equal(deletedSaved.items.some((item) => item.id === "saved-search"), false);
    const remainingMonitors = (tools.find((tool) => tool.name === "search.monitors.list")?.handler({}) ?? []) as Array<{ id: string }>;
    assert.equal(remainingMonitors.some((item) => item.id === "monitor-search"), false);

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

    const tools = createSearchMcpTools(store);
    const embeddingsTool = tools.find((tool) => tool.name === "search.embeddings.create");
    assert.ok(embeddingsTool);
    const embedding = embeddingsTool.handler({ text: "quiet architecture interface" }) as { model: string; vector: number[] };
    assert.equal(embedding.model, LOCAL_TEXT_EMBEDDING_MODEL);
    assert.equal(embedding.vector.length, LOCAL_TEXT_EMBEDDING_DIMENSIONS);
    assert.deepEqual(embedding.vector, createLocalTextEmbedding("quiet architecture interface").vector);
    assert.throws(
      () => embeddingsTool.handler({ text: "quiet architecture interface", model: "provider-text-v1" }),
      /provider-backed embedding workers are EXTERNAL PENDING/,
    );

    const embeddingsIndexTool = tools.find((tool) => tool.name === "search.embeddings.index");
    assert.ok(embeddingsIndexTool);
    const indexed = embeddingsIndexTool.handler({ sources: ["documents.blocks"] }) as { model: string; documents: number; indexed: number; selectedSources: string[] };
    assert.equal(indexed.model, LOCAL_TEXT_EMBEDDING_MODEL);
    assert.equal(indexed.documents, 2);
    assert.equal(indexed.indexed, 2);
    assert.deepEqual(indexed.selectedSources, ["documents.blocks"]);
    assert.throws(
      () => embeddingsIndexTool.handler({ sources: ["documents.blocks"], model: "provider-text-v1" }),
      /provider-backed embedding workers are EXTERNAL PENDING/,
    );

    const embeddingsStatusTool = tools.find((tool) => tool.name === "search.embeddings.status");
    assert.ok(embeddingsStatusTool);
    const status = embeddingsStatusTool.handler({ sources: ["documents.blocks"], model: LOCAL_TEXT_EMBEDDING_MODEL }) as Array<{ source: string; model: string; documents: number; vectors: number }>;
    assert.equal(status.some((item) => item.source === "documents.blocks" && item.model === LOCAL_TEXT_EMBEDDING_MODEL && item.documents === 2 && item.vectors === 2), true);

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
    assert.throws(
      () => queryTool.handler({
        query: "provider semantic query",
        domains: ["documents"],
        strategy: "semantic",
        embeddingModel: "provider-text-v1",
      }),
      /provider-backed embedding workers are EXTERNAL PENDING/,
    );
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Search MCP query applies agent result budgets", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-mcp-agent-budget-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "work.tasks",
      domain: "work",
      name: "Tasks",
      resultTypes: ["task"],
    }));
    store.upsertDocument({
      id: "work.tasks:one",
      source: "work.tasks",
      domain: "work",
      type: "task",
      title: "Budget result one",
      body: "Budget result item for MCP agent limits.",
      updatedAt: "2026-05-17T12:00:00.000Z",
    });
    store.upsertDocument({
      id: "work.tasks:two",
      source: "work.tasks",
      domain: "work",
      type: "task",
      title: "Budget result two",
      body: "Budget result item for MCP agent limits.",
      updatedAt: "2026-05-17T12:01:00.000Z",
    });

    const tools = createSearchMcpTools(store);
    const queryTool = tools.find((tool) => tool.name === "search.query");
    assert.ok(queryTool);
    const output = queryTool.handler({
      query: "budget result",
      limit: 10,
      agentBudget: { maxResults: 1 },
    }) as { results: Array<{ id: string }> };
    assert.equal(output.results.length, 1);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Search MCP source state can mark signed-host sources external pending", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-mcp-external-pending-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    store.registerSource(createFullSearchSourceManifest({
      id: "native.system",
      domain: "system",
      name: "Native System",
      resultTypes: ["system-item"],
      capabilities: { actions: true, semantic: "optional" },
    }));
    store.upsertDocument({
      id: "native.system:settings",
      source: "native.system",
      domain: "system",
      type: "system-item",
      title: "Native settings",
      body: "native settings panel",
      actions: [{ id: "open", kind: "open", label: "Open settings", risk: "system", grant: "native.system.open" }],
    });
    store.upsertVector({
      documentId: "native.system:settings",
      model: LOCAL_TEXT_EMBEDDING_MODEL,
      embedding: createLocalTextEmbedding("native settings panel").vector,
    });

    const tools = createSearchMcpTools(store);
    const setStateTool = tools.find((tool) => tool.name === "search.sources.set_state");
    assert.ok(setStateTool);
    const pending = setStateTool.handler({
      source: "native.system",
      state: "external_pending",
      error: "requires signed host adapter",
    }) as { source: string; state: string; error?: string };
    assert.equal(pending.source, "native.system");
    assert.equal(pending.state, "external_pending");
    assert.equal(pending.error, "requires signed host adapter");

    const queryTool = tools.find((tool) => tool.name === "search.query");
    assert.ok(queryTool);
    const output = queryTool.handler({
      query: "settings",
      profile: "full",
      sources: ["native.system"],
      localEmbedding: true,
    }) as { partial: boolean; results: unknown[]; omittedSources: Array<{ source: string; reason: string; message?: string }> };
    assert.equal(output.partial, true);
    assert.deepEqual(output.results, []);
    assert.equal(output.omittedSources[0]?.source, "native.system");
    assert.equal(output.omittedSources[0]?.reason, "disabled");
    assert.match(output.omittedSources[0]?.message ?? "", /external_pending/);

    const actionsTool = tools.find((tool) => tool.name === "search.actions.list");
    assert.ok(actionsTool);
    assert.deepEqual(actionsTool.handler({ resultId: "native.system:settings" }), []);

    const embeddingsIndexTool = tools.find((tool) => tool.name === "search.embeddings.index");
    assert.ok(embeddingsIndexTool);
    const indexed = embeddingsIndexTool.handler({ sources: ["native.system"] }) as { indexed: number };
    assert.equal(indexed.indexed, 0);

    const embeddingsStatusTool = tools.find((tool) => tool.name === "search.embeddings.status");
    assert.ok(embeddingsStatusTool);
    assert.deepEqual(embeddingsStatusTool.handler({ sources: ["native.system"] }), []);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Search MCP schedules compacted event-driven indexing jobs", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-mcp-jobs-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "documents.blocks",
      domain: "documents",
      name: "Documents",
      resultTypes: ["document"],
    }));
    const tools = createSearchMcpTools(store);
    const scheduleTool = tools.find((tool) => tool.name === "search.jobs.schedule");
    assert.ok(scheduleTool);
    const first = scheduleTool.handler({
      source: "documents.blocks",
      operation: "upsert",
      resourceId: "doc-alpha",
      observedAt: "2026-05-17T10:00:00.000Z",
      payload: { revision: 1 },
    }) as { id: string; source: string; shard: string; operation: string; resourceId?: string; priority: number; payload?: Record<string, unknown> };
    const second = scheduleTool.handler({
      source: "documents.blocks",
      operation: "upsert",
      resourceId: "doc-alpha",
      observedAt: "2026-05-17T10:00:01.000Z",
      payload: { revision: 2 },
    }) as { id: string; payload?: Record<string, unknown> };
    const deletion = scheduleTool.handler({
      source: "documents.blocks",
      operation: "delete",
      resourceId: "doc-alpha",
      observedAt: "2026-05-17T10:00:02.000Z",
    }) as { id: string; operation: string; priority: number };

    assert.equal(first.id, second.id);
    assert.equal(first.source, "documents.blocks");
    assert.equal(first.shard, "hot");
    assert.equal(first.operation, "upsert");
    assert.equal(first.resourceId, "doc-alpha");
    assert.equal(first.priority, 60);
    assert.equal(second.payload?.revision, 2);
    assert.equal(second.payload?.eventDriven, true);
    assert.equal(deletion.id, "event:documents.blocks:hot:delete:doc-alpha");
    assert.equal(deletion.operation, "delete");
    assert.equal(deletion.priority, 80);
    assert.throws(() => scheduleTool.handler({ source: "documents.blocks", operation: "rebuild", resourceId: "doc-alpha" }), /operation must be upsert or delete/);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Search MCP query records sensitive audit events", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-mcp-audit-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "documents.blocks",
      domain: "documents",
      name: "Documents",
      resultTypes: ["document"],
    }));
    store.upsertDocument({
      id: "documents.blocks:secret",
      source: "documents.blocks",
      domain: "documents",
      type: "document",
      title: "Private token rotation",
      body: "secret token rotation notes",
      permissions: { redacted: true, canPreview: false },
    });

    const tools = createSearchMcpTools(store);
    const queryTool = tools.find((tool) => tool.name === "search.query");
    assert.ok(queryTool);
    const output = queryTool.handler({
      query: "secret token",
      domains: ["documents"],
      actor: "agent:test",
      surface: "mcp",
    }) as { results: Array<{ id: string; snippet?: string; permissions?: { redacted?: boolean } }> };
    assert.equal(output.results[0]?.id, "documents.blocks:secret");
    assert.equal(output.results[0]?.permissions?.redacted, true);

    const auditTool = tools.find((tool) => tool.name === "search.audit.list");
    assert.ok(auditTool);
    const audit = auditTool.handler({ type: "sensitive_query" }) as Array<{
      type: string;
      actor?: string;
      surface?: string;
      query?: string;
      reason?: string;
      metadata?: { resultCount?: number; redactedResultCount?: number; domains?: string[] };
    }>;
    assert.equal(audit[0]?.type, "sensitive_query");
    assert.equal(audit[0]?.actor, "agent:test");
    assert.equal(audit[0]?.surface, "mcp");
    assert.equal(audit[0]?.query, "secret token");
    assert.equal(audit[0]?.reason, "sensitive_query_or_redacted_result");
    assert.equal(audit[0]?.metadata?.resultCount, 1);
    assert.equal(audit[0]?.metadata?.redactedResultCount, 1);
    assert.deepEqual(audit[0]?.metadata?.domains, ["documents"]);
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
