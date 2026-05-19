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
      "search.changes.schedule",
      "search.changes.scan",
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
    assert.throws(
      () => savedCreateTool.handler({
        id: "saved-provider-semantic",
        query: "provider semantic query",
        strategy: "semantic",
        embeddingModel: "provider-text-v1",
      }),
      /provider-backed embedding workers are EXTERNAL PENDING/,
    );

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
    assert.throws(
      () => embeddingsStatusTool.handler({ sources: ["documents.blocks"], model: "provider-text-v1" }),
      /provider-backed embedding workers are EXTERNAL PENDING/,
    );

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

test("Search MCP schedules typed changed source events", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-mcp-changes-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "code.symbols",
      domain: "code",
      name: "Code",
      resultTypes: ["code"],
    }));
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "sessions.chats",
      domain: "sessions",
      name: "Sessions",
      resultTypes: ["conversation"],
    }));
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "docs.pages",
      domain: "docs",
      name: "Docs",
      resultTypes: ["doc"],
    }));
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "sheets.workbooks",
      domain: "sheets",
      name: "Sheets",
      resultTypes: ["workbook"],
    }));
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "local.files",
      domain: "files",
      name: "Files",
      resultTypes: ["file"],
    }));
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "web.ingested",
      domain: "web",
      name: "Web",
      resultTypes: ["web"],
    }));
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "external.cache",
      domain: "external",
      name: "External",
      resultTypes: ["external"],
    }));
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "surfaces.routes",
      domain: "surfaces",
      name: "Routes",
      resultTypes: ["route"],
    }));
    for (const sourceId of ["database.records", "work.items", "documents.blocks", "knowledge.graph", "signals.observations", "finance.records", "eln.records", "providers.routing", "agents.catalog", "mcp.servers", "runtime.events"]) {
      store.registerSource(createFrameworkSearchSourceManifest({
        id: sourceId,
        domain: "framework",
        name: sourceId,
        resultTypes: ["item"],
      }));
    }
    for (const sourceId of [
      "images.derived",
      "media.assets",
      "generations.artifacts",
      "slides.decks",
      "skills.registry",
      "snippets.library",
      "marketplace.choices",
      "content.items",
      "business.records",
      "social.posts",
      "iot.config",
      "notes.pages",
      "calendar.events",
      "connectors.catalog",
      "apps.catalog",
      "design.resources",
    ]) {
      store.registerSource(createFrameworkSearchSourceManifest({
        id: sourceId,
        domain: "framework",
        name: sourceId,
        resultTypes: ["item"],
      }));
    }
    const root = path.join(dir, "project");
    const filePath = path.join(root, "src", "app.ts");
    const outsidePath = path.join(dir, "outside.ts");
    const docsPath = path.join(root, "docs", "guide.md");
    const localFilePath = path.join(root, "files", "note.txt");
    const webPath = path.join(root, "web", "page.json");
    const externalPath = path.join(root, "external", "provider.json");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.mkdirSync(path.dirname(docsPath), { recursive: true });
    fs.mkdirSync(path.dirname(localFilePath), { recursive: true });
    fs.mkdirSync(path.dirname(webPath), { recursive: true });
    fs.mkdirSync(path.dirname(externalPath), { recursive: true });
    fs.writeFileSync(filePath, "export function changedMcpNeedle() { return true; }\n");
    fs.writeFileSync(docsPath, "# Guide\n\nchanged docs page\n");
    fs.writeFileSync(localFilePath, "changed local file\n");
    fs.writeFileSync(webPath, "{\"title\":\"changed web page\"}\n");
    fs.writeFileSync(externalPath, "{\"provider\":\"cache\"}\n");
    const tools = createSearchMcpTools(store);
    const changedTool = tools.find((tool) => tool.name === "search.changes.schedule");
    assert.ok(changedTool);
    const job = changedTool.handler({
      source: "code.symbols",
      operation: "upsert",
      root,
      path: filePath,
      observedAt: "2026-05-18T10:00:00.000Z",
    }) as { source: string; shard: string; operation: string; resourceId?: string; payload?: Record<string, unknown>; priority: number };
    assert.equal(job.source, "code.symbols");
    assert.equal(job.shard, "hot");
    assert.equal(job.operation, "upsert");
    assert.equal(job.resourceId, "src/app.ts");
    assert.equal(job.priority, 60);
    assert.equal(job.payload?.eventDriven, true);
    assert.equal(job.payload?.root, root);
    assert.equal(job.payload?.relativePath, "src/app.ts");
    assert.equal(job.payload?.absolutePath, filePath);
    const sessionJob = changedTool.handler({
      source: "sessions.chats",
      operation: "delete",
      sessionId: "session-alpha",
      observedAt: "2026-05-18T10:05:00.000Z",
    }) as { source: string; shard: string; operation: string; resourceId?: string; payload?: Record<string, unknown>; priority: number };
    assert.equal(sessionJob.source, "sessions.chats");
    assert.equal(sessionJob.shard, "hot");
    assert.equal(sessionJob.operation, "delete");
    assert.equal(sessionJob.resourceId, "session-alpha");
    assert.equal(sessionJob.priority, 80);
    assert.equal(sessionJob.payload?.eventDriven, true);
    assert.equal(sessionJob.payload?.sessionId, "session-alpha");
    const docsJob = changedTool.handler({
      source: "docs.pages",
      operation: "upsert",
      workspaceRoot: root,
      path: docsPath,
      observedAt: "2026-05-18T10:10:00.000Z",
    }) as { source: string; shard: string; operation: string; resourceId?: string; payload?: Record<string, unknown>; priority: number };
    assert.equal(docsJob.source, "docs.pages");
    assert.equal(docsJob.shard, "hot");
    assert.equal(docsJob.operation, "upsert");
    assert.equal(docsJob.resourceId, "docs/guide.md");
    assert.equal(docsJob.priority, 60);
    assert.equal(docsJob.payload?.eventDriven, true);
    assert.equal(docsJob.payload?.workspaceRoot, root);
    assert.equal(docsJob.payload?.relativePath, "docs/guide.md");
    assert.equal(docsJob.payload?.absolutePath, docsPath);
    const workbookJob = changedTool.handler({
      source: "sheets.workbooks",
      operation: "delete",
      workbookId: "workbook-alpha",
      workspaceRoot: root,
      observedAt: "2026-05-18T10:12:00.000Z",
    }) as { source: string; shard: string; operation: string; resourceId?: string; payload?: Record<string, unknown>; priority: number };
    assert.equal(workbookJob.source, "sheets.workbooks");
    assert.equal(workbookJob.shard, "hot");
    assert.equal(workbookJob.operation, "delete");
    assert.equal(workbookJob.resourceId, "workbook-alpha");
    assert.equal(workbookJob.priority, 80);
    assert.equal(workbookJob.payload?.eventDriven, true);
    assert.equal(workbookJob.payload?.workbookId, "workbook-alpha");
    assert.equal(workbookJob.payload?.workspaceRoot, root);
    const localJob = changedTool.handler({
      source: "local.files",
      operation: "upsert",
      root,
      path: localFilePath,
      observedAt: "2026-05-18T10:15:00.000Z",
    }) as { source: string; shard: string; operation: string; resourceId?: string; payload?: Record<string, unknown>; priority: number };
    assert.equal(localJob.source, "local.files");
    assert.equal(localJob.shard, "hot");
    assert.equal(localJob.operation, "upsert");
    assert.equal(localJob.resourceId, "files/note.txt");
    assert.equal(localJob.priority, 60);
    assert.equal(localJob.payload?.eventDriven, true);
    assert.equal(localJob.payload?.root, root);
    assert.equal(localJob.payload?.relativePath, "files/note.txt");
    assert.equal(localJob.payload?.absolutePath, localFilePath);
    const webJob = changedTool.handler({
      source: "web.ingested",
      operation: "upsert",
      root,
      path: webPath,
      observedAt: "2026-05-18T10:20:00.000Z",
    }) as { source: string; shard: string; operation: string; resourceId?: string; payload?: Record<string, unknown>; priority: number };
    assert.equal(webJob.source, "web.ingested");
    assert.equal(webJob.shard, "hot");
    assert.equal(webJob.operation, "upsert");
    assert.equal(webJob.resourceId, "web/page.json");
    assert.equal(webJob.priority, 60);
    assert.equal(webJob.payload?.eventDriven, true);
    assert.equal(webJob.payload?.root, root);
    assert.equal(webJob.payload?.relativePath, "web/page.json");
    assert.equal(webJob.payload?.absolutePath, webPath);
    const externalJob = changedTool.handler({
      source: "external.cache",
      operation: "delete",
      root,
      path: externalPath,
      observedAt: "2026-05-18T10:25:00.000Z",
    }) as { source: string; shard: string; operation: string; resourceId?: string; payload?: Record<string, unknown>; priority: number };
    assert.equal(externalJob.source, "external.cache");
    assert.equal(externalJob.shard, "hot");
    assert.equal(externalJob.operation, "delete");
    assert.equal(externalJob.resourceId, "external/provider.json");
    assert.equal(externalJob.priority, 80);
    assert.equal(externalJob.payload?.eventDriven, true);
    assert.equal(externalJob.payload?.root, root);
    assert.equal(externalJob.payload?.relativePath, "external/provider.json");
    assert.equal(externalJob.payload?.absolutePath, externalPath);
    const routeJob = changedTool.handler({
      source: "surfaces.routes",
      operation: "upsert",
      routeId: "sync.searchIndex",
      observedAt: "2026-05-18T10:30:00.000Z",
    }) as { source: string; shard: string; operation: string; resourceId?: string; payload?: Record<string, unknown>; priority: number };
    assert.equal(routeJob.source, "surfaces.routes");
    assert.equal(routeJob.shard, "hot");
    assert.equal(routeJob.operation, "upsert");
    assert.equal(routeJob.resourceId, "sync.searchIndex");
    assert.equal(routeJob.priority, 60);
    assert.equal(routeJob.payload?.eventDriven, true);
    assert.equal(routeJob.payload?.routeId, "sync.searchIndex");
    const databaseJob = changedTool.handler({
      source: "database.records",
      operation: "upsert",
      namespace: "main",
      collection: "contacts",
      recordId: "ada",
      observedAt: "2026-05-18T10:31:00.000Z",
    }) as { source: string; shard: string; operation: string; resourceId?: string; payload?: Record<string, unknown>; priority: number };
    assert.equal(databaseJob.source, "database.records");
    assert.equal(databaseJob.shard, "hot");
    assert.equal(databaseJob.operation, "upsert");
    assert.equal(databaseJob.resourceId, "main:contacts:ada");
    assert.equal(databaseJob.priority, 60);
    assert.equal(databaseJob.payload?.eventDriven, true);
    assert.equal(databaseJob.payload?.namespaceId, "main");
    assert.equal(databaseJob.payload?.collection, "contacts");
    assert.equal(databaseJob.payload?.recordId, "ada");
    const workJob = changedTool.handler({
      source: "work.items",
      operation: "delete",
      namespaceId: "main",
      collectionName: "tasks",
      recordId: "task-alpha",
      observedAt: "2026-05-18T10:32:00.000Z",
    }) as { source: string; shard: string; operation: string; resourceId?: string; payload?: Record<string, unknown>; priority: number };
    assert.equal(workJob.source, "work.items");
    assert.equal(workJob.shard, "hot");
    assert.equal(workJob.operation, "delete");
    assert.equal(workJob.resourceId, "main:tasks:task-alpha");
    assert.equal(workJob.priority, 80);
    assert.equal(workJob.payload?.eventDriven, true);
    assert.equal(workJob.payload?.namespaceId, "main");
    assert.equal(workJob.payload?.collection, "tasks");
    assert.equal(workJob.payload?.recordId, "task-alpha");
    const documentJob = changedTool.handler({
      source: "documents.blocks",
      operation: "upsert",
      namespace: "main",
      documentId: "doc-alpha",
      collection: "document_blocks",
      recordId: "block-alpha",
      observedAt: "2026-05-18T10:33:00.000Z",
    }) as { source: string; shard: string; operation: string; resourceId?: string; payload?: Record<string, unknown>; priority: number };
    assert.equal(documentJob.source, "documents.blocks");
    assert.equal(documentJob.shard, "hot");
    assert.equal(documentJob.operation, "upsert");
    assert.equal(documentJob.resourceId, "main:documents:doc-alpha");
    assert.equal(documentJob.priority, 60);
    assert.equal(documentJob.payload?.eventDriven, true);
    assert.equal(documentJob.payload?.namespaceId, "main");
    assert.equal(documentJob.payload?.collection, "document_blocks");
    assert.equal(documentJob.payload?.recordId, "block-alpha");
    assert.equal(documentJob.payload?.documentId, "doc-alpha");
    const knowledgeJob = changedTool.handler({
      source: "knowledge.graph",
      operation: "upsert",
      kind: "fact",
      factId: "fact-alpha",
      observedAt: "2026-05-18T10:34:00.000Z",
    }) as { source: string; shard: string; operation: string; resourceId?: string; payload?: Record<string, unknown>; priority: number };
    assert.equal(knowledgeJob.source, "knowledge.graph");
    assert.equal(knowledgeJob.shard, "hot");
    assert.equal(knowledgeJob.operation, "upsert");
    assert.equal(knowledgeJob.resourceId, "fact:fact-alpha");
    assert.equal(knowledgeJob.priority, 60);
    assert.equal(knowledgeJob.payload?.eventDriven, true);
    assert.equal(knowledgeJob.payload?.kind, "fact");
    assert.equal(knowledgeJob.payload?.knowledgeResourceId, "fact:fact-alpha");
    assert.equal(knowledgeJob.payload?.factId, "fact-alpha");
    const signalsJob = changedTool.handler({
      source: "signals.observations",
      operation: "delete",
      kind: "observation",
      observationId: "observation-alpha",
      observedAt: "2026-05-18T10:34:30.000Z",
    }) as { source: string; shard: string; operation: string; resourceId?: string; payload?: Record<string, unknown>; priority: number };
    assert.equal(signalsJob.source, "signals.observations");
    assert.equal(signalsJob.shard, "hot");
    assert.equal(signalsJob.operation, "delete");
    assert.equal(signalsJob.resourceId, "observation:observation-alpha");
    assert.equal(signalsJob.priority, 80);
    assert.equal(signalsJob.payload?.eventDriven, true);
    assert.equal(signalsJob.payload?.kind, "observation");
    assert.equal(signalsJob.payload?.signalsResourceId, "observation:observation-alpha");
    assert.equal(signalsJob.payload?.observationId, "observation-alpha");
    const financeJob = changedTool.handler({
      source: "finance.records",
      operation: "upsert",
      namespace: "main",
      collection: "transactions",
      recordId: "txn-alpha",
      observedAt: "2026-05-18T10:34:40.000Z",
    }) as { source: string; shard: string; operation: string; resourceId?: string; payload?: Record<string, unknown>; priority: number };
    assert.equal(financeJob.source, "finance.records");
    assert.equal(financeJob.shard, "hot");
    assert.equal(financeJob.operation, "upsert");
    assert.equal(financeJob.resourceId, "main:transactions:txn-alpha");
    assert.equal(financeJob.priority, 60);
    assert.equal(financeJob.payload?.eventDriven, true);
    assert.equal(financeJob.payload?.namespaceId, "main");
    assert.equal(financeJob.payload?.collection, "transactions");
    assert.equal(financeJob.payload?.recordId, "txn-alpha");
    const financeTableJob = changedTool.handler({
      source: "finance.records",
      operation: "delete",
      table: "finance_records",
      recordId: "finance-local-alpha",
      observedAt: "2026-05-18T10:34:45.000Z",
    }) as { source: string; shard: string; operation: string; resourceId?: string; payload?: Record<string, unknown>; priority: number };
    assert.equal(financeTableJob.source, "finance.records");
    assert.equal(financeTableJob.shard, "hot");
    assert.equal(financeTableJob.operation, "delete");
    assert.equal(financeTableJob.resourceId, "finance_records:finance-local-alpha");
    assert.equal(financeTableJob.priority, 80);
    assert.equal(financeTableJob.payload?.eventDriven, true);
    assert.equal(financeTableJob.payload?.table, "finance_records");
    assert.equal(financeTableJob.payload?.recordId, "finance-local-alpha");
    const elnJob = changedTool.handler({
      source: "eln.records",
      operation: "upsert",
      namespaceId: "main",
      collectionName: "lab_notebooks",
      recordId: "notebook-alpha",
      observedAt: "2026-05-18T10:34:50.000Z",
    }) as { source: string; shard: string; operation: string; resourceId?: string; payload?: Record<string, unknown>; priority: number };
    assert.equal(elnJob.source, "eln.records");
    assert.equal(elnJob.shard, "hot");
    assert.equal(elnJob.operation, "upsert");
    assert.equal(elnJob.resourceId, "main:lab_notebooks:notebook-alpha");
    assert.equal(elnJob.priority, 60);
    assert.equal(elnJob.payload?.eventDriven, true);
    assert.equal(elnJob.payload?.namespaceId, "main");
    assert.equal(elnJob.payload?.collection, "lab_notebooks");
    assert.equal(elnJob.payload?.recordId, "notebook-alpha");
    const providerRouteJob = changedTool.handler({
      source: "providers.routing",
      operation: "upsert",
      kind: "routing",
      provider: "provider-alpha",
      feature: "chat",
      capability: "llm",
      observedAt: "2026-05-18T10:34:55.000Z",
    }) as { source: string; shard: string; operation: string; resourceId?: string; payload?: Record<string, unknown>; priority: number };
    assert.equal(providerRouteJob.source, "providers.routing");
    assert.equal(providerRouteJob.shard, "hot");
    assert.equal(providerRouteJob.operation, "upsert");
    assert.equal(providerRouteJob.resourceId, "routing:chat:llm");
    assert.equal(providerRouteJob.priority, 60);
    assert.equal(providerRouteJob.payload?.eventDriven, true);
    assert.equal(providerRouteJob.payload?.kind, "routing");
    assert.equal(providerRouteJob.payload?.provider, "provider-alpha");
    assert.equal(providerRouteJob.payload?.feature, "chat");
    assert.equal(providerRouteJob.payload?.capability, "llm");
    const providerSettingJob = changedTool.handler({
      source: "providers.routing",
      operation: "delete",
      kind: "setting",
      providerId: "provider-alpha",
      observedAt: "2026-05-18T10:34:56.000Z",
    }) as { source: string; shard: string; operation: string; resourceId?: string; payload?: Record<string, unknown>; priority: number };
    assert.equal(providerSettingJob.source, "providers.routing");
    assert.equal(providerSettingJob.shard, "hot");
    assert.equal(providerSettingJob.operation, "delete");
    assert.equal(providerSettingJob.resourceId, "setting:provider-alpha");
    assert.equal(providerSettingJob.priority, 80);
    assert.equal(providerSettingJob.payload?.eventDriven, true);
    assert.equal(providerSettingJob.payload?.kind, "setting");
    assert.equal(providerSettingJob.payload?.provider, "provider-alpha");
    const agentJob = changedTool.handler({
      source: "agents.catalog",
      operation: "upsert",
      kind: "agent",
      agentId: "agent-alpha",
      observedAt: "2026-05-18T10:34:57.000Z",
    }) as { source: string; shard: string; operation: string; resourceId?: string; payload?: Record<string, unknown>; priority: number };
    assert.equal(agentJob.source, "agents.catalog");
    assert.equal(agentJob.shard, "hot");
    assert.equal(agentJob.operation, "upsert");
    assert.equal(agentJob.resourceId, "agent:agent-alpha");
    assert.equal(agentJob.priority, 60);
    assert.equal(agentJob.payload?.eventDriven, true);
    assert.equal(agentJob.payload?.kind, "agent");
    assert.equal(agentJob.payload?.id, "agent-alpha");
    const skillCollectionJob = changedTool.handler({
      source: "agents.catalog",
      operation: "upsert",
      kind: "skill-collection",
      id: "collection-alpha",
      observedAt: "2026-05-18T10:34:58.000Z",
    }) as { source: string; shard: string; operation: string; resourceId?: string; payload?: Record<string, unknown>; priority: number };
    assert.equal(skillCollectionJob.source, "agents.catalog");
    assert.equal(skillCollectionJob.shard, "hot");
    assert.equal(skillCollectionJob.operation, "upsert");
    assert.equal(skillCollectionJob.resourceId, "skill_collection:collection-alpha");
    assert.equal(skillCollectionJob.priority, 60);
    assert.equal(skillCollectionJob.payload?.eventDriven, true);
    assert.equal(skillCollectionJob.payload?.kind, "skill_collection");
    assert.equal(skillCollectionJob.payload?.id, "collection-alpha");
    const mcpServerJob = changedTool.handler({
      source: "mcp.servers",
      operation: "upsert",
      serverId: "docs-server",
      configPath: path.join(root, "mcp.json"),
      observedAt: "2026-05-18T10:34:59.000Z",
    }) as { source: string; shard: string; operation: string; resourceId?: string; payload?: Record<string, unknown>; priority: number };
    assert.equal(mcpServerJob.source, "mcp.servers");
    assert.equal(mcpServerJob.shard, "hot");
    assert.equal(mcpServerJob.operation, "upsert");
    assert.equal(mcpServerJob.resourceId, "docs-server");
    assert.equal(mcpServerJob.priority, 60);
    assert.equal(mcpServerJob.payload?.eventDriven, true);
    assert.equal(mcpServerJob.payload?.serverId, "docs-server");
    assert.equal(mcpServerJob.payload?.configPath, path.join(root, "mcp.json"));
    const runtimeJob = changedTool.handler({
      source: "runtime.events",
      operation: "upsert",
      kind: "job",
      jobId: "runtime-job-alpha",
      observedAt: "2026-05-18T10:35:00.000Z",
    }) as { source: string; shard: string; operation: string; resourceId?: string; payload?: Record<string, unknown>; priority: number };
    assert.equal(runtimeJob.source, "runtime.events");
    assert.equal(runtimeJob.shard, "hot");
    assert.equal(runtimeJob.operation, "upsert");
    assert.equal(runtimeJob.resourceId, "job:runtime-job-alpha");
    assert.equal(runtimeJob.priority, 60);
    assert.equal(runtimeJob.payload?.eventDriven, true);
    assert.equal(runtimeJob.payload?.runtimeKind, "job");
    assert.equal(runtimeJob.payload?.runtimeResourceId, "job:runtime-job-alpha");
    assert.equal(runtimeJob.payload?.id, "runtime-job-alpha");
    const runtimeOperationalJob = changedTool.handler({
      source: "runtime.events",
      operation: "delete",
      runtimeKind: "operational",
      domain: "monitor",
      operationalId: "operational-alpha",
      observedAt: "2026-05-18T10:35:01.000Z",
    }) as { source: string; shard: string; operation: string; resourceId?: string; payload?: Record<string, unknown>; priority: number };
    assert.equal(runtimeOperationalJob.source, "runtime.events");
    assert.equal(runtimeOperationalJob.shard, "hot");
    assert.equal(runtimeOperationalJob.operation, "delete");
    assert.equal(runtimeOperationalJob.resourceId, "operational:monitor:operational-alpha");
    assert.equal(runtimeOperationalJob.priority, 80);
    assert.equal(runtimeOperationalJob.payload?.eventDriven, true);
    assert.equal(runtimeOperationalJob.payload?.runtimeKind, "operational");
    assert.equal(runtimeOperationalJob.payload?.runtimeResourceId, "operational:monitor:operational-alpha");
    assert.equal(runtimeOperationalJob.payload?.id, "operational-alpha");
    assert.equal(runtimeOperationalJob.payload?.domain, "monitor");
    const simpleCases: Array<{
      source: string;
      params: Record<string, unknown>;
      resourceId: string;
      payload: Record<string, string>;
      workspace?: boolean;
    }> = [
      { source: "images.derived", params: { imageId: "image-alpha" }, resourceId: "image-alpha", payload: { imageId: "image-alpha" } },
      { source: "media.assets", params: { mediaId: "media-alpha" }, resourceId: "media-alpha", payload: { mediaId: "media-alpha" } },
      { source: "generations.artifacts", params: { generationId: "generation-alpha" }, resourceId: "generation-alpha", payload: { generationId: "generation-alpha" } },
      { source: "slides.decks", params: { deckId: "deck-alpha", workspaceRoot: root }, resourceId: "deck-alpha", payload: { deckId: "deck-alpha" }, workspace: true },
      { source: "skills.registry", params: { slug: "skill-alpha" }, resourceId: "skill-alpha", payload: { slug: "skill-alpha" } },
      { source: "snippets.library", params: { slug: "snippet-alpha" }, resourceId: "snippet-alpha", payload: { slug: "snippet-alpha" } },
      { source: "marketplace.choices", params: { choiceId: "choice-alpha" }, resourceId: "choice-alpha", payload: { choiceId: "choice-alpha" } },
      { source: "content.items", params: { itemId: "item-alpha" }, resourceId: "item-alpha", payload: { itemId: "item-alpha" } },
      { source: "business.records", params: { recordId: "business-alpha" }, resourceId: "business-alpha", payload: { recordId: "business-alpha" } },
      { source: "social.posts", params: { postId: "post-alpha" }, resourceId: "post-alpha", payload: { postId: "post-alpha" } },
      { source: "iot.config", params: { configId: "config-alpha" }, resourceId: "config-alpha", payload: { configId: "config-alpha" } },
      { source: "notes.pages", params: { pageId: "note-alpha" }, resourceId: "note-alpha", payload: { pageId: "note-alpha" } },
      { source: "calendar.events", params: { eventId: "event-alpha" }, resourceId: "event-alpha", payload: { eventId: "event-alpha" } },
      { source: "connectors.catalog", params: { operationId: "connector.operation" }, resourceId: "connector.operation", payload: { operationId: "connector.operation" } },
      { source: "apps.catalog", params: { appId: "app-alpha" }, resourceId: "app-alpha", payload: { appId: "app-alpha" } },
      { source: "design.resources", params: { resourceId: "design-alpha", workspaceRoot: root }, resourceId: "design-alpha", payload: { resourceId: "design-alpha" }, workspace: true },
    ];
    for (const simpleCase of simpleCases) {
      const simpleJob = changedTool.handler({
        source: simpleCase.source,
        operation: "upsert",
        observedAt: "2026-05-18T10:35:00.000Z",
        ...simpleCase.params,
      }) as { source: string; shard: string; operation: string; resourceId?: string; payload?: Record<string, unknown>; priority: number };
      assert.equal(simpleJob.source, simpleCase.source);
      assert.equal(simpleJob.shard, "hot");
      assert.equal(simpleJob.operation, "upsert");
      assert.equal(simpleJob.resourceId, simpleCase.resourceId);
      assert.equal(simpleJob.priority, 60);
      assert.equal(simpleJob.payload?.eventDriven, true);
      for (const [key, value] of Object.entries(simpleCase.payload)) {
        assert.equal(simpleJob.payload?.[key], value);
      }
      if (simpleCase.workspace) assert.equal(simpleJob.payload?.workspaceRoot, root);
    }
    assert.throws(() => changedTool.handler({
      source: "code.symbols",
      operation: "upsert",
      root,
      path: outsidePath,
    }), /outside root/);
    assert.throws(() => changedTool.handler({
      source: "docs.pages",
      operation: "upsert",
      workspaceRoot: root,
      path: path.join(root, "private.md"),
    }), /outside public docs scope/);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Search MCP scans changed source roots into event jobs", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-mcp-scan-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "code.symbols",
      domain: "code",
      name: "Code",
      resultTypes: ["code"],
    }));
    const root = path.join(dir, "project");
    const filePath = path.join(root, "src", "scan.ts");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "export function scanMcpNeedle() { return true; }\n");
    const tools = createSearchMcpTools(store);
    const scanTool = tools.find((tool) => tool.name === "search.changes.scan");
    assert.ok(scanTool);
    const first = scanTool.handler({ source: "code.symbols", root }) as {
      source: string;
      scanned: number;
      scheduledUpserts: number;
      scheduledDeletes: number;
      jobs: Array<{ source: string; operation: string; resourceId?: string; payload?: Record<string, unknown> }>;
      state: string;
    };
    assert.equal(first.source, "code.symbols");
    assert.equal(first.scanned, 1);
    assert.equal(first.scheduledUpserts, 1);
    assert.equal(first.scheduledDeletes, 0);
    assert.equal(first.jobs[0]?.resourceId, "src/scan.ts");
    assert.equal(first.jobs[0]?.payload?.relativePath, "src/scan.ts");
    const second = scanTool.handler({ source: "code.symbols", root }) as { scheduledUpserts: number; scheduledDeletes: number; state: string };
    assert.equal(second.scheduledUpserts, 0);
    assert.equal(second.scheduledDeletes, 0);
    assert.equal(second.state, "empty");
    fs.rmSync(filePath);
    const deleted = scanTool.handler({ source: "code.symbols", root }) as {
      scanned: number;
      scheduledUpserts: number;
      scheduledDeletes: number;
      jobs: Array<{ source: string; operation: string; resourceId?: string }>;
    };
    assert.equal(deleted.scanned, 0);
    assert.equal(deleted.scheduledUpserts, 0);
    assert.equal(deleted.scheduledDeletes, 1);
    assert.deepEqual({ source: deleted.jobs[0]?.source, operation: deleted.jobs[0]?.operation, resourceId: deleted.jobs[0]?.resourceId }, { source: "code.symbols", operation: "delete", resourceId: "src/scan.ts" });
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

test("Search MCP monitor evaluation records sensitive audit events", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-mcp-monitor-audit-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    const tools = createSearchMcpTools(store);
    const savedCreateTool = tools.find((tool) => tool.name === "search.saved.create");
    const monitorCreateTool = tools.find((tool) => tool.name === "search.monitors.create");
    const evaluateTool = tools.find((tool) => tool.name === "search.monitors.evaluate");
    const auditTool = tools.find((tool) => tool.name === "search.audit.list");
    assert.ok(savedCreateTool);
    assert.ok(monitorCreateTool);
    assert.ok(evaluateTool);
    assert.ok(auditTool);

    savedCreateTool.handler({
      id: "secret-monitor-query",
      query: "secret token",
      actor: "agent:test",
      surface: "mcp",
    });
    monitorCreateTool.handler({
      id: "secret-monitor",
      savedSearchId: "secret-monitor-query",
    });
    evaluateTool.handler({ id: "secret-monitor" });

    const audit = auditTool.handler({ type: "sensitive_query" }) as Array<{
      type: string;
      actor?: string;
      surface?: string;
      query?: string;
      metadata?: { monitorId?: string; savedSearchId?: string; resultCount?: number };
    }>;
    const event = audit.find((item) => item.query === "secret token");
    assert.equal(event?.type, "sensitive_query");
    assert.equal(event?.actor, "agent:test");
    assert.equal(event?.surface, "mcp");
    assert.equal(event?.metadata?.monitorId, "secret-monitor");
    assert.equal(event?.metadata?.savedSearchId, "secret-monitor-query");
    assert.equal(event?.metadata?.resultCount, 0);
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
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "finance.records",
      domain: "finance",
      name: "Finance",
      resultTypes: ["transaction"],
    }));
    store.upsertDocument({
      id: "finance.records:1",
      source: "finance.records",
      domain: "finance",
      type: "transaction",
      title: "transaction 1",
      body: "redacted finance record",
      metadata: {
        legalOutputLabels: ["not_professional_advice", "human_review_required", "regulated_domain:finance"],
      },
      actions: [{ id: "copy-reference", kind: "copy", label: "Copy finance reference", requiresApproval: false }],
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

    const regulatedBlocked = executeTool.handler({ resultId: "finance.records:1", actionId: "copy-reference", actor: "agent:test", surface: "mcp" }) as {
      plan: { status: string; requiresApproval: boolean; legalOutputLabels?: string[]; reasons: string[] };
      blocked: boolean;
    };
    assert.equal(regulatedBlocked.plan.status, "blocked");
    assert.equal(regulatedBlocked.plan.requiresApproval, true);
    assert.equal(regulatedBlocked.plan.reasons.includes("regulated_result_review_required"), true);
    assert.equal(regulatedBlocked.plan.legalOutputLabels?.includes("regulated_domain:finance"), true);
    assert.equal(regulatedBlocked.blocked, true);

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
    assert.equal(audit.some((item) => item.resultId === "finance.records:1" && item.status === "blocked" && item.reason?.includes("regulated_result_review_required") && Array.isArray(item.metadata?.legalOutputLabels)), true);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
