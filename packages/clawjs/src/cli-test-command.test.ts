import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { CLI_EXIT_USAGE } from "./cli-errors.ts";
import { runCliCapture } from "./index-test-utils.ts";

function writeCoordinationManifest(repo: string): void {
  fs.mkdirSync(path.join(repo, "qa"), { recursive: true });
  fs.writeFileSync(path.join(repo, "qa", "agent-coordination.manifest.json"), JSON.stringify({
    checks: [{
      id: "changed",
      lane: "changed",
      command: "node -e \"process.exit(0)\"",
      timeoutSeconds: 30,
      costClass: "light",
      resources: [{ id: "repo:fixture:worktree", mode: "read" }],
      realServices: false,
      consumes: [],
      produces: [],
      mutates: [],
      exclusiveResources: [],
      canRunWith: [],
      cannotRunWith: [],
      heartbeatSeconds: 5,
      ttlSeconds: 30,
      cleanup: "release all acquired leases and record only the primary test result",
    }],
  }, null, 2));
}

test("test commands reject checks not declared by a coordination manifest", async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "claw-test-unknown-check-"));
  writeCoordinationManifest(repo);

  for (const args of [
    ["test", "require", "--repo", repo, "--checks", "missing-check", "--json"],
    ["test", "run", "--repo", repo, "--check", "missing-check", "--json"],
  ]) {
    const result = await runCliCapture(args, process.cwd());
    assert.equal(result.code, CLI_EXIT_USAGE, result.stderr || result.stdout);
    assert.equal(result.stderr, "");
    const payload = JSON.parse(result.stdout) as { ok: boolean; error: { code: string; status: string } };
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, "unknown_test_check");
    assert.equal(payload.error.status, "USAGE");
  }
});

test("test plan rejects lanes not declared by a coordination manifest", async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "claw-test-unknown-lane-"));
  writeCoordinationManifest(repo);

  const result = await runCliCapture(["test", "plan", "--repo", repo, "--lane", "definitely_missing_lane", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_USAGE, result.stderr || result.stdout);
  assert.equal(result.stderr, "");
  const payload = JSON.parse(result.stdout) as {
    ok: boolean;
    error: { code: string; status: string; details?: { availableLanes?: string[] } };
  };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "unknown_test_lane");
  assert.equal(payload.error.status, "USAGE");
  assert.deepEqual(payload.error.details?.availableLanes, ["changed"]);
});
