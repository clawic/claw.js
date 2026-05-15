import { test } from "vitest";
import assert from "node:assert/strict";

import { CLI_EXIT_OK } from "./index.ts";
import { runCliCapture } from "./index-test-utils.ts";

test("signals is a registered public CLI surface", async () => {
  const signalsHelp = await runCliCapture(["signals", "--help"], process.cwd());
  assert.equal(signalsHelp.code, CLI_EXIT_OK);
  assert.match(signalsHelp.stdout, /Usage: claw signals catalog\|seed-catalog\|observe\|list\|delete/);
  assert.match(signalsHelp.stdout, /canonical: Signal catalog/);

  const signalsJsonHelp = await runCliCapture(["signals", "--json"], process.cwd());
  assert.equal(signalsJsonHelp.code, CLI_EXIT_OK);
  assert.equal(JSON.parse(signalsJsonHelp.stdout).data.command, "signals");
});
