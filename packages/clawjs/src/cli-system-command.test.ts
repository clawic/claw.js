import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { CLI_EXIT_USAGE } from "./cli-errors.ts";
import { runCliCapture } from "./index-test-utils.ts";

test("system returns a JSON usage error for unknown subcommands without writing state", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-system-unknown-workspace-"));
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-system-unknown-data-"));
  const previousDataDir = process.env.CLAW_DATA_DIR;
  process.env.CLAW_DATA_DIR = dataRoot;
  t.onTestFinished(() => {
    if (previousDataDir === undefined) delete process.env.CLAW_DATA_DIR;
    else process.env.CLAW_DATA_DIR = previousDataDir;
  });

  const result = await runCliCapture(["system", "definitely_missing", "--workspace", workspaceRoot, "--json"], workspaceRoot);

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
    meta: { canonicalCommand: string; invokedCommand: string; subcommand: string };
  };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "unknown_system_subcommand");
  assert.equal(payload.error.status, "USAGE");
  assert.equal(payload.error.location, "cli.system.subcommand");
  assert.equal(payload.error.details.received, "definitely_missing");
  assert.deepEqual(payload.error.details.validSubcommands, [
    "snapshot",
    "metrics",
    "history",
    "watch",
    "rules",
    "widgets",
    "providers",
    "controls",
    "capabilities",
  ]);
  assert.match(payload.error.safeNextStep, /claw help system --json/);
  assert.equal(payload.meta.canonicalCommand, "system");
  assert.equal(payload.meta.invokedCommand, "system");
  assert.equal(payload.meta.subcommand, "definitely_missing");
  assert.equal(fs.existsSync(path.join(workspaceRoot, ".claw")), false);
  assert.deepEqual(fs.readdirSync(dataRoot), []);
});

test("system preserves text behavior for unknown subcommands", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-system-unknown-text-"));

  const result = await runCliCapture(["system", "definitely_missing", "--workspace", workspaceRoot], workspaceRoot);

  assert.equal(result.code, CLI_EXIT_USAGE);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});
