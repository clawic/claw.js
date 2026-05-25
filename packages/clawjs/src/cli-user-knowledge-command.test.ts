import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { CLI_EXIT_USAGE } from "./cli-errors.ts";
import { runCliCapture, useIsolatedClawDataRoot } from "./index-test-utils.ts";

type SoulUsageErrorPayload = {
  ok: false;
  error: {
    code: string;
    status: string;
    location: string;
    safeNextStep: string;
    details: {
      received: string | null;
      validSubcommands: string[];
    };
  };
  meta: {
    canonicalCommand: string;
    invokedCommand: string;
    subcommand: string | null;
  };
};

test("soul unknown subcommands return parseable JSON usage errors without writing state", { concurrency: false }, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-soul-cli-"));
  const cwd = path.join(root, "cwd");
  const workspaceRoot = path.join(root, "workspace");
  fs.mkdirSync(cwd, { recursive: true });
  const dataRoot = useIsolatedClawDataRoot(t, root);

  const result = await runCliCapture(["soul", "definitely_missing", "--workspace", workspaceRoot, "--json"], cwd);

  assert.equal(result.code, CLI_EXIT_USAGE);
  assert.equal(result.stderr, "");
  const payload = JSON.parse(result.stdout) as SoulUsageErrorPayload;
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "unknown_soul_subcommand");
  assert.equal(payload.error.status, "USAGE");
  assert.equal(payload.error.location, "cli.soul.subcommand");
  assert.equal(payload.error.details.received, "definitely_missing");
  assert.deepEqual(payload.error.details.validSubcommands, ["init", "validate", "preview", "compile", "assign", "inspect"]);
  assert.match(payload.error.safeNextStep, /claw soul validate --json/);
  assert.match(payload.error.safeNextStep, /claw help soul --json/);
  assert.equal(payload.meta.canonicalCommand, "soul");
  assert.equal(payload.meta.invokedCommand, "soul");
  assert.equal(payload.meta.subcommand, "definitely_missing");
  assert.equal(fs.existsSync(path.join(workspaceRoot, ".claw")), false);
  assert.equal(fs.existsSync(dataRoot), false);
});

test("soul unknown subcommands keep text usage without json", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-soul-cli-text-"));
  const cwd = path.join(root, "cwd");
  const workspaceRoot = path.join(root, "workspace");
  fs.mkdirSync(cwd, { recursive: true });

  const result = await runCliCapture(["soul", "definitely_missing", "--workspace", workspaceRoot], cwd);

  assert.equal(result.code, CLI_EXIT_USAGE);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "Usage: claw soul init|validate|preview|compile|assign|inspect ...\n");
});
