import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import {
  DEFAULT_SEARCH_BUDGETS,
  DEFAULT_SEARCH_ENGINE_ID,
  SEARCH_SQLITE_ENGINE,
  SearchStore,
  createFrameworkSearchSourceManifest,
  createFullSearchSourceManifest,
  createRootSearchFederator,
  createSearchRegistry,
  defineSearchEngine,
  scoreLexicalMatch,
} from "./index.ts";

test("Search exposes SQLite as the default rebuildable engine boundary", () => {
  assert.equal(DEFAULT_SEARCH_ENGINE_ID, "sqlite");
  assert.equal(SEARCH_SQLITE_ENGINE.id, "sqlite");
  assert.equal(SEARCH_SQLITE_ENGINE.storage.kind, "sidecar");
  assert.equal(SEARCH_SQLITE_ENGINE.storage.defaultFileName, "search.sqlite");
  assert.equal(SEARCH_SQLITE_ENGINE.storage.rebuildable, true);
  assert.equal(SEARCH_SQLITE_ENGINE.storage.ownsCanonicalData, false);
  assert.equal(SEARCH_SQLITE_ENGINE.storage.shardModel, "logical");
  assert.equal(SEARCH_SQLITE_ENGINE.capabilities.fts, true);
  assert.equal(SEARCH_SQLITE_ENGINE.capabilities.jobQueue, true);
  assert.equal(SEARCH_SQLITE_ENGINE.capabilities.vectors, true);
  assert.equal(SEARCH_SQLITE_ENGINE.capabilities.rankingCache, true);
  assert.deepEqual(SEARCH_SQLITE_ENGINE.query.strategies, ["lexical", "semantic", "hybrid"]);
});

test("SearchStore reports the default Search engine descriptor", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-engine-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    assert.equal(store.engine.id, "sqlite");
    assert.deepEqual(store.engineDescriptor(), SEARCH_SQLITE_ENGINE);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("custom Search engine descriptors must identify storage boundaries", () => {
  assert.throws(
    () => defineSearchEngine({
      id: "missing-file",
      label: "Missing file",
      version: 1,
      storage: {
        kind: "sidecar",
        rebuildable: true,
        ownsCanonicalData: false,
        shardModel: "logical",
      },
      capabilities: {
        fts: true,
        fragments: true,
        actions: true,
        sourceControls: true,
        cursors: true,
        tombstones: true,
        jobQueue: true,
        savedSearches: true,
        monitors: true,
        audit: true,
        vectors: false,
        rankingCache: true,
        transactions: true,
      },
      query: {
        strategies: ["lexical"],
        filters: true,
        acl: true,
        agentBudgets: true,
      },
    }),
    /sidecar storage requires a default file name/,
  );
});

test("framework sources are opt-in and require fast paths", () => {
  const manifest = createFrameworkSearchSourceManifest({
    id: "chats",
    domain: "sessions",
    name: "Chats",
    resultTypes: ["chat", "message"],
    facets: [{ id: "projectId", label: "Project", type: "string" }],
  });

  assert.equal(manifest.permissions.default, "opt_in");
  assert.equal(manifest.capabilities.fastPath, true);
  assert.equal(manifest.capabilities.facets, true);
  assert.equal(manifest.indexing.freshness, "near_immediate");
  assert.equal(manifest.indexing.limits?.maxFragments, 50);
});

test("full profile sources are opt-in and may defer their fast path to external adapters", () => {
  const manifest = createFullSearchSourceManifest({
    id: "local.files",
    domain: "files",
    name: "Local files",
    resultTypes: ["file"],
    facets: [{ id: "extension", label: "Extension", type: "string" }],
  });

  assert.equal(manifest.profile, "full");
  assert.equal(manifest.indexing.defaultState, "off");
  assert.equal(manifest.indexing.freshness, "manual");
  assert.equal(manifest.permissions.default, "opt_in");
  assert.equal(manifest.capabilities.fastPath, false);
  assert.equal(manifest.capabilities.semantic, "optional");
});

test("SearchStore does not mark default framework queries partial because full sources are disabled", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-full-sources-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "commands",
      domain: "commands",
      name: "Commands",
      resultTypes: ["command"],
    }));
    store.registerSource(createFullSearchSourceManifest({
      id: "local.files",
      domain: "files",
      name: "Local files",
      resultTypes: ["file"],
    }));
    store.upsertDocument({
      id: "commands:search",
      source: "commands",
      domain: "commands",
      type: "command",
      title: "search",
      body: "Framework Search command",
    });

    const frameworkQuery = store.query({ query: "search" });
    assert.equal(frameworkQuery.partial, false);
    assert.deepEqual(frameworkQuery.omittedSources, []);

    const explicitlyFullSource = store.query({ query: "search", sources: ["local.files"] });
    assert.equal(explicitlyFullSource.partial, true);
    assert.equal(explicitlyFullSource.omittedSources[0]?.source, "local.files");
    assert.equal(explicitlyFullSource.omittedSources[0]?.reason, "profile");
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("SearchStore bulk upserts documents in one cache-invalidating transaction", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-bulk-upsert-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "bulk.items",
      domain: "bulk",
      name: "Bulk items",
      resultTypes: ["item"],
    }));
    const inserted = store.upsertDocuments(Array.from({ length: 25 }, (_, index) => ({
      id: `bulk.items:${index}`,
      source: "bulk.items",
      domain: "bulk",
      type: "item",
      title: `Bulk item ${index}`,
      body: `bulk transaction needle${index % 5}`,
      fragments: [{
        id: `bulk.items:${index}:fragment`,
        title: "fragment",
        body: `fragment needle${index % 5}`,
      }],
    })));

    assert.equal(inserted, 25);
    const query = store.query({ query: "needle3", domains: ["bulk"], limit: 10 });
    assert.equal(query.partial, false);
    assert.equal(query.results.length, 5);
    assert.equal(store.sourceStatus().find((source) => source.source === "bulk.items")?.lastIndexedAt !== undefined, true);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("SearchStore keeps shard-scoped ranking cache through unrelated cold backfill", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-cache-scopes-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "scale.items",
      domain: "scale",
      name: "Scale items",
      resultTypes: ["item"],
    }));
    store.upsertDocument({
      id: "scale.items:hot",
      source: "scale.items",
      shard: "hot",
      domain: "scale",
      type: "item",
      title: "Hot result hotneedle42",
      body: "hotneedle42",
    });
    assert.equal(store.query({ query: "hotneedle42", domains: ["scale"], shards: ["hot"], limit: 5 }).results.length, 1);
    assert.equal(store.rankingCacheStats().entries, 1);

    store.upsertDocuments(Array.from({ length: 10 }, (_, index) => ({
      id: `scale.items:cold:${index}`,
      source: "scale.items",
      shard: "cold",
      domain: "scale",
      type: "item",
      title: `Cold result ${index}`,
      body: `coldneedle${index}`,
    })));
    assert.equal(store.rankingCacheStats().entries, 1);

    store.upsertDocument({
      id: "scale.items:hot",
      source: "scale.items",
      shard: "hot",
      domain: "scale",
      type: "item",
      title: "Updated hot result hotneedle42",
      body: "hotneedle42 updated",
    });
    assert.equal(store.rankingCacheStats().entries, 0);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("SearchStore parses inline domain, source, shard, type and scope filters", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-inline-filters-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "documents.blocks",
      domain: "documents",
      name: "Documents",
      resultTypes: ["document"],
    }));
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "work.tasks",
      domain: "work",
      name: "Work tasks",
      resultTypes: ["task"],
    }));
    store.upsertDocument({
      id: "documents.blocks:alpha",
      source: "documents.blocks",
      shard: "hot",
      domain: "documents",
      type: "document",
      title: "Launch notes",
      body: "Launch checklist for project alpha.",
      permissions: { requiredScopes: ["project-alpha"] },
    });
    store.upsertDocument({
      id: "work.tasks:alpha",
      source: "work.tasks",
      shard: "hot",
      domain: "work",
      type: "task",
      title: "Launch notes",
      body: "Launch checklist for project alpha.",
    });

    const output = store.query({
      query: "launch domain:documents source:documents.blocks shard:hot type:document scope:project-alpha",
    });

    assert.deepEqual(output.results.map((result) => result.id), ["documents.blocks:alpha"]);
    assert.equal(output.query, "launch");
    assert.deepEqual(store.query({ query: "launch domain:work type:document" }).results, []);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("registry federates sources with strict source timeouts", async () => {
  const registry = createRootSearchFederator({ budgets: { sourceTimeoutMs: 5 } });
  const manifest = createFrameworkSearchSourceManifest({
    id: "fast-notes",
    domain: "notes",
    name: "Fast notes",
    resultTypes: ["note"],
  });
  registry.register({
    manifest,
    query: () => [{ id: "note_1", source: "fast-notes", domain: "notes", type: "note", title: "Alpha", score: 50 }],
  });
  registry.register({
    manifest: createFrameworkSearchSourceManifest({
      id: "slow-notes",
      domain: "notes",
      name: "Slow notes",
      resultTypes: ["note"],
    }),
    query: () => new Promise((resolve) => setTimeout(() => resolve([]), 20)),
  });

  const output = await registry.query({ query: "alpha", domains: ["notes"] });

  assert.equal(output.results.length, 1);
  assert.equal(output.partial, true);
  assert.equal(output.omittedSources[0]?.source, "slow-notes");
  assert.equal(output.omittedSources[0]?.reason, "timeout");
  assert.ok(output.elapsedMs < 50);
  assert.equal(registry.budgets.globalFirstBatchMs, DEFAULT_SEARCH_BUDGETS.globalFirstBatchMs);
});

test("createSearchRegistry remains a compatible Root Search registry alias", async () => {
  const registry = createSearchRegistry({ budgets: { sourceTimeoutMs: 10 } });
  registry.register({
    manifest: createFrameworkSearchSourceManifest({
      id: "commands",
      domain: "commands",
      name: "Commands",
      resultTypes: ["command"],
    }),
    query: () => [{ id: "command:search", source: "commands", domain: "commands", type: "command", title: "search", score: 90 }],
  });

  const output = await registry.query({ query: "search" });

  assert.equal(output.partial, false);
  assert.equal(output.results[0]?.source, "commands");
});

test("lexical scoring distinguishes exact, prefix, fts and fuzzy matches", () => {
  assert.deepEqual(scoreLexicalMatch("alpha", "alpha").matchedBy, ["exact"]);
  assert.deepEqual(scoreLexicalMatch("alp", "alpha").matchedBy, ["prefix"]);
  assert.deepEqual(scoreLexicalMatch("beta", "alpha beta").matchedBy, ["fts"]);
  assert.deepEqual(scoreLexicalMatch("alpha gamma", "alpha beta").matchedBy, ["fuzzy"]);
  assert.equal(DEFAULT_SEARCH_BUDGETS.hotMs, 50);
  assert.equal(DEFAULT_SEARCH_BUDGETS.globalFirstBatchMs, 200);
});

test("SearchStore persists sources, fragments, FTS documents, actions, cursors, tombstones, saved searches, monitors and audit events", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-store-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    const manifest = createFrameworkSearchSourceManifest({
      id: "sessions.chats",
      domain: "sessions",
      name: "Chats",
      resultTypes: ["chat", "message"],
      facets: [
        { id: "projectId", label: "Project", type: "string" },
        { id: "kind", label: "Kind", type: "enum", values: ["chat", "message"] },
      ],
    });
    store.registerSource(manifest);
    assert.equal(store.listSources().at(0)?.id, "sessions.chats");
    assert.equal(store.sourceStatus().at(0)?.state, "enabled");
    store.setSourceState("sessions.chats", "paused", { backlog: 2, error: "manual hold" });
    store.registerSource(manifest);
    assert.equal(store.sourceState("sessions.chats"), "paused");
    assert.equal(store.sourceStatus().at(0)?.backlog, 2);
    store.setSourceState("sessions.chats", "enabled", { backlog: 0, error: null });

    store.upsertDocument({
      id: "sessions:chat_1",
      source: "sessions.chats",
      domain: "sessions",
      type: "chat",
      resourceId: "chat_1",
      title: "Alpha planning",
      snippet: "Planning notes",
      body: "A conversation about fast search and source manifests.",
      updatedAt: "2026-05-17T10:00:00.000Z",
      metadata: { projectId: "project-alpha", kind: "chat" },
      permissions: { canOpen: true, canPreview: true, redacted: false },
      rankingHints: { frecency: 0.8 },
      fragments: [
        {
          id: "sessions:chat_1:message_1",
          title: "Message",
          body: "The chat message mentions strict timeouts and hot shards.",
          snippet: "strict timeouts",
        },
      ],
      actions: [{ id: "open", kind: "open", label: "Open" }],
    });

    const output = store.query({ query: "timeouts", domains: ["sessions"], explain: true });
    assert.equal(output.results.length, 1);
    assert.equal(output.results[0]?.domain, "sessions");
    assert.equal(output.results[0]?.shard, undefined);
    assert.equal(output.results[0]?.fragments?.[0]?.id, "sessions:chat_1:message_1");
    assert.equal(output.results[0]?.actions?.[0]?.id, "open");
    assert.deepEqual(output.results[0]?.explanation?.matchedBy, ["fts"]);
    assert.equal(output.results[0]?.explanation?.scoreBreakdown?.frecency, 6.4);
    assert.equal(output.facets?.some((facet) => facet.id === "projectId"), true);

    const filtered = store.query({
      query: "timeouts",
      domains: ["sessions"],
      filters: { type: "chat", "metadata.projectId": "project-alpha", canPreview: true, redacted: false },
    });
    assert.equal(filtered.results.length, 1);
    const filteredOut = store.query({ query: "timeouts", domains: ["sessions"], filters: { "metadata.projectId": "project-beta" } });
    assert.equal(filteredOut.results.length, 0);

    const cursor = store.setCursor({ source: "sessions.chats", cursor: "watermark-1", metadata: { shard: "default" } });
    assert.equal(cursor.cursor, "watermark-1");
    assert.equal(cursor.shard, "default");
    assert.deepEqual(store.getCursor("sessions.chats")?.metadata, { shard: "default" });
    store.setCursor({ source: "sessions.chats", shard: "hot", cursor: "hot-watermark", metadata: { shard: "hot" } });
    store.setCursor({ source: "sessions.chats", shard: "cold", cursor: "cold-watermark", metadata: { shard: "cold" } });
    assert.equal(store.getCursor("sessions.chats", "hot")?.cursor, "hot-watermark");
    assert.deepEqual(store.listCursors("sessions.chats").map((entry) => entry.shard), ["cold", "default", "hot"]);

    store.saveSearch({ id: "saved_1", name: "Chats about Search", query: { query: "search", domains: ["sessions"] } });
    assert.equal(store.listSavedSearches().at(0)?.name, "Chats about Search");
    store.saveMonitor({ id: "monitor_1", savedSearchId: "saved_1", name: "Search monitor", cadence: "hourly" });
    assert.equal(store.listMonitors().at(0)?.enabled, true);

    const sensitiveQuery = store.recordAuditEvent({
      type: "sensitive_query",
      actor: "agent:codex",
      surface: "cli",
      query: "secret token",
      source: "sessions.chats",
      domain: "sessions",
      reason: "redacted preview",
      metadata: { resultCount: 1 },
      createdAt: "2026-05-17T10:02:00.000Z",
    });
    store.recordAuditEvent({
      type: "action",
      actor: "agent:codex",
      surface: "cli",
      resultId: "sessions:chat_1",
      actionId: "open",
      status: "planned",
      risk: "read",
      grant: "search.result.open",
      createdAt: "2026-05-17T10:03:00.000Z",
    });
    assert.equal(sensitiveQuery.id.startsWith("audit:2026-05-17T10:02:00.000Z:"), true);
    assert.deepEqual(store.listAuditEvents({ type: "sensitive_query" }).at(0), {
      id: sensitiveQuery.id,
      type: "sensitive_query",
      actor: "agent:codex",
      surface: "cli",
      query: "secret token",
      source: "sessions.chats",
      domain: "sessions",
      reason: "redacted preview",
      metadata: { resultCount: 1 },
      createdAt: "2026-05-17T10:02:00.000Z",
    });
    assert.equal(store.listAuditEvents().at(0)?.type, "action");

    const tombstone = store.tombstone({ source: "sessions.chats", resourceId: "chat_1", reason: "deleted upstream" });
    assert.equal(tombstone.source, "sessions.chats");
    assert.equal(store.query({ query: "timeouts", domains: ["sessions"] }).results.length, 0);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("SearchStore can isolate hot and cold document shards without changing default queries", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-shards-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "images.derived",
      domain: "images",
      name: "Images",
      resultTypes: ["image"],
    }));
    store.upsertDocument({
      id: "images.derived:hot:one",
      source: "images.derived",
      shard: "hot",
      domain: "images",
      type: "image",
      resourceId: "hot-one",
      title: "Launch whiteboard",
      body: "diagram of search pipeline",
      updatedAt: "2026-05-17T12:00:00.000Z",
      rankingHints: { hot: 2 },
      fragments: [{
        id: "images.derived:hot:one:ocr",
        title: "ocr",
        body: "diagram annotation",
      }],
    });
    store.upsertDocument({
      id: "images.derived:cold:one",
      source: "images.derived",
      shard: "cold",
      domain: "images",
      type: "image",
      resourceId: "cold-one",
      title: "Archived whiteboard",
      body: "diagram of search pipeline",
      updatedAt: "2026-05-16T12:00:00.000Z",
    });

    const initialShards = store.listShards({ source: "images.derived" });
    assert.deepEqual(initialShards.map((shard) => [shard.shard, shard.state, shard.documentCount, shard.fragmentCount]), [
      ["cold", "active", 1, 0],
      ["hot", "active", 1, 1],
    ]);

    const all = store.query({ query: "diagram", domains: ["images"] });
    assert.equal(all.results.length, 2);
    assert.deepEqual(all.results.map((result) => result.shard), ["hot", "cold"]);
    assert.deepEqual(store.query({ query: "diagram", domains: ["images"], shards: ["hot"] }).results.map((result) => result.id), ["images.derived:hot:one"]);
    assert.deepEqual(store.query({ query: "diagram", domains: ["images"], filters: { shard: "cold" } }).results.map((result) => result.id), ["images.derived:cold:one"]);

    store.upsertDocument({
      id: "images.derived:cold:one",
      source: "images.derived",
      shard: "hot",
      domain: "images",
      type: "image",
      resourceId: "cold-one",
      title: "Moved whiteboard",
      body: "diagram moved into the hot shard",
      updatedAt: "2026-05-17T13:00:00.000Z",
    });
    assert.deepEqual(store.listShards({ source: "images.derived" }).map((shard) => [shard.shard, shard.state, shard.documentCount, shard.fragmentCount]), [
      ["cold", "empty", 0, 0],
      ["hot", "active", 2, 1],
    ]);

    store.tombstone({ source: "images.derived", resourceId: "cold-one", deletedAt: "2026-05-18T12:00:00.000Z" });
    assert.deepEqual(store.listShards({ source: "images.derived" }).map((shard) => [shard.shard, shard.state, shard.documentCount, shard.fragmentCount]), [
      ["cold", "empty", 0, 0],
      ["hot", "active", 1, 1],
    ]);
    assert.deepEqual(store.query({ query: "diagram", domains: ["images"], shards: ["cold"] }).results, []);
    assert.equal(store.rankingCacheStats().entries, 1);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("SearchStore resets selected source shards without clearing sibling shards", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-shard-reset-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "images.derived",
      domain: "images",
      name: "Images",
      resultTypes: ["image"],
    }));
    store.upsertDocument({
      id: "images.derived:hot:one",
      source: "images.derived",
      shard: "hot",
      domain: "images",
      type: "image",
      resourceId: "hot-one",
      title: "Hot screenshot",
      body: "diagram in active gallery",
      updatedAt: "2026-05-17T12:00:00.000Z",
    });
    store.upsertDocument({
      id: "images.derived:cold:one",
      source: "images.derived",
      shard: "cold",
      domain: "images",
      type: "image",
      resourceId: "cold-one",
      title: "Cold screenshot",
      body: "diagram in archived gallery",
      updatedAt: "2026-05-17T12:00:00.000Z",
    });

    store.resetSourceShards({ sources: ["images.derived"], shards: ["cold"] });

    assert.deepEqual(store.listShards({ source: "images.derived" }).map((shard) => [shard.shard, shard.state, shard.documentCount]), [
      ["cold", "empty", 0],
      ["hot", "active", 1],
    ]);
    assert.deepEqual(store.query({ query: "diagram", domains: ["images"], shards: ["hot"] }).results.map((result) => result.id), ["images.derived:hot:one"]);
    assert.deepEqual(store.query({ query: "diagram", domains: ["images"], shards: ["cold"] }).results, []);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("SearchStore leases indexing jobs by source and shard for controlled backfill", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-index-jobs-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "documents.blocks",
      domain: "documents",
      name: "Documents",
      resultTypes: ["document"],
    }));
    store.enqueueIndexJob({
      id: "job:cold",
      source: "documents.blocks",
      shard: "cold",
      operation: "backfill",
      resourceId: "doc:cold",
      priority: 1,
      scheduledAt: "2026-05-17T10:00:00.000Z",
      createdAt: "2026-05-17T10:00:00.000Z",
    });
    store.enqueueIndexJob({
      id: "job:hot",
      source: "documents.blocks",
      shard: "hot",
      operation: "upsert",
      resourceId: "doc:hot",
      payload: { reason: "changed" },
      priority: 10,
      scheduledAt: "2026-05-17T10:00:00.000Z",
      createdAt: "2026-05-17T10:00:01.000Z",
    });

    const hotClaims = store.claimIndexJobs({
      now: "2026-05-17T10:00:02.000Z",
      leaseMs: 1_000,
      shards: ["hot"],
    });
    assert.deepEqual(hotClaims.map((job) => job.id), ["job:hot"]);
    assert.equal(hotClaims[0]?.attempts, 1);
    assert.equal(hotClaims[0]?.payload.reason, "changed");
    assert.equal(store.claimIndexJobs({ now: "2026-05-17T10:00:02.500Z", shards: ["hot"] }).length, 0);

    const retried = store.failIndexJob("job:hot", {
      error: "temporary extractor throttle",
      retry: true,
      scheduledAt: "2026-05-17T10:00:04.000Z",
      updatedAt: "2026-05-17T10:00:03.000Z",
    });
    assert.equal(retried?.status, "queued");
    assert.equal(retried?.error, "temporary extractor throttle");
    assert.equal(store.claimIndexJobs({ now: "2026-05-17T10:00:03.500Z", shards: ["hot"] }).length, 0);
    assert.deepEqual(store.claimIndexJobs({ now: "2026-05-17T10:00:04.000Z", shards: ["hot"] }).map((job) => job.id), ["job:hot"]);

    assert.equal(store.completeIndexJob("job:hot", { updatedAt: "2026-05-17T10:00:05.000Z" })?.status, "done");
    assert.deepEqual(store.claimIndexJobs({ now: "2026-05-17T10:00:05.000Z" }).map((job) => job.id), ["job:cold"]);
    assert.deepEqual(store.listIndexJobs({ status: "done" }).map((job) => job.id), ["job:hot"]);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("SearchStore schedules event-driven index jobs idempotently by source shard and resource", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-index-events-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "documents.blocks",
      domain: "documents",
      name: "Documents",
      resultTypes: ["document"],
    }));
    const first = store.scheduleIndexEvent({
      source: "documents.blocks",
      resourceId: "doc-alpha",
      operation: "upsert",
      payload: { revision: 1 },
      observedAt: "2026-05-17T10:00:00.000Z",
    });
    const second = store.scheduleIndexEvent({
      source: "documents.blocks",
      resourceId: "doc-alpha",
      operation: "upsert",
      payload: { revision: 2 },
      observedAt: "2026-05-17T10:00:01.000Z",
    });
    const deletion = store.scheduleIndexEvent({
      source: "documents.blocks",
      shard: "hot",
      resourceId: "doc-alpha",
      operation: "delete",
      observedAt: "2026-05-17T10:00:02.000Z",
    });
    const pathLike = store.scheduleIndexEvent({
      source: "documents.blocks",
      resourceId: "folder/doc alpha",
      operation: "upsert",
      observedAt: "2026-05-17T10:00:03.000Z",
    });

    assert.equal(first.id, second.id);
    assert.equal(second.status, "queued");
    assert.equal(second.attempts, 0);
    assert.equal(second.shard, "hot");
    assert.equal(second.priority, 60);
    assert.equal(second.payload.eventDriven, true);
    assert.equal(second.payload.revision, 2);
    assert.equal(second.payload.observedAt, "2026-05-17T10:00:01.000Z");
    assert.equal(deletion.operation, "delete");
    assert.equal(deletion.priority, 80);
    assert.match(pathLike.id, /^event:documents\.blocks:hot:upsert:folder_doc_alpha-[a-f0-9]{16}$/);
    assert.deepEqual(store.listIndexJobs({ source: "documents.blocks" }).map((job) => job.id), [deletion.id, second.id, pathLike.id]);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("SearchStore supports local semantic vector retrieval when an embedding is supplied", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-vectors-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "documents.blocks",
      domain: "documents",
      name: "Documents",
      resultTypes: ["document"],
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
    store.upsertVector({ documentId: "documents.blocks:alpha", model: "local-test", embedding: [0.95, 0.05] });
    store.upsertVector({ documentId: "documents.blocks:beta", model: "local-test", embedding: [0.1, 0.9] });

    assert.equal(store.listVectors("documents.blocks:alpha").at(0)?.model, "local-test");
    const semantic = store.query({
      query: "unrelated words",
      domains: ["documents"],
      strategy: "semantic",
      embedding: { model: "local-test", vector: [1, 0] },
      explain: true,
    });
    assert.equal(semantic.results[0]?.id, "documents.blocks:alpha");
    assert.equal(semantic.results[0]?.explanation?.matchedBy?.includes("semantic"), true);
    assert.ok((semantic.results[0]?.explanation?.scoreBreakdown?.semantic ?? 0) > 0);

    const noEmbedding = store.query({ query: "unrelated words", domains: ["documents"], strategy: "semantic" });
    assert.equal(noEmbedding.results.length, 0);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("SearchStore scores semantic vector matches", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-vectors-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "notes.blocks",
      domain: "notes",
      name: "Notes",
      resultTypes: ["note"],
    }));
    store.upsertDocument({
      id: "notes.blocks:one",
      source: "notes.blocks",
      domain: "notes",
      type: "note",
      title: "Semantic Search",
      body: "local vector ranking",
      updatedAt: "2026-05-17T12:00:00.000Z",
    });
    store.upsertDocument({
      id: "notes.blocks:two",
      source: "notes.blocks",
      domain: "notes",
      type: "note",
      title: "Lexical Search",
      body: "keyword only",
      updatedAt: "2026-05-17T12:01:00.000Z",
    });

    store.upsertVector({ documentId: "notes.blocks:one", model: "text-embedding-test", embedding: [1, 0, 0], updatedAt: "2026-05-17T12:00:01.000Z" });
    store.upsertVector({ documentId: "notes.blocks:two", model: "text-embedding-test", embedding: [0, 1, 0], updatedAt: "2026-05-17T12:01:01.000Z" });

    assert.deepEqual(store.listVectors("notes.blocks:one").map((vector) => vector.embedding), [[1, 0, 0]]);
    const output = store.query({
      query: "unmatched",
      domains: ["notes"],
      strategy: "semantic",
      embedding: { model: "text-embedding-test", vector: [0.9, 0.1, 0] },
      explain: true,
    });
    assert.deepEqual(output.results.map((result) => result.id), ["notes.blocks:one", "notes.blocks:two"]);
    assert.equal(output.results[0]?.explanation?.matchedBy.includes("semantic"), true);
    assert.ok((output.results[0]?.explanation?.scoreBreakdown?.semantic ?? 0) > (output.results[1]?.explanation?.scoreBreakdown?.semantic ?? 0));
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("SearchStore central ranking uses frecency, actor, surface and scope hints", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-ranking-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "work.tasks",
      domain: "work",
      name: "Work tasks",
      resultTypes: ["task"],
    }));
    store.upsertDocument({
      id: "work.tasks:cold",
      source: "work.tasks",
      domain: "work",
      type: "task",
      title: "Launch checklist",
      body: "Launch checklist for Search source ranking.",
      updatedAt: "2026-05-17T12:00:00.000Z",
      metadata: { scopeKind: "project", scopeId: "other-project", actorId: "agent:other", surface: "other" },
      rankingHints: { priority: 1 },
    });
    store.upsertDocument({
      id: "work.tasks:hot",
      source: "work.tasks",
      domain: "work",
      type: "task",
      title: "Launch checklist",
      body: "Launch checklist for Search source ranking.",
      updatedAt: "2026-05-17T11:00:00.000Z",
      metadata: { scopeKind: "project", scopeId: "project-alpha", actorId: "agent:codex", surface: "cli" },
      rankingHints: { frecency: 1, priority: 2, "actor:agent:codex": 3, "surface:cli": 2, scope: 2 },
    });

    const output = store.query({
      query: "launch checklist",
      domains: ["work"],
      actor: "agent:codex",
      surface: "cli",
      filters: { "metadata.scopeKind": "project" },
      explain: true,
    });

    assert.equal(output.results[0]?.id, "work.tasks:hot");
    assert.ok((output.results[0]?.score ?? 0) > (output.results[1]?.score ?? 0));
    assert.ok((output.results[0]?.explanation?.scoreBreakdown?.context ?? 0) > 0);
    assert.ok((output.results[0]?.explanation?.scoreBreakdown?.frecency ?? 0) > 0);
    assert.ok((output.results[0]?.explanation?.scoreBreakdown?.hints ?? 0) > 0);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("SearchStore records local interactions as frecency ranking signals", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-local-frecency-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "work.tasks",
      domain: "work",
      name: "Work tasks",
      resultTypes: ["task"],
    }));
    store.upsertDocument({
      id: "work.tasks:recent",
      source: "work.tasks",
      domain: "work",
      type: "task",
      title: "Local frecency checklist",
      body: "Local frecency checklist for Search source ranking.",
      updatedAt: "2026-05-17T12:00:00.000Z",
    });
    store.upsertDocument({
      id: "work.tasks:older",
      source: "work.tasks",
      domain: "work",
      type: "task",
      title: "Local frecency checklist",
      body: "Local frecency checklist for Search source ranking.",
      updatedAt: "2026-05-17T11:00:00.000Z",
    });
    assert.equal(store.query({ query: "local frecency checklist", domains: ["work"] }).results[0]?.id, "work.tasks:recent");

    const interaction = store.recordInteraction({
      resultId: "work.tasks:older",
      actor: "agent:codex",
      surface: "cli",
      actionId: "open",
      kind: "open",
      createdAt: "2026-05-17T12:30:00.000Z",
    });
    assert.equal(interaction?.count, 1);
    assert.equal(interaction?.actor, "agent:codex");

    const output = store.query({
      query: "local frecency checklist",
      domains: ["work"],
      actor: "agent:codex",
      surface: "cli",
      explain: true,
    });
    assert.equal(output.results[0]?.id, "work.tasks:older");
    assert.ok((output.results[0]?.explanation?.scoreBreakdown?.frecency ?? 0) > 0);
    assert.ok((output.results[0]?.explanation?.rankingHints?.localFrecency ?? 0) > 0);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("SearchStore filters results by actor and required search scopes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-acl-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "work.tasks",
      domain: "work",
      name: "Work tasks",
      resultTypes: ["task"],
    }));
    store.upsertDocument({
      id: "work.tasks:public",
      source: "work.tasks",
      domain: "work",
      type: "task",
      title: "Launch checklist public",
      body: "Launch checklist for the public workspace.",
    });
    store.upsertDocument({
      id: "work.tasks:agent",
      source: "work.tasks",
      domain: "work",
      type: "task",
      title: "Launch checklist private",
      body: "Launch checklist for codex agent only.",
      permissions: { allowedAgents: ["agent:codex"] },
    });
    store.upsertDocument({
      id: "work.tasks:scoped",
      source: "work.tasks",
      domain: "work",
      type: "task",
      title: "Launch checklist project alpha",
      body: "Launch checklist for project alpha.",
      permissions: { allowedActors: ["agent:codex"], requiredScopes: ["project-alpha"] },
    });

    assert.deepEqual(
      store.query({ query: "launch checklist", domains: ["work"] }).results.map((result) => result.id),
      ["work.tasks:public"],
    );
    assert.deepEqual(
      store.query({ query: "launch checklist", domains: ["work"], actor: "agent:other" }).results.map((result) => result.id),
      ["work.tasks:public"],
    );
    assert.deepEqual(
      store.query({ query: "launch checklist", domains: ["work"], actor: "agent:codex" }).results.map((result) => result.id).sort(),
      ["work.tasks:agent", "work.tasks:public"],
    );
    assert.deepEqual(
      store.query({
        query: "launch checklist",
        domains: ["work"],
        actor: "agent:codex",
        filters: { scope: "project-alpha" },
      }).results.map((result) => result.id).sort(),
      ["work.tasks:agent", "work.tasks:public", "work.tasks:scoped"],
    );
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("SearchStore applies agent result budgets after ACL and ranking", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-agent-budget-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "work.tasks",
      domain: "work",
      name: "Work tasks",
      resultTypes: ["task"],
    }));
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "work.notes",
      domain: "work",
      name: "Work notes",
      resultTypes: ["note"],
    }));
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "knowledge.refs",
      domain: "knowledge",
      name: "Knowledge refs",
      resultTypes: ["reference"],
    }));
    for (const item of [
      { id: "work.tasks:one", source: "work.tasks", domain: "work", title: "Budget result task one", updatedAt: "2026-05-17T12:05:00.000Z" },
      { id: "work.tasks:two", source: "work.tasks", domain: "work", title: "Budget result task two", updatedAt: "2026-05-17T12:04:00.000Z" },
      { id: "work.notes:one", source: "work.notes", domain: "work", title: "Budget result note one", updatedAt: "2026-05-17T12:03:00.000Z" },
      { id: "knowledge.refs:one", source: "knowledge.refs", domain: "knowledge", title: "Budget result reference one", updatedAt: "2026-05-17T12:02:00.000Z" },
      { id: "knowledge.refs:two", source: "knowledge.refs", domain: "knowledge", title: "Budget result reference two", updatedAt: "2026-05-17T12:01:00.000Z" },
    ]) {
      store.upsertDocument({
        ...item,
        type: "record",
        body: "Budget result item for agent search limits.",
      });
    }

    const budgeted = store.query({
      query: "budget result",
      limit: 10,
      agentBudget: {
        maxResults: 3,
        maxResultsPerSource: 1,
        maxResultsPerDomain: 2,
      },
    });

    assert.deepEqual(budgeted.results.map((result) => result.id), [
      "work.tasks:one",
      "work.notes:one",
      "knowledge.refs:one",
    ]);

    const unbudgeted = store.query({ query: "budget result", limit: 10 });
    assert.equal(unbudgeted.results.length, 5);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("SearchStore caches ranked query output and invalidates on index changes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-ranking-cache-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "commands",
      domain: "commands",
      name: "Commands",
      resultTypes: ["command"],
    }));
    store.upsertDocument({
      id: "commands:search",
      source: "commands",
      domain: "commands",
      type: "command",
      title: "search",
      body: "Search command",
      rankingHints: { hot: 1 },
    });

    assert.equal(store.rankingCacheStats().entries, 0);
    const first = store.query({ query: "search", domains: ["commands"], explain: true });
    assert.equal(first.results[0]?.id, "commands:search");
    assert.equal(store.rankingCacheStats().entries, 1);

    const cached = store.query({ query: "search", domains: ["commands"], explain: true });
    assert.equal(cached.results[0]?.id, "commands:search");
    assert.equal(store.rankingCacheStats().entries, 1);

    store.upsertDocument({
      id: "commands:search-docs",
      source: "commands",
      domain: "commands",
      type: "command",
      title: "search docs",
      body: "Search command documentation",
      rankingHints: { hot: 2 },
    });
    assert.equal(store.rankingCacheStats().entries, 0);
    assert.equal(store.query({ query: "documentation", domains: ["commands"] }).results[0]?.id, "commands:search-docs");

    store.setSourceState("commands", "paused");
    assert.equal(store.rankingCacheStats().entries, 0);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("SearchStore filters result ACLs by actor and scope", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-acl-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
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
      body: "Search ACL launch notes",
      permissions: {
        canOpen: true,
        canPreview: true,
        redacted: false,
        allowedActors: ["agent:codex"],
        requiredScopes: ["project-alpha"],
      },
    });

    assert.equal(store.query({ query: "launch", domains: ["documents"] }).results.length, 0);
    assert.equal(store.query({ query: "launch", domains: ["documents"], actor: "agent:other", filters: { scopeId: "project-alpha" } }).results.length, 0);
    assert.equal(store.query({ query: "launch", domains: ["documents"], actor: "agent:codex", filters: { scopeId: "project-beta" } }).results.length, 0);
    assert.deepEqual(
      store.query({ query: "launch", domains: ["documents"], actor: "agent:codex", filters: { scopeId: "project-alpha" } }).results.map((result) => result.id),
      ["documents.blocks:restricted"],
    );
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("SearchStore redacts previews and fragments for any redacted result", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-redacted-preview-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "documents.blocks",
      domain: "documents",
      name: "Documents",
      resultTypes: ["document"],
    }));
    store.upsertDocument({
      id: "documents.blocks:redacted",
      source: "documents.blocks",
      domain: "documents",
      type: "document",
      title: "Restricted launch notes",
      body: "Hidden launch details should remain searchable but never previewed.",
      snippet: "Hidden launch details",
      permissions: { canPreview: false, redacted: true },
      fragments: [{
        id: "documents.blocks:redacted:fragment",
        title: "secret fragment",
        body: "Hidden launch fragment content",
        snippet: "Hidden launch fragment",
      }],
    });

    const output = store.query({ query: "hidden launch", domains: ["documents"], explain: true });
    assert.equal(output.results.length, 1);
    assert.equal(output.results[0]?.id, "documents.blocks:redacted");
    assert.equal(output.results[0]?.snippet, "[redacted]");
    assert.deepEqual(output.results[0]?.fragments ?? [], []);
    assert.equal(output.results[0]?.permissions?.canPreview, false);
    assert.equal(output.results[0]?.permissions?.redacted, true);
    assert.ok(output.results[0]?.explanation?.matchedBy?.length);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("SearchStore enforces per-source document and fragment limits before indexing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-limits-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    const manifest = createFrameworkSearchSourceManifest({
      id: "documents.blocks",
      domain: "documents",
      name: "Documents",
      resultTypes: ["document"],
    });
    manifest.indexing.limits = { maxBodyBytes: 1024, maxFragments: 1, maxFragmentBytes: 512 };
    store.registerSource(manifest);
    store.upsertDocument({
      id: "documents.blocks:limited",
      source: "documents.blocks",
      domain: "documents",
      type: "document",
      title: "Limited document",
      body: `visible opening ${"a".repeat(1200)} hidden-tail-token`,
      fragments: [
        { id: "documents.blocks:limited:first", title: "first", body: `fragment visible ${"b".repeat(700)} hidden-fragment-tail` },
        { id: "documents.blocks:limited:second", title: "second", body: "second fragment should not be indexed" },
      ],
    });

    assert.equal(store.query({ query: "hidden-tail-token", domains: ["documents"] }).results.length, 0);
    assert.equal(store.query({ query: "hidden-fragment-tail", domains: ["documents"] }).results.length, 0);
    assert.equal(store.query({ query: "second fragment", domains: ["documents"] }).results.length, 0);
    const visible = store.query({ query: "visible", domains: ["documents"], explain: true });
    assert.equal(visible.results.length, 1);
    assert.equal(visible.results[0]?.fragments?.length, 1);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("SearchStore preserves source controls and omits disabled sources", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-source-controls-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    const manifest = createFrameworkSearchSourceManifest({
      id: "database.records",
      domain: "database",
      name: "Database records",
      resultTypes: ["record"],
    });
    store.registerSource(manifest);
    store.setSourceState("database.records", "paused");
    store.registerSource(manifest);
    assert.equal(store.sourceState("database.records"), "paused");

    store.upsertDocument({
      id: "database.records:main:contacts:ada",
      source: "database.records",
      domain: "database",
      type: "record",
      title: "Ada Lovelace",
      body: "Analytical engine rollout owner",
    });

    const output = store.query({ query: "Analytical", domains: ["database"] });
    assert.equal(output.results.length, 0);
    assert.equal(output.partial, true);
    assert.equal(output.omittedSources[0]?.source, "database.records");
    assert.equal(output.omittedSources[0]?.reason, "disabled");
    assert.match(output.omittedSources[0]?.message ?? "", /paused/);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
