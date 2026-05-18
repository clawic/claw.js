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
