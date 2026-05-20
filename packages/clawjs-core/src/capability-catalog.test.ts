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
import {
  CUSTOM_APP_SDK_SCHEMA_REFS,
  getCustomAppSDKSchema,
} from "./custom-app-sdk-contracts.ts";
import { buildCustomAppSDKInspectionPayload } from "./custom-app-sdk-inspection.ts";

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

test("custom-app read capabilities point at resolvable SDK schemas and stream events", () => {
  for (const capability of listClawCapabilities()) {
    if (capability.customAppAccess !== "localWide") continue;
    assert.ok(capability.inputSchemaRef, capability.id);
    assert.ok(capability.outputSchemaRef, capability.id);
    assert.ok(getCustomAppSDKSchema(capability.inputSchemaRef), `${capability.id}:input`);
    assert.ok(getCustomAppSDKSchema(capability.outputSchemaRef), `${capability.id}:output`);
    assert.equal(capability.eventSchemaRefs?.cancel, CUSTOM_APP_SDK_SCHEMA_REFS.requestCancel, capability.id);
    assert.equal(capability.eventSchemaRefs?.progress, CUSTOM_APP_SDK_SCHEMA_REFS.requestProgress, capability.id);
    assert.equal(capability.eventSchemaRefs?.partial, CUSTOM_APP_SDK_SCHEMA_REFS.requestPartial, capability.id);
  }
});

test("approval-required custom-app capabilities point at resolvable high-risk schemas", () => {
  for (const capability of listClawCapabilities()) {
    if (capability.customAppAccess !== "approvalRequired") continue;
    assert.ok(capability.inputSchemaRef, capability.id);
    assert.ok(capability.outputSchemaRef, capability.id);
    assert.ok(getCustomAppSDKSchema(capability.inputSchemaRef), `${capability.id}:input`);
    assert.ok(getCustomAppSDKSchema(capability.outputSchemaRef), `${capability.id}:output`);
  }
});

test("custom-app SDK inspection payload has no missing schema refs", () => {
  const payload = buildCustomAppSDKInspectionPayload();

  assert.equal(payload.schemaVersion, 1);
  assert.deepEqual(payload.missingSchemaRefs, []);
  assert.ok(payload.schemaRefs.includes(CUSTOM_APP_SDK_SCHEMA_REFS.searchQuery));
  assert.ok(payload.schemaRefs.includes("claw.mac.actionRequest.v1"));
  assert.ok(payload.schemaRefs.includes(CUSTOM_APP_SDK_SCHEMA_REFS.requestPartial));
  assert.ok(payload.capabilities.some((capability) => capability.id === "resources.read"));
  assert.ok(payload.capabilities.some((capability) => capability.id === "mac.action.plan"));
  assert.ok(payload.referencedSchemaRefs.includes("claw.actions.invoke.v1"));
  assert.ok(payload.riskMap.approvalRequired.includes("actions.invoke"));
});

test("custom-app SDK inspection payload exposes dispatch availability and gaps", () => {
  const payload = buildCustomAppSDKInspectionPayload();
  const byId = new Map(payload.capabilities.map((capability) => [capability.id, capability]));

  assert.equal(byId.get("search.query")?.dispatch?.status, "available");
  assert.equal(byId.get("search.query")?.dispatch?.mode, "localWideRead");
  assert.equal(byId.get("search.query")?.dispatch?.approvalRequired, false);
  assert.equal(byId.get("mac.action.plan")?.dispatch?.status, "available");
  assert.equal(byId.get("mac.action.plan")?.dispatch?.mode, "approvalRequiredPlanOnly");
  assert.equal(byId.get("iot.device.action.invoke")?.dispatch?.mode, "approvalRequiredDispatch");
  assert.equal(byId.get("iot.device.action.invoke")?.dispatch?.externalValidation, "EXTERNAL PENDING");
  assert.equal(byId.get("actions.invoke")?.dispatch?.status, "unavailable");
  assert.equal(byId.get("actions.invoke")?.dispatch?.mode, "approvalRequiredNoRunner");
  assert.equal(byId.get("secrets.broker")?.dispatch?.status, "unavailable");
  assert.equal(byId.get("secrets.broker")?.dispatch?.mode, "approvalRequiredNoPlaintextBroker");
});

test("custom-app SDK schemas validate current Search DB and resource bridge payloads", () => {
  const record = {
    id: "task-1",
    collection: "tasks",
    title: "Launch",
    createdAt: "2026-05-19T00:00:00Z",
    updatedAt: "2026-05-19T00:00:00Z",
    data: { title: "Launch" },
    redactedFields: ["apiKey"],
    redactionPolicy: CUSTOM_APP_REDACTION_POLICY_ID,
  };
  const resource = {
    schemaVersion: 1,
    id: "res_instruction1",
    kind: "instruction",
    status: "active",
    locator: { kind: "path", value: "/tmp/instruction.md" },
    scope: {},
    createdAt: "2026-05-19T00:00:00Z",
    updatedAt: "2026-05-19T00:00:00Z",
  };

  assert.equal(getCustomAppSDKSchema(CUSTOM_APP_SDK_SCHEMA_REFS.searchQuery)?.safeParse({
    query: "launch",
    collections: ["tasks"],
    limit: 25,
    cursor: "b2Zmc2V0OjI1",
    facets: ["status"],
  }).success, true);
  assert.equal(getCustomAppSDKSchema(CUSTOM_APP_SDK_SCHEMA_REFS.searchResults)?.safeParse({
    query: "launch",
    collections: ["tasks"],
    items: [record],
    limit: 25,
    offset: 0,
    nextCursor: null,
    facets: { status: [{ value: "todo", count: 1 }] },
    source: "search.query",
  }).success, true);
  assert.equal(getCustomAppSDKSchema(CUSTOM_APP_SDK_SCHEMA_REFS.dbQuery)?.safeParse({
    collection: "tasks",
    filter: { status: "todo", archivedAt: { isNull: true }, priority: { neq: "low" } },
    search: "launch",
    sort: "-updatedAt",
    limit: 50,
    offset: 0,
    facets: ["status"],
  }).success, true);
  assert.equal(getCustomAppSDKSchema(CUSTOM_APP_SDK_SCHEMA_REFS.dbRecords)?.safeParse({
    collection: "tasks",
    items: [record],
    limit: 50,
    offset: 0,
    total: 1,
    nextCursor: null,
    facets: { status: [{ value: "todo", count: 1 }] },
    source: "db.query",
  }).success, true);
  assert.equal(getCustomAppSDKSchema(CUSTOM_APP_SDK_SCHEMA_REFS.resourcesRead)?.safeParse({
    id: "res_instruction1",
    maxBytes: 4096,
  }).success, true);
  assert.equal(getCustomAppSDKSchema(CUSTOM_APP_SDK_SCHEMA_REFS.resourcesPayload)?.safeParse({
    resource,
    content: "read me",
    truncated: false,
    redactionPolicy: CUSTOM_APP_REDACTION_POLICY_ID,
    source: "resources.read",
  }).success, true);
  assert.equal(getCustomAppSDKSchema(CUSTOM_APP_SDK_SCHEMA_REFS.requestPartial)?.safeParse({
    source: "search.query",
    collection: "tasks",
    items: [record],
    partialCount: 1,
    progress: 0.5,
  }).success, true);
});

test("custom-app SDK schemas validate high-risk action contracts without bypass fields", () => {
  assert.equal(getCustomAppSDKSchema("claw.actions.invoke.v1")?.safeParse({
    action: "tasks.create",
    arguments: { title: "Launch" },
    dryRun: true,
    reason: "Create a workspace task",
  }).success, true);
  assert.equal(getCustomAppSDKSchema("claw.actions.receipt.v1")?.safeParse({
    capabilityId: "actions.invoke",
    action: "tasks.create",
    outcome: "planned",
    source: "actions.invoke",
  }).success, true);
  assert.equal(getCustomAppSDKSchema("claw.secrets.broker.v1")?.safeParse({
    operation: "lease",
    secretRef: "sec_provider_token",
    purpose: "Call provider",
    ttlSeconds: 300,
  }).success, true);
  assert.equal(getCustomAppSDKSchema("claw.secrets.broker.v1")?.safeParse({
    operation: "lease",
    secretRef: "sec_provider_token",
    plaintext: "must-not-pass",
  }).success, false);
  assert.equal(getCustomAppSDKSchema("claw.mac.actionRequest.v1")?.safeParse({
    capabilityId: "mac.window.move",
    arguments: { app: "Safari", x: "20", y: "40" },
    dryRun: true,
  }).success, true);
  assert.equal(getCustomAppSDKSchema("claw.mac.actionRequest.v1")?.safeParse({
    capabilityId: "mac.window.close",
    execute: true,
  }).success, false);
  assert.equal(getCustomAppSDKSchema("claw.mac.actionPlan.v1")?.safeParse({
    schemaVersion: 1,
    planId: "macplan_1",
    requestId: "macreq_1",
    capabilityId: "mac.window.move",
    risk: "low",
    coverageState: "executable",
    requiredApprovals: [],
    willMutate: true,
    executable: true,
    blockedReasons: [],
    relatedSurfaces: ["mac_control"],
  }).success, true);
  assert.equal(getCustomAppSDKSchema("claw.iot.action.v1")?.safeParse({
    action: "turn_on",
    targets: ["light-1"],
  }).success, true);
  assert.equal(getCustomAppSDKSchema("claw.iot.actionResult.v1")?.safeParse({
    status: "ok",
    changed: true,
    source: "iot.device.action.invoke",
  }).success, true);
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
