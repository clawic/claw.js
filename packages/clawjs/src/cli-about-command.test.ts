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

test("claw about prints the operational-memory framing and capability map", () => {
  const result = runClawBin(["about"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /operational memory CLI for AI agents/);
  assert.match(result.stdout, /Capture/);
  assert.match(result.stdout, /Manage work/);
  assert.match(result.stdout, /Plan time/);
  assert.match(result.stdout, /Remember/);
  assert.match(result.stdout, /Find your way/);
  assert.match(result.stdout, /Database \(fallback\)/);
  assert.match(result.stdout, /Starting a project/);
  assert.match(result.stdout, /claw router/);
  assert.match(result.stdout, /Prefer the dedicated command/);
});

test("claw about --json returns the same content as structured data", () => {
  const result = runClawBin(["about", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout) as {
    ok: boolean;
    data: {
      headline: string;
      purpose: string;
      entryCommands: Array<{ command: string; purpose: string }>;
      capabilityGroups: Array<{ id: string; label: string; oneLiner: string; commands: string[] }>;
      agentTips: string[];
    };
    meta: { canonicalCommand: string };
  };
  assert.equal(parsed.ok, true);
  assert.equal(parsed.meta.canonicalCommand, "about");
  assert.match(parsed.data.headline, /operational memory CLI/);
  assert.ok(parsed.data.entryCommands.some((entry) => entry.command === "router"));
  assert.ok(parsed.data.entryCommands.some((entry) => entry.command === "about"));
  assert.ok(parsed.data.entryCommands.some((entry) => entry.command === "inspect"));
  const captureGroup = parsed.data.capabilityGroups.find((group) => group.id === "capture");
  assert.ok(captureGroup);
  assert.ok(captureGroup.commands.includes("notes"));
  assert.ok(captureGroup.commands.includes("inbox"));
  const workGroup = parsed.data.capabilityGroups.find((group) => group.id === "work");
  assert.ok(workGroup);
  assert.ok(workGroup.commands.includes("tasks"));
  assert.ok(parsed.data.agentTips.length > 0);
});
