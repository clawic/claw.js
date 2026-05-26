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

test("package bin root help leads with the operational-memory framing and discovery paths", () => {
  const help = runClawBin(["--help"]);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Usage: claw <command> \[options\]/);
  assert.match(help.stdout, /operational memory CLI for AI agents/);
  assert.match(help.stdout, /claw about\s+what Claw is for/);
  assert.match(help.stdout, /claw router <terms>\s+find the right command/);
  assert.match(help.stdout, /claw --help --all\s+show the full public command surface/);
  assert.match(help.stdout, /claw help <command>\s+show command-specific help/);
  assert.match(help.stdout, /claw inspect commands --json\s+list commands for agents and tools/);
  assert.match(help.stdout, /Common surfaces:/);
  assert.match(help.stdout, /Capture\s+claw inbox/);
  assert.match(help.stdout, /Database\s+claw db/);
  assert.doesNotMatch(help.stdout, /Primary commands and portals:/);
  assert.doesNotMatch(help.stdout, /Advanced commands:/);
});

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

test("claw help tasks is enriched from the keyword router", () => {
  const result = runClawBin(["help", "tasks"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Use this when:/);
  assert.match(result.stdout, /Example:/);
  assert.match(result.stdout, /claw tasks list --status open/);
  assert.match(result.stdout, /Related commands:/);
  assert.match(result.stdout, /claw projects/);
  assert.match(result.stdout, /Do not use:/);
  assert.match(result.stdout, /Find by intent: claw router task/);
});

test("claw help <non-productivity> stays in the minimal format", () => {
  const result = runClawBin(["help", "host"]);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /Use this when:/);
  assert.doesNotMatch(result.stdout, /Find by intent:/);
  assert.match(result.stdout, /Support:/);
});

test("claw db <productivity-collection> prints the dedicated-command advisory on stderr", () => {
  const result = runClawBin(["db", "tasks", "schema", "--json"]);
  assert.doesNotMatch(result.stderr, /dedicated command/);
  const human = runClawBin(["db", "tasks", "schema"]);
  assert.match(human.stderr, /`claw tasks` is the dedicated command for `tasks`/);
  assert.match(human.stderr, /claw router tasks/);
});

test("unknown command surfaces router suggestions in JSON and human output", () => {
  const jsonResult = runClawBin(["totally-not-a-claw-command-xyz", "--json"]);
  const jsonPayload = JSON.parse(jsonResult.stdout) as {
    ok: boolean;
    meta: { routerSuggestions: Array<{ primaryCommand: string }> };
  };
  assert.equal(jsonPayload.ok, false);
  assert.ok(Array.isArray(jsonPayload.meta.routerSuggestions));

  const humanResult = runClawBin(["tarea-inexistente-xyz"]);
  assert.match(humanResult.stderr, /Router suggests for "tarea-inexistente-xyz"/);
  assert.match(humanResult.stderr, /claw tasks/);
  assert.match(humanResult.stderr, /See: claw router tarea-inexistente-xyz/);
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

test("package bin rejects unknown help topics instead of returning root help", () => {
  const jsonHelp = runClawBin(["help", "definitely_missing", "--json"]);
  assert.equal(jsonHelp.status, 64, jsonHelp.stderr || jsonHelp.stdout);
  const payload = JSON.parse(jsonHelp.stdout) as {
    ok: boolean;
    error: { code: string; safeNextStep: string; details?: { related?: unknown[] } };
    meta: { invokedCommand: string; subcommand: string };
  };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "unknown_help_topic");
  assert.match(payload.error.safeNextStep, /claw search "definitely_missing" --json/);
  assert.equal(Array.isArray(payload.error.details?.related), true);
  assert.equal(payload.meta.invokedCommand, "help");
  assert.equal(payload.meta.subcommand, "definitely_missing");

  const textHelp = runClawBin(["help", "definitely_missing"]);
  assert.equal(textHelp.status, 64, textHelp.stderr || textHelp.stdout);
  assert.equal(textHelp.stdout, "");
  assert.match(textHelp.stderr, /No help topic found for definitely_missing/);
  assert.doesNotMatch(textHelp.stderr, /Primary commands and portals:/);
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
