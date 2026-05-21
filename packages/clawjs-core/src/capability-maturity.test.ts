import assert from "node:assert/strict";
import { test } from "vitest";

import {
  auditClawCapabilityMaturityRegistry,
  defineClawCapabilityMaturityEntry,
  evaluateClawCapabilityMaturity,
  getClawCapabilityMaturityEntry,
  isMaturityAllowedInActivationTier,
  resolveClawMaturityActivationTier,
} from "./capability-maturity.ts";

test("capability maturity registry satisfies the first governance invariants", () => {
  const audit = auditClawCapabilityMaturityRegistry();
  assert.equal(audit.ok, true, audit.failures.join("\n"));
});

test("promoted capabilities carry adoption and canonicity evidence", () => {
  const shell = getClawCapabilityMaturityEntry("claw.shell.core");
  assert.ok(shell);
  assert.equal(shell.maturity, "stable");
  assert.equal(shell.promotionDecision?.adoptionCanonicityPacketId, "claw-shell-core-stable-2026-05-21");

  const promotedWithoutEvidence = defineClawCapabilityMaturityEntry({
    id: "test.promoted.without.evidence",
    steward: "claw",
    title: "Promoted without evidence",
    summary: "Fixture for adoption/canonicity promotion governance.",
    maturity: "beta",
    activationPolicy: "opt_in",
    promotionDecision: {
      ref: "adr:test",
      path: "docs/adr/0000-test.md",
    },
    surfaces: ["fixture"],
    tests: ["packages/clawjs-core/src/capability-maturity.test.ts"],
    source: { file: "fixture.ts" },
  });

  const audit = auditClawCapabilityMaturityRegistry({ version: 1, entries: [promotedWithoutEvidence] });
  assert.equal(audit.ok, false);
  assert.ok(audit.failures.some((failure) => failure.includes("requires adoptionCanonicityPacketId")));
});

test("new capability maturity defaults to incomplete and dev allowlist", () => {
  const entry = defineClawCapabilityMaturityEntry({
    id: "test.future.work",
    steward: "claw",
    title: "Future work",
    summary: "Fixture for default maturity.",
    surfaces: ["fixture"],
    tests: ["packages/clawjs-core/src/capability-maturity.test.ts"],
    source: { file: "fixture.ts" },
  });

  assert.equal(entry.maturity, "incomplete");
  assert.equal(entry.activationPolicy, "dev_allowlist");
});

test("stable activationTier excludes beta, experimental, and incomplete capabilities", () => {
  assert.equal(isMaturityAllowedInActivationTier("stable", "stable"), true);
  assert.equal(isMaturityAllowedInActivationTier("beta", "stable"), false);
  assert.equal(isMaturityAllowedInActivationTier("experimental", "stable"), false);
  assert.equal(isMaturityAllowedInActivationTier("incomplete", "stable"), false);
});

test("activationTier ceiling and opt-in both gate activation", () => {
  const telemetry = getClawCapabilityMaturityEntry("system.telemetry.cpu.monitoring");
  assert.ok(telemetry);

  const stableDecision = evaluateClawCapabilityMaturity(telemetry, { activationTier: "stable" });
  assert.equal(stableDecision.allowed, false);
  assert.equal(stableDecision.code, "maturity_blocked");
  assert.equal(stableDecision.requiredActivationTier, "experimental");

  const eligibleButDisabled = evaluateClawCapabilityMaturity(telemetry, { activationTier: "experimental" });
  assert.equal(eligibleButDisabled.allowed, false);
  assert.equal(eligibleButDisabled.code, "opt_in_required");

  const enabled = evaluateClawCapabilityMaturity(telemetry, {
    activationTier: "experimental",
    enabledCapabilityIds: ["system.telemetry.cpu.monitoring"],
  });
  assert.equal(enabled.allowed, true);
  assert.equal(enabled.code, "allowed");
});

test("incomplete capabilities require dev activationTier and explicit dev allowlist", () => {
  const incomplete = getClawCapabilityMaturityEntry("claw.dev.incomplete-work");
  assert.ok(incomplete);

  assert.equal(evaluateClawCapabilityMaturity(incomplete, { activationTier: "experimental" }).code, "maturity_blocked");
  assert.equal(evaluateClawCapabilityMaturity(incomplete, { activationTier: "dev" }).code, "dev_allowlist_required");
  assert.equal(
    evaluateClawCapabilityMaturity(incomplete, {
      activationTier: "dev",
      devAllowlistCapabilityIds: ["claw.dev.incomplete-work"],
    }).allowed,
    true,
  );
});

test("activationTier parsing is fail-closed to stable", () => {
  assert.equal(resolveClawMaturityActivationTier("beta"), "beta");
  assert.equal(resolveClawMaturityActivationTier("unknown"), "stable");
  assert.equal(resolveClawMaturityActivationTier(undefined), "stable");
});
