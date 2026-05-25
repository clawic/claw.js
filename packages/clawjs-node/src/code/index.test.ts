import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "vitest";

import { createCodeLedger } from "./index.ts";

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
