import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { CLI_EXIT_USAGE } from "./cli-errors.ts";
import { runCliCapture, useIsolatedClawDataRoot } from "./index-test-utils.ts";

test("library returns JSON usage errors for unknown subcommands without writing state", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-library-unknown-"));
  const dataRoot = useIsolatedClawDataRoot(t, workspaceRoot);
  const libraryDir = path.join(workspaceRoot, "library-store");

  const result = await runCliCapture([
    "library", "definitely_missing",
    "--workspace", workspaceRoot,
    "--library-dir", libraryDir,
    "--json",
  ], workspaceRoot);

  assert.equal(result.code, CLI_EXIT_USAGE);
  assert.equal(result.stderr, "");
  const payload = JSON.parse(result.stdout) as {
    ok: boolean;
    error: {
      code: string;
      status: string;
      location: string;
      safeNextStep: string;
      details: { received: string; validSubcommands: string[] };
    };
    meta: { canonicalCommand: string; subcommand: string };
  };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "unknown_library_subcommand");
  assert.equal(payload.error.status, "USAGE");
  assert.equal(payload.error.location, "cli.library.subcommand");
  assert.equal(payload.error.details.received, "definitely_missing");
  assert.deepEqual(payload.error.details.validSubcommands, ["list", "inspect", "create", "update", "remove", "import-skill", "assign", "unassign", "resolve", "sync"]);
  assert.match(payload.error.safeNextStep, /claw library list --json/);
  assert.match(payload.error.safeNextStep, /claw help library --json/);
  assert.equal(payload.meta.canonicalCommand, "library");
  assert.equal(payload.meta.subcommand, "definitely_missing");
  assert.equal(fs.existsSync(dataRoot), false);
  assert.equal(fs.existsSync(path.join(workspaceRoot, ".claw")), false);
  assert.equal(fs.existsSync(libraryDir), false);
});

test("library preserves text usage for unknown subcommands", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-library-text-"));
  const libraryDir = path.join(workspaceRoot, "library-store");

  const result = await runCliCapture([
    "library", "definitely_missing",
    "--workspace", workspaceRoot,
    "--library-dir", libraryDir,
  ], workspaceRoot);

  assert.equal(result.code, CLI_EXIT_USAGE);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "Usage: claw library list|inspect|create|update|remove|import-skill|assign|unassign|resolve|sync\n");
});
