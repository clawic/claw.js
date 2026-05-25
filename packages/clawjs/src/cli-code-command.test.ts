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

test("code serve rejects invalid ports before starting a server", async () => {
  const codeHome = fs.mkdtempSync(path.join(os.tmpdir(), "claw-code-serve-port-"));
  const result = await runCliCapture(["code", "serve", "--code-home", codeHome, "--port", "nope", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_USAGE, result.stderr || result.stdout);
  const resultPayload = payload(result.stdout);
  assert.equal(resultPayload.ok, false);
  assert.equal(resultPayload.error.code, "invalid_code_serve_port");
  assert.equal(resultPayload.error.status, "USAGE");
  assert.equal(resultPayload.meta.canonicalCommand, "code");
  assert.equal(resultPayload.meta.subcommand, "serve");
});

test("code agents list rejects invalid offline thresholds", async () => {
  const codeHome = fs.mkdtempSync(path.join(os.tmpdir(), "claw-code-agents-"));
  const registered = await runCliCapture(["code", "agents", "register", "agent-alpha", "--code-home", codeHome, "--json"], process.cwd());
  assert.equal(registered.code, CLI_EXIT_OK, registered.stderr || registered.stdout);

  const invalidText = await runCliCapture(["code", "agents", "list", "--code-home", codeHome, "--offline-after-ms", "nope", "--json"], process.cwd());
  assert.equal(invalidText.code, CLI_EXIT_USAGE, invalidText.stderr || invalidText.stdout);
  const invalidTextPayload = payload(invalidText.stdout);
  assert.equal(invalidTextPayload.ok, false);
  assert.equal(invalidTextPayload.error.code, "invalid_code_agent_offline_after_ms");
  assert.equal(invalidTextPayload.error.status, "USAGE");

  const negative = await runCliCapture(["code", "agents", "list", "--code-home", codeHome, "--offline-after-ms", "-1", "--json"], process.cwd());
  assert.equal(negative.code, CLI_EXIT_USAGE, negative.stderr || negative.stdout);
  const negativePayload = payload(negative.stdout);
  assert.equal(negativePayload.ok, false);
  assert.equal(negativePayload.error.code, "invalid_code_agent_offline_after_ms");
});

test("code projects discover rejects invalid max depth", async () => {
  const codeHome = fs.mkdtempSync(path.join(os.tmpdir(), "claw-code-projects-depth-"));
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "claw-code-projects-workspace-"));

  const invalidText = await runCliCapture([
    "code",
    "projects",
    "discover",
    workspace,
    "--code-home",
    codeHome,
    "--max-depth",
    "nope",
    "--json",
  ], process.cwd());
  assert.equal(invalidText.code, CLI_EXIT_USAGE, invalidText.stderr || invalidText.stdout);
  const invalidTextPayload = payload(invalidText.stdout);
  assert.equal(invalidTextPayload.ok, false);
  assert.equal(invalidTextPayload.error.code, "invalid_code_project_discover_max_depth");
  assert.equal(invalidTextPayload.error.status, "USAGE");

  const negative = await runCliCapture([
    "code",
    "projects",
    "discover",
    workspace,
    "--code-home",
    codeHome,
    "--max-depth",
    "-1",
    "--json",
  ], process.cwd());
  assert.equal(negative.code, CLI_EXIT_USAGE, negative.stderr || negative.stdout);
  const negativePayload = payload(negative.stdout);
  assert.equal(negativePayload.error.code, "invalid_code_project_discover_max_depth");
});
