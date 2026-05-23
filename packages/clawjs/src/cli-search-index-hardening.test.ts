import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { SearchStore, createFrameworkSearchSourceManifest } from "@clawjs/search";
import { registeredSearchDatabasePath } from "../../../tests/helpers/stable-surface-test-builders.ts";
import { CLI_EXIT_DEGRADED, CLI_EXIT_OK } from "./index.ts";
import { runCliCapture } from "./index-test-utils.ts";

test("search query degrades cleanly when the index is empty", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-empty-index-"));
  const dataRoot = path.join(workspaceRoot, "data");
  const searchDbPath = registeredSearchDatabasePath(dataRoot);

  const query = await runCliCapture(["search", "query", "needle", "--data-dir", dataRoot, "--json"], workspaceRoot);

  assert.equal(query.code, CLI_EXIT_DEGRADED);
  const payload = JSON.parse(query.stdout) as {
    data: {
      results: unknown[];
      indexState: string;
      commandFallback: { reason: string };
    };
  };
  assert.deepEqual(payload.data.results, []);
  assert.equal(payload.data.indexState, "missing");
  assert.equal(payload.data.commandFallback.reason, "missing_index");
  assert.equal(fs.existsSync(searchDbPath), false);
});

test("search query degrades cleanly when the rebuildable index is corrupt", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-corrupt-index-"));
  const dataRoot = path.join(workspaceRoot, "data");
  const searchDbPath = registeredSearchDatabasePath(dataRoot);
  fs.mkdirSync(path.dirname(searchDbPath), { recursive: true });
  fs.writeFileSync(searchDbPath, "not a sqlite database");

  const query = await runCliCapture(["search", "query", "needle", "--data-dir", dataRoot, "--json"], workspaceRoot);

  assert.equal(query.code, CLI_EXIT_DEGRADED);
  const payload = JSON.parse(query.stdout) as {
    data: {
      results: unknown[];
      partial: boolean;
      stale: boolean;
      indexState: string;
      commandFallback: { reason: string };
    };
  };
  assert.deepEqual(payload.data.results, []);
  assert.equal(payload.data.partial, true);
  assert.equal(payload.data.stale, true);
  assert.equal(payload.data.indexState, "corrupt");
  assert.equal(payload.data.commandFallback.reason, "corrupt_index");
  assert.equal(fs.readFileSync(searchDbPath, "utf8"), "not a sqlite database");
});

test("manual search rebuild quarantines a corrupt rebuildable index", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-rebuild-corrupt-index-"));
  const dataRoot = path.join(workspaceRoot, "data");
  const searchDbPath = registeredSearchDatabasePath(dataRoot);
  fs.mkdirSync(path.dirname(searchDbPath), { recursive: true });
  fs.writeFileSync(searchDbPath, "not a sqlite database");

  const rebuild = await runCliCapture(["search", "rebuild", "--source", "commands", "--data-dir", dataRoot, "--json"], workspaceRoot);

  assert.equal(rebuild.code, CLI_EXIT_OK, rebuild.stderr || rebuild.stdout);
  const payload = JSON.parse(rebuild.stdout) as {
    data: {
      rebuilt: boolean;
      mode: string;
      indexedBySource: Record<string, number>;
      sources: string[];
    };
  };
  assert.equal(payload.data.rebuilt, true);
  assert.equal(payload.data.mode, "scoped");
  assert.ok(payload.data.indexedBySource.commands > 0);
  assert.equal(payload.data.sources.includes("commands"), true);
  assert.equal(fs.existsSync(searchDbPath), true);
  assert.equal(
    fs.readdirSync(path.dirname(searchDbPath)).some((entry) => entry.startsWith("search.sqlite.corrupt.")),
    true,
  );
});

test("search query keeps large indexes bounded by the requested limit", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-large-index-"));
  const dataRoot = path.join(workspaceRoot, "data");
  const store = new SearchStore(registeredSearchDatabasePath(dataRoot));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "commands",
      domain: "commands",
      name: "Commands",
      resultTypes: ["command"],
    }));
    store.upsertDocuments(Array.from({ length: 1_500 }, (_, index) => ({
      id: `commands:large-${index}`,
      source: "commands",
      domain: "commands",
      type: "command",
      title: `Large command ${index}`,
      body: `massiveneedle command body ${index}`,
    })));
  } finally {
    store.close();
  }

  const query = await runCliCapture([
    "search", "query", "massiveneedle",
    "--sources", "commands",
    "--data-dir", dataRoot,
    "--limit", "25",
    "--json",
  ], workspaceRoot);

  assert.equal(query.code, CLI_EXIT_OK, query.stderr || query.stdout);
  const payload = JSON.parse(query.stdout) as {
    data: { results: Array<{ source: string }>; indexState: string };
  };
  assert.equal(payload.data.indexState, "ephemeral");
  assert.equal(payload.data.results.length, 25);
  assert.equal(payload.data.results.every((result) => result.source === "commands"), true);
});
