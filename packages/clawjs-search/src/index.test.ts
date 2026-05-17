import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import {
  DEFAULT_SEARCH_BUDGETS,
  SearchStore,
  createFrameworkSearchSourceManifest,
  createRootSearchFederator,
  createSearchRegistry,
  scoreLexicalMatch,
} from "./index.ts";

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

    const cursor = store.setCursor({ source: "sessions.chats", cursor: "watermark-1", metadata: { shard: "hot" } });
    assert.equal(cursor.cursor, "watermark-1");
    assert.deepEqual(store.getCursor("sessions.chats")?.metadata, { shard: "hot" });

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
