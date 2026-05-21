import assert from "node:assert/strict";
import { test } from "vitest";

import {
  auditClawCapabilityMaturityRegistry,
  defineClawCapabilityMaturityEntry,
  evaluateClawCapabilityMaturity,
  getClawCapabilityMaturityEntry,
  isMaturityAllowedInProfile,
  resolveClawMaturityProfile,
} from "./capability-maturity.ts";

test("capability maturity registry satisfies the first governance invariants", () => {
  const audit = auditClawCapabilityMaturityRegistry();
  assert.equal(audit.ok, true, audit.failures.join("\n"));
});

test("new capability maturity defaults to incomplete and dev allowlist", () => {
  const entry = defineClawCapabilityMaturityEntry({
    id: "test.future.work",
    owner: "claw",
    title: "Future work",
    summary: "Fixture for default maturity.",
    surfaces: ["fixture"],
    tests: ["packages/clawjs-core/src/capability-maturity.test.ts"],
    source: { file: "fixture.ts" },
  });

  assert.equal(entry.maturity, "incomplete");
  assert.equal(entry.activationPolicy, "dev_allowlist");
});

test("stable profile excludes beta, experimental, and incomplete capabilities", () => {
  assert.equal(isMaturityAllowedInProfile("stable", "stable"), true);
  assert.equal(isMaturityAllowedInProfile("beta", "stable"), false);
  assert.equal(isMaturityAllowedInProfile("experimental", "stable"), false);
  assert.equal(isMaturityAllowedInProfile("incomplete", "stable"), false);
});

test("profile ceiling and opt-in both gate activation", () => {
  const telemetry = getClawCapabilityMaturityEntry("system.telemetry.cpu.monitoring");
  assert.ok(telemetry);

  const stableDecision = evaluateClawCapabilityMaturity(telemetry, { profile: "stable" });
  assert.equal(stableDecision.allowed, false);
  assert.equal(stableDecision.code, "maturity_blocked");
  assert.equal(stableDecision.requiredProfile, "experimental");

  const eligibleButDisabled = evaluateClawCapabilityMaturity(telemetry, { profile: "experimental" });
  assert.equal(eligibleButDisabled.allowed, false);
  assert.equal(eligibleButDisabled.code, "opt_in_required");

  const enabled = evaluateClawCapabilityMaturity(telemetry, {
    profile: "experimental",
    enabledCapabilityIds: ["system.telemetry.cpu.monitoring"],
  });
  assert.equal(enabled.allowed, true);
  assert.equal(enabled.code, "allowed");
});

test("incomplete capabilities require dev profile and explicit dev allowlist", () => {
  const incomplete = getClawCapabilityMaturityEntry("claw.dev.incomplete-work");
  assert.ok(incomplete);

  assert.equal(evaluateClawCapabilityMaturity(incomplete, { profile: "experimental" }).code, "maturity_blocked");
  assert.equal(evaluateClawCapabilityMaturity(incomplete, { profile: "dev" }).code, "dev_allowlist_required");
  assert.equal(
    evaluateClawCapabilityMaturity(incomplete, {
      profile: "dev",
      devAllowlistCapabilityIds: ["claw.dev.incomplete-work"],
    }).allowed,
    true,
  );
});

test("profile parsing is fail-closed to stable", () => {
  assert.equal(resolveClawMaturityProfile("beta"), "beta");
  assert.equal(resolveClawMaturityProfile("unknown"), "stable");
  assert.equal(resolveClawMaturityProfile(undefined), "stable");
});
