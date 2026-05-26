import { test } from "vitest";
import assert from "node:assert/strict";

import {
  INSTRUCTION_BODY_CAPS,
  INSTRUCTION_BODY_FIELDS,
  INSTRUCTION_PRIORITY_DEFAULT,
  INSTRUCTION_PRIORITY_MAX,
  INSTRUCTION_TARGET_AXES,
  clawInstructionsSchemaVersion,
  compareResolvedInstructions,
  describeInstructionTarget,
  evaluateRuleValidations,
  isInstructionActive,
  isInstructionTrigger,
  mergeResolvedInstructions,
  RULE_VALIDATION_KINDS,
  resolveInstructionsForEvent,
  targetMatchesEvent,
  targetSpecificity,
  validateInstructionBody,
  validateInstructionShape,
  validateInstructionTarget,
  type ClawInstruction,
} from "./cli-instructions.ts";

function makeInstruction(overrides: Partial<ClawInstruction>): ClawInstruction {
  const now = "2026-05-26T10:00:00.000Z";
  return {
    id: overrides.id ?? "ins_test",
    schemaVersion: clawInstructionsSchemaVersion,
    target: overrides.target ?? { command: "tasks", action: "write" },
    trigger: overrides.trigger ?? "surface-action",
    activation: overrides.activation ?? "on",
    priority: overrides.priority ?? INSTRUCTION_PRIORITY_DEFAULT,
    severity: overrides.severity ?? "info",
    provenance: overrides.provenance ?? "seed",
    state: overrides.state ?? "active",
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    ...overrides,
  };
}

test("body caps reject overflow per field", () => {
  for (const field of INSTRUCTION_BODY_FIELDS) {
    const cap = INSTRUCTION_BODY_CAPS[field];
    const okResult = validateInstructionBody({ [field]: "x".repeat(cap) });
    assert.equal(okResult.ok, true, `expected cap-length input to pass for ${field}`);
    const overResult = validateInstructionBody({ [field]: "x".repeat(cap + 1) });
    assert.equal(overResult.ok, false, `expected over-cap input to fail for ${field}`);
    assert.equal(overResult.issues[0]?.field, field);
  }
});

test("target validation requires at least one axis and rejects bad casing", () => {
  assert.equal(validateInstructionTarget({}).ok, false);
  assert.equal(validateInstructionTarget({ command: "tasks" }).ok, true);
  assert.equal(validateInstructionTarget({ command: "Tasks" }).ok, false);
  assert.equal(validateInstructionTarget({ command: "" }).ok, false);
  assert.equal(validateInstructionTarget({ command: "tasks", action: "write" }).ok, true);
  assert.equal(validateInstructionTarget({ command: "tasks", action: "frobnicate" as never }).ok, false);
});

test("isInstructionTrigger accepts input-kind:* variants", () => {
  assert.equal(isInstructionTrigger("surface-action"), true);
  assert.equal(isInstructionTrigger("session-start"), true);
  assert.equal(isInstructionTrigger("input-kind:audio"), true);
  assert.equal(isInstructionTrigger("input-kind:image"), true);
  assert.equal(isInstructionTrigger("input-kind:photon"), false);
  assert.equal(isInstructionTrigger("nope"), false);
  assert.equal(isInstructionTrigger(42), false);
});

test("validateInstructionShape catches priority and confidence ranges", () => {
  const base = makeInstruction({});
  assert.equal(validateInstructionShape(base).ok, true);
  assert.equal(validateInstructionShape({ ...base, priority: 200 }).ok, false);
  assert.equal(validateInstructionShape({ ...base, priority: -1 }).ok, false);
  assert.equal(validateInstructionShape({ ...base, priority: 12.5 }).ok, false);
  assert.equal(validateInstructionShape({ ...base, priority: INSTRUCTION_PRIORITY_MAX }).ok, true);
  assert.equal(validateInstructionShape({ ...base, confidence: 0.5 }).ok, true);
  assert.equal(validateInstructionShape({ ...base, confidence: 1.4 }).ok, false);
});

test("rule validation rejects unknown kinds", () => {
  assert.equal(RULE_VALIDATION_KINDS.length, 6);
  const base = makeInstruction({
    validations: [{ kind: "unknown", field: "title" } as never],
  });
  const validation = validateInstructionShape(base);
  assert.equal(validation.ok, false);
  assert.equal(validation.issues.some((issue) => issue.field === "validations.0.kind"), true);
});

test("regex rule validation evaluates string patterns", () => {
  const rule = makeInstruction({
    validations: [{ kind: "regex", field: "title", pattern: "^BUG-[0-9]+$" }],
  });
  assert.equal(evaluateRuleValidations(rule, { title: "BUG-123" }).length, 0);
  assert.equal(evaluateRuleValidations(rule, { title: "TASK-123" })[0]?.kind, "regex");
});

test("max-length rule validation enforces upper bounds", () => {
  const rule = makeInstruction({
    validations: [{ kind: "max-length", field: "title", max: 5 }],
  });
  assert.equal(evaluateRuleValidations(rule, { title: "short" }).length, 0);
  assert.equal(evaluateRuleValidations(rule, { title: "too long" })[0]?.kind, "max-length");
});

test("min-length rule validation enforces lower bounds", () => {
  const rule = makeInstruction({
    validations: [{ kind: "min-length", field: "title", min: 5 }],
  });
  assert.equal(evaluateRuleValidations(rule, { title: "enough" }).length, 0);
  assert.equal(evaluateRuleValidations(rule, { title: "no" })[0]?.kind, "min-length");
});

test("required-field rule validation requires present values", () => {
  const rule = makeInstruction({
    validations: [{ kind: "required-field", field: "title" }],
  });
  assert.equal(evaluateRuleValidations(rule, { title: "present" }).length, 0);
  assert.equal(evaluateRuleValidations(rule, {})[0]?.kind, "required-field");
});

test("enum rule validation restricts values", () => {
  const rule = makeInstruction({
    validations: [{ kind: "enum", field: "status", values: ["open", "closed"] }],
  });
  assert.equal(evaluateRuleValidations(rule, { status: "open" }).length, 0);
  assert.equal(evaluateRuleValidations(rule, { status: "pending" })[0]?.kind, "enum");
});

test("presence-of-other rule validation requires companion fields", () => {
  const rule = makeInstruction({
    validations: [{ kind: "presence-of-other", field: "attachment", otherField: "attachmentConsent" }],
  });
  assert.equal(evaluateRuleValidations(rule, { attachment: "log.txt", attachmentConsent: "yes" }).length, 0);
  assert.equal(evaluateRuleValidations(rule, { attachment: "log.txt" })[0]?.kind, "presence-of-other");
});

test("targetSpecificity counts declared axes", () => {
  assert.equal(targetSpecificity({}), 0);
  assert.equal(targetSpecificity({ command: "tasks" }), 1);
  assert.equal(targetSpecificity({ command: "tasks", action: "write" }), 2);
  assert.equal(targetSpecificity({ alias: "productivity", command: "tasks", action: "write" }), 3);
});

test("targetMatchesEvent: declared axes must equal observed axes; wildcard action passes", () => {
  assert.equal(
    targetMatchesEvent({ command: "tasks" }, { command: "tasks", action: "write" }),
    true,
  );
  assert.equal(
    targetMatchesEvent({ command: "tasks", action: "write" }, { command: "tasks", action: "write" }),
    true,
  );
  assert.equal(
    targetMatchesEvent({ command: "tasks", action: "write" }, { command: "tasks", action: "read" }),
    false,
  );
  assert.equal(
    targetMatchesEvent({ command: "tasks", action: "*" }, { command: "tasks", action: "read" }),
    true,
  );
  assert.equal(
    targetMatchesEvent({ alias: "productivity" }, { command: "tasks", action: "write" }),
    false,
  );
});

test("isInstructionActive respects state, activation, and proposed gate", () => {
  const active = makeInstruction({});
  assert.equal(isInstructionActive(active), true);
  const off = makeInstruction({ activation: "off" });
  assert.equal(isInstructionActive(off), false);
  const auto = makeInstruction({ activation: "auto" });
  assert.equal(isInstructionActive(auto), true);
  assert.equal(isInstructionActive(auto, { defaultsActive: false }), false);
  const archived = makeInstruction({ state: "archived" });
  assert.equal(isInstructionActive(archived), false);
  const proposed = makeInstruction({ state: "proposed" });
  assert.equal(isInstructionActive(proposed), false);
  assert.equal(isInstructionActive(proposed, { includeProposed: true }), true);
});

test("resolveInstructionsForEvent sorts by specificity DESC, priority DESC, updatedAt DESC", () => {
  const ts2026 = "2026-05-25T09:00:00.000Z";
  const ts2025 = "2025-12-25T09:00:00.000Z";
  const general = makeInstruction({
    id: "general",
    target: { command: "tasks" },
    priority: 90,
    updatedAt: ts2026,
  });
  const specific = makeInstruction({
    id: "specific",
    target: { command: "tasks", action: "write" },
    priority: 10,
    updatedAt: ts2025,
  });
  const specificHigh = makeInstruction({
    id: "specificHigh",
    target: { command: "tasks", action: "write" },
    priority: 70,
    updatedAt: ts2025,
  });
  const specificHighRecent = makeInstruction({
    id: "specificHighRecent",
    target: { command: "tasks", action: "write" },
    priority: 70,
    updatedAt: ts2026,
  });
  const offTopic = makeInstruction({
    id: "offTopic",
    target: { command: "notes", action: "write" },
  });

  const resolved = resolveInstructionsForEvent(
    [general, specific, specificHigh, specificHighRecent, offTopic],
    { target: { command: "tasks", action: "write" }, trigger: "surface-action" },
  );

  assert.deepEqual(
    resolved.map((entry) => entry.id),
    ["specificHighRecent", "specificHigh", "specific", "general"],
  );
});

test("resolveInstructionsForEvent filters by trigger", () => {
  const surfaceRule = makeInstruction({ id: "surface", trigger: "surface-action" });
  const sessionRule = makeInstruction({ id: "session", trigger: "session-start" });
  const resolvedSurface = resolveInstructionsForEvent(
    [surfaceRule, sessionRule],
    { target: { command: "tasks", action: "write" }, trigger: "surface-action" },
  );
  assert.deepEqual(resolvedSurface.map((entry) => entry.id), ["surface"]);
  const resolvedSession = resolveInstructionsForEvent(
    [surfaceRule, sessionRule],
    { target: { command: "tasks", action: "write" }, trigger: "session-start" },
  );
  assert.deepEqual(resolvedSession.map((entry) => entry.id), ["session"]);
});

test("mergeResolvedInstructions: most-specific wins per field; severity = max", () => {
  const general = makeInstruction({
    id: "general",
    target: { command: "tasks" },
    useWhen: "general useWhen",
    notes: "general notes",
    severity: "warn",
  });
  const specific = makeInstruction({
    id: "specific",
    target: { command: "tasks", action: "write" },
    useWhen: "specific useWhen",
    severity: "block",
  });
  const resolved = resolveInstructionsForEvent(
    [general, specific],
    { target: { command: "tasks", action: "write" }, trigger: "surface-action" },
  );
  const merged = mergeResolvedInstructions(resolved);
  assert.equal(merged.fields.useWhen?.value, "specific useWhen");
  assert.equal(merged.fields.notes?.value, "general notes");
  assert.equal(merged.highestSeverity, "block");
  assert.equal(merged.blocking.length, 1);
  assert.equal(merged.blocking[0]?.id, "specific");
});

test("compareResolvedInstructions is a total order suitable for stable sorts", () => {
  const a = makeInstruction({ id: "a", target: { command: "tasks" }, priority: 50, updatedAt: "2026-05-26T10:00:00.000Z" });
  const b = makeInstruction({ id: "b", target: { command: "tasks" }, priority: 50, updatedAt: "2026-05-26T10:00:00.000Z" });
  const c = makeInstruction({ id: "c", target: { command: "tasks", action: "write" }, priority: 50, updatedAt: "2026-05-26T10:00:00.000Z" });
  assert.equal(compareResolvedInstructions(a, b), 0);
  assert.equal(compareResolvedInstructions(a, c) > 0, true);
  assert.equal(compareResolvedInstructions(c, a) < 0, true);
});

test("describeInstructionTarget joins declared axes in canonical order", () => {
  assert.equal(describeInstructionTarget({}), "<empty>");
  assert.equal(
    describeInstructionTarget({ command: "tasks", action: "write", alias: "productivity" }),
    "alias=productivity command=tasks action=write",
  );
});

test("target axis registry matches declared keys", () => {
  for (const axis of INSTRUCTION_TARGET_AXES) {
    assert.equal(typeof axis, "string");
  }
});
