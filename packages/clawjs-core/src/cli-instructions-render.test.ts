import { test } from "vitest";
import assert from "node:assert/strict";

import {
  type ClawInstruction,
  clawInstructionsSchemaVersion,
} from "./cli-instructions.ts";
import {
  renderInstructionsMarkdown,
  renderInstructionsPayload,
  resolveAndRender,
} from "./cli-instructions-render.ts";

function makeInstruction(overrides: Partial<ClawInstruction>): ClawInstruction {
  const now = "2026-05-26T10:00:00.000Z";
  return {
    id: overrides.id ?? "ins_render_test",
    schemaVersion: clawInstructionsSchemaVersion,
    target: overrides.target ?? { command: "tasks", action: "write" },
    trigger: overrides.trigger ?? "surface-action",
    activation: overrides.activation ?? "on",
    priority: overrides.priority ?? 50,
    severity: overrides.severity ?? "info",
    provenance: overrides.provenance ?? "user",
    state: overrides.state ?? "active",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test("skeleton tier drops all rules but keeps breadcrumbs", () => {
  const ins = makeInstruction({ useWhen: "x", severity: "block", priority: 100 });
  const payload = renderInstructionsPayload([ins], { target: { command: "tasks", action: "write" }, trigger: "surface-action" }, { tier: "skeleton" });
  assert.equal(payload.rules.length, 0);
  assert.equal(payload.truncated.includes(ins.source ?? ins.id), true);
  assert.equal(payload.breadcrumbs.length >= 1, true);
});

test("compact tier keeps blocking and high-priority rules", () => {
  const block = makeInstruction({ id: "b1", severity: "block", priority: 30, useWhen: "block rule" });
  const high = makeInstruction({ id: "h1", severity: "info", priority: 80, useWhen: "high info rule" });
  const low = makeInstruction({ id: "l1", severity: "info", priority: 40, useWhen: "low info rule" });
  const payload = renderInstructionsPayload(
    [block, high, low],
    { target: { command: "tasks", action: "write" }, trigger: "surface-action" },
    { tier: "compact" },
  );
  const ids = payload.rules.map((rule) => rule.id);
  assert.equal(ids.includes("b1"), true);
  assert.equal(ids.includes("h1"), true);
  assert.equal(ids.includes("l1"), false);
  assert.equal(payload.truncated.length, 1);
});

test("full tier emits every active rule up to the token budget", () => {
  const a = makeInstruction({ id: "a1", priority: 80, useWhen: "a" });
  const b = makeInstruction({ id: "b1", priority: 40, useWhen: "b" });
  const payload = renderInstructionsPayload(
    [a, b],
    { target: { command: "tasks", action: "write" }, trigger: "surface-action" },
    { tier: "full", budgetTokens: 10000 },
  );
  assert.equal(payload.rules.length, 2);
  assert.equal(payload.truncated.length, 0);
});

test("budget caps the number of rules and emits breadcrumbs for truncated entries", () => {
  const rules: ClawInstruction[] = [];
  for (let i = 0; i < 20; i += 1) {
    rules.push(
      makeInstruction({
        id: `ins_${i}`,
        priority: 50,
        useWhen: "Lorem ipsum dolor sit amet consectetur adipiscing elit.",
      }),
    );
  }
  const payload = renderInstructionsPayload(
    rules,
    { target: { command: "tasks", action: "write" }, trigger: "surface-action" },
    { tier: "full", budgetTokens: 50 },
  );
  assert.equal(payload.rules.length < rules.length, true);
  assert.equal(payload.truncated.length > 0, true);
  assert.equal(payload.breadcrumbs.length >= 1, true);
});

test("renderInstructionsMarkdown is deterministic and includes the disclaimer", () => {
  const ins = makeInstruction({ id: "ins_1", severity: "warn", priority: 80, useWhen: "When?", before: "Look before you leap." });
  const payload = renderInstructionsPayload(
    [ins],
    { target: { command: "tasks", action: "write" }, trigger: "surface-action" },
    { tier: "full" },
  );
  const markdown = renderInstructionsMarkdown(payload);
  assert.match(markdown, /Claw instructions — command=tasks action=write/);
  assert.match(markdown, /complement, never override, CONSTITUTION.md and AGENTS.md/);
  assert.match(markdown, /ins_1/);
  assert.match(markdown, /useWhen: When\?/);
});

test("resolveAndRender end-to-end: filters by trigger and target before rendering", () => {
  const matching = makeInstruction({ id: "m1", target: { command: "tasks", action: "write" }, trigger: "surface-action", useWhen: "ok" });
  const wrongTrigger = makeInstruction({ id: "w1", target: { command: "tasks", action: "write" }, trigger: "session-start", useWhen: "no" });
  const wrongTarget = makeInstruction({ id: "x1", target: { command: "notes", action: "write" }, trigger: "surface-action", useWhen: "nope" });
  const { payload } = resolveAndRender(
    [matching, wrongTrigger, wrongTarget],
    { target: { command: "tasks", action: "write" }, trigger: "surface-action" },
    { tier: "full" },
  );
  assert.deepEqual(payload.rules.map((rule) => rule.id), ["m1"]);
});
