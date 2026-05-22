import { test } from "vitest";
import assert from "node:assert/strict";

import { clawCliCommandRegistry } from "./cli-command-registry.ts";
import {
  MAC_CARE_FILESYSTEM_NOISE_DIRECTORIES,
  MAC_CARE_ROUTE_ATLAS,
  MAC_CARE_SCANNER_WAVE_1_MODULES,
  MAC_CARE_SIDECAR_FILENAME,
  buildMacCareFinalizerApprovalPackage,
  buildMacCareFinalizerPreview,
  evaluateMacCareActionPlanSafety,
  findMacCareRoute,
  isMacCareFilesystemNoiseDirectoryName,
  listMacCareFilesystemNoiseDirectories,
  listMacCareProtectionAdapters,
  listMacCareScannerWave1Modules,
  listMacCareRoutes,
  macCareActionPlanSchema,
  macCareAppUpdateApprovalPackageReportSchema,
  macCareAppUpdateHandoffReportSchema,
  macCareCloudProviderApprovalPackageReportSchema,
  macCareCloudProviderHandoffReportSchema,
  macCareFinalizerApprovalPackageReportSchema,
  macCareFinalizerPreviewReportSchema,
  macCareProtectionAdapterSchema,
  macCareProtectionApprovalPackageReportSchema,
  macCareProtectionEngineReadinessReportSchema,
  macCareProtectionFixtureScanReportSchema,
  macCareScannerModuleSchema,
  macCareRouteAtlasEntrySchema,
  matchMacCareRoutesForPath,
  requireMacCareRoutePathPattern,
  resolveMacCareRoutePathPattern,
  type MacCareActionPlan,
} from "./mac-care.ts";

test("Mac Care CLI registry advertises handoff and approval-ready packages", () => {
  const entry = clawCliCommandRegistry.commands.find((command) => command.name === "mac-care");
  assert.ok(entry);
  assert.match(entry.summary, /approval-ready packages/);
  assert.match(entry.usage, /app-updates approval-ready/);
  assert.match(entry.usage, /cloud approval-ready/);
  assert.match(entry.usage, /finalizer approval-ready/);
  assert.match(entry.usage, /protection approval-ready/);
  assert.equal(entry.securityPolicy, "local_read");
});

test("Mac Care route atlas is centralized, validated, and covers first-wave route families", () => {
  assert.equal(MAC_CARE_SIDECAR_FILENAME, "mac_care.sqlite");
  assert.equal(listMacCareRoutes().length, MAC_CARE_ROUTE_ATLAS.length);

  const ids = new Set<string>();
  for (const entry of MAC_CARE_ROUTE_ATLAS) {
    assert.doesNotThrow(() => macCareRouteAtlasEntrySchema.parse(entry), entry.id);
    assert.equal(ids.has(entry.id), false, `duplicate route id ${entry.id}`);
    ids.add(entry.id);
  }

  for (const family of ["user_cache", "user_log", "application_support", "downloads", "trash", "applications", "developer", "backup", "cloud_sync", "system_cache", "system_tool", "protection"]) {
    assert.ok(MAC_CARE_ROUTE_ATLAS.some((entry) => entry.family === family), `missing route family ${family}`);
  }

  assert.equal(findMacCareRoute("mac_care.route.application_support")?.mutability, "host_confirmed_only");
  assert.equal(findMacCareRoute("mac_care.route.system_caches")?.mutability, "blocked");
  assert.equal(findMacCareRoute("mac_care.route.system_applications")?.consumerIntents.includes("app_inventory"), true);
});

test("Mac Care scanner wave 1 module registry is read-only and route-backed", () => {
  assert.equal(listMacCareScannerWave1Modules().length, MAC_CARE_SCANNER_WAVE_1_MODULES.length);
  for (const module of MAC_CARE_SCANNER_WAVE_1_MODULES) {
    assert.doesNotThrow(() => macCareScannerModuleSchema.parse(module), module.id);
    assert.equal(module.readOnly, true);
    for (const routeId of module.routeIds) {
      assert.ok(findMacCareRoute(routeId), `${module.id} route ${routeId} must exist`);
    }
  }
  assert.ok(MAC_CARE_SCANNER_WAVE_1_MODULES.some((module) => module.id === "mac_care.module.large_old_files"));
  assert.ok(MAC_CARE_SCANNER_WAVE_1_MODULES.some((module) => module.id === "mac_care.module.app_inventory"));
});

test("Mac Care protection adapters are contract-only and cannot quarantine from agents", () => {
  const adapters = listMacCareProtectionAdapters();
  assert.equal(adapters.length, 2);
  for (const adapter of adapters) {
    assert.doesNotThrow(() => macCareProtectionAdapterSchema.parse(adapter), adapter.id);
    assert.equal(adapter.readOnly, true);
    assert.equal(adapter.agentCanQuarantine, false);
    for (const routeId of adapter.routeIds) {
      assert.ok(findMacCareRoute(routeId), `${adapter.id} route ${routeId} must exist`);
    }
  }
  assert.equal(adapters.find((adapter) => adapter.id === "mac_care.protection.yara_core")?.executionMode, "fixture_only");
  assert.equal(adapters.find((adapter) => adapter.id === "mac_care.protection.clamav_adapter")?.executionMode, "external_engine_required");
});

test("Mac Care protection engine readiness is read-only and blocks agent execution", () => {
  const report = macCareProtectionEngineReadinessReportSchema.parse({
    version: 1,
    status: "protection_engine_readiness",
    createdAt: "2026-05-21T00:00:00.000Z",
    engines: [{
      adapterId: "mac_care.protection.clamav_adapter",
      engine: "clamav",
      label: "ClamAV external adapter",
      executionMode: "external_engine_required",
      requiredScanBinaries: ["clamscan"],
      requiredUpdateBinaries: ["freshclam"],
      detectedBinaries: [
        { name: "clamscan", path: "/usr/local/bin/clamscan", present: true },
        { name: "freshclam", path: null, present: false },
      ],
      runtimeStatus: "external_engine_detected",
      databaseStatus: "external_update_tool_missing",
      agentCanScan: false,
      agentCanUpdateDatabase: false,
      agentCanQuarantine: false,
      requiredAuthority: "signed_host_human_confirmed",
      notes: ["Readiness only; no scan, database update, or quarantine is executed."],
    }],
    summary: {
      totalEngines: 1,
      detectedEngines: 1,
      agentExecutableScans: 0,
      agentDatabaseUpdates: 0,
      agentQuarantineActions: 0,
      signedHostRequired: 1,
    },
  });

  assert.equal(report.engines[0]?.runtimeStatus, "external_engine_detected");
  assert.equal(report.engines[0]?.agentCanScan, false);
  assert.equal(report.engines[0]?.agentCanUpdateDatabase, false);
  assert.equal(report.engines[0]?.agentCanQuarantine, false);
  assert.equal(report.summary.agentExecutableScans, 0);
});

test("Mac Care protection approval packages issue no scan, update, or quarantine requests", () => {
  const report = macCareProtectionApprovalPackageReportSchema.parse({
    version: 1,
    status: "protection_approval_ready",
    createdAt: "2026-05-21T00:00:00.000Z",
    sourceReadinessStatus: "protection_engine_readiness",
    engines: [{
      id: "protection-approval-1",
      adapterId: "mac_care.protection.clamav_adapter",
      engine: "clamav",
      label: "ClamAV external adapter",
      runtimeStatus: "external_engine_detected",
      databaseStatus: "external_update_tool_detected",
      approvalState: "not_requested",
      willScan: false,
      willUpdateDatabase: false,
      willQuarantine: false,
      agentCanScan: false,
      agentCanUpdateDatabase: false,
      agentCanQuarantine: false,
      executionAuthority: "signed_host_human_confirmed",
      requiredEvidence: [
        "signed_host_identity_verified",
        "engine_binary_path_confirmed",
        "database_update_policy_confirmed",
        "explicit_scan_scope_confirmation",
      ],
      reentryCondition: "Resume only after signed host protection authority and exact human confirmation exist.",
      reasons: ["Approval package preparation does not run protection engines."],
    }],
    summary: {
      totalEngines: 1,
      detectedEngines: 1,
      scanRequestsIssued: 0,
      databaseUpdateRequestsIssued: 0,
      quarantineRequestsIssued: 0,
      agentExecutableScans: 0,
      agentDatabaseUpdates: 0,
      agentQuarantineActions: 0,
      signedHostRequired: 1,
    },
  });

  assert.equal(report.engines[0]?.willScan, false);
  assert.equal(report.engines[0]?.willUpdateDatabase, false);
  assert.equal(report.engines[0]?.willQuarantine, false);
  assert.equal(report.summary.scanRequestsIssued, 0);
  assert.equal(report.summary.databaseUpdateRequestsIssued, 0);
  assert.equal(report.summary.quarantineRequestsIssued, 0);
});

test("Mac Care route matching resolves home and volume routes without reading the filesystem", () => {
  const homeDir = "/Users/example";
  assert.deepEqual(
    matchMacCareRoutesForPath("/Users/example/Library/Caches/com.example.App/blob", { homeDir }).map((entry) => entry.id),
    ["mac_care.route.user_caches"],
  );
  assert.deepEqual(
    matchMacCareRoutesForPath("/Users/example/Library/Application Support/MobileSync/Backup/device", { homeDir }).map((entry) => entry.id),
    ["mac_care.route.application_support", "mac_care.route.mobile_backups"],
  );
  assert.deepEqual(
    matchMacCareRoutesForPath("/Volumes/Lab/.Trashes/501/file.txt", { homeDir }).map((entry) => entry.id),
    ["mac_care.route.volume_trashes"],
  );
  assert.deepEqual(
    matchMacCareRoutesForPath("/Volumes/Lab/.Spotlight-V100/Store-V2/index", { homeDir }).map((entry) => entry.id),
    ["mac_care.route.volume_spotlight_index"],
  );
  assert.deepEqual(
    matchMacCareRoutesForPath("/Volumes/Lab/.TemporaryItems/folders.501/item", { homeDir }).map((entry) => entry.id),
    ["mac_care.route.volume_temporary_items"],
  );
  assert.deepEqual(
    matchMacCareRoutesForPath("/Library/Application Support/Claw/domains/proxy.mjs", { homeDir }).map((entry) => entry.id),
    ["mac_care.route.system_application_support"],
  );
  assert.deepEqual(
    matchMacCareRoutesForPath("/Library/LaunchDaemons/com.claw.domains.plist", { homeDir }).map((entry) => entry.id),
    ["mac_care.route.system_launch_daemons"],
  );
  assert.deepEqual(
    matchMacCareRoutesForPath("/etc/hosts", { homeDir }).map((entry) => entry.id),
    ["mac_care.route.system_hosts_file"],
  );
  assert.deepEqual(
    matchMacCareRoutesForPath("/tmp/claw-domains.out.log", { homeDir }).map((entry) => entry.id),
    ["mac_care.route.system_temp"],
  );
  assert.deepEqual(
    matchMacCareRoutesForPath("/usr/bin/shortcuts", { homeDir }).map((entry) => entry.id),
    ["mac_care.route.system_shortcuts_cli"],
  );
  assert.deepEqual(
    matchMacCareRoutesForPath("/usr/sbin/networksetup", { homeDir }).map((entry) => entry.id),
    ["mac_care.route.system_networksetup_cli"],
  );
  assert.deepEqual(
    matchMacCareRoutesForPath("/bin/launchctl", { homeDir }).map((entry) => entry.id),
    ["mac_care.route.system_launchctl_cli"],
  );
  assert.deepEqual(
    matchMacCareRoutesForPath("/bin/sh", { homeDir }).map((entry) => entry.id),
    ["mac_care.route.system_sh_cli"],
  );
  assert.deepEqual(
    matchMacCareRoutesForPath("/usr/bin/sudo", { homeDir }).map((entry) => entry.id),
    ["mac_care.route.system_sudo_cli"],
  );
  assert.deepEqual(
    matchMacCareRoutesForPath("/usr/bin/env", { homeDir }).map((entry) => entry.id),
    ["mac_care.route.system_env_cli"],
  );
  assert.deepEqual(
    matchMacCareRoutesForPath("/usr/bin/tar", { homeDir }).map((entry) => entry.id),
    ["mac_care.route.system_tar_cli"],
  );
  assert.deepEqual(
    matchMacCareRoutesForPath("/usr/bin/osascript", { homeDir }).map((entry) => entry.id),
    ["mac_care.route.system_osascript_cli"],
  );
  assert.deepEqual(
    matchMacCareRoutesForPath("/usr/bin/open", { homeDir }).map((entry) => entry.id),
    ["mac_care.route.system_open_cli"],
  );
});

test("Mac Care route path resolver provides concrete scanner roots from the atlas", () => {
  const homeDir = "/Users/example";
  assert.equal(resolveMacCareRoutePathPattern("mac_care.route.downloads", { homeDir }), "/Users/example/Downloads");
  assert.equal(resolveMacCareRoutePathPattern("mac_care.route.user_caches", { homeDir }), "/Users/example/Library/Caches");
  assert.equal(resolveMacCareRoutePathPattern("mac_care.route.system_application_support"), "/Library/Application Support");
  assert.equal(resolveMacCareRoutePathPattern("mac_care.route.system_launch_daemons"), "/Library/LaunchDaemons");
  assert.equal(resolveMacCareRoutePathPattern("mac_care.route.system_hosts_file"), "/etc/hosts");
  assert.equal(resolveMacCareRoutePathPattern("mac_care.route.system_temp"), "/tmp");
  assert.equal(resolveMacCareRoutePathPattern("mac_care.route.system_shortcuts_cli"), "/usr/bin/shortcuts");
  assert.equal(resolveMacCareRoutePathPattern("mac_care.route.system_networksetup_cli"), "/usr/sbin/networksetup");
  assert.equal(resolveMacCareRoutePathPattern("mac_care.route.system_launchctl_cli"), "/bin/launchctl");
  assert.equal(resolveMacCareRoutePathPattern("mac_care.route.system_sh_cli"), "/bin/sh");
  assert.equal(resolveMacCareRoutePathPattern("mac_care.route.system_sudo_cli"), "/usr/bin/sudo");
  assert.equal(resolveMacCareRoutePathPattern("mac_care.route.system_env_cli"), "/usr/bin/env");
  assert.equal(resolveMacCareRoutePathPattern("mac_care.route.system_tar_cli"), "/usr/bin/tar");
  assert.equal(resolveMacCareRoutePathPattern("mac_care.route.system_osascript_cli"), "/usr/bin/osascript");
  assert.equal(resolveMacCareRoutePathPattern("mac_care.route.system_open_cli"), "/usr/bin/open");
  assert.equal(
    resolveMacCareRoutePathPattern("mac_care.route.system_applications", { systemApplicationsDir: "/tmp/Test Applications" }),
    "/tmp/Test Applications",
  );
  assert.equal(resolveMacCareRoutePathPattern("mac_care.route.browser_profiles", { homeDir }), null);
  assert.equal(resolveMacCareRoutePathPattern("mac_care.route.volume_trashes", { homeDir }), null);
  assert.equal(resolveMacCareRoutePathPattern("mac_care.route.missing", { homeDir }), null);
  assert.equal(requireMacCareRoutePathPattern("mac_care.route.application_support", { homeDir }), "/Users/example/Library/Application Support");
  assert.throws(
    () => requireMacCareRoutePathPattern("mac_care.route.browser_profiles", { homeDir }),
    /Mac Care route path cannot be resolved: mac_care\.route\.browser_profiles/,
  );
});

test("Mac Care centralizes macOS filesystem noise directories consumed by Search", () => {
  assert.equal(listMacCareFilesystemNoiseDirectories().length, MAC_CARE_FILESYSTEM_NOISE_DIRECTORIES.length);
  for (const entry of MAC_CARE_FILESYSTEM_NOISE_DIRECTORIES) {
    assert.equal(isMacCareFilesystemNoiseDirectoryName(entry.name), true, entry.name);
    for (const routeId of entry.routeIds) {
      assert.ok(findMacCareRoute(routeId), `${entry.name} route ${routeId} must exist`);
    }
  }
  assert.equal(isMacCareFilesystemNoiseDirectoryName("Documents"), false);
});

test("Mac Care action plans are schema validated and destructive actions are agent/test blocked", () => {
  const plan: MacCareActionPlan = macCareActionPlanSchema.parse({
    id: "plan-1",
    createdAt: "2026-05-21T00:00:00.000Z",
    executionAuthority: "agent_plan_only",
    requestedBy: "agent",
    groups: [{
      id: "group-1",
      moduleId: "system-junk",
      title: "System Junk",
      routeIds: ["mac_care.route.user_caches"],
      candidates: [{
        id: "candidate-1",
        routeId: "mac_care.route.user_caches",
        path: "/Users/example/Library/Caches/com.example.App/blob",
        displayName: "blob",
        sizeBytes: 42,
        action: "move_to_trash",
        selection: "selected",
        confidence: 0.8,
        evidence: ["fixture"],
      }],
    }],
  });

  const agentDecision = evaluateMacCareActionPlanSafety(plan, { actor: "agent" });
  assert.equal(agentDecision.allowed, false);
  assert.equal(agentDecision.requiredAuthority, "signed_host_human_confirmed");
  assert.deepEqual(agentDecision.destructiveActions, ["move_to_trash"]);

  const testDecision = evaluateMacCareActionPlanSafety({ ...plan, requestedBy: "test" }, { actor: "test" });
  assert.equal(testDecision.allowed, false);

  const hostDecision = evaluateMacCareActionPlanSafety({
    ...plan,
    executionAuthority: "signed_host_human_confirmed",
    requestedBy: "signed_host",
  }, { actor: "signed_host", humanConfirmed: true });
  assert.equal(hostDecision.allowed, true);
});

test("Mac Care read-only review plans do not require signed host authority", () => {
  const plan = macCareActionPlanSchema.parse({
    id: "plan-2",
    createdAt: "2026-05-21T00:00:00.000Z",
    executionAuthority: "agent_plan_only",
    requestedBy: "agent",
    groups: [{
      id: "group-1",
      moduleId: "storage-map",
      title: "Storage Map",
      candidates: [{
        id: "candidate-1",
        routeId: "mac_care.route.downloads",
        path: "/Users/example/Downloads/archive.zip",
        displayName: "archive.zip",
        action: "review",
        selection: "unselected",
        confidence: 1,
      }],
    }],
  });

  assert.deepEqual(evaluateMacCareActionPlanSafety(plan, { actor: "agent" }), {
    allowed: true,
    requiredAuthority: "none",
    destructiveActions: [],
    reasons: [],
  });
});

test("Mac Care finalizer preview produces signed-host requirements without issuing receipts", () => {
  const plan: MacCareActionPlan = macCareActionPlanSchema.parse({
    id: "plan-finalizer-1",
    createdAt: "2026-05-21T00:00:00.000Z",
    executionAuthority: "agent_plan_only",
    requestedBy: "agent",
    groups: [{
      id: "group-1",
      moduleId: "mac_care.module.downloads",
      title: "Downloads",
      routeIds: ["mac_care.route.downloads"],
      candidates: [{
        id: "candidate-review",
        routeId: "mac_care.route.downloads",
        path: "/Users/example/Downloads/archive.zip",
        displayName: "archive.zip",
        action: "review",
        selection: "unselected",
        confidence: 1,
      }, {
        id: "candidate-trash",
        routeId: "mac_care.route.downloads",
        path: "/Users/example/Downloads/old.dmg",
        displayName: "old.dmg",
        action: "move_to_trash",
        selection: "blocked",
        confidence: 0.8,
        warnings: ["large_file"],
      }],
    }],
  });

  const preview = macCareFinalizerPreviewReportSchema.parse(buildMacCareFinalizerPreview(plan, new Date("2026-05-21T00:00:00.000Z")));
  assert.equal(preview.status, "finalizer_preview");
  assert.equal(preview.willExecute, false);
  assert.equal(preview.receiptIssued, false);
  assert.equal(preview.executionAuthority, "signed_host_human_confirmed");
  assert.equal(preview.summary.totalCandidates, 2);
  assert.equal(preview.summary.destructiveCandidates, 1);
  assert.equal(preview.summary.blockedForAgents, 1);
  assert.equal(preview.summary.receiptsIssued, 0);
  assert.equal(preview.actions.length, 1);
  assert.equal(preview.actions[0]?.candidateId, "candidate-trash");
  assert.equal(preview.actions[0]?.action, "move_to_trash");
  assert.equal(preview.actions[0]?.requiresHumanConfirmation, true);
  assert.equal(preview.actions[0]?.blockedForAgents, true);
  assert.equal(preview.actions[0]?.audit.receiptRequired, true);
  assert.equal(preview.actions[0]?.audit.receiptStatus, "not_issued");
  assert.equal(preview.actions[0]?.rollback.level, "best_effort");
  assert.ok(preview.actions[0]?.warnings.includes("preview_only_no_execution"));
});

test("Mac Care finalizer approval packages issue no approval, execution, or receipt requests", () => {
  const plan: MacCareActionPlan = macCareActionPlanSchema.parse({
    id: "plan-finalizer-approval-1",
    createdAt: "2026-05-21T00:00:00.000Z",
    executionAuthority: "agent_plan_only",
    requestedBy: "agent",
    groups: [{
      id: "group-finalizer-approval-1",
      moduleId: "mac_care.module.user_caches",
      title: "Finalizer approval fixture",
      routeIds: ["mac_care.route.user_caches"],
      candidates: [{
        id: "candidate-finalizer-approval-1",
        routeId: "mac_care.route.user_caches",
        path: "/Users/example/Library/Caches/com.example/blob",
        displayName: "blob",
        action: "move_to_trash",
        selection: "blocked",
        confidence: 0.8,
        evidence: ["fixture"],
        warnings: ["manual_review_required"],
      }],
    }],
  });
  const preview = buildMacCareFinalizerPreview(plan, new Date("2026-05-21T00:00:00.000Z"));
  const approval = macCareFinalizerApprovalPackageReportSchema.parse(buildMacCareFinalizerApprovalPackage(preview, new Date("2026-05-21T00:01:00.000Z")));

  assert.equal(approval.status, "finalizer_approval_ready");
  assert.equal(approval.willExecute, false);
  assert.equal(approval.receiptIssued, false);
  assert.equal(approval.actions[0]?.approvalState, "not_requested");
  assert.equal(approval.actions[0]?.willExecute, false);
  assert.equal(approval.actions[0]?.receiptWillBeIssued, false);
  assert.equal(approval.actions[0]?.requiresHumanConfirmation, true);
  assert.equal(approval.actions[0]?.blockedForAgents, true);
  assert.equal(approval.summary.approvalRequestsIssued, 0);
  assert.equal(approval.summary.executionRequestsIssued, 0);
  assert.equal(approval.summary.receiptsIssued, 0);
});

test("Mac Care app update handoff reports are inventory-only and host-confirmed", () => {
  const report = macCareAppUpdateHandoffReportSchema.parse({
    version: 1,
    status: "app_update_handoff_inventory",
    createdAt: "2026-05-21T00:00:00.000Z",
    sourceScanId: "scan-1",
    items: [{
      id: "handoff-1",
      candidateId: "candidate-1",
      routeId: "mac_care.route.system_applications",
      path: "/Applications/Example.app",
      displayName: "Example.app",
      handoffKind: "manual_review",
      status: "inventory_only",
      action: "update_app",
      selection: "blocked",
      executionAuthority: "signed_host_human_confirmed",
      agentCanInstall: false,
      reasons: ["Update installation is a signed-host human-confirmed handoff."],
    }],
    actionPlan: {
      id: "handoff-plan-1",
      createdAt: "2026-05-21T00:00:00.000Z",
      executionAuthority: "agent_plan_only",
      requestedBy: "agent",
      groups: [{
        id: "mac_care.group.app_update_handoff",
        moduleId: "mac_care.module.app_inventory",
        title: "Application update handoff",
        routeIds: ["mac_care.route.system_applications"],
        candidates: [{
          id: "candidate-1-update",
          routeId: "mac_care.route.system_applications",
          path: "/Applications/Example.app",
          displayName: "Example.app",
          action: "update_app",
          selection: "blocked",
          confidence: 0.5,
          evidence: ["app_update_handoff:inventory_only"],
          warnings: ["manual_update_review_required"],
        }],
      }],
    },
  });

  assert.equal(report.items[0]?.agentCanInstall, false);
  assert.equal(report.items[0]?.executionAuthority, "signed_host_human_confirmed");
  const safety = evaluateMacCareActionPlanSafety(report.actionPlan, { actor: "agent" });
  assert.equal(safety.allowed, false);
  assert.equal(safety.requiredAuthority, "signed_host_human_confirmed");
  assert.deepEqual(safety.destructiveActions, ["update_app"]);
});

test("Mac Care app update approval packages do not install or launch installers", () => {
  const report = macCareAppUpdateApprovalPackageReportSchema.parse({
    version: 1,
    status: "app_update_approval_ready",
    createdAt: "2026-05-21T00:00:00.000Z",
    sourceHandoffStatus: "app_update_handoff_inventory",
    sourceScanId: "scan-1",
    items: [{
      id: "update-approval-1",
      handoffItemId: "handoff-1",
      candidateId: "candidate-1",
      routeId: "mac_care.route.system_applications",
      path: "/Applications/Example.app",
      displayName: "Example.app",
      handoffKind: "manual_review",
      requestedOperation: "update_app",
      approvalState: "not_requested",
      willInstall: false,
      installerLaunched: false,
      agentCanInstall: false,
      executionAuthority: "signed_host_human_confirmed",
      requiredEvidence: [
        "signed_host_identity_verified",
        "app_identity_and_path_confirmed",
        "explicit_item_level_confirmation",
      ],
      reentryCondition: "Resume only after signed host update authority and exact human confirmation exist.",
      reasons: ["Approval package preparation does not install applications."],
    }],
    actionPlan: {
      id: "handoff-plan-1",
      createdAt: "2026-05-21T00:00:00.000Z",
      executionAuthority: "agent_plan_only",
      requestedBy: "agent",
      groups: [{
        id: "mac_care.group.app_update_handoff",
        moduleId: "mac_care.module.app_inventory",
        title: "Application update handoff",
        routeIds: ["mac_care.route.system_applications"],
        candidates: [{
          id: "candidate-1-update",
          routeId: "mac_care.route.system_applications",
          path: "/Applications/Example.app",
          displayName: "Example.app",
          action: "update_app",
          selection: "blocked",
          confidence: 0.5,
          evidence: ["app_update_handoff:inventory_only"],
          warnings: ["manual_update_review_required"],
        }],
      }],
    },
    summary: {
      totalItems: 1,
      updateActions: 1,
      installersLaunched: 0,
      approvalRequestsIssued: 0,
      agentInstallActions: 0,
      signedHostRequired: 1,
    },
  });

  assert.equal(report.items[0]?.willInstall, false);
  assert.equal(report.items[0]?.installerLaunched, false);
  assert.equal(report.items[0]?.approvalState, "not_requested");
  assert.equal(report.summary.installersLaunched, 0);
  assert.equal(report.summary.agentInstallActions, 0);
  const safety = evaluateMacCareActionPlanSafety(report.actionPlan, { actor: "agent" });
  assert.equal(safety.allowed, false);
  assert.deepEqual(safety.destructiveActions, ["update_app"]);
});

test("Mac Care cloud provider handoff reports are inventory-only and provider-mutation blocked", () => {
  const report = macCareCloudProviderHandoffReportSchema.parse({
    version: 1,
    status: "cloud_provider_handoff_inventory",
    createdAt: "2026-05-21T00:00:00.000Z",
    sourceScanId: "scan-1",
    items: [{
      id: "cloud-handoff-1",
      candidateId: "candidate-1",
      routeId: "mac_care.route.cloud_storage",
      path: "/Users/example/Library/CloudStorage/iCloudDrive",
      displayName: "iCloudDrive",
      providerHint: "icloud",
      handoffKind: "local_sync_root_review",
      status: "inventory_only",
      action: "unsync_cloud_item",
      selection: "blocked",
      executionAuthority: "signed_host_human_confirmed",
      agentCanMutateProvider: false,
      reasons: ["Cloud provider mutation is a signed-host human-confirmed handoff."],
    }],
    actionPlan: {
      id: "cloud-handoff-plan-1",
      createdAt: "2026-05-21T00:00:00.000Z",
      executionAuthority: "agent_plan_only",
      requestedBy: "agent",
      groups: [{
        id: "mac_care.group.cloud_provider_handoff",
        moduleId: "mac_care.module.cloud_storage_roots",
        title: "Cloud provider handoff",
        routeIds: ["mac_care.route.cloud_storage"],
        candidates: [{
          id: "candidate-1-unsync",
          routeId: "mac_care.route.cloud_storage",
          path: "/Users/example/Library/CloudStorage/iCloudDrive",
          displayName: "iCloudDrive",
          action: "unsync_cloud_item",
          selection: "blocked",
          confidence: 0.5,
          evidence: ["cloud_provider_handoff:inventory_only"],
          warnings: ["manual_cloud_provider_review_required"],
        }],
      }],
    },
  });

  assert.equal(report.items[0]?.agentCanMutateProvider, false);
  assert.equal(report.items[0]?.executionAuthority, "signed_host_human_confirmed");
  const safety = evaluateMacCareActionPlanSafety(report.actionPlan, { actor: "agent" });
  assert.equal(safety.allowed, false);
  assert.equal(safety.requiredAuthority, "signed_host_human_confirmed");
  assert.deepEqual(safety.destructiveActions, ["unsync_cloud_item"]);
});

test("Mac Care cloud provider approval packages carry no credentials and issue no mutation requests", () => {
  const report = macCareCloudProviderApprovalPackageReportSchema.parse({
    version: 1,
    status: "cloud_provider_approval_ready",
    createdAt: "2026-05-21T00:00:00.000Z",
    sourceHandoffStatus: "cloud_provider_handoff_inventory",
    sourceScanId: "scan-1",
    items: [{
      id: "cloud-approval-1",
      handoffItemId: "cloud-handoff-1",
      candidateId: "candidate-1",
      routeId: "mac_care.route.cloud_storage",
      path: "/Users/example/Library/CloudStorage/iCloudDrive",
      displayName: "iCloudDrive",
      providerHint: "icloud",
      requestedOperation: "unsync_cloud_item",
      approvalState: "not_requested",
      credentialsIncluded: false,
      willMutateProvider: false,
      agentCanMutateProvider: false,
      executionAuthority: "signed_host_human_confirmed",
      requiredEvidence: [
        "provider_account_selected_by_human",
        "signed_host_identity_verified",
        "explicit_item_level_confirmation",
      ],
      reentryCondition: "Resume only after signed host provider authority and exact human confirmation exist.",
      reasons: ["Approval package preparation does not include credentials or provider mutation."],
    }],
    actionPlan: {
      id: "cloud-handoff-plan-1",
      createdAt: "2026-05-21T00:00:00.000Z",
      executionAuthority: "agent_plan_only",
      requestedBy: "agent",
      groups: [{
        id: "mac_care.group.cloud_provider_handoff",
        moduleId: "mac_care.module.cloud_storage_roots",
        title: "Cloud provider handoff",
        routeIds: ["mac_care.route.cloud_storage"],
        candidates: [{
          id: "candidate-1-unsync",
          routeId: "mac_care.route.cloud_storage",
          path: "/Users/example/Library/CloudStorage/iCloudDrive",
          displayName: "iCloudDrive",
          action: "unsync_cloud_item",
          selection: "blocked",
          confidence: 0.5,
          evidence: ["cloud_provider_handoff:inventory_only"],
          warnings: ["manual_cloud_provider_review_required"],
        }],
      }],
    },
    summary: {
      totalItems: 1,
      providerMutationActions: 1,
      credentialsIncluded: 0,
      approvalRequestsIssued: 0,
      agentProviderMutations: 0,
      signedHostRequired: 1,
    },
  });

  assert.equal(report.items[0]?.credentialsIncluded, false);
  assert.equal(report.items[0]?.willMutateProvider, false);
  assert.equal(report.items[0]?.approvalState, "not_requested");
  assert.equal(report.summary.approvalRequestsIssued, 0);
  assert.equal(report.summary.agentProviderMutations, 0);
  const safety = evaluateMacCareActionPlanSafety(report.actionPlan, { actor: "agent" });
  assert.equal(safety.allowed, false);
  assert.deepEqual(safety.destructiveActions, ["unsync_cloud_item"]);
});

test("Mac Care protection fixture scan reports are plan-only and host-confirmed", () => {
  const report = macCareProtectionFixtureScanReportSchema.parse({
    version: 1,
    status: "protection_fixture_scan",
    createdAt: "2026-05-21T00:00:00.000Z",
    adapterId: "mac_care.protection.yara_core",
    fixtureDir: "/tmp/mac-care-fixture",
    findings: [{
      id: "finding-1",
      adapterId: "mac_care.protection.yara_core",
      path: "/tmp/mac-care-fixture/sample.txt",
      displayName: "sample.txt",
      signatureId: "mac-care.fixture.marker",
      signatureName: "Mac Care fixture marker",
      action: "quarantine",
      selection: "blocked",
      confidence: 0.99,
      evidence: ["fixture_marker:MAC_CARE_PROTECTION_FIXTURE_DETECT"],
      warnings: ["fixture_only_detection"],
    }],
    actionPlan: {
      id: "protection-plan-1",
      createdAt: "2026-05-21T00:00:00.000Z",
      executionAuthority: "agent_plan_only",
      requestedBy: "agent",
      groups: [{
        id: "mac_care.group.protection_fixture_scan",
        moduleId: "mac_care.module.protection_fixture",
        title: "Protection fixture scan",
        routeIds: ["mac_care.route.protection_fixture"],
        candidates: [{
          id: "candidate-1-quarantine",
          routeId: "mac_care.route.protection_fixture",
          path: "/tmp/mac-care-fixture/sample.txt",
          displayName: "sample.txt",
          action: "quarantine",
          selection: "blocked",
          confidence: 0.99,
          evidence: ["fixture_marker:MAC_CARE_PROTECTION_FIXTURE_DETECT"],
          warnings: ["fixture_only_detection"],
        }],
      }],
    },
  });

  const safety = evaluateMacCareActionPlanSafety(report.actionPlan, { actor: "agent" });
  assert.equal(report.findings[0]?.selection, "blocked");
  assert.equal(safety.allowed, false);
  assert.equal(safety.requiredAuthority, "signed_host_human_confirmed");
  assert.deepEqual(safety.destructiveActions, ["quarantine"]);
});
