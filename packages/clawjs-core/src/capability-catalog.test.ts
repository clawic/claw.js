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
  assert.ok(ids.includes("resources.list"));
  assert.ok(ids.includes("resources.read"));
  assert.ok(ids.includes("system.telemetry.snapshot"));
  assert.ok(ids.includes("system.telemetry.history"));
  assert.ok(ids.includes("jobs.list"));
  assert.ok(ids.includes("jobs.get"));
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
  assert.ok(riskMap.ordinaryAccess.includes("resources.list"));
  assert.ok(riskMap.ordinaryAccess.includes("resources.read"));
  assert.ok(riskMap.ordinaryAccess.includes("system.telemetry.snapshot"));
  assert.ok(riskMap.ordinaryAccess.includes("system.telemetry.history"));
  assert.ok(riskMap.ordinaryAccess.includes("jobs.list"));
  assert.ok(riskMap.ordinaryAccess.includes("jobs.get"));
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
  assert.ok(payload.schemaRefs.includes(CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetrySnapshot));
  assert.ok(payload.schemaRefs.includes(CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetryHistory));
  assert.ok(payload.schemaRefs.includes(CUSTOM_APP_SDK_SCHEMA_REFS.jobsList));
  assert.ok(payload.schemaRefs.includes(CUSTOM_APP_SDK_SCHEMA_REFS.jobsListResult));
  assert.ok(payload.schemaRefs.includes(CUSTOM_APP_SDK_SCHEMA_REFS.jobsGet));
  assert.ok(payload.schemaRefs.includes(CUSTOM_APP_SDK_SCHEMA_REFS.jobsDetail));
  assert.ok(payload.schemaRefs.includes(CUSTOM_APP_SDK_SCHEMA_REFS.resourcesList));
  assert.ok(payload.schemaRefs.includes(CUSTOM_APP_SDK_SCHEMA_REFS.resourcesListResult));
  assert.ok(payload.schemaRefs.includes("claw.mac.actionRequest.v1"));
  assert.ok(payload.schemaRefs.includes(CUSTOM_APP_SDK_SCHEMA_REFS.requestPartial));
  assert.ok(payload.capabilities.some((capability) => capability.id === "resources.list"));
  assert.ok(payload.capabilities.some((capability) => capability.id === "resources.read"));
  assert.ok(payload.capabilities.some((capability) => capability.id === "system.telemetry.snapshot"));
  assert.ok(payload.capabilities.some((capability) => capability.id === "system.telemetry.history"));
  assert.ok(payload.capabilities.some((capability) => capability.id === "jobs.list"));
  assert.ok(payload.capabilities.some((capability) => capability.id === "jobs.get"));
  assert.ok(payload.capabilities.some((capability) => capability.id === "mac.action.plan"));
  assert.ok(payload.referencedSchemaRefs.includes("claw.actions.invoke.v1"));
  assert.ok(payload.riskMap.approvalRequired.includes("actions.invoke"));
});

test("custom-app SDK inspection payload exposes dispatch availability and gaps", () => {
  const payload = buildCustomAppSDKInspectionPayload();
  const byId = new Map(payload.capabilities.map((capability) => [capability.id, capability]));

  assert.equal(payload.executionBoundary.kind, "metadata_only_contract_catalog");
  assert.equal(payload.executionBoundary.executesCapabilityCalls, false);
  assert.equal(payload.executionBoundary.richUiExecutionPath, "sdk_host_bridge");
  assert.equal(payload.executionBoundary.localExecutableSurface, "host_bridge");
  assert.equal(payload.executionBoundary.dbSearchExecution, "host_bridge_only");
  assert.deepEqual(payload.executionBoundary.nonExecutableSurfaces, [
    "cli.inspect",
    "service_api.contracts",
    "mcp.custom_app_sdk",
    "relay.remote.custom_app_sdk",
  ]);
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
  assert.equal(getCustomAppSDKSchema(CUSTOM_APP_SDK_SCHEMA_REFS.resourcesList)?.safeParse({
    status: "active",
    kind: "instruction",
  }).success, true);
  assert.equal(getCustomAppSDKSchema(CUSTOM_APP_SDK_SCHEMA_REFS.resourcesListResult)?.safeParse({
    items: [resource],
    source: "resources.list",
  }).success, true);
  assert.equal(getCustomAppSDKSchema(CUSTOM_APP_SDK_SCHEMA_REFS.jobsList)?.safeParse({
    kind: "search.run",
    status: "completed",
    limit: 10,
  }).success, true);
  assert.equal(getCustomAppSDKSchema(CUSTOM_APP_SDK_SCHEMA_REFS.jobsListResult)?.safeParse({
    items: [{
      id: "run-1",
      kind: "search.run",
      status: "completed",
      startedAt: "2026-05-20T00:00:00Z",
      endedAt: null,
      createdAt: "2026-05-20T00:00:00Z",
      source: "index.runs",
      metadata: { searchId: "search-1" },
      redactionPolicy: CUSTOM_APP_REDACTION_POLICY_ID,
    }],
    source: "jobs.list",
    redactionPolicy: CUSTOM_APP_REDACTION_POLICY_ID,
  }).success, true);
  assert.equal(getCustomAppSDKSchema(CUSTOM_APP_SDK_SCHEMA_REFS.jobsGet)?.safeParse({
    id: "run-1",
  }).success, true);
  assert.equal(getCustomAppSDKSchema(CUSTOM_APP_SDK_SCHEMA_REFS.jobsDetail)?.safeParse({
    run: {
      id: "run-1",
      kind: "search.run",
      status: "completed",
      startedAt: "2026-05-20T00:00:00Z",
      endedAt: null,
      createdAt: "2026-05-20T00:00:00Z",
      source: "index.runs",
      metadata: { searchId: "search-1" },
      redactionPolicy: CUSTOM_APP_REDACTION_POLICY_ID,
    },
    entities: [{
      id: "entity-1",
      typeId: "type-1",
      typeName: "Task",
      title: "Launch",
      firstSeenAt: "2026-05-20T00:00:00Z",
      lastSeenAt: "2026-05-20T00:00:00Z",
      observationCount: 2,
      hasSourceUrl: true,
      hasThumbnail: true,
      redactionPolicy: CUSTOM_APP_REDACTION_POLICY_ID,
    }],
    source: "jobs.get",
    redactionPolicy: CUSTOM_APP_REDACTION_POLICY_ID,
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

test("custom-app DB query schema rejects collection creation and direct SQL escape hatches", () => {
  const dbQuery = getCustomAppSDKSchema(CUSTOM_APP_SDK_SCHEMA_REFS.dbQuery);
  const searchQuery = getCustomAppSDKSchema(CUSTOM_APP_SDK_SCHEMA_REFS.searchQuery);

  assert.equal(dbQuery?.safeParse({
    collection: "lab_results",
    filter: { patientId: "fixture_patient_ada" },
    limit: 25,
  }).success, true);
  assert.equal(dbQuery?.safeParse({
    collection: "../core.sqlite",
    filter: {},
  }).success, false);
  assert.equal(dbQuery?.safeParse({
    collection: "sqlite_master",
    filter: {},
  }).success, false);
  assert.equal(dbQuery?.safeParse({
    collection: "tasks",
    sql: "SELECT * FROM tasks",
  }).success, false);
  assert.equal(dbQuery?.safeParse({
    collection: "tasks",
    createCollection: "custom_metrics",
    schema: { fields: [{ name: "value", type: "number" }] },
  }).success, false);
  assert.equal(dbQuery?.safeParse({
    collection: "tasks",
    migration: "ALTER TABLE tasks ADD COLUMN raw_secret TEXT",
  }).success, false);
  assert.equal(searchQuery?.safeParse({
    query: "launch",
    collections: ["tasks", "sqlite_master"],
  }).success, false);
});

test("custom-app SDK schemas validate read-only system telemetry contracts", () => {
  const sample = {
    key: "system.memory.used",
    value: 2048,
    unit: "bytes",
    capturedAt: "2026-05-19T00:00:00Z",
    availability: "available",
    source: { adapter: "node", confidence: "official" },
    quality: "ok",
  };

  assert.equal(getCustomAppSDKSchema(CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetrySnapshotRequest)?.safeParse({
    source: "local",
    metricKeys: ["system.memory.used"],
    includeUnavailable: true,
  }).success, true);
  assert.equal(getCustomAppSDKSchema(CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetrySnapshotRequest)?.safeParse({
    source: "host",
  }).success, false);
  assert.equal(getCustomAppSDKSchema(CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetrySnapshot)?.safeParse({
    schemaVersion: 1,
    generatedAt: "2026-05-19T00:00:00Z",
    host: { platform: "darwin", arch: "arm64", id: "local" },
    policy: {
      defaultAgentAccess: "safe_read",
      sensitiveRequiresGrant: true,
      controlsRequireSignedHostBroker: true,
    },
    samples: [sample],
    unavailableMetrics: ["system.sensor.temperature"],
    source: "system.telemetry.snapshot",
    redactionPolicy: CUSTOM_APP_REDACTION_POLICY_ID,
  }).success, true);
  assert.equal(getCustomAppSDKSchema(CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetryHistoryRequest)?.safeParse({
    metricKey: "system.memory.used",
    range: "24h",
  }).success, true);
  assert.equal(getCustomAppSDKSchema(CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetryHistory)?.safeParse({
    metricKey: "system.memory.used",
    rangeMs: 86_400_000,
    retention: { store: "monitor.sqlite", status: "recorded" },
    samples: [{ metricKey: "system.memory.used", value: 2048, unit: "bytes", capturedAt: 1 }],
    rollups: [{ metricKey: "system.memory.used", bucketMs: 60_000, count: 1 }],
    incidents: [{ metricKey: "system.memory.used", ruleId: "memory-any", status: "open" }],
    chart: { kind: "line", source: "metric_samples", empty: false, points: [{ value: 2048 }] },
    render: { kind: "ascii_sparkline", source: "metric_samples", empty: false, line: "*" },
    source: "system.telemetry.history",
    redactionPolicy: CUSTOM_APP_REDACTION_POLICY_ID,
  }).success, true);
  assert.equal(getCustomAppSDKSchema(CUSTOM_APP_SDK_SCHEMA_REFS.requestPartial)?.safeParse({
    source: "system.telemetry.history",
    progress: 0.5,
    partialCount: 1,
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
