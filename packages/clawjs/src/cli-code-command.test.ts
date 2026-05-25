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
