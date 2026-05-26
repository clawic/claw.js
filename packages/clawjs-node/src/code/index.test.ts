import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, test } from "vitest";

import { createCodeLedger } from "./index.ts";
import { CODE_LEDGER_SCHEMA_SQL } from "./surface.ts";

const previousClawDataDir = process.env.CLAW_DATA_DIR;

afterEach(() => {
  if (previousClawDataDir === undefined) {
    delete process.env.CLAW_DATA_DIR;
  } else {
    process.env.CLAW_DATA_DIR = previousClawDataDir;
  }
});

function createTempGitRepo(): { repoDir: string; dataDir: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-code-ledger-policy-"));
  const repoDir = path.join(root, "repo");
  const dataDir = path.join(root, "data");
  fs.mkdirSync(repoDir);
  process.env.CLAW_DATA_DIR = dataDir;
  const result = spawnSync("git", ["init"], { cwd: repoDir, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return { repoDir, dataDir };
}

test("code ledger policy rejects unsafe numeric thresholds", () => {
  const { repoDir } = createTempGitRepo();
  const ledger = createCodeLedger({ repoDir });

  const policy = ledger.setPolicy({
    evidence: {
      minimumByKind: {
        fix: 2,
        docs: 0,
      },
      highRiskMinimum: 3,
    },
    risk: {
      largeDiffThreshold: 25,
    },
  });

  assert.equal(policy.policy.evidence.minimumByKind.fix, 2);
  assert.equal(policy.policy.evidence.minimumByKind.feat, 1);
  assert.equal(policy.policy.evidence.highRiskMinimum, 3);
  assert.equal(policy.policy.risk.largeDiffThreshold, 25);
  assert.equal(ledger.validatePolicy().policy.risk.largeDiffThreshold, 25);

  assert.throws(
    () => ledger.setPolicy({ evidence: { minimumByKind: { fix: 1.5 } } }),
    /Invalid code policy evidence\.minimumByKind\.fix: expected a safe non-negative integer, got 1\.5\./,
  );
  assert.throws(
    () => ledger.setPolicy({ evidence: { minimumByKind: { feat: "2" } } }),
    /Invalid code policy evidence\.minimumByKind\.feat: expected a safe non-negative integer, got "2"\./,
  );
  assert.throws(
    () => ledger.setPolicy({ evidence: { highRiskMinimum: -1 } }),
    /Invalid code policy evidence\.highRiskMinimum: expected a safe non-negative integer, got -1\./,
  );
  assert.throws(
    () => ledger.setPolicy({ risk: { largeDiffThreshold: 0 } }),
    /Invalid code policy risk\.largeDiffThreshold: expected a safe positive integer, got 0\./,
  );
  assert.throws(
    () => ledger.setPolicy({ risk: { largeDiffThreshold: Number.MAX_SAFE_INTEGER + 1 } }),
    /Invalid code policy risk\.largeDiffThreshold: expected a safe positive integer, got 9007199254740992\./,
  );

  fs.writeFileSync(path.join(repoDir, "claw.code.json"), `${JSON.stringify({ risk: { largeDiffThreshold: "many" } })}\n`);
  assert.throws(
    () => ledger.validatePolicy(),
    /Invalid code policy risk\.largeDiffThreshold: expected a safe positive integer, got "many"\./,
  );
});

test("code ledger status queries use ordered snapshot indexes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-code-ledger-indexes-"));
  const db = new Database(path.join(root, "runtime.sqlite"));
  try {
    db.exec(CODE_LEDGER_SCHEMA_SQL);
    db.prepare(`
      INSERT INTO code_repositories (id, root_dir, default_branch, current_head, created_at, updated_at)
      VALUES ('repo-indexed', ?, 'main', 'head', '2026-05-25T00:00:00.000Z', '2026-05-25T00:00:00.000Z')
    `).run(root);

    const intentPlan = db
      .prepare("EXPLAIN QUERY PLAN SELECT * FROM code_intents WHERE repo_id = ? ORDER BY created_at DESC")
      .all("repo-indexed") as Array<{ detail: string }>;
    assert.equal(intentPlan.some((row) => row.detail.includes("code_intents_repo_created_idx")), true);
    assert.equal(intentPlan.some((row) => row.detail.includes("USE TEMP B-TREE")), false);

    const blockedPlan = db
      .prepare("EXPLAIN QUERY PLAN SELECT * FROM code_intents WHERE repo_id = ? AND status = ? ORDER BY created_at DESC")
      .all("repo-indexed", "blocked") as Array<{ detail: string }>;
    assert.equal(blockedPlan.some((row) => row.detail.includes("code_intents_repo_status_created_idx")), true);
    assert.equal(blockedPlan.some((row) => row.detail.includes("USE TEMP B-TREE")), false);

    const queuePlan = db
      .prepare("EXPLAIN QUERY PLAN SELECT * FROM code_queue WHERE status = 'queued' ORDER BY created_at ASC")
      .all() as Array<{ detail: string }>;
    assert.equal(queuePlan.some((row) => row.detail.includes("code_queue_status_created_idx")), true);
    assert.equal(queuePlan.some((row) => row.detail.includes("USE TEMP B-TREE")), false);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
