import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { createJudgmentStore } from "./store.ts";

test("JudgmentStore rejects invalid explicit confidence instead of clamping or coercing it", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-judgment-store-"));
  const store = createJudgmentStore({ workspaceDir });
  const judgment = store.prepare({
    question: "Which implementation should we use?",
    domain: "testing",
    options: ["strict validation"],
  }, {
    rules: [],
    learnings: [],
  });

  for (const confidence of [NaN, Infinity, -Infinity, -0.1, 1.1, "0.8", "0x1"]) {
    assert.throws(() => store.record(judgment.id, {
      chosen: "strict validation",
      rationale: "Invalid explicit confidence must not be normalized.",
      confidence: confidence as unknown as number,
    }), /Judgment confidence must be a finite number between 0 and 1/);
  }

  assert.equal(store.get(judgment.id)?.status, "prepared");

  const recorded = store.record(judgment.id, {
    chosen: "strict validation",
    rationale: "Valid explicit confidence is stored as provided.",
    confidence: 0.987,
  });

  assert.equal(recorded.confidence, 0.987);
});
