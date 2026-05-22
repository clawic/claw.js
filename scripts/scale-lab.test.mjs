import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

function runScaleLab(args, cwd = process.cwd()) {
  return spawnSync(process.execPath, ["--import", "tsx", "./scripts/scale-lab.ts", ...args], {
    cwd,
    encoding: "utf8",
  });
}

test("scale lab smoke runs all synthetic workloads and cleans up by default", () => {
  const lockPath = path.join(os.tmpdir(), `claw-scale-lab-test-${process.pid}.lock`);
  const result = runScaleLab([
    "--profile", "smoke",
    "--search-items", "50",
    "--search-queries", "2",
    "--sessions", "6",
    "--messages-per-session", "4",
    "--skills", "6",
    "--runtime-multiplier", "2",
    "--dense-multiplier", "1",
    "--attachments", "4",
    "--blob-bytes", "128",
    "--lock", lockPath,
    "--json",
    "--no-disk-check",
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.profile, "smoke");
  assert.deepEqual(report.workloads.map((workload) => workload.name), ["search", "sessions", "skills", "runtimes", "dense", "attachments"]);
  assert.equal(report.cleanup.status, "removed");
  assert.equal(fs.existsSync(report.tempRoot), false);
  assert.equal(fs.existsSync(lockPath), false);
  assert.equal(report.externalPending.includes("signed-host UI baseline"), true);
});

test("scale lab disk preflight blocks oversized runs before workload execution", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-scale-lab-preflight-"));
  const reportPath = path.join(workspaceRoot, "reports", "preflight.json");
  const tempRoot = path.join(workspaceRoot, "lab");
  const lockPath = path.join(workspaceRoot, "scale.lock");
  try {
    const result = runScaleLab([
      "--profile", "smoke",
      "--workload", "search",
      "--search-items", "10000000000",
      "--report", reportPath,
      "--temp-root", tempRoot,
      "--lock", lockPath,
      "--json",
    ]);

    assert.equal(result.status, 1, result.stderr || result.stdout);
    const stdoutReport = JSON.parse(result.stdout);
    const fileReport = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    assert.equal(stdoutReport.ok, false);
    assert.equal(stdoutReport.reason, "insufficient_disk");
    assert.deepEqual(fileReport, stdoutReport);
    assert.equal(stdoutReport.diskPreflight.checked, true);
    assert.equal(stdoutReport.diskPreflight.pass, false);
    assert.equal(stdoutReport.workloads.length, 0);
    assert.equal(stdoutReport.cleanup.status, "removed");
    assert.equal(fs.existsSync(tempRoot), false);
    assert.equal(fs.existsSync(lockPath), false);
  } finally {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test("scale lab rejects concurrent runs with a lock report", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-scale-lab-lock-"));
  const lockPath = path.join(workspaceRoot, "scale.lock");
  const tempRoot = path.join(workspaceRoot, "lab");
  fs.writeFileSync(lockPath, "busy");
  try {
    const result = runScaleLab([
      "--profile", "smoke",
      "--workload", "skills",
      "--skills", "2",
      "--temp-root", tempRoot,
      "--lock", lockPath,
      "--json",
      "--no-disk-check",
    ]);

    assert.equal(result.status, 2, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.reason, "lock_unavailable");
    assert.equal(report.lock.acquired, false);
    assert.equal(report.cleanup.status, "removed");
    assert.equal(fs.existsSync(lockPath), true);
  } finally {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test("scale lab heavy profile is explicit opt-in", () => {
  const result = runScaleLab(["--profile", "heavy", "--workload", "search", "--json"]);
  assert.equal(result.status, 2, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.reason, "heavy_requires_opt_in");
  assert.equal(report.workloads.length, 0);
});
