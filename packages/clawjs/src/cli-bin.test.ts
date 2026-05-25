import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const binPath = fileURLToPath(new URL("../bin/claw.mjs", import.meta.url));
const packageJsonPath = fileURLToPath(new URL("../package.json", import.meta.url));

function runClawBin(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [binPath, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

test("package bin exposes router-backed version and full help", () => {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as { version: string };

  const version = runClawBin(["--version"]);
  assert.equal(version.status, 0, version.stderr);
  assert.equal(version.stdout.trim(), packageJson.version);

  const help = runClawBin(["--help", "--all"]);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Primary commands and portals:/);
  assert.match(help.stdout, /Advanced commands:/);
});

test("package bin keeps help output parseable when json is requested", () => {
  const rootHelp = runClawBin(["help", "--json"]);
  assert.equal(rootHelp.status, 0, rootHelp.stderr);
  const rootPayload = JSON.parse(rootHelp.stdout) as {
    ok: boolean;
    data: { command: string; help: string };
    meta: { canonicalCommand: string; invokedCommand: string };
  };
  assert.equal(rootPayload.ok, true);
  assert.equal(rootPayload.meta.canonicalCommand, "claw");
  assert.equal(rootPayload.meta.invokedCommand, "help");
  assert.equal(rootPayload.data.command, "claw");
  assert.match(rootPayload.data.help, /Usage: claw <command> \[options\]/);

  const commandHelp = runClawBin(["system", "--help", "--json"]);
  assert.equal(commandHelp.status, 0, commandHelp.stderr);
  const commandPayload = JSON.parse(commandHelp.stdout) as {
    ok: boolean;
    data: { command: string; help: string };
    meta: { canonicalCommand: string; invokedCommand: string };
  };
  assert.equal(commandPayload.ok, true);
  assert.equal(commandPayload.meta.canonicalCommand, "system");
  assert.equal(commandPayload.meta.invokedCommand, "system");
  assert.equal(commandPayload.data.command, "system");
  assert.match(commandPayload.data.help, /Usage: claw system /);
});

test("package bin routes help topics through the canonical router", () => {
  const textHelp = runClawBin(["help", "search"]);
  assert.equal(textHelp.status, 0, textHelp.stderr);
  assert.match(textHelp.stdout, /Usage: claw search /);
  assert.doesNotMatch(textHelp.stdout, /Safe base commands:/);

  const jsonHelp = runClawBin(["help", "search", "--json"]);
  assert.equal(jsonHelp.status, 0, jsonHelp.stderr);
  const payload = JSON.parse(jsonHelp.stdout) as {
    ok: boolean;
    data: { command: string; help: string };
    meta: { canonicalCommand: string; invokedCommand: string; subcommand: string };
  };
  assert.equal(payload.ok, true);
  assert.equal(payload.data.command, "search");
  assert.match(payload.data.help, /Usage: claw search /);
  assert.equal(payload.meta.canonicalCommand, "search");
  assert.equal(payload.meta.invokedCommand, "help");
  assert.equal(payload.meta.subcommand, "search");
});

test("package bin delegates inspect and collection discovery to the canonical router", () => {
  const commands = runClawBin(["inspect", "commands", "--json"]);
  assert.equal(commands.status, 0, commands.stderr);
  const commandsPayload = JSON.parse(commands.stdout) as { data: Array<{ value: string }> };
  assert.equal(commandsPayload.data.some((entry) => entry.value === "governance"), true);
  assert.equal(commandsPayload.data.length > 20, true);

  const collections = runClawBin(["collections", "list", "--json"]);
  assert.equal(collections.status, 0, collections.stderr);
  const collectionsPayload = JSON.parse(collections.stdout) as {
    data: { collections: Array<{ name: string; fieldCount: number }> };
    meta: { canonicalCommand: string };
  };
  const tasks = collectionsPayload.data.collections.find((entry) => entry.name === "tasks");
  assert.ok(tasks);
  assert.equal(tasks.fieldCount > 0, true);
  assert.equal(collectionsPayload.meta.canonicalCommand, "database");
});

test("package bin rejects unsupported collection alias actions before database writes", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-bin-collection-alias-"));
  const result = runClawBin(["lead", "merge", "--workspace", workspaceRoot, "--json"]);
  assert.equal(result.status, 64, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout) as {
    ok: boolean;
    error: { code: string; message: string };
    meta: { canonicalCommand: string; invokedCommand: string; collection: string; action: string };
  };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "unsupported_database_action");
  assert.match(payload.error.message, /Supported actions/);
  assert.equal(payload.meta.canonicalCommand, "database");
  assert.equal(payload.meta.invokedCommand, "lead");
  assert.equal(payload.meta.collection, "leads");
  assert.equal(payload.meta.action, "merge");
});
