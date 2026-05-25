import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { CLI_EXIT_USAGE } from "./index.ts";
import { runCliCapture } from "./index-test-utils.ts";

test("search query rejects provider embedding model derivation", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-query-embedding-gate-"));
  const dataRoot = path.join(workspaceRoot, "data");
  try {
    const blocked = await runCliCapture([
      "search",
      "query",
      "provider semantic query",
      "--strategy",
      "semantic",
      "--embedding-model",
      "provider-text-v1",
      "--data-dir",
      dataRoot,
      "--json",
    ], workspaceRoot);
    assert.equal(blocked.code, CLI_EXIT_USAGE);
    const payload = JSON.parse(blocked.stdout) as { error: { code: string; message: string } };
    assert.equal(payload.error.code, "SEARCH_EMBEDDING_PROVIDER_PENDING");
    assert.match(payload.error.message, /EXTERNAL PENDING/);
  } finally {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test("search saved create rejects provider embedding model derivation", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-saved-embedding-gate-"));
  const dataRoot = path.join(workspaceRoot, "data");
  try {
    const blocked = await runCliCapture([
      "search",
      "saved",
      "create",
      "provider-saved-query",
      "--query",
      "provider semantic query",
      "--strategy",
      "semantic",
      "--embedding-model",
      "provider-text-v1",
      "--data-dir",
      dataRoot,
      "--json",
    ], workspaceRoot);
    assert.equal(blocked.code, CLI_EXIT_USAGE);
    const payload = JSON.parse(blocked.stdout) as { error: { code: string; message: string } };
    assert.equal(payload.error.code, "SEARCH_EMBEDDING_PROVIDER_PENDING");
    assert.match(payload.error.message, /EXTERNAL PENDING/);
  } finally {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test("search json flags reject invalid input as usage errors", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-json-flags-"));
  const dataRoot = path.join(workspaceRoot, "data");
  try {
    const cases = [
      {
        argv: ["search", "saved", "create", "bad-filters", "--query", "notes", "--filters", "{bad", "--data-dir", dataRoot, "--json"],
        code: "invalid_search_filters_json",
      },
      {
        argv: ["search", "jobs", "enqueue", "upsert", "--source", "local.files", "--payload", "{bad", "--data-dir", dataRoot, "--json"],
        code: "invalid_search_payload_json",
      },
      {
        argv: ["search", "query", "notes", "--embedding", "[1,\"bad\"]", "--data-dir", dataRoot, "--json"],
        code: "invalid_search_embedding_json",
      },
    ] as const;

    for (const testCase of cases) {
      const blocked = await runCliCapture(testCase.argv, workspaceRoot);
      assert.equal(blocked.code, CLI_EXIT_USAGE, testCase.code);
      const payload = JSON.parse(blocked.stdout) as { ok: boolean; error: { code: string; status: string } };
      assert.equal(payload.ok, false, testCase.code);
      assert.equal(payload.error.code, testCase.code);
      assert.equal(payload.error.status, "USAGE");
    }
  } finally {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
