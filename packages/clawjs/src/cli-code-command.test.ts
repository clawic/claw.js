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
