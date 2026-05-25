import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { CLI_EXIT_OK, CLI_EXIT_USAGE } from "./index.ts";
import { runCliCapture, useIsolatedClawDataRoot } from "./index-test-utils.ts";

test("advanced productivity CLI rejects unit-number flags outside 0..1", { concurrency: false }, async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-productivity-unit-number-"));
  useIsolatedClawDataRoot(t, workspaceRoot);

  const invalidScore = await runCliCapture([
    "outcomes", "add",
    "--subject", "Impossible score should not persist",
    "--result", "worked",
    "--score", "2",
    "--note", "This must be rejected before the outcome service clamps it.",
    "--workspace", workspaceRoot,
    "--runtime", "demo",
    "--json",
  ], process.cwd());
  assert.equal(invalidScore.code, CLI_EXIT_USAGE);
  const invalidScorePayload = JSON.parse(invalidScore.stdout) as { ok: boolean; error: { code: string; status: string; location: string } };
  assert.equal(invalidScorePayload.ok, false);
  assert.equal(invalidScorePayload.error.code, "invalid_outcome_score");
  assert.equal(invalidScorePayload.error.status, "USAGE");
  assert.equal(invalidScorePayload.error.location, "cli.outcomes.score");
  assert.equal(fs.existsSync(path.join(workspaceRoot, ".claw", "outcomes.json")), false);

  const prepared = await runCliCapture([
    "judgment", "prepare",
    "--question", "Should the confidence flag be bounded?",
    "--domain", "cli",
    "--workspace", workspaceRoot,
    "--runtime", "demo",
    "--json",
  ], process.cwd());
  assert.equal(prepared.code, CLI_EXIT_OK, prepared.stderr || prepared.stdout);
  const preparedPayload = JSON.parse(prepared.stdout) as { data: { id: string } };

  const invalidConfidence = await runCliCapture([
    "judgment", "record", preparedPayload.data.id,
    "--chosen", "yes",
    "--rationale", "The schema is a unit interval.",
    "--confidence", "NaN",
    "--workspace", workspaceRoot,
    "--runtime", "demo",
    "--json",
  ], process.cwd());
  assert.equal(invalidConfidence.code, CLI_EXIT_USAGE);
  const invalidConfidencePayload = JSON.parse(invalidConfidence.stdout) as { ok: boolean; error: { code: string; status: string; location: string } };
  assert.equal(invalidConfidencePayload.ok, false);
  assert.equal(invalidConfidencePayload.error.code, "invalid_judgment_confidence");
  assert.equal(invalidConfidencePayload.error.status, "USAGE");
  assert.equal(invalidConfidencePayload.error.location, "cli.judgment.confidence");
});
