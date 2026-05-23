import assert from "node:assert/strict";
import { test } from "vitest";

import {
  clawContractVersionV1,
  clawCrossProcessJsonContractLimits,
  parseClawHostCommandRequestJson,
  parseClawProjectManifestJson,
  parseCrossProcessJsonContract,
  parseMacActionPlanJson,
  parseMacActionReceiptJson,
  parseMacActionRequestJson,
  parseMacPermissionStateJson,
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
