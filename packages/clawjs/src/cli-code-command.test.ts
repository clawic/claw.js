import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { CLI_EXIT_OK, CLI_EXIT_USAGE } from "./cli-errors.ts";
import { runCliCapture } from "./index-test-utils.ts";

function payload(text: string): any {
  return JSON.parse(text);
}

async function expectInvalidCodeFlag(args: string[], errorCode: string): Promise<any> {
  const result = await runCliCapture(args, process.cwd());
  assert.equal(result.code, CLI_EXIT_USAGE, result.stderr || result.stdout);
  const resultPayload = payload(result.stdout);
  assert.equal(resultPayload.ok, false);
  assert.equal(resultPayload.error.code, errorCode);
  assert.equal(resultPayload.error.status, "USAGE");
  return resultPayload;
}

test("code serve rejects invalid ports before starting a server", async () => {
  const codeHome = fs.mkdtempSync(path.join(os.tmpdir(), "claw-code-serve-port-"));
  for (const port of ["nope", "1e3", "0x10", "+10", "-1", "10.5", "9007199254740992"]) {
    const resultPayload = await expectInvalidCodeFlag(["code", "serve", "--code-home", codeHome, "--port", port, "--json"], "invalid_code_serve_port");
    assert.equal(resultPayload.meta.canonicalCommand, "code");
    assert.equal(resultPayload.meta.subcommand, "serve");
  }
});

test("code agents list rejects invalid offline thresholds", async () => {
  const codeHome = fs.mkdtempSync(path.join(os.tmpdir(), "claw-code-agents-"));
  const registered = await runCliCapture(["code", "agents", "register", "agent-alpha", "--code-home", codeHome, "--json"], process.cwd());
  assert.equal(registered.code, CLI_EXIT_OK, registered.stderr || registered.stdout);

  for (const threshold of ["nope", "-1", "1e3", "0x10", "+10", "10.5", "9007199254740992"]) {
    await expectInvalidCodeFlag(["code", "agents", "list", "--code-home", codeHome, "--offline-after-ms", threshold, "--json"], "invalid_code_agent_offline_after_ms");
  }
});

test("code projects discover rejects invalid max depth", async () => {
  const codeHome = fs.mkdtempSync(path.join(os.tmpdir(), "claw-code-projects-depth-"));
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "claw-code-projects-workspace-"));

  for (const maxDepth of ["nope", "-1", "1e3", "0x10", "+10", "10.5", "9007199254740992"]) {
    await expectInvalidCodeFlag([
      "code",
      "projects",
      "discover",
      workspace,
      "--code-home",
      codeHome,
      "--max-depth",
      maxDepth,
      "--json",
    ], "invalid_code_project_discover_max_depth");
  }
});

test("code returns JSON usage errors for unknown subcommands without writing state", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-code-unknown-"));
  const codeHome = path.join(tempRoot, "code-home");
  const workspace = path.join(tempRoot, "workspace");
  fs.mkdirSync(workspace);

  const result = await runCliCapture(["code", "definitely_missing", "--code-home", codeHome, "--json"], workspace);
  assert.equal(result.code, CLI_EXIT_USAGE);
  assert.equal(result.stderr, "");
  const resultPayload = payload(result.stdout) as {
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
  assert.equal(resultPayload.ok, false);
  assert.equal(resultPayload.error.code, "unknown_code_subcommand");
  assert.equal(resultPayload.error.status, "USAGE");
  assert.equal(resultPayload.error.location, "cli.code.subcommand");
  assert.equal(resultPayload.error.details.received, "definitely_missing");
  assert.equal(resultPayload.error.details.validSubcommands.includes("status"), true);
  assert.equal(resultPayload.error.details.validSubcommands.includes("projects list"), true);
  assert.match(resultPayload.error.safeNextStep, /claw code status --json/);
  assert.match(resultPayload.error.safeNextStep, /claw help code --json/);
  assert.equal(resultPayload.meta.canonicalCommand, "code");
  assert.equal(resultPayload.meta.subcommand, "definitely_missing");
  assert.equal(fs.existsSync(codeHome), false);
  assert.deepEqual(fs.readdirSync(workspace), []);
});

test("code preserves text usage for unknown subcommands without --json", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "claw-code-text-usage-"));
  const result = await runCliCapture(["code", "definitely_missing"], workspace);
  assert.equal(result.code, CLI_EXIT_USAGE);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^Usage: claw code /);
});
