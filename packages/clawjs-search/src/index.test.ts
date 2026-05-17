import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SEARCH_BUDGETS,
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
