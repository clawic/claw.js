import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

test("Search scale lab disk preflight blocks oversized runs and writes report", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-scale-preflight-"));
  const dbPath = path.join(workspaceRoot, "scale", "search.sqlite");
  const reportPath = path.join(workspaceRoot, "reports", "scale-preflight.json");
  try {
    const result = spawnSync(process.execPath, [
      "--import",
      "tsx",
      "./scripts/search-scale-lab.ts",
      "--items",
      "10000000000",
      "--queries",
      "1",
      "--db",
      dbPath,
      "--report",
      reportPath,
      "--json",
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    assert.equal(result.status, 1, result.stderr || result.stdout);
    const stdoutReport = JSON.parse(result.stdout);
    assert.equal(stdoutReport.ok, false);
    assert.equal(stdoutReport.reason, "insufficient_disk");
    assert.equal(stdoutReport.items, 10000000000);
    assert.equal(stdoutReport.diskPreflight.checked, true);
    assert.equal(stdoutReport.diskPreflight.pass, false);
    assert.ok(stdoutReport.diskPreflight.availableBytes < stdoutReport.diskPreflight.estimatedRequiredBytes);
    assert.equal(fs.existsSync(reportPath), true);
    assert.deepEqual(JSON.parse(fs.readFileSync(reportPath, "utf8")), stdoutReport);
    assert.equal(fs.existsSync(dbPath), false);
  } finally {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
