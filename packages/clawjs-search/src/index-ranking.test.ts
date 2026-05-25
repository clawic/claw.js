import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import {
  LOCAL_TEXT_EMBEDDING_MODEL,
  SearchStore,
  createFrameworkSearchSourceManifest,
  createFullSearchSourceManifest,
  createLocalTextEmbedding,
} from "./index.ts";

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

test("SearchStore handles filter-only inline queries without sending empty text to FTS", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-filter-only-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "commands",
      domain: "commands",
      name: "Commands",
      resultTypes: ["command"],
    }));
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "documents.blocks",
      domain: "documents",
      name: "Documents",
      resultTypes: ["document"],
    }));
    store.upsertDocument({
      id: "commands:older",
      source: "commands",
      domain: "commands",
      type: "command",
      title: "Older command",
      body: "Command available to root search.",
      updatedAt: "2026-05-17T11:00:00.000Z",
    });
    store.upsertDocument({
      id: "commands:newer",
      source: "commands",
      domain: "commands",
      type: "command",
      title: "Newer command",
      body: "Command available to root search.",
      updatedAt: "2026-05-17T12:00:00.000Z",
    });
    store.upsertDocument({
      id: "documents.blocks:note",
      source: "documents.blocks",
      domain: "documents",
      type: "document",
      title: "Document note",
      body: "Document should not appear in command-only search.",
      updatedAt: "2026-05-17T12:30:00.000Z",
    });

    const output = store.query({ query: "domain:commands", limit: 10 });

    assert.equal(output.query, "");
    assert.deepEqual(output.results.map((result) => result.id), [
      "commands:newer",
      "commands:older",
    ]);
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
    const cachePayload = store.db.prepare("SELECT payload_json FROM search_ranking_cache").get() as { payload_json: string };
    assert.match(cachePayload.payload_json, /commands:search/);
    assert.doesNotMatch(cachePayload.payload_json, /Search command/);

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

test("SearchStore ranking cache is bounded by entry count and total bytes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-ranking-cache-bounds-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    for (let index = 0; index < 260; index += 1) {
      store.query({ query: `entryprune${index}`, domains: ["commands"] });
    }
    assert.equal(store.rankingCacheStats().entries, 256);
    store.clearRankingCache();

    const oversizedByteCount = 1024 * 1024;
    const payload = JSON.stringify({
      query: "manual",
      sourceSet: "framework",
      results: [],
      partial: false,
      omittedSources: [],
    });
    const insert = store.db.prepare(`
      INSERT INTO search_ranking_cache (
        cache_key, payload_json, byte_count, result_count,
        source_count, domain_count, shard_count, updated_at
      )
      VALUES (?, ?, ?, 0, 0, 0, 0, ?)
    `);
    for (let index = 0; index < 20; index += 1) {
      insert.run(`manual-byte-${index}`, payload, oversizedByteCount, new Date(Date.now() - index * 1000).toISOString());
    }
    store.query({ query: "byteprune", domains: ["commands"] });
    const total = store.db.prepare("SELECT COALESCE(SUM(byte_count), 0) AS bytes FROM search_ranking_cache").get() as { bytes: number };
    assert.ok(total.bytes <= 16 * 1024 * 1024);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("SearchStore skips oversized ranking cache entries", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-ranking-cache-oversized-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "large.items",
      domain: "large",
      name: "Large items",
      resultTypes: ["item"],
    }));
    const longIdPart = "x".repeat(2200);
    store.upsertDocuments(Array.from({ length: 160 }, (_, index) => ({
      id: `large.items:${index}:${longIdPart}`,
      source: "large.items",
      domain: "large",
      type: "item",
      title: `Large result ${index}`,
      body: "oversizedneedle",
    })));

    const output = store.query({ query: "oversizedneedle", domains: ["large"], limit: 200 });
    assert.equal(output.results.length, 160);
    assert.equal(store.rankingCacheStats().entries, 0);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("SearchStore ranking cache rehydrates current rows and drops stale deleted rows", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-ranking-cache-rehydrate-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "notes.pages",
      domain: "notes",
      name: "Notes",
      resultTypes: ["page"],
    }));
    store.upsertDocument({
      id: "notes.pages:rehydrate",
      source: "notes.pages",
      domain: "notes",
      type: "page",
      title: "Original note",
      body: "rehydrateneedle",
    });
    assert.equal(store.query({ query: "rehydrateneedle", domains: ["notes"] }).results[0]?.title, "Original note");
    store.db.prepare("UPDATE search_documents SET title = ? WHERE id = ?").run("Current note", "notes.pages:rehydrate");
    assert.equal(store.query({ query: "rehydrateneedle", domains: ["notes"] }).results[0]?.title, "Current note");

    store.db.prepare("UPDATE search_documents SET deleted_at = ? WHERE id = ?").run("2026-01-01T00:00:00.000Z", "notes.pages:rehydrate");
    assert.equal(store.query({ query: "rehydrateneedle", domains: ["notes"] }).results.length, 0);
    assert.equal(store.rankingCacheStats().entries, 1);
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
      actions: [{ id: "open", kind: "open", label: "Open restricted note", grant: "search.documents.open" }],
    });

    assert.equal(store.query({ query: "launch", domains: ["documents"] }).results.length, 0);
    assert.equal(store.query({ query: "launch", domains: ["documents"], actor: "agent:other", filters: { scopeId: "project-alpha" } }).results.length, 0);
    assert.equal(store.query({ query: "launch", domains: ["documents"], actor: "agent:codex", filters: { scopeId: "project-beta" } }).results.length, 0);
    assert.deepEqual(
      store.query({ query: "launch", domains: ["documents"], actor: "agent:codex", filters: { scopeId: "project-alpha" } }).results.map((result) => result.id),
      ["documents.blocks:restricted"],
    );
    assert.equal(store.resultForId("documents.blocks:restricted"), null);
    assert.deepEqual(store.actionsForResult("documents.blocks:restricted"), []);
    assert.equal(store.resultForId("documents.blocks:restricted", { actor: "agent:other", filters: { scopeId: "project-alpha" } }), null);
    assert.deepEqual(store.actionsForResult("documents.blocks:restricted", { actor: "agent:codex", filters: { scopeId: "project-beta" } }), []);
    assert.equal(
      store.resultForId("documents.blocks:restricted", { actor: "agent:codex", filters: { scopeId: "project-alpha" } })?.id,
      "documents.blocks:restricted",
    );
    assert.deepEqual(
      store.actionsForResult("documents.blocks:restricted", { actor: "agent:codex", filters: { scopeId: "project-alpha" } }).map((action) => action.id),
      ["open"],
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

test("SearchStore omits external-pending sources from query, actions and embeddings", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-external-pending-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    const manifest = createFullSearchSourceManifest({
      id: "native.system",
      domain: "native",
      name: "Native system",
      resultTypes: ["preference"],
      capabilities: { semantic: "optional" },
    });
    store.registerSource(manifest, { state: "external_pending", error: "requires signed host adapter" });
    store.upsertDocument({
      id: "native.system:settings",
      source: "native.system",
      domain: "native",
      type: "preference",
      title: "System Settings",
      body: "Native settings panel",
      actions: [{ id: "open", kind: "open", label: "Open settings" }],
    });
    store.upsertVector({
      documentId: "native.system:settings",
      model: LOCAL_TEXT_EMBEDDING_MODEL,
      embedding: createLocalTextEmbedding("native settings panel").vector,
    });

    const output = store.query({ query: "settings", sourceSet: "full", sources: ["native.system"] });
    assert.equal(output.results.length, 0);
    assert.equal(output.partial, true);
    assert.equal(output.omittedSources[0]?.source, "native.system");
    assert.equal(output.omittedSources[0]?.reason, "disabled");
    assert.match(output.omittedSources[0]?.message ?? "", /external_pending/);
    assert.equal(store.resultForId("native.system:settings"), null);
    assert.deepEqual(store.actionsForResult("native.system:settings"), []);
    assert.equal(store.indexLocalEmbeddings({ sources: ["native.system"] }).indexed, 0);
    assert.deepEqual(store.listEmbeddingStatus({ sources: ["native.system"] }), []);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
