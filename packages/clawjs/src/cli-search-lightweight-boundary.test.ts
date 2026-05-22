import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { registeredDatabasePath, registeredSearchDatabasePath } from "../../../tests/helpers/stable-surface-test-builders.ts";
import { CLI_EXIT_DEGRADED, CLI_EXIT_OK } from "./index.ts";
import { runCliCapture, withPatchedEnv } from "./index-test-utils.ts";

test("search command facade stays free of persistent search imports", () => {
  const source = fs.readFileSync(new URL("./cli-search-command.ts", import.meta.url), "utf8");
  assert.equal(source.includes("better-sqlite3"), false);
  assert.equal(source.includes("@clawjs/search"), false);
  assert.equal(source.includes("cli-search-code-symbols-source"), false);
  assert.equal(source.includes("cli-search-docs-pages-source"), false);
  assert.equal(source.includes("cli-search-heavy-command"), true);
});

test("basic search and query do not create search.sqlite without explicit persistence", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-lightweight-"));
  const dataRoot = path.join(workspaceRoot, "data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
    CLAW_DB_PATH: undefined,
    CLAW_DATABASE_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    CLAW_SEARCH_DB_PATH: undefined,
  }, async () => {
    const basic = await runCliCapture(["search", "Search V1.1", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(basic.code), true);
    assert.equal(fs.existsSync(registeredSearchDatabasePath(dataRoot)), false);

    const query = await runCliCapture(["search", "query", "Search V1.1", "--data-dir", dataRoot, "--json"], workspaceRoot);
    assert.equal(query.code, CLI_EXIT_DEGRADED);
    const payload = JSON.parse(query.stdout) as { data: { indexState: string; results: unknown[]; scheduledRefreshJobs?: unknown[] } };
    assert.equal(payload.data.indexState, "missing");
    assert.deepEqual(payload.data.results, []);
    assert.equal(payload.data.scheduledRefreshJobs, undefined);
    assert.equal(fs.existsSync(registeredSearchDatabasePath(dataRoot)), false);
  });
});
