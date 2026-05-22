import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import BetterSqlite3 from "better-sqlite3";
import type Database from "better-sqlite3";

import {
  MAC_CARE_SIDECAR_FILENAME,
  evaluateMacCareActionPlanSafety,
  listMacCareProtectionAdapters,
  listMacCareScannerWave1Modules,
  macCareActionPlanSchema,
  macCareAppUpdateApprovalPackageReportSchema,
  macCareAppUpdateHandoffReportSchema,
  macCareCandidateGroupSchema,
  macCareCloudProviderApprovalPackageReportSchema,
  macCareCloudProviderHandoffReportSchema,
  macCareProtectionApprovalPackageReportSchema,
  macCareProtectionEngineReadinessReportSchema,
  macCareProtectionFixtureScanReportSchema,
  macCareReadOnlyScanReportSchema,
  resolveMacCareRoutePathPattern,
  type MacCareAppUpdateHandoffReport,
  type MacCareAppUpdateApprovalPackageReport,
  type MacCareCandidate,
  type MacCareCandidateGroup,
  type MacCareCloudProviderApprovalPackageReport,
  type MacCareCloudProviderHandoffReport,
  type MacCareProtectionApprovalPackageReport,
  type MacCareProtectionAdapterId,
  type MacCareProtectionEngineReadinessReport,
  type MacCareProtectionFixtureScanReport,
  type MacCareReadOnlyScanReport,
  type MacCareRoutePathContext,
  type MacCareScannerModule,
} from "@clawjs/core";

import { openSidecar, resolveClawjsDataRoot } from "./v1-data-core.ts";

export const MAC_CARE_PROTECTION_FIXTURE_MARKER = "MAC_CARE_PROTECTION_FIXTURE_DETECT" as const;

export interface MacCareReadOnlyScannerInput {
  homeDir: string;
  applicationsDir?: string;
  now?: Date;
  largeFileBytes?: number;
  oldFileDays?: number;
  maxEntriesPerModule?: number;
}

export interface MacCareReadOnlyScannerOutput extends MacCareReadOnlyScanReport {
  safety: ReturnType<typeof evaluateMacCareActionPlanSafety>;
  summary: {
    totalCandidates: number;
    totalSizeBytes: number;
    destructiveActions: number;
  };
}

export interface MacCareAppUpdateHandoffOutput extends MacCareAppUpdateHandoffReport {
  safety: ReturnType<typeof evaluateMacCareActionPlanSafety>;
  summary: {
    totalItems: number;
    agentInstallActions: number;
    signedHostRequired: number;
  };
}

export interface MacCareAppUpdateApprovalPackageOutput extends MacCareAppUpdateApprovalPackageReport {
  safety: ReturnType<typeof evaluateMacCareActionPlanSafety>;
}

export interface MacCareProtectionFixtureScanOutput extends MacCareProtectionFixtureScanReport {
  safety: ReturnType<typeof evaluateMacCareActionPlanSafety>;
  summary: {
    totalFindings: number;
    quarantineActions: number;
    agentQuarantineActions: number;
  };
}

export interface MacCareProtectionEngineReadinessOutput extends MacCareProtectionEngineReadinessReport {}

export interface MacCareProtectionApprovalPackageOutput extends MacCareProtectionApprovalPackageReport {}

export interface MacCareCloudProviderHandoffOutput extends MacCareCloudProviderHandoffReport {
  safety: ReturnType<typeof evaluateMacCareActionPlanSafety>;
  summary: {
    totalItems: number;
    providerMutationActions: number;
    agentProviderMutations: number;
    signedHostRequired: number;
  };
}

export interface MacCareCloudProviderApprovalPackageOutput extends MacCareCloudProviderApprovalPackageReport {
  safety: ReturnType<typeof evaluateMacCareActionPlanSafety>;
}

export interface MacCareFinalizerFixtureScanOutput extends MacCareReadOnlyScannerOutput {
  status: "read_only_scan";
  fixtureOnly: true;
}

export interface MacCareScanPersistenceReceipt {
  persisted: boolean;
  sidecar: typeof MAC_CARE_SIDECAR_FILENAME;
  scanId: string;
  scanRows: number;
  candidateRows: number;
  actionPlanRows: number;
}

export interface MacCarePersistedScanSummary {
  id: string;
  moduleId: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  summary: Record<string, unknown>;
  metadata: Record<string, unknown>;
  candidateCount: number;
  actionPlanCount: number;
}

export interface MacCarePersistedCandidate {
  id: string;
  routeId: string;
  path: string;
  action: string;
  selection: string;
  confidence: number;
  sizeBytes: number | null;
  evidence: unknown[];
  warnings: unknown[];
  metadata: Record<string, unknown>;
}

export interface MacCarePersistedScanDetail {
  scan: MacCarePersistedScanSummary;
  candidates: MacCarePersistedCandidate[];
  actionPlan: unknown | null;
  safety: unknown | null;
}

interface CandidateSeed {
  routeId: string;
  path: string;
  displayName: string;
  sizeBytes?: number;
  evidence: string[];
  warnings?: string[];
  confidence?: number;
  idSeed?: string;
}

export function runMacCareReadOnlyScanner(input: MacCareReadOnlyScannerInput): MacCareReadOnlyScannerOutput {
  const homeDir = normalizeAbsolutePath(input.homeDir);
  const routeContext: MacCareRoutePathContext = {
    homeDir,
    ...(input.applicationsDir ? { systemApplicationsDir: normalizeAbsolutePath(input.applicationsDir) } : {}),
  };
  const now = input.now ?? new Date();
  const largeFileBytes = input.largeFileBytes ?? 500 * 1024 * 1024;
  const oldFileDays = input.oldFileDays ?? 90;
  const maxEntries = input.maxEntriesPerModule ?? 250;
  const modules = listMacCareScannerWave1Modules();
  const groups = [
    scanDirectoryModule(moduleById(modules, "mac_care.module.user_caches"), routePath("mac_care.route.user_caches", routeContext), "mac_care.route.user_caches", maxEntries),
    scanDirectoryModule(moduleById(modules, "mac_care.module.user_logs"), routePath("mac_care.route.user_logs", routeContext), "mac_care.route.user_logs", maxEntries),
    scanDirectoryModule(moduleById(modules, "mac_care.module.downloads"), routePath("mac_care.route.downloads", routeContext), "mac_care.route.downloads", maxEntries),
    scanLargeOldFiles(moduleById(modules, "mac_care.module.large_old_files"), routeContext, now, largeFileBytes, oldFileDays, maxEntries),
    scanApplications(moduleById(modules, "mac_care.module.app_inventory"), routeContext, maxEntries),
    scanDirectoryModule(moduleById(modules, "mac_care.module.cloud_storage_roots"), routePath("mac_care.route.cloud_storage", routeContext), "mac_care.route.cloud_storage", maxEntries),
  ];
  const scanId = `mac-care-scan-${stableHash([homeDir, now.toISOString()].join("|")).slice(0, 16)}`;
  const actionPlan = macCareActionPlanSchema.parse({
    id: `${scanId}-plan`,
    createdAt: now.toISOString(),
    executionAuthority: "agent_plan_only",
    requestedBy: "agent",
    groups,
  });
  const report = macCareReadOnlyScanReportSchema.parse({
    version: 1,
    status: "read_only_scan",
    scanId,
    createdAt: now.toISOString(),
    homeDir,
    modules,
    groups,
    actionPlan,
  });
  const safety = evaluateMacCareActionPlanSafety(actionPlan, { actor: "agent" });
  return {
    ...report,
    safety,
    summary: {
      totalCandidates: groups.reduce((total, group) => total + group.candidates.length, 0),
      totalSizeBytes: groups.reduce((total, group) => total + group.candidates.reduce((sum, candidate) => sum + (candidate.sizeBytes ?? 0), 0), 0),
      destructiveActions: safety.destructiveActions.length,
    },
  };
}

export function buildMacCareFinalizerFixtureScan(input: {
  fixtureDir: string;
  now?: Date;
}): MacCareFinalizerFixtureScanOutput {
  const fixtureDir = normalizeAbsolutePath(input.fixtureDir);
  const now = input.now ?? new Date();
  const modules = listMacCareScannerWave1Modules();
  const candidatePath = path.join(fixtureDir, "blocked-trash-candidate.fixture");
  const group = macCareCandidateGroupSchema.parse({
    id: "mac_care.group.finalizer_fixture",
    moduleId: "mac_care.module.downloads",
    title: "Finalizer preview fixture",
    routeIds: ["mac_care.route.downloads"],
    candidates: [{
      id: `mac-care-finalizer-fixture-${stableHash(candidatePath).slice(0, 16)}`,
      routeId: "mac_care.route.downloads",
      path: candidatePath,
      displayName: "blocked-trash-candidate.fixture",
      sizeBytes: 1,
      action: "move_to_trash",
      selection: "blocked",
      confidence: 1,
      evidence: ["finalizer_fixture:preview_only"],
      warnings: ["fixture_only", "signed_host_human_confirmation_required"],
    }],
  });
  const scanId = `mac-care-finalizer-fixture-${stableHash(`${fixtureDir}|${now.toISOString()}`).slice(0, 16)}`;
  const actionPlan = macCareActionPlanSchema.parse({
    id: `${scanId}-plan`,
    createdAt: now.toISOString(),
    executionAuthority: "agent_plan_only",
    requestedBy: "test",
    groups: [group],
  });
  const report = macCareReadOnlyScanReportSchema.parse({
    version: 1,
    status: "read_only_scan",
    scanId,
    createdAt: now.toISOString(),
    homeDir: fixtureDir,
    modules,
    groups: [group],
    actionPlan,
  });
  const safety = evaluateMacCareActionPlanSafety(actionPlan, { actor: "test" });
  return {
    ...report,
    fixtureOnly: true,
    safety,
    summary: {
      totalCandidates: 1,
      totalSizeBytes: 1,
      destructiveActions: safety.destructiveActions.length,
    },
  };
}

export function buildMacCareAppUpdateHandoffReport(report: MacCareReadOnlyScannerOutput, now: Date = new Date()): MacCareAppUpdateHandoffOutput {
  const appGroup = report.groups.find((group) => group.moduleId === "mac_care.module.app_inventory");
  const appCandidates = appGroup?.candidates.filter((candidate) => (
    candidate.routeId === "mac_care.route.user_applications" || candidate.routeId === "mac_care.route.system_applications"
  )) ?? [];
  const items = appCandidates.map((appCandidate) => ({
    id: `mac-care-app-update-handoff-${stableHash(`${report.scanId}|${appCandidate.id}|${appCandidate.path}`).slice(0, 16)}`,
    candidateId: appCandidate.id,
    routeId: appCandidate.routeId,
    path: appCandidate.path,
    displayName: appCandidate.displayName,
    handoffKind: "manual_review" as const,
    status: "inventory_only" as const,
    action: "update_app" as const,
    selection: "blocked" as const,
    executionAuthority: "signed_host_human_confirmed" as const,
    agentCanInstall: false as const,
    reasons: [
      "Mac Care can inventory applications for update review, but agents and tests cannot install updates.",
      "Any installation or vendor handoff must be completed by signed host UI after explicit human confirmation.",
    ],
  }));
  const handoffGroup = macCareCandidateGroupSchema.parse({
    id: "mac_care.group.app_update_handoff",
    moduleId: "mac_care.module.app_inventory",
    title: "Application update handoff",
    routeIds: ["mac_care.route.user_applications", "mac_care.route.system_applications"],
    candidates: appCandidates.map((appCandidate) => ({
      id: `mac-care-update-candidate-${stableHash(`${report.scanId}|update|${appCandidate.id}`).slice(0, 16)}`,
      routeId: appCandidate.routeId,
      path: appCandidate.path,
      displayName: appCandidate.displayName,
      sizeBytes: appCandidate.sizeBytes,
      action: "update_app",
      selection: "blocked",
      confidence: 0.5,
      evidence: [`app_update_handoff:inventory_only`, `source_candidate:${appCandidate.id}`],
      warnings: ["manual_update_review_required"],
    })),
  });
  const actionPlan = macCareActionPlanSchema.parse({
    id: `${report.scanId}-app-update-handoff-plan`,
    createdAt: now.toISOString(),
    executionAuthority: "agent_plan_only",
    requestedBy: "agent",
    groups: [handoffGroup],
  });
  const parsed = macCareAppUpdateHandoffReportSchema.parse({
    version: 1,
    status: "app_update_handoff_inventory",
    createdAt: now.toISOString(),
    sourceScanId: report.scanId,
    items,
    actionPlan,
  });
  const safety = evaluateMacCareActionPlanSafety(parsed.actionPlan, { actor: "agent" });
  return {
    ...parsed,
    safety,
    summary: {
      totalItems: parsed.items.length,
      agentInstallActions: parsed.items.filter((item) => item.agentCanInstall).length,
      signedHostRequired: parsed.items.filter((item) => item.executionAuthority === "signed_host_human_confirmed").length,
    },
  };
}

export function buildMacCareAppUpdateApprovalPackage(handoff: MacCareAppUpdateHandoffReport, now: Date = new Date()): MacCareAppUpdateApprovalPackageOutput {
  const parsed = macCareAppUpdateApprovalPackageReportSchema.parse({
    version: 1,
    status: "app_update_approval_ready",
    createdAt: now.toISOString(),
    sourceHandoffStatus: handoff.status,
    sourceScanId: handoff.sourceScanId,
    items: handoff.items.map((item) => ({
      id: `mac-care-app-update-approval-${stableHash(`${handoff.sourceScanId}|${item.id}|${item.path}`).slice(0, 16)}`,
      handoffItemId: item.id,
      candidateId: item.candidateId,
      routeId: item.routeId,
      path: item.path,
      displayName: item.displayName,
      handoffKind: item.handoffKind,
      requestedOperation: item.action,
      approvalState: "not_requested",
      willInstall: false,
      installerLaunched: false,
      agentCanInstall: false,
      executionAuthority: "signed_host_human_confirmed",
      requiredEvidence: [
        "signed_host_identity_verified",
        "app_identity_and_path_confirmed",
        "vendor_or_store_update_source_confirmed",
        "explicit_item_level_confirmation",
      ],
      reentryCondition: "Resume only after the signed host verifies the app identity, update source, and the human confirms this exact installation handoff.",
      reasons: [
        "This package prepares update approval only; it does not launch installers or issue approval requests.",
        "Application installation remains blocked for agents and requires signed host human confirmation.",
      ],
    })),
    actionPlan: handoff.actionPlan,
    summary: {
      totalItems: handoff.items.length,
      updateActions: handoff.items.filter((item) => item.action === "update_app").length,
      installersLaunched: 0,
      approvalRequestsIssued: 0,
      agentInstallActions: 0,
      signedHostRequired: handoff.items.filter((item) => item.executionAuthority === "signed_host_human_confirmed").length,
    },
  });
  const safety = evaluateMacCareActionPlanSafety(parsed.actionPlan, { actor: "agent" });
  return {
    ...parsed,
    safety,
  };
}

export function runMacCareProtectionFixtureScan(input: {
  fixtureDir: string;
  adapterId?: MacCareProtectionAdapterId;
  now?: Date;
  maxEntries?: number;
}): MacCareProtectionFixtureScanOutput {
  const fixtureDir = normalizeAbsolutePath(input.fixtureDir);
  const adapterId = input.adapterId ?? "mac_care.protection.yara_core";
  const adapter = listMacCareProtectionAdapters().find((entry) => entry.id === adapterId);
  if (!adapter) throw new Error(`Unknown Mac Care protection adapter: ${adapterId}`);
  if (adapter.executionMode !== "fixture_only") throw new Error(`Mac Care protection adapter ${adapterId} is not available for fixture scans`);
  const now = input.now ?? new Date();
  const findings = walkFiles(fixtureDir, 4, input.maxEntries ?? 250)
    .filter((entry) => fileContainsFixtureMarker(entry.path))
    .map((entry) => ({
      id: `mac-care-protection-finding-${stableHash(`${adapterId}|${entry.path}`).slice(0, 16)}`,
      adapterId,
      path: normalizeAbsolutePath(entry.path),
      displayName: entry.displayName,
      signatureId: "mac-care.fixture.marker",
      signatureName: "Mac Care fixture marker",
      action: "quarantine" as const,
      selection: "blocked" as const,
      confidence: 0.99,
      evidence: [`fixture_marker:${MAC_CARE_PROTECTION_FIXTURE_MARKER}`, `adapter:${adapterId}`],
      warnings: ["fixture_only_detection", "signed_host_quarantine_required"],
    }));
  const group = macCareCandidateGroupSchema.parse({
    id: "mac_care.group.protection_fixture_scan",
    moduleId: "mac_care.module.protection_fixture",
    title: "Protection fixture scan",
    routeIds: ["mac_care.route.protection_fixture"],
    candidates: findings.map((finding) => ({
      id: `mac-care-protection-candidate-${stableHash(`${finding.id}|quarantine`).slice(0, 16)}`,
      routeId: "mac_care.route.protection_fixture",
      path: finding.path,
      displayName: finding.displayName,
      action: "quarantine",
      selection: "blocked",
      confidence: finding.confidence,
      evidence: finding.evidence,
      warnings: finding.warnings,
    })),
  });
  const actionPlan = macCareActionPlanSchema.parse({
    id: `mac-care-protection-fixture-${stableHash([fixtureDir, adapterId, now.toISOString()].join("|")).slice(0, 16)}-plan`,
    createdAt: now.toISOString(),
    executionAuthority: "agent_plan_only",
    requestedBy: "agent",
    groups: [group],
  });
  const parsed = macCareProtectionFixtureScanReportSchema.parse({
    version: 1,
    status: "protection_fixture_scan",
    createdAt: now.toISOString(),
    adapterId,
    fixtureDir,
    findings,
    actionPlan,
  });
  const safety = evaluateMacCareActionPlanSafety(parsed.actionPlan, { actor: "agent" });
  return {
    ...parsed,
    safety,
    summary: {
      totalFindings: parsed.findings.length,
      quarantineActions: parsed.findings.filter((finding) => finding.action === "quarantine").length,
      agentQuarantineActions: 0,
    },
  };
}

export function buildMacCareProtectionEngineReadiness(input: {
  now?: Date;
  pathEnv?: string;
} = {}): MacCareProtectionEngineReadinessOutput {
  const now = input.now ?? new Date();
  const pathEnv = input.pathEnv ?? process.env.PATH ?? "";
  const engines = listMacCareProtectionAdapters().map((adapter) => {
    const requiredScanBinaries = adapter.engine === "clamav" ? ["clamscan"] : ["yara"];
    const requiredUpdateBinaries = adapter.engine === "clamav" ? ["freshclam"] : [];
    const detectedBinaries = [...requiredScanBinaries, ...requiredUpdateBinaries].map((name) => {
      const binaryPath = findExecutableOnPath(name, pathEnv);
      return { name, path: binaryPath, present: binaryPath !== null };
    });
    const scanBinaryDetected = requiredScanBinaries.every((name) => detectedBinaries.some((binary) => binary.name === name && binary.present));
    const updateBinaryDetected = requiredUpdateBinaries.every((name) => detectedBinaries.some((binary) => binary.name === name && binary.present));
    const runtimeStatus = adapter.executionMode === "fixture_only"
      ? "fixture_only"
      : scanBinaryDetected ? "external_engine_detected" : "external_engine_missing";
    const databaseStatus = adapter.updateSource === "bundled_fixture"
      ? "bundled_fixture"
      : updateBinaryDetected ? "external_update_tool_detected" : "external_update_tool_missing";
    return {
      adapterId: adapter.id,
      engine: adapter.engine,
      label: adapter.label,
      executionMode: adapter.executionMode,
      requiredScanBinaries,
      requiredUpdateBinaries,
      detectedBinaries,
      runtimeStatus,
      databaseStatus,
      agentCanScan: false as const,
      agentCanUpdateDatabase: false as const,
      agentCanQuarantine: false as const,
      requiredAuthority: "signed_host_human_confirmed" as const,
      notes: [
        "Readiness only; Mac Care does not run protection engines, update databases, or quarantine files from this command.",
        "Any real scan, database update, or quarantine path requires signed host UI confirmation and a later runtime integration slice.",
      ],
    };
  });
  return macCareProtectionEngineReadinessReportSchema.parse({
    version: 1,
    status: "protection_engine_readiness",
    createdAt: now.toISOString(),
    engines,
    summary: {
      totalEngines: engines.length,
      detectedEngines: engines.filter((engine) => engine.runtimeStatus === "external_engine_detected").length,
      agentExecutableScans: 0,
      agentDatabaseUpdates: 0,
      agentQuarantineActions: 0,
      signedHostRequired: engines.length,
    },
  });
}

export function buildMacCareProtectionApprovalPackage(readiness: MacCareProtectionEngineReadinessReport, now: Date = new Date()): MacCareProtectionApprovalPackageOutput {
  return macCareProtectionApprovalPackageReportSchema.parse({
    version: 1,
    status: "protection_approval_ready",
    createdAt: now.toISOString(),
    sourceReadinessStatus: readiness.status,
    engines: readiness.engines.map((engine) => ({
      id: `mac-care-protection-approval-${stableHash(`${readiness.createdAt}|${engine.adapterId}|${engine.runtimeStatus}|${engine.databaseStatus}`).slice(0, 16)}`,
      adapterId: engine.adapterId,
      engine: engine.engine,
      label: engine.label,
      runtimeStatus: engine.runtimeStatus,
      databaseStatus: engine.databaseStatus,
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
        "quarantine_receipt_policy_confirmed",
      ],
      reentryCondition: "Resume only after the signed host verifies engine/runtime/database policy and the human confirms the exact scan scope and quarantine policy.",
      reasons: [
        "This package prepares protection approval only; it does not run engines, update databases, scan files, or quarantine items.",
        "Real protection execution remains blocked for agents and requires signed host human confirmation.",
      ],
    })),
    summary: {
      totalEngines: readiness.engines.length,
      detectedEngines: readiness.engines.filter((engine) => engine.runtimeStatus === "external_engine_detected").length,
      scanRequestsIssued: 0,
      databaseUpdateRequestsIssued: 0,
      quarantineRequestsIssued: 0,
      agentExecutableScans: 0,
      agentDatabaseUpdates: 0,
      agentQuarantineActions: 0,
      signedHostRequired: readiness.engines.length,
    },
  });
}

export function buildMacCareCloudProviderHandoffReport(report: MacCareReadOnlyScannerOutput, now: Date = new Date()): MacCareCloudProviderHandoffOutput {
  const cloudGroup = report.groups.find((group) => group.moduleId === "mac_care.module.cloud_storage_roots");
  const cloudCandidates = cloudGroup?.candidates.filter((candidate) => candidate.routeId === "mac_care.route.cloud_storage") ?? [];
  const items = cloudCandidates.map((cloudCandidate) => ({
    id: `mac-care-cloud-handoff-${stableHash(`${report.scanId}|${cloudCandidate.id}|${cloudCandidate.path}`).slice(0, 16)}`,
    candidateId: cloudCandidate.id,
    routeId: "mac_care.route.cloud_storage" as const,
    path: cloudCandidate.path,
    displayName: cloudCandidate.displayName,
    providerHint: inferCloudProviderHint(cloudCandidate.displayName),
    handoffKind: "local_sync_root_review" as const,
    status: "inventory_only" as const,
    action: "unsync_cloud_item" as const,
    selection: "blocked" as const,
    executionAuthority: "signed_host_human_confirmed" as const,
    agentCanMutateProvider: false as const,
    reasons: [
      "Mac Care can inventory local cloud sync roots, but agents and tests cannot unsync or delete provider-backed items.",
      "Provider mutations require signed host UI, explicit human confirmation, and a later provider-specific integration.",
    ],
  }));
  const handoffGroup = macCareCandidateGroupSchema.parse({
    id: "mac_care.group.cloud_provider_handoff",
    moduleId: "mac_care.module.cloud_storage_roots",
    title: "Cloud provider handoff",
    routeIds: ["mac_care.route.cloud_storage"],
    candidates: cloudCandidates.map((cloudCandidate) => ({
      id: `mac-care-cloud-candidate-${stableHash(`${report.scanId}|unsync|${cloudCandidate.id}`).slice(0, 16)}`,
      routeId: "mac_care.route.cloud_storage",
      path: cloudCandidate.path,
      displayName: cloudCandidate.displayName,
      sizeBytes: cloudCandidate.sizeBytes,
      action: "unsync_cloud_item",
      selection: "blocked",
      confidence: 0.5,
      evidence: [`cloud_provider_handoff:inventory_only`, `source_candidate:${cloudCandidate.id}`],
      warnings: ["manual_cloud_provider_review_required"],
    })),
  });
  const actionPlan = macCareActionPlanSchema.parse({
    id: `${report.scanId}-cloud-provider-handoff-plan`,
    createdAt: now.toISOString(),
    executionAuthority: "agent_plan_only",
    requestedBy: "agent",
    groups: [handoffGroup],
  });
  const parsed = macCareCloudProviderHandoffReportSchema.parse({
    version: 1,
    status: "cloud_provider_handoff_inventory",
    createdAt: now.toISOString(),
    sourceScanId: report.scanId,
    items,
    actionPlan,
  });
  const safety = evaluateMacCareActionPlanSafety(parsed.actionPlan, { actor: "agent" });
  return {
    ...parsed,
    safety,
    summary: {
      totalItems: parsed.items.length,
      providerMutationActions: parsed.items.filter((item) => item.action === "unsync_cloud_item").length,
      agentProviderMutations: parsed.items.filter((item) => item.agentCanMutateProvider).length,
      signedHostRequired: parsed.items.filter((item) => item.executionAuthority === "signed_host_human_confirmed").length,
    },
  };
}

export function buildMacCareCloudProviderApprovalPackage(handoff: MacCareCloudProviderHandoffReport, now: Date = new Date()): MacCareCloudProviderApprovalPackageOutput {
  const parsed = macCareCloudProviderApprovalPackageReportSchema.parse({
    version: 1,
    status: "cloud_provider_approval_ready",
    createdAt: now.toISOString(),
    sourceHandoffStatus: handoff.status,
    sourceScanId: handoff.sourceScanId,
    items: handoff.items.map((item) => ({
      id: `mac-care-cloud-approval-${stableHash(`${handoff.sourceScanId}|${item.id}|${item.path}`).slice(0, 16)}`,
      handoffItemId: item.id,
      candidateId: item.candidateId,
      routeId: item.routeId,
      path: item.path,
      displayName: item.displayName,
      providerHint: item.providerHint,
      requestedOperation: item.action,
      approvalState: "not_requested",
      credentialsIncluded: false,
      willMutateProvider: false,
      agentCanMutateProvider: false,
      executionAuthority: "signed_host_human_confirmed",
      requiredEvidence: [
        "provider_account_selected_by_human",
        "signed_host_identity_verified",
        "explicit_item_level_confirmation",
        "provider_specific_rollback_reviewed",
      ],
      reentryCondition: "Resume only after the signed host has provider-specific authority, credentials are supplied outside agent logs, and the human confirms this exact item.",
      reasons: [
        "This package prepares provider review only; it does not include credentials or issue approval requests.",
        "Provider-backed unsync or deletion remains blocked for agents and requires signed host human confirmation.",
      ],
    })),
    actionPlan: handoff.actionPlan,
    summary: {
      totalItems: handoff.items.length,
      providerMutationActions: handoff.items.filter((item) => item.action === "unsync_cloud_item").length,
      credentialsIncluded: 0,
      approvalRequestsIssued: 0,
      agentProviderMutations: 0,
      signedHostRequired: handoff.items.filter((item) => item.executionAuthority === "signed_host_human_confirmed").length,
    },
  });
  const safety = evaluateMacCareActionPlanSafety(parsed.actionPlan, { actor: "agent" });
  return {
    ...parsed,
    safety,
  };
}

function scanDirectoryModule(module: MacCareScannerModule, directory: string, routeId: string, maxEntries: number): MacCareCandidateGroup {
  const candidates = listImmediateChildren(directory, maxEntries).map((entry) => candidate({
    routeId,
    path: entry.path,
    displayName: entry.displayName,
    sizeBytes: entry.sizeBytes,
    evidence: [`read_only_directory_inventory:${module.id}`],
    idSeed: `${module.id}|${entry.path}`,
  }));
  return group(module, candidates);
}

function scanLargeOldFiles(
  module: MacCareScannerModule,
  routeContext: MacCareRoutePathContext,
  now: Date,
  largeFileBytes: number,
  oldFileDays: number,
  maxEntries: number,
): MacCareCandidateGroup {
  const roots = [
    { routeId: "mac_care.route.downloads", path: routePath("mac_care.route.downloads", routeContext) },
    { routeId: "mac_care.route.user_caches", path: routePath("mac_care.route.user_caches", routeContext) },
    { routeId: "mac_care.route.user_logs", path: routePath("mac_care.route.user_logs", routeContext) },
  ];
  const candidates: MacCareCandidate[] = [];
  for (const root of roots) {
    for (const entry of walkFiles(root.path, 3, maxEntries)) {
      if (candidates.length >= maxEntries) break;
      const ageDays = Math.floor(Math.max(0, now.getTime() - entry.mtimeMs) / 86_400_000);
      const warnings: string[] = [];
      if ((entry.sizeBytes ?? 0) >= largeFileBytes) warnings.push("large_file");
      if (ageDays >= oldFileDays) warnings.push("older_than_threshold");
      if (warnings.length === 0) continue;
      candidates.push(candidate({
        routeId: root.routeId,
        path: entry.path,
        displayName: entry.displayName,
        sizeBytes: entry.sizeBytes,
        evidence: [`read_only_file_stat:${module.id}`, `age_days:${ageDays}`],
        warnings,
        confidence: 0.85,
        idSeed: `${module.id}|${entry.path}`,
      }));
    }
  }
  return group(module, candidates);
}

function scanApplications(module: MacCareScannerModule, routeContext: MacCareRoutePathContext, maxEntries: number): MacCareCandidateGroup {
  const systemApplicationsPath = resolveMacCareRoutePathPattern("mac_care.route.system_applications", routeContext);
  const candidates = [
    ...listImmediateChildren(routePath("mac_care.route.user_applications", routeContext), maxEntries).map((entry) => candidate({
      routeId: "mac_care.route.user_applications",
      path: entry.path,
      displayName: entry.displayName,
      sizeBytes: entry.sizeBytes,
      evidence: [`read_only_application_inventory:${module.id}`],
      confidence: 0.9,
      idSeed: `${module.id}|${entry.path}`,
    })),
    ...(systemApplicationsPath ? listImmediateChildren(systemApplicationsPath, maxEntries).map((entry) => candidate({
      routeId: "mac_care.route.system_applications",
      path: entry.path,
      displayName: entry.displayName,
      sizeBytes: entry.sizeBytes,
      evidence: [`read_only_application_inventory:${module.id}`],
      confidence: 0.9,
      idSeed: `${module.id}|${entry.path}`,
    })) : []),
  ].slice(0, maxEntries);
  return group(module, candidates);
}

function routePath(routeId: string, context: MacCareRoutePathContext): string {
  const resolved = resolveMacCareRoutePathPattern(routeId, context);
  if (!resolved) throw new Error(`Mac Care route ${routeId} is not resolvable for this scanner context`);
  return resolved;
}

function listImmediateChildren(directory: string, maxEntries: number): Array<{ path: string; displayName: string; sizeBytes?: number }> {
  try {
    return fs.readdirSync(directory, { withFileTypes: true })
      .slice(0, maxEntries)
      .map((entry) => {
        const entryPath = path.join(directory, entry.name);
        return {
          path: entryPath,
          displayName: entry.name,
          sizeBytes: estimatePathSize(entryPath, entry.isDirectory() ? 2 : 0),
        };
      });
  } catch (error) {
    if (isMissingOrUnreadable(error)) return [];
    throw error;
  }
}

function walkFiles(directory: string, depth: number, maxEntries: number): Array<{ path: string; displayName: string; sizeBytes: number; mtimeMs: number }> {
  if (depth < 0 || maxEntries <= 0) return [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if (isMissingOrUnreadable(error)) return [];
    throw error;
  }
  const files: Array<{ path: string; displayName: string; sizeBytes: number; mtimeMs: number }> = [];
  for (const entry of entries) {
    if (files.length >= maxEntries) break;
    const entryPath = path.join(directory, entry.name);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(entryPath);
    } catch (error) {
      if (isMissingOrUnreadable(error)) continue;
      throw error;
    }
    if (stat.isDirectory()) {
      files.push(...walkFiles(entryPath, depth - 1, maxEntries - files.length));
      continue;
    }
    if (!stat.isFile()) continue;
    files.push({ path: entryPath, displayName: entry.name, sizeBytes: stat.size, mtimeMs: stat.mtimeMs });
  }
  return files;
}

function estimatePathSize(entryPath: string, depth: number): number | undefined {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(entryPath);
  } catch (error) {
    if (isMissingOrUnreadable(error)) return undefined;
    throw error;
  }
  if (stat.isFile()) return stat.size;
  if (!stat.isDirectory() || depth <= 0) return undefined;
  return walkFiles(entryPath, depth, 500).reduce((total, entry) => total + entry.sizeBytes, 0);
}

function fileContainsFixtureMarker(entryPath: string): boolean {
  try {
    const stat = fs.statSync(entryPath);
    if (!stat.isFile() || stat.size > 1024 * 1024) return false;
    return fs.readFileSync(entryPath, "utf8").includes(MAC_CARE_PROTECTION_FIXTURE_MARKER);
  } catch (error) {
    if (isMissingOrUnreadable(error)) return false;
    throw error;
  }
}

function findExecutableOnPath(binaryName: string, pathEnv: string): string | null {
  for (const directory of pathEnv.split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.join(directory, binaryName);
    try {
      const stat = fs.statSync(candidate);
      if (stat.isFile() && (stat.mode & 0o111) !== 0) return candidate.replace(/\\/g, "/");
    } catch (error) {
      if (isMissingOrUnreadable(error)) continue;
      throw error;
    }
  }
  return null;
}

function inferCloudProviderHint(displayName: string): string {
  const normalized = displayName.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (normalized.includes("icloud")) return "icloud";
  if (normalized.includes("dropbox")) return "dropbox";
  if (normalized.includes("googledrive")) return "google_drive";
  if (normalized.includes("onedrive")) return "onedrive";
  if (normalized.includes("box")) return "box";
  return "unknown";
}

function group(module: MacCareScannerModule, candidates: MacCareCandidate[]): MacCareCandidateGroup {
  return macCareCandidateGroupSchema.parse({
    id: module.id.replace(".module.", ".group."),
    moduleId: module.id,
    title: module.title,
    routeIds: module.routeIds,
    candidates,
  });
}

function candidate(seed: CandidateSeed): MacCareCandidate {
  return {
    id: `mac-care-candidate-${stableHash(seed.idSeed ?? seed.path).slice(0, 16)}`,
    routeId: seed.routeId,
    path: normalizeAbsolutePath(seed.path),
    displayName: seed.displayName,
    ...(seed.sizeBytes === undefined ? {} : { sizeBytes: seed.sizeBytes }),
    action: "review",
    selection: "unselected",
    confidence: seed.confidence ?? 1,
    evidence: seed.evidence,
    warnings: seed.warnings ?? [],
  };
}

export function persistMacCareScanReport(report: MacCareReadOnlyScannerOutput, env: NodeJS.ProcessEnv = process.env): MacCareScanPersistenceReceipt {
  const sqlite = openSidecar(MAC_CARE_SIDECAR_FILENAME, env);
  try {
    const candidateRows = report.groups.reduce((total, group) => total + group.candidates.length, 0);
    const persist = sqlite.transaction(() => {
      sqlite.prepare(`
        INSERT OR REPLACE INTO mac_care_scans
          (id, module_id, status, started_at, completed_at, summary_json, metadata_json)
        VALUES
          (@id, @moduleId, @status, @startedAt, @completedAt, @summaryJson, @metadataJson)
      `).run({
        id: report.scanId,
        moduleId: "mac_care.scan.wave_1",
        status: "completed",
        startedAt: report.createdAt,
        completedAt: report.createdAt,
        summaryJson: JSON.stringify(report.summary),
        metadataJson: JSON.stringify({
          homeDir: report.homeDir,
          modules: report.modules.map((module) => module.id),
        }),
      });
      const candidateStatement = sqlite.prepare(`
        INSERT OR REPLACE INTO mac_care_candidates
          (id, scan_id, route_id, path, action, selection, confidence, size_bytes, evidence_json, warnings_json, metadata_json, created_at)
        VALUES
          (@id, @scanId, @routeId, @path, @action, @selection, @confidence, @sizeBytes, @evidenceJson, @warningsJson, @metadataJson, @createdAt)
      `);
      for (const group of report.groups) {
        for (const candidate of group.candidates) {
          candidateStatement.run({
            id: candidate.id,
            scanId: report.scanId,
            routeId: candidate.routeId,
            path: candidate.path,
            action: candidate.action,
            selection: candidate.selection,
            confidence: candidate.confidence,
            sizeBytes: candidate.sizeBytes ?? null,
            evidenceJson: JSON.stringify(candidate.evidence),
            warningsJson: JSON.stringify(candidate.warnings),
            metadataJson: JSON.stringify({
              displayName: candidate.displayName,
              groupId: group.id,
              moduleId: group.moduleId,
            }),
            createdAt: report.createdAt,
          });
        }
      }
      sqlite.prepare(`
        INSERT OR REPLACE INTO mac_care_action_plans
          (id, scan_id, authority, requested_by, plan_json, safety_json, created_at)
        VALUES
          (@id, @scanId, @authority, @requestedBy, @planJson, @safetyJson, @createdAt)
      `).run({
        id: report.actionPlan.id,
        scanId: report.scanId,
        authority: report.actionPlan.executionAuthority,
        requestedBy: report.actionPlan.requestedBy,
        planJson: JSON.stringify(report.actionPlan),
        safetyJson: JSON.stringify(report.safety),
        createdAt: report.createdAt,
      });
    });
    persist();
    return {
      persisted: true,
      sidecar: MAC_CARE_SIDECAR_FILENAME,
      scanId: report.scanId,
      scanRows: 1,
      candidateRows,
      actionPlanRows: 1,
    };
  } finally {
    sqlite.close();
  }
}

export function listPersistedMacCareScans(input: { limit?: number } = {}, env: NodeJS.ProcessEnv = process.env): MacCarePersistedScanSummary[] {
  const sqlite = openExistingMacCareSidecarReadonly(env);
  if (!sqlite) return [];
  try {
    return (sqlite.prepare(`
      SELECT
        s.id,
        s.module_id AS moduleId,
        s.status,
        s.started_at AS startedAt,
        s.completed_at AS completedAt,
        s.summary_json AS summaryJson,
        s.metadata_json AS metadataJson,
        COUNT(DISTINCT c.id) AS candidateCount,
        COUNT(DISTINCT p.id) AS actionPlanCount
      FROM mac_care_scans s
      LEFT JOIN mac_care_candidates c ON c.scan_id = s.id
      LEFT JOIN mac_care_action_plans p ON p.scan_id = s.id
      GROUP BY s.id
      ORDER BY COALESCE(s.completed_at, s.started_at) DESC
      LIMIT ?
    `).all(input.limit ?? 20) as PersistedScanRow[]).map(scanSummaryFromRow);
  } finally {
    sqlite.close();
  }
}

export function getPersistedMacCareScan(scanId: string, env: NodeJS.ProcessEnv = process.env): MacCarePersistedScanDetail | undefined {
  const sqlite = openExistingMacCareSidecarReadonly(env);
  if (!sqlite) return undefined;
  try {
    const scanRow = sqlite.prepare(`
      SELECT
        s.id,
        s.module_id AS moduleId,
        s.status,
        s.started_at AS startedAt,
        s.completed_at AS completedAt,
        s.summary_json AS summaryJson,
        s.metadata_json AS metadataJson,
        COUNT(DISTINCT c.id) AS candidateCount,
        COUNT(DISTINCT p.id) AS actionPlanCount
      FROM mac_care_scans s
      LEFT JOIN mac_care_candidates c ON c.scan_id = s.id
      LEFT JOIN mac_care_action_plans p ON p.scan_id = s.id
      WHERE s.id = ?
      GROUP BY s.id
    `).get(scanId) as PersistedScanRow | undefined;
    if (!scanRow) return undefined;
    const candidates = (sqlite.prepare(`
      SELECT
        id,
        route_id AS routeId,
        path,
        action,
        selection,
        confidence,
        size_bytes AS sizeBytes,
        evidence_json AS evidenceJson,
        warnings_json AS warningsJson,
        metadata_json AS metadataJson
      FROM mac_care_candidates
      WHERE scan_id = ?
      ORDER BY path ASC, id ASC
    `).all(scanId) as PersistedCandidateRow[]).map(candidateFromRow);
    const planRow = sqlite.prepare(`
      SELECT plan_json AS planJson, safety_json AS safetyJson
      FROM mac_care_action_plans
      WHERE scan_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(scanId) as { planJson: string; safetyJson: string } | undefined;
    return {
      scan: scanSummaryFromRow(scanRow),
      candidates,
      actionPlan: planRow ? safeJson(planRow.planJson, null) : null,
      safety: planRow ? safeJson(planRow.safetyJson, null) : null,
    };
  } finally {
    sqlite.close();
  }
}

interface PersistedScanRow {
  id: string;
  moduleId: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  summaryJson: string;
  metadataJson: string;
  candidateCount: number;
  actionPlanCount: number;
}

interface PersistedCandidateRow {
  id: string;
  routeId: string;
  path: string;
  action: string;
  selection: string;
  confidence: number;
  sizeBytes: number | null;
  evidenceJson: string;
  warningsJson: string;
  metadataJson: string;
}

function openExistingMacCareSidecarReadonly(env: NodeJS.ProcessEnv): Database.Database | null {
  const dbPath = path.join(resolveClawjsDataRoot(env), MAC_CARE_SIDECAR_FILENAME);
  if (!fs.existsSync(dbPath)) return null;
  return new BetterSqlite3(dbPath, { readonly: true });
}

function scanSummaryFromRow(row: PersistedScanRow): MacCarePersistedScanSummary {
  return {
    id: row.id,
    moduleId: row.moduleId,
    status: row.status,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    summary: safeJson(row.summaryJson, {}),
    metadata: safeJson(row.metadataJson, {}),
    candidateCount: row.candidateCount,
    actionPlanCount: row.actionPlanCount,
  };
}

function candidateFromRow(row: PersistedCandidateRow): MacCarePersistedCandidate {
  return {
    id: row.id,
    routeId: row.routeId,
    path: row.path,
    action: row.action,
    selection: row.selection,
    confidence: row.confidence,
    sizeBytes: row.sizeBytes,
    evidence: safeJson(row.evidenceJson, []),
    warnings: safeJson(row.warningsJson, []),
    metadata: safeJson(row.metadataJson, {}),
  };
}

function safeJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function moduleById(modules: MacCareScannerModule[], id: MacCareScannerModule["id"]): MacCareScannerModule {
  const module = modules.find((entry) => entry.id === id);
  if (!module) throw new Error(`Missing Mac Care scanner module: ${id}`);
  return module;
}

function normalizeAbsolutePath(value: string): string {
  return path.resolve(value).replace(/\\/g, "/");
}

function stableHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isMissingOrUnreadable(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && ["ENOENT", "ENOTDIR", "EACCES", "EPERM"].includes(String((error as { code?: unknown }).code));
}
