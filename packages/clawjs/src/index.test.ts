import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { createClaw, saveAuthStore } from "@clawjs/claw";
import { buildTimeApp } from "../../../time/src/server/app.ts";
import { CLI_EXIT_DEGRADED, CLI_EXIT_OK, CLI_EXIT_USAGE, CLI_USAGE, runCli } from "./index.ts";
import {
  ONE_PIXEL_PNG,
  captureStream,
  createFakeGenerationScript,
  createFakeOpenAIImageCliServer,
  createFakeOpenClawImageSkillEnv,
  createFakeOpenClawToolchain,
  createFakeSecretsCliServer,
  parseCliJsonPayload,
  runCliCapture,
  useIsolatedClawDataRoot,
  withPatchedEnv,
} from "./index-test-utils.ts";

const OPENAI_API_PREFIX = "/v" + "1";
test("runCli prints usage for unsupported commands", async () => {
  const stdout = captureStream();
  const stderr = captureStream();
  const exitCode = await runCli(["unknown"], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, CLI_EXIT_USAGE);
  assert.match(stderr.getOutput(), /Usage/);
});

test("runCli prints help and exits successfully", async () => {
  const stdout = captureStream();
  const exitCode = await runCli(["--help"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, CLI_EXIT_OK);
  assert.equal(stdout.getOutput().trim(), CLI_USAGE);
  assert.match(stdout.getOutput(), /Primary commands and portals:/);
  assert.match(stdout.getOutput(), /host\s+canonical/);
  assert.match(stdout.getOutput(), /db\s+alias/);
  assert.doesNotMatch(stdout.getOutput(), /data doctor\|backup\|restore\|reset/);
});

test("runCli rejects removed public pre-v1 namespaces before V1 routing", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-prev1-negative-"));
  for (const args of [
    ["data", "doctor"],
    ["app-state", "snapshot"],
    ["ops", "list"],
    ["infra", "list"],
    ["runtime", "queue"],
    ["content", "upsert"],
    ["business", "upsert"],
    ["social", "list"],
    ["monitor", "event"],
    ["workspace-search", "query", "x"],
    ["workspace-index", "rebuild"],
    ["export", "snapshot.json"],
    ["import", "snapshot.json"],
    ["backup", "backups"],
  ]) {
    const stderr = captureStream();
    assert.equal(await runCli(args, {
      stdout: captureStream().stream,
      stderr: stderr.stream,
      cwd,
    }), CLI_EXIT_USAGE, args.join(" "));
    assert.match(stderr.getOutput(), /not part of the public Claw CLI surface|Usage:/);
  }
});

test("runCli exposes Search source registry, profiles, status and explain admin commands", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-search-cli-"));

  const sourcesStdout = captureStream();
  assert.equal(await runCli(["search", "sources", "--json"], {
    stdout: sourcesStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const sources = parseCliJsonPayload<{ sources: Array<{ id: string; domain: string; fastPath: boolean }> }>(sourcesStdout.getOutput());
  assert.equal(sources.sources.some((source) => source.id === "sessions.chats" && source.fastPath), true);
  assert.equal(sources.sources.some((source) => source.id === "commands"), true);

  const profilesStdout = captureStream();
  assert.equal(await runCli(["search", "profiles", "--json"], {
    stdout: profilesStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const profiles = parseCliJsonPayload<{ profiles: Array<{ id: string; defaultEnabled: boolean }> }>(profilesStdout.getOutput());
  assert.deepEqual(profiles.profiles.map((profile) => profile.id), ["framework", "full"]);
  assert.equal(profiles.profiles.find((profile) => profile.id === "framework")?.defaultEnabled, true);

  const statusStdout = captureStream();
  assert.equal(await runCli(["search", "status", "--json"], {
    stdout: statusStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const status = parseCliJsonPayload<{ storage: { canonical: string; index: string }; budgets: { hotMs: number; globalFirstBatchMs: number } }>(statusStdout.getOutput());
  assert.deepEqual(status.storage, { canonical: "core.sqlite", index: "search.sqlite", indexRebuildable: true });
  assert.equal(status.budgets.hotMs, 50);
  assert.equal(status.budgets.globalFirstBatchMs, 200);

  const explainStdout = captureStream();
  assert.equal(await runCli(["search", "explain", "alpha", "--json"], {
    stdout: explainStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const explain = parseCliJsonPayload<{ query: string; partialResults: string }>(explainStdout.getOutput());
  assert.equal(explain.query, "alpha");
  assert.match(explain.partialResults, /omitted/);
});

test("runCli prints db-specific help and database admin help", async () => {
  const dbStdout = captureStream();
  assert.equal(await runCli(["db", "--help"], {
    stdout: dbStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  assert.match(dbStdout.getOutput(), /Usage: claw db <collection>/);
  assert.match(dbStdout.getOutput(), /alias: Exact alias/);

  const adminStdout = captureStream();
  assert.equal(await runCli(["database", "--help"], {
    stdout: adminStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  assert.match(adminStdout.getOutput(), /Usage: claw database serve\|login/);
  assert.match(adminStdout.getOutput(), /canonical: Local database admin surface/);
});

test("runCli keeps public help short and gates the advanced surface behind --all", async () => {
  const help = await runCliCapture(["--help"], process.cwd());
  assert.equal(help.code, CLI_EXIT_OK);
  assert.match(help.stdout, /Usage: claw <command> \[options\]/);
  assert.match(help.stdout, /Run `claw --help --all` for advanced commands\./);
  assert.doesNotMatch(help.stdout, /^\s+context\s+canonical/m);
  assert.doesNotMatch(help.stdout, /^\s+compat\s+canonical/m);

  const allHelp = await runCliCapture(["--help", "--all"], process.cwd());
  assert.equal(allHelp.code, CLI_EXIT_OK);
  assert.match(allHelp.stdout, /Advanced commands:/);
  assert.match(allHelp.stdout, /^\s+context\s+canonical/m);
  assert.match(allHelp.stdout, /^\s+compat\s+canonical/m);

  const hostHelp = await runCliCapture(["host", "--help"], process.cwd());
  assert.equal(hostHelp.code, CLI_EXIT_OK);
  assert.match(hostHelp.stdout, /Usage: claw host/);
  assert.match(hostHelp.stdout, /services/);
  assert.match(hostHelp.stdout, /capabilities/);
  assert.match(hostHelp.stdout, /Support: host_required/);
  assert.match(hostHelp.stdout, /Security: signed_host_broker/);

  const systemCapabilitiesHelp = await runCliCapture(["system", "capabilities", "--help"], process.cwd());
  assert.equal(systemCapabilitiesHelp.code, CLI_EXIT_OK);
  assert.match(systemCapabilitiesHelp.stdout, /capabilities/);

  const systemHelp = await runCliCapture(["system", "--help"], process.cwd());
  assert.equal(systemHelp.code, CLI_EXIT_OK);
  assert.match(systemHelp.stdout, /Usage: claw system snapshot/);
});

test("runCli exposes the evolution operator surface", async () => {
  const help = await runCliCapture(["evolution", "--help"], process.cwd());
  assert.equal(help.code, CLI_EXIT_OK);
  assert.match(help.stdout, /Usage: claw evolution list\|show\|diff/);
  assert.match(help.stdout, /Compatibility evolution ledger/);

  const verify = await runCliCapture(["evolution", "verify", "--json"], process.cwd());
  assert.equal(verify.code, CLI_EXIT_OK);
  const payload = parseCliJsonPayload<{
    status: string;
    policy: { sourceOfTruth: string; postV1Migration: string; rescueCore: string };
    surfaceBaseline: { status: string; changed: number; uncovered: number };
    migrationLab: { status: string; fixtureCount: number; versionChain: Array<{ fromVersion: string; toVersion: string; status: string }>; checks: Array<{ id: string; status: string }> };
    checks: string[];
  }>(verify.stdout);
  assert.equal(payload.status, "ok");
  assert.equal(payload.policy.sourceOfTruth, "clawjs");
  assert.equal(payload.policy.postV1Migration, "step_by_step_all_public_versions");
  assert.equal(payload.policy.rescueCore, "launch_chat_repair");
  assert.equal(payload.surfaceBaseline.status, "unchanged");
  assert.equal(payload.surfaceBaseline.uncovered, 0);
  assert.equal(payload.migrationLab.status, "pass");
  assert.equal(payload.migrationLab.fixtureCount >= 1, true);
  assert.equal(payload.migrationLab.versionChain.some((entry) => entry.fromVersion === "foundation" && entry.toVersion === "v1" && entry.status === "pass"), true);
  assert.equal(payload.migrationLab.checks.some((check) => check.id === "required_surface_kinds" && check.status === "pass"), true);
  assert.equal(payload.migrationLab.checks.some((check) => check.id === "version_chain_complete" && check.status === "pass"), true);
  assert.equal(payload.checks.includes("rescue_core_declared"), true);
  assert.equal(payload.checks.includes("public_surface_baseline_covered"), true);
  assert.equal(payload.checks.includes("migration_lab_foundation_fixture_passed"), true);

  const diff = await runCliCapture(["evolution", "diff", "--json"], process.cwd());
  assert.equal(diff.code, CLI_EXIT_OK);
  const diffPayload = parseCliJsonPayload<{ status: string; requiredRecord: boolean; summary: { changed: number; uncovered: number } }>(diff.stdout);
  assert.equal(diffPayload.status, "unchanged");
  assert.equal(diffPayload.requiredRecord, false);
  assert.deepEqual(diffPayload.summary, { changed: 0, uncovered: 0 });

  const repair = await runCliCapture(["evolution", "repair", "--json"], process.cwd());
  assert.equal(repair.code, CLI_EXIT_OK);
  const repairPayload = parseCliJsonPayload<{
    status: string;
    requiresApproval: boolean;
    mutates: boolean;
    rescueCore: string;
    steps: Array<{ id: string; status: string }>;
    backupPolicies: Array<{ strategy: string; requiresApproval: boolean }>;
    migrationLab: { status: string; fixtureIds: string[] };
    repairReport: {
      status: string;
      patch: { format: string; status: string; redacted: boolean; diff: string };
      safeActions: Array<{ id: string; command?: string }>;
      approvalRequiredActions: Array<{ id: string }>;
      receipt: { redaction: { promptsIncluded: boolean; secretsIncluded: boolean; fullLocalPathsIncluded: boolean } };
      redaction: { externalSubmission: string };
    };
  }>(repair.stdout);
  assert.equal(repairPayload.status, "approval_gated_plan");
  assert.equal(repairPayload.requiresApproval, true);
  assert.equal(repairPayload.mutates, true);
  assert.equal(repairPayload.rescueCore, "launch_chat_repair");
  assert.equal(repairPayload.steps.some((step) => step.id === "preserve_launch_chat_repair"), true);
  assert.equal(repairPayload.steps.find((step) => step.id === "prepare_best_effort_backup")?.status, "approval_gated");
  assert.equal(repairPayload.backupPolicies.every((policy) => policy.requiresApproval), true);
  assert.equal(repairPayload.migrationLab.status, "pass");
  assert.equal(repairPayload.migrationLab.fixtureIds.includes("evo_fixture_v1_foundation"), true);
  assert.equal(repairPayload.repairReport.status, "needs_approval");
  assert.equal(repairPayload.repairReport.patch.format, "unified_diff");
  assert.equal(repairPayload.repairReport.patch.redacted, true);
  assert.match(repairPayload.repairReport.patch.diff, /Evolution Repair Report/);
  assert.equal(repairPayload.repairReport.safeActions.some((action) => action.command === "claw evolution doctor --json"), true);
  assert.equal(repairPayload.repairReport.approvalRequiredActions.some((action) => action.id === "mutate_local_state"), true);
  assert.equal(repairPayload.repairReport.receipt.redaction.promptsIncluded, false);
  assert.equal(repairPayload.repairReport.receipt.redaction.secretsIncluded, false);
  assert.equal(repairPayload.repairReport.receipt.redaction.fullLocalPathsIncluded, false);
  assert.equal(repairPayload.repairReport.redaction.externalSubmission, "explicit_approval_only");

  const report = await runCliCapture(["evolution", "report", "--json"], process.cwd());
  assert.equal(report.code, CLI_EXIT_OK);
  const reportPayload = parseCliJsonPayload<{
    repairReport: {
      status: string;
      approvalRequiredActions: Array<{ id: string }>;
      redaction: { externalSubmission: string };
    };
  }>(report.stdout);
  assert.equal(reportPayload.repairReport.status, "needs_approval");
  assert.equal(reportPayload.repairReport.approvalRequiredActions.some((action) => action.id === "submit_external_report"), true);
  assert.equal(reportPayload.repairReport.redaction.externalSubmission, "explicit_approval_only");

  const dryRun = await runCliCapture(["evolution", "dry-run", "--json"], process.cwd());
  assert.equal(dryRun.code, CLI_EXIT_OK);
  const dryRunPayload = parseCliJsonPayload<{ status: string; mutates: boolean; requiresApproval: boolean; migrationLab: { status: string } }>(dryRun.stdout);
  assert.equal(dryRunPayload.status, "dry_run_ready");
  assert.equal(dryRunPayload.mutates, false);
  assert.equal(dryRunPayload.requiresApproval, false);
  assert.equal(dryRunPayload.migrationLab.status, "pass");

  const rollback = await runCliCapture(["evolution", "rollback", "--json"], process.cwd());
  assert.equal(rollback.code, CLI_EXIT_OK);
  const rollbackPayload = parseCliJsonPayload<{
    status: string;
    requiresApproval: boolean;
    rollbackReport: {
      status: string;
      restorePoint: {
        reversibility: string;
        universalRollbackPromised: boolean;
        retentionDays: number;
        maxBytesBeforeOverride: number;
        maxFilesBeforeOverride: number;
      };
      forwardRepair: { required: boolean; command: string };
      approvalRequiredActions: Array<{ id: string }>;
      redaction: { promptsIncluded: boolean; secretsIncluded: boolean; fullLocalPathsIncluded: boolean };
    };
  }>(rollback.stdout);
  assert.equal(rollbackPayload.status, "approval_gated_plan");
  assert.equal(rollbackPayload.requiresApproval, true);
  assert.equal(rollbackPayload.rollbackReport.status, "needs_approval");
  assert.equal(rollbackPayload.rollbackReport.restorePoint.reversibility, "best_effort_forward_repair");
  assert.equal(rollbackPayload.rollbackReport.restorePoint.universalRollbackPromised, false);
  assert.equal(rollbackPayload.rollbackReport.restorePoint.retentionDays, 30);
  assert.equal(rollbackPayload.rollbackReport.restorePoint.maxBytesBeforeOverride, 1_073_741_824);
  assert.equal(rollbackPayload.rollbackReport.restorePoint.maxFilesBeforeOverride, 10_000);
  assert.equal(rollbackPayload.rollbackReport.forwardRepair.required, true);
  assert.equal(rollbackPayload.rollbackReport.forwardRepair.command, "claw evolution repair --json");
  assert.equal(rollbackPayload.rollbackReport.approvalRequiredActions.some((action) => action.id === "create_restore_point"), true);
  assert.equal(rollbackPayload.rollbackReport.approvalRequiredActions.some((action) => action.id === "forward_repair_after_rollback"), true);
  assert.equal(rollbackPayload.rollbackReport.redaction.promptsIncluded, false);
  assert.equal(rollbackPayload.rollbackReport.redaction.secretsIncluded, false);
  assert.equal(rollbackPayload.rollbackReport.redaction.fullLocalPathsIncluded, false);

  const backup = await runCliCapture(["evolution", "backup", "--json"], process.cwd());
  assert.equal(backup.code, CLI_EXIT_OK);
  const backupPayload = parseCliJsonPayload<{
    rollbackReport: {
      restorePoint: {
        reversibility: string;
        universalRollbackPromised: boolean;
        retentionDays: number;
      };
      approvalRequiredActions: Array<{ id: string }>;
    };
  }>(backup.stdout);
  assert.equal(backupPayload.rollbackReport.restorePoint.reversibility, "best_effort_forward_repair");
  assert.equal(backupPayload.rollbackReport.restorePoint.universalRollbackPromised, false);
  assert.equal(backupPayload.rollbackReport.restorePoint.retentionDays, 30);
  assert.equal(backupPayload.rollbackReport.approvalRequiredActions.some((action) => action.id === "create_restore_point"), true);

  const receipt = await runCliCapture(["evolution", "receipt", "--json"], process.cwd());
  assert.equal(receipt.code, CLI_EXIT_OK);
  const receiptPayload = parseCliJsonPayload<{ migrationLab: { status: string }; receipt: { redaction: { externalSubmission: string }; notes: string[] } }>(receipt.stdout);
  assert.equal(receiptPayload.migrationLab.status, "pass");
  assert.equal(receiptPayload.receipt.redaction.externalSubmission, "explicit_approval_only");
  assert.equal(receiptPayload.receipt.notes.some((note) => note.includes("/Users/") || note.includes("prompt:")), false);
});

test("runCli exposes system telemetry snapshot, metrics, history, rules, widgets, providers and controls", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-system-telemetry-cli-"));
  const monitorDb = path.join(workspaceRoot, "monitor.sqlite");
  const snapshot = await runCliCapture(["system", "snapshot", "--json"], process.cwd());
  assert.equal(snapshot.code, CLI_EXIT_OK);
  const snapshotPayload = parseCliJsonPayload<{
    policy: { defaultAgentAccess: string; controlsRequireSignedHostBroker: boolean };
    samples: Array<{ key: string; availability: string }>;
    unavailableMetrics: string[];
  }>(snapshot.stdout);
  assert.equal(snapshotPayload.policy.defaultAgentAccess, "safe_read");
  assert.equal(snapshotPayload.policy.controlsRequireSignedHostBroker, true);
  assert.equal(snapshotPayload.samples.some((entry) => entry.key === "system.memory.used" && entry.availability === "available"), true);
  assert.equal(snapshotPayload.samples.some((entry) => entry.key === "system.cpu.load5" && entry.availability === "available"), true);
  assert.equal(snapshotPayload.samples.some((entry) => entry.key === "system.memory.free" && entry.availability === "available"), true);
  assert.equal(snapshotPayload.samples.some((entry) => entry.key === "system.memory.pressure" && entry.availability === "available"), true);
  assert.equal(snapshotPayload.unavailableMetrics.includes("system.cpu.load5"), false);
  assert.equal(snapshotPayload.unavailableMetrics.includes("system.memory.free"), false);
  assert.equal(snapshotPayload.unavailableMetrics.includes("system.sensor.temperature"), true);

  const metrics = await runCliCapture(["system", "metrics", "list", "--json"], process.cwd());
  assert.equal(metrics.code, CLI_EXIT_OK);
  const metricsPayload = parseCliJsonPayload<{ metrics: Array<{ key: string; family: string; privacyTier: string }> }>(metrics.stdout);
  assert.equal(metricsPayload.metrics.some((metric) => metric.key === "system.sensor.fan_speed" && metric.family === "sensor"), true);
  assert.equal(metricsPayload.metrics.some((metric) => metric.family === "weather_context"), true);

  const history = await runCliCapture(["system", "history", "system.cpu.load1", "--range", "1h", "--monitor-db", monitorDb, "--json"], process.cwd());
  assert.equal(history.code, CLI_EXIT_OK);
  const historyPayload = parseCliJsonPayload<{ retention: { store: string; dbPath: string; status: string; rawPolicy: string; rollups: boolean }; samples: unknown[]; chart: { kind: string; source: string; empty: boolean; points: unknown[] } }>(history.stdout);
  assert.equal(historyPayload.retention.store, "monitor.sqlite");
  assert.equal(historyPayload.retention.dbPath, monitorDb);
  assert.equal(historyPayload.retention.status, "empty");
  assert.equal(historyPayload.retention.rawPolicy, "short_local");
  assert.equal(historyPayload.retention.rollups, true);
  assert.deepEqual(historyPayload.samples, []);
  assert.deepEqual(historyPayload.chart, { kind: "line", source: "empty", empty: true, points: [], metricKey: "system.cpu.load1", unit: "count" });
  assert.equal(fs.existsSync(monitorDb), false);

  const rules = await runCliCapture(["system", "rules", "list", "--json"], process.cwd());
  assert.equal(rules.code, CLI_EXIT_OK);
  assert.equal(parseCliJsonPayload<{ rules: unknown[] }>(rules.stdout).rules.length > 0, true);

  const widgets = await runCliCapture(["system", "widgets", "list", "--json"], process.cwd());
  assert.equal(widgets.code, CLI_EXIT_OK);
  const widgetPayload = parseCliJsonPayload<{ widgets: Array<{ placement: string }> }>(widgets.stdout);
  assert.equal(widgetPayload.widgets.some((widget) => widget.placement === "menubar"), true);
  assert.equal(widgetPayload.widgets.some((widget) => widget.placement === "combined_panel" || widget.placement === "both"), true);

  const providers = await runCliCapture(["system", "providers", "list", "--json"], process.cwd());
  assert.equal(providers.code, CLI_EXIT_OK);
  const providerPayload = parseCliJsonPayload<{ providers: Array<{ id: string; kind: string; mode: string; status: string; metrics?: string[]; adapterContract?: { input: { credentialRef: string; networkAccess: string }; output: { metrics?: string[]; monitorWriteRequired: boolean }; audit: { receiptRequired: boolean }; executionPolicy: { failClosed: boolean } } }> }>(providers.stdout);
  assert.equal(providerPayload.providers.some((provider) => provider.kind === "weather" && provider.mode === "mock" && provider.status === "ready"), true);
  assert.equal(providerPayload.providers.some((provider) => provider.kind === "weather" && provider.mode === "live" && provider.status === "external_pending"), true);
  assert.equal(providerPayload.providers.some((provider) => provider.kind === "hardware_sensor" && provider.id === "system.sensors.signed" && provider.status === "external_pending"), true);
  assert.equal(providerPayload.providers.some((provider) => provider.kind === "agent_run" && provider.id === "context.agent-runs.offline" && provider.metrics?.includes("context.agent_runs.active")), true);
  const liveWeatherProvider = providerPayload.providers.find((provider) => provider.id === "context.weather.live");
  assert.equal(liveWeatherProvider?.adapterContract?.input.credentialRef, "required_redacted");
  assert.equal(liveWeatherProvider?.adapterContract?.input.networkAccess, "blocked_until_granted");
  assert.equal(liveWeatherProvider?.adapterContract?.output.metrics?.includes("context.weather.temperature"), true);
  assert.equal(liveWeatherProvider?.adapterContract?.output.monitorWriteRequired, true);
  assert.equal(liveWeatherProvider?.adapterContract?.audit.receiptRequired, true);
  assert.equal(liveWeatherProvider?.adapterContract?.executionPolicy.failClosed, true);

  const providerPlan = await runCliCapture(["system", "providers", "plan", "context.weather.live", "--reason", "test-plan", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(providerPlan.code, CLI_EXIT_OK);
  const providerPlanPayload = parseCliJsonPayload<{
    status: string;
    willConnect: boolean;
    provider: { id: string; mode: string; metrics?: string[]; metricKeys?: unknown; adapterContract?: { providerId: string; input: { credentialRef: string }; output: { metrics?: string[]; monitorWriteRequired: boolean }; audit: { durableReceiptSource: string } } };
    broker: { status: string; failClosed: boolean };
    policy: { requiredGrants: string[]; credentialRefRequired: boolean; networkAccess: string };
    steps: Array<{ id: string; status: string; owner: string }>;
    receipt: { status: string; auditEvent: string; auditStatus: string; auditId: string };
    auditPlan: { status: string; durable: boolean; outcome: string; receiptStatus: string; redaction: { credentialRefRedacted: boolean; preciseLocationRedacted: boolean } };
    audit: { status: string; storageRef: string; auditPath?: string; outcome: string; durable: boolean };
    externalPending: boolean;
  }>(providerPlan.stdout);
  assert.equal(providerPlanPayload.status, "planned");
  assert.equal(providerPlanPayload.willConnect, false);
  assert.equal(providerPlanPayload.provider.id, "context.weather.live");
  assert.equal(providerPlanPayload.provider.mode, "live");
  assert.equal(providerPlanPayload.provider.metrics?.includes("context.weather.temperature"), true);
  assert.equal(Array.isArray(providerPlanPayload.provider.metricKeys), false);
  assert.equal(providerPlanPayload.provider.adapterContract?.providerId, "context.weather.live");
  assert.equal(providerPlanPayload.provider.adapterContract?.input.credentialRef, "required_redacted");
  assert.equal(providerPlanPayload.provider.adapterContract?.output.metrics?.includes("context.weather.temperature"), true);
  assert.equal(providerPlanPayload.provider.adapterContract?.output.monitorWriteRequired, true);
  assert.equal(providerPlanPayload.provider.adapterContract?.audit.durableReceiptSource, "provider_broker_or_signed_host");
  assert.equal(providerPlanPayload.broker.status, "external_pending");
  assert.equal(providerPlanPayload.broker.failClosed, true);
  assert.equal(providerPlanPayload.policy.requiredGrants.includes("weather.location.read"), true);
  assert.equal(providerPlanPayload.policy.credentialRefRequired, true);
  assert.equal(providerPlanPayload.policy.networkAccess, "blocked_until_granted");
  assert.equal(providerPlanPayload.steps.some((step) => step.id === "resolve_credential_ref" && step.status === "blocked" && step.owner === "provider_broker"), true);
  assert.equal(providerPlanPayload.steps.some((step) => step.id === "connect_provider" && step.status === "blocked" && step.owner === "provider_broker"), true);
  assert.equal(providerPlanPayload.receipt.status, "not_issued");
  assert.equal(providerPlanPayload.receipt.auditEvent, "system.telemetry.provider.weather.live");
  assert.equal(providerPlanPayload.auditPlan.status, "planned");
  assert.equal(providerPlanPayload.auditPlan.durable, false);
  assert.equal(providerPlanPayload.auditPlan.outcome, "blocked");
  assert.equal(providerPlanPayload.auditPlan.receiptStatus, "not_issued");
  assert.equal(providerPlanPayload.auditPlan.redaction.credentialRefRedacted, true);
  assert.equal(providerPlanPayload.auditPlan.redaction.preciseLocationRedacted, true);
  assert.equal(providerPlanPayload.receipt.auditStatus, "recorded");
  assert.equal(providerPlanPayload.audit.status, "recorded");
  assert.equal(providerPlanPayload.audit.outcome, "blocked");
  assert.equal(providerPlanPayload.audit.durable, true);
  assert.equal(providerPlanPayload.audit.storageRef, "claw.workspace.data/system-telemetry-audit.jsonl");
  assert.equal(providerPlanPayload.audit.auditPath, undefined);
  const providerPlanAuditPath = path.join(workspaceRoot, ".claw", "data", "system-telemetry-audit.jsonl");
  const providerPlanAudit = fs.readFileSync(providerPlanAuditPath, "utf8");
  assert.equal(providerPlanAudit.includes("\"providerId\":\"context.weather.live\""), true);
  assert.equal(providerPlanAudit.includes("\"credentialRefRedacted\":false"), true);
  assert.equal(providerPlanAudit.includes("\"outcome\":\"blocked\""), true);
  assert.equal(providerPlanPayload.externalPending, true);

  const providerPlanWithCredential = await runCliCapture([
    "system", "providers", "plan", "context.weather.live",
    "--credential-ref", "secret://weather/local",
    "--reason", "credential-test",
    "--workspace", workspaceRoot,
    "--json",
  ], process.cwd());
  assert.equal(providerPlanWithCredential.code, CLI_EXIT_OK);
  const providerPlanWithCredentialPayload = parseCliJsonPayload<{
    request: { credentialRef: string | null; reason: string };
    steps: Array<{ id: string; status: string }>;
    audit: { storageRef: string; auditPath?: string };
  }>(providerPlanWithCredential.stdout);
  assert.equal(providerPlanWithCredentialPayload.request.credentialRef, "provided_redacted");
  assert.equal(providerPlanWithCredentialPayload.request.reason, "credential-test");
  assert.equal(providerPlanWithCredentialPayload.steps.some((step) => step.id === "resolve_credential_ref" && step.status === "pending"), true);
  assert.equal(providerPlanWithCredential.stdout.includes("secret://weather/local"), false);
  assert.equal(providerPlanWithCredentialPayload.audit.storageRef, "claw.workspace.data/system-telemetry-audit.jsonl");
  assert.equal(providerPlanWithCredentialPayload.audit.auditPath, undefined);
  const providerPlanWithCredentialAudit = fs.readFileSync(providerPlanAuditPath, "utf8");
  assert.equal(providerPlanWithCredentialAudit.includes("\"credentialRefRedacted\":true"), true);
  assert.equal(providerPlanWithCredentialAudit.includes("secret://weather/local"), false);

  const sensorProviderPlan = await runCliCapture(["system", "providers", "plan", "system.sensors.signed", "--reason", "sensor-validation", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(sensorProviderPlan.code, CLI_EXIT_OK);
  const sensorProviderPlanPayload = parseCliJsonPayload<{
    willConnect: boolean;
    provider: { id: string; kind: string; metrics?: string[]; metricKeys?: unknown };
    policy: { requiredGrants: string[]; credentialRefRequired: boolean };
    steps: Array<{ id: string; status: string }>;
    receipt: { auditEvent: string; auditStatus: string };
    auditPlan: { event: string; receiptStatus: string };
    audit: { status: string; storageRef: string; auditPath?: string };
  }>(sensorProviderPlan.stdout);
  assert.equal(sensorProviderPlanPayload.willConnect, false);
  assert.equal(sensorProviderPlanPayload.provider.id, "system.sensors.signed");
  assert.equal(sensorProviderPlanPayload.provider.kind, "hardware_sensor");
  assert.equal(sensorProviderPlanPayload.provider.metrics?.includes("system.sensor.temperature"), true);
  assert.equal(sensorProviderPlanPayload.provider.metrics?.includes("system.sensor.fan_speed"), true);
  assert.equal(Array.isArray(sensorProviderPlanPayload.provider.metricKeys), false);
  assert.equal(sensorProviderPlanPayload.policy.requiredGrants.includes("system.sensor.read"), true);
  assert.equal(sensorProviderPlanPayload.policy.credentialRefRequired, false);
  assert.equal(sensorProviderPlanPayload.steps.some((step) => step.id === "resolve_credential_ref" && step.status === "skipped"), true);
  assert.equal(sensorProviderPlanPayload.steps.some((step) => step.id === "connect_provider" && step.status === "blocked"), true);
  assert.equal(sensorProviderPlanPayload.receipt.auditEvent, "system.telemetry.provider.hardware_sensor.live");
  assert.equal(sensorProviderPlanPayload.auditPlan.event, "system.telemetry.provider.hardware_sensor.live");
  assert.equal(sensorProviderPlanPayload.auditPlan.receiptStatus, "not_issued");
  assert.equal(sensorProviderPlanPayload.receipt.auditStatus, "recorded");
  assert.equal(sensorProviderPlanPayload.audit.status, "recorded");
  assert.equal(sensorProviderPlanPayload.audit.storageRef, "claw.workspace.data/system-telemetry-audit.jsonl");
  assert.equal(sensorProviderPlanPayload.audit.auditPath, undefined);
  const sensorProviderPlanAudit = fs.readFileSync(providerPlanAuditPath, "utf8");
  assert.equal(sensorProviderPlanAudit.includes("\"providerId\":\"system.sensors.signed\""), true);
  assert.equal(sensorProviderPlanAudit.includes("system.sensor.read"), true);

  const controls = await runCliCapture(["system", "controls", "list", "--json"], process.cwd());
  assert.equal(controls.code, CLI_EXIT_OK);
  const controlsPayload = parseCliJsonPayload<{ controls: Array<{ id: string; family: string; requiresSignedHostBroker: boolean; requiredGrants: string[] }>; mutatesHardware: boolean }>(controls.stdout);
  assert.equal(controlsPayload.mutatesHardware, false);
  assert.equal(controlsPayload.controls.some((control) => control.id === "system.fan.set_speed" && control.requiresSignedHostBroker), true);
  assert.equal(controlsPayload.controls.some((control) => control.family === "audio" && control.requiredGrants.includes("system.audio.control")), true);

  const watch = await runCliCapture(["system", "watch", "--interval", "1", "--count", "2", "--jsonl"], process.cwd());
  assert.equal(watch.code, CLI_EXIT_OK);
  const watchLines = watch.stdout.trim().split("\n").map((line) => JSON.parse(line) as { ok: boolean; data: { samples: Array<{ key: string }> }; meta: { intervalMs: number; format: string } });
  assert.equal(watchLines.length, 2);
  assert.equal(watchLines.every((line) => line.ok && line.meta.intervalMs === 1 && line.meta.format === "jsonl"), true);
  assert.equal(watchLines.every((line) => line.data.samples.some((sample) => sample.key === "system.memory.used")), true);
});

test("runCli plans system controls without executing hardware mutations", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-system-control-plan-"));
  const plan = await runCliCapture([
    "system", "controls", "plan", "system.display.set_brightness",
    "--target", "main",
    "--value", "70",
    "--reason", "test-plan",
    "--workspace", workspaceRoot,
    "--json",
  ], process.cwd());
  assert.equal(plan.code, CLI_EXIT_OK);
  const payload = parseCliJsonPayload<{
    status: string;
    willExecute: boolean;
    action: { id: string; requiresSignedHostBroker: boolean; requiresConfirmation: boolean };
    request: { target: string | null; value: string | null; reason: string };
    broker: { required: boolean; status: string; failClosed: boolean };
    policy: { requiredGrants: string[]; sensitiveDetailRedacted: boolean };
    steps: Array<{ id: string; status: string; owner: string }>;
    receipt: { required: boolean; status: string; auditEvent: string; auditStatus: string };
    auditPlan: { status: string; outcome: string; receiptStatus: string; redaction: { targetRedacted: boolean; valueRedacted: boolean; sensitiveDetailRedacted: boolean } };
    audit: { status: string; storageRef: string; auditPath?: string; outcome: string; durable: boolean };
    externalPending: boolean;
  }>(plan.stdout);
  assert.equal(payload.status, "planned");
  assert.equal(payload.willExecute, false);
  assert.equal(payload.action.id, "system.display.set_brightness");
  assert.equal(payload.action.requiresSignedHostBroker, true);
  assert.equal(payload.action.requiresConfirmation, false);
  assert.deepEqual(payload.request, { target: "main", value: "70", reason: "test-plan" });
  assert.equal(payload.broker.required, true);
  assert.equal(payload.broker.status, "external_pending");
  assert.equal(payload.broker.failClosed, true);
  assert.equal(payload.policy.requiredGrants.includes("system.display.control"), true);
  assert.equal(payload.policy.sensitiveDetailRedacted, true);
  assert.equal(payload.steps.some((step) => step.id === "execute_native_action" && step.status === "blocked" && step.owner === "signed_host_broker"), true);
  assert.equal(payload.receipt.required, true);
  assert.equal(payload.receipt.status, "not_issued");
  assert.equal(payload.receipt.auditEvent, "system.telemetry.control.display.set_brightness");
  assert.equal(payload.auditPlan.status, "planned");
  assert.equal(payload.auditPlan.outcome, "blocked");
  assert.equal(payload.auditPlan.receiptStatus, "not_issued");
  assert.equal(payload.auditPlan.redaction.targetRedacted, true);
  assert.equal(payload.auditPlan.redaction.valueRedacted, true);
  assert.equal(payload.auditPlan.redaction.sensitiveDetailRedacted, true);
  assert.equal(payload.receipt.auditStatus, "recorded");
  assert.equal(payload.audit.status, "recorded");
  assert.equal(payload.audit.outcome, "blocked");
  assert.equal(payload.audit.durable, true);
  assert.equal(payload.audit.storageRef, "claw.workspace.data/system-telemetry-audit.jsonl");
  assert.equal(payload.audit.auditPath, undefined);
  const controlPlanAudit = fs.readFileSync(path.join(workspaceRoot, ".claw", "data", "system-telemetry-audit.jsonl"), "utf8");
  assert.equal(controlPlanAudit.includes("\"controlId\":\"system.display.set_brightness\""), true);
  assert.equal(controlPlanAudit.includes("\"valueRedacted\":true"), true);
  assert.equal(payload.externalPending, true);
});

test("runCli executes system controls through configured signed host", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-system-control-host-"));
  const hostCommand = path.join(workspaceRoot, "host-control.js");
  fs.writeFileSync(hostCommand, `#!/usr/bin/env node
const args = process.argv.slice(2);
const value = args[args.indexOf("--value") + 1];
const controlId = args[args.indexOf("--control-id") + 1];
const dryRun = args.includes("--dry-run") && args[args.indexOf("--dry-run") + 1] === "true";
console.log(JSON.stringify({
  ok: true,
  data: {
    schema_version: 1,
    status: dryRun ? "planned" : "executed",
    will_execute: !dryRun,
    external_pending: false,
    action: { id: controlId, family: "audio", audit_event: "system.telemetry.control.audio.set_output_volume" },
    request: { target: "default", value, reason: "test-execute" },
    broker: {
      required: true,
      status: dryRun ? "planned" : "executed",
      mode: "signed_host_plan_first",
      fail_closed: true,
      capability_id: "mac.audio.volume"
    },
    receipt: {
      required: true,
      status: "issued",
      audit_event: "system.telemetry.control.audio.set_output_volume",
      mac_receipt_id: "macact_test",
      mac_audit_id: "macaudit_test",
      result: dryRun ? "planned" : "ok"
    }
  },
  meta: { adapter: "system-telemetry-control", source: "local_cli", capabilityId: controlId, riskLevel: "low" }
}));
`);
  fs.chmodSync(hostCommand, 0o755);

  const executed = await runCliCapture([
    "system", "controls", "execute", "system.audio.set_output_volume",
    "--target", "default",
    "--value", "35",
    "--dry-run", "true",
    "--reason", "test-execute",
    "--host-command", hostCommand,
    "--json",
  ], process.cwd());
  assert.equal(executed.code, CLI_EXIT_OK, executed.stderr);
  const payload = parseCliJsonPayload<{
    control: { id: string; requiresSignedHostBroker: boolean };
    response: {
      ok: boolean;
      data: {
        status: string;
        will_execute: boolean;
        broker: { capability_id: string; fail_closed: boolean };
        receipt: { status: string; result: string; mac_receipt_id: string };
      };
    };
  }>(executed.stdout);
  assert.equal(payload.control.id, "system.audio.set_output_volume");
  assert.equal(payload.control.requiresSignedHostBroker, true);
  assert.equal(payload.response.ok, true);
  assert.equal(payload.response.data.status, "planned");
  assert.equal(payload.response.data.will_execute, false);
  assert.equal(payload.response.data.broker.capability_id, "mac.audio.volume");
  assert.equal(payload.response.data.broker.fail_closed, true);
  assert.equal(payload.response.data.receipt.status, "issued");
  assert.equal(payload.response.data.receipt.result, "planned");
  assert.equal(payload.response.data.receipt.mac_receipt_id, "macact_test");
});

test("runCli records local context provider samples into monitor metric history", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-system-context-provider-"));
  const monitorDb = path.join(workspaceRoot, "monitor.sqlite");
  const weatherFile = path.join(workspaceRoot, "weather.json");
  fs.writeFileSync(weatherFile, JSON.stringify({ "context.weather.temperature": 21.5 }));

  await withPatchedEnv({
    CLAW_CONTEXT_WEATHER_FILE: weatherFile,
    CLAW_CONTEXT_BUILD_STATUS: "passed",
    CLAW_CONTEXT_SERVICE_HEALTH: "degraded",
    CLAW_CONTEXT_AGENT_RUNS_ACTIVE: "2",
    CLAW_CONTEXT_CUSTOM_METRIC: "desk-ready",
  }, async () => {
    const snapshot = await runCliCapture([
      "system", "snapshot",
      "--record", "true",
      "--workspace", workspaceRoot,
      "--monitor-db", monitorDb,
      "--json",
    ], process.cwd());
    assert.equal(snapshot.code, CLI_EXIT_OK, snapshot.stderr);
    const payload = parseCliJsonPayload<{
      samples: Array<{
        key: string;
        value: number | string;
        unit: string;
        source: { adapter: string; confidence: string; detail?: string };
        tags?: Record<string, string>;
      }>;
      unavailableMetrics: string[];
      recorded: { sampleCount: number; sourceId: string };
    }>(snapshot.stdout);
    const weather = payload.samples.find((entry) => entry.key === "context.weather.temperature");
    assert.equal(weather?.value, 21.5);
    assert.equal(weather?.unit, "celsius");
    assert.equal(weather?.source.adapter, "provider");
    assert.equal(weather?.source.confidence, "provider");
    assert.equal(weather?.source.detail, "local_fixture");
    assert.equal(weather?.tags?.location, "redacted");
    assert.equal(payload.samples.some((entry) => entry.key === "context.build.status" && entry.value === 0), true);
    assert.equal(payload.samples.some((entry) => entry.key === "context.service.health" && entry.value === 1), true);
    assert.equal(payload.samples.some((entry) => entry.key === "context.agent_runs.active" && entry.value === 2), true);
    assert.equal(payload.samples.some((entry) => entry.key === "context.custom.metric" && entry.value === "desk-ready"), true);
    assert.equal(payload.unavailableMetrics.includes("context.weather.temperature"), false);
    assert.equal(payload.recorded.sourceId, "system.telemetry.local");
    assert.equal(payload.recorded.sampleCount >= 8, true);

    const history = await runCliCapture([
      "system", "history", "context.weather.temperature",
      "--range", "1h",
      "--monitor-db", monitorDb,
      "--json",
    ], process.cwd());
    assert.equal(history.code, CLI_EXIT_OK, history.stderr);
    const historyPayload = parseCliJsonPayload<{
      retention: { status: string };
      samples: Array<{ metricKey: string; value: number; tags: Record<string, string> }>;
      chart: { source: string; points: Array<{ value: number }> };
      render: { source: string; empty: boolean; line: string };
    }>(history.stdout);
    assert.equal(historyPayload.retention.status, "recorded");
    assert.equal(historyPayload.samples.some((entry) => entry.metricKey === "context.weather.temperature" && entry.value === 21.5 && entry.tags.location === "redacted"), true);
    assert.equal(historyPayload.chart.source, "metric_samples");
    assert.equal(historyPayload.chart.points.some((entry) => entry.value === 21.5), true);
    assert.equal(historyPayload.render.source, "metric_samples");
    assert.equal(historyPayload.render.empty, false);
  });
});

test("runCli records system telemetry snapshots into monitor metric history", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-system-telemetry-history-"));
  const monitorDb = path.join(workspaceRoot, "monitor.sqlite");

  const upsertRule = await runCliCapture([
    "system", "rules", "upsert", "memory-any",
    "--metric-key", "system.memory.used",
    "--operator", "gt",
    "--threshold", "0",
    "--severity", "warning",
    "--workspace", workspaceRoot,
    "--json",
  ], process.cwd());
  assert.equal(upsertRule.code, CLI_EXIT_OK);

  const snapshot = await runCliCapture(["system", "snapshot", "--record", "true", "--workspace", workspaceRoot, "--monitor-db", monitorDb, "--json"], process.cwd());
  assert.equal(snapshot.code, CLI_EXIT_OK);
  const snapshotPayload = parseCliJsonPayload<{
    recorded: { store: string; dbPath: string; sourceId: string; sampleCount: number; rollupCount: number; incidentCount: number; purged: { samples: number; rollups: number; incidents: number } };
  }>(snapshot.stdout);
  assert.equal(snapshotPayload.recorded.store, "monitor.sqlite");
  assert.equal(snapshotPayload.recorded.dbPath, monitorDb);
  assert.equal(snapshotPayload.recorded.sourceId, "system.telemetry.local");
  assert.equal(snapshotPayload.recorded.sampleCount >= 3, true);
  assert.equal(snapshotPayload.recorded.rollupCount >= 3, true);
  assert.equal(snapshotPayload.recorded.incidentCount >= 1, true);
  assert.deepEqual(snapshotPayload.recorded.purged, { samples: 0, rollups: 0, incidents: 0 });
  assert.equal(fs.existsSync(monitorDb), true);

  const history = await runCliCapture(["system", "history", "system.memory.used", "--range", "1h", "--monitor-db", monitorDb, "--json"], process.cwd());
  assert.equal(history.code, CLI_EXIT_OK);
  const historyPayload = parseCliJsonPayload<{
    retention: { status: string; rollupBucketMs: number };
    samples: Array<{ metricKey: string; sourceId: string; valueType: string; unit: string; value: number }>;
    rollups: Array<{ metricKey: string; bucketMs: number; count: number }>;
    incidents: Array<{ ruleId: string; metricKey: string; severity: string; status: string; sampleValue: number }>;
    chart: { kind: string; source: string; empty: boolean; points: Array<{ value: number; sourceId: string }> };
    render: { kind: string; source: string; empty: boolean; line: string; min: number | null; max: number | null };
  }>(history.stdout);
  assert.equal(historyPayload.retention.status, "recorded");
  assert.equal(historyPayload.retention.rollupBucketMs, 60_000);
  assert.equal(historyPayload.samples.some((sample) => sample.metricKey === "system.memory.used" && sample.sourceId === "system.telemetry.local" && sample.valueType === "number" && sample.unit === "bytes"), true);
  assert.equal(historyPayload.rollups.some((rollup) => rollup.metricKey === "system.memory.used" && rollup.bucketMs === 60_000 && rollup.count >= 1), true);
  assert.equal(historyPayload.incidents.some((incident) => incident.ruleId === "memory-any" && incident.metricKey === "system.memory.used" && incident.severity === "warning" && incident.status === "open"), true);
  assert.equal(historyPayload.chart.kind, "line");
  assert.equal(historyPayload.chart.source, "metric_samples");
  assert.equal(historyPayload.chart.empty, false);
  assert.equal(historyPayload.chart.points.some((point) => point.sourceId === "system.telemetry.local" && typeof point.value === "number"), true);

  const dayHistory = await runCliCapture(["system", "history", "system.memory.used", "--range", "24h", "--monitor-db", monitorDb, "--json"], process.cwd());
  assert.equal(dayHistory.code, CLI_EXIT_OK);
  const dayHistoryPayload = parseCliJsonPayload<{
    rangeMs: number;
    retention: { status: string };
    chart: { source: string; points: Array<{ value: number; sourceId: string }> };
    render: { kind: string; source: string; line: string };
  }>(dayHistory.stdout);
  assert.equal(dayHistoryPayload.rangeMs, 86_400_000);
  assert.equal(dayHistoryPayload.retention.status, "recorded");
  assert.equal(dayHistoryPayload.chart.source, "metric_samples");
  assert.equal(dayHistoryPayload.chart.points.some((point) => point.sourceId === "system.telemetry.local" && typeof point.value === "number"), true);
  assert.equal(dayHistoryPayload.render.kind, "ascii_sparkline");
  assert.equal(dayHistoryPayload.render.source, "metric_samples");
  assert.equal(dayHistoryPayload.render.line.length > 0, true);
  assert.equal(historyPayload.render.kind, "ascii_sparkline");
  assert.equal(historyPayload.render.source, "metric_samples");
  assert.equal(historyPayload.render.empty, false);
  assert.equal(historyPayload.render.line.length > 0, true);
  assert.equal(typeof historyPayload.render.min, "number");
  assert.equal(typeof historyPayload.render.max, "number");
});

test("runCli records signed host system telemetry snapshots into monitor metric history", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-system-telemetry-host-history-"));
  const monitorDb = path.join(workspaceRoot, "monitor.sqlite");
  const hostCommand = path.join(workspaceRoot, "host-snapshot.js");
  fs.writeFileSync(hostCommand, `#!/usr/bin/env node
const capturedAt = new Date().toISOString();
console.log(JSON.stringify({
  ok: true,
  data: {
    schema_version: 1,
    captured_at: capturedAt,
    host: { platform: "macos", hostname: "test-host", processor_count: 12 },
    samples: [
      { metric_key: "system.gpu.utilization", value: 42, unit: "percent", captured_at: capturedAt, source: "macos_host", confidence: "experimental" },
      { metric_key: "system.memory.used", value: 2048, unit: "bytes", captured_at: capturedAt, source: "macos_host", confidence: "observed" },
      { metric_key: "system.focus.mode", value: "work", unit: "string", captured_at: capturedAt, source: "context_provider", confidence: "provider" }
    ],
    unavailable_metrics: [{ metric_key: "system.sensor.temperature" }]
  }
}));
`);
  fs.chmodSync(hostCommand, 0o755);

  const upsertRule = await runCliCapture([
    "system", "rules", "upsert", "focus-work",
    "--metric-key", "system.focus.mode",
    "--operator", "eq",
    "--threshold", "work",
    "--severity", "info",
    "--workspace", workspaceRoot,
    "--json",
  ], process.cwd());
  assert.equal(upsertRule.code, CLI_EXIT_OK);

  const snapshot = await runCliCapture([
    "system", "snapshot",
    "--source", "host",
    "--host-command", hostCommand,
    "--record", "true",
    "--workspace", workspaceRoot,
    "--monitor-db", monitorDb,
    "--json",
  ], process.cwd());
  assert.equal(snapshot.code, CLI_EXIT_OK, snapshot.stderr);
  const snapshotPayload = parseCliJsonPayload<{
    samples: Array<{ key: string; value: number | string; source: { adapter: string; confidence: string } }>;
    unavailableMetrics: string[];
    recorded: { sampleCount: number; sourceId: string };
  }>(snapshot.stdout);
  assert.equal(snapshotPayload.samples.some((sample) => sample.key === "system.gpu.utilization" && sample.source.adapter === "signed_host" && sample.source.confidence === "experimental"), true);
  assert.equal(snapshotPayload.samples.some((sample) => sample.key === "system.focus.mode" && sample.value === "work" && sample.source.adapter === "signed_host" && sample.source.confidence === "provider"), true);
  assert.equal(snapshotPayload.unavailableMetrics.includes("system.sensor.temperature"), true);
  assert.equal(snapshotPayload.recorded.sourceId, "system.telemetry.local");
  assert.equal(snapshotPayload.recorded.sampleCount, 3);

  const history = await runCliCapture(["system", "history", "system.gpu.utilization", "--range", "1h", "--monitor-db", monitorDb, "--json"], process.cwd());
  assert.equal(history.code, CLI_EXIT_OK);
  const historyPayload = parseCliJsonPayload<{
    retention: { status: string };
    samples: Array<{ metricKey: string; sourceId: string; valueType: string; unit: string; value: number }>;
    chart: { source: string; points: Array<{ value: number }> };
  }>(history.stdout);
  assert.equal(historyPayload.retention.status, "recorded");
  assert.equal(historyPayload.samples.some((sample) => sample.metricKey === "system.gpu.utilization" && sample.sourceId === "system.telemetry.local" && sample.valueType === "number" && sample.unit === "percent" && sample.value === 42), true);
  assert.equal(historyPayload.chart.source, "metric_samples");
  assert.equal(historyPayload.chart.points.some((point) => point.value === 42), true);

  const focusHistory = await runCliCapture(["system", "history", "system.focus.mode", "--range", "1h", "--monitor-db", monitorDb, "--json"], process.cwd());
  assert.equal(focusHistory.code, CLI_EXIT_OK);
  const focusHistoryPayload = parseCliJsonPayload<{
    retention: { status: string };
    samples: Array<{ metricKey: string; sourceId: string; valueType: string; unit: string; value: string }>;
    rollups: Array<{ metricKey: string; lastValue: string; minValue: number | null; maxValue: number | null; avgValue: number | null }>;
    incidents: Array<{ ruleId: string; metricKey: string; severity: string; operator: string; threshold: string; sampleValue: string; unit: string }>;
  }>(focusHistory.stdout);
  assert.equal(focusHistoryPayload.retention.status, "recorded");
  assert.equal(focusHistoryPayload.samples.some((sample) => sample.metricKey === "system.focus.mode" && sample.sourceId === "system.telemetry.local" && sample.valueType === "string" && sample.unit === "string" && sample.value === "work"), true);
  assert.equal(focusHistoryPayload.rollups.some((rollup) => rollup.metricKey === "system.focus.mode" && rollup.lastValue === "work" && rollup.minValue === null && rollup.maxValue === null && rollup.avgValue === null), true);
  assert.equal(focusHistoryPayload.incidents.some((incident) => incident.ruleId === "focus-work" && incident.metricKey === "system.focus.mode" && incident.severity === "info" && incident.operator === "eq" && incident.threshold === "work" && incident.sampleValue === "work" && incident.unit === "string"), true);
});

test("runCli applies short local retention to system telemetry samples without purging Monitor health events", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-system-telemetry-retention-"));
  const monitorDb = path.join(workspaceRoot, "monitor.sqlite");
  const sqlite = new Database(monitorDb);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS operational_events (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );
  `);
  sqlite.prepare(`
    INSERT INTO operational_events (id, kind, level, message, created_at, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run("health-heartbeat", "health_check", "info", "Worker alive", new Date().toISOString(), "{}");
  sqlite.close();

  const snapshot = await runCliCapture(["system", "snapshot", "--record", "true", "--raw-retention", "0m", "--monitor-db", monitorDb, "--json"], process.cwd());
  assert.equal(snapshot.code, CLI_EXIT_OK);
  const snapshotPayload = parseCliJsonPayload<{
    recorded: { sampleCount: number; purged: { samples: number; rollups: number; incidents: number } };
  }>(snapshot.stdout);
  assert.equal(snapshotPayload.recorded.sampleCount >= 3, true);
  assert.equal(snapshotPayload.recorded.purged.samples >= 1, true);

  const retained = new Database(monitorDb, { readonly: true });
  try {
    const event = retained.prepare("SELECT id, kind, message FROM operational_events WHERE id = ?").get("health-heartbeat") as { id: string; kind: string; message: string } | undefined;
    const rollupCount = (retained.prepare("SELECT COUNT(*) AS count FROM metric_rollups WHERE metric_key = ?").get("system.memory.used") as { count: number }).count;
    assert.deepEqual(event, { id: "health-heartbeat", kind: "health_check", message: "Worker alive" });
    assert.equal(rollupCount >= 1, true);
  } finally {
    retained.close();
  }

  const history = await runCliCapture(["system", "history", "system.memory.used", "--range", "1h", "--monitor-db", monitorDb, "--json"], process.cwd());
  assert.equal(history.code, CLI_EXIT_OK);
  const historyPayload = parseCliJsonPayload<{ retention: { status: string }; samples: unknown[]; rollups: Array<{ metricKey: string }>; chart: { source: string; points: Array<{ value: number; count: number }> } }>(history.stdout);
  assert.equal(historyPayload.retention.status, "empty");
  assert.deepEqual(historyPayload.samples, []);
  assert.equal(historyPayload.rollups.some((rollup) => rollup.metricKey === "system.memory.used"), true);
  assert.equal(historyPayload.chart.source, "metric_rollups");
  assert.equal(historyPayload.chart.points.some((point) => typeof point.value === "number" && point.count >= 1), true);
});

test("runCli persists system telemetry rules and widgets in workspace state", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-system-telemetry-state-"));

  const upsertRule = await runCliCapture([
    "system", "rules", "upsert", "memory-high",
    "--metric-key", "system.memory.used",
    "--operator", "gt",
    "--threshold", "1024",
    "--severity", "critical",
    "--workspace", workspaceRoot,
    "--json",
  ], process.cwd());
  assert.equal(upsertRule.code, CLI_EXIT_OK);
  const rulePayload = parseCliJsonPayload<{ rule: { id: string; metricKey: string; severity: string }; statePath: string; mutatesHardware: boolean }>(upsertRule.stdout);
  assert.equal(rulePayload.rule.id, "memory-high");
  assert.equal(rulePayload.rule.metricKey, "system.memory.used");
  assert.equal(rulePayload.rule.severity, "critical");
  assert.equal(rulePayload.mutatesHardware, false);
  assert.equal(fs.existsSync(rulePayload.statePath), true);

  const listRules = await runCliCapture(["system", "rules", "list", "--workspace", workspaceRoot, "--json"], process.cwd());
  const rulesPayload = parseCliJsonPayload<{ rules: Array<{ id: string }> }>(listRules.stdout);
  assert.equal(rulesPayload.rules.some((rule) => rule.id === "memory-high"), true);

  const deleteRule = await runCliCapture(["system", "rules", "delete", "memory-high", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(deleteRule.code, CLI_EXIT_OK);
  const deletedRulesPayload = parseCliJsonPayload<{ deleted: string; rules: Array<{ id: string }>; mutatesHardware: boolean }>(deleteRule.stdout);
  assert.equal(deletedRulesPayload.deleted, "memory-high");
  assert.equal(deletedRulesPayload.mutatesHardware, false);
  assert.equal(deletedRulesPayload.rules.some((rule) => rule.id === "memory-high"), false);

  const upsertWidget = await runCliCapture([
    "system", "widgets", "upsert", "battery-text",
    "--metric-key", "system.power.uptime",
    "--title", "Uptime",
    "--presentation", "text",
    "--placement", "menubar",
    "--enabled", "true",
    "--workspace", workspaceRoot,
    "--json",
  ], process.cwd());
  assert.equal(upsertWidget.code, CLI_EXIT_OK);
  const widgetPayload = parseCliJsonPayload<{ widget: { id: string; placement: string; presentation: string }; statePath: string; hostSpecific: boolean }>(upsertWidget.stdout);
  assert.equal(widgetPayload.widget.id, "battery-text");
  assert.equal(widgetPayload.widget.placement, "menubar");
  assert.equal(widgetPayload.widget.presentation, "text");
  assert.equal(widgetPayload.hostSpecific, true);
  assert.equal(fs.existsSync(widgetPayload.statePath), true);

  const deleteWidget = await runCliCapture(["system", "widgets", "delete", "battery-text", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(deleteWidget.code, CLI_EXIT_OK);
  const deletedWidgetPayload = parseCliJsonPayload<{ deleted: string; widgets: Array<{ id: string }>; hostSpecific: boolean }>(deleteWidget.stdout);
  assert.equal(deletedWidgetPayload.deleted, "battery-text");
  assert.equal(deletedWidgetPayload.hostSpecific, true);
  assert.equal(deletedWidgetPayload.widgets.some((widget) => widget.id === "battery-text"), false);
});

test("runCli supports implicit db create, schema inspection, human output, and alias parity", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-magic-db-"));
  useIsolatedClawDataRoot(t, workspaceRoot);

  const createStdout = captureStream();
  const createStderr = captureStream();
  assert.equal(await runCli(["db", "task", "Comprar leche"], {
    stdout: createStdout.stream,
    stderr: createStderr.stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(createStderr.getOutput(), /Using local database for this project/);
  assert.match(createStdout.getOutput(), /Created task (\S+) "Comprar leche"/);
  const taskId = createStdout.getOutput().match(/Created task (\S+) "Comprar leche"/)?.[1] ?? "";
  assert.ok(taskId);

  const listStdout = captureStream();
  assert.equal(await runCli(["db", "tasks", "list"], {
    stdout: listStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(listStdout.getOutput(), new RegExp(taskId));

  const getStdout = captureStream();
  assert.equal(await runCli(["db", "tasks", "get", taskId], {
    stdout: getStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(getStdout.getOutput(), /title: Comprar leche/);
  assert.match(getStdout.getOutput(), /status: todo/);

  const collectionsStdout = captureStream();
  assert.equal(await runCli(["collections", "tasks", "list", "--json"], {
    stdout: collectionsStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(collectionsStdout.getOutput(), new RegExp(taskId));

  const recordsStdout = captureStream();
  assert.equal(await runCli(["records", "tasks", "get", taskId, "--json"], {
    stdout: recordsStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.equal(parseCliJsonPayload<{ id: string }>(recordsStdout.getOutput()).id, taskId);

  const updateStdout = captureStream();
  assert.equal(await runCli(["db", "tasks", "update", taskId, "--set", "priority=urgent", "--set", "estimateMinutes=15", "--json"], {
    stdout: updateStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const updatedTask = parseCliJsonPayload<{ priority?: string; estimateMinutes?: number }>(updateStdout.getOutput());
  assert.equal(updatedTask.priority, "urgent");
  assert.equal(updatedTask.estimateMinutes, 15);

  const queryStdout = captureStream();
  assert.equal(await runCli(["db", "tasks", "query", "Comprar", "--json"], {
    stdout: queryStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.equal(parseCliJsonPayload<Array<{ id: string }>>(queryStdout.getOutput()).some((item) => item.id === taskId), true);

  const invalidFieldStdout = captureStream();
  assert.equal(await runCli(["db", "tasks", "update", taskId, "--set", "priority=never", "--json"], {
    stdout: invalidFieldStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_USAGE);
  const invalidField = JSON.parse(invalidFieldStdout.getOutput()) as { ok: boolean; error: { code: string; message: string } };
  assert.equal(invalidField.ok, false);
  assert.equal(invalidField.error.code, "invalid_field_value");
  assert.match(invalidField.error.message, /low, medium, high, urgent/);

  const aliasStdout = captureStream();
  assert.equal(await runCli(["tasks", "create", "Alias task"], {
    stdout: aliasStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(aliasStdout.getOutput(), /\S+/);
  const emptyStdout = captureStream();
  assert.equal(await runCli(["db", "leads", "list"], {
    stdout: emptyStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(emptyStdout.getOutput(), /No leads yet/);
  assert.match(emptyStdout.getOutput(), /Try: claw db lead "First lead"/);

  const leadStdout = captureStream();
  const leadStderr = captureStream();
  assert.equal(await runCli(["db", "leads", "--set", "name=Ada", "--set", "website=https://ada.dev", "--set", "companyId=company_ada"], {
    stdout: leadStdout.stream,
    stderr: leadStderr.stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(leadStderr.getOutput(), /Mapped "name" to "title"/);
  assert.match(leadStdout.getOutput(), /Created lead \S+ "Ada"/);

  const schemaStdout = captureStream();
  assert.equal(await runCli(["db", "leads", "schema"], {
    stdout: schemaStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  assert.match(schemaStdout.getOutput(), /collection: leads/);
  assert.match(schemaStdout.getOutput(), /protected: yes/);

  const taskSchemaStdout = captureStream();
  assert.equal(await runCli(["db", "tasks", "schema", "--json"], {
    stdout: taskSchemaStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  }), CLI_EXIT_OK);
  const taskSchema = parseCliJsonPayload<{ collection: { fields: Array<{ name: string; type: string; options?: string[] }> } }>(taskSchemaStdout.getOutput());
  assert.equal(taskSchema.collection.fields.some((field) => field.name === "priority" && field.options?.includes("urgent")), true);
  assert.equal(taskSchema.collection.fields.some((field) => field.name === "estimateMinutes" && field.type === "number"), true);

});

test("runCli can scaffold a workspace-first project with the new command surface", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-new-workspace-"));
  const stdout = captureStream();

  const exitCode = await runCli(["new", "workspace", "demo-workspace", "--no-install", "--json"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
  });

  assert.equal(exitCode, CLI_EXIT_OK);
  assert.match(stdout.getOutput(), /"type": "workspace"/);

  const projectRoot = path.join(tempRoot, "demo-workspace");
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
  assert.equal(packageJson.name, "demo-workspace");
  assert.equal(packageJson.devDependencies["@clawjs/cli"], "^0.1.0");

  const projectConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, "claw.project.json"), "utf8"));
  assert.equal(projectConfig.type, "workspace");
  assert.equal(projectConfig.directories.skills, "claw/skills");
});

test("runCli can manage command-backed generations end to end", async (t) => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-generations-"));
  useIsolatedClawDataRoot(t, workspaceDir);
  const scriptPath = createFakeGenerationScript();

  const registerStdout = captureStream();
  assert.equal(await runCli([
    "generations",
    "register-command",
    "--workspace", workspaceDir,
    "--id", "fake-image",
    "--label", "Fake Image",
    "--kinds", "image",
    "--command", scriptPath,
    "--args-json", "[\"--out\",\"{outputPath}\"]",
    "--ext", "png",
    "--json",
  ], {
    stdout: registerStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceDir,
  }), CLI_EXIT_OK);
  assert.match(registerStdout.getOutput(), /"id": "fake-image"/);

  const createStdout = captureStream();
  assert.equal(await runCli([
    "generations",
    "create",
    "--workspace", workspaceDir,
    "--kind", "image",
    "--backend", "fake-image",
    "--prompt", "sunset over water",
    "--json",
  ], {
    stdout: createStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceDir,
  }), CLI_EXIT_OK);
  const created = parseCliJsonPayload<{ id: string; output?: { filePath?: string } }>(createStdout.getOutput());
  assert.match(created.id, /^gen-/);
  assert.equal(fs.existsSync(created.output?.filePath || ""), true);

  const listStdout = captureStream();
  assert.equal(await runCli([
    "generations",
    "list",
    "--workspace", workspaceDir,
    "--kind", "image",
    "--json",
  ], {
    stdout: listStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceDir,
  }), CLI_EXIT_OK);
  assert.match(listStdout.getOutput(), /"kind": "image"/);

  const readStdout = captureStream();
  assert.equal(await runCli([
    "generations",
    "read",
    "--workspace", workspaceDir,
    "--id", created.id,
    "--json",
  ], {
    stdout: readStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceDir,
  }), CLI_EXIT_OK);
  assert.match(readStdout.getOutput(), new RegExp(created.id));

  const deleteStdout = captureStream();
  assert.equal(await runCli([
    "generations",
    "delete",
    "--workspace", workspaceDir,
    "--id", created.id,
    "--json",
  ], {
    stdout: deleteStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceDir,
  }), CLI_EXIT_OK);
  assert.match(deleteStdout.getOutput(), /"removed": true/);
});

test("runCli can create and list images through the image alias and an auto-detected OpenClaw skill", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-openclaw-generations-"));
  const { skillsDir, binDir } = createFakeOpenClawImageSkillEnv();

  await withPatchedEnv({
    OPENCLAW_SKILLS_DIR: skillsDir,
    OPENAI_API_KEY: "test-key",
    PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
  }, async () => {
    const backendsStdout = captureStream();
    assert.equal(await runCli([
      "image",
      "backends",
      "--workspace", workspaceDir,
      "--json",
    ], {
      stdout: backendsStdout.stream,
      stderr: captureStream().stream,
      cwd: workspaceDir,
    }), CLI_EXIT_OK);
    assert.match(backendsStdout.getOutput(), /openclaw-skill:openai-image-gen/);

    const createStdout = captureStream();
    assert.equal(await runCli([
      "image",
      "generate",
      "--workspace", workspaceDir,
      "--prompt", "editorial lobster portrait",
      "--model", "gpt-image-1.5",
      "--output-format", "webp",
      "--json",
    ], {
      stdout: createStdout.stream,
      stderr: captureStream().stream,
      cwd: workspaceDir,
    }), CLI_EXIT_OK);

    const created = parseCliJsonPayload<{ backendId: string; output?: { filePath?: string } }>(createStdout.getOutput());
    assert.equal(created.backendId, "openclaw-skill:openai-image-gen");
    assert.equal(fs.existsSync(created.output?.filePath || ""), true);
    assert.match(fs.readFileSync(created.output?.filePath || "", "utf8"), /cli-openclaw:gpt-image-1.5/);

    const listStdout = captureStream();
    assert.equal(await runCli([
      "image",
      "list",
      "--workspace", workspaceDir,
      "--json",
    ], {
      stdout: listStdout.stream,
      stderr: captureStream().stream,
      cwd: workspaceDir,
    }), CLI_EXIT_OK);
    assert.match(listStdout.getOutput(), /"backendId": "openclaw-skill:openai-image-gen"/);
  });
});

test("runCli supports native image create, edit, import, list, and show", async () => {
  const server = await createFakeOpenAIImageCliServer();
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-images-workspace-"));
  const imageLibrary = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-images-library-"));
  const codexImagePath = path.join(workspaceDir, "codex.png");
  fs.writeFileSync(codexImagePath, Buffer.from(ONE_PIXEL_PNG, "base64"));

  try {
    await withPatchedEnv({ OPENAI_API_KEY: "test-key" }, async () => {
      const createStdout = captureStream();
      const createStderr = captureStream();
      assert.equal(await runCli([
        "image",
        "create",
        "--workspace", workspaceDir,
        "--image-library", imageLibrary,
        "--openai-base-url", server.baseUrl,
        "--allow-env-credentials",
        "--prompt", "library logo",
        "--type", "logo",
        "--tags", "brand,library",
        "--json",
      ], {
        stdout: createStdout.stream,
        stderr: createStderr.stream,
        cwd: workspaceDir,
      }), CLI_EXIT_OK, `${createStdout.getOutput()}\n${createStderr.getOutput()}`);
      const created = parseCliJsonPayload<{ id: string; operation: string; imageType: string }>(createStdout.getOutput());
      assert.equal(created.operation, "create");
      assert.equal(created.imageType, "logo");

      const editStdout = captureStream();
      assert.equal(await runCli([
        "image",
        "edit",
        "--workspace", workspaceDir,
        "--image-library", imageLibrary,
        "--openai-base-url", server.baseUrl,
        "--allow-env-credentials",
        "--id", created.id,
        "--prompt", "make the logo monochrome",
        "--json",
      ], {
        stdout: editStdout.stream,
        stderr: captureStream().stream,
        cwd: workspaceDir,
      }), CLI_EXIT_OK);
      const edited = parseCliJsonPayload<{ id: string; parentId: string; editDepth: number }>(editStdout.getOutput());
      assert.equal(edited.parentId, created.id);
      assert.equal(edited.editDepth, 1);

      const importStdout = captureStream();
      assert.equal(await runCli([
        "image",
        "import",
        "--workspace", workspaceDir,
        "--image-library", imageLibrary,
        "--file", codexImagePath,
        "--prompt", "Codex generated brand variant",
        "--provenance", "imported-codex",
        "--external-generator", "codex",
        "--type", "logo",
        "--parent-id", edited.id,
        "--tags", "codex,brand",
        "--json",
      ], {
        stdout: importStdout.stream,
        stderr: captureStream().stream,
        cwd: workspaceDir,
      }), CLI_EXIT_OK);
      const imported = parseCliJsonPayload<{ id: string; provenance: string; parentId: string }>(importStdout.getOutput());
      assert.equal(imported.provenance, "imported-codex");
      assert.equal(imported.parentId, edited.id);

      const listStdout = captureStream();
      assert.equal(await runCli([
        "image",
        "list",
        "--workspace", workspaceDir,
        "--image-library", imageLibrary,
        "--query", "codex",
        "--json",
      ], {
        stdout: listStdout.stream,
        stderr: captureStream().stream,
        cwd: workspaceDir,
      }), CLI_EXIT_OK);
      assert.match(listStdout.getOutput(), /imported-codex/);

      const pluralListStdout = captureStream();
      assert.equal(await runCli([
        "images",
        "list",
        "--workspace", workspaceDir,
        "--image-library", imageLibrary,
        "--query", "codex",
        "--json",
      ], {
        stdout: pluralListStdout.stream,
        stderr: captureStream().stream,
        cwd: workspaceDir,
      }), CLI_EXIT_OK);
      assert.match(pluralListStdout.getOutput(), /imported-codex/);

      const showStdout = captureStream();
      assert.equal(await runCli([
        "image",
        "show",
        "--workspace", workspaceDir,
        "--image-library", imageLibrary,
        "--id", imported.id,
        "--json",
      ], {
        stdout: showStdout.stream,
        stderr: captureStream().stream,
        cwd: workspaceDir,
      }), CLI_EXIT_OK);
      assert.match(showStdout.getOutput(), /Codex generated brand variant/);
    });
    assert.deepEqual(server.requests.map((entry) => entry.pathname), [`${OPENAI_API_PREFIX}/images/generations`, `${OPENAI_API_PREFIX}/images/edits`]);
  } finally {
    await server.close();
  }
});

test("runCli generate, add, and info operate on claw projects", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-generate-"));

  assert.equal(await runCli(["new", "workspace", "demo-workspace", "--no-install"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
  }), CLI_EXIT_OK);

  const projectRoot = path.join(tempRoot, "demo-workspace");

  const generateStdout = captureStream();
  assert.equal(await runCli(["generate", "skill", "search-intents", "--project", projectRoot, "--json"], {
    stdout: generateStdout.stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
  }), CLI_EXIT_OK);
  assert.match(generateStdout.getOutput(), /"resource": "skill"/);
  assert.equal(fs.existsSync(path.join(projectRoot, "claw", "skills", "search-intents.ts")), true);

  const addStdout = captureStream();
  assert.equal(await runCli(["add", "telegram", "--project", projectRoot, "--json"], {
    stdout: addStdout.stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
  }), CLI_EXIT_OK);
  assert.match(addStdout.getOutput(), /"integration": "telegram"/);
  assert.equal(fs.existsSync(path.join(projectRoot, "claw", "channels", "telegram.json")), true);

  const infoStdout = captureStream();
  assert.equal(await runCli(["info", "--project", projectRoot, "--json"], {
    stdout: infoStdout.stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
  }), CLI_EXIT_OK);
  assert.match(infoStdout.getOutput(), /"projectRoot"/);
  assert.match(infoStdout.getOutput(), /"type": "workspace"/);

  const projectConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, "claw.project.json"), "utf8"));
  assert.equal(projectConfig.resources.skills[0].id, "search-intents");
  assert.equal(projectConfig.resources.channels[0].id, "telegram");
});

test("runCli exposes provider catalog and auth state commands", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-providers-"));

  const listStdout = captureStream();
  const listExitCode = await runCli([
    "--runtime", "demo",
    "providers",
    "list",
    "--workspace", workspaceRoot,
    "--json",
  ], {
    stdout: listStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(listExitCode), true);
  assert.match(listStdout.getOutput(), /"id": "openai"/);

  const stateStdout = captureStream();
  const stateExitCode = await runCli([
    "--runtime", "demo",
    "providers",
    "auth-state",
    "--workspace", workspaceRoot,
    "--json",
  ], {
    stdout: stateStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(stateExitCode), true);
  assert.match(stateStdout.getOutput(), /"providers"/);
});

test("runCli exposes secrets-backed secrets commands", async () => {
  const secrets = await createFakeSecretsCliServer();
  try {
    const listStdout = captureStream();
    const listExitCode = await runCli([
      "--runtime", "demo",
      "secrets",
      "list",
      "--workspace", fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-secrets-list-")),
      "--secrets-backend", "secrets",
      "--secrets-url", secrets.baseUrl,
      "--secrets-token", "secrets-token",
      "--secrets-tenant-id", "demo-tenant",
      "--json",
    ], {
      stdout: listStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(listExitCode, CLI_EXIT_OK);
    assert.match(listStdout.getOutput(), /"npm_token_main"/);

    const typesStdout = captureStream();
    const typesExitCode = await runCli([
      "--runtime", "demo",
      "secrets",
      "types",
      "--workspace", fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-secrets-types-")),
      "--secrets-backend", "secrets",
      "--secrets-url", secrets.baseUrl,
      "--secrets-token", "secrets-token",
      "--secrets-tenant-id", "demo-tenant",
      "--json",
    ], {
      stdout: typesStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(typesExitCode, CLI_EXIT_OK);
    assert.match(typesStdout.getOutput(), /"npm.token"/);

    const capabilitiesStdout = captureStream();
    const capabilitiesExitCode = await runCli([
      "--runtime", "demo",
      "secrets",
      "capabilities",
      "--name", "npm_token_main",
      "--workspace", fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-secrets-capabilities-")),
      "--secrets-backend", "secrets",
      "--secrets-url", secrets.baseUrl,
      "--secrets-token", "secrets-token",
      "--secrets-tenant-id", "demo-tenant",
      "--json",
    ], {
      stdout: capabilitiesStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(capabilitiesExitCode, CLI_EXIT_OK);
    assert.match(capabilitiesStdout.getOutput(), /"capabilities"/);
  } finally {
    await secrets.close();
  }
});

test("runCli manages the host registry", async () => {
  const clawHome = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-host-registry-"));

  const registerStdout = captureStream();
  const registerExitCode = await runCli([
    "host",
    "register",
    "clawix",
    "--display-name", "Clawix",
    "--kind", "standalone",
    "--transport", "xpc",
    "--address", "com.clawix.host",
    "--claw-home", clawHome,
    "--json",
  ], {
    stdout: registerStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(registerExitCode, CLI_EXIT_OK);
  assert.match(registerStdout.getOutput(), /"activeHostId": "clawix"/);

  const statusStdout = captureStream();
  const statusExitCode = await runCli([
    "host",
    "status",
    "--claw-home", clawHome,
    "--json",
  ], {
    stdout: statusStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(statusExitCode, CLI_EXIT_OK);
  assert.match(statusStdout.getOutput(), /"activeHostId": "clawix"/);
});

test("runCli can upload, search, read, and download documents", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-documents-"));
  const sourceFile = path.join(workspaceRoot, "brief.txt");
  const downloadFile = path.join(workspaceRoot, "downloaded.txt");
  fs.writeFileSync(sourceFile, "alpha notes for document search");

  const uploadStdout = captureStream();
  const uploadExitCode = await runCli([
    "documents",
    "upload",
    "--workspace", workspaceRoot,
    "--file", sourceFile,
    "--json",
  ], {
    stdout: uploadStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(uploadExitCode, CLI_EXIT_OK);
  const uploaded = parseCliJsonPayload<{ documentId: string; name: string }>(uploadStdout.getOutput());
  assert.match(uploaded.documentId, /^[0-9a-f-]{36}$/);
  assert.equal(uploaded.name, "brief.txt");

  const listStdout = captureStream();
  const listExitCode = await runCli([
    "documents",
    "list",
    "--workspace", workspaceRoot,
    "--json",
  ], {
    stdout: listStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(listExitCode, CLI_EXIT_OK);
  assert.match(listStdout.getOutput(), new RegExp(uploaded.documentId));

  const searchStdout = captureStream();
  const searchExitCode = await runCli([
    "documents",
    "search",
    "--workspace", workspaceRoot,
    "--query", "alpha",
    "--json",
  ], {
    stdout: searchStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(searchExitCode, CLI_EXIT_OK);
  assert.match(searchStdout.getOutput(), /alpha/);

  const readStdout = captureStream();
  const readExitCode = await runCli([
    "documents",
    "read",
    "--workspace", workspaceRoot,
    "--document-id", uploaded.documentId,
    "--json",
  ], {
    stdout: readStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(readExitCode, CLI_EXIT_OK);
  assert.match(readStdout.getOutput(), /"name": "brief\.txt"/);

  const downloadStdout = captureStream();
  const downloadExitCode = await runCli([
    "documents",
    "download",
    "--workspace", workspaceRoot,
    "--document-id", uploaded.documentId,
    "--out", downloadFile,
    "--confirm",
    "--approval-id", "approval_document_download_index",
    "--legal-label", "Document download - human reviewed",
    "--json",
  ], {
    stdout: downloadStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(downloadExitCode, CLI_EXIT_OK);
  assert.equal(fs.readFileSync(downloadFile, "utf8"), "alpha notes for document search");
  const downloadLegal = JSON.parse(fs.readFileSync(`${downloadFile}.claw-legal.json`, "utf8")) as { approvalId: string; legalLabel: string };
  assert.equal(downloadLegal.approvalId, "approval_document_download_index");
  assert.equal(downloadLegal.legalLabel, "Document download - human reviewed");
});

test("runCli can generate text through the inference command", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-inference-"));
  const { binDir, openclawLog } = createFakeOpenClawToolchain();

  await withPatchedEnv({
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    FAKE_OPENCLAW_AGENT_TEXT: "hello from inference",
  }, async () => {
    const stdout = captureStream();
    const exitCode = await runCli([
      "inference",
      "generate-text",
      "--workspace", workspaceRoot,
      "--workspace-id", "demo-inference",
      "--agent-id", "demo-inference",
      "--prompt", "Summarize this",
      "--transport", "cli",
      "--json",
    ], {
      stdout: stdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(exitCode, CLI_EXIT_OK);
    assert.match(stdout.getOutput(), /hello from inference/);
  });

  assert.match(fs.readFileSync(openclawLog, "utf8"), /agent --agent demo-inference/);
});

test("runCli can manage TTS config and synthesize audio", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-tts-"));
  const outputPath = path.join(workspaceRoot, "speech.mp3");

  const configStdout = captureStream();
  const configExitCode = await runCli([
    "tts",
    "set-config",
    "--workspace", workspaceRoot,
    "--config-json", JSON.stringify({ provider: "openai", enabled: true, autoRead: true, voice: "nova", model: "tts-1" }),
    "--json",
  ], {
    stdout: configStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(configExitCode, CLI_EXIT_OK);
  assert.match(configStdout.getOutput(), /"provider": "openai"/);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(Buffer.from("fake-mp3"), {
    status: 200,
    headers: { "content-type": "audio/mpeg" },
  })) as typeof fetch;

  try {
    const synthStdout = captureStream();
    const synthExitCode = await runCli([
      "tts",
      "synthesize",
      "--workspace", workspaceRoot,
      "--text", "Hello world",
      "--provider", "openai",
      "--api-key", "test-key",
      "--out", outputPath,
      "--json",
    ], {
      stdout: synthStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(synthExitCode, CLI_EXIT_OK);
    assert.equal(fs.readFileSync(outputPath, "utf8"), "fake-mp3");
    assert.match(synthStdout.getOutput(), /"mimeType": "audio\/mpeg"/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runCli stores and transcribes voice notes locally", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-voice-notes-"));
  useIsolatedClawDataRoot(t, workspaceRoot);
  const audioPath = path.join(workspaceRoot, "note.ogg");
  const whisperPath = path.join(workspaceRoot, "fake-whisper");
  const ffmpegPath = path.join(workspaceRoot, "fake-ffmpeg");
  fs.writeFileSync(audioPath, "fake-audio");
  fs.writeFileSync(ffmpegPath, `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
const input = args[args.indexOf("-i") + 1];
const output = args[args.length - 1];
if (!input || !output.endsWith(".wav")) process.exit(2);
fs.writeFileSync(output, fs.readFileSync(input));
`, { mode: 0o755 });
  fs.writeFileSync(whisperPath, `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
const input = args[args.indexOf("-f") + 1];
if (!input.endsWith(".wav")) process.exit(3);
const outIndex = args.indexOf("-of");
if (outIndex !== -1) fs.writeFileSync(args[outIndex + 1] + ".txt", "hola desde nota de voz");
`, { mode: 0o755 });

  const addStdout = captureStream();
  const addExitCode = await runCli([
    "voice-notes",
    "add",
    "--workspace", workspaceRoot,
    "--file", audioPath,
    "--origin", "telegram",
    "--provider", "telegram",
    "--account", "support",
    "--target-id", "1001",
    "--json",
  ], {
    stdout: addStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(addExitCode, CLI_EXIT_OK);
  const note = parseCliJsonPayload<{ id: string; status: string }>(addStdout.getOutput());
  assert.equal(note.status, "stored");

  const transcribeStdout = captureStream();
  const transcribeExitCode = await runCli([
    "voice-notes",
    "transcribe",
    note.id,
    "--workspace", workspaceRoot,
    "--binary-path", whisperPath,
    "--ffmpeg-path", ffmpegPath,
    "--model-path", path.join(workspaceRoot, "model.bin"),
    "--json",
  ], {
    stdout: transcribeStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(transcribeExitCode, CLI_EXIT_OK);
  assert.match(transcribeStdout.getOutput(), /hola desde nota de voz/);

  const listStdout = captureStream();
  const listExitCode = await runCli([
    "voice-notes",
    "list",
    "--workspace", workspaceRoot,
    "--origin", "telegram",
    "--query", "hola",
    "--json",
  ], {
    stdout: listStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(listExitCode, CLI_EXIT_OK);
  assert.match(listStdout.getOutput(), /"status": "transcribed"/);
});

test("runCli honors --runtime for alternate workspace layouts", async () => {
  const zeroWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-zeroclaw-"));
  const picoWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-picoclaw-"));

  const zeroExitCode = await runCli([
    "--runtime", "zeroclaw",
    "workspace", "init",
    "--workspace", zeroWorkspace,
    "--json",
  ], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  const picoExitCode = await runCli([
    "--runtime", "picoclaw",
    "workspace", "init",
    "--workspace", picoWorkspace,
    "--json",
  ], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(zeroExitCode, CLI_EXIT_OK);
  assert.equal(picoExitCode, CLI_EXIT_OK);
  assert.equal(fs.existsSync(path.join(zeroWorkspace, "MEMORY.md")), true);
  assert.equal(fs.existsSync(path.join(zeroWorkspace, "TOOLS.md")), false);
  assert.equal(fs.existsSync(path.join(picoWorkspace, "memory", "MEMORY.md")), true);
  assert.equal(fs.existsSync(path.join(picoWorkspace, "TOOLS.md")), false);
});

test("runCli browser commands target relay browser routes", async () => {
  const requests: Array<{ method: string; url: string; auth: string | undefined; body: string }> = [];
  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    requests.push({
      method: req.method ?? "GET",
      url: req.url ?? "/",
      auth: req.headers.authorization,
      body: Buffer.concat(chunks).toString("utf8"),
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      session: {
        workspaceId: "main",
        active: true,
        status: "ready",
        navigation: {
          title: "Login",
          url: "https://example.com/login",
          displayUrl: "https://example.com/login",
          isLocalUrl: false,
        },
        controller: null,
        viewport: { width: 1440, height: 960 },
        updatedAt: new Date().toISOString(),
      },
      sharePath: "/workspace/demo-tenant/demo-agent/main/browser",
      shareUrl: "http://127.0.0.1:4410/workspace/demo-tenant/demo-agent/main/browser",
    }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const relayUrl = `http://127.0.0.1:${address.port}`;

  try {
    const stdout = captureStream();
    const ensureExitCode = await runCli([
      "browser",
      "ensure",
      "--relay-url", relayUrl,
      "--access-token", "relay-token",
      "--tenant-id", "demo-tenant",
      "--agent-id", "demo-agent",
      "--workspace-id", "main",
      "--url", "http://localhost:4300",
    ], {
      stdout: stdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(ensureExitCode, CLI_EXIT_OK);
    assert.match(stdout.getOutput(), /workspace\/demo-tenant\/demo-agent\/main\/browser/);
    assert.equal(requests[0]?.method, "POST");
    assert.equal(requests[0]?.auth, "Bearer relay-token");
    assert.match(requests[0]?.url ?? "", /\/v1\/tenants\/demo-tenant\/agents\/demo-agent\/workspaces\/main\/browser\/session$/);
    assert.match(requests[0]?.body ?? "", /localhost:4300/);

    const statusStdout = captureStream();
    const statusExitCode = await runCli([
      "browser",
      "status",
      "--relay-url", relayUrl,
      "--access-token", "relay-token",
      "--tenant-id", "demo-tenant",
      "--agent-id", "demo-agent",
      "--workspace-id", "main",
    ], {
      stdout: statusStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(statusExitCode, CLI_EXIT_OK);
    assert.equal(statusStdout.getOutput().trim(), "ready");
    assert.equal(requests[1]?.method, "GET");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("runCli supports temporal domain commands and schedule shortcut", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-time-"));
  const built = buildTimeApp({
    config: {
      host: "127.0.0.1",
      port: 0,
      dataDir: path.join(tmpDir, "data"),
      dbPath: path.join(tmpDir, "data", "core.sqlite"),
      defaultTimeZone: "UTC",
      schedulerIntervalMs: 50,
    },
  });
  const address = await built.app.listen({ host: "127.0.0.1", port: 0 });
  const timeUrl = address.replace(/\/$/, "");

  try {
    const calendarStdout = captureStream();
    const calendarExitCode = await runCli([
      "calendar",
      "at",
      "monday 9am",
      "review PRs",
      "--time-url", timeUrl,
      "--workspace", tmpDir,
      "--json",
    ], {
      stdout: calendarStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(calendarExitCode, CLI_EXIT_OK);
    const calendarCreated = parseCliJsonPayload<{ item: { id: string; kind: string; title: string } }>(calendarStdout.getOutput());
    assert.equal(calendarCreated.item.kind, "event");

    const calendarListStdout = captureStream();
    const calendarListExitCode = await runCli([
      "calendar",
      "list",
      "--time-url", timeUrl,
      "--workspace", tmpDir,
    ], {
      stdout: calendarListStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(calendarListExitCode, CLI_EXIT_OK);
    assert.match(calendarListStdout.getOutput().split("\n")[0] ?? "", /id\s+status\s+next\s+title/);
    assert.match(calendarListStdout.getOutput(), /review PRs/);

    const calendarGetStdout = captureStream();
    const calendarGetExitCode = await runCli([
      "calendar",
      "get",
      calendarCreated.item.id,
      "--time-url", timeUrl,
      "--workspace", tmpDir,
      "--json",
    ], {
      stdout: calendarGetStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(calendarGetExitCode, CLI_EXIT_OK);
    assert.match(calendarGetStdout.getOutput(), /review PRs/);

    const everyStdout = captureStream();
    const everyExitCode = await runCli([
      "routines",
      "every",
      "3h",
      "check deployment health",
      "--time-url", timeUrl,
      "--workspace", tmpDir,
      "--json",
    ], {
      stdout: everyStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(everyExitCode, CLI_EXIT_OK);
    const routineCreated = parseCliJsonPayload<{ item: { id: string; kind: string } }>(everyStdout.getOutput());
    assert.equal(routineCreated.item.kind, "routine");

    const runStdout = captureStream();
    const runExitCode = await runCli([
      "routines",
      "run",
      routineCreated.item.id,
      "--time-url", timeUrl,
      "--workspace", tmpDir,
      "--json",
    ], {
      stdout: runStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(runExitCode, CLI_EXIT_OK);
    assert.match(runStdout.getOutput(), /"status": "succeeded"/);

    const historyStdout = captureStream();
    const historyExitCode = await runCli([
      "routines",
      "history",
      routineCreated.item.id,
      "--time-url", timeUrl,
      "--workspace", tmpDir,
    ], {
      stdout: historyStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(historyExitCode, CLI_EXIT_OK);
    assert.match(historyStdout.getOutput().split("\n")[0] ?? "", /id\s+status\s+next\s+title/);
    assert.match(historyStdout.getOutput(), /routine executed via workflow/);

    const reminderStdout = captureStream();
    const reminderExitCode = await runCli([
      "reminders",
      "after",
      "30m",
      "check build",
      "--time-url", timeUrl,
      "--workspace", tmpDir,
      "--json",
    ], {
      stdout: reminderStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(reminderExitCode, CLI_EXIT_OK);
    assert.match(reminderStdout.getOutput(), /"kind": "reminder"/);

    const watchStdout = captureStream();
    const watchExitCode = await runCli([
      "watch",
      "thread:thread-1",
      "--if-no", "reply",
      "--after",
      "24h",
      "--then", "remind",
      "nudge owner",
      "--time-url", timeUrl,
      "--workspace", tmpDir,
      "--anchor-at", "2026-04-09T08:00:00.000Z",
      "--json",
    ], {
      stdout: watchStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(watchExitCode, CLI_EXIT_OK);
    assert.match(watchStdout.getOutput(), /"kind": "follow_up"/);
    assert.match(watchStdout.getOutput(), /"anchorType": "thread"/);

    const listStdout = captureStream();
    const listExitCode = await runCli([
      "time",
      "list",
      "--time-url", timeUrl,
      "--workspace", tmpDir,
      "--json",
    ], {
      stdout: listStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(listExitCode, CLI_EXIT_OK);
    assert.match(listStdout.getOutput(), /review PRs/);

    const scheduleStdout = captureStream();
    const scheduleExitCode = await runCli([
      "schedule",
      "every",
      "3h",
      "scheduled deployment check",
      "--time-url", timeUrl,
      "--workspace", tmpDir,
      "--json",
    ], {
      stdout: scheduleStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(scheduleExitCode, CLI_EXIT_OK);
    assert.match(scheduleStdout.getOutput(), /"kind": "routine"/);
  } finally {
    await built.app.close();
  }
});

test("runCli manages local styles, templates, and references", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-design-assets-"));
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-design-cwd-"));
  const context = { stdout: captureStream().stream, stderr: captureStream().stream, cwd };

  const styleOut = captureStream();
  assert.equal(await runCli(["style", "install-builtins", "--workspace", workspaceRoot, "--json"], {
    ...context,
    stdout: styleOut.stream,
  }), CLI_EXIT_OK);
  const stylePayload = parseCliJsonPayload<{ installed: string[]; skipped: string[] }>(styleOut.getOutput());
  assert.equal(stylePayload.installed.includes("claw"), true);
  assert.equal(stylePayload.skipped.length, 0);

  const templateOut = captureStream();
  assert.equal(await runCli(["template", "create", "Launch One Pager", "--category", "one-pager", "--default-style", "claw", "--workspace", workspaceRoot, "--json"], {
    ...context,
    stdout: templateOut.stream,
  }), CLI_EXIT_OK);
  const templatePayload = parseCliJsonPayload<{ template: { id: string; category: string; defaultStyleId: string } }>(templateOut.getOutput());
  assert.equal(templatePayload.template.category, "one-pager");
  assert.equal(templatePayload.template.defaultStyleId, "claw");

  const assetPath = path.join(cwd, "sample.txt");
  fs.writeFileSync(assetPath, "reference body\n", "utf8");
  const refOut = captureStream();
  assert.equal(await runCli(["ref", "add", "--type", "snippet", "--source", "sample.txt", "--name", "Sample Ref", "--tag", "brand,test", "--workspace", workspaceRoot, "--json"], {
    ...context,
    stdout: refOut.stream,
  }), CLI_EXIT_OK);
  const refPayload = parseCliJsonPayload<{ reference: { id: string; asset: string; tags: string[] } }>(refOut.getOutput());
  assert.equal(refPayload.reference.asset, "sample.txt");
  assert.deepEqual(refPayload.reference.tags, ["brand", "test"]);

  const linkedOut = captureStream();
  assert.equal(await runCli(["ref", "link", refPayload.reference.id, "--style", "claw", "--workspace", workspaceRoot, "--json"], {
    ...context,
    stdout: linkedOut.stream,
  }), CLI_EXIT_OK);
  const linkedPayload = parseCliJsonPayload<{ styleIds: string[] }>(linkedOut.getOutput());
  assert.deepEqual(linkedPayload.styleIds, ["claw"]);

  const listOut = captureStream();
  assert.equal(await runCli(["template", "list", "--category", "one-pager", "--workspace", workspaceRoot, "--json"], {
    ...context,
    stdout: listOut.stream,
  }), CLI_EXIT_OK);
  const listPayload = parseCliJsonPayload<{ templates: Array<{ id: string }> }>(listOut.getOutput());
  assert.deepEqual(listPayload.templates.map((entry) => entry.id), [templatePayload.template.id]);

  const renderOut = captureStream();
  assert.equal(await runCli(["template", "render", templatePayload.template.id, "--style", "claw", "--format", "html", "--workspace", workspaceRoot, "--json"], {
    ...context,
    stdout: renderOut.stream,
  }), CLI_EXIT_OK);
  const renderPayload = parseCliJsonPayload<{ results: Array<{ format: string; outputPath: string }> }>(renderOut.getOutput());
  assert.equal(renderPayload.results[0]?.format, "html");
  assert.equal(fs.existsSync(renderPayload.results[0]?.outputPath ?? ""), true);

  const pluralStylesOut = captureStream();
  assert.equal(await runCli(["styles", "list", "--workspace", workspaceRoot, "--json"], {
    ...context,
    stdout: pluralStylesOut.stream,
  }), CLI_EXIT_OK);
  assert.match(pluralStylesOut.getOutput(), /"id": "claw"/);

  const pluralTemplatesOut = captureStream();
  assert.equal(await runCli(["templates", "list", "--workspace", workspaceRoot, "--json"], {
    ...context,
    stdout: pluralTemplatesOut.stream,
  }), CLI_EXIT_OK);
  assert.match(pluralTemplatesOut.getOutput(), new RegExp(templatePayload.template.id));

  const pluralReferencesOut = captureStream();
  assert.equal(await runCli(["references", "list", "--workspace", workspaceRoot, "--json"], {
    ...context,
    stdout: pluralReferencesOut.stream,
  }), CLI_EXIT_OK);
  assert.match(pluralReferencesOut.getOutput(), new RegExp(refPayload.reference.id));
});

test("runCli supports heartbeat routines with deterministic gates", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-heartbeat-"));
  let taskMatches: Array<{ source: string; id: string; title: string; updatedAt: string }> = [];
  let customMatches: Array<{ source: string; id: string; title: string; updatedAt: string }> = [];
  const agentCalls: Array<{ prompt: string; matches: unknown[]; target: string; deliver?: unknown }> = [];
  const built = buildTimeApp({
    config: {
      host: "127.0.0.1",
      port: 0,
      dataDir: path.join(tmpDir, "time-data"),
      dbPath: path.join(tmpDir, "time-data", "core.sqlite"),
      defaultTimeZone: "UTC",
      schedulerIntervalMs: 50,
    },
    heartbeatChecks: {
      "workspace.tasks": async () => taskMatches,
      "custom:ready-check": async () => customMatches,
    },
    heartbeatAgent: async (input) => {
      agentCalls.push({ prompt: input.prompt, matches: input.matches, target: input.target, deliver: input.deliver });
      return { status: "done", summary: `processed ${input.matches.length}` };
    },
  });
  const address = await built.app.listen({ host: "127.0.0.1", port: 0 });
  const timeUrl = address.replace(/\/$/, "");

  const forceDue = (id: string) => {
    const item = built.store.getItem(id);
    assert.ok(item);
    item.nextRunAt = "2026-04-09T08:00:00.000Z";
    built.store.putItem(item);
  };

  try {
    const missingOptInStdout = captureStream();
    const missingOptInStderr = captureStream();
    const missingOptInExitCode = await runCli([
      "routines",
      "every",
      "5m",
      "custom heartbeat",
      "--when", "custom:ready-check",
      "--time-url", timeUrl,
      "--workspace", tmpDir,
    ], {
      stdout: missingOptInStdout.stream,
      stderr: missingOptInStderr.stream,
      cwd: process.cwd(),
    });
    assert.equal(missingOptInExitCode, CLI_EXIT_USAGE);
    assert.match(missingOptInStderr.getOutput(), /allow-custom-check/);

    const skipStdout = captureStream();
    const skipExitCode = await runCli([
      "routines",
      "every",
      "5m",
      "triage ready work",
      "--when", "workspace.tasks:new",
      "--prompt", "Work on ready tasks",
      "--time-url", timeUrl,
      "--workspace", tmpDir,
      "--json",
    ], {
      stdout: skipStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(skipExitCode, CLI_EXIT_OK);
    const skipRoutine = parseCliJsonPayload<{ item: { id: string; heartbeat?: { when: string[] } } }>(skipStdout.getOutput());
    assert.deepEqual(skipRoutine.item.heartbeat?.when, ["workspace.tasks:new"]);

    const policyStdout = captureStream();
    const policyExitCode = await runCli([
      "routines",
      "every",
      "5m",
      "budgeted heartbeat",
      "--when", "workspace.tasks:new",
      "--target", "main",
      "--cooldown", "30s",
      "--max-wakes", "1",
      "--max-wakes-window", "5m",
      "--active-hours", "00:00-24:00",
      "--active-timezone", "UTC",
      "--stagger", "30s",
      "--time-url", timeUrl,
      "--workspace", tmpDir,
      "--json",
    ], {
      stdout: policyStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(policyExitCode, CLI_EXIT_OK);
    const policyRoutine = parseCliJsonPayload<{ item: { schedule?: { staggerMs?: number }; heartbeat?: { target?: string; cooldownMs?: number; maxWakesPerWindow?: { count?: number; windowMs?: number }; activeHours?: { timezone?: string }; staggerMs?: number } } }>(policyStdout.getOutput());
    assert.equal(policyRoutine.item.schedule?.staggerMs, 30_000);
    assert.equal(policyRoutine.item.heartbeat?.target, "main");
    assert.equal(policyRoutine.item.heartbeat?.cooldownMs, 30_000);
    assert.equal(policyRoutine.item.heartbeat?.maxWakesPerWindow?.count, 1);
    assert.equal(policyRoutine.item.heartbeat?.maxWakesPerWindow?.windowMs, 300_000);
    assert.equal(policyRoutine.item.heartbeat?.activeHours?.timezone, "UTC");

    forceDue(skipRoutine.item.id);
    assert.deepEqual(await built.engine.runSchedulerCycle(), []);
    assert.equal(agentCalls.length, 0);

    const skipGetStdout = captureStream();
    const skipGetExitCode = await runCli([
      "routines",
      "get",
      skipRoutine.item.id,
      "--time-url", timeUrl,
      "--workspace", tmpDir,
      "--json",
    ], {
      stdout: skipGetStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(skipGetExitCode, CLI_EXIT_OK);
    const skipped = parseCliJsonPayload<{ item: { heartbeat?: { state?: { skipCount?: number; lastSkipReason?: string } } } }>(skipGetStdout.getOutput());
    assert.equal(skipped.item.heartbeat?.state?.skipCount, 1);
    assert.equal(skipped.item.heartbeat?.state?.lastSkipReason, "no heartbeat matches");

    taskMatches = [{ source: "workspace.tasks", id: "task-1", title: "Fix release gate", updatedAt: "2026-04-09T08:01:00.000Z" }];
    forceDue(skipRoutine.item.id);
    const wakeExecutions = await built.engine.runSchedulerCycle();
    assert.equal(wakeExecutions.length, 1);
    assert.equal(agentCalls.length, 1);
    assert.equal(agentCalls[0]?.prompt, "Work on ready tasks");
    assert.equal(agentCalls[0]?.target, "isolated");

    const historyStdout = captureStream();
    const historyExitCode = await runCli([
      "routines",
      "history",
      skipRoutine.item.id,
      "--time-url", timeUrl,
      "--workspace", tmpDir,
    ], {
      stdout: historyStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(historyExitCode, CLI_EXIT_OK);
    assert.match(historyStdout.getOutput().split("\n")[0] ?? "", /id\s+status\s+next\s+title/);
    assert.match(historyStdout.getOutput(), /processed 1/);

    taskMatches = [];
    const stopStdout = captureStream();
    const stopExitCode = await runCli([
      "routines",
      "every",
      "5m",
      "stop when empty",
      "--when", "workspace.tasks:new",
      "--stop-when", "workspace.tasks:none",
      "--time-url", timeUrl,
      "--workspace", tmpDir,
      "--json",
    ], {
      stdout: stopStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(stopExitCode, CLI_EXIT_OK);
    const stopRoutine = parseCliJsonPayload<{ item: { id: string } }>(stopStdout.getOutput());
    forceDue(stopRoutine.item.id);
    assert.deepEqual(await built.engine.runSchedulerCycle(), []);
    const stopped = built.store.getItem(stopRoutine.item.id);
    assert.equal(stopped?.status, "completed");
    assert.equal(agentCalls.length, 1);

    customMatches = [{ source: "custom", id: "ready-1", title: "Ready check", updatedAt: "2026-04-09T08:02:00.000Z" }];
    const customStdout = captureStream();
    const customExitCode = await runCli([
      "routines",
      "every",
      "5m",
      "custom heartbeat",
      "--when", "custom:ready-check",
      "--allow-custom-check", "ready-check",
      "--time-url", timeUrl,
      "--workspace", tmpDir,
      "--json",
    ], {
      stdout: customStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(customExitCode, CLI_EXIT_OK);
    const customRoutine = parseCliJsonPayload<{ item: { id: string; heartbeat?: { allowedCustomChecks?: string[] } } }>(customStdout.getOutput());
    assert.deepEqual(customRoutine.item.heartbeat?.allowedCustomChecks, ["ready-check"]);

    const listStdout = captureStream();
    const listExitCode = await runCli([
      "routines",
      "list",
      "--time-url", timeUrl,
      "--workspace", tmpDir,
    ], {
      stdout: listStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(listExitCode, CLI_EXIT_OK);
    assert.match(listStdout.getOutput().split("\n")[0] ?? "", /id\s+status\s+next\s+title/);
  } finally {
    await built.app.close();
  }
});
