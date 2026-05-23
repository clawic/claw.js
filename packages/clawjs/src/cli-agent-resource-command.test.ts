import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { CLI_EXIT_DEGRADED, CLI_EXIT_OK } from "./cli-errors.ts";
import { runCliCapture } from "./index-test-utils.ts";

function tempStateDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "claw-agent-coordination-"));
}

function payload(text: string): any {
  return JSON.parse(text);
}

test("agent-resource acquires exclusive leases and records conflicts as pending demand", async () => {
  const stateDir = tempStateDir();
  const first = await runCliCapture([
    "agent-resource",
    "acquire",
    "--state-dir",
    stateDir,
    "--resource",
    "computer-use:fixture-app",
    "--mode",
    "exclusive",
    "--intent",
    "intent-one",
    "--agent",
    "agent-one",
    "--json",
  ], process.cwd());
  assert.equal(first.code, CLI_EXIT_OK, first.stderr || first.stdout);
  const firstPayload = payload(first.stdout);
  assert.equal(firstPayload.data.status, "ACQUIRED");
  assert.equal(firstPayload.data.lease.resourceId, "computer-use:fixture-app");
  assert.equal(fs.existsSync(path.join(stateDir, "agent-coordination.sqlite")), true);

  const second = await runCliCapture([
    "agent-resource",
    "acquire",
    "--state-dir",
    stateDir,
    "--resource",
    "computer-use:fixture-app",
    "--mode",
    "read",
    "--intent",
    "intent-two",
    "--agent",
    "agent-two",
    "--json",
  ], process.cwd());
  assert.equal(second.code, CLI_EXIT_DEGRADED, second.stderr || second.stdout);
  const secondPayload = payload(second.stdout);
  assert.equal(secondPayload.data.status, "PENDING");
  assert.equal(secondPayload.data.conflicts.length, 1);
  assert.equal(secondPayload.data.demand.resourceId, "computer-use:fixture-app");
});

test("agent-resource allows concurrent read leases and release clears active status", async () => {
  const stateDir = tempStateDir();
  const first = await runCliCapture([
    "agent-resource",
    "acquire",
    "--state-dir",
    stateDir,
    "--resource",
    "repo:fixture:worktree",
    "--mode",
    "read",
    "--intent",
    "intent-read-one",
    "--json",
  ], process.cwd());
  assert.equal(first.code, CLI_EXIT_OK, first.stderr || first.stdout);

  const second = await runCliCapture([
    "agent-resource",
    "acquire",
    "--state-dir",
    stateDir,
    "--resource",
    "repo:fixture:worktree",
    "--mode",
    "read",
    "--intent",
    "intent-read-two",
    "--json",
  ], process.cwd());
  assert.equal(second.code, CLI_EXIT_OK, second.stderr || second.stdout);

  const firstLeaseId = payload(first.stdout).data.lease.id;
  const release = await runCliCapture([
    "agent-resource",
    "release",
    "--state-dir",
    stateDir,
    "--lease",
    firstLeaseId,
    "--status",
    "passed",
    "--json",
  ], process.cwd());
  assert.equal(release.code, CLI_EXIT_OK, release.stderr || release.stdout);

  const status = await runCliCapture(["agent-resource", "status", "--state-dir", stateDir, "--json"], process.cwd());
  assert.equal(status.code, CLI_EXIT_OK, status.stderr || status.stdout);
  const statusPayload = payload(status.stdout);
  assert.equal(statusPayload.data.activeLeases.length, 1);
  assert.equal(statusPayload.data.recentResults[0].status, "passed");
});

test("claw test require uses the same coordination ledger", async () => {
  const stateDir = tempStateDir();
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "claw-test-repo-"));
  fs.mkdirSync(path.join(repo, "qa"), { recursive: true });
  fs.writeFileSync(path.join(repo, "qa", "agent-coordination.manifest.json"), JSON.stringify({
    checks: [{
      id: "fixture-check",
      lane: "changed",
      command: "node fixture-check.mjs",
      timeoutSeconds: 30,
      costClass: "light",
      realServices: false,
      resources: [{ id: "repo:fixture:worktree", mode: "read" }],
    }],
  }, null, 2));

  const first = await runCliCapture([
    "test",
    "require",
    "--repo",
    repo,
    "--state-dir",
    stateDir,
    "--checks",
    "fixture-check",
    "--intent",
    "test-intent-one",
    "--json",
  ], process.cwd());
  assert.equal(first.code, CLI_EXIT_OK, first.stderr || first.stdout);
  assert.equal(payload(first.stdout).data.status, "ACQUIRED");

  const second = await runCliCapture([
    "test",
    "require",
    "--repo",
    repo,
    "--state-dir",
    stateDir,
    "--checks",
    "fixture-check",
    "--intent",
    "test-intent-two",
    "--json",
  ], process.cwd());
  assert.equal(second.code, CLI_EXIT_DEGRADED, second.stderr || second.stdout);
  assert.equal(payload(second.stdout).data.status, "PENDING");
});

test("claw test run dry-run acquires and releases through the ledger", async () => {
  const stateDir = tempStateDir();
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "claw-test-run-repo-"));
  fs.mkdirSync(path.join(repo, "qa"), { recursive: true });
  fs.writeFileSync(path.join(repo, "qa", "agent-coordination.manifest.json"), JSON.stringify({
    checks: [{
      id: "changed",
      lane: "changed",
      command: "node fixture-check.mjs",
      timeoutSeconds: 30,
      costClass: "light",
      realServices: false,
      resources: [{ id: "repo:fixture:worktree", mode: "read" }],
    }],
  }, null, 2));

  const run = await runCliCapture([
    "test",
    "run",
    "--repo",
    repo,
    "--state-dir",
    stateDir,
    "--lane",
    "changed",
    "--dry-run",
    "true",
    "--json",
  ], process.cwd());
  assert.equal(run.code, CLI_EXIT_OK, run.stderr || run.stdout);
  const runPayload = payload(run.stdout);
  assert.equal(runPayload.data.status, "DRY_RUN");
  assert.equal(runPayload.data.check, "changed");

  const status = await runCliCapture(["agent-resource", "status", "--state-dir", stateDir, "--json"], process.cwd());
  assert.equal(status.code, CLI_EXIT_OK, status.stderr || status.stdout);
  const statusPayload = payload(status.stdout);
  assert.equal(statusPayload.data.activeLeases.length, 0);
  assert.equal(statusPayload.data.recentResults[0].status, "passed");
});

test("claw test plan rejects malformed coordination manifests", async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "claw-test-bad-manifest-"));
  fs.mkdirSync(path.join(repo, "qa"), { recursive: true });
  fs.writeFileSync(path.join(repo, "qa", "agent-coordination.manifest.json"), JSON.stringify({
    checks: [{ id: "changed", lane: "changed", command: "" }],
  }, null, 2));

  const result = await runCliCapture([
    "test",
    "plan",
    "--repo",
    repo,
    "--json",
  ], process.cwd());
  assert.equal(result.code, 64, result.stderr || result.stdout);
  assert.equal(payload(result.stdout).error.code, "malformed_test_manifest");
});
