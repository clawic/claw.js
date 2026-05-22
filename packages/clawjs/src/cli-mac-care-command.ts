import {
  MAC_CARE_SIDECAR_FILENAME,
  buildMacCareFinalizerApprovalPackage,
  buildMacCareFinalizerPreview,
  evaluateMacCareActionPlanSafety,
  listMacCareProtectionAdapters,
  listMacCareRoutes,
  macCareActionPlanSchema,
  macCareAppUpdateHandoffReportSchema,
  macCareCloudProviderHandoffReportSchema,
  macCareFinalizerPreviewReportSchema,
  macCareProtectionEngineReadinessReportSchema,
  type MacCareProtectionAdapterId,
} from "@clawjs/core";
import { findClawPersistentSurfaceNode } from "@clawjs/core/catalogs";
import fs from "node:fs";

import { CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { writeCommandJsonError, writeCommandJsonOk } from "./cli-json.ts";
import { buildMacCareAppUpdateApprovalPackage, buildMacCareAppUpdateHandoffReport, buildMacCareCloudProviderApprovalPackage, buildMacCareCloudProviderHandoffReport, buildMacCareFinalizerFixtureScan, buildMacCareProtectionApprovalPackage, buildMacCareProtectionEngineReadiness, getPersistedMacCareScan, listPersistedMacCareScans, persistMacCareScanReport, runMacCareProtectionFixtureScan, runMacCareReadOnlyScanner } from "./cli-mac-care-scanner.ts";

const MAC_CARE_SIDECAR_SURFACE_ID = "claw.database.macCare";

interface MacCareCliInput {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  context: {
    stdout: NodeJS.WritableStream;
    stderr: NodeJS.WritableStream;
  };
  wantsJson: boolean;
  binName: string;
}

export async function runMacCareCli(input: MacCareCliInput): Promise<number> {
  const command = input.positionals[1];
  if (!command || command === "help") return writeMacCareHelp(input);
  if (command !== "report" && command !== "atlas" && command !== "scan" && command !== "scans" && command !== "app-updates" && command !== "protection" && command !== "cloud" && command !== "finalizer") {
    const error = new CliHandledError("unknown_mac_care_command", `Unknown Mac Care command: ${command}`, CLI_EXIT_USAGE);
    if (input.wantsJson) writeCommandJsonError(input.context.stdout, "mac-care", error, { subcommand: command });
    else input.context.stderr.write(`${error.message}\n`);
    return CLI_EXIT_USAGE;
  }

  const routes = listMacCareRoutes();
  if (command === "atlas") {
    writeCommandJsonOk(input.context.stdout, "mac-care", {
      version: 1,
      routes,
      sidecar: macCareSidecarDescriptor(),
      executionPolicy: macCareExecutionPolicy(),
    }, { subcommand: "atlas" });
    return CLI_EXIT_OK;
  }

  if (command === "scans") return writePersistedScans(input);

  if (command === "app-updates") return writeAppUpdateHandoff(input);

  if (command === "protection") return writeProtection(input);

  if (command === "cloud") return writeCloudHandoff(input);

  if (command === "finalizer") return writeFinalizerPreview(input);

  if (command === "scan") {
    const homeDir = input.flags.home || input.flags["fixture-home"];
    if (!homeDir) {
      const error = new CliHandledError("missing_mac_care_home", "Mac Care scan requires --home <path> for this read-only scanner slice.", CLI_EXIT_USAGE);
      if (input.wantsJson) writeCommandJsonError(input.context.stdout, "mac-care", error, { subcommand: "scan" });
      else input.context.stderr.write(`${error.message}\n`);
      return CLI_EXIT_USAGE;
    }
    const report = runMacCareReadOnlyScanner({
      homeDir,
      applicationsDir: input.flags["applications-dir"],
      largeFileBytes: parsePositiveIntegerFlag(input.flags["large-file-bytes"], "large-file-bytes"),
      oldFileDays: parsePositiveIntegerFlag(input.flags["old-file-days"], "old-file-days"),
      maxEntriesPerModule: parsePositiveIntegerFlag(input.flags["max-entries"], "max-entries"),
    });
    const persistence = shouldPersist(input) ? persistMacCareScanReport(report) : {
      persisted: false,
      sidecar: MAC_CARE_SIDECAR_FILENAME,
      scanId: report.scanId,
      scanRows: 0,
      candidateRows: 0,
      actionPlanRows: 0,
    };
    writeCommandJsonOk(input.context.stdout, "mac-care", {
      ...report,
      persistence,
      sidecar: macCareSidecarDescriptor(),
      executionPolicy: macCareExecutionPolicy(),
    }, { subcommand: "scan" });
    return CLI_EXIT_OK;
  }

  const actionPlan = macCareActionPlanSchema.parse({
    id: "mac-care-read-only-foundation-report",
    createdAt: new Date().toISOString(),
    executionAuthority: "agent_plan_only",
    requestedBy: "agent",
    groups: [],
  });
  const safety = evaluateMacCareActionPlanSafety(actionPlan, { actor: "agent" });
  writeCommandJsonOk(input.context.stdout, "mac-care", {
    version: 1,
    status: "read_only_foundation",
    routes,
    groups: [],
    actionPlan,
    safety,
    sidecar: macCareSidecarDescriptor(),
    executionPolicy: macCareExecutionPolicy(),
  }, { subcommand: "report" });
  return CLI_EXIT_OK;
}

function writeMacCareHelp(input: MacCareCliInput): number {
  const text = [
    `Usage: ${input.binName} mac-care report --json`,
    "",
    "Read-only Mac Care foundation report.",
    "Commands:",
    "  mac-care report --json  Print atlas, sidecar, empty report, and safety policy.",
    "  mac-care atlas --json   Print the central Mac route atlas.",
    "  mac-care scan --home <path> --json  Run the first-wave read-only scanner against an explicit home fixture/root.",
    "  mac-care scan --home <path> --persist --json  Store the read-only scan report in the Mac Care sidecar.",
    "  mac-care scans list --json  List persisted read-only Mac Care scans.",
    "  mac-care scans show <scan-id> --json  Show a persisted read-only Mac Care scan.",
    "  mac-care app-updates handoff --home <path> --json  Prepare an inventory-only app update handoff package.",
    "  mac-care app-updates approval-ready --handoff-file <path> --json  Prepare a non-installing update approval package from an app update handoff.",
    "  mac-care cloud handoff --home <path> --json  Prepare an inventory-only cloud provider handoff package.",
    "  mac-care cloud approval-ready --handoff-file <path> --json  Prepare a non-mutating provider approval package from a cloud handoff.",
    "  mac-care finalizer preview --plan-file <path> --json  Prepare a signed-host finalizer preview without executing actions.",
    "  mac-care finalizer approval-ready --preview-file <path> --json  Prepare a non-executing finalizer approval package from a preview.",
    "  mac-care finalizer fixture-scan --fixture-dir <path> [--persist] --json  Create a fixture-only blocked finalizer scan for UI validation.",
    "  mac-care protection adapters --json  List protection adapter contracts.",
    "  mac-care protection engines --json  Report local protection engine readiness without scanning or updating databases.",
    "  mac-care protection approval-ready --readiness-file <path> --json  Prepare a non-executing protection approval package from engine readiness.",
    "  mac-care protection fixture-scan --fixture-dir <path> --json  Run a hermetic fixture-only protection scan.",
  ].join("\n");
  if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "mac-care", { usage: text }, { subcommand: "help" });
  else input.context.stdout.write(`${text}\n`);
  return CLI_EXIT_OK;
}

function macCareSidecarDescriptor(): Record<string, string> {
  const surface = findClawPersistentSurfaceNode(MAC_CARE_SIDECAR_SURFACE_ID);
  if (!surface) throw new Error(`Mac Care sidecar surface is not registered: ${MAC_CARE_SIDECAR_SURFACE_ID}`);
  return {
    filename: MAC_CARE_SIDECAR_FILENAME,
    surfaceId: MAC_CARE_SIDECAR_SURFACE_ID,
    path: surface.path,
  };
}

function macCareExecutionPolicy(): Record<string, boolean | string> {
  return {
    agentCanExecuteDestructiveActions: false,
    testCanExecuteDestructiveActions: false,
    destructiveExecutionAuthority: "signed_host_human_confirmed",
    realFilesystemMutationInFoundationReport: false,
  };
}

function parsePositiveIntegerFlag(value: string | undefined, label: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CliHandledError("invalid_mac_care_flag", `Invalid --${label}: expected a positive integer.`, CLI_EXIT_USAGE);
  }
  return parsed;
}

function writePersistedScans(input: MacCareCliInput): number {
  const subcommand = input.positionals[2] || "list";
  if (subcommand === "list") {
    const limit = parsePositiveIntegerFlag(input.flags.limit, "limit") ?? 20;
    const scans = listPersistedMacCareScans({ limit });
    writeCommandJsonOk(input.context.stdout, "mac-care", {
      version: 1,
      status: "read_only_scan_history",
      scans,
      sidecar: macCareSidecarDescriptor(),
    }, { subcommand: "scans list" });
    return CLI_EXIT_OK;
  }
  if (subcommand === "show") {
    const scanId = input.positionals[3] || input.flags.id;
    if (!scanId) {
      const error = new CliHandledError("missing_mac_care_scan_id", "Mac Care scans show requires a scan id.", CLI_EXIT_USAGE);
      if (input.wantsJson) writeCommandJsonError(input.context.stdout, "mac-care", error, { subcommand: "scans show" });
      else input.context.stderr.write(`${error.message}\n`);
      return CLI_EXIT_USAGE;
    }
    const scan = getPersistedMacCareScan(scanId);
    if (!scan) {
      const error = new CliHandledError("mac_care_scan_not_found", `Mac Care scan not found: ${scanId}`, CLI_EXIT_FAILURE);
      if (input.wantsJson) writeCommandJsonError(input.context.stdout, "mac-care", error, { subcommand: "scans show", scanId });
      else input.context.stderr.write(`${error.message}\n`);
      return CLI_EXIT_FAILURE;
    }
    writeCommandJsonOk(input.context.stdout, "mac-care", {
      version: 1,
      status: "read_only_scan_detail",
      ...scan,
      sidecar: macCareSidecarDescriptor(),
    }, { subcommand: "scans show" });
    return CLI_EXIT_OK;
  }
  const error = new CliHandledError("unknown_mac_care_scans_command", `Unknown Mac Care scans command: ${subcommand}`, CLI_EXIT_USAGE);
  if (input.wantsJson) writeCommandJsonError(input.context.stdout, "mac-care", error, { subcommand });
  else input.context.stderr.write(`${error.message}\n`);
  return CLI_EXIT_USAGE;
}

function writeAppUpdateHandoff(input: MacCareCliInput): number {
  const subcommand = input.positionals[2] || "handoff";
  if (subcommand === "approval-ready") return writeAppUpdateApprovalReady(input);
  if (subcommand !== "handoff") {
    const error = new CliHandledError("unknown_mac_care_app_updates_command", `Unknown Mac Care app-updates command: ${subcommand}`, CLI_EXIT_USAGE);
    if (input.wantsJson) writeCommandJsonError(input.context.stdout, "mac-care", error, { subcommand });
    else input.context.stderr.write(`${error.message}\n`);
    return CLI_EXIT_USAGE;
  }
  const homeDir = input.flags.home || input.flags["fixture-home"];
  if (!homeDir) {
    const error = new CliHandledError("missing_mac_care_home", "Mac Care app update handoff requires --home <path> for inventory-only scanning.", CLI_EXIT_USAGE);
    if (input.wantsJson) writeCommandJsonError(input.context.stdout, "mac-care", error, { subcommand: "app-updates handoff" });
    else input.context.stderr.write(`${error.message}\n`);
    return CLI_EXIT_USAGE;
  }
  const scanReport = runMacCareReadOnlyScanner({
    homeDir,
    applicationsDir: input.flags["applications-dir"],
    maxEntriesPerModule: parsePositiveIntegerFlag(input.flags["max-entries"], "max-entries"),
  });
  const handoff = buildMacCareAppUpdateHandoffReport(scanReport);
  writeCommandJsonOk(input.context.stdout, "mac-care", {
    ...handoff,
    sidecar: macCareSidecarDescriptor(),
    executionPolicy: macCareExecutionPolicy(),
  }, { subcommand: "app-updates handoff" });
  return CLI_EXIT_OK;
}

function writeAppUpdateApprovalReady(input: MacCareCliInput): number {
  const handoffFile = input.flags["handoff-file"];
  if (!handoffFile) {
    const error = new CliHandledError("missing_mac_care_app_update_handoff_file", "Mac Care app update approval-ready requires --handoff-file <path>.", CLI_EXIT_USAGE);
    if (input.wantsJson) writeCommandJsonError(input.context.stdout, "mac-care", error, { subcommand: "app-updates approval-ready" });
    else input.context.stderr.write(`${error.message}\n`);
    return CLI_EXIT_USAGE;
  }
  let handoffPayload: unknown;
  try {
    handoffPayload = JSON.parse(fs.readFileSync(handoffFile, "utf8"));
  } catch (error) {
    const handled = new CliHandledError("invalid_mac_care_app_update_handoff_file", error instanceof Error ? error.message : String(error), CLI_EXIT_USAGE);
    if (input.wantsJson) writeCommandJsonError(input.context.stdout, "mac-care", handled, { subcommand: "app-updates approval-ready", handoffFile });
    else input.context.stderr.write(`${handled.message}\n`);
    return handled.exitCode;
  }
  const parsed = macCareAppUpdateHandoffReportSchema.safeParse(extractCommandDataPayload(handoffPayload));
  if (!parsed.success) {
    const error = new CliHandledError("invalid_mac_care_app_update_handoff", "Mac Care app update approval-ready requires a valid app update handoff report or a JSON command envelope containing one.", CLI_EXIT_USAGE);
    if (input.wantsJson) writeCommandJsonError(input.context.stdout, "mac-care", error, { subcommand: "app-updates approval-ready", handoffFile });
    else input.context.stderr.write(`${error.message}\n`);
    return CLI_EXIT_USAGE;
  }
  const approval = buildMacCareAppUpdateApprovalPackage(parsed.data);
  writeCommandJsonOk(input.context.stdout, "mac-care", {
    ...approval,
    sourceHandoff: parsed.data,
    sidecar: macCareSidecarDescriptor(),
    executionPolicy: macCareExecutionPolicy(),
  }, { subcommand: "app-updates approval-ready" });
  return CLI_EXIT_OK;
}

function writeCloudHandoff(input: MacCareCliInput): number {
  const subcommand = input.positionals[2] || "handoff";
  if (subcommand === "approval-ready") return writeCloudApprovalReady(input);
  if (subcommand !== "handoff") {
    const error = new CliHandledError("unknown_mac_care_cloud_command", `Unknown Mac Care cloud command: ${subcommand}`, CLI_EXIT_USAGE);
    if (input.wantsJson) writeCommandJsonError(input.context.stdout, "mac-care", error, { subcommand });
    else input.context.stderr.write(`${error.message}\n`);
    return CLI_EXIT_USAGE;
  }
  const homeDir = input.flags.home || input.flags["fixture-home"];
  if (!homeDir) {
    const error = new CliHandledError("missing_mac_care_home", "Mac Care cloud handoff requires --home <path> for local sync-root inventory.", CLI_EXIT_USAGE);
    if (input.wantsJson) writeCommandJsonError(input.context.stdout, "mac-care", error, { subcommand: "cloud handoff" });
    else input.context.stderr.write(`${error.message}\n`);
    return CLI_EXIT_USAGE;
  }
  const scanReport = runMacCareReadOnlyScanner({
    homeDir,
    maxEntriesPerModule: parsePositiveIntegerFlag(input.flags["max-entries"], "max-entries"),
  });
  const handoff = buildMacCareCloudProviderHandoffReport(scanReport);
  writeCommandJsonOk(input.context.stdout, "mac-care", {
    ...handoff,
    sidecar: macCareSidecarDescriptor(),
    executionPolicy: macCareExecutionPolicy(),
  }, { subcommand: "cloud handoff" });
  return CLI_EXIT_OK;
}

function writeCloudApprovalReady(input: MacCareCliInput): number {
  const handoffFile = input.flags["handoff-file"];
  if (!handoffFile) {
    const error = new CliHandledError("missing_mac_care_cloud_handoff_file", "Mac Care cloud approval-ready requires --handoff-file <path>.", CLI_EXIT_USAGE);
    if (input.wantsJson) writeCommandJsonError(input.context.stdout, "mac-care", error, { subcommand: "cloud approval-ready" });
    else input.context.stderr.write(`${error.message}\n`);
    return CLI_EXIT_USAGE;
  }
  let handoffPayload: unknown;
  try {
    handoffPayload = JSON.parse(fs.readFileSync(handoffFile, "utf8"));
  } catch (error) {
    const handled = new CliHandledError("invalid_mac_care_cloud_handoff_file", error instanceof Error ? error.message : String(error), CLI_EXIT_USAGE);
    if (input.wantsJson) writeCommandJsonError(input.context.stdout, "mac-care", handled, { subcommand: "cloud approval-ready", handoffFile });
    else input.context.stderr.write(`${handled.message}\n`);
    return handled.exitCode;
  }
  const parsed = macCareCloudProviderHandoffReportSchema.safeParse(extractCommandDataPayload(handoffPayload));
  if (!parsed.success) {
    const error = new CliHandledError("invalid_mac_care_cloud_handoff", "Mac Care cloud approval-ready requires a valid cloud handoff report or a JSON command envelope containing one.", CLI_EXIT_USAGE);
    if (input.wantsJson) writeCommandJsonError(input.context.stdout, "mac-care", error, { subcommand: "cloud approval-ready", handoffFile });
    else input.context.stderr.write(`${error.message}\n`);
    return CLI_EXIT_USAGE;
  }
  const approval = buildMacCareCloudProviderApprovalPackage(parsed.data);
  writeCommandJsonOk(input.context.stdout, "mac-care", {
    ...approval,
    sourceHandoff: parsed.data,
    sidecar: macCareSidecarDescriptor(),
    executionPolicy: macCareExecutionPolicy(),
  }, { subcommand: "cloud approval-ready" });
  return CLI_EXIT_OK;
}

function writeFinalizerPreview(input: MacCareCliInput): number {
  const subcommand = input.positionals[2] || "preview";
  if (subcommand === "fixture-scan") return writeFinalizerFixtureScan(input);
  if (subcommand === "approval-ready") return writeFinalizerApprovalReady(input);
  if (subcommand !== "preview") {
    const error = new CliHandledError("unknown_mac_care_finalizer_command", `Unknown Mac Care finalizer command: ${subcommand}`, CLI_EXIT_USAGE);
    if (input.wantsJson) writeCommandJsonError(input.context.stdout, "mac-care", error, { subcommand });
    else input.context.stderr.write(`${error.message}\n`);
    return CLI_EXIT_USAGE;
  }
  const planFile = input.flags["plan-file"];
  if (!planFile) {
    const error = new CliHandledError("missing_mac_care_plan_file", "Mac Care finalizer preview requires --plan-file <path>.", CLI_EXIT_USAGE);
    if (input.wantsJson) writeCommandJsonError(input.context.stdout, "mac-care", error, { subcommand: "finalizer preview" });
    else input.context.stderr.write(`${error.message}\n`);
    return CLI_EXIT_USAGE;
  }
  let planPayload: unknown;
  try {
    planPayload = JSON.parse(fs.readFileSync(planFile, "utf8"));
  } catch (error) {
    const handled = new CliHandledError("invalid_mac_care_plan_file", error instanceof Error ? error.message : String(error), CLI_EXIT_USAGE);
    if (input.wantsJson) writeCommandJsonError(input.context.stdout, "mac-care", handled, { subcommand: "finalizer preview", planFile });
    else input.context.stderr.write(`${handled.message}\n`);
    return handled.exitCode;
  }
  const extractedPlan = extractActionPlanPayload(planPayload);
  const parsed = macCareActionPlanSchema.safeParse(extractedPlan);
  if (!parsed.success) {
    const error = new CliHandledError("invalid_mac_care_action_plan", "Mac Care finalizer preview requires a valid Mac Care action plan or an object containing actionPlan.", CLI_EXIT_USAGE);
    if (input.wantsJson) writeCommandJsonError(input.context.stdout, "mac-care", error, { subcommand: "finalizer preview", planFile });
    else input.context.stderr.write(`${error.message}\n`);
    return CLI_EXIT_USAGE;
  }
  const preview = buildMacCareFinalizerPreview(parsed.data);
  const safety = evaluateMacCareActionPlanSafety(parsed.data, { actor: "agent" });
  writeCommandJsonOk(input.context.stdout, "mac-care", {
    ...preview,
    sourcePlan: parsed.data,
    safety,
    sidecar: macCareSidecarDescriptor(),
    executionPolicy: macCareExecutionPolicy(),
  }, { subcommand: "finalizer preview" });
  return CLI_EXIT_OK;
}

function writeFinalizerApprovalReady(input: MacCareCliInput): number {
  const previewFile = input.flags["preview-file"];
  if (!previewFile) {
    const error = new CliHandledError("missing_mac_care_finalizer_preview_file", "Mac Care finalizer approval-ready requires --preview-file <path>.", CLI_EXIT_USAGE);
    if (input.wantsJson) writeCommandJsonError(input.context.stdout, "mac-care", error, { subcommand: "finalizer approval-ready" });
    else input.context.stderr.write(`${error.message}\n`);
    return CLI_EXIT_USAGE;
  }
  let previewPayload: unknown;
  try {
    previewPayload = JSON.parse(fs.readFileSync(previewFile, "utf8"));
  } catch (error) {
    const handled = new CliHandledError("invalid_mac_care_finalizer_preview_file", error instanceof Error ? error.message : String(error), CLI_EXIT_USAGE);
    if (input.wantsJson) writeCommandJsonError(input.context.stdout, "mac-care", handled, { subcommand: "finalizer approval-ready", previewFile });
    else input.context.stderr.write(`${handled.message}\n`);
    return handled.exitCode;
  }
  const parsed = macCareFinalizerPreviewReportSchema.safeParse(extractCommandDataPayload(previewPayload));
  if (!parsed.success) {
    const error = new CliHandledError("invalid_mac_care_finalizer_preview", "Mac Care finalizer approval-ready requires a valid finalizer preview report or a JSON command envelope containing one.", CLI_EXIT_USAGE);
    if (input.wantsJson) writeCommandJsonError(input.context.stdout, "mac-care", error, { subcommand: "finalizer approval-ready", previewFile });
    else input.context.stderr.write(`${error.message}\n`);
    return CLI_EXIT_USAGE;
  }
  const approval = buildMacCareFinalizerApprovalPackage(parsed.data);
  writeCommandJsonOk(input.context.stdout, "mac-care", {
    ...approval,
    sourcePreview: parsed.data,
    sidecar: macCareSidecarDescriptor(),
    executionPolicy: macCareExecutionPolicy(),
  }, { subcommand: "finalizer approval-ready" });
  return CLI_EXIT_OK;
}

function writeFinalizerFixtureScan(input: MacCareCliInput): number {
  const fixtureDir = input.flags["fixture-dir"];
  if (!fixtureDir) {
    const error = new CliHandledError("missing_mac_care_fixture_dir", "Mac Care finalizer fixture-scan requires --fixture-dir <path>.", CLI_EXIT_USAGE);
    if (input.wantsJson) writeCommandJsonError(input.context.stdout, "mac-care", error, { subcommand: "finalizer fixture-scan" });
    else input.context.stderr.write(`${error.message}\n`);
    return CLI_EXIT_USAGE;
  }
  if (!fs.existsSync(fixtureDir)) {
    const error = new CliHandledError("missing_mac_care_fixture_dir", `Mac Care finalizer fixture directory does not exist: ${fixtureDir}`, CLI_EXIT_USAGE);
    if (input.wantsJson) writeCommandJsonError(input.context.stdout, "mac-care", error, { subcommand: "finalizer fixture-scan" });
    else input.context.stderr.write(`${error.message}\n`);
    return CLI_EXIT_USAGE;
  }
  const report = buildMacCareFinalizerFixtureScan({ fixtureDir });
  const persistence = shouldPersist(input) ? persistMacCareScanReport(report) : {
    persisted: false,
    sidecar: MAC_CARE_SIDECAR_FILENAME,
    scanId: report.scanId,
    scanRows: 0,
    candidateRows: 0,
    actionPlanRows: 0,
  };
  writeCommandJsonOk(input.context.stdout, "mac-care", {
    ...report,
    persistence,
    sidecar: macCareSidecarDescriptor(),
    executionPolicy: macCareExecutionPolicy(),
  }, { subcommand: "finalizer fixture-scan" });
  return CLI_EXIT_OK;
}

function extractActionPlanPayload(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return record.actionPlan ?? value;
}

function extractCommandDataPayload(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return record.data ?? value;
}

function writeProtection(input: MacCareCliInput): number {
  const subcommand = input.positionals[2] || "adapters";
  if (subcommand === "adapters") {
    writeCommandJsonOk(input.context.stdout, "mac-care", {
      version: 1,
      status: "protection_adapter_contracts",
      adapters: listMacCareProtectionAdapters(),
      executionPolicy: macCareExecutionPolicy(),
    }, { subcommand: "protection adapters" });
    return CLI_EXIT_OK;
  }
  if (subcommand === "engines") {
    writeCommandJsonOk(input.context.stdout, "mac-care", {
      ...buildMacCareProtectionEngineReadiness(),
      adapters: listMacCareProtectionAdapters(),
      sidecar: macCareSidecarDescriptor(),
      executionPolicy: macCareExecutionPolicy(),
    }, { subcommand: "protection engines" });
    return CLI_EXIT_OK;
  }
  if (subcommand === "approval-ready") return writeProtectionApprovalReady(input);
  if (subcommand === "fixture-scan") {
    const fixtureDir = input.flags["fixture-dir"];
    if (!fixtureDir) {
      const error = new CliHandledError("missing_mac_care_fixture_dir", "Mac Care protection fixture-scan requires --fixture-dir <path>.", CLI_EXIT_USAGE);
      if (input.wantsJson) writeCommandJsonError(input.context.stdout, "mac-care", error, { subcommand: "protection fixture-scan" });
      else input.context.stderr.write(`${error.message}\n`);
      return CLI_EXIT_USAGE;
    }
    const adapterId = parseProtectionAdapterId(input.flags.adapter);
    if (adapterId instanceof CliHandledError) {
      if (input.wantsJson) writeCommandJsonError(input.context.stdout, "mac-care", adapterId, { subcommand: "protection fixture-scan" });
      else input.context.stderr.write(`${adapterId.message}\n`);
      return adapterId.exitCode;
    }
    try {
      const report = runMacCareProtectionFixtureScan({
        fixtureDir,
        ...(adapterId ? { adapterId } : {}),
        maxEntries: parsePositiveIntegerFlag(input.flags["max-entries"], "max-entries"),
      });
      writeCommandJsonOk(input.context.stdout, "mac-care", {
        ...report,
        adapters: listMacCareProtectionAdapters(),
        sidecar: macCareSidecarDescriptor(),
        executionPolicy: macCareExecutionPolicy(),
      }, { subcommand: "protection fixture-scan" });
      return CLI_EXIT_OK;
    } catch (error) {
      const handled = new CliHandledError("mac_care_protection_fixture_scan_unavailable", error instanceof Error ? error.message : String(error), CLI_EXIT_USAGE);
      if (input.wantsJson) writeCommandJsonError(input.context.stdout, "mac-care", handled, { subcommand: "protection fixture-scan" });
      else input.context.stderr.write(`${handled.message}\n`);
      return handled.exitCode;
    }
  }
  const error = new CliHandledError("unknown_mac_care_protection_command", `Unknown Mac Care protection command: ${subcommand}`, CLI_EXIT_USAGE);
  if (input.wantsJson) writeCommandJsonError(input.context.stdout, "mac-care", error, { subcommand });
  else input.context.stderr.write(`${error.message}\n`);
  return CLI_EXIT_USAGE;
}

function writeProtectionApprovalReady(input: MacCareCliInput): number {
  const readinessFile = input.flags["readiness-file"];
  if (!readinessFile) {
    const error = new CliHandledError("missing_mac_care_protection_readiness_file", "Mac Care protection approval-ready requires --readiness-file <path>.", CLI_EXIT_USAGE);
    if (input.wantsJson) writeCommandJsonError(input.context.stdout, "mac-care", error, { subcommand: "protection approval-ready" });
    else input.context.stderr.write(`${error.message}\n`);
    return CLI_EXIT_USAGE;
  }
  let readinessPayload: unknown;
  try {
    readinessPayload = JSON.parse(fs.readFileSync(readinessFile, "utf8"));
  } catch (error) {
    const handled = new CliHandledError("invalid_mac_care_protection_readiness_file", error instanceof Error ? error.message : String(error), CLI_EXIT_USAGE);
    if (input.wantsJson) writeCommandJsonError(input.context.stdout, "mac-care", handled, { subcommand: "protection approval-ready", readinessFile });
    else input.context.stderr.write(`${handled.message}\n`);
    return handled.exitCode;
  }
  const parsed = macCareProtectionEngineReadinessReportSchema.safeParse(extractCommandDataPayload(readinessPayload));
  if (!parsed.success) {
    const error = new CliHandledError("invalid_mac_care_protection_readiness", "Mac Care protection approval-ready requires a valid protection engine readiness report or a JSON command envelope containing one.", CLI_EXIT_USAGE);
    if (input.wantsJson) writeCommandJsonError(input.context.stdout, "mac-care", error, { subcommand: "protection approval-ready", readinessFile });
    else input.context.stderr.write(`${error.message}\n`);
    return CLI_EXIT_USAGE;
  }
  const approval = buildMacCareProtectionApprovalPackage(parsed.data);
  writeCommandJsonOk(input.context.stdout, "mac-care", {
    ...approval,
    sourceReadiness: parsed.data,
    adapters: listMacCareProtectionAdapters(),
    sidecar: macCareSidecarDescriptor(),
    executionPolicy: macCareExecutionPolicy(),
  }, { subcommand: "protection approval-ready" });
  return CLI_EXIT_OK;
}

function parseProtectionAdapterId(value: string | undefined): MacCareProtectionAdapterId | undefined | CliHandledError {
  if (!value) return undefined;
  const adapter = listMacCareProtectionAdapters().find((entry) => entry.id === value);
  if (adapter) return adapter.id as MacCareProtectionAdapterId;
  return new CliHandledError("invalid_mac_care_protection_adapter", `Unknown Mac Care protection adapter: ${value}`, CLI_EXIT_USAGE);
}

function shouldPersist(input: MacCareCliInput): boolean {
  if (input.argv.includes("--persist")) return true;
  return input.flags.persist === "true";
}
