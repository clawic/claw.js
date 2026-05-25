import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import {
  DEFAULT_SEARCH_BUDGETS,
  DEFAULT_SEARCH_ENGINE_ID,
  LOCAL_TEXT_EMBEDDING_DIMENSIONS,
  LOCAL_TEXT_EMBEDDING_MODEL,
  SEARCH_PROFILES,
  SEARCH_SQLITE_ENGINE,
  SEARCH_SOURCE_SETS,
  SearchStore,
  createLocalTextEmbedding,
  createFrameworkSearchSourceManifest,
  createFullSearchSourceManifest,
  createRootSearchFederator,
  createSearchActionExecutionPlan,
  createSearchRegistry,
  defineSearchEngine,
  listSearchEntrypointContracts,
  scoreLexicalMatch,
} from "./index.ts";

test("Search exposes SQLite as the default rebuildable engine boundary", () => {
  assert.equal(DEFAULT_SEARCH_ENGINE_ID, "sqlite");
  assert.equal(SEARCH_SQLITE_ENGINE.id, "sqlite");
  assert.equal(SEARCH_SQLITE_ENGINE.storage.kind, "sidecar");
  assert.equal(SEARCH_SQLITE_ENGINE.storage.defaultFileName, "search.sqlite");
  assert.equal(SEARCH_SQLITE_ENGINE.storage.rebuildable, true);
  assert.equal(SEARCH_SQLITE_ENGINE.storage.ownsCanonicalData, false);
  assert.equal(SEARCH_SQLITE_ENGINE.storage.shardModel, "physical");
  assert.equal(SEARCH_SQLITE_ENGINE.capabilities.fts, true);
  assert.equal(SEARCH_SQLITE_ENGINE.capabilities.jobQueue, true);
  assert.equal(SEARCH_SQLITE_ENGINE.capabilities.vectors, true);
  assert.equal(SEARCH_SQLITE_ENGINE.capabilities.rankingCache, true);
  assert.deepEqual(SEARCH_SQLITE_ENGINE.query.strategies, ["lexical", "semantic", "hybrid"]);
});

test("Search entrypoint contracts keep Root Search separate from chat search", () => {
  const entrypoints = listSearchEntrypointContracts();
  const root = entrypoints.find((entrypoint) => entrypoint.id === "root-search");
  const chat = entrypoints.find((entrypoint) => entrypoint.id === "chat-search");
  const admin = entrypoints.find((entrypoint) => entrypoint.id === "search-index");

  assert.equal(root?.route, "/search");
  assert.equal(root?.command, "claw search query");
  assert.equal(root?.queryScope, "framework");
  assert.equal(root?.hotkey.bindingId, "search.root.global");
  assert.equal(root?.hotkey.state, "external_pending");
  assert.equal(root?.preservesConversationSearchIsolation, true);

  assert.equal(chat?.queryScope, "conversations_only");
  assert.equal(chat?.hotkey.reservedChord, "Command-G");
  assert.equal(chat?.hotkey.state, "ready");
  assert.equal(chat?.preservesConversationSearchIsolation, true);

  assert.equal(admin?.route, "/search-index");
  assert.equal(admin?.queryScope, "technical_admin");
  assert.equal(admin?.hotkey.state, "not_applicable");
});

test("Search action execution plans are brokered and fail closed without host approval", () => {
  const result = {
    id: "commands:system",
    source: "commands",
    domain: "commands",
    type: "command",
    title: "system",
    score: 1,
  };
  const action = { id: "help", kind: "run" as const, label: "Show help", requiresApproval: true, risk: "system" as const, grant: "search.commands.run" };

  const dryRun = createSearchActionExecutionPlan({ result, action, dryRun: true, actor: "agent:test", surface: "mcp" });
  assert.equal(dryRun.status, "planned");
  assert.equal(dryRun.broker.sideEffects, "none");
  assert.equal(dryRun.actor, "agent:test");
  assert.equal(dryRun.surface, "mcp");

  const blocked = createSearchActionExecutionPlan({ result, action, dryRun: false });
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.requiresApproval, true);
  assert.equal(blocked.reasons.includes("host_approval_required"), true);

  const brokered = createSearchActionExecutionPlan({ result, action, dryRun: false, hostApprovalId: "approval_search_help" });
  assert.equal(brokered.status, "brokered");
  assert.equal(brokered.hostApprovalId, "approval_search_help");
  assert.equal(brokered.broker.sideEffects, "host_brokered");
});

test("Search action execution plans expose signed-host request templates for native brokers", () => {
  const result = {
    id: "native.system:shortcut:daily-plan",
    source: "native.system",
    domain: "native",
    type: "shortcut",
    title: "Daily Plan",
    score: 1,
    resourceId: "shortcut:Daily Plan",
  };
  const action = {
    id: "run",
    kind: "run" as const,
    label: "Run Shortcut",
    requiresApproval: true,
    risk: "system" as const,
    grant: "native.system.shortcut.run",
    hostBroker: {
      system: "mac-control" as const,
      capabilityId: "mac.shortcut.run",
      arguments: { name: "Daily Plan" },
      target: { kind: "shortcut", name: "Daily Plan" },
      reason: "Run native Shortcut from Search result",
    },
  };

  const dryRun = createSearchActionExecutionPlan({ result, action, dryRun: true, actor: "agent:codex" });
  assert.equal(dryRun.status, "planned");
  assert.equal(dryRun.hostRequest?.system, "mac-control");
  assert.equal(dryRun.hostRequest?.capabilityId, "mac.shortcut.run");
  assert.equal(dryRun.hostRequest?.actor.kind, "agent");
  assert.equal(dryRun.hostRequest?.actor.id, "agent:codex");
  assert.equal(dryRun.hostRequest?.arguments.name, "Daily Plan");
  assert.equal(dryRun.hostRequest?.arguments.resultId, "native.system:shortcut:daily-plan");
  assert.equal(dryRun.hostRequest?.target?.kind, "shortcut");
  assert.equal(dryRun.hostRequest?.dryRun, true);
  assert.equal(dryRun.hostRequest?.approved, false);
  assert.equal(dryRun.hostRequest?.command.action, "plan");

  const brokered = createSearchActionExecutionPlan({
    result,
    action,
    dryRun: false,
    hostApprovalId: "approval_native_shortcut",
    actor: "user:owner",
  });
  assert.equal(brokered.status, "brokered");
  assert.equal(brokered.hostRequest?.dryRun, false);
  assert.equal(brokered.hostRequest?.approved, true);
  assert.equal(brokered.hostRequest?.hostApprovalId, "approval_native_shortcut");
  assert.equal(brokered.hostRequest?.command.action, "execute");
  assert.equal(brokered.hostRequest?.actor.kind, "user_ui");
});

test("Search action execution requires review and labels for regulated results", () => {
  const result = {
    id: "finance.records:1",
    source: "finance.records",
    domain: "finance",
    type: "transaction",
    title: "transaction 1",
    score: 1,
    metadata: {
      legalOutputLabels: ["not_professional_advice", "human_review_required", "regulated_domain:finance"],
    },
  };
  const action = { id: "copy-reference", kind: "copy" as const, label: "Copy finance reference" };

  const blocked = createSearchActionExecutionPlan({ result, action, dryRun: false, actor: "agent:test", surface: "mcp" });
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.requiresApproval, true);
  assert.equal(blocked.reasons.includes("regulated_result_review_required"), true);
  assert.equal(blocked.legalOutputLabels?.includes("regulated_domain:finance"), true);

  const brokered = createSearchActionExecutionPlan({ result, action, dryRun: false, hostApprovalId: "approval_finance_copy" });
  assert.equal(brokered.status, "brokered");
  assert.equal(brokered.legalOutputLabels?.includes("not_professional_advice"), true);
  assert.equal(brokered.policy?.policyDecision, "allow");

  const automated = createSearchActionExecutionPlan({
    result,
    action,
    dryRun: false,
    policyConfig: {
      mode: "authorized_automation",
      automationAuthorized: true,
      destinationAuthorized: true,
      materialConsent: true,
    },
  });
  assert.equal(automated.status, "brokered");
  assert.equal(automated.hostApprovalId, undefined);
  assert.equal(automated.policy?.policyDecision, "allow");
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
        shardModel: "physical",
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

test("full sourceSet sources are opt-in and may defer their fast path to external adapters", () => {
  const manifest = createFullSearchSourceManifest({
    id: "local.files",
    domain: "files",
    name: "Local files",
    resultTypes: ["file"],
    facets: [{ id: "extension", label: "Extension", type: "string" }],
  });

  assert.equal(manifest.sourceSet, "full");
  assert.equal(manifest.indexing.defaultState, "off");
  assert.equal(manifest.indexing.freshness, "manual");
  assert.equal(manifest.permissions.default, "opt_in");
  assert.equal(manifest.capabilities.fastPath, false);
  assert.equal(manifest.capabilities.semantic, "optional");
});

test("Search profiles remain a public compatibility alias for source sets", () => {
  assert.deepEqual(SEARCH_PROFILES, SEARCH_SOURCE_SETS);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-profile-alias-"));
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

    const fullProfileQuery = store.query({ query: "settings", profile: "full", sources: ["local.files"] });
    assert.equal(fullProfileQuery.sourceSet, "full");
    assert.equal(fullProfileQuery.omittedSources[0]?.reason, "disabled");

    const canonicalSourceSetQuery = store.query({
      query: "settings",
      profile: "full",
      sourceSet: "framework",
      sources: ["local.files"],
    });
    assert.equal(canonicalSourceSetQuery.sourceSet, "framework");
    assert.equal(canonicalSourceSetQuery.omittedSources[0]?.reason, "sourceSet");
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
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
    assert.equal(explicitlyFullSource.omittedSources[0]?.reason, "sourceSet");
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

test("SearchStore skips FTS rewrites for duplicate identical bulk upserts", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-duplicate-upsert-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "duplicate.items",
      domain: "duplicate",
      name: "Duplicate items",
      resultTypes: ["item"],
    }));
    const documents = Array.from({ length: 80 }, (_, index) => ({
      id: `duplicate.items:${index}`,
      source: "duplicate.items",
      shard: index % 2 === 0 ? "hot" : "cold",
      domain: "duplicate",
      type: "item",
      title: `Duplicate item ${index}`,
      body: `duplicate ingest needle ${index % 10}`,
      updatedAt: "2026-01-01T00:00:00.000Z",
      metadata: { group: index % 5 },
      rankingHints: { frecency: index % 3 },
      fragments: Array.from({ length: 3 }, (_fragment, fragmentIndex) => ({
        id: `duplicate.items:${index}:fragment:${fragmentIndex}`,
        title: `Fragment ${fragmentIndex}`,
        body: `fragment duplicate needle ${index % 10}`,
        sortOrder: fragmentIndex,
      })),
      actions: [{ id: "open", kind: "open" as const, label: "Open duplicate item" }],
    }));

    const sqliteChanges = () => (store.db.prepare("SELECT total_changes() AS value").get() as { value: number }).value;

    const beforeFirst = sqliteChanges();
    assert.equal(store.upsertDocuments(documents), documents.length);
    const firstDelta = sqliteChanges() - beforeFirst;
    const firstQuery = store.query({ query: "duplicate needle 3", domains: ["duplicate"], limit: 20 });
    const sourceStatus = store.sourceStatus().find((source) => source.source === "duplicate.items");

    const beforeSecond = sqliteChanges();
    assert.equal(store.upsertDocuments(documents), documents.length);
    const secondDelta = sqliteChanges() - beforeSecond;
    const secondQuery = store.query({ query: "duplicate needle 3", domains: ["duplicate"], limit: 20 });

    assert.equal(secondDelta, 0);
    assert.equal(firstDelta > documents.length, true);
    assert.deepEqual(secondQuery.results.map((result) => result.id), firstQuery.results.map((result) => result.id));
    assert.equal(store.sourceStatus().find((source) => source.source === "duplicate.items")?.lastIndexedAt, sourceStatus?.lastIndexedAt);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("SearchStore keeps hot shard and Root Search first-batch latency within budgets", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-latency-gate-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "latency.items",
      domain: "latency",
      name: "Latency items",
      resultTypes: ["latency-item"],
    }));
    store.upsertDocuments(Array.from({ length: 2500 }, (_value, index) => {
      const shard = index < 500 ? "hot" : "cold";
      const token = shard === "hot" ? `hotlatency${index % 10}` : `coldlatency${index % 100}`;
      const rootToken = shard === "hot" ? "rootlatency" : "coldrootlatency";
      return {
        id: `latency.items:${index}`,
        source: "latency.items",
        shard,
        domain: "latency",
        type: "latency-item",
        title: `Latency item ${index} ${token} ${rootToken}`,
        body: `Search latency regression gate ${token} ${rootToken} ${shard} shard result ${index}`,
        updatedAt: new Date(1_800_000_000_000 + index).toISOString(),
        rankingHints: shard === "hot" ? { hot: 1, frecency: 1 } : { frecency: 0.1 },
      };
    }));

    const hotDurations: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      const output = store.query({ query: `hotlatency${i}`, domains: ["latency"], shards: ["hot"], limit: 10 });
      assert.ok(output.results.length > 0);
      assert.equal(output.partial, false);
      assert.equal(output.results.every((result) => result.shard === "hot"), true);
      hotDurations.push(output.elapsedMs);
    }
    assert.ok(percentile(hotDurations, 0.95) <= DEFAULT_SEARCH_BUDGETS.hotMs, `hot p95 exceeded ${DEFAULT_SEARCH_BUDGETS.hotMs}ms: ${hotDurations.join(", ")}`);

    const federator = createRootSearchFederator();
    federator.register({
      manifest: createFrameworkSearchSourceManifest({
        id: "latency.fast",
        domain: "latency",
        name: "Latency fast source",
        resultTypes: ["latency-item"],
      }),
      query: (input) => store.query({ ...input, sources: ["latency.items"], shards: ["hot"], limit: 10 }).results,
    });
    const rootOutput = await federator.query({ query: "rootlatency", domains: ["latency"], limit: 10 });
    assert.ok(rootOutput.results.length > 0);
    assert.equal(rootOutput.partial, false);
    assert.ok(rootOutput.elapsedMs <= DEFAULT_SEARCH_BUDGETS.globalFirstBatchMs, `Root Search first batch exceeded ${DEFAULT_SEARCH_BUDGETS.globalFirstBatchMs}ms: ${rootOutput.elapsedMs}ms`);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("SearchStore materializes fragments, actions and interactions without N+1 query latency", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-materialization-batch-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "batch.items",
      domain: "batch",
      name: "Batch items",
      resultTypes: ["batch-item"],
    }));
    store.upsertDocuments(Array.from({ length: 320 }, (_value, index) => ({
      id: `batch.items:${index}`,
      source: "batch.items",
      domain: "batch",
      type: "batch-item",
      title: `Batch materialization result ${index} batchneedle`,
      body: `Search materialization regression body batchneedle ${index}`,
      updatedAt: new Date(1_800_000_000_000 + index).toISOString(),
      fragments: Array.from({ length: 6 }, (_fragment, fragmentIndex) => ({
        id: `batch.items:${index}:fragment:${fragmentIndex}`,
        title: `Fragment ${fragmentIndex}`,
        body: `Fragment body batchneedle ${index} ${fragmentIndex}`,
      })),
      actions: [{ id: "open", kind: "open", label: "Open batch item" }],
    })));
    for (let index = 0; index < 40; index += 1) {
      store.recordInteraction({
        resultId: `batch.items:${280 + index}`,
        actor: "agent:codex",
        surface: "cli",
        actionId: "open",
        kind: "open",
        createdAt: new Date(1_800_000_500_000 + index).toISOString(),
      });
    }

    const output = store.query({
      query: "batchneedle",
      domains: ["batch"],
      actor: "agent:codex",
      surface: "cli",
      limit: 80,
      explain: true,
    });

    assert.equal(output.results.length, 80);
    assert.ok(output.elapsedMs <= DEFAULT_SEARCH_BUDGETS.globalFirstBatchMs, `batched materialization exceeded ${DEFAULT_SEARCH_BUDGETS.globalFirstBatchMs}ms: ${output.elapsedMs}ms`);
    assert.equal(output.results[0]?.actions?.[0]?.id, "open");
    assert.equal(output.results[0]?.fragments?.length, 5);
    assert.equal(output.results.every((result) => (result.fragments?.length ?? 0) <= 5), true);
    assert.equal(output.results.some((result) => (result.explanation?.scoreBreakdown?.frecency ?? 0) > 0), true);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("SearchStore materializes only final ranked results after candidate ranking", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-materialization-finalists-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "finalist.items",
      domain: "finalists",
      name: "Finalist items",
      resultTypes: ["finalist-item"],
    }));
    store.upsertDocuments(Array.from({ length: 120 }, (_value, index) => ({
      id: `finalist.items:${index}`,
      source: "finalist.items",
      domain: "finalists",
      type: "finalist-item",
      title: `Finalist materialization result ${index} finalistneedle`,
      body: `Search final materialization regression body finalistneedle ${index}`,
      updatedAt: new Date(1_800_001_000_000 + index).toISOString(),
      fragments: Array.from({ length: 5 }, (_fragment, fragmentIndex) => ({
        id: `finalist.items:${index}:fragment:${fragmentIndex}`,
        title: `Fragment ${fragmentIndex}`,
        body: `Fragment body finalistneedle ${index} ${fragmentIndex}`,
      })),
      actions: [{ id: "open", kind: "open", label: "Open finalist item" }],
    })));

    const instrumentedStore = store as unknown as {
      materializeResults: (rows: unknown[], input: unknown, options?: unknown) => unknown[];
    };
    const originalMaterializeResults = instrumentedStore.materializeResults.bind(store);
    let materializedRows = 0;
    instrumentedStore.materializeResults = (rows, input, options) => {
      materializedRows += rows.length;
      return originalMaterializeResults(rows, input, options);
    };

    const output = store.query({
      query: "finalistneedle",
      domains: ["finalists"],
      limit: 10,
    });

    assert.equal(output.results.length, 10);
    assert.equal(materializedRows, 10);
    assert.equal(output.results[0]?.actions?.[0]?.id, "open");
    assert.equal(output.results.every((result) => (result.fragments?.length ?? 0) <= 5), true);
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
    assert.equal(store.query({ query: "hotneedle42", limit: 5 }).results.length, 1);
    assert.equal(store.rankingCacheStats().entries, 2);

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

test("SearchStore ranking cache expires old entries and rehydrates current rows", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-cache-ttl-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "commands",
      domain: "commands",
      name: "Commands",
      resultTypes: ["command"],
    }));
    store.upsertDocument({
      id: "commands:ttl",
      source: "commands",
      domain: "commands",
      type: "command",
      title: "old ttl command",
      body: "ttlneedle",
    });
    assert.equal(store.query({ query: "ttlneedle", domains: ["commands"] }).results[0]?.title, "old ttl command");
    const oldCacheTime = "2020-01-01T00:00:00.000Z";
    store.db.prepare("UPDATE search_ranking_cache SET updated_at = ?").run(oldCacheTime);
    store.db.prepare("UPDATE search_documents SET title = ?, updated_at = ? WHERE id = ?").run("new ttl command", "2026-01-01T00:00:00.000Z", "commands:ttl");

    const output = store.query({ query: "ttlneedle", domains: ["commands"] });
    assert.equal(output.results[0]?.title, "new ttl command");
    const cacheRow = store.db.prepare("SELECT updated_at FROM search_ranking_cache").get() as { updated_at: string };
    assert.notEqual(cacheRow.updated_at, oldCacheTime);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("SearchStore discards corrupt ranking cache entries and rebuilds query results", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-cache-corrupt-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "commands",
      domain: "commands",
      name: "Commands",
      resultTypes: ["command"],
    }));
    store.upsertDocument({
      id: "commands:cache-corrupt",
      source: "commands",
      domain: "commands",
      type: "command",
      title: "cache corruption recovery",
      body: "cachefragile",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    assert.equal(store.query({ query: "cachefragile", domains: ["commands"] }).results[0]?.id, "commands:cache-corrupt");
    assert.equal(store.rankingCacheStats().entries, 1);

    store.db.prepare("UPDATE search_ranking_cache SET payload_json = ?").run("{not valid json");

    const output = store.query({ query: "cachefragile", domains: ["commands"] });
    assert.equal(output.results[0]?.id, "commands:cache-corrupt");
    const cacheRow = store.db.prepare("SELECT json_valid(payload_json) AS valid FROM search_ranking_cache").get() as { valid: number } | undefined;
    assert.equal(cacheRow?.valid, 1);
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

test("registry caps first batch by global budget even when source timeout is larger", async () => {
  const registry = createRootSearchFederator({ budgets: { sourceTimeoutMs: 200, globalFirstBatchMs: 15 } });
  registry.register({
    manifest: createFrameworkSearchSourceManifest({
      id: "fast-docs",
      domain: "documents",
      name: "Fast docs",
      resultTypes: ["document"],
    }),
    query: () => [{ id: "fast-docs:alpha", source: "fast-docs", domain: "documents", type: "document", title: "Alpha doc", score: 80 }],
  });
  registry.register({
    manifest: createFrameworkSearchSourceManifest({
      id: "slow-docs",
      domain: "documents",
      name: "Slow docs",
      resultTypes: ["document"],
    }),
    query: () => new Promise((resolve) => setTimeout(() => resolve([{ id: "slow-docs:beta", source: "slow-docs", domain: "documents", type: "document", title: "Beta doc", score: 90 }]), 60)),
  });

  const output = await registry.query({ query: "doc", domains: ["documents"] });

  assert.deepEqual(output.results.map((result) => result.id), ["fast-docs:alpha"]);
  assert.equal(output.partial, true);
  assert.equal(output.omittedSources[0]?.source, "slow-docs");
  assert.equal(output.omittedSources[0]?.reason, "timeout");
  assert.ok(output.elapsedMs < 80);
});

test("registry skips disabled sources and applies agent result budgets", async () => {
  const registry = createRootSearchFederator({ budgets: { sourceTimeoutMs: 20 } });
  registry.register({
    manifest: createFrameworkSearchSourceManifest({
      id: "notes.pages",
      domain: "notes",
      name: "Notes",
      resultTypes: ["note"],
    }),
    status: () => ({ source: "notes.pages", domain: "notes", state: "enabled", backlog: 0 }),
    query: () => [
      { id: "notes.pages:1", source: "notes.pages", domain: "notes", type: "note", title: "Alpha note", score: 100 },
      { id: "notes.pages:2", source: "notes.pages", domain: "notes", type: "note", title: "Beta note", score: 90 },
    ],
  });
  registry.register({
    manifest: createFrameworkSearchSourceManifest({
      id: "documents.blocks",
      domain: "documents",
      name: "Documents",
      resultTypes: ["document"],
    }),
    status: () => ({ source: "documents.blocks", domain: "documents", state: "enabled", backlog: 0 }),
    query: () => [
      { id: "documents.blocks:1", source: "documents.blocks", domain: "documents", type: "document", title: "Alpha doc", score: 95 },
      { id: "documents.blocks:2", source: "documents.blocks", domain: "documents", type: "document", title: "Beta doc", score: 80 },
    ],
  });
  registry.register({
    manifest: createFrameworkSearchSourceManifest({
      id: "sessions.chats",
      domain: "sessions",
      name: "Chats",
      resultTypes: ["chat"],
    }),
    status: () => ({ source: "sessions.chats", domain: "sessions", state: "paused", backlog: 3 }),
    query: () => [{ id: "sessions.chats:1", source: "sessions.chats", domain: "sessions", type: "chat", title: "Paused chat", score: 200 }],
  });

  const output = await registry.query({
    query: "alpha",
    agentBudget: {
      maxResults: 3,
      maxResultsPerSource: 1,
      maxResultsPerDomain: 1,
    },
  });

  assert.deepEqual(output.results.map((result) => result.id), ["notes.pages:1", "documents.blocks:1"]);
  assert.equal(output.partial, true);
  assert.equal(output.omittedSources[0]?.source, "sessions.chats");
  assert.equal(output.omittedSources[0]?.reason, "disabled");
  assert.match(output.omittedSources[0]?.message ?? "", /paused/);
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
  assert.deepEqual(scoreLexicalMatch("alhpa", "alpha beta").matchedBy, ["fuzzy"]);
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

    const cursor = store.setCursor({ source: "sessions.chats", cursor: "cursor-1", watermark: "watermark-1", metadata: { shard: "default", version: 1 } });
    assert.equal(cursor.cursor, "cursor-1");
    assert.equal(cursor.watermark, "watermark-1");
    assert.equal(cursor.checksum.length, 64);
    assert.equal(cursor.shard, "default");
    assert.deepEqual(store.getCursor("sessions.chats")?.metadata, { shard: "default", version: 1 });
    const stableChecksum = store.setCursor({ source: "sessions.chats", cursor: "cursor-1", watermark: "watermark-1", metadata: { version: 1, shard: "default" } }).checksum;
    assert.equal(stableChecksum, cursor.checksum);
    store.setCursor({ source: "sessions.chats", shard: "hot", cursor: "hot-cursor", watermark: "hot-watermark", metadata: { shard: "hot" } });
    store.setCursor({ source: "sessions.chats", shard: "cold", cursor: "cold-watermark", metadata: { shard: "cold" } });
    assert.equal(store.getCursor("sessions.chats", "hot")?.cursor, "hot-cursor");
    assert.equal(store.getCursor("sessions.chats", "hot")?.watermark, "hot-watermark");
    assert.equal(store.getCursor("sessions.chats", "cold")?.watermark, "cold-watermark");
    assert.deepEqual(store.listCursors("sessions.chats").map((entry) => entry.shard), ["cold", "default", "hot"]);

    store.saveSearch({ id: "saved_1", name: "Chats about Search", query: { query: "search", domains: ["sessions"] } });
    assert.equal(store.listSavedSearches().at(0)?.name, "Chats about Search");
    store.saveMonitor({ id: "monitor_1", savedSearchId: "saved_1", name: "Search monitor", cadence: "hourly" });
    assert.equal(store.listMonitors().at(0)?.enabled, true);
    assert.equal(store.deleteMonitor("monitor_1"), true);
    assert.equal(store.listMonitors().length, 0);
    store.saveMonitor({ id: "monitor_1", savedSearchId: "saved_1", name: "Search monitor", cadence: "hourly" });
    assert.equal(store.deleteSavedSearch("saved_1"), true);
    assert.equal(store.listSavedSearches().length, 0);
    assert.equal(store.listMonitors().length, 0);

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

test("SearchStore returns bounded fuzzy fallback results when FTS has no hit", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-fuzzy-fallback-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "notes.pages",
      domain: "notes",
      name: "Notes",
      resultTypes: ["note"],
    }));
    store.upsertDocument({
      id: "notes.pages:alpha",
      source: "notes.pages",
      domain: "notes",
      type: "note",
      title: "Alpha launch note",
      body: "Project launch checklist and planning notes.",
      updatedAt: "2026-05-18T00:00:00.000Z",
    });

    const output = store.query({ query: "alhpa", domains: ["notes"], explain: true });
    assert.equal(output.results[0]?.id, "notes.pages:alpha");
    assert.equal(output.results[0]?.explanation?.matchedBy?.includes("fuzzy"), true);
    assert.equal(output.partial, false);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("SearchStore tokenizes hyphenated query terms for FTS", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-hyphen-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "documents.blocks",
      domain: "documents",
      name: "Documents",
      resultTypes: ["document"],
    }));
    store.upsertDocument({
      id: "documents.blocks:metadata",
      source: "documents.blocks",
      domain: "documents",
      type: "document",
      title: "Metadata fragment",
      body: "finance-metadata-fragment-needle",
    });
    const hyphenated = store.query({ query: "finance-metadata-fragment-needle", sources: ["documents.blocks"], explain: true });
    assert.deepEqual(hyphenated.results.map((result) => result.id), ["documents.blocks:metadata"]);
    assert.equal(hyphenated.results[0]?.explanation?.matchedBy?.includes("fts"), true);
    const spaced = store.query({ query: "finance metadata fragment needle", sources: ["documents.blocks"] });
    assert.deepEqual(spaced.results.map((result) => result.id), ["documents.blocks:metadata"]);
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

test("SearchStore uses physical FTS partitions for shard-scoped lexical queries", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-fts-partitions-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "documents.blocks",
      domain: "documents",
      name: "Documents",
      resultTypes: ["document"],
    }));
    store.upsertDocument({
      id: "documents.blocks:hot:one",
      source: "documents.blocks",
      shard: "hot",
      domain: "documents",
      type: "document",
      resourceId: "hot-one",
      title: "Hot launch note",
      body: "partition-only sentinel in the active shard",
      updatedAt: "2026-05-17T12:00:00.000Z",
      fragments: [{
        id: "documents.blocks:hot:one:block",
        title: "body",
        body: "fragment partition sentinel",
      }],
    });
    store.upsertDocument({
      id: "documents.blocks:cold:one",
      source: "documents.blocks",
      shard: "cold",
      domain: "documents",
      type: "document",
      resourceId: "cold-one",
      title: "Cold launch note",
      body: "partition-only sentinel in the archived shard",
      updatedAt: "2026-05-16T12:00:00.000Z",
    });

    const partitions = store.db.prepare(`
      SELECT source, shard, table_name
      FROM search_fts_partitions
      WHERE source = 'documents.blocks'
      ORDER BY shard ASC
    `).all() as Array<{ source: string; shard: string; table_name: string }>;
    assert.deepEqual(partitions.map((row) => row.shard), ["cold", "hot"]);
    assert.equal(partitions.every((row) => row.table_name.startsWith("search_fts_part_")), true);

    store.db.prepare("DELETE FROM search_fts WHERE source = ? AND shard = ?").run("documents.blocks", "hot");
    const hot = store.query({ query: "partition sentinel", domains: ["documents"], shards: ["hot"], limit: 5 });
    assert.deepEqual(hot.results.map((result) => result.id), ["documents.blocks:hot:one"]);

    const unscoped = store.query({ query: "partition sentinel", domains: ["documents"], limit: 5 });
    assert.equal(unscoped.results.some((result) => result.id === "documents.blocks:cold:one"), true);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("SearchStore persists rebuildable file inventory by source root and path", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-file-inventory-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "local.files",
      domain: "files",
      name: "Local files",
      resultTypes: ["file"],
    }));
    const rootA = path.join(dir, "root-a");
    const rootB = path.join(dir, "root-b");
    const first = store.upsertFileInventoryEntry({
      source: "local.files",
      root: rootA,
      relativePath: "docs/readme.md",
      dev: 10,
      ino: 20,
      mtimeMs: 1234,
      size: 42,
      extension: ".md",
      kind: "text",
      lastSeenGeneration: 1,
    });
    assert.equal(first.state, "active");
    assert.equal(first.dev, "10");
    assert.equal(first.ino, "20");
    assert.equal(store.fileInventoryEntry("local.files", rootA, "docs/readme.md")?.size, 42);
    assert.equal(store.fileInventoryEntry("local.files", rootB, "docs/readme.md"), null);

    store.markFileInventoryIndexed({
      source: "local.files",
      root: rootA,
      relativePath: "docs/readme.md",
      checksum: "sha256:alpha",
      indexedAt: "2026-05-21T10:00:00.000Z",
    });
    const indexed = store.fileInventoryEntry("local.files", rootA, "docs/readme.md");
    assert.equal(indexed?.checksum, "sha256:alpha");
    assert.equal(indexed?.lastIndexedAt, "2026-05-21T10:00:00.000Z");

    store.upsertFileInventoryEntry({
      source: "local.files",
      root: rootA,
      relativePath: "docs/old.md",
      mtimeMs: 1000,
      size: 12,
      extension: ".md",
      kind: "text",
      lastSeenGeneration: 0,
    });
    assert.deepEqual(store.staleFileInventoryEntries({ source: "local.files", root: rootA, generation: 1 }).map((entry) => entry.relativePath), ["docs/old.md"]);
    store.markFileInventoryDeleted({ source: "local.files", root: rootA, relativePath: "docs/old.md", generation: 1 });
    assert.equal(store.fileInventoryEntry("local.files", rootA, "docs/old.md")?.state, "deleted");
    assert.deepEqual(store.staleFileInventoryEntries({ source: "local.files", root: rootA, generation: 1 }), []);
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
    const generatedAlpha = createLocalTextEmbedding("Design rationale Architecture notes about quiet interfaces.");
    const generatedBeta = createLocalTextEmbedding("Release notes Changelog for packaging.");
    assert.equal(generatedAlpha.model, LOCAL_TEXT_EMBEDDING_MODEL);
    assert.equal(generatedAlpha.vector.length, LOCAL_TEXT_EMBEDDING_DIMENSIONS);
    assert.deepEqual(createLocalTextEmbedding("Design rationale Architecture notes about quiet interfaces.").vector, generatedAlpha.vector);
    store.upsertVector({ documentId: "documents.blocks:alpha", model: generatedAlpha.model, embedding: generatedAlpha.vector });
    store.upsertVector({ documentId: "documents.blocks:beta", model: generatedBeta.model, embedding: generatedBeta.vector });

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
    const generatedSemantic = store.query({
      query: "quiet architecture interface",
      domains: ["documents"],
      strategy: "semantic",
      embedding: createLocalTextEmbedding("quiet architecture interface"),
      explain: true,
    });
    assert.equal(generatedSemantic.results[0]?.id, "documents.blocks:alpha");

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

function percentile(values: number[], rank: number): number {
  assert.ok(values.length > 0);
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * rank) - 1))] ?? 0;
}
