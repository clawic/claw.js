import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE } from "./index.ts";
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

test("db list reports missing custom collections instead of returning an empty success", { concurrency: false }, async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-db-custom-list-missing-"));
  useIsolatedClawDataRoot(t, workspaceRoot);

  const result = await runCliCapture([
    "db",
    "prospects",
    "list",
    "--workspace",
    workspaceRoot,
    "--json",
  ], process.cwd());

  assert.equal(result.code, CLI_EXIT_FAILURE);
  const payload = JSON.parse(result.stdout) as { ok: boolean; error: { code: string; message: string } };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "not_found");
  assert.match(payload.error.message, /Collection prospects does not exist/);
  assert.match(payload.error.message, /database collection create/);
});

test("database aliases reject unknown actions after a collection before writing records", { concurrency: false }, async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-db-alias-unknown-action-"));
  useIsolatedClawDataRoot(t, workspaceRoot);

  for (const alias of ["collections", "records"]) {
    const result = await runCliCapture([
      alias,
      "tasks",
      "definitely_missing",
      "--workspace",
      workspaceRoot,
      "--json",
    ], process.cwd());

    assert.equal(result.code, CLI_EXIT_USAGE);
    const payload = JSON.parse(result.stdout) as {
      ok: boolean;
      error: {
        code: string;
        status: string;
        safeNextStep: string;
        details: { received: string; supportedActions: string[] };
      };
      meta: { invokedCommand: string; collection: string; action: string };
    };
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, "unsupported_database_action");
    assert.equal(payload.error.status, "USAGE");
    assert.equal(payload.error.details.received, "definitely_missing");
    assert.equal(payload.error.details.supportedActions.includes("create"), true);
    assert.match(payload.error.safeNextStep, /records tasks list/);
    assert.equal(payload.meta.invokedCommand, alias);
    assert.equal(payload.meta.collection, "tasks");
    assert.equal(payload.meta.action, "definitely_missing");
  }

  const list = await runCliCapture([
    "db",
    "tasks",
    "list",
    "--workspace",
    workspaceRoot,
    "--json",
  ], process.cwd());
  assert.equal(list.code, CLI_EXIT_OK);
  const records = parseCliJsonPayload<Array<{ title?: string }>>(list.stdout);
  assert.equal(records.some((record) => record.title === "definitely_missing"), false);
});
