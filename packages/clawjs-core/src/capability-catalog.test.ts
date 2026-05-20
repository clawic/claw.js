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

const CANONICAL_CAPABILITY_SURFACES = ["sdk", "cli", "serviceApi", "mcp", "relay", "hostBridge"];
const EXPECTED_CUSTOM_APP_CAPABILITY_IDS = [
  "actions.invoke",
  "db.query",
  "iot.device.action.invoke",
  "jobs.cancel",
  "jobs.events",
  "jobs.get",
  "jobs.list",
  "jobs.start",
  "jobs.stream",
  "mac.action.plan",
  "resources.list",
  "resources.read",
  "search.query",
  "secrets.broker",
  "system.telemetry.control.plan",
  "system.telemetry.history",
  "system.telemetry.metrics",
  "system.telemetry.providers",
  "system.telemetry.snapshot",
  "system.telemetry.widgets",
];
const EXPECTED_ORDINARY_ACCESS_CAPABILITY_IDS = [
  "db.query",
  "jobs.events",
  "jobs.get",
  "jobs.list",
  "jobs.stream",
  "resources.list",
  "resources.read",
  "search.query",
  "system.telemetry.history",
  "system.telemetry.metrics",
  "system.telemetry.providers",
  "system.telemetry.snapshot",
  "system.telemetry.widgets",
];
const EXPECTED_APPROVAL_REQUIRED_CAPABILITY_IDS = [
  "actions.invoke",
  "iot.device.action.invoke",
  "jobs.cancel",
  "jobs.start",
  "mac.action.plan",
  "secrets.broker",
  "system.telemetry.control.plan",
];
const EXPECTED_CLI_BLOCKED_CAPABILITY_IDS = [
  "jobs.cancel",
  "jobs.events",
  "jobs.get",
  "jobs.list",
  "jobs.start",
  "jobs.stream",
];
const EXPECTED_MCP_METADATA_PROJECTION_CAPABILITY_IDS = [
  "actions.invoke",
  "db.query",
  "iot.device.action.invoke",
  "jobs.cancel",
  "jobs.events",
  "jobs.get",
  "jobs.list",
  "jobs.start",
  "jobs.stream",
];
const EXPECTED_MCP_BLOCKED_CAPABILITY_IDS = ["secrets.broker"];
const EXPECTED_RELAY_METADATA_PROJECTION_CAPABILITY_IDS = [
  "actions.invoke",
  "iot.device.action.invoke",
  "jobs.cancel",
  "jobs.events",
  "jobs.get",
  "jobs.list",
  "jobs.start",
  "jobs.stream",
  "mac.action.plan",
  "resources.list",
  "resources.read",
  "system.telemetry.control.plan",
  "system.telemetry.history",
  "system.telemetry.metrics",
  "system.telemetry.providers",
  "system.telemetry.snapshot",
  "system.telemetry.widgets",
];
const EXPECTED_LOCAL_WIDE_DISPATCH_CAPABILITY_IDS = EXPECTED_ORDINARY_ACCESS_CAPABILITY_IDS;
const EXPECTED_APPROVAL_DISPATCH_CAPABILITY_IDS = [
  "iot.device.action.invoke",
  "jobs.cancel",
  "jobs.start",
];
const EXPECTED_PLAN_ONLY_DISPATCH_CAPABILITY_IDS = ["mac.action.plan", "system.telemetry.control.plan"];
const EXPECTED_NO_RUNNER_DISPATCH_CAPABILITY_IDS = ["actions.invoke"];
const EXPECTED_NO_PLAINTEXT_BROKER_DISPATCH_CAPABILITY_IDS = ["secrets.broker"];
const EXPECTED_EXTERNAL_PENDING_DISPATCH_CAPABILITY_IDS = ["iot.device.action.invoke"];
const sorted = (items: readonly string[]) => [...items].sort();

test("SDK-first capability catalog exposes baseline custom-app contracts", () => {
  const ids = listClawCapabilities().map((capability) => capability.id).sort();

  assert.deepEqual(ids, EXPECTED_CUSTOM_APP_CAPABILITY_IDS);
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
        assert.ok(["blocked", "notApplicable"].includes(surface.status), `${capability.id}:${surface.surface}`);
      }
    }
  }
});

test("published capability surface bindings are complete and resolved", () => {
  for (const capability of listClawCapabilities()) {
    assert.deepEqual(capability.surfaces.map((surface) => surface.surface), CANONICAL_CAPABILITY_SURFACES, capability.id);
    for (const surface of capability.surfaces) {
      assert.notEqual(surface.status, "pending", `${capability.id}:${surface.surface}`);
    }
  }
});

test("published capability surfaces preserve reviewed blocked and metadata-only partitions", () => {
  const idsForSurfaceStatus = (surfaceName: string, status: string) => sorted(
    listClawCapabilities()
      .filter((capability) => capability.surfaces.some((surface) => surface.surface === surfaceName && surface.status === status))
      .map((capability) => capability.id),
  );
  const idsForSurfaceRef = (surfaceName: string, ref: string) => sorted(
    listClawCapabilities()
      .filter((capability) => capability.surfaces.some((surface) => surface.surface === surfaceName && surface.ref === ref))
      .map((capability) => capability.id),
  );

  assert.deepEqual(idsForSurfaceStatus("cli", "blocked"), EXPECTED_CLI_BLOCKED_CAPABILITY_IDS);
  assert.deepEqual(idsForSurfaceStatus("mcp", "blocked"), EXPECTED_MCP_BLOCKED_CAPABILITY_IDS);
  assert.deepEqual(idsForSurfaceRef("mcp", "clawjs.custom_app_sdk metadata-only contract projection"), EXPECTED_MCP_METADATA_PROJECTION_CAPABILITY_IDS);
  assert.deepEqual(idsForSurfaceRef("relay", "relay.remote.custom_app_sdk metadata-only contract projection"), EXPECTED_RELAY_METADATA_PROJECTION_CAPABILITY_IDS);
});

test("available SDK surface bindings do not advertise future facades", () => {
  for (const capability of listClawCapabilities()) {
    const sdkSurface = capability.surfaces.find((surface) => surface.surface === "sdk");
    assert.equal(sdkSurface?.status, "available", capability.id);
    const ref = sdkSurface?.ref ?? "";
    assert.notEqual(ref, "", capability.id);
    assert.equal(/future/i.test(ref), false, `${capability.id}:sdk`);
  }
});

test("available surface refs are concrete rather than conditional placeholders", () => {
  const conditionalRefPattern = /\b(when|unless|classified)\b/i;

  for (const capability of listClawCapabilities()) {
    for (const surface of capability.surfaces) {
      if (surface.status !== "available") continue;
      assert.equal(conditionalRefPattern.test(surface.ref), false, `${capability.id}:${surface.surface}`);
    }
  }
});

test("custom app authority is broad for ordinary reads and approval-gated for high risk", () => {
  const riskMap = buildCustomAppCapabilityRiskMap();

  assert.deepEqual(riskMap.authorityModel, "localWideReadsHighRiskApproval");
  assert.deepEqual(sorted(riskMap.capabilityIds), EXPECTED_CUSTOM_APP_CAPABILITY_IDS);
  assert.deepEqual(sorted(riskMap.ordinaryAccess), EXPECTED_ORDINARY_ACCESS_CAPABILITY_IDS);
  assert.deepEqual(sorted(riskMap.approvalRequired), EXPECTED_APPROVAL_REQUIRED_CAPABILITY_IDS);
  assert.deepEqual(sorted(riskMap.highRisk), EXPECTED_APPROVAL_REQUIRED_CAPABILITY_IDS);
  assert.deepEqual(riskMap.blocked, []);
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

test("registered custom-app dispatch modes are explicit", () => {
  const pendingRunnerIds = new Set(["actions.invoke", "secrets.broker"]);

  for (const capability of listClawCapabilities()) {
    assert.ok(capability.dispatch, capability.id);
    assert.notEqual(capability.dispatch.mode, "unknown", capability.id);
    if (capability.dispatch.runner === "pending") {
      assert.equal(pendingRunnerIds.has(capability.id), true, capability.id);
      assert.equal(capability.dispatch.status, "unavailable", capability.id);
    }
  }
});

test("registered custom-app dispatch modes preserve reviewed partitions", () => {
  const idsForDispatchMode = (mode: string) => sorted(
    listClawCapabilities()
      .filter((capability) => capability.dispatch?.mode === mode)
      .map((capability) => capability.id),
  );
  const externalPendingIds = sorted(
    listClawCapabilities()
      .filter((capability) => capability.dispatch?.externalValidation === "EXTERNAL PENDING")
      .map((capability) => capability.id),
  );

  assert.deepEqual(idsForDispatchMode("localWideRead"), EXPECTED_LOCAL_WIDE_DISPATCH_CAPABILITY_IDS);
  assert.deepEqual(idsForDispatchMode("approvalRequiredDispatch"), EXPECTED_APPROVAL_DISPATCH_CAPABILITY_IDS);
  assert.deepEqual(idsForDispatchMode("approvalRequiredPlanOnly"), EXPECTED_PLAN_ONLY_DISPATCH_CAPABILITY_IDS);
  assert.deepEqual(idsForDispatchMode("approvalRequiredNoRunner"), EXPECTED_NO_RUNNER_DISPATCH_CAPABILITY_IDS);
  assert.deepEqual(idsForDispatchMode("approvalRequiredNoPlaintextBroker"), EXPECTED_NO_PLAINTEXT_BROKER_DISPATCH_CAPABILITY_IDS);
  assert.deepEqual(idsForDispatchMode("blocked"), []);
  assert.deepEqual(idsForDispatchMode("unclassifiedBlocked"), []);
  assert.deepEqual(externalPendingIds, EXPECTED_EXTERNAL_PENDING_DISPATCH_CAPABILITY_IDS);
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

test("runtime jobs bridge capabilities expose SDK and runtime API execution", () => {
  const stream = getClawCapability("jobs.stream");
  assert.equal(stream?.customAppAccess, "localWide");
  assert.equal(stream?.dispatch?.status, "available");
  assert.equal(stream?.dispatch?.mode, "localWideRead");
  assert.equal(stream?.surfaces.find((surface) => surface.surface === "sdk")?.status, "available");
  assert.equal(stream?.surfaces.find((surface) => surface.surface === "cli")?.status, "blocked");
  assert.equal(stream?.inputSchemaRef, CUSTOM_APP_SDK_SCHEMA_REFS.jobsStream);
  assert.equal(stream?.outputSchemaRef, CUSTOM_APP_SDK_SCHEMA_REFS.jobsStreamResult);

  for (const id of ["jobs.start", "jobs.cancel"]) {
    const capability = getClawCapability(id);
    assert.equal(capability?.customAppAccess, "approvalRequired", id);
    assert.equal(capability?.dispatch?.status, "available", id);
    assert.equal(capability?.dispatch?.mode, "approvalRequiredDispatch", id);
    assert.equal(capability?.dispatch?.approvalRequired, true, id);
    assert.equal(capability?.surfaces.find((surface) => surface.surface === "sdk")?.status, "available", id);
    assert.equal(capability?.surfaces.find((surface) => surface.surface === "cli")?.status, "blocked", id);
    assert.ok(capability?.inputSchemaRef, id);
    assert.ok(capability?.outputSchemaRef, id);
  }
});

test("jobs read capabilities do not advertise removed runtime CLI sidecars", () => {
  for (const id of ["jobs.list", "jobs.get", "jobs.events"]) {
    const capability = getClawCapability(id);
    const cliSurface = capability?.surfaces.find((surface) => surface.surface === "cli");

    assert.equal(cliSurface?.status, "blocked", id);
    assert.equal(cliSurface?.ref, undefined, id);
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
  assert.ok(payload.schemaRefs.includes(CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetryMetrics));
  assert.ok(payload.schemaRefs.includes(CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetryWidgets));
  assert.ok(payload.schemaRefs.includes(CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetryProviders));
  assert.ok(payload.schemaRefs.includes(CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetryControlPlan));
  assert.ok(payload.schemaRefs.includes(CUSTOM_APP_SDK_SCHEMA_REFS.jobsList));
  assert.ok(payload.schemaRefs.includes(CUSTOM_APP_SDK_SCHEMA_REFS.jobsListResult));
  assert.ok(payload.schemaRefs.includes(CUSTOM_APP_SDK_SCHEMA_REFS.jobsGet));
  assert.ok(payload.schemaRefs.includes(CUSTOM_APP_SDK_SCHEMA_REFS.jobsDetail));
  assert.ok(payload.schemaRefs.includes(CUSTOM_APP_SDK_SCHEMA_REFS.jobsEvents));
  assert.ok(payload.schemaRefs.includes(CUSTOM_APP_SDK_SCHEMA_REFS.jobsEventsResult));
  assert.ok(payload.schemaRefs.includes(CUSTOM_APP_SDK_SCHEMA_REFS.jobsStream));
  assert.ok(payload.schemaRefs.includes(CUSTOM_APP_SDK_SCHEMA_REFS.jobsStreamResult));
  assert.ok(payload.schemaRefs.includes(CUSTOM_APP_SDK_SCHEMA_REFS.jobsStart));
  assert.ok(payload.schemaRefs.includes(CUSTOM_APP_SDK_SCHEMA_REFS.jobsStartResult));
  assert.ok(payload.schemaRefs.includes(CUSTOM_APP_SDK_SCHEMA_REFS.jobsCancel));
  assert.ok(payload.schemaRefs.includes(CUSTOM_APP_SDK_SCHEMA_REFS.jobsCancelResult));
  assert.ok(payload.schemaRefs.includes(CUSTOM_APP_SDK_SCHEMA_REFS.resourcesList));
  assert.ok(payload.schemaRefs.includes(CUSTOM_APP_SDK_SCHEMA_REFS.resourcesListResult));
  assert.ok(payload.schemaRefs.includes("claw.mac.actionRequest.v1"));
  assert.ok(payload.schemaRefs.includes(CUSTOM_APP_SDK_SCHEMA_REFS.requestPartial));
  assert.ok(payload.capabilities.some((capability) => capability.id === "resources.list"));
  assert.ok(payload.capabilities.some((capability) => capability.id === "resources.read"));
  assert.ok(payload.capabilities.some((capability) => capability.id === "system.telemetry.snapshot"));
  assert.ok(payload.capabilities.some((capability) => capability.id === "system.telemetry.history"));
  assert.ok(payload.capabilities.some((capability) => capability.id === "system.telemetry.metrics"));
  assert.ok(payload.capabilities.some((capability) => capability.id === "system.telemetry.widgets"));
  assert.ok(payload.capabilities.some((capability) => capability.id === "system.telemetry.providers"));
  assert.ok(payload.capabilities.some((capability) => capability.id === "system.telemetry.control.plan"));
  assert.ok(payload.capabilities.some((capability) => capability.id === "jobs.list"));
  assert.ok(payload.capabilities.some((capability) => capability.id === "jobs.get"));
  assert.ok(payload.capabilities.some((capability) => capability.id === "jobs.events"));
  assert.ok(payload.capabilities.some((capability) => capability.id === "jobs.stream"));
  assert.ok(payload.capabilities.some((capability) => capability.id === "jobs.start"));
  assert.ok(payload.capabilities.some((capability) => capability.id === "jobs.cancel"));
  assert.ok(payload.capabilities.some((capability) => capability.id === "mac.action.plan"));
  assert.ok(payload.referencedSchemaRefs.includes("claw.actions.invoke.v1"));
  assert.deepEqual(sorted(payload.riskMap.capabilityIds), EXPECTED_CUSTOM_APP_CAPABILITY_IDS);
  assert.deepEqual(sorted(payload.riskMap.ordinaryAccess), EXPECTED_ORDINARY_ACCESS_CAPABILITY_IDS);
  assert.deepEqual(sorted(payload.riskMap.approvalRequired), EXPECTED_APPROVAL_REQUIRED_CAPABILITY_IDS);
  assert.deepEqual(sorted(payload.riskMap.highRisk), EXPECTED_APPROVAL_REQUIRED_CAPABILITY_IDS);
  assert.deepEqual(payload.riskMap.blocked, []);
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
  assert.equal(byId.get("system.telemetry.control.plan")?.dispatch?.status, "available");
  assert.equal(byId.get("system.telemetry.control.plan")?.dispatch?.mode, "approvalRequiredPlanOnly");
  assert.equal(byId.get("iot.device.action.invoke")?.dispatch?.mode, "approvalRequiredDispatch");
  assert.equal(byId.get("iot.device.action.invoke")?.dispatch?.externalValidation, "EXTERNAL PENDING");
  assert.equal(byId.get("actions.invoke")?.dispatch?.status, "unavailable");
  assert.equal(byId.get("actions.invoke")?.dispatch?.mode, "approvalRequiredNoRunner");
  assert.equal(byId.get("secrets.broker")?.dispatch?.status, "unavailable");
  assert.equal(byId.get("secrets.broker")?.dispatch?.mode, "approvalRequiredNoPlaintextBroker");
  assert.equal(byId.get("jobs.stream")?.dispatch?.status, "available");
  assert.equal(byId.get("jobs.stream")?.dispatch?.mode, "localWideRead");
  assert.equal(byId.get("jobs.start")?.dispatch?.status, "available");
  assert.equal(byId.get("jobs.start")?.dispatch?.mode, "approvalRequiredDispatch");
  assert.equal(byId.get("jobs.cancel")?.dispatch?.status, "available");
  assert.equal(byId.get("jobs.cancel")?.dispatch?.mode, "approvalRequiredDispatch");
});

test("custom-app SDK inspection payload exposes complete resolved surfaces", () => {
  const payload = buildCustomAppSDKInspectionPayload();

  for (const capability of payload.capabilities) {
    assert.deepEqual(capability.surfaces.map((surface) => surface.surface), CANONICAL_CAPABILITY_SURFACES, capability.id);
    for (const surface of capability.surfaces) {
      assert.notEqual(surface.status, "pending", `${capability.id}:${surface.surface}`);
      if (surface.status === "available") {
        assert.equal(Boolean(surface.ref), true, `${capability.id}:${surface.surface}`);
      } else {
        assert.equal(surface.ref, undefined, `${capability.id}:${surface.surface}`);
      }
    }
  }
});

test("custom-app MCP coverage is metadata-only for contract projections", () => {
  const payload = buildCustomAppSDKInspectionPayload();

  assert.equal(payload.executionBoundary.executesCapabilityCalls, false);
  assert.equal(payload.executionBoundary.nonExecutableSurfaces.includes("mcp.custom_app_sdk"), true);
  for (const id of EXPECTED_MCP_METADATA_PROJECTION_CAPABILITY_IDS) {
    const capability = getClawCapability(id);
    const mcpSurface = capability?.surfaces.find((surface) => surface.surface === "mcp");

    assert.equal(mcpSurface?.status, "available", id);
    assert.equal(mcpSurface?.ref, "clawjs.custom_app_sdk metadata-only contract projection", id);
  }
});

test("custom-app Relay coverage is metadata-only for local host execution", () => {
  const payload = buildCustomAppSDKInspectionPayload();

  assert.equal(payload.executionBoundary.executesCapabilityCalls, false);
  assert.equal(payload.executionBoundary.nonExecutableSurfaces.includes("relay.remote.custom_app_sdk"), true);
  for (const id of EXPECTED_RELAY_METADATA_PROJECTION_CAPABILITY_IDS) {
    const capability = getClawCapability(id);
    const relaySurface = capability?.surfaces.find((surface) => surface.surface === "relay");

    assert.equal(relaySurface?.status, "available", id);
    assert.equal(relaySurface?.ref, "relay.remote.custom_app_sdk metadata-only contract projection", id);
  }
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
  assert.equal(getCustomAppSDKSchema(CUSTOM_APP_SDK_SCHEMA_REFS.jobsEvents)?.safeParse({
    id: "run-1",
    status: "completed",
    limit: 20,
  }).success, true);
  assert.equal(getCustomAppSDKSchema(CUSTOM_APP_SDK_SCHEMA_REFS.jobsEventsResult)?.safeParse({
    items: [{
      id: "run-1:status",
      jobId: "run-1",
      kind: "job.status",
      level: "info",
      message: "Job status: completed",
      occurredAt: "2026-05-20T00:00:00Z",
      status: "completed",
      metadata: { jobKind: "search.run" },
      source: "index.runs",
      redactionPolicy: CUSTOM_APP_REDACTION_POLICY_ID,
    }],
    source: "jobs.events",
    redactionPolicy: CUSTOM_APP_REDACTION_POLICY_ID,
  }).success, true);
  assert.equal(getCustomAppSDKSchema(CUSTOM_APP_SDK_SCHEMA_REFS.jobsStream)?.safeParse({
    id: "job-1",
    after: 1,
    limit: 100,
  }).success, true);
  assert.equal(getCustomAppSDKSchema(CUSTOM_APP_SDK_SCHEMA_REFS.jobsStreamResult)?.safeParse({
    items: [{
      id: 1,
      jobId: "job-1",
      kind: "job.started",
      level: "info",
      message: "Job started",
      recordedAt: 1_765_000_000_000,
      payload: { kind: "distill" },
    }],
    source: "jobs.stream",
    redactionPolicy: CUSTOM_APP_REDACTION_POLICY_ID,
  }).success, true);
  assert.equal(getCustomAppSDKSchema(CUSTOM_APP_SDK_SCHEMA_REFS.jobsStart)?.safeParse({
    kind: "distill",
    input: { sessionId: "session-1" },
    reason: "custom app request",
  }).success, true);
  assert.equal(getCustomAppSDKSchema(CUSTOM_APP_SDK_SCHEMA_REFS.jobsStartResult)?.safeParse({
    job: {
      id: "job-1",
      kind: "distill",
      status: "completed",
      startedAt: 1_765_000_000_000,
      completedAt: 1_765_000_001_000,
      error: null,
      payload: { sessionId: "session-1" },
    },
    result: { ok: true },
    source: "runtime.jobs.start",
  }).success, true);
  assert.equal(getCustomAppSDKSchema(CUSTOM_APP_SDK_SCHEMA_REFS.jobsCancel)?.safeParse({
    id: "job-1",
    reason: "user requested",
  }).success, true);
  assert.equal(getCustomAppSDKSchema(CUSTOM_APP_SDK_SCHEMA_REFS.jobsCancelResult)?.safeParse({
    job: {
      id: "job-1",
      kind: "distill",
      status: "cancelled",
      startedAt: 1_765_000_000_000,
      completedAt: 1_765_000_001_000,
      error: null,
      payload: null,
    },
    cancelled: true,
    source: "runtime.jobs.cancel",
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
  assert.equal(getCustomAppSDKSchema(CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetryMetrics)?.safeParse({
    metrics: [{
      key: "system.memory.used",
      family: "memory",
      label: "Memory used",
      unit: "bytes",
      privacyTier: "safe_aggregate",
      sourceConfidence: "official",
      samplingCost: "low",
      support: ["snapshot", "history"],
      availability: "available",
      description: "Aggregate memory usage.",
    }],
    source: "system.telemetry.metrics",
    redactionPolicy: CUSTOM_APP_REDACTION_POLICY_ID,
  }).success, true);
  assert.equal(getCustomAppSDKSchema(CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetryWidgets)?.safeParse({
    widgets: [{
      id: "memory-used",
      metricKey: "system.memory.used",
      title: "Memory",
      presentation: "sparkline",
      placement: "both",
      enabledByDefault: true,
    }],
    source: "system.telemetry.widgets",
    redactionPolicy: CUSTOM_APP_REDACTION_POLICY_ID,
  }).success, true);
  assert.equal(getCustomAppSDKSchema(CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetryProviders)?.safeParse({
    providers: [{
      id: "weather.offline",
      kind: "weather",
      label: "Offline weather",
      mode: "offline",
      status: "ready",
      metricKeys: ["context.weather.temperature"],
      widgetIds: ["weather-temperature"],
      capabilities: ["snapshot", "history"],
      defaultEnabled: true,
      privacyTier: "precise_location",
      credentialRefRequired: false,
      freshnessMs: 900000,
      description: "Offline context provider.",
    }],
    source: "system.telemetry.providers",
    redactionPolicy: CUSTOM_APP_REDACTION_POLICY_ID,
  }).success, true);
  assert.equal(getCustomAppSDKSchema(CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetryControlPlan)?.safeParse({
    schemaVersion: 1,
    id: "control_plan_template",
    status: "planned",
    willExecute: false,
    broker: {
      required: true,
      status: "external_pending",
      mode: "signed_host_plan_first",
      failClosed: true,
    },
    policy: {
      requiresConfirmation: true,
      requiredGrants: ["system.control.execute"],
      riskTier: "critical",
      sensitiveDetailRedacted: true,
    },
    receipt: {
      required: true,
      status: "not_issued",
      auditEvent: "system.telemetry.control.plan",
    },
    externalPending: true,
    source: "system.telemetry.controlPlan",
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
