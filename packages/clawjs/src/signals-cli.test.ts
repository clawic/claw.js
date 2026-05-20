import { test } from "vitest";
import assert from "node:assert/strict";

import { CLI_EXIT_OK } from "./index.ts";
import { runCliCapture } from "./index-test-utils.ts";

test("signals is a registered public CLI surface", async () => {
  const signalsHelp = await runCliCapture(["signals", "--help"], process.cwd());
  assert.equal(signalsHelp.code, CLI_EXIT_OK);
  assert.match(signalsHelp.stdout, /Usage: claw signals registry\|catalog\|seed-catalog\|observe\|list\|delete/);
  assert.match(signalsHelp.stdout, /canonical: Signal registry/);

  const signalsJsonHelp = await runCliCapture(["signals", "--json"], process.cwd());
  assert.equal(signalsJsonHelp.code, CLI_EXIT_OK);
  assert.equal(JSON.parse(signalsJsonHelp.stdout).data.command, "signals");
});

test("signals and life expose the canonical registry projection without DB state", async () => {
  const signalsRegistry = await runCliCapture(["signals", "registry", "--json"], process.cwd());
  assert.equal(signalsRegistry.code, CLI_EXIT_OK);
  const signalsPayload = JSON.parse(signalsRegistry.stdout).data;

  assert.equal(signalsPayload.projectionVersion, "signals-registry.v1");
  assert.equal(signalsPayload.service.port, 24110);
  assert.equal(signalsPayload.categories.length, 10);
  assert.equal(signalsPayload.entries.length, 80);
  assert.equal(signalsPayload.entries.some((entry: { status: string }) => entry.status === "dev_only"), true);
  assert.equal(JSON.stringify(signalsPayload).includes("servicePort"), false);
  assert.equal(JSON.stringify(signalsPayload).includes("packageName"), false);
  assert.equal(JSON.stringify(signalsPayload).includes("catalogPackage"), false);

  const lifeRegistry = await runCliCapture(["life", "registry", "--json"], process.cwd());
  assert.equal(lifeRegistry.code, CLI_EXIT_OK);
  assert.deepEqual(JSON.parse(lifeRegistry.stdout).data, signalsPayload);
});
