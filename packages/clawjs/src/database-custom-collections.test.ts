import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { CLI_EXIT_FAILURE, CLI_EXIT_OK } from "./index.ts";
import { parseCliJsonPayload, runCliCapture, useIsolatedClawDataRoot } from "./index-test-utils.ts";

test("db refuses to create unknown custom collections implicitly", { concurrency: false }, async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-db-custom-explicit-"));
  useIsolatedClawDataRoot(t, workspaceRoot);

  const create = await runCliCapture([
    "db",
    "prospects",
    "create",
    "--workspace",
    workspaceRoot,
    "--set",
    "name=Ada",
    "--json",
  ], process.cwd());

  assert.equal(create.code, CLI_EXIT_FAILURE);
  const createPayload = JSON.parse(create.stdout) as { ok: boolean; error: { code: string; message: string } };
  assert.equal(createPayload.ok, false);
  assert.equal(createPayload.error.code, "not_found");
  assert.match(createPayload.error.message, /Collection prospects does not exist/);
  assert.match(createPayload.error.message, /database collection create/);

  const schema = await runCliCapture([
    "db",
    "prospects",
    "schema",
    "--workspace",
    workspaceRoot,
    "--json",
  ], process.cwd());

  assert.equal(schema.code, CLI_EXIT_OK);
  const schemaPayload = parseCliJsonPayload<{
    exists: boolean;
    autoCreateOnWrite: boolean;
    explicitCreateRequired: boolean;
    createHint: string;
    collection: { name: string; builtin: boolean };
  }>(schema.stdout);
  assert.equal(schemaPayload.exists, false);
  assert.equal(schemaPayload.autoCreateOnWrite, false);
  assert.equal(schemaPayload.explicitCreateRequired, true);
  assert.match(schemaPayload.createHint, /database collection create/);
  assert.equal(schemaPayload.collection.name, "prospects");
  assert.equal(schemaPayload.collection.builtin, false);
});
