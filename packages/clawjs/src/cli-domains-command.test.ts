import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { CLI_EXIT_USAGE } from "./cli-errors.ts";
import { runCliCapture, useIsolatedClawDataRoot } from "./index-test-utils.ts";

test("domains returns JSON usage errors for unknown subcommands without writing state", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-domains-unknown-"));
  const dataRoot = useIsolatedClawDataRoot(t, workspaceRoot);
  const stateRoot = path.join(workspaceRoot, "domains-state");
  const hostsFile = path.join(stateRoot, "hosts");
  const plistFile = path.join(stateRoot, "claw-domains.plist");
  const serviceDir = path.join(stateRoot, "service");

  const result = await runCliCapture([
    "domains", "definitely_missing",
    "--hosts-file", hostsFile,
    "--plist-file", plistFile,
    "--service-dir", serviceDir,
    "--workspace", workspaceRoot,
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
    meta: { canonicalCommand: string; invokedCommand: string; subcommand: string };
  };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "unknown_domains_subcommand");
  assert.equal(payload.error.status, "USAGE");
  assert.equal(payload.error.location, "cli.domains.subcommand");
  assert.equal(payload.error.details.received, "definitely_missing");
  assert.deepEqual(payload.error.details.validSubcommands, ["install", "status", "uninstall", "serve"]);
  assert.match(payload.error.safeNextStep, /claw domains status --json/);
  assert.match(payload.error.safeNextStep, /claw help domains --json/);
  assert.equal(payload.meta.canonicalCommand, "host");
  assert.equal(payload.meta.invokedCommand, "domains");
  assert.equal(payload.meta.subcommand, "definitely_missing");
  assert.equal(fs.existsSync(dataRoot), false);
  assert.equal(fs.existsSync(path.join(workspaceRoot, ".claw")), false);
  assert.equal(fs.existsSync(stateRoot), false);
});

test("domains preserves text usage for unknown subcommands", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-domains-text-"));

  const result = await runCliCapture(["domains", "definitely_missing"], workspaceRoot);

  assert.equal(result.code, CLI_EXIT_USAGE);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "Usage: claw domains install|status|uninstall|serve\n");
});
