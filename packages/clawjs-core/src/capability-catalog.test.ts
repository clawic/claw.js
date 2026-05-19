import assert from "node:assert/strict";
import { test } from "vitest";

import {
  buildCustomAppCapabilityRiskMap,
  getClawCapability,
  listClawCapabilities,
  sdkFirstCapabilityCatalogSource,
} from "./capability-catalog.ts";
import {
  CUSTOM_APP_REDACTION_POLICY_ID,
  isCustomAppSensitiveField,
  redactCustomAppRecord,
} from "./custom-app-redaction-policy.ts";

test("SDK-first capability catalog exposes baseline custom-app contracts", () => {
  const ids = listClawCapabilities().map((capability) => capability.id);

  assert.ok(ids.includes("search.query"));
  assert.ok(ids.includes("db.query"));
  assert.ok(ids.includes("resources.read"));
  assert.ok(ids.includes("actions.invoke"));
  assert.ok(ids.includes("secrets.broker"));
  assert.ok(ids.includes("mac.action.plan"));
  assert.ok(ids.includes("iot.device.action.invoke"));
  assert.match(sdkFirstCapabilityCatalogSource(), /sdk-first-custom-surfaces/);
});

test("stable capabilities declare SDK and CLI coverage or an explicit gap", () => {
  for (const capability of listClawCapabilities()) {
    assert.equal(Boolean(capability.id), true);
    assert.equal(Boolean(capability.domain), true);
    assert.equal(capability.surfaces.some((surface) => surface.surface === "sdk"), true, capability.id);
    assert.equal(capability.surfaces.some((surface) => surface.surface === "cli"), true, capability.id);
    for (const surface of capability.surfaces) {
      if (surface.status === "available") {
        assert.equal(Boolean(surface.ref), true, `${capability.id}:${surface.surface}`);
      } else {
        assert.ok(["pending", "blocked", "notApplicable"].includes(surface.status), `${capability.id}:${surface.surface}`);
      }
    }
  }
});

test("custom app authority is broad for ordinary reads and approval-gated for high risk", () => {
  const riskMap = buildCustomAppCapabilityRiskMap();

  assert.deepEqual(riskMap.authorityModel, "localWideReadsHighRiskApproval");
  assert.ok(riskMap.ordinaryAccess.includes("search.query"));
  assert.ok(riskMap.ordinaryAccess.includes("db.query"));
  assert.ok(riskMap.ordinaryAccess.includes("resources.read"));
  assert.ok(riskMap.approvalRequired.includes("actions.invoke"));
  assert.ok(riskMap.approvalRequired.includes("secrets.broker"));
  assert.ok(riskMap.approvalRequired.includes("mac.action.plan"));
  assert.ok(riskMap.approvalRequired.includes("iot.device.action.invoke"));
  assert.deepEqual(new Set(riskMap.highRisk), new Set(riskMap.approvalRequired));
});

test("ordinary custom-app access cannot include high-risk behavior", () => {
  for (const capability of listClawCapabilities()) {
    if (capability.customAppAccess !== "localWide") continue;
    assert.equal(capability.operation, "read", capability.id);
    assert.equal(capability.risk.interruptiveApproval, false, capability.id);
    assert.equal(capability.risk.writesUserData ?? false, false, capability.id);
    assert.equal(capability.risk.mutatesExternalState ?? false, false, capability.id);
    assert.equal(capability.risk.destructive ?? false, false, capability.id);
    assert.equal(capability.risk.costBearing ?? false, false, capability.id);
    assert.equal(capability.risk.touchesSecrets ?? false, false, capability.id);
    assert.equal(capability.risk.touchesNativeHost ?? false, false, capability.id);
    assert.equal(capability.risk.touchesPhysicalWorld ?? false, false, capability.id);
    assert.equal(capability.risk.regulatedReview ?? false, false, capability.id);
  }
});

test("approval-required custom-app access is interruptive high risk", () => {
  for (const capability of listClawCapabilities()) {
    if (capability.customAppAccess !== "approvalRequired") continue;
    assert.equal(capability.risk.interruptiveApproval, true, capability.id);
    assert.ok(["high", "critical"].includes(capability.risk.tier), capability.id);
  }
});

test("custom apps do not receive direct SQLite or plaintext secret capabilities", () => {
  for (const capability of listClawCapabilities()) {
    const text = JSON.stringify(capability).toLowerCase();
    assert.equal(capability.surfaces.some((surface) => surface.ref?.includes("core.sqlite")), false, capability.id);
    if (capability.id === "secrets.broker") {
      assert.equal(capability.risk.touchesSecrets, true);
      assert.equal(capability.customAppAccess, "approvalRequired");
      assert.equal(text.includes("customappaccess\":\"localwide"), false);
    }
  }
});

test("ordinary custom-app read capabilities declare the shared redaction policy", () => {
  for (const capability of listClawCapabilities()) {
    if (capability.customAppAccess !== "localWide") continue;
    assert.equal(capability.redactionPolicyRef, CUSTOM_APP_REDACTION_POLICY_ID, capability.id);
  }
});

test("custom app redaction policy hides sensitive field names without removing provenance", () => {
  assert.equal(isCustomAppSensitiveField("api_key"), true);
  assert.equal(isCustomAppSensitiveField("refresh-token"), true);
  assert.equal(isCustomAppSensitiveField("displayName"), false);

  const redacted = redactCustomAppRecord({
    title: "Launch",
    apiKey: "secret-value",
    password: "hidden",
  });

  assert.equal(redacted.policyId, CUSTOM_APP_REDACTION_POLICY_ID);
  assert.deepEqual(redacted.data, { title: "Launch" });
  assert.deepEqual(redacted.redactedFields, ["apiKey", "password"]);
});

test("capability lookup returns defensive copies", () => {
  const first = getClawCapability("search.query");
  assert.ok(first);
  first.surfaces[0].status = "blocked";

  const second = getClawCapability("search.query");
  assert.equal(second?.surfaces[0].status, "available");
});
