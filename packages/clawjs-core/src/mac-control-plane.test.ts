import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  MAC_CAPABILITY_ATLAS,
  MAC_CONTROL_COMMAND_ROOTS,
  MAC_PERMISSION_CATALOG,
  MAC_PERMISSION_PACKS,
  MAC_PROGRAMMATIC_SURFACES,
  assertMacControlPlaneRegistryComplete,
  buildMacActionPlan,
  buildMacActionReceipt,
  evaluateMacActionBroker,
  clawContractVersionV1,
  clawMacControlPlaneRegistry,
  findMacAtlasCapability,
  listMacRelatedSurfaces,
  listMacProgrammaticSurfaces,
  macActionPlanSchema,
  macActionReceiptSchema,
  macActionRequestSchema,
  macApprovalRequestSchema,
  macPermissionStateSchema,
  macPolicyGrantSchema,
  macRoleAssignmentSchema,
  resolveClawCliCommand,
} from "./catalogs.ts";

function renderSafeCli(text: string): string {
  return text.replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

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
  for (const root of ["mac", "permissions", "wifi", "window", "shortcut", "app", "process", "bluetooth", "vpn", "network", "display", "screen", "audio", "media", "notification"]) {
    assert.ok(roots.has(root), `missing root ${root}`);
  }

  assert.equal(roots.get("wifi")?.support, "executable");
  assert.equal(roots.get("window")?.support, "executable");
  assert.equal(roots.get("shortcut")?.support, "executable");
  assert.equal(roots.get("app")?.relatedSurfaces?.includes("claw apps"), true);
  assert.deepEqual(listMacRelatedSurfaces("audio"), ["claw media audio"]);
  assert.deepEqual(listMacRelatedSurfaces("notification"), ["claw notify"]);
  assert.deepEqual(listMacRelatedSurfaces("microphone"), ["claw stt", "claw tts"]);
  assert.deepEqual(listMacRelatedSurfaces("speech"), ["claw stt", "claw tts"]);
});

test("Public CLI help registry is conflict-aware for Mac-adjacent data and AI roots", () => {
  const expectedRelatedSurfaces = new Map([
    ["apps", ["claw app"]],
    ["audio", ["claw mac coverage audio"]],
    ["notify", ["claw notification"]],
    ["calendar", ["claw permissions show calendar"]],
    ["contacts", ["claw permissions show contacts"]],
    ["reminders", ["claw permissions show reminders"]],
    ["files", ["claw permissions show files"]],
    ["location", ["claw permissions show location"]],
    ["stt", ["claw speech", "claw microphone"]],
    ["tts", ["claw speech", "claw microphone"]],
    ["voice-notes", ["claw microphone", "claw speech"]],
  ]);

  for (const [command, relatedSurfaces] of expectedRelatedSurfaces) {
    assert.deepEqual(resolveClawCliCommand(command)?.relatedSurfaces, relatedSurfaces, `related surfaces for ${command}`);
  }
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

test("Mac MCP, API and SDK surfaces share the same broker contract names", () => {
  const names = new Set(MAC_PROGRAMMATIC_SURFACES.map((surface) => surface.name));
  for (const name of [
    "mac.plan",
    "mac.execute",
    "mac.revert",
    "mac.audit",
    "mac.permissions",
    "/v1/mac/plan",
    "/v1/mac/execute",
    "/v1/mac/revert",
    "/v1/mac/audit",
    "/v1/mac/permissions",
    "claw.mac.plan",
    "claw.mac.execute",
    "claw.mac.revert",
    "claw.mac.audit",
    "claw.mac.permissions",
  ]) {
    assert.ok(names.has(name), `missing programmatic surface ${name}`);
  }

  const mcpExecute = MAC_PROGRAMMATIC_SURFACES.find((surface) => surface.name === "mac.execute");
  assert.equal(mcpExecute?.kind, "mcp_tool");
  assert.equal(mcpExecute?.inputSchemaId, "macActionPlanSchema");
  assert.equal(mcpExecute?.outputSchemaId, "macActionBrokerEvaluationSchema");
  assert.equal(mcpExecute?.mutatesNativeState, true);
  assert.equal(mcpExecute?.requiresSignedHost, true);
  assert.equal(mcpExecute?.requiresApproval, true);

  const apiPlan = MAC_PROGRAMMATIC_SURFACES.find((surface) => surface.name === "/v1/mac/plan");
  assert.equal(apiPlan?.kind, "api_route");
  assert.equal(apiPlan?.mutatesNativeState, false);
  assert.equal(apiPlan?.requiresApproval, false);
  assert.deepEqual(
    listMacProgrammaticSurfaces({ kind: "mcp_tool" }).map((surface) => surface.name),
    ["mac.plan", "mac.execute", "mac.revert", "mac.audit", "mac.permissions"],
  );
  assert.equal(listMacProgrammaticSurfaces({ lifecycleAction: "execute" }).every((surface) => surface.requiresSignedHost), true);
});

test("Mac V1 executable slice is fully declared", () => {
  const executableIds = MAC_CAPABILITY_ATLAS
    .filter((entry) => entry.coverageState === "executable" || entry.coverageState === "host_validated")
    .map((entry) => entry.id);

  assert.deepEqual(executableIds, [
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
    "mac.app.list",
    "mac.app.state",
    "mac.app.click",
    "mac.app.type",
    "mac.app.key",
    "mac.app.scroll",
    "mac.app.set_value",
    "mac.app.action",
    "mac.text.inject",
    "mac.utility.hide_all_windows",
    "mac.utility.minimize_all_windows",
    "mac.utility.minimize_all_windows_except_frontmost",
    "mac.utility.minimize_app_windows_except_frontmost",
    "mac.utility.isolate_window",
    "mac.utility.unminimize_all_windows",
    "mac.utility.show_desktop",
    "mac.utility.clear_clipboard",
    "mac.utility.sleep_displays",
    "mac.utility.center_mouse_pointer",
    "mac.utility.show_color_picker",
    "mac.utility.toggle_dark_mode",
    "mac.utility.toggle_mute_sound",
    "mac.utility.keep_awake_on",
    "mac.utility.keep_awake_off",
    "mac.utility.toggle_desktop_icons",
    "mac.utility.open_finder",
    "mac.utility.open_terminal",
    "mac.utility.open_shortcuts",
    "mac.utility.open_passwords",
    "mac.utility.open_airdrop",
    "mac.utility.open_vpn_settings",
    "mac.utility.open_private_relay_settings",
    "mac.utility.open_hide_my_email_settings",
    "mac.utility.open_keyboard_settings",
    "mac.utility.open_display_settings",
    "mac.utility.open_desktop_dock_settings",
    "mac.utility.open_notifications_settings",
    "mac.utility.open_sound_settings",
    "mac.utility.open_privacy_settings",
    "mac.shortcut.list",
    "mac.shortcut.show",
    "mac.shortcut.run",
    "mac.audio.volume",
    "mac.audio.mute.status",
    "mac.audio.mute.set",
    "mac.media.playback.status",
    "mac.media.playback.pause",
    "mac.media.playback.resume",
    "mac.display.brightness",
  ]);

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
    "mac.app.list",
    "mac.app.state",
    "mac.app.click",
    "mac.app.type",
    "mac.app.key",
    "mac.app.scroll",
    "mac.app.set_value",
    "mac.app.action",
    "mac.text.inject",
    "mac.shortcut.list",
    "mac.shortcut.show",
    "mac.shortcut.run",
    "mac.audio.volume",
    "mac.audio.mute.status",
    "mac.audio.mute.set",
    "mac.media.playback.status",
    "mac.media.playback.pause",
    "mac.media.playback.resume",
    "mac.display.brightness",
  ]) {
    assert.ok(executableIds.includes(id), `missing executable ${id}`);
  }

  assert.equal(findMacAtlasCapability("mac.app.state")?.backend.strategy, "accessibility_ax");
  assert.equal(findMacAtlasCapability("mac.app.state")?.risk, "read");
  assert.equal(findMacAtlasCapability("mac.app.list")?.backend.strategy, "appkit");
  assert.equal(findMacAtlasCapability("mac.app.type")?.risk, "medium");
  assert.deepEqual(findMacAtlasCapability("mac.app.click")?.permissions, ["mac.permission.accessibility"]);

  assert.equal(findMacAtlasCapability("mac.wifi.connect")?.backend.strategy, "networksetup");
  assert.equal(findMacAtlasCapability("mac.wifi.connect")?.backend.executablePath, "/usr/sbin/networksetup");
  assert.equal(findMacAtlasCapability("mac.wifi.connect")?.cli.canonicalUsage, "claw wifi connect --ssid <ssid>");
  assert.equal(findMacAtlasCapability("mac.wifi.disconnect")?.backend.strategy, "corewlan");
  assert.equal(findMacAtlasCapability("mac.wifi.power.off")?.risk, "critical");
  assert.equal(findMacAtlasCapability("mac.window.focus")?.coverageState, "executable");
  assert.equal(findMacAtlasCapability("mac.window.move")?.coverageState, "executable");
  assert.equal(findMacAtlasCapability("mac.window.resize")?.coverageState, "executable");
  assert.equal(findMacAtlasCapability("mac.window.close")?.backend.strategy, "accessibility_ax");
  assert.equal(findMacAtlasCapability("mac.shortcut.run")?.backend.executablePath, "/usr/bin/shortcuts");
  assert.equal(findMacAtlasCapability("mac.shortcut.run")?.risk, "high");
  assert.equal(findMacAtlasCapability("mac.audio.volume")?.portableFamily, "system.audio.set_output_volume");
  assert.equal(findMacAtlasCapability("mac.audio.mute.status")?.backend.strategy, "coreaudio");
  assert.equal(findMacAtlasCapability("mac.audio.mute.set")?.risk, "medium");
  assert.equal(findMacAtlasCapability("mac.media.playback.pause")?.backend.strategy, "apple_events");
  assert.deepEqual(findMacAtlasCapability("mac.media.playback.pause")?.permissions, ["mac.permission.automation_apple_events"]);
  assert.equal(findMacAtlasCapability("mac.text.inject")?.risk, "high");
  assert.deepEqual(findMacAtlasCapability("mac.text.inject")?.permissions, ["mac.permission.accessibility"]);
  assert.equal(findMacAtlasCapability("mac.utility.clear_clipboard")?.risk, "high");
  assert.deepEqual(findMacAtlasCapability("mac.utility.hide_all_windows")?.permissions, ["mac.permission.accessibility"]);
  assert.equal(findMacAtlasCapability("mac.utility.open_passwords")?.risk, "high");
  assert.equal(findMacAtlasCapability("mac.display.brightness")?.portableFamily, "system.display.set_brightness");
});

test("Mac control plane executable paths require Mac Care route atlas entries", () => {
  const source = fs.readFileSync(new URL("./mac-control-plane.ts", import.meta.url), "utf8");
  assert.match(source, /requireMacCareRoutePathPattern\("mac_care\.route\.system_networksetup_cli"\)/);
  assert.match(source, /requireMacCareRoutePathPattern\("mac_care\.route\.system_shortcuts_cli"\)/);
  assert.equal(source.includes('macControlSystemRoutePath("mac_care.route.system_networksetup_cli", "/usr/sbin/networksetup")'), false);
  assert.equal(source.includes('macControlSystemRoutePath("mac_care.route.system_shortcuts_cli", "/usr/bin/shortcuts")'), false);
  assert.equal(source.includes('resolveMacCareRoutePathPattern(routeId) ?? fallback'), false);
});

test("Mac atlas verbs have an explicit full-family review", () => {
  const verbAudit = fs.readFileSync(new URL("../../../docs/governance/mac-control-plane/verb-audit.md", import.meta.url), "utf8");
  for (const capability of MAC_CAPABILITY_ATLAS) {
    assert.ok(verbAudit.includes(`| \`${capability.id}\``), `missing verb audit row for ${capability.id}`);
    assert.ok(
      verbAudit.includes(capability.cli.canonicalUsage) || verbAudit.includes(renderSafeCli(capability.cli.canonicalUsage)),
      `missing canonical CLI ${capability.cli.canonicalUsage}`,
    );
    assert.equal(capability.cli.root.length > 0, true);
    assert.equal(capability.action.length > 0, true);
  }
});

test("Mac atlas backends have explicit macOS version drift review", () => {
  const versionDriftAudit = fs.readFileSync(new URL("../../../docs/governance/mac-control-plane/version-drift-audit.md", import.meta.url), "utf8");
  for (const snippet of ["MCQ-002", "MCQ-004", "macOS 14", "macOS 15", "macOS 26"]) {
    assert.ok(versionDriftAudit.includes(snippet), `missing version drift marker ${snippet}`);
  }

  for (const capability of MAC_CAPABILITY_ATLAS) {
    assert.ok(versionDriftAudit.includes(`| \`${capability.id}\``), `missing version drift row for ${capability.id}`);
    assert.ok(versionDriftAudit.includes(`| \`${capability.backend.strategy}\``), `missing backend strategy ${capability.backend.strategy}`);
    assert.ok(versionDriftAudit.includes(`| ${capability.coverageState} |`), `missing coverage state ${capability.coverageState}`);
  }
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
  assert.equal(grant.effect, "allow");
  assert.deepEqual(grant.duration, { kind: "task", ttlSeconds: 1800 });

  const blockGrant = macPolicyGrantSchema.parse({
    schemaVersion: clawContractVersionV1,
    id: "grant_block_1",
    subject: { kind: "role", id: "operator" },
    effect: "block",
    permissionIds: ["mac.permission.accessibility"],
    riskCeiling: "critical",
    createdBy: { kind: "owner_cli", id: "user.owner", role: "owner" },
    createdAt: "2026-05-17T00:00:00.000Z",
  });
  assert.equal(blockGrant.effect, "block");

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

test("Mac action planner builds the shared dry-run contract for CLI, MCP, API and UI", () => {
  const host = {
    hostId: "host.local",
    bundleId: "com.example.Claw",
    signingIdentity: "Developer ID Application: Example",
    appVariant: "standalone",
    appVersion: "1.0.0",
  };
  const actor = { kind: "agent" as const, id: "agent.codex", assignmentId: "assignment.mac", runId: "run.1" };

  const plan = buildMacActionPlan({
    request: macActionRequestSchema.parse({
      schemaVersion: clawContractVersionV1,
      requestId: "req.mac.shared.1",
      capabilityId: "mac.wifi.power.off",
      actor,
      host,
      dryRun: true,
      reason: "Testing continuity breaker plan",
    }),
  });

  assert.equal(plan.planId, "macplan_req_mac_shared_1");
  assert.equal(plan.capabilityId, "mac.wifi.power.off");
  assert.equal(plan.risk, "critical");
  assert.equal(plan.executable, true);
  assert.equal(plan.willMutate, true);
  assert.equal(plan.requiredApprovals[0]?.reason, "Testing continuity breaker plan");
  assert.deepEqual(plan.requiredApprovals[0]?.approverRoles, ["owner", "admin"]);
  assert.equal(plan.rollback.level, "best_effort");
  assert.equal(plan.rollback.timerSeconds, 120);
  assert.equal(plan.rollback.snapshotRequired, true);
  assert.deepEqual(plan.blockedReasons, []);

  const plaintextPassword = buildMacActionPlan({
    request: macActionRequestSchema.parse({
      schemaVersion: clawContractVersionV1,
      requestId: "req.mac.secret.blocked.1",
      capabilityId: "mac.wifi.connect",
      actor,
      host,
      target: { kind: "wifi_network", name: "Office", selector: { ssid: "Office" } },
      arguments: { ssid: "Office", password: "not-allowed" },
      dryRun: true,
    }),
  });
  assert.equal(plaintextPassword.executable, true);
  assert.deepEqual(plaintextPassword.blockedReasons, ["secret_blocked:plaintext_wifi_password"]);

  const missingMoveArgs = buildMacActionPlan({
    request: macActionRequestSchema.parse({
      schemaVersion: clawContractVersionV1,
      requestId: "req.mac.window.move.missing.1",
      capabilityId: "mac.window.move",
      actor,
      host,
      arguments: { x: "120" },
      dryRun: true,
    }),
  });
  assert.equal(missingMoveArgs.executable, true);
  assert.deepEqual(missingMoveArgs.blockedReasons, ["arguments_required:x,y"]);

  const resizeArgs = buildMacActionPlan({
    request: macActionRequestSchema.parse({
      schemaVersion: clawContractVersionV1,
      requestId: "req.mac.window.resize.1",
      capabilityId: "mac.window.resize",
      actor,
      host,
      arguments: { width: "900", height: "700" },
      dryRun: true,
    }),
  });
  assert.deepEqual(resizeArgs.blockedReasons, []);

  const missingMediaApp = buildMacActionPlan({
    request: macActionRequestSchema.parse({
      schemaVersion: clawContractVersionV1,
      requestId: "req.mac.media.pause.missing.1",
      capabilityId: "mac.media.playback.pause",
      actor,
      host,
      dryRun: true,
    }),
  });
  assert.equal(missingMediaApp.executable, true);
  assert.deepEqual(missingMediaApp.blockedReasons, ["target_blocked:approved_media_app_required"]);

  const approvedMediaApp = buildMacActionPlan({
    request: macActionRequestSchema.parse({
      schemaVersion: clawContractVersionV1,
      requestId: "req.mac.media.pause.approved.1",
      capabilityId: "mac.media.playback.pause",
      actor,
      host,
      arguments: { app: "Music" },
      dryRun: true,
    }),
  });
  assert.deepEqual(approvedMediaApp.blockedReasons, []);

  const missingTextInjectionPayload = buildMacActionPlan({
    request: macActionRequestSchema.parse({
      schemaVersion: clawContractVersionV1,
      requestId: "req.mac.text.inject.missing.1",
      capabilityId: "mac.text.inject",
      actor,
      host,
      arguments: { text: "   " },
      dryRun: true,
    }),
  });
  assert.equal(missingTextInjectionPayload.executable, true);
  assert.deepEqual(missingTextInjectionPayload.blockedReasons, ["arguments_required:text"]);

  const validTextInjectionPayload = buildMacActionPlan({
    request: macActionRequestSchema.parse({
      schemaVersion: clawContractVersionV1,
      requestId: "req.mac.text.inject.valid.1",
      capabilityId: "mac.text.inject",
      actor,
      host,
      arguments: { text: "secret payload" },
      dryRun: true,
    }),
  });
  assert.deepEqual(validTextInjectionPayload.blockedReasons, []);

  const blocked = buildMacActionPlan({
    request: macActionRequestSchema.parse({
      schemaVersion: clawContractVersionV1,
      requestId: "req.mac.blocked.1",
      capabilityId: "mac.screen.capture",
      actor,
      host,
      dryRun: true,
    }),
    permissionStates: [{
      schemaVersion: clawContractVersionV1,
      permissionId: "mac.permission.screen_capture",
      host,
      osState: "denied",
      frameworkGrant: "denied",
      requestedBefore: true,
      canRequest: false,
      source: "Central Mac Permission Broker",
      lastCheckedAt: "2026-05-17T00:00:00.000Z",
    }],
  });
  assert.equal(blocked.executable, false);
  assert.deepEqual(blocked.blockedReasons, ["coverage_state:planned", "permission_blocked:mac.permission.screen_capture"]);
});

test("Mac action broker blocks unsafe plans and emits redacted receipts before host execution", () => {
  const host = {
    hostId: "host.local",
    bundleId: "com.example.Claw",
    signingIdentity: "Developer ID Application: Example",
    appVariant: "standalone",
    appVersion: "1.0.0",
  };
  const actor = { kind: "agent" as const, id: "agent.codex", assignmentId: "assignment.mac", runId: "run.1" };
  const request = macActionRequestSchema.parse({
    schemaVersion: clawContractVersionV1,
    requestId: "req.mac.broker.1",
    capabilityId: "mac.wifi.connect",
    actor,
    host,
    target: { kind: "wifi_network", name: "Office", selector: { ssid: "Office" } },
    arguments: { secretRef: "secret_lease_wifi" },
    dryRun: false,
    reason: "Join the office network",
  });
  const plan = buildMacActionPlan({ request });

  const approvalRequired = evaluateMacActionBroker({
    request,
    plan,
    now: "2026-05-17T10:00:00.000Z",
  });
  assert.equal(approvalRequired.decision, "approval_required");
  assert.deepEqual(approvalRequired.reasons, ["approval_required"]);
  assert.equal(approvalRequired.receipt?.result, "planned");
  assert.equal(approvalRequired.auditEvent?.id, approvalRequired.receipt?.auditId);
  assert.equal(approvalRequired.receipt?.redaction.level, "high");
  assert.deepEqual(approvalRequired.receipt?.secretRefs, ["secret_lease_wifi"]);
  assert.equal(approvalRequired.receipt?.redaction.fields.includes("arguments"), true);
  assert.equal(approvalRequired.receipt?.redaction.fields.includes("target.selector"), true);

  const approved = macApprovalRequestSchema.parse({
    schemaVersion: clawContractVersionV1,
    id: "macapproval_1",
    actionRequest: request,
    plan,
    approverRoles: ["owner", "admin"],
    status: "approved",
    createdAt: "2026-05-17T09:59:00.000Z",
    decidedAt: "2026-05-17T10:00:00.000Z",
    decidedBy: { kind: "owner_cli", id: "owner.local", role: "owner" },
  });
  const allowed = evaluateMacActionBroker({ request, plan, approvals: [approved] });
  assert.equal(allowed.decision, "allow");
  assert.equal(allowed.receipt, undefined);
  assert.equal(allowed.auditEvent, undefined);

  const viewerApproved = macApprovalRequestSchema.parse({
    ...approved,
    id: "macapproval_viewer",
    decidedBy: { kind: "user_ui", id: "viewer.local", role: "viewer" },
  });
  const viewerDecision = evaluateMacActionBroker({ request, plan, approvals: [viewerApproved] });
  assert.equal(viewerDecision.decision, "approval_required");
  assert.deepEqual(viewerDecision.reasons, ["approval_required"]);

  const receipt = buildMacActionReceipt({
    request,
    plan,
    result: "ok",
    now: "2026-05-17T10:01:00.000Z",
    beforeRef: "snap_before",
    afterRef: "snap_after",
  });
  assert.equal(receipt.id, "macact_req_mac_broker_1_ok");
  assert.equal(receipt.auditId, "macaudit_req_mac_broker_1_ok");
  assert.deepEqual(receipt.secretRefs, ["secret_lease_wifi"]);
});

test("Mac action broker records blocked permission decisions without executing native code", () => {
  const host = {
    hostId: "host.local",
    bundleId: "com.example.Claw",
    signingIdentity: "Developer ID Application: Example",
    appVariant: "embedded",
    appVersion: "1.0.0",
  };
  const actor = { kind: "agent" as const, id: "agent.codex", assignmentId: "assignment.mac", runId: "run.2" };
  const request = macActionRequestSchema.parse({
    schemaVersion: clawContractVersionV1,
    requestId: "req.mac.broker.blocked.1",
    capabilityId: "mac.window.close",
    actor,
    host,
  });
  const plan = buildMacActionPlan({
    request,
    permissionStates: [{
      schemaVersion: clawContractVersionV1,
      permissionId: "mac.permission.accessibility",
      host,
      osState: "restricted",
      frameworkGrant: "not_granted",
      requestedBefore: true,
      canRequest: false,
      source: "Central Mac Permission Broker",
      lastCheckedAt: "2026-05-17T00:00:00.000Z",
    }],
  });
  const decision = evaluateMacActionBroker({
    request,
    plan,
    now: "2026-05-17T10:02:00.000Z",
  });

  assert.equal(decision.decision, "blocked");
  assert.deepEqual(decision.reasons, ["permission_blocked:mac.permission.accessibility"]);
  assert.equal(decision.receipt?.result, "blocked");
  assert.equal(decision.auditEvent?.metadata.reasons instanceof Array, true);
});
