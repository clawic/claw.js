import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { runPromptCli } from "./cli-prompt-command.ts";

function makeStreams() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout: { flushed: stdout, write(chunk: string) { stdout.push(chunk); return true; } },
    stderr: { flushed: stderr, write(chunk: string) { stderr.push(chunk); return true; } },
  };
}

async function callPrompt(positionals: string[], flags: Record<string, string>, wantsJson: boolean) {
  const streams = makeStreams();
  const status = await runPromptCli({
    positionals,
    flags,
    context: {
      stdout: streams.stdout as unknown as NodeJS.WritableStream,
      stderr: streams.stderr as unknown as NodeJS.WritableStream,
      cwd: process.cwd(),
    },
    wantsJson,
    binName: "claw",
  });
  return { status, stdout: streams.stdout.flushed.join(""), stderr: streams.stderr.flushed.join("") };
}

function withIsolatedStore<T>(run: () => Promise<T>): Promise<T> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "claw-prompt-cli-"));
  const prevDb = process.env.CLAW_DB_PATH;
  const prevFiles = process.env.CLAW_FILES_DIR;
  process.env.CLAW_DB_PATH = path.join(tmp, "core.sqlite");
  process.env.CLAW_FILES_DIR = path.join(tmp, "files");
  return run().finally(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
    if (prevDb === undefined) delete process.env.CLAW_DB_PATH; else process.env.CLAW_DB_PATH = prevDb;
    if (prevFiles === undefined) delete process.env.CLAW_FILES_DIR; else process.env.CLAW_FILES_DIR = prevFiles;
  });
}

test("prompt without scope prints usage on stderr", async () => {
  await withIsolatedStore(async () => {
    const result = await callPrompt(["prompt"], {}, false);
    assert.equal(result.status, 64);
    assert.match(result.stderr, /Usage: claw prompt <scope>/);
  });
});

test("prompt session-start emits markdown with the disclaimer and at least one breadcrumb when compact", async () => {
  await withIsolatedStore(async () => {
    const result = await callPrompt(["prompt", "session-start"], { tier: "compact" }, false);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Claw instructions/);
    assert.match(result.stdout, /complement, never override, CONSTITUTION.md and AGENTS.md/);
  });
});

test("prompt for-action tasks write surfaces shipped seed and renders json envelope", async () => {
  await withIsolatedStore(async () => {
    const result = await callPrompt(["prompt", "for-action", "tasks", "write"], { tier: "full" }, true);
    assert.equal(result.status, 0, result.stderr);
    const envelope = JSON.parse(result.stdout);
    assert.equal(envelope.ok, true);
    assert.equal(envelope.data.tier, "full");
    assert.equal(envelope.data.scope, "command=tasks action=write");
    assert.equal(envelope.data.rules.length >= 1, true);
    const sources = envelope.data.rules.map((rule: { source: string }) => rule.source);
    assert.equal(sources.includes("catalog:tasks.write"), true);
  });
});

test("prompt for-collection notes returns shipped seed for notes write", async () => {
  await withIsolatedStore(async () => {
    const result = await callPrompt(["prompt", "for-action", "notes", "write"], { tier: "full" }, true);
    assert.equal(result.status, 0, result.stderr);
    const envelope = JSON.parse(result.stdout);
    const sources = envelope.data.rules.map((rule: { source: string }) => rule.source);
    assert.equal(sources.includes("catalog:notes.write"), true);
  });
});

test("prompt rejects invalid tier", async () => {
  await withIsolatedStore(async () => {
    const result = await callPrompt(["prompt", "session-start"], { tier: "ultra" }, true);
    assert.equal(result.status, 64, result.stdout);
    const envelope = JSON.parse(result.stdout);
    assert.equal(envelope.ok, false);
    assert.match(envelope.error.message, /Unknown --tier/);
  });
});

test("prompt input audio uses input-kind:audio trigger", async () => {
  await withIsolatedStore(async () => {
    const result = await callPrompt(["prompt", "input", "audio"], {}, true);
    assert.equal(result.status, 0, result.stderr);
    const envelope = JSON.parse(result.stdout);
    assert.equal(envelope.data.trigger, "input-kind:audio");
  });
});
