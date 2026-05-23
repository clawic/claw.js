import assert from "node:assert/strict";
import { test } from "vitest";

import {
  clawContractVersionV1,
  clawCrossProcessJsonContractLimits,
  parseAgentAssignmentRuntimeHandoffJson,
  parseClawCommandIntentLedgerJson,
  parseClawHostCommandRequestJson,
  parseClawProjectManifestJson,
  parseCrossProcessJsonContract,
  parseMacActionPlanJson,
  parseMacActionReceiptJson,
  parseMacActionRequestJson,
  parseMacPermissionStateJson,
  parseMcpAgentAssignmentPolicyJson,
  parseSyncResourceManifestJson,
} from "./index.ts";
import { clawCommandRequestSchema } from "./host-contracts.ts";

const host = {
  hostId: "host.local",
  bundleId: "test.host",
  signingIdentity: "test-signing-identity",
  appVariant: "standalone",
  appVersion: "1.0.0",
};

const actor = { kind: "agent", id: "agent.codex", assignmentId: "assignment.cross-process", runId: "run.1" };

const validHostCommandRequest = {
  schemaVersion: clawContractVersionV1,
  requestId: "req.host.1",
  domain: "calendar",
  resource: "events",
  action: "list",
  arguments: { limit: 10 },
  clientContext: { bundleId: "test.client" },
  validationMode: "dry_run",
};

const validMacActionRequest = {
  schemaVersion: clawContractVersionV1,
  requestId: "req.mac.1",
  capabilityId: "mac.wifi.connect",
  actor,
  host,
  target: { kind: "wifi_network", name: "Office", selector: { ssid: "Office" } },
  arguments: { secretRef: "secret_lease_1" },
  dryRun: true,
};

const validMacActionPlan = {
  schemaVersion: clawContractVersionV1,
  planId: "plan.mac.1",
  requestId: "req.mac.1",
  capabilityId: "mac.wifi.connect",
  risk: "high",
  coverageState: "executable",
  actor,
  host,
  permissionRequirements: [],
  requiredApprovals: [{ risk: "high", reason: "Network change", approverRoles: ["owner", "admin"] }],
  rollback: { level: "best_effort", timerSeconds: 120, snapshotRequired: true, snapshotRef: "snap_1" },
  willMutate: true,
  executable: true,
};

const validMacActionReceipt = {
  schemaVersion: clawContractVersionV1,
  id: "macact_crossprocess1",
  requestId: "req.mac.1",
  planId: "plan.mac.1",
  capabilityId: "mac.wifi.connect",
  actor,
  host,
  result: "planned",
  risk: "high",
  auditId: "audit_1",
  revert: { level: "best_effort", timerSeconds: 120, snapshotRequired: true, snapshotRef: "snap_1" },
  createdAt: "2026-05-23T00:00:00.000Z",
};

const validMacPermissionState = {
  schemaVersion: clawContractVersionV1,
  permissionId: "mac.permission.microphone",
  host,
  osState: "not_determined",
  frameworkGrant: "not_granted",
  requestedBefore: false,
  canRequest: true,
  source: "Central Mac Permission Broker",
  lastCheckedAt: "2026-05-23T00:00:00.000Z",
};

const validProjectManifest = {
  schemaVersion: 1,
  manifestKind: "claw.project",
  projectId: "demo",
  name: "demo",
  title: "Demo",
  primaryFolder: { id: "primary", path: ".", role: "primary" },
  folderRefs: [],
  directories: {},
  resources: {},
};

const validSyncResourceManifest = {
  schemaVersion: 1,
  resourceId: "sync.sessions.local",
  kind: "sessions",
  ownerNodeId: "node.local",
  authority: "primary",
  residency: ["node.local"],
  driver: "sessions",
  conflictPolicy: "detect_and_elevate",
  cachePolicy: {
    encrypted: true,
    ttlSeconds: 3600,
    storesSecrets: false,
    storesAuthoritativeState: false,
  },
  allowedPeerNodeIds: [],
  routeIds: ["sync.driver.sessions"],
  secretPolicy: {
    plaintextReplication: false,
    secretRefsOnly: true,
    brokerLeaseRequired: true,
  },
};

const validCommandIntentLedger = {
  schemaVersion: 1,
  updatedAt: "2026-05-23T00:00:00.000Z",
  intents: [{
    schemaVersion: 1,
    id: "cmd_intent_test_fixture",
    phrase: "test fixture command",
    normalizedPhrase: "test fixture command",
    language: "en",
    purpose: "Exercise command intent ledger JSON boundaries.",
    status: "gap",
    source: "ledger",
    relatedCommands: ["commands"],
    risk: ["local_read"],
    evidence: ["fixture"],
    nextSteps: ["record intentionally"],
    reportTarget: "github_discussions_ideas",
    createdAt: "2026-05-23T00:00:00.000Z",
    updatedAt: "2026-05-23T00:00:00.000Z",
  }],
};

const validAgentAssignmentRuntimeHandoff = {
  schemaVersion: 1,
  route: {
    assignment: {
      id: "assignment.mcp",
      agentId: "agent.support",
      kind: "mcp_api",
      status: "active",
      channel: "mcp",
      endpointRef: "mcp://srv_fixture/echo",
      privacyPolicy: "hashed",
      externalDisclosure: "transparent_agent",
    },
    kind: "mcp_api",
    channel: "mcp",
    endpointRef: "mcp://srv_fixture/echo",
    now: "2026-05-23T00:00:00.000Z",
  },
};

const allowMcpGrant = (id: string) => ({
  id,
  resourceType: "mcp_tool",
  resourceId: "srv_fixture:echo",
  action: "invoke",
  scopeType: "mcp_server",
  scopeId: "srv_fixture",
});

const validMcpAgentAssignmentPolicy = {
  schemaVersion: 1,
  route: validAgentAssignmentRuntimeHandoff.route,
  access: {
    requested: {
      resourceType: "mcp_tool",
      resourceId: "srv_fixture:echo",
      action: "invoke",
      scopeType: "mcp_server",
      scopeId: "srv_fixture",
    },
    agentGrants: [allowMcpGrant("agent")],
    assignmentGrants: [allowMcpGrant("assignment")],
    executionProfileGrants: [allowMcpGrant("execution")],
    connectorGrants: [allowMcpGrant("connector")],
    hostGrants: [allowMcpGrant("host")],
    runScopeGrants: [allowMcpGrant("run")],
    now: "2026-05-23T00:00:00.000Z",
  },
};

const boundaryFixtures = [
  {
    contractId: "claw.protocol.hostCommand.v1",
    parse: parseClawHostCommandRequestJson,
    valid: validHostCommandRequest,
    maxBytes: clawCrossProcessJsonContractLimits["claw.protocol.hostCommand.v1"],
    requiredField: "requestId",
  },
  {
    contractId: "claw.mac.actionRequest.v1",
    parse: parseMacActionRequestJson,
    valid: validMacActionRequest,
    maxBytes: clawCrossProcessJsonContractLimits["claw.mac.actionRequest.v1"],
    requiredField: "requestId",
  },
  {
    contractId: "claw.mac.actionPlan.v1",
    parse: parseMacActionPlanJson,
    valid: validMacActionPlan,
    maxBytes: clawCrossProcessJsonContractLimits["claw.mac.actionPlan.v1"],
    requiredField: "planId",
  },
  {
    contractId: "claw.mac.actionReceipt.v1",
    parse: parseMacActionReceiptJson,
    valid: validMacActionReceipt,
    maxBytes: clawCrossProcessJsonContractLimits["claw.mac.actionReceipt.v1"],
    requiredField: "id",
  },
  {
    contractId: "claw.mac.permissionState.v1",
    parse: parseMacPermissionStateJson,
    valid: validMacPermissionState,
    maxBytes: clawCrossProcessJsonContractLimits["claw.mac.permissionState.v1"],
    requiredField: "permissionId",
  },
  {
    contractId: "claw.workspace.manifest",
    parse: parseClawProjectManifestJson,
    valid: validProjectManifest,
    maxBytes: clawCrossProcessJsonContractLimits["claw.workspace.manifest"],
    requiredField: "projectId",
  },
  {
    contractId: "claw.api.sync.manifests",
    parse: parseSyncResourceManifestJson,
    valid: validSyncResourceManifest,
    maxBytes: clawCrossProcessJsonContractLimits["claw.api.sync.manifests"],
    requiredField: "resourceId",
  },
  {
    contractId: "claw.schema.commandIntents.v1",
    parse: parseClawCommandIntentLedgerJson,
    valid: validCommandIntentLedger,
    maxBytes: clawCrossProcessJsonContractLimits["claw.schema.commandIntents.v1"],
    requiredField: "intents",
  },
  {
    contractId: "claw.agent_assignment.runtime.v1",
    parse: parseAgentAssignmentRuntimeHandoffJson,
    valid: validAgentAssignmentRuntimeHandoff,
    maxBytes: clawCrossProcessJsonContractLimits["claw.agent_assignment.runtime.v1"],
    requiredField: "route",
  },
  {
    contractId: "claw.mcp.agents.v1",
    parse: parseMcpAgentAssignmentPolicyJson,
    valid: validMcpAgentAssignmentPolicy,
    maxBytes: clawCrossProcessJsonContractLimits["claw.mcp.agents.v1"],
    requiredField: "access",
  },
] as const;

function encode(value: unknown): string {
  return JSON.stringify(value);
}

test("cross-process JSON boundary parsers accept valid v1 payloads", () => {
  for (const fixture of boundaryFixtures) {
    const result = fixture.parse(encode(fixture.valid));
    assert.equal(result.ok, true, fixture.contractId);
    if (result.ok) assert.equal(result.contractId, fixture.contractId);
  }
});

test("cross-process JSON boundary parsers return parseable errors for malformed, truncated, incomplete and versioned payloads", () => {
  for (const fixture of boundaryFixtures) {
    const malformed = fixture.parse("{]");
    assert.equal(malformed.ok, false, `${fixture.contractId} malformed`);
    if (!malformed.ok) assert.equal(malformed.error.code, "json_contract_malformed");

    const truncated = fixture.parse(encode(fixture.valid).slice(0, -1));
    assert.equal(truncated.ok, false, `${fixture.contractId} truncated`);
    if (!truncated.ok) assert.equal(truncated.error.code, "json_contract_truncated");

    const incompletePayload = { ...fixture.valid };
    delete (incompletePayload as Record<string, unknown>)[fixture.requiredField];
    const incomplete = fixture.parse(encode(incompletePayload));
    assert.equal(incomplete.ok, false, `${fixture.contractId} incomplete`);
    if (!incomplete.ok) assert.equal(incomplete.error.code, "json_contract_schema_invalid");

    const versioned = fixture.parse(encode({ ...fixture.valid, schemaVersion: 2 }));
    assert.equal(versioned.ok, false, `${fixture.contractId} versioning`);
    if (!versioned.ok) assert.equal(versioned.error.code, "json_contract_schema_invalid");
  }
});

test("cross-process JSON boundary parsers reject unknown top-level fields before schema defaults can strip them", () => {
  for (const fixture of boundaryFixtures) {
    const result = fixture.parse(encode({ ...fixture.valid, unexpectedAuthority: true }));
    assert.equal(result.ok, false, `${fixture.contractId} extra fields`);
    if (!result.ok) {
      assert.equal(result.error.code, "json_contract_unknown_fields");
      assert.deepEqual(result.error.fields, ["unexpectedAuthority"]);
    }
  }
});

test("command intent ledger parser rejects unknown entry fields", () => {
  const result = parseClawCommandIntentLedgerJson(encode({
    ...validCommandIntentLedger,
    intents: [{
      ...validCommandIntentLedger.intents[0],
      proposedAliasExecutes: true,
    }],
  }));

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "json_contract_schema_invalid");
    assert.equal(result.error.issues?.some((issue) => issue.path === "intents.0" && issue.code === "unrecognized_keys"), true);
  }
});

test("cross-process JSON boundary parsers enforce declared payload byte ceilings", () => {
  for (const fixture of boundaryFixtures) {
    const result = fixture.parse(" ".repeat(fixture.maxBytes + 1));
    assert.equal(result.ok, false, `${fixture.contractId} oversized`);
    if (!result.ok) {
      assert.equal(result.error.code, "json_contract_payload_oversized");
      assert.equal(result.error.maxBytes, fixture.maxBytes);
    }
  }
});

test("cross-process JSON boundary parser preserves partial schema issues in a stable error envelope", () => {
  const result = parseCrossProcessJsonContract(
    encode({
      schemaVersion: clawContractVersionV1,
      requestId: "",
      domain: "unknown",
      resource: "",
      action: "",
      validationMode: "not_a_mode",
    }),
    clawCommandRequestSchema,
    {
      contractId: "claw.protocol.hostCommand.v1",
      maxBytes: clawCrossProcessJsonContractLimits["claw.protocol.hostCommand.v1"],
      allowedTopLevelKeys: [
        "schemaVersion",
        "requestId",
        "domain",
        "resource",
        "action",
        "arguments",
        "clientContext",
        "validationMode",
      ],
    },
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "json_contract_schema_invalid");
    assert.deepEqual(result.error.issues?.map((issue) => issue.path), ["requestId", "domain", "resource", "action", "validationMode"]);
  }
});
