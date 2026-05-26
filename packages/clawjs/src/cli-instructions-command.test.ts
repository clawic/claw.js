import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { runInstructionsCli } from "./cli-instructions-command.ts";

interface CapturedStreams {
  stdout: { write: (chunk: string) => boolean; flushed: string[] };
  stderr: { write: (chunk: string) => boolean; flushed: string[] };
}

function makeStreams(): CapturedStreams {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout: {
      flushed: stdout,
      write(chunk: string) {
        stdout.push(chunk);
        return true;
      },
    },
    stderr: {
      flushed: stderr,
      write(chunk: string) {
        stderr.push(chunk);
        return true;
      },
    },
  };
}

function makeIsolatedEnv(tmp: string): void {
  process.env.CLAW_DB_PATH = path.join(tmp, "core.sqlite");
  process.env.CLAW_FILES_DIR = path.join(tmp, "files");
}

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "claw-instructions-cli-"));
}

async function callCli(positionals: string[], flags: Record<string, string>, wantsJson: boolean) {
  const streams = makeStreams();
  const status = await runInstructionsCli({
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

test("instructions add → list → show → edit → approve → rm round-trip via CLI", async () => {
  const root = tmpRoot();
  const prevDb = process.env.CLAW_DB_PATH;
  const prevFiles = process.env.CLAW_FILES_DIR;
  makeIsolatedEnv(root);
  try {
    const add = await callCli(["instructions", "add"], {
      "target.command": "tasks",
      "target.action": "write",
      trigger: "surface-action",
      activation: "on",
      severity: "warn",
      priority: "80",
      "use-when": "Created via CLI test.",
      "write-policy": "Tasks must be doable in under 10 minutes.",
    }, true);
    assert.equal(add.status, 0, add.stderr);
    const addEnvelope = JSON.parse(add.stdout);
    assert.equal(addEnvelope.ok, true);
    const id = addEnvelope.data.id as string;
    assert.equal(typeof id, "string");
    assert.equal(id.length > 0, true);
    assert.equal(addEnvelope.data.provenance, "user");
    assert.equal(addEnvelope.data.state, "active");

    const list = await callCli(["instructions", "list"], { "target.command": "tasks" }, true);
    assert.equal(list.status, 0, list.stderr);
    const listEnvelope = JSON.parse(list.stdout);
    assert.equal(listEnvelope.data.total >= 1, true);
    assert.equal(listEnvelope.data.items.some((row: { id: string }) => row.id === id), true);

    const show = await callCli(["instructions", "show", id], {}, true);
    const showEnvelope = JSON.parse(show.stdout);
    assert.equal(showEnvelope.data.id, id);
    assert.equal(showEnvelope.data.useWhen, "Created via CLI test.");

    const edit = await callCli(["instructions", "edit", id], { "use-when": "Edited via CLI test." }, true);
    assert.equal(edit.status, 0, edit.stderr);
    const editEnvelope = JSON.parse(edit.stdout);
    assert.equal(editEnvelope.data.useWhen, "Edited via CLI test.");

    const rm = await callCli(["instructions", "rm", id], {}, true);
    assert.equal(rm.status, 0, rm.stderr);
    const rmEnvelope = JSON.parse(rm.stdout);
    assert.equal(rmEnvelope.data.deleted, true);

    const showAfter = await callCli(["instructions", "show", id], {}, true);
    assert.equal(showAfter.status, 1);
    const showAfterEnvelope = JSON.parse(showAfter.stdout);
    assert.equal(showAfterEnvelope.ok, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    if (prevDb === undefined) delete process.env.CLAW_DB_PATH; else process.env.CLAW_DB_PATH = prevDb;
    if (prevFiles === undefined) delete process.env.CLAW_FILES_DIR; else process.env.CLAW_FILES_DIR = prevFiles;
  }
});

test("instructions propose → approve workflow", async () => {
  const root = tmpRoot();
  const prevDb = process.env.CLAW_DB_PATH;
  const prevFiles = process.env.CLAW_FILES_DIR;
  makeIsolatedEnv(root);
  try {
    const propose = await callCli(["instructions", "propose"], {
      "target.command": "notes",
      "target.action": "write",
      trigger: "surface-action",
      severity: "info",
      from: "corr_test_001",
      notes: "Agent observed the user prefers shorter notes.",
    }, true);
    assert.equal(propose.status, 0, propose.stderr);
    const proposed = JSON.parse(propose.stdout);
    assert.equal(proposed.data.state, "proposed");
    assert.equal(proposed.data.provenance, "agent");
    assert.equal(proposed.data.proposedFrom, "corr_test_001");

    const list = await callCli(["instructions", "list"], { state: "proposed" }, true);
    assert.equal(JSON.parse(list.stdout).data.total, 1);

    const approve = await callCli(["instructions", "approve", proposed.data.id], {}, true);
    assert.equal(approve.status, 0, approve.stderr);
    const approved = JSON.parse(approve.stdout);
    assert.equal(approved.data.state, "active");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    if (prevDb === undefined) delete process.env.CLAW_DB_PATH; else process.env.CLAW_DB_PATH = prevDb;
    if (prevFiles === undefined) delete process.env.CLAW_FILES_DIR; else process.env.CLAW_FILES_DIR = prevFiles;
  }
});

test("instructions where merges shipped seeds with overrides", async () => {
  const root = tmpRoot();
  const prevDb = process.env.CLAW_DB_PATH;
  const prevFiles = process.env.CLAW_FILES_DIR;
  makeIsolatedEnv(root);
  try {
    const add = await callCli(["instructions", "add"], {
      "target.command": "tasks",
      "target.action": "write",
      trigger: "surface-action",
      severity: "warn",
      priority: "95",
      "use-when": "Override from CLI test.",
    }, true);
    assert.equal(add.status, 0, add.stderr);

    const where = await callCli(["instructions", "where", "tasks", "write"], {}, true);
    assert.equal(where.status, 0, where.stderr);
    const envelope = JSON.parse(where.stdout);
    assert.equal(envelope.ok, true);
    assert.equal(envelope.data.appliedCount >= 2, true, "override + at least one seed should be applied");
    const sources = envelope.data.rules.map((rule: { source: string | null; id: string }) => rule.source ?? rule.id);
    assert.equal(sources.some((source: string) => typeof source === "string" && source.startsWith("catalog:tasks")), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    if (prevDb === undefined) delete process.env.CLAW_DB_PATH; else process.env.CLAW_DB_PATH = prevDb;
    if (prevFiles === undefined) delete process.env.CLAW_FILES_DIR; else process.env.CLAW_FILES_DIR = prevFiles;
  }
});

test("instructions add rejects body fields exceeding caps", async () => {
  const root = tmpRoot();
  const prevDb = process.env.CLAW_DB_PATH;
  const prevFiles = process.env.CLAW_FILES_DIR;
  makeIsolatedEnv(root);
  try {
    const add = await callCli(["instructions", "add"], {
      "target.command": "tasks",
      "target.action": "write",
      trigger: "surface-action",
      severity: "info",
      "use-when": "x".repeat(300),
    }, true);
    assert.equal(add.status, 64, add.stdout);
    const envelope = JSON.parse(add.stdout);
    assert.equal(envelope.ok, false);
    assert.match(envelope.error.message, /useWhen exceeds cap/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    if (prevDb === undefined) delete process.env.CLAW_DB_PATH; else process.env.CLAW_DB_PATH = prevDb;
    if (prevFiles === undefined) delete process.env.CLAW_FILES_DIR; else process.env.CLAW_FILES_DIR = prevFiles;
  }
});

test("instructions without subcommand prints usage on stderr", async () => {
  const result = await callCli(["instructions"], {}, false);
  assert.equal(result.status, 64);
  assert.match(result.stderr, /Usage: claw instructions <list\|show\|add\|edit\|rm\|approve\|propose\|where>/);
});
