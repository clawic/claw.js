import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import {
  DEFAULT_SEARCH_BUDGETS,
  SearchStore,
  createFrameworkSearchSourceManifest,
  createSearchRegistry,
  scoreLexicalMatch,
} from "./index.ts";

test("framework sources are opt-in and require fast paths", () => {
  const manifest = createFrameworkSearchSourceManifest({
    id: "chats",
    domain: "sessions",
    name: "Chats",
    resultTypes: ["chat", "message"],
  });

  assert.equal(manifest.permissions.default, "opt_in");
  assert.equal(manifest.capabilities.fastPath, true);
  assert.equal(manifest.indexing.freshness, "near_immediate");
});

test("registry federates sources with strict source timeouts", async () => {
  const registry = createSearchRegistry({ budgets: { sourceTimeoutMs: 5 } });
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
});

test("lexical scoring distinguishes exact, prefix, fts and fuzzy matches", () => {
  assert.deepEqual(scoreLexicalMatch("alpha", "alpha").matchedBy, ["exact"]);
  assert.deepEqual(scoreLexicalMatch("alp", "alpha").matchedBy, ["prefix"]);
  assert.deepEqual(scoreLexicalMatch("beta", "alpha beta").matchedBy, ["fts"]);
  assert.deepEqual(scoreLexicalMatch("alpha gamma", "alpha beta").matchedBy, ["fuzzy"]);
  assert.equal(DEFAULT_SEARCH_BUDGETS.hotMs, 50);
  assert.equal(DEFAULT_SEARCH_BUDGETS.globalFirstBatchMs, 200);
});

test("SearchStore persists sources, fragments, FTS documents, actions, cursors, tombstones, saved searches and monitors", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-store-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    const manifest = createFrameworkSearchSourceManifest({
      id: "sessions.chats",
      domain: "sessions",
      name: "Chats",
      resultTypes: ["chat", "message"],
    });
    store.registerSource(manifest);
    assert.equal(store.listSources().at(0)?.id, "sessions.chats");
    assert.equal(store.sourceStatus().at(0)?.state, "enabled");

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

    const cursor = store.setCursor({ source: "sessions.chats", cursor: "watermark-1", metadata: { shard: "hot" } });
    assert.equal(cursor.cursor, "watermark-1");
    assert.deepEqual(store.getCursor("sessions.chats")?.metadata, { shard: "hot" });

    store.saveSearch({ id: "saved_1", name: "Chats about Search", query: { query: "search", domains: ["sessions"] } });
    assert.equal(store.listSavedSearches().at(0)?.name, "Chats about Search");
    store.saveMonitor({ id: "monitor_1", savedSearchId: "saved_1", name: "Search monitor", cadence: "hourly" });
    assert.equal(store.listMonitors().at(0)?.enabled, true);

    const tombstone = store.tombstone({ source: "sessions.chats", resourceId: "chat_1", reason: "deleted upstream" });
    assert.equal(tombstone.source, "sessions.chats");
    assert.equal(store.query({ query: "timeouts", domains: ["sessions"] }).results.length, 0);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
