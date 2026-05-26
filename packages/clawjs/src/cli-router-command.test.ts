import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const binPath = fileURLToPath(new URL("../bin/claw.mjs", import.meta.url));

function runClawBin(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [binPath, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test("claw router with no keywords prints router usage and exits with usage code", () => {
  const result = runClawBin(["router"]);
  assert.equal(result.status, 64, result.stdout || result.stderr);
  assert.match(result.stderr, /Usage: claw router <keyword>/);
  assert.match(result.stderr, /several keywords/);
});

test("claw router resolves a single keyword to the dedicated command", () => {
  const result = runClawBin(["router", "task"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Router results for: "task"/);
  assert.match(result.stdout, /1\. tasks/);
  assert.match(result.stdout, /Use this when:/);
  assert.match(result.stdout, /Example: claw tasks/);
  assert.match(result.stdout, /Do not use:/);
});

test("claw router accepts multiple keywords and lists multiple concepts", () => {
  const result = runClawBin(["router", "task", "deadline", "blocker"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /tasks/);
  assert.match(result.stdout, /deadlines/);
  assert.match(result.stdout, /blockers/);
});

test("claw router emits a JSON envelope with --json", () => {
  const result = runClawBin(["router", "task", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout) as {
    ok: boolean;
    data: { queryTerms: string[]; matches: Array<{ primaryCommand: string; antiPattern: string; score: number }> };
    meta: { canonicalCommand: string; mode: string };
  };
  assert.equal(parsed.ok, true);
  assert.equal(parsed.meta.canonicalCommand, "router");
  assert.equal(parsed.meta.mode, "deterministic-keyword-router");
  assert.deepEqual(parsed.data.queryTerms, ["task"]);
  assert.ok(parsed.data.matches.length > 0);
  const top = parsed.data.matches[0]!;
  assert.equal(top.primaryCommand, "tasks");
  assert.ok(top.antiPattern.length > 0);
  assert.ok(top.score > 0);
});

test("claw router resolves Spanish synonyms", () => {
  const result = runClawBin(["router", "tarea", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout) as {
    data: { matches: Array<{ primaryCommand: string }> };
  };
  assert.equal(parsed.data.matches[0]?.primaryCommand, "tasks");
});

test("claw router with no matches returns ok with empty matches and a hint", () => {
  const result = runClawBin(["router", "xyzzy-no-such-thing"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /No concept matched/);
  assert.match(result.stdout, /claw about/);
});

test("claw router rejects invalid --limit values", () => {
  const result = runClawBin(["router", "task", "--limit", "0"]);
  assert.equal(result.status, 64);
  assert.match(result.stderr, /Expected --limit to be a positive decimal integer|--limit must be at most/);
});

test("claw router caps --limit at the documented maximum", () => {
  const result = runClawBin(["router", "task", "--limit", "999"]);
  assert.equal(result.status, 64);
  assert.match(result.stderr, /--limit must be at most/);
});
