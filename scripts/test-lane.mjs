#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createDiagnostic, printActionableFailureReport } from "./actionable-error.mjs";

const lane = process.argv[2] ?? "fast";
const extraArgs = process.argv.slice(3);
const coordinationActive = process.env.CLAW_AGENT_COORDINATION_ACTIVE === "1";
const coordinationBypass = process.env.CLAW_AGENT_COORDINATION_BYPASS === "1";
const KNOWN_LANES = [
  "fast",
  "changed",
  "integration",
  "e2e",
  "host",
  "device",
  "live",
  "live-brokered",
  "release",
];

class LaneExit extends Error {
  constructor(exitCode) {
    super(`lane exited with ${exitCode}`);
    this.exitCode = exitCode;
  }
}

function printTestLaneReport(diagnostics, options = {}) {
  printActionableFailureReport({
    title: options.title ?? "test lane failed:",
    diagnostics,
    stream: options.stream ?? process.stderr,
  });
}

function childFailedDiagnostic(command, args, status, options = {}) {
  return createDiagnostic("test_lane_child_failed", `${command} ${args[0] ?? ""} failed with exit status ${status ?? "unknown"}`.trim(), {
    location: options.location ?? `scripts/test-lane.mjs:${lane}`,
    suggestion: "Inspect the child command output above; it is the direct failure source.",
    safeNextStep: "Fix the failing command, then rerun the same test lane.",
  });
}

function missingLiveApprovalDiagnostic(laneName) {
  return createDiagnostic("test_lane_live_not_approved", `CLAW_TEST_LIVE=1 is required for the ${laneName} lane.`, {
    status: "USAGE",
    location: `scripts/test-lane.mjs:${laneName}`,
    suggestion: "Use this lane only after explicit live-test approval.",
    safeNextStep: `Set CLAW_TEST_LIVE=1 only in an approved live validation session, then rerun node scripts/test-lane.mjs ${laneName}.`,
  });
}

function externalPendingDiagnostic(laneName, envName, description) {
  return createDiagnostic("test_lane_external_pending", `EXTERNAL PENDING ${laneName} lane: set ${envName} for ${description}.`, {
    status: "EXTERNAL_PENDING",
    location: `scripts/test-lane.mjs:${laneName}`,
    suggestion: "Provide an approved external validation command, or record this lane as external pending.",
    safeNextStep: `Set ${envName} to the approved command and rerun node scripts/test-lane.mjs ${laneName}.`,
  });
}

function unknownLaneDiagnostic(laneName) {
  return createDiagnostic("test_lane_unknown", `Unknown test lane: ${laneName}`, {
    status: "USAGE",
    location: "scripts/test-lane.mjs",
    suggestion: `Use one of: ${KNOWN_LANES.join(", ")}.`,
    safeNextStep: "Rerun node scripts/test-lane.mjs with a known lane name.",
  });
}

function coordinationPendingDiagnostic(laneName) {
  return createDiagnostic("test_lane_coordination_pending", `another agent owns test lane ${laneName}; demand was recorded in the coordination ledger.`, {
    status: "PENDING",
    location: `scripts/test-lane.mjs:${laneName}`,
    suggestion: "Wait for the active lease to release or choose a non-conflicting validation lane.",
    safeNextStep: `Rerun node scripts/test-lane.mjs ${laneName} after the current lease is released.`,
  });
}

function coordinationSatisfiedDiagnostic(laneName) {
  return createDiagnostic("test_lane_coordination_satisfied", `test lane ${laneName} already has valid matching evidence.`, {
    status: "SATISFIED",
    location: `scripts/test-lane.mjs:${laneName}`,
    suggestion: "Reuse the recorded coordinated evidence instead of rerunning the lane.",
    safeNextStep: `Inspect the coordination ledger for lane ${laneName}, or rerun node scripts/test-lane.mjs ${laneName} after evidence expires.`,
  });
}

function coordinationCommandFailedDiagnostic(action, status) {
  return createDiagnostic("test_lane_coordination_command_failed", `could not ${action} coordination lease for test lane ${lane}.`, {
    status: "FAIL",
    location: `scripts/test-lane.mjs:${lane}`,
    suggestion: "Inspect the coordination command output with --json; avoid bypassing unless the run is explicitly marked partial.",
    safeNextStep: `Fix the coordination state or rerun with an approved CLAW_AGENT_COORDINATION_BYPASS_REASON, then retry node scripts/test-lane.mjs ${lane}.`,
  });
}

function coordinationBypassReasonMissingDiagnostic() {
  return createDiagnostic("test_lane_coordination_bypass_reason_missing", "CLAW_AGENT_COORDINATION_BYPASS_REASON is required when bypassing the coordination ledger.", {
    status: "USAGE",
    location: `scripts/test-lane.mjs:${lane}`,
    suggestion: "Bypass is allowed only for explicitly marked partial validation.",
    safeNextStep: "Set CLAW_AGENT_COORDINATION_BYPASS_REASON to a concrete reason or rerun without bypass.",
  });
}

function unexpectedFailureDiagnostic(error) {
  return createDiagnostic("test_lane_unexpected_failure", error?.message ?? "unexpected test lane failure", {
    location: `scripts/test-lane.mjs:${lane}`,
    suggestion: "Inspect the stack locally if needed; do not paste private paths or secrets into public logs.",
    safeNextStep: "Fix the unexpected failure source, then rerun the same test lane.",
  });
}

function runSelfTest() {
  const chunks = [];
  printTestLaneReport([
    missingLiveApprovalDiagnostic("live"),
    externalPendingDiagnostic("host", "CLAW_HOST_TEST_COMMAND", "signed-host validation"),
    unknownLaneDiagnostic("/Users/example/private"),
    coordinationPendingDiagnostic("fast"),
    coordinationSatisfiedDiagnostic("changed"),
    childFailedDiagnostic("npm", ["run", "test"], 1, { location: "/Users/example/private/repo" }),
    unexpectedFailureDiagnostic(new Error("token: sk-test-secret-123456")),
  ], {
    title: "test lane failed for /Users/example/private:",
    stream: { write: (chunk) => chunks.push(chunk) },
  });
  const output = chunks.join("");
  assert.match(output, /code: test_lane_live_not_approved/);
  assert.match(output, /code: test_lane_external_pending/);
  assert.match(output, /code: test_lane_unknown/);
  assert.match(output, /code: test_lane_coordination_pending/);
  assert.match(output, /code: test_lane_coordination_satisfied/);
  assert.match(output, /code: test_lane_child_failed/);
  assert.match(output, /\[USAGE\]/);
  assert.match(output, /\[EXTERNAL_PENDING\]/);
  assert.match(output, /\[PENDING\]/);
  assert.match(output, /\[SATISFIED\]/);
  assert.match(output, /location: scripts\/test-lane\.mjs:host/);
  assert.match(output, /suggestion: Provide an approved external validation command/);
  assert.match(output, /next: Set CLAW_HOST_TEST_COMMAND/);
  assert.doesNotMatch(output, /\/Users\/example/);
  assert.doesNotMatch(output, /sk-test-secret-123456/);
  console.log("test lane self-test passed");
}

function run(command, args, options = {}) {
  const child = spawnSync(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...(options.env ?? {}) },
    stdio: "inherit",
    shell: false,
  });
  if (child.status !== 0) {
    printTestLaneReport([childFailedDiagnostic(command, args, child.status, { location: options.location })]);
    throw new LaneExit(child.status ?? 1);
  }
}

function npmRun(script, args = []) {
  run("npm", ["run", script, "--", ...args]);
}

function gitChangedFiles() {
  const base = spawnSync("git", ["merge-base", "HEAD", "origin/main"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  const from = base.status === 0 && base.stdout.trim() ? base.stdout.trim() : "HEAD~1";
  const diff = spawnSync("git", ["diff", "--name-only", from, "--"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (diff.status !== 0) return [];
  return diff.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function vitest(args = []) {
  run("npx", ["vitest", "run", "--config", "vitest.config.ts", ...args]);
}

function buildPackages() {
  npmRun("build:packages");
}

function inspectabilityGate() {
  npmRun("test:inspectability");
}

function evolutionGate() {
  npmRun("test:evolution");
}

function scaleLab(profile) {
  npmRun("scale:lab", ["--profile", profile]);
}

function fast(args = []) {
  npmRun("privacy:check");
  npmRun("privacy:test");
  buildPackages();
  inspectabilityGate();
  npmRun("test:capability-maturity");
  npmRun("test:policy");
  evolutionGate();
  npmRun("code-hygiene:check");
  npmRun("code-hygiene:self-test");
  scaleLab("smoke");
  vitest(args);
  npmRun("test:types");
}

function changed() {
  const files = gitChangedFiles();
  const testFiles = files.filter((file) =>
    /\.(test|spec)\.(ts|tsx|js|mjs)$/.test(file) &&
    !file.includes("/tests/e2e/") &&
    !file.startsWith("tests/e2e/"),
  );
  if (testFiles.length > 0) {
    npmRun("privacy:check");
    npmRun("privacy:test");
    buildPackages();
    npmRun("test:capability-maturity");
    npmRun("test:policy");
    evolutionGate();
    const packageScripts = new Set();
    const rootVitestFiles = [];
    for (const file of testFiles) {
      if (file.startsWith("memory/")) {
        packageScripts.add("memory:test");
      } else if (file.startsWith("publishing/")) {
        packageScripts.add("publishing:test");
      } else if (file.startsWith("relay/")) {
        packageScripts.add("relay:test");
      } else {
        rootVitestFiles.push(file);
      }
    }
    if (rootVitestFiles.length > 0) {
      vitest(rootVitestFiles);
    }
    for (const script of packageScripts) {
      npmRun(script);
    }
    npmRun("test:types");
    return;
  }
  fast();
}

function integration() {
  fast();
  scaleLab("medium");
  for (const script of [
    "database:test",
    "audio:test",
    "sessions:test",
    "runtime:test",
    "mcp:test",
    "bridge:test",
    "content:test",
    "notify:test",
    "relay:test",
    "execution:test",
    "delegation:test",
    "secrets:test",
    "wiki:test",
    "drive:test",
    "memory:test",
  ]) {
    npmRun(script);
  }
}

function live() {
  if (process.env.CLAW_TEST_LIVE !== "1") {
    printTestLaneReport([missingLiveApprovalDiagnostic("live")]);
    throw new LaneExit(2);
  }
  npmRun("test:e2e:smoke-real", extraArgs);
}

function liveBrokered() {
  if (process.env.CLAW_TEST_LIVE !== "1") {
    printTestLaneReport([missingLiveApprovalDiagnostic("live-brokered")]);
    throw new LaneExit(2);
  }
  npmRun("test:package-live", extraArgs);
}

function host() {
  if (process.env.CLAW_HOST_TEST_COMMAND) {
    run("bash", ["-lc", process.env.CLAW_HOST_TEST_COMMAND]);
    return;
  }
  printTestLaneReport([externalPendingDiagnostic("host", "CLAW_HOST_TEST_COMMAND", "signed-host validation")], {
    title: "test lane external pending:",
  });
}

function device() {
  if (process.env.CLAW_DEVICE_TEST_COMMAND) {
    run("bash", ["-lc", process.env.CLAW_DEVICE_TEST_COMMAND]);
    return;
  }
  printTestLaneReport([externalPendingDiagnostic("device", "CLAW_DEVICE_TEST_COMMAND", "device validation")], {
    title: "test lane external pending:",
  });
}

function release() {
  run("node", ["./scripts/supply-chain-security-check.mjs", "--release"]);
  run("node", ["./scripts/idle-quiescence-check.mjs"]);
  integration();
  npmRun("test:ts");
  npmRun("build");
  npmRun("test:docs");
  npmRun("test:pack");
  for (const script of [
    "database:test:e2e",
    "agenda:test:e2e",
    "time:test:e2e",
    "erp:test:e2e",
    "content:test:e2e",
    "iot:test:e2e",
    "relay:test:e2e",
    "execution:test:e2e",
    "delegation:test:e2e",
    "secrets:test:e2e",
    "drive:test:e2e",
    "memory:test:e2e",
    "test:e2e:ci",
  ]) {
    npmRun(script);
  }
  host();
  device();
}

function runClawJson(args) {
  const child = spawnSync(process.execPath, ["packages/clawjs/bin/claw.mjs", ...args, "--json"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    shell: false,
  });
  let payload = null;
  try {
    payload = child.stdout ? JSON.parse(child.stdout) : null;
  } catch {
    payload = null;
  }
  return { status: child.status ?? 1, stdout: child.stdout ?? "", stderr: child.stderr ?? "", payload };
}

function coordinationPathFlags() {
  return [
    ...(process.env.CLAW_AGENT_COORDINATION_STATE_DIR ? ["--state-dir", process.env.CLAW_AGENT_COORDINATION_STATE_DIR] : []),
    ...(process.env.CLAW_AGENT_COORDINATION_RUN_DIR ? ["--run-dir", process.env.CLAW_AGENT_COORDINATION_RUN_DIR] : []),
  ];
}

function acquireLaneLease() {
  if (coordinationActive) return null;
  if (coordinationBypass) {
    const reason = process.env.CLAW_AGENT_COORDINATION_BYPASS_REASON;
    if (!reason) {
      printTestLaneReport([coordinationBypassReasonMissingDiagnostic()]);
      throw new LaneExit(2);
    }
    const result = runClawJson([
      "agent-resource",
      "bypass",
      "--intent",
      `test-lane-bypass-${process.pid}`,
      "--resource",
      `test-lane:${lane}`,
      "--reason",
      reason,
      ...coordinationPathFlags(),
    ]);
    if (result.payload?.data?.status !== "BYPASS_AUDITED") {
      printTestLaneReport([coordinationCommandFailedDiagnostic("record bypass audit", result.status)]);
      throw new LaneExit(result.status);
    }
    console.error("WARNING: CLAW_AGENT_COORDINATION_BYPASS=1; this validation will not count as clean coordinated evidence.");
    return null;
  }
  const result = runClawJson([
    "test",
    "require",
    "--repo",
    process.cwd(),
    "--lane",
    lane,
    "--checks",
    lane,
    "--pid",
    String(process.pid),
    ...coordinationPathFlags(),
  ]);
  if (result.status === 0) {
    if (result.payload?.data?.status === "PENDING") {
      printTestLaneReport([coordinationPendingDiagnostic(lane)], {
        title: "test lane coordination pending:",
      });
      throw new LaneExit(2);
    }
    if (result.payload?.data?.status === "SATISFIED") {
      printTestLaneReport([coordinationSatisfiedDiagnostic(lane)], {
        title: "test lane coordination satisfied:",
      });
      throw new LaneExit(0);
    }
    const check = result.payload?.data?.checks?.[0];
    const primary = check?.lease?.id ?? null;
    const leases = Array.isArray(check?.leases) ? check.leases.map((lease) => lease.id).filter(Boolean) : primary ? [primary] : [];
    return primary ? { primary, leases } : null;
  }
  if (result.payload?.data?.status === "PENDING") {
    printTestLaneReport([coordinationPendingDiagnostic(lane)], {
      title: "test lane coordination pending:",
    });
    throw new LaneExit(2);
  }
  printTestLaneReport([coordinationCommandFailedDiagnostic("acquire", result.status)]);
  throw new LaneExit(result.status);
}

function releaseLaneLease(acquired, exitCode) {
  if (!acquired?.primary) return;
  const status = exitCode === 0 ? "passed" : exitCode === 2 ? "external_pending" : "failed";
  const leases = acquired.leases?.length ? acquired.leases : [acquired.primary];
  for (const leaseId of leases) {
    const isPrimary = leaseId === acquired.primary;
    const result = runClawJson([
      "agent-resource",
      "release",
      "--lease",
      leaseId,
      "--status",
      status,
      "--repo",
      process.cwd(),
      "--lane",
      lane,
      "--check",
      lane,
      ...(isPrimary ? [] : ["--no-result", "true"]),
      ...coordinationPathFlags(),
    ]);
    if (result.status !== 0) {
      printTestLaneReport([coordinationCommandFailedDiagnostic("release", result.status)], {
        title: "test lane coordination release failed:",
      });
    }
  }
}

function startLaneHeartbeat(acquired) {
  if (!acquired?.leases?.length) return null;
  const payload = Buffer.from(JSON.stringify({
    cwd: process.cwd(),
    parentPid: process.pid,
    leases: acquired.leases,
    flags: coordinationPathFlags(),
    intervalMs: 10_000,
  })).toString("base64");
  const script = `
const { spawnSync } = require("node:child_process");
const data = JSON.parse(Buffer.from(process.argv[1], "base64").toString("utf8"));
function parentAlive() {
  try { process.kill(data.parentPid, 0); return true; } catch { return false; }
}
function beat() {
  if (!parentAlive()) process.exit(0);
  for (const lease of data.leases) {
    spawnSync(process.execPath, ["packages/clawjs/bin/claw.mjs", "agent-resource", "heartbeat", "--lease", lease, "--status", "running", ...data.flags, "--json"], {
      cwd: data.cwd,
      env: process.env,
      stdio: "ignore",
    });
  }
}
process.on("SIGTERM", () => process.exit(0));
beat();
setInterval(beat, data.intervalMs);
`;
  const child = spawn(process.execPath, ["-e", script, payload], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "ignore",
  });
  child.unref();
  return child;
}

function stopLaneHeartbeat(child) {
  if (!child) return;
  try {
    child.kill("SIGTERM");
  } catch {
    // Best-effort cleanup; the helper also exits when the parent process dies.
  }
}

function runLane() {
  switch (lane) {
    case "fast":
      fast(extraArgs);
      return;
    case "changed":
      changed();
      return;
    case "integration":
      integration();
      return;
    case "e2e":
      npmRun("test:e2e", extraArgs);
      return;
    case "host":
      host();
      return;
    case "device":
      device();
      return;
    case "live":
      live();
      return;
    case "live-brokered":
      liveBrokered();
      return;
    case "release":
      release();
      return;
    default:
      printTestLaneReport([unknownLaneDiagnostic(lane)]);
      throw new LaneExit(2);
  }
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
  process.exit(0);
}

let leaseId = null;
let heartbeat = null;
let exitCode = 0;
try {
  leaseId = acquireLaneLease();
  heartbeat = startLaneHeartbeat(leaseId);
  runLane();
} catch (error) {
    if (error instanceof LaneExit) {
      exitCode = error.exitCode;
    } else {
      printTestLaneReport([unexpectedFailureDiagnostic(error)]);
      exitCode = 1;
    }
} finally {
  stopLaneHeartbeat(heartbeat);
  releaseLaneLease(leaseId, exitCode);
}
process.exit(exitCode);
