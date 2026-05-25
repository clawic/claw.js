import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
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
