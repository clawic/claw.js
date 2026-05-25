import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

import { CLI_EXIT_DEGRADED, CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE } from "./cli-errors.ts";
import { runCliCapture } from "./index-test-utils.ts";
import { openAgentCoordinationStore, resolveAgentCoordinationPaths } from "./agent-coordination-store.ts";

function tempStateDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "claw-agent-coordination-"));
}

function payload(text: string): any {
  return JSON.parse(text);
}

function fixtureCheck(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const id = typeof overrides.id === "string" ? overrides.id : "changed";
  const lane = typeof overrides.lane === "string" ? overrides.lane : "changed";
  return {
    id,
    lane,
    command: "node fixture-check.mjs",
    timeoutSeconds: 30,
    costClass: "light",
    realServices: false,
    pathPatterns: ["**/*"],
    fingerprintInputs: ["**/*"],
    consumes: ["repo:fixture:worktree"],
    produces: [`test-result:fixture:${id}`],
    mutates: [],
    exclusiveResources: [],
    canRunWith: [],
    cannotRunWith: [],
    heartbeatSeconds: 5,
    ttlSeconds: 30,
    cleanup: "release all acquired leases and record only the primary test result",
    ownerObligations: ["record pending demand instead of rerunning busy work"],
    resources: [{ id: "repo:fixture:worktree", mode: "read" }],
    ...overrides,
  };
}

test("agent-resource status is read-only when coordination state is absent", async () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "claw-agent-coordination-empty-parent-"));
  const stateDir = path.join(parent, "missing-state");
  const result = await runCliCapture(["agent-resource", "status", "--state-dir", stateDir, "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK, result.stderr || result.stdout);
  const resultPayload = payload(result.stdout);
  assert.equal(resultPayload.data.activeLeases.length, 0);
  assert.equal(resultPayload.data.pendingDemands.length, 0);
  assert.equal(resultPayload.data.recentResults.length, 0);
  assert.equal(fs.existsSync(stateDir), false);
});

test("agent-resource status uses snapshot indexes for global coordination lists", async () => {
  const stateDir = tempStateDir();
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-agent-coordination-run-"));
  await openAgentCoordinationStore(resolveAgentCoordinationPaths({ stateDir, runDir }));

  const sqlite = new Database(path.join(stateDir, "agent-coordination.sqlite"), { readonly: true });
  const activeLeasePlan = sqlite
    .prepare(`
      EXPLAIN QUERY PLAN
      SELECT * FROM resource_leases
      WHERE status IN ('running', 'repairing', 'blocked', 'releasing')
      ORDER BY started_at ASC
    `)
    .all() as Array<{ detail: string }>;
  assert.equal(activeLeasePlan.some((row) => row.detail.includes("resource_leases_active_started_idx")), true);
  assert.equal(activeLeasePlan.some((row) => row.detail.includes("USE TEMP B-TREE")), false);

  const pendingDemandPlan = sqlite
    .prepare(`
      EXPLAIN QUERY PLAN
      SELECT * FROM resource_demands
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT 100
    `)
    .all() as Array<{ detail: string }>;
  assert.equal(pendingDemandPlan.some((row) => row.detail.includes("resource_demands_pending_created_idx")), true);
  assert.equal(pendingDemandPlan.some((row) => row.detail.includes("USE TEMP B-TREE")), false);

  const recentResultsPlan = sqlite
    .prepare(`
      EXPLAIN QUERY PLAN
      SELECT * FROM work_results
      ORDER BY finished_at DESC
      LIMIT 50
    `)
    .all() as Array<{ detail: string }>;
  sqlite.close();
  assert.equal(recentResultsPlan.some((row) => row.detail.includes("work_results_finished_idx")), true);
  assert.equal(recentResultsPlan.some((row) => row.detail.includes("USE TEMP B-TREE")), false);
});

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

test("agent-resource malformed input returns an actionable JSON error", async () => {
  const stateDir = tempStateDir();
  const result = await runCliCapture([
    "agent-resource",
    "acquire",
    "--state-dir",
    stateDir,
    "--resource",
    "fixture:bad-mode",
    "--mode",
    "shared",
    "--intent",
    "bad-mode-intent",
    "--json",
  ], process.cwd());
  assert.equal(result.code, CLI_EXIT_USAGE, result.stderr || result.stdout);
  const resultPayload = payload(result.stdout);
  assert.equal(resultPayload.ok, false);
  assert.equal(resultPayload.error.code, "invalid_agent_resource_mode");
  assert.match(resultPayload.error.message, /Invalid resource lease mode/);
  assert.equal(fs.existsSync(path.join(stateDir, "agent-coordination.sqlite")), false);
});

test("agent-resource rejects non-decimal TTL and PID values before opening coordination state", async () => {
  const cases = [
    { flag: "ttl", value: "NaN", code: "invalid_agent_resource_ttl" },
    { flag: "ttl", value: "1.5", code: "invalid_agent_resource_ttl" },
    { flag: "ttl", value: "0", code: "invalid_agent_resource_ttl" },
    { flag: "ttl", value: "1e3", code: "invalid_agent_resource_ttl" },
    { flag: "ttl", value: "0x10", code: "invalid_agent_resource_ttl" },
    { flag: "pid", value: "NaN", code: "invalid_agent_resource_pid" },
    { flag: "pid", value: "1.0", code: "invalid_agent_resource_pid" },
    { flag: "pid", value: "0", code: "invalid_agent_resource_pid" },
    { flag: "pid", value: "1e3", code: "invalid_agent_resource_pid" },
    { flag: "pid", value: "0x10", code: "invalid_agent_resource_pid" },
  ];

  for (const testCase of cases) {
    const stateDir = tempStateDir();
    const args = [
      "agent-resource",
      "acquire",
      "--state-dir",
      stateDir,
      "--resource",
      `fixture:${testCase.flag}-${testCase.value}`,
      "--mode",
      "exclusive",
      "--intent",
      `invalid-${testCase.flag}-intent`,
      `--${testCase.flag}`,
      testCase.value,
      "--json",
    ];

    const result = await runCliCapture(args, process.cwd());
    assert.equal(result.code, CLI_EXIT_USAGE, result.stderr || result.stdout);
    const resultPayload = payload(result.stdout);
    assert.equal(resultPayload.ok, false);
    assert.equal(resultPayload.error.code, testCase.code);
    assert.equal(resultPayload.error.status, "USAGE");
    assert.equal(fs.existsSync(path.join(stateDir, "agent-coordination.sqlite")), false);
  }
});

test("agent-resource rejects blank resource ids before writing ledger rows", async () => {
  const stateDir = tempStateDir();
  const result = await runCliCapture([
    "agent-resource",
    "acquire",
    "--state-dir",
    stateDir,
    "--resource",
    "   ",
    "--mode",
    "exclusive",
    "--intent",
    "blank-resource-intent",
    "--json",
  ], process.cwd());
  assert.equal(result.code, CLI_EXIT_USAGE, result.stderr || result.stdout);
  const resultPayload = payload(result.stdout);
  assert.equal(resultPayload.ok, false);
  assert.equal(resultPayload.error.code, "missing_agent_resource_flag");
  assert.equal(resultPayload.error.status, "USAGE");
  assert.equal(fs.existsSync(path.join(stateDir, "agent-coordination.sqlite")), false);
});

test("coordination store rejects blank resource ids for programmatic callers", async () => {
  const stateDir = tempStateDir();
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-agent-coordination-run-"));
  const store = await openAgentCoordinationStore(resolveAgentCoordinationPaths({ stateDir, runDir }));

  assert.throws(() => store.acquire({
    resourceId: "   ",
    mode: "exclusive",
    intentId: "programmatic-blank-resource",
  }), /Invalid resource id/);

  const sqlite = new Database(path.join(stateDir, "agent-coordination.sqlite"), { readonly: true });
  const leaseCount = sqlite.prepare("SELECT count(*) AS count FROM resource_leases").get() as { count: number };
  sqlite.close();
  assert.equal(leaseCount.count, 0);
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

test("agent-resource heartbeat cannot revive a released lease", async () => {
  const stateDir = tempStateDir();
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-agent-coordination-run-"));
  const acquired = await runCliCapture([
    "agent-resource",
    "acquire",
    "--state-dir",
    stateDir,
    "--run-dir",
    runDir,
    "--resource",
    "fixture:terminal-lease",
    "--mode",
    "exclusive",
    "--intent",
    "terminal-intent",
    "--json",
  ], process.cwd());
  assert.equal(acquired.code, CLI_EXIT_OK, acquired.stderr || acquired.stdout);
  const leaseId = payload(acquired.stdout).data.lease.id;

  const release = await runCliCapture([
    "agent-resource",
    "release",
    "--state-dir",
    stateDir,
    "--run-dir",
    runDir,
    "--lease",
    leaseId,
    "--status",
    "passed",
    "--json",
  ], process.cwd());
  assert.equal(release.code, CLI_EXIT_OK, release.stderr || release.stdout);
  assert.equal(fs.existsSync(path.join(runDir, `${leaseId}.heartbeat.json`)), false);

  const heartbeat = await runCliCapture([
    "agent-resource",
    "heartbeat",
    "--state-dir",
    stateDir,
    "--run-dir",
    runDir,
    "--lease",
    leaseId,
    "--status",
    "running",
    "--json",
  ], process.cwd());
  assert.equal(heartbeat.code, CLI_EXIT_FAILURE);
  assert.equal(payload(heartbeat.stdout).error.code, "lease_not_found");

  const status = await runCliCapture(["agent-resource", "status", "--state-dir", stateDir, "--run-dir", runDir, "--json"], process.cwd());
  assert.equal(status.code, CLI_EXIT_OK, status.stderr || status.stdout);
  assert.equal(payload(status.stdout).data.activeLeases.length, 0);

  const sqlite = new Database(path.join(stateDir, "agent-coordination.sqlite"), { readonly: true });
  const row = sqlite.prepare("SELECT status FROM resource_leases WHERE id = ?").get(leaseId) as { status: string };
  sqlite.close();
  assert.equal(row.status, "released");
  assert.equal(fs.existsSync(path.join(runDir, `${leaseId}.heartbeat.json`)), false);
});

test("agent-resource heartbeats, waitlists, and reaps only stale leases", async () => {
  const stateDir = tempStateDir();
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-agent-coordination-run-"));
  const live = await runCliCapture([
    "agent-resource",
    "acquire",
    "--state-dir",
    stateDir,
    "--run-dir",
    runDir,
    "--resource",
    "fixture:live",
    "--mode",
    "exclusive",
    "--intent",
    "live-intent",
    "--ttl",
    "60",
    "--json",
  ], process.cwd());
  assert.equal(live.code, CLI_EXIT_OK, live.stderr || live.stdout);
  const liveLeaseId = payload(live.stdout).data.lease.id;

  const heartbeat = await runCliCapture([
    "agent-resource",
    "heartbeat",
    "--state-dir",
    stateDir,
    "--run-dir",
    runDir,
    "--lease",
    liveLeaseId,
    "--status",
    "blocked",
    "--ttl",
    "60",
    "--json",
  ], process.cwd());
  assert.equal(heartbeat.code, CLI_EXIT_OK, heartbeat.stderr || heartbeat.stdout);
  assert.equal(payload(heartbeat.stdout).data.lease.status, "blocked");
  assert.equal(fs.existsSync(path.join(runDir, `${liveLeaseId}.heartbeat.json`)), true);

  const waitlist = await runCliCapture([
    "agent-resource",
    "waitlist",
    "--state-dir",
    stateDir,
    "--run-dir",
    runDir,
    "--resource",
    "fixture:live",
    "--intent",
    "waiting-intent",
    "--json",
  ], process.cwd());
  assert.equal(waitlist.code, CLI_EXIT_DEGRADED, waitlist.stderr || waitlist.stdout);
  assert.equal(payload(waitlist.stdout).data.status, "PENDING");

  const activeReap = await runCliCapture(["agent-resource", "reap", "--state-dir", stateDir, "--run-dir", runDir, "--json"], process.cwd());
  assert.equal(activeReap.code, CLI_EXIT_OK, activeReap.stderr || activeReap.stdout);
  assert.equal(payload(activeReap.stdout).data.reaped.length, 0);

  const stale = await runCliCapture([
    "agent-resource",
    "acquire",
    "--state-dir",
    stateDir,
    "--run-dir",
    runDir,
    "--resource",
    "fixture:stale",
    "--mode",
    "exclusive",
    "--intent",
    "stale-intent",
    "--pid",
    "999999999",
    "--ttl",
    "60",
    "--json",
  ], process.cwd());
  assert.equal(stale.code, CLI_EXIT_OK, stale.stderr || stale.stdout);
  const staleLeaseId = payload(stale.stdout).data.lease.id;

  const staleReap = await runCliCapture(["agent-resource", "reap", "--state-dir", stateDir, "--run-dir", runDir, "--json"], process.cwd());
  assert.equal(staleReap.code, CLI_EXIT_OK, staleReap.stderr || staleReap.stdout);
  const reaped = payload(staleReap.stdout).data.reaped;
  assert.equal(reaped.length, 1);
  assert.equal(reaped[0].id, staleLeaseId);
  assert.equal(fs.existsSync(path.join(runDir, `${staleLeaseId}.heartbeat.json`)), false);

  const status = await runCliCapture(["agent-resource", "status", "--state-dir", stateDir, "--run-dir", runDir, "--json"], process.cwd());
  const statusPayload = payload(status.stdout);
  assert.equal(statusPayload.data.activeLeases.length, 1);
  assert.equal(statusPayload.data.activeLeases[0].id, liveLeaseId);
  assert.equal(statusPayload.data.pendingDemands[0].resourceId, "fixture:live");

  const releaseLive = await runCliCapture([
    "agent-resource",
    "release",
    "--state-dir",
    stateDir,
    "--run-dir",
    runDir,
    "--lease",
    liveLeaseId,
    "--status",
    "passed",
    "--no-result",
    "true",
    "--json",
  ], process.cwd());
  assert.equal(releaseLive.code, CLI_EXIT_OK, releaseLive.stderr || releaseLive.stdout);
  assert.equal(fs.existsSync(path.join(runDir, `${liveLeaseId}.heartbeat.json`)), false);

  const sqlite = new Database(path.join(stateDir, "agent-coordination.sqlite"), { readonly: true });
  const satisfiedDemand = sqlite.prepare("SELECT status FROM resource_demands WHERE resource_id = ?").get("fixture:live") as { status: string };
  assert.equal(satisfiedDemand.status, "satisfied");
  const eventTypes = sqlite.prepare("SELECT event_type FROM coordination_audit ORDER BY created_at").all().map((row: any) => row.event_type);
  sqlite.close();
  assert.ok(eventTypes.includes("resource.heartbeat"));
  assert.ok(eventTypes.includes("resource.waitlisted"));
  assert.ok(eventTypes.includes("resource.demands_satisfied"));
  assert.ok(eventTypes.includes("resource.reaped"));
});

test("agent-resource rejects invalid heartbeat statuses as usage", async () => {
  const stateDir = tempStateDir();
  const acquired = await runCliCapture([
    "agent-resource",
    "acquire",
    "--state-dir",
    stateDir,
    "--resource",
    "fixture:heartbeat-status",
    "--mode",
    "exclusive",
    "--intent",
    "heartbeat-status-intent",
    "--json",
  ], process.cwd());
  assert.equal(acquired.code, CLI_EXIT_OK, acquired.stderr || acquired.stdout);
  const leaseId = payload(acquired.stdout).data.lease.id;

  const invalid = await runCliCapture([
    "agent-resource",
    "heartbeat",
    "--state-dir",
    stateDir,
    "--lease",
    leaseId,
    "--status",
    "waiting",
    "--json",
  ], process.cwd());
  assert.equal(invalid.code, CLI_EXIT_USAGE);
  const invalidPayload = payload(invalid.stdout);
  assert.equal(invalidPayload.ok, false);
  assert.equal(invalidPayload.error.code, "invalid_agent_resource_heartbeat_status");
  assert.equal(invalidPayload.error.status, "USAGE");

  const sqlite = new Database(path.join(stateDir, "agent-coordination.sqlite"), { readonly: true });
  const row = sqlite.prepare("SELECT status FROM resource_leases WHERE id = ?").get(leaseId) as { status: string };
  sqlite.close();
  assert.equal(row.status, "running");
});

test("claw test require uses the same coordination ledger", async () => {
  const stateDir = tempStateDir();
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "claw-test-repo-"));
  fs.mkdirSync(path.join(repo, "qa"), { recursive: true });
  fs.writeFileSync(path.join(repo, "qa", "agent-coordination.manifest.json"), JSON.stringify({
    checks: [fixtureCheck({ id: "fixture-check" })],
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

test("claw test require deduplicates duplicate same-fingerprint requests", async () => {
  const stateDir = tempStateDir();
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "claw-test-dedupe-repo-"));
  fs.mkdirSync(path.join(repo, "qa"), { recursive: true });
  fs.writeFileSync(path.join(repo, "qa", "agent-coordination.manifest.json"), JSON.stringify({
    checks: [fixtureCheck({ id: "fixture-check" })],
  }, null, 2));

  const result = await runCliCapture([
    "test",
    "require",
    "--repo",
    repo,
    "--state-dir",
    stateDir,
    "--checks",
    "fixture-check,fixture-check",
    "--intent",
    "dedupe-intent",
    "--fingerprint",
    "same-fingerprint",
    "--json",
  ], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK, result.stderr || result.stdout);
  const resultPayload = payload(result.stdout);
  assert.equal(resultPayload.data.status, "ACQUIRED");
  assert.equal(resultPayload.data.checks.length, 2);
  assert.equal(resultPayload.data.checks[0].deduplicated, false);
  assert.equal(resultPayload.data.checks[1].deduplicated, true);
  assert.equal(resultPayload.data.checks[1].leases[0].id, resultPayload.data.checks[0].leases[0].id);

  const status = await runCliCapture(["agent-resource", "status", "--state-dir", stateDir, "--json"], process.cwd());
  const statusPayload = payload(status.stdout);
  assert.equal(statusPayload.data.activeLeases.length, 2);
  assert.equal(statusPayload.data.pendingDemands.length, 0);
});

test("claw test require atomically acquires manifest-declared resources", async () => {
  const stateDir = tempStateDir();
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "claw-test-resource-repo-"));
  fs.mkdirSync(path.join(repo, "qa"), { recursive: true });
  fs.writeFileSync(path.join(repo, "qa", "agent-coordination.manifest.json"), JSON.stringify({
    checks: [fixtureCheck({
      costClass: "heavy",
      consumes: ["repo:fixture:worktree", "fixture-db:shared"],
      mutates: ["fixture-db:shared"],
      exclusiveResources: ["fixture-db:shared"],
      resources: [
        { id: "repo:fixture:worktree", mode: "read" },
        { id: "fixture-db:shared", mode: "exclusive" },
      ],
    })],
  }, null, 2));

  const blocker = await runCliCapture([
    "agent-resource",
    "acquire",
    "--state-dir",
    stateDir,
    "--resource",
    "fixture-db:shared",
    "--mode",
    "exclusive",
    "--intent",
    "fixture-db-steward",
    "--json",
  ], process.cwd());
  assert.equal(blocker.code, CLI_EXIT_OK, blocker.stderr || blocker.stdout);

  const pending = await runCliCapture([
    "test",
    "require",
    "--repo",
    repo,
    "--state-dir",
    stateDir,
    "--checks",
    "changed",
    "--intent",
    "test-intent",
    "--json",
  ], process.cwd());
  assert.equal(pending.code, CLI_EXIT_DEGRADED, pending.stderr || pending.stdout);
  const pendingPayload = payload(pending.stdout);
  assert.equal(pendingPayload.data.status, "PENDING");
  assert.equal(pendingPayload.data.checks[0].demands[0].resourceId, "fixture-db:shared");

  const pendingStatus = await runCliCapture(["agent-resource", "status", "--state-dir", stateDir, "--json"], process.cwd());
  assert.equal(payload(pendingStatus.stdout).data.activeLeases.length, 1);

  const blockerLeaseId = payload(blocker.stdout).data.lease.id;
  const unblock = await runCliCapture([
    "agent-resource",
    "release",
    "--state-dir",
    stateDir,
    "--lease",
    blockerLeaseId,
    "--status",
    "abandoned",
    "--no-result",
    "true",
    "--json",
  ], process.cwd());
  assert.equal(unblock.code, CLI_EXIT_OK, unblock.stderr || unblock.stdout);

  const acquired = await runCliCapture([
    "test",
    "require",
    "--repo",
    repo,
    "--state-dir",
    stateDir,
    "--checks",
    "changed",
    "--intent",
    "test-intent",
    "--json",
  ], process.cwd());
  assert.equal(acquired.code, CLI_EXIT_OK, acquired.stderr || acquired.stdout);
  const acquiredPayload = payload(acquired.stdout);
  assert.equal(acquiredPayload.data.status, "ACQUIRED");
  assert.equal(acquiredPayload.data.checks[0].leases.length, 3);

  const cleanupSqlite = new Database(path.join(stateDir, "agent-coordination.sqlite"), { readonly: true });
  const cleanupRows = cleanupSqlite.prepare(`
    SELECT resource_id, cleanup_command_json
    FROM resource_leases
    WHERE intent_id = ?
    ORDER BY resource_id
  `).all("test-intent") as { resource_id: string; cleanup_command_json: string }[];
  cleanupSqlite.close();
  assert.equal(cleanupRows.length, 3);
  for (const row of cleanupRows) {
    const cleanup = JSON.parse(row.cleanup_command_json);
    assert.equal(cleanup.command, "release all acquired leases and record only the primary test result");
    assert.equal(cleanup.check, "changed");
  }

  const [primary, ...extra] = acquiredPayload.data.checks[0].leases;
  for (const lease of extra) {
    const releaseExtra = await runCliCapture([
      "agent-resource",
      "release",
      "--state-dir",
      stateDir,
      "--lease",
      lease.id,
      "--status",
      "passed",
      "--no-result",
      "true",
      "--json",
    ], process.cwd());
    assert.equal(releaseExtra.code, CLI_EXIT_OK, releaseExtra.stderr || releaseExtra.stdout);
  }
  const releasePrimary = await runCliCapture([
    "agent-resource",
    "release",
    "--state-dir",
    stateDir,
    "--lease",
    primary.id,
    "--status",
    "passed",
    "--repo",
    repo,
    "--lane",
    "changed",
    "--check",
    "changed",
    "--json",
  ], process.cwd());
  assert.equal(releasePrimary.code, CLI_EXIT_OK, releasePrimary.stderr || releasePrimary.stdout);

  const finalStatus = await runCliCapture(["agent-resource", "status", "--state-dir", stateDir, "--json"], process.cwd());
  const finalPayload = payload(finalStatus.stdout);
  assert.equal(finalPayload.data.activeLeases.length, 0);
  assert.equal(finalPayload.data.recentResults.filter((result: any) => result.status === "passed").length, 1);
});

test("claw test run dry-run acquires and releases through the ledger", async () => {
  const stateDir = tempStateDir();
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "claw-test-run-repo-"));
  fs.mkdirSync(path.join(repo, "qa"), { recursive: true });
  fs.writeFileSync(path.join(repo, "qa", "agent-coordination.manifest.json"), JSON.stringify({
    checks: [fixtureCheck()],
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

test("claw test run heartbeats leases while executing the manifest command", async () => {
  const stateDir = tempStateDir();
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "claw-test-run-heartbeat-repo-"));
  fs.mkdirSync(path.join(repo, "qa"), { recursive: true });
  fs.writeFileSync(path.join(repo, "qa", "agent-coordination.manifest.json"), JSON.stringify({
    checks: [fixtureCheck({
      command: "sleep 2",
      heartbeatSeconds: 1,
      ttlSeconds: 30,
      timeoutSeconds: 10,
    })],
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
    "--json",
  ], process.cwd());
  assert.equal(run.code, CLI_EXIT_OK, run.stderr || run.stdout);
  assert.equal(payload(run.stdout).data.status, "PASS");

  const sqlite = new Database(path.join(stateDir, "agent-coordination.sqlite"), { readonly: true });
  const heartbeatCount = sqlite.prepare("SELECT count(*) AS count FROM coordination_audit WHERE event_type = 'resource.heartbeat'").get() as { count: number };
  sqlite.close();
  assert.ok(heartbeatCount.count >= 1);
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

test("claw test require reuses valid prior results by fingerprint", async () => {
  const stateDir = tempStateDir();
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "claw-test-reuse-repo-"));
  fs.mkdirSync(path.join(repo, "qa"), { recursive: true });
  fs.writeFileSync(path.join(repo, "qa", "agent-coordination.manifest.json"), JSON.stringify({
    checks: [fixtureCheck({ resultReuse: { allowed: true, validForSeconds: 1800 } })],
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
    "--fingerprint",
    "fp-a",
    "--dry-run",
    "true",
    "--json",
  ], process.cwd());
  assert.equal(run.code, CLI_EXIT_OK, run.stderr || run.stdout);

  const reused = await runCliCapture([
    "test",
    "require",
    "--repo",
    repo,
    "--state-dir",
    stateDir,
    "--checks",
    "changed",
    "--fingerprint",
    "fp-a",
    "--json",
  ], process.cwd());
  assert.equal(reused.code, CLI_EXIT_OK, reused.stderr || reused.stdout);
  const reusedPayload = payload(reused.stdout);
  assert.equal(reusedPayload.data.status, "SATISFIED");
  assert.equal(reusedPayload.data.checks[0].status, "SATISFIED");
  assert.equal(reusedPayload.data.checks[0].reusableResult.status, "passed");

  const mismatch = await runCliCapture([
    "test",
    "require",
    "--repo",
    repo,
    "--state-dir",
    stateDir,
    "--checks",
    "changed",
    "--fingerprint",
    "fp-b",
    "--json",
  ], process.cwd());
  assert.equal(mismatch.code, CLI_EXIT_OK, mismatch.stderr || mismatch.stdout);
  assert.equal(payload(mismatch.stdout).data.checks[0].status, "ACQUIRED");
});

test("claw test result reuse fingerprint includes environment and resource state", async () => {
  const stateDir = tempStateDir();
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "claw-test-reuse-state-repo-"));
  fs.mkdirSync(path.join(repo, "qa"), { recursive: true });
  const writeManifest = (resourceId: string) => {
    fs.writeFileSync(path.join(repo, "qa", "agent-coordination.manifest.json"), JSON.stringify({
      checks: [fixtureCheck({
        resultReuse: { allowed: true, validForSeconds: 1800 },
        environmentInputs: ["CLAW_TEST_REUSE_TOKEN"],
        resources: [{ id: resourceId, mode: "read" }],
        consumes: [resourceId],
      })],
    }, null, 2));
  };

  writeManifest("repo:fixture:worktree");
  process.env.CLAW_TEST_REUSE_TOKEN = "alpha";
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
  const originalFingerprint = payload(run.stdout).data.fingerprint;

  const reused = await runCliCapture([
    "test",
    "require",
    "--repo",
    repo,
    "--state-dir",
    stateDir,
    "--checks",
    "changed",
    "--json",
  ], process.cwd());
  assert.equal(reused.code, CLI_EXIT_OK, reused.stderr || reused.stdout);
  assert.equal(payload(reused.stdout).data.status, "SATISFIED");

  process.env.CLAW_TEST_REUSE_TOKEN = "beta";
  const changedEnv = await runCliCapture([
    "test",
    "require",
    "--repo",
    repo,
    "--state-dir",
    stateDir,
    "--checks",
    "changed",
    "--json",
  ], process.cwd());
  assert.equal(changedEnv.code, CLI_EXIT_OK, changedEnv.stderr || changedEnv.stdout);
  const changedEnvPayload = payload(changedEnv.stdout);
  assert.equal(changedEnvPayload.data.status, "ACQUIRED");
  assert.notEqual(changedEnvPayload.data.checks[0].fingerprint, originalFingerprint);

  for (const lease of changedEnvPayload.data.checks[0].leases) {
    await runCliCapture([
      "agent-resource",
      "release",
      "--state-dir",
      stateDir,
      "--lease",
      lease.id,
      "--status",
      "abandoned",
      "--no-result",
      "true",
      "--json",
    ], process.cwd());
  }

  process.env.CLAW_TEST_REUSE_TOKEN = "alpha";
  writeManifest("fixture-db:changed");
  const changedResource = await runCliCapture([
    "test",
    "require",
    "--repo",
    repo,
    "--state-dir",
    stateDir,
    "--checks",
    "changed",
    "--json",
  ], process.cwd());
  assert.equal(changedResource.code, CLI_EXIT_OK, changedResource.stderr || changedResource.stdout);
  const changedResourcePayload = payload(changedResource.stdout);
  assert.equal(changedResourcePayload.data.status, "ACQUIRED");
  assert.notEqual(changedResourcePayload.data.checks[0].fingerprint, originalFingerprint);

  delete process.env.CLAW_TEST_REUSE_TOKEN;
});

test("failed test runs create repair stewardship that blocks duplicate reruns", async () => {
  const stateDir = tempStateDir();
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "claw-test-repair-repo-"));
  fs.mkdirSync(path.join(repo, "qa"), { recursive: true });
  fs.writeFileSync(path.join(repo, "qa", "agent-coordination.manifest.json"), JSON.stringify({
    checks: [fixtureCheck({
      command: "node -e \"console.log('fixture stdout before failure'); console.error('fixture stderr before failure'); process.exit(1)\"",
      resultReuse: { allowed: true, validForSeconds: 1800 },
      failureAction: "Repair the failing fixture command.",
    })],
  }, null, 2));

  const failed = await runCliCapture([
    "test",
    "run",
    "--repo",
    repo,
    "--state-dir",
    stateDir,
    "--lane",
    "changed",
    "--fingerprint",
    "broken",
    "--intent",
    "repair-steward",
    "--json",
  ], process.cwd());
  assert.equal(failed.code, 1, failed.stderr || failed.stdout);
  const failedPayload = payload(failed.stdout);
  assert.equal(failedPayload.data.status, "FAIL");
  assert.equal(failedPayload.data.repair.status, "repairing");
  assert.match(failed.stderr, /fixture stdout before failure/);

  const failedStatus = await runCliCapture(["agent-resource", "status", "--state-dir", stateDir, "--json"], process.cwd());
  assert.equal(failedStatus.code, CLI_EXIT_OK, failedStatus.stderr || failedStatus.stdout);
  const failedResult = payload(failedStatus.stdout).data.recentResults[0];
  assert.equal(failedResult.status, "failed");
  assert.match(failedResult.stdoutTail, /fixture stdout before failure/);
  assert.match(failedResult.stderrTail, /fixture stderr before failure/);

  const duplicate = await runCliCapture([
    "test",
    "require",
    "--repo",
    repo,
    "--state-dir",
    stateDir,
    "--checks",
    "changed",
    "--fingerprint",
    "broken",
    "--intent",
    "other-agent",
    "--json",
  ], process.cwd());
  assert.equal(duplicate.code, CLI_EXIT_DEGRADED, duplicate.stderr || duplicate.stdout);
  const duplicatePayload = payload(duplicate.stdout);
  assert.equal(duplicatePayload.data.status, "PENDING");
  assert.equal(duplicatePayload.data.checks[0].repair.ownerIntentId, "repair-steward");
  assert.equal(duplicatePayload.data.checks[0].repair.stewardIntentId, "repair-steward");

  const staleSqlite = new Database(path.join(stateDir, "agent-coordination.sqlite"));
  staleSqlite.prepare("UPDATE repair_ownership SET expires_at = ? WHERE check_id = ? AND fingerprint = ?").run("2000-01-01T00:00:00.000Z", "changed", "broken");
  staleSqlite.close();
  const staleReap = await runCliCapture(["agent-resource", "reap", "--state-dir", stateDir, "--json"], process.cwd());
  assert.equal(staleReap.code, CLI_EXIT_OK, staleReap.stderr || staleReap.stdout);
  const reapedSqlite = new Database(path.join(stateDir, "agent-coordination.sqlite"), { readonly: true });
  const staleRepair = reapedSqlite.prepare("SELECT status FROM repair_ownership WHERE check_id = ? AND fingerprint = ?").get("changed", "broken") as { status: string };
  const repairReapedAudit = reapedSqlite.prepare("SELECT count(*) AS count FROM coordination_audit WHERE event_type = 'repair.reaped'").get() as { count: number };
  reapedSqlite.close();
  assert.equal(staleRepair.status, "stale");
  assert.equal(repairReapedAudit.count, 1);

  fs.writeFileSync(path.join(repo, "qa", "agent-coordination.manifest.json"), JSON.stringify({
    checks: [fixtureCheck({
      command: "node -e \"process.exit(0)\"",
      resultReuse: { allowed: true, validForSeconds: 1800 },
    })],
  }, null, 2));

  const repaired = await runCliCapture([
    "test",
    "run",
    "--repo",
    repo,
    "--state-dir",
    stateDir,
    "--lane",
    "changed",
    "--fingerprint",
    "broken",
    "--intent",
    "repair-steward",
    "--json",
  ], process.cwd());
  assert.equal(repaired.code, CLI_EXIT_OK, repaired.stderr || repaired.stdout);
  assert.equal(payload(repaired.stdout).data.status, "PASS");
});

test("agent-resource bypass writes an audit event and is not clean validation", async () => {
  const stateDir = tempStateDir();
  const result = await runCliCapture([
    "agent-resource",
    "bypass",
    "--state-dir",
    stateDir,
    "--intent",
    "bypass-intent",
    "--resource",
    "test:fixture:changed",
    "--reason",
    "operator approved partial validation",
    "--json",
  ], process.cwd());
  assert.equal(result.code, CLI_EXIT_DEGRADED, result.stderr || result.stdout);
  const resultPayload = payload(result.stdout);
  assert.equal(resultPayload.data.status, "BYPASS_AUDITED");
  assert.equal(resultPayload.data.cleanValidation, false);
  assert.equal(resultPayload.data.audit.eventType, "coordination.bypassed");
  assert.equal(resultPayload.data.audit.payload.cleanValidation, false);
});
