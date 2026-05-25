import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { createLearningStore } from "./store.ts";

function tempWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-learning-store-"));
}

test("learning store rejects corrupt explicit confidence and timestamps instead of resetting state", () => {
  const workspaceDir = tempWorkspace();
  const store = createLearningStore({ workspaceDir });
  const learning = store.add({
    claim: "Use focused validation for learning store changes.",
    target: "workflow",
    kind: "preference",
    evidenceSessionId: "session-valid",
    sentiment: "positive",
  });

  const persisted = JSON.parse(fs.readFileSync(store.statePath, "utf8")) as {
    learnings: Array<{ id: string; confidence: unknown }>;
  };
  persisted.learnings[0]!.confidence = "0.72";
  fs.writeFileSync(store.statePath, `${JSON.stringify(persisted, null, 2)}\n`);

  assert.throws(() => store.readState(), /confidence/i);

  persisted.learnings[0]!.confidence = learning.confidence;
  Object.assign(persisted, { updatedAt: "tomorrow-ish" });
  fs.writeFileSync(store.statePath, `${JSON.stringify(persisted, null, 2)}\n`);

  assert.throws(() => store.readState(), /invalid timestamp/i);
});

test("learning store rejects non-finite promotion payload numbers before JSON persistence", () => {
  const workspaceDir = tempWorkspace();
  const store = createLearningStore({ workspaceDir });
  const learning = store.add({
    claim: "Never silently degrade explicit learning scores.",
    target: "workflow",
    kind: "correction",
    evidenceSessionId: "session-explicit-score",
    sentiment: "negative",
  });

  assert.throws(() => store.recordPromotion(learning.id, {
    target: "memory",
    dryRun: false,
    applied: false,
    payload: {
      confidence: Number.POSITIVE_INFINITY,
      priority: Number.NaN,
      score: Number.NEGATIVE_INFINITY,
    },
  }), /non-finite number/i);

  assert.equal(store.get(learning.id)?.promotions.length, 0);
});
