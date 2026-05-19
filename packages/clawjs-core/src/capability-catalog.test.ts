import assert from "node:assert/strict";
import { test } from "vitest";

import {
  buildCustomAppCapabilityRiskMap,
  getClawCapability,
  listClawCapabilities,
  sdkFirstCapabilityCatalogSource,
} from "./capability-catalog.ts";

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

test("capability lookup returns defensive copies", () => {
  const first = getClawCapability("search.query");
  assert.ok(first);
  first.surfaces[0].status = "blocked";

  const second = getClawCapability("search.query");
  assert.equal(second?.surfaces[0].status, "available");
});
