import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { runInstructionsCli } from "./cli-instructions-command.ts";
import {
  CLI_EXIT_INSTRUCTION_BLOCK,
  buildInstructionsPreamble,
  resolveInstructionsMode,
} from "./cli-instructions-runtime.ts";

function withIsolatedStore<T>(run: () => Promise<T> | T): Promise<T> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "claw-instr-runtime-"));
  const prevDb = process.env.CLAW_DB_PATH;
  const prevFiles = process.env.CLAW_FILES_DIR;
  process.env.CLAW_DB_PATH = path.join(tmp, "core.sqlite");
  process.env.CLAW_FILES_DIR = path.join(tmp, "files");
  return Promise.resolve(run()).finally(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
    if (prevDb === undefined) delete process.env.CLAW_DB_PATH; else process.env.CLAW_DB_PATH = prevDb;
    if (prevFiles === undefined) delete process.env.CLAW_FILES_DIR; else process.env.CLAW_FILES_DIR = prevFiles;
  });
}

function makeStreams() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout: { flushed: stdout, write(chunk: string) { stdout.push(chunk); return true; } },
    stderr: { flushed: stderr, write(chunk: string) { stderr.push(chunk); return true; } },
  };
}

async function addStrictBlock(): Promise<void> {
  const streams = makeStreams();
  await runInstructionsCli({
    positionals: ["instructions", "add"],
    flags: {
      "target.command": "tasks",
      "target.action": "write",
      trigger: "surface-action",
      activation: "on",
      severity: "block",
      priority: "95",
      "use-when": "Test block rule.",
      forbid: "Never bypass.",
    },
    context: {
      stdout: streams.stdout as unknown as NodeJS.WritableStream,
      stderr: streams.stderr as unknown as NodeJS.WritableStream,
      cwd: process.cwd(),
    },
    wantsJson: true,
    binName: "claw",
  });
}

test("resolveInstructionsMode defaults to preamble", () => {
  assert.equal(resolveInstructionsMode({}), "preamble");
  assert.equal(resolveInstructionsMode({ CLAW_INSTRUCTIONS: "off" }), "off");
  assert.equal(resolveInstructionsMode({ CLAW_INSTRUCTIONS: "strict" }), "strict");
  assert.equal(resolveInstructionsMode({ CLAW_INSTRUCTIONS: "junk" }), "preamble");
  assert.equal(resolveInstructionsMode({}, "off"), "off");
});

test("preamble in off mode is empty", async () => {
  await withIsolatedStore(async () => {
    const result = buildInstructionsPreamble({
      target: { command: "tasks", action: "write" },
      binName: "claw",
      mode: "off",
    });
    assert.equal(result.mode, "off");
    assert.equal(result.preamble, "");
    assert.equal(result.rules.length, 0);
  });
});

test("preamble in preamble mode lists rules from shipped seeds", async () => {
  await withIsolatedStore(async () => {
    const result = buildInstructionsPreamble({
      target: { command: "tasks", action: "write" },
      binName: "claw",
      mode: "preamble",
    });
    assert.equal(result.mode, "preamble");
    assert.equal(result.rules.length >= 1, true);
    assert.match(result.preamble, /^--- instructions \(claw prompt for-action tasks write\)/);
    assert.match(result.preamble, /catalog:tasks/);
  });
});

test("preamble in strict mode returns CLI_EXIT_INSTRUCTION_BLOCK when a block rule applies", async () => {
  await withIsolatedStore(async () => {
    await addStrictBlock();
    const result = buildInstructionsPreamble({
      target: { command: "tasks", action: "write" },
      binName: "claw",
      mode: "strict",
    });
    assert.equal(result.blocked.length >= 1, true);
    assert.equal(result.exitCode, CLI_EXIT_INSTRUCTION_BLOCK);
  });
});

test("strict mode with no block rule has no exitCode override", async () => {
  await withIsolatedStore(async () => {
    const result = buildInstructionsPreamble({
      target: { command: "agenda", action: "read" },
      binName: "claw",
      mode: "strict",
    });
    assert.equal(result.exitCode, undefined);
  });
});
