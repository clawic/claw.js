import { test } from "vitest";
import assert from "node:assert/strict";

import {
  MAC_CAPABILITY_ATLAS,
  MAC_CONTROL_COMMAND_ROOTS,
  MAC_PERMISSION_CATALOG,
  MAC_PERMISSION_PACKS,
  assertMacControlPlaneRegistryComplete,
  clawContractVersionV1,
  clawMacControlPlaneRegistry,
  findMacAtlasCapability,
  listMacRelatedSurfaces,
  macActionPlanSchema,
  macActionReceiptSchema,
  macActionRequestSchema,
  macPermissionStateSchema,
  macPolicyGrantSchema,
  macRoleAssignmentSchema,
} from "./index.ts";

test("Mac control plane registry captures the binding V1 governance defaults", () => {
  assert.equal(clawMacControlPlaneRegistry.version, 1);
  assert.doesNotThrow(() => assertMacControlPlaneRegistryComplete());

  assert.equal(clawMacControlPlaneRegistry.policyDefaults.precedence, "most_restrictive_wins");
  assert.equal(clawMacControlPlaneRegistry.policyDefaults.defaultAgentAccess, "safe_read_only");
  assert.deepEqual(clawMacControlPlaneRegistry.policyDefaults.sensitiveGrantDuration, { kind: "task", ttlSeconds: 1800 });
  assert.equal(clawMacControlPlaneRegistry.policyDefaults.criticalRevertTimerSeconds, 120);
  assert.deepEqual(clawMacControlPlaneRegistry.policyDefaults.roles, ["owner", "admin", "operator", "viewer"]);

  assert.equal(clawMacControlPlaneRegistry.validationGates.executableV1MustNotBeExternalPending, true);
  assert.deepEqual(clawMacControlPlaneRegistry.validationGates.signedHostsRequired, ["Clawix embedded", "Claw.app standalone"]);
  assert.equal(clawMacControlPlaneRegistry.validationGates.staticNativeUsageGuardrail, true);
});

test("Mac command roots are direct, singular and conflict-aware", () => {
  const roots = new Map(MAC_CONTROL_COMMAND_ROOTS.map((entry) => [entry.root, entry]));
  for (const root of ["mac", "permissions", "wifi", "window", "shortcut", "app", "process", "bluetooth", "vpn", "network", "display", "screen", "audio", "notification"]) {
    assert.ok(roots.has(root), `missing root ${root}`);
  }

  assert.equal(roots.get("wifi")?.support, "executable");
  assert.equal(roots.get("window")?.support, "executable");
  assert.equal(roots.get("shortcut")?.support, "executable");
  assert.equal(roots.get("app")?.relatedSurfaces?.includes("claw apps"), true);
  assert.deepEqual(listMacRelatedSurfaces("audio"), ["claw media audio"]);
  assert.deepEqual(listMacRelatedSurfaces("notification"), ["claw notify"]);
});

test("Mac permissions are centralized into intent packs", () => {
  const permissionIds = new Set(MAC_PERMISSION_CATALOG.map((entry) => entry.id));
  const packIds = new Set(MAC_PERMISSION_PACKS.map((entry) => entry.id));

  for (const id of [
    "mac.permission.accessibility",
    "mac.permission.screen_capture",
    "mac.permission.microphone",
    "mac.permission.speech_recognition",
    "mac.permission.automation_apple_events",
    "mac.permission.files_desktop_documents_downloads",
    "mac.permission.full_disk_access",
  ]) {
    assert.ok(permissionIds.has(id), `missing permission ${id}`);
  }

  for (const pack of ["windows", "voice", "network", "automation", "files", "screen", "privacy", "notifications"]) {
    assert.ok(packIds.has(pack), `missing pack ${pack}`);
  }

  const microphone = MAC_PERMISSION_CATALOG.find((entry) => entry.id === "mac.permission.microphone");
  assert.deepEqual(microphone?.usageDescriptionKeys, ["NSMicrophoneUsageDescription"]);
  const accessibility = MAC_PERMISSION_CATALOG.find((entry) => entry.id === "mac.permission.accessibility");
  assert.equal(accessibility?.manualOnly, true);
});

test("Mac V1 executable slice is fully declared", () => {
  const executableIds = MAC_CAPABILITY_ATLAS
    .filter((entry) => entry.coverageState === "executable" || entry.coverageState === "host_validated")
    .map((entry) => entry.id);

  for (const id of [
    "mac.wifi.status",
    "mac.wifi.list",
    "mac.wifi.connect",
    "mac.wifi.disconnect",
    "mac.wifi.power.on",
    "mac.wifi.power.off",
    "mac.window.list",
    "mac.window.focus",
    "mac.window.move",
    "mac.window.resize",
    "mac.window.close",
    "mac.window.minimize",
    "mac.shortcut.list",
    "mac.shortcut.show",
    "mac.shortcut.run",
  ]) {
    assert.ok(executableIds.includes(id), `missing executable ${id}`);
  }

  assert.equal(findMacAtlasCapability("mac.wifi.connect")?.backend.strategy, "networksetup");
  assert.equal(findMacAtlasCapability("mac.wifi.connect")?.cli.canonicalUsage, "claw wifi connect --ssid <ssid>");
  assert.equal(findMacAtlasCapability("mac.wifi.power.off")?.risk, "critical");
  assert.equal(findMacAtlasCapability("mac.window.close")?.backend.strategy, "accessibility_ax");
  assert.equal(findMacAtlasCapability("mac.shortcut.run")?.backend.executablePath, "/usr/bin/shortcuts");
  assert.equal(findMacAtlasCapability("mac.shortcut.run")?.risk, "high");
});

test("Mac public schemas validate action, receipt, permission, grant and role contracts", () => {
  const host = {
    hostId: "host.local",
    bundleId: "com.example.Claw",
    signingIdentity: "Developer ID Application: Example",
    appVariant: "standalone",
    appVersion: "1.0.0",
  };
  const actor = { kind: "agent", id: "agent.codex", assignmentId: "assignment.mac", runId: "run.1" };
  const request = macActionRequestSchema.parse({
    schemaVersion: clawContractVersionV1,
    requestId: "req.mac.1",
    capabilityId: "mac.wifi.connect",
    actor,
    host,
    target: { kind: "wifi_network", name: "Office", selector: { ssid: "Office" } },
    arguments: { secretRef: "secret_lease_1" },
    dryRun: true,
  });
  assert.equal(request.dryRun, true);

  const plan = macActionPlanSchema.parse({
    schemaVersion: clawContractVersionV1,
    planId: "plan.mac.1",
    requestId: request.requestId,
    capabilityId: request.capabilityId,
    risk: "high",
    coverageState: "executable",
    actor,
    host,
    permissionRequirements: [],
    requiredApprovals: [{ risk: "high", reason: "Network change", approverRoles: ["owner", "admin"] }],
    rollback: { level: "best_effort", timerSeconds: 120, snapshotRequired: true, snapshotRef: "snap_1" },
    willMutate: true,
    executable: true,
  });
  assert.equal(plan.requiredApprovals[0]?.approverRoles.includes("admin"), true);

  const receipt = macActionReceiptSchema.parse({
    schemaVersion: clawContractVersionV1,
    id: "macact_abc123",
    requestId: request.requestId,
    planId: plan.planId,
    capabilityId: request.capabilityId,
    actor,
    host,
    result: "planned",
    risk: "high",
    auditId: "audit_1",
    revert: plan.rollback,
    secretRefs: ["secret_lease_1"],
    createdAt: "2026-05-17T00:00:00.000Z",
  });
  assert.equal(receipt.redaction.level, "high");

  const permissionState = macPermissionStateSchema.parse({
    schemaVersion: clawContractVersionV1,
    permissionId: "mac.permission.microphone",
    host,
    osState: "not_determined",
    frameworkGrant: "not_granted",
    requestedBefore: false,
    canRequest: true,
    source: "Central Mac Permission Broker",
    lastCheckedAt: "2026-05-17T00:00:00.000Z",
  });
  assert.equal(permissionState.requiresRestart, false);

  const grant = macPolicyGrantSchema.parse({
    schemaVersion: clawContractVersionV1,
    id: "grant_1",
    subject: { kind: "agent", id: "agent.codex" },
    capabilityIds: ["mac.window.focus"],
    riskCeiling: "low",
    createdBy: { kind: "owner_cli", id: "user.owner", role: "owner" },
    createdAt: "2026-05-17T00:00:00.000Z",
  });
  assert.deepEqual(grant.duration, { kind: "task", ttlSeconds: 1800 });

  const role = macRoleAssignmentSchema.parse({
    schemaVersion: clawContractVersionV1,
    id: "role_1",
    localIdentityId: "user.admin",
    role: "admin",
    hostId: "host.local",
    assignedByRole: "owner",
    createdAt: "2026-05-17T00:00:00.000Z",
  });
  assert.equal(role.assignedByRole, "owner");
});
