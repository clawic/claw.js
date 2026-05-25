import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";

import { CLI_EXIT_OK, CLI_EXIT_USAGE, runCli } from "./index.ts";
import { captureStream, withPatchedEnv } from "./index-test-utils.ts";

function parseCliJsonPayload<T>(output: string): T {
  const parsed = JSON.parse(output) as { ok?: boolean; data?: unknown; meta?: Record<string, unknown> };
  assert.equal(parsed.ok, true);
  assert.equal(parsed.meta?.canonicalCommand, "mac-care");
  return parsed.data as T;
}

test("mac-care report is read-only and exposes atlas, sidecar, and safety policy", async () => {
  const stdout = captureStream();
  const stderr = captureStream();
  assert.equal(await runCli(["mac-care", "report", "--json"], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  assert.equal(stderr.getOutput(), "");

  const data = parseCliJsonPayload<{
    status: string;
    routes: Array<{ id: string; family: string }>;
    sidecar: { filename: string; surfaceId: string; path: string };
    actionPlan: { executionAuthority: string; groups: unknown[] };
    safety: { allowed: boolean; requiredAuthority: string };
    executionPolicy: { agentCanExecuteDestructiveActions: boolean; destructiveExecutionAuthority: string };
  }>(stdout.getOutput());

  assert.equal(data.status, "read_only_foundation");
  assert.equal(data.sidecar.filename, "mac_care.sqlite");
  assert.equal(data.sidecar.surfaceId, "claw.database.macCare");
  assert.equal(data.sidecar.path, "~/.claw/data/mac_care.sqlite");
  assert.ok(data.routes.some((route) => route.id === "mac_care.route.downloads"));
  assert.equal(data.actionPlan.executionAuthority, "agent_plan_only");
  assert.deepEqual(data.actionPlan.groups, []);
  assert.equal(data.safety.allowed, true);
  assert.equal(data.safety.requiredAuthority, "none");
  assert.equal(data.executionPolicy.agentCanExecuteDestructiveActions, false);
  assert.equal(data.executionPolicy.destructiveExecutionAuthority, "signed_host_human_confirmed");
});

test("mac-care sidecar descriptor depends on the persistent surface registry", () => {
  const source = fs.readFileSync(new URL("./cli-mac-care-command.ts", import.meta.url), "utf8");
  assert.match(source, /findClawPersistentSurfaceNode\(MAC_CARE_SIDECAR_SURFACE_ID\)/);
  assert.equal(source.includes('path: surface?.path ?? "~/.claw/data/mac_care.sqlite"'), false);
});

test("mac-care scanner storage uses the canonical sidecar filename", () => {
  const source = fs.readFileSync(new URL("./cli-mac-care-scanner.ts", import.meta.url), "utf8");
  assert.match(source, /openSidecar\(MAC_CARE_SIDECAR_FILENAME, env\)/);
  assert.match(source, /path\.join\(resolveClawjsDataRoot\(env\), MAC_CARE_SIDECAR_FILENAME\)/);
  assert.equal(source.includes('openSidecar("mac_care.sqlite", env)'), false);
  assert.equal(source.includes('path.join(resolveClawjsDataRoot(env), "mac_care.sqlite")'), false);
});

test("mac-care atlas exposes central route families without scanning the filesystem", async () => {
  const stdout = captureStream();
  assert.equal(await runCli(["mac-care", "atlas", "--json"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);

  const data = parseCliJsonPayload<{ routes: Array<{ family: string; mutability: string }> }>(stdout.getOutput());
  assert.ok(data.routes.some((route) => route.family === "cloud_sync"));
  assert.ok(data.routes.some((route) => route.mutability === "blocked"));
});

test("mac-care scan runs first-wave read-only modules against an explicit fixture home", async () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-mac-care-scan-"));
  const home = path.join(fixtureRoot, "home");
  const applications = path.join(fixtureRoot, "Applications");
  fs.mkdirSync(path.join(home, "Library", "Caches", "com.example.cache"), { recursive: true });
  fs.mkdirSync(path.join(home, "Library", "Logs"), { recursive: true });
  fs.mkdirSync(path.join(home, "Downloads"), { recursive: true });
  fs.mkdirSync(path.join(home, "Applications", "Local.app"), { recursive: true });
  fs.mkdirSync(path.join(home, "Library", "CloudStorage", "ExampleDrive"), { recursive: true });
  fs.mkdirSync(path.join(applications, "SystemVisible.app"), { recursive: true });
  fs.writeFileSync(path.join(home, "Library", "Caches", "com.example.cache", "blob.bin"), "cache");
  fs.writeFileSync(path.join(home, "Library", "Logs", "app.log"), "log");
  const largeDownload = path.join(home, "Downloads", "large-old.bin");
  fs.writeFileSync(largeDownload, Buffer.alloc(16, 1));
  fs.utimesSync(largeDownload, new Date("2026-01-01T00:00:00.000Z"), new Date("2026-01-01T00:00:00.000Z"));

  const stdout = captureStream();
  const stderr = captureStream();
  assert.equal(await runCli([
    "mac-care",
    "scan",
    "--home",
    home,
    "--applications-dir",
    applications,
    "--large-file-bytes",
    "8",
    "--old-file-days",
    "1",
    "--json",
  ], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  assert.equal(stderr.getOutput(), "");

  const data = parseCliJsonPayload<{
    status: string;
    homeDir: string;
    modules: Array<{ id: string; readOnly: boolean }>;
    groups: Array<{ moduleId: string; candidates: Array<{ path: string; action: string; selection: string; warnings: string[] }> }>;
    safety: { allowed: boolean; requiredAuthority: string; destructiveActions: string[] };
    summary: { totalCandidates: number; destructiveActions: number };
    persistence: { persisted: boolean; candidateRows: number };
  }>(stdout.getOutput());

  assert.equal(data.status, "read_only_scan");
  assert.equal(data.homeDir, home);
  assert.ok(data.modules.every((module) => module.readOnly));
  assert.ok(data.groups.some((group) => group.moduleId === "mac_care.module.user_caches" && group.candidates.length > 0));
  assert.ok(data.groups.some((group) => group.moduleId === "mac_care.module.app_inventory" && group.candidates.some((candidate) => candidate.path.endsWith("SystemVisible.app"))));
  const largeOldGroup = data.groups.find((group) => group.moduleId === "mac_care.module.large_old_files");
  assert.ok(largeOldGroup?.candidates.some((candidate) => candidate.path.endsWith("large-old.bin") && candidate.warnings.includes("large_file")));
  for (const group of data.groups) {
    for (const candidate of group.candidates) {
      assert.equal(candidate.action, "review");
      assert.equal(candidate.selection, "unselected");
    }
  }
  assert.equal(data.safety.allowed, true);
  assert.equal(data.safety.requiredAuthority, "none");
  assert.deepEqual(data.safety.destructiveActions, []);
  assert.equal(data.summary.destructiveActions, 0);
  assert.equal(data.persistence.persisted, false);
  assert.equal(data.persistence.candidateRows, 0);
});

test("mac-care scan persists read-only wave output only when requested", async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-mac-care-persist-data-"));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-mac-care-persist-home-"));
  const home = path.join(fixtureRoot, "home");
  fs.mkdirSync(path.join(home, "Library", "Caches", "com.example.cache"), { recursive: true });
  fs.mkdirSync(path.join(home, "Downloads"), { recursive: true });
  fs.writeFileSync(path.join(home, "Library", "Caches", "com.example.cache", "blob.bin"), "cache");
  fs.writeFileSync(path.join(home, "Downloads", "download.bin"), "download");

  await withPatchedEnv({ CLAW_DATA_DIR: dataRoot }, async () => {
    const stdout = captureStream();
    assert.equal(await runCli([
      "mac-care",
      "scan",
      "--home",
      home,
      "--large-file-bytes",
      "4",
      "--persist",
      "--json",
    ], {
      stdout: stdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);

    const data = parseCliJsonPayload<{
      scanId: string;
      persistence: { persisted: boolean; scanRows: number; candidateRows: number; actionPlanRows: number };
      summary: { totalCandidates: number };
    }>(stdout.getOutput());
    assert.equal(data.persistence.persisted, true);
    assert.equal(data.persistence.scanRows, 1);
    assert.equal(data.persistence.actionPlanRows, 1);
    assert.equal(data.persistence.candidateRows, data.summary.totalCandidates);

    const listStdout = captureStream();
    assert.equal(await runCli(["mac-care", "scans", "list", "--json"], {
      stdout: listStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);
    const listData = parseCliJsonPayload<{
      status: string;
      scans: Array<{ id: string; candidateCount: number; actionPlanCount: number; summary: { totalCandidates?: number } }>;
    }>(listStdout.getOutput());
    assert.equal(listData.status, "read_only_scan_history");
    assert.equal(listData.scans.length, 1);
    assert.equal(listData.scans[0]?.id, data.scanId);
    assert.equal(listData.scans[0]?.candidateCount, data.summary.totalCandidates);
    assert.equal(listData.scans[0]?.actionPlanCount, 1);
    assert.equal(listData.scans[0]?.summary.totalCandidates, data.summary.totalCandidates);

    const showStdout = captureStream();
    assert.equal(await runCli(["mac-care", "scans", "show", data.scanId, "--json"], {
      stdout: showStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);
    const showData = parseCliJsonPayload<{
      status: string;
      scan: { id: string; candidateCount: number };
      candidates: Array<{ action: string; selection: string }>;
      safety: { destructiveActions: string[] };
    }>(showStdout.getOutput());
    assert.equal(showData.status, "read_only_scan_detail");
    assert.equal(showData.scan.id, data.scanId);
    assert.equal(showData.scan.candidateCount, data.summary.totalCandidates);
    assert.equal(showData.candidates.length, data.summary.totalCandidates);
    assert.ok(showData.candidates.every((candidate) => candidate.action === "review" && candidate.selection === "unselected"));
    assert.deepEqual(showData.safety.destructiveActions, []);

    const sqlite = new Database(path.join(dataRoot, "mac_care.sqlite"), { readonly: true });
    try {
      assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM mac_care_scans WHERE id = ?").get(data.scanId) as { count: number }).count, 1);
      assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM mac_care_candidates WHERE scan_id = ?").get(data.scanId) as { count: number }).count, data.summary.totalCandidates);
      assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM mac_care_action_plans WHERE scan_id = ?").get(data.scanId) as { count: number }).count, 1);
      const destructiveRows = sqlite.prepare(`
        SELECT COUNT(*) AS count FROM mac_care_candidates
        WHERE scan_id = ? AND action != 'review'
      `).get(data.scanId) as { count: number };
      assert.equal(destructiveRows.count, 0);
    } finally {
      sqlite.close();
    }
  });
});

test("mac-care persist flag honors explicit false and rejects invalid values before writing sidecar", async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-mac-care-persist-flag-data-"));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-mac-care-persist-flag-home-"));
  const home = path.join(fixtureRoot, "home");
  fs.mkdirSync(path.join(home, "Library", "Caches", "com.example.cache"), { recursive: true });
  fs.writeFileSync(path.join(home, "Library", "Caches", "com.example.cache", "blob.bin"), "cache");

  await withPatchedEnv({ CLAW_DATA_DIR: dataRoot }, async () => {
    const explicitFalseStdout = captureStream();
    assert.equal(await runCli([
      "mac-care",
      "scan",
      "--home",
      home,
      "--persist",
      "false",
      "--json",
    ], {
      stdout: explicitFalseStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);
    const explicitFalse = parseCliJsonPayload<{
      persistence: { persisted: boolean; candidateRows: number };
    }>(explicitFalseStdout.getOutput());
    assert.equal(explicitFalse.persistence.persisted, false);
    assert.equal(explicitFalse.persistence.candidateRows, 0);
    assert.equal(fs.existsSync(path.join(dataRoot, "mac_care.sqlite")), false);

    const invalidStdout = captureStream();
    assert.equal(await runCli([
      "mac-care",
      "scan",
      "--home",
      home,
      "--persist",
      "maybe",
      "--json",
    ], {
      stdout: invalidStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_USAGE);
    const invalid = JSON.parse(invalidStdout.getOutput()) as {
      ok: boolean;
      error: { code: string; status: string; message: string };
    };
    assert.equal(invalid.ok, false);
    assert.equal(invalid.error.code, "invalid_boolean_flag");
    assert.equal(invalid.error.status, "USAGE");
    assert.match(invalid.error.message, /--persist/);
    assert.equal(fs.existsSync(path.join(dataRoot, "mac_care.sqlite")), false);
  });
});

test("mac-care app-updates handoff prepares inventory-only host-confirmed update handoff", async () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-mac-care-app-update-"));
  const home = path.join(fixtureRoot, "home");
  const applications = path.join(fixtureRoot, "Applications");
  fs.mkdirSync(path.join(home, "Applications", "Local.app"), { recursive: true });
  fs.mkdirSync(path.join(applications, "SystemVisible.app"), { recursive: true });

  const stdout = captureStream();
  const stderr = captureStream();
  assert.equal(await runCli([
    "mac-care",
    "app-updates",
    "handoff",
    "--home",
    home,
    "--applications-dir",
    applications,
    "--json",
  ], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  assert.equal(stderr.getOutput(), "");

  const data = parseCliJsonPayload<{
    status: string;
    items: Array<{
      displayName: string;
      action: string;
      selection: string;
      agentCanInstall: boolean;
      executionAuthority: string;
      status: string;
    }>;
    actionPlan: { executionAuthority: string; groups: Array<{ candidates: Array<{ action: string; selection: string }> }> };
    safety: { allowed: boolean; requiredAuthority: string; destructiveActions: string[] };
    summary: { totalItems: number; agentInstallActions: number; signedHostRequired: number };
  }>(stdout.getOutput());

  assert.equal(data.status, "app_update_handoff_inventory");
  assert.equal(data.items.length, 2);
  assert.ok(data.items.some((item) => item.displayName === "Local.app"));
  assert.ok(data.items.some((item) => item.displayName === "SystemVisible.app"));
  assert.ok(data.items.every((item) => item.action === "update_app"));
  assert.ok(data.items.every((item) => item.selection === "blocked"));
  assert.ok(data.items.every((item) => item.agentCanInstall === false));
  assert.ok(data.items.every((item) => item.executionAuthority === "signed_host_human_confirmed"));
  assert.ok(data.items.every((item) => item.status === "inventory_only"));
  assert.equal(data.actionPlan.executionAuthority, "agent_plan_only");
  assert.ok(data.actionPlan.groups.every((group) => group.candidates.every((candidate) => candidate.action === "update_app" && candidate.selection === "blocked")));
  assert.equal(data.safety.allowed, false);
  assert.equal(data.safety.requiredAuthority, "signed_host_human_confirmed");
  assert.deepEqual(data.safety.destructiveActions, ["update_app"]);
  assert.equal(data.summary.totalItems, 2);
  assert.equal(data.summary.agentInstallActions, 0);
  assert.equal(data.summary.signedHostRequired, 2);
});

test("mac-care app-updates approval-ready prepares a non-installing update approval package", async () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-mac-care-app-update-approval-"));
  const home = path.join(fixtureRoot, "home");
  const applications = path.join(fixtureRoot, "Applications");
  fs.mkdirSync(path.join(home, "Applications", "Local.app"), { recursive: true });
  fs.mkdirSync(path.join(applications, "SystemVisible.app"), { recursive: true });

  const handoffStdout = captureStream();
  assert.equal(await runCli([
    "mac-care",
    "app-updates",
    "handoff",
    "--home",
    home,
    "--applications-dir",
    applications,
    "--json",
  ], {
    stdout: handoffStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);

  const handoffFile = path.join(fixtureRoot, "app-update-handoff.json");
  fs.writeFileSync(handoffFile, handoffStdout.getOutput());

  const stdout = captureStream();
  const stderr = captureStream();
  assert.equal(await runCli([
    "mac-care",
    "app-updates",
    "approval-ready",
    "--handoff-file",
    handoffFile,
    "--json",
  ], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  assert.equal(stderr.getOutput(), "");

  const data = parseCliJsonPayload<{
    status: string;
    sourceHandoffStatus: string;
    items: Array<{
      displayName: string;
      requestedOperation: string;
      approvalState: string;
      willInstall: boolean;
      installerLaunched: boolean;
      agentCanInstall: boolean;
      executionAuthority: string;
      requiredEvidence: string[];
      reentryCondition: string;
    }>;
    actionPlan: { executionAuthority: string };
    safety: { allowed: boolean; requiredAuthority: string; destructiveActions: string[] };
    summary: {
      totalItems: number;
      updateActions: number;
      installersLaunched: number;
      approvalRequestsIssued: number;
      agentInstallActions: number;
      signedHostRequired: number;
    };
  }>(stdout.getOutput());

  assert.equal(data.status, "app_update_approval_ready");
  assert.equal(data.sourceHandoffStatus, "app_update_handoff_inventory");
  assert.equal(data.items.length, 2);
  assert.ok(data.items.some((item) => item.displayName === "Local.app"));
  assert.ok(data.items.some((item) => item.displayName === "SystemVisible.app"));
  assert.ok(data.items.every((item) => item.requestedOperation === "update_app"));
  assert.ok(data.items.every((item) => item.approvalState === "not_requested"));
  assert.ok(data.items.every((item) => item.willInstall === false));
  assert.ok(data.items.every((item) => item.installerLaunched === false));
  assert.ok(data.items.every((item) => item.agentCanInstall === false));
  assert.ok(data.items.every((item) => item.executionAuthority === "signed_host_human_confirmed"));
  assert.ok(data.items.every((item) => item.requiredEvidence.includes("app_identity_and_path_confirmed")));
  assert.ok(data.items.every((item) => item.reentryCondition.includes("signed host")));
  assert.equal(data.actionPlan.executionAuthority, "agent_plan_only");
  assert.equal(data.safety.allowed, false);
  assert.equal(data.safety.requiredAuthority, "signed_host_human_confirmed");
  assert.deepEqual(data.safety.destructiveActions, ["update_app"]);
  assert.equal(data.summary.totalItems, 2);
  assert.equal(data.summary.updateActions, 2);
  assert.equal(data.summary.installersLaunched, 0);
  assert.equal(data.summary.approvalRequestsIssued, 0);
  assert.equal(data.summary.agentInstallActions, 0);
  assert.equal(data.summary.signedHostRequired, 2);
});

test("mac-care cloud handoff prepares local-only provider mutation handoff", async () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-mac-care-cloud-"));
  const home = path.join(fixtureRoot, "home");
  fs.mkdirSync(path.join(home, "Library", "CloudStorage", "iCloudDrive"), { recursive: true });
  fs.mkdirSync(path.join(home, "Library", "CloudStorage", "Dropbox-Personal"), { recursive: true });

  const stdout = captureStream();
  const stderr = captureStream();
  assert.equal(await runCli([
    "mac-care",
    "cloud",
    "handoff",
    "--home",
    home,
    "--json",
  ], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  assert.equal(stderr.getOutput(), "");

  const data = parseCliJsonPayload<{
    status: string;
    items: Array<{
      displayName: string;
      providerHint: string;
      action: string;
      selection: string;
      agentCanMutateProvider: boolean;
      executionAuthority: string;
      status: string;
    }>;
    actionPlan: { executionAuthority: string; groups: Array<{ candidates: Array<{ action: string; selection: string }> }> };
    safety: { allowed: boolean; requiredAuthority: string; destructiveActions: string[] };
    summary: { totalItems: number; providerMutationActions: number; agentProviderMutations: number; signedHostRequired: number };
  }>(stdout.getOutput());

  assert.equal(data.status, "cloud_provider_handoff_inventory");
  assert.equal(data.items.length, 2);
  assert.ok(data.items.some((item) => item.displayName === "iCloudDrive" && item.providerHint === "icloud"));
  assert.ok(data.items.some((item) => item.displayName === "Dropbox-Personal" && item.providerHint === "dropbox"));
  assert.ok(data.items.every((item) => item.action === "unsync_cloud_item"));
  assert.ok(data.items.every((item) => item.selection === "blocked"));
  assert.ok(data.items.every((item) => item.agentCanMutateProvider === false));
  assert.ok(data.items.every((item) => item.executionAuthority === "signed_host_human_confirmed"));
  assert.ok(data.items.every((item) => item.status === "inventory_only"));
  assert.equal(data.actionPlan.executionAuthority, "agent_plan_only");
  assert.ok(data.actionPlan.groups.every((group) => group.candidates.every((candidate) => candidate.action === "unsync_cloud_item" && candidate.selection === "blocked")));
  assert.equal(data.safety.allowed, false);
  assert.equal(data.safety.requiredAuthority, "signed_host_human_confirmed");
  assert.deepEqual(data.safety.destructiveActions, ["unsync_cloud_item"]);
  assert.equal(data.summary.totalItems, 2);
  assert.equal(data.summary.providerMutationActions, 2);
  assert.equal(data.summary.agentProviderMutations, 0);
  assert.equal(data.summary.signedHostRequired, 2);
});

test("mac-care cloud approval-ready prepares a non-mutating provider approval package", async () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-mac-care-cloud-approval-"));
  const home = path.join(fixtureRoot, "home");
  fs.mkdirSync(path.join(home, "Library", "CloudStorage", "iCloudDrive"), { recursive: true });
  fs.mkdirSync(path.join(home, "Library", "CloudStorage", "Dropbox-Personal"), { recursive: true });

  const handoffStdout = captureStream();
  assert.equal(await runCli([
    "mac-care",
    "cloud",
    "handoff",
    "--home",
    home,
    "--json",
  ], {
    stdout: handoffStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);

  const handoffFile = path.join(fixtureRoot, "cloud-handoff.json");
  fs.writeFileSync(handoffFile, handoffStdout.getOutput());

  const stdout = captureStream();
  const stderr = captureStream();
  assert.equal(await runCli([
    "mac-care",
    "cloud",
    "approval-ready",
    "--handoff-file",
    handoffFile,
    "--json",
  ], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  assert.equal(stderr.getOutput(), "");

  const data = parseCliJsonPayload<{
    status: string;
    sourceHandoffStatus: string;
    items: Array<{
      providerHint: string;
      requestedOperation: string;
      approvalState: string;
      credentialsIncluded: boolean;
      willMutateProvider: boolean;
      agentCanMutateProvider: boolean;
      executionAuthority: string;
      requiredEvidence: string[];
      reentryCondition: string;
    }>;
    actionPlan: { executionAuthority: string };
    safety: { allowed: boolean; requiredAuthority: string; destructiveActions: string[] };
    summary: {
      totalItems: number;
      providerMutationActions: number;
      credentialsIncluded: number;
      approvalRequestsIssued: number;
      agentProviderMutations: number;
      signedHostRequired: number;
    };
  }>(stdout.getOutput());

  assert.equal(data.status, "cloud_provider_approval_ready");
  assert.equal(data.sourceHandoffStatus, "cloud_provider_handoff_inventory");
  assert.equal(data.items.length, 2);
  assert.ok(data.items.some((item) => item.providerHint === "icloud"));
  assert.ok(data.items.some((item) => item.providerHint === "dropbox"));
  assert.ok(data.items.every((item) => item.requestedOperation === "unsync_cloud_item"));
  assert.ok(data.items.every((item) => item.approvalState === "not_requested"));
  assert.ok(data.items.every((item) => item.credentialsIncluded === false));
  assert.ok(data.items.every((item) => item.willMutateProvider === false));
  assert.ok(data.items.every((item) => item.agentCanMutateProvider === false));
  assert.ok(data.items.every((item) => item.executionAuthority === "signed_host_human_confirmed"));
  assert.ok(data.items.every((item) => item.requiredEvidence.includes("explicit_item_level_confirmation")));
  assert.ok(data.items.every((item) => item.reentryCondition.includes("signed host")));
  assert.equal(data.actionPlan.executionAuthority, "agent_plan_only");
  assert.equal(data.safety.allowed, false);
  assert.equal(data.safety.requiredAuthority, "signed_host_human_confirmed");
  assert.deepEqual(data.safety.destructiveActions, ["unsync_cloud_item"]);
  assert.equal(data.summary.totalItems, 2);
  assert.equal(data.summary.providerMutationActions, 2);
  assert.equal(data.summary.credentialsIncluded, 0);
  assert.equal(data.summary.approvalRequestsIssued, 0);
  assert.equal(data.summary.agentProviderMutations, 0);
  assert.equal(data.summary.signedHostRequired, 2);
});

test("mac-care finalizer preview builds signed-host package without execution", async () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-mac-care-finalizer-"));
  const planFile = path.join(fixtureRoot, "action-plan.json");
  fs.writeFileSync(planFile, JSON.stringify({
    id: "plan-finalizer-cli",
    createdAt: "2026-05-21T00:00:00.000Z",
    executionAuthority: "agent_plan_only",
    requestedBy: "agent",
    groups: [{
      id: "group-downloads",
      moduleId: "mac_care.module.downloads",
      title: "Downloads",
      routeIds: ["mac_care.route.downloads"],
      candidates: [{
        id: "candidate-review",
        routeId: "mac_care.route.downloads",
        path: path.join(fixtureRoot, "review.txt"),
        displayName: "review.txt",
        action: "review",
        selection: "unselected",
        confidence: 1,
      }, {
        id: "candidate-trash",
        routeId: "mac_care.route.downloads",
        path: path.join(fixtureRoot, "old.dmg"),
        displayName: "old.dmg",
        action: "move_to_trash",
        selection: "blocked",
        confidence: 0.8,
        warnings: ["large_file"],
      }],
    }],
  }));

  const stdout = captureStream();
  const stderr = captureStream();
  assert.equal(await runCli([
    "mac-care",
    "finalizer",
    "preview",
    "--plan-file",
    planFile,
    "--json",
  ], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  assert.equal(stderr.getOutput(), "");

  const data = parseCliJsonPayload<{
    status: string;
    willExecute: boolean;
    receiptIssued: boolean;
    executionAuthority: string;
    actions: Array<{
      candidateId: string;
      action: string;
      requiresHumanConfirmation: boolean;
      blockedForAgents: boolean;
      rollback: { level: string };
      audit: { receiptRequired: boolean; receiptStatus: string };
      warnings: string[];
    }>;
    safety: { allowed: boolean; requiredAuthority: string; destructiveActions: string[] };
    summary: { totalCandidates: number; destructiveCandidates: number; blockedForAgents: number; receiptsIssued: number };
  }>(stdout.getOutput());

  assert.equal(data.status, "finalizer_preview");
  assert.equal(data.willExecute, false);
  assert.equal(data.receiptIssued, false);
  assert.equal(data.executionAuthority, "signed_host_human_confirmed");
  assert.equal(data.actions.length, 1);
  assert.equal(data.actions[0]?.candidateId, "candidate-trash");
  assert.equal(data.actions[0]?.action, "move_to_trash");
  assert.equal(data.actions[0]?.requiresHumanConfirmation, true);
  assert.equal(data.actions[0]?.blockedForAgents, true);
  assert.equal(data.actions[0]?.rollback.level, "best_effort");
  assert.equal(data.actions[0]?.audit.receiptRequired, true);
  assert.equal(data.actions[0]?.audit.receiptStatus, "not_issued");
  assert.ok(data.actions[0]?.warnings.includes("preview_only_no_execution"));
  assert.equal(data.safety.allowed, false);
  assert.equal(data.safety.requiredAuthority, "signed_host_human_confirmed");
  assert.deepEqual(data.safety.destructiveActions, ["move_to_trash"]);
  assert.equal(data.summary.totalCandidates, 2);
  assert.equal(data.summary.destructiveCandidates, 1);
  assert.equal(data.summary.blockedForAgents, 1);
  assert.equal(data.summary.receiptsIssued, 0);
});

test("mac-care finalizer approval-ready prepares a non-executing approval package", async () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-mac-care-finalizer-approval-"));
  const planFile = path.join(fixtureRoot, "action-plan.json");
  fs.writeFileSync(planFile, JSON.stringify({
    id: "plan-finalizer-approval-cli",
    createdAt: "2026-05-21T00:00:00.000Z",
    executionAuthority: "agent_plan_only",
    requestedBy: "agent",
    groups: [{
      id: "group-downloads",
      moduleId: "mac_care.module.downloads",
      title: "Downloads",
      routeIds: ["mac_care.route.downloads"],
      candidates: [{
        id: "candidate-trash",
        routeId: "mac_care.route.downloads",
        path: path.join(fixtureRoot, "old.dmg"),
        displayName: "old.dmg",
        action: "move_to_trash",
        selection: "blocked",
        confidence: 0.8,
        warnings: ["large_file"],
      }],
    }],
  }));

  const previewStdout = captureStream();
  assert.equal(await runCli([
    "mac-care",
    "finalizer",
    "preview",
    "--plan-file",
    planFile,
    "--json",
  ], {
    stdout: previewStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);

  const previewFile = path.join(fixtureRoot, "finalizer-preview.json");
  fs.writeFileSync(previewFile, previewStdout.getOutput());

  const stdout = captureStream();
  const stderr = captureStream();
  assert.equal(await runCli([
    "mac-care",
    "finalizer",
    "approval-ready",
    "--preview-file",
    previewFile,
    "--json",
  ], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  assert.equal(stderr.getOutput(), "");

  const data = parseCliJsonPayload<{
    status: string;
    sourcePreviewStatus: string;
    willExecute: boolean;
    receiptIssued: boolean;
    actions: Array<{
      candidateId: string;
      approvalState: string;
      willExecute: boolean;
      receiptWillBeIssued: boolean;
      requiresHumanConfirmation: boolean;
      blockedForAgents: boolean;
      requiredEvidence: string[];
      reentryCondition: string;
    }>;
    summary: {
      totalActions: number;
      destructiveActions: number;
      approvalRequestsIssued: number;
      executionRequestsIssued: number;
      receiptsIssued: number;
      blockedForAgents: number;
    };
  }>(stdout.getOutput());

  assert.equal(data.status, "finalizer_approval_ready");
  assert.equal(data.sourcePreviewStatus, "finalizer_preview");
  assert.equal(data.willExecute, false);
  assert.equal(data.receiptIssued, false);
  assert.equal(data.actions.length, 1);
  assert.equal(data.actions[0]?.candidateId, "candidate-trash");
  assert.equal(data.actions[0]?.approvalState, "not_requested");
  assert.equal(data.actions[0]?.willExecute, false);
  assert.equal(data.actions[0]?.receiptWillBeIssued, false);
  assert.equal(data.actions[0]?.requiresHumanConfirmation, true);
  assert.equal(data.actions[0]?.blockedForAgents, true);
  assert.ok(data.actions[0]?.requiredEvidence.includes("audit_receipt_destination_confirmed"));
  assert.ok(data.actions[0]?.reentryCondition.includes("signed host"));
  assert.equal(data.summary.totalActions, 1);
  assert.equal(data.summary.destructiveActions, 1);
  assert.equal(data.summary.approvalRequestsIssued, 0);
  assert.equal(data.summary.executionRequestsIssued, 0);
  assert.equal(data.summary.receiptsIssued, 0);
  assert.equal(data.summary.blockedForAgents, 1);
});

test("mac-care finalizer fixture-scan persists blocked preview fixture only when requested", async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-mac-care-finalizer-fixture-data-"));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-mac-care-finalizer-fixture-"));

  await withPatchedEnv({ CLAW_DATA_DIR: dataRoot }, async () => {
    const stdout = captureStream();
    const stderr = captureStream();
    assert.equal(await runCli([
      "mac-care",
      "finalizer",
      "fixture-scan",
      "--fixture-dir",
      fixtureRoot,
      "--persist",
      "--json",
    ], {
      stdout: stdout.stream,
      stderr: stderr.stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);
    assert.equal(stderr.getOutput(), "");

    const data = parseCliJsonPayload<{
      status: string;
      fixtureOnly: boolean;
      scanId: string;
      groups: Array<{ candidates: Array<{ action: string; selection: string; path: string }> }>;
      safety: { allowed: boolean; requiredAuthority: string; destructiveActions: string[] };
      summary: { totalCandidates: number; destructiveActions: number };
      persistence: { persisted: boolean; candidateRows: number; actionPlanRows: number };
    }>(stdout.getOutput());

    assert.equal(data.status, "read_only_scan");
    assert.equal(data.fixtureOnly, true);
    assert.equal(data.groups.length, 1);
    assert.equal(data.groups[0]?.candidates[0]?.action, "move_to_trash");
    assert.equal(data.groups[0]?.candidates[0]?.selection, "blocked");
    assert.ok(data.groups[0]?.candidates[0]?.path.startsWith(fixtureRoot));
    assert.equal(data.safety.allowed, false);
    assert.equal(data.safety.requiredAuthority, "signed_host_human_confirmed");
    assert.deepEqual(data.safety.destructiveActions, ["move_to_trash"]);
    assert.equal(data.summary.totalCandidates, 1);
    assert.equal(data.summary.destructiveActions, 1);
    assert.equal(data.persistence.persisted, true);
    assert.equal(data.persistence.candidateRows, 1);
    assert.equal(data.persistence.actionPlanRows, 1);

    const listStdout = captureStream();
    assert.equal(await runCli(["mac-care", "scans", "list", "--json"], {
      stdout: listStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);
    const listData = parseCliJsonPayload<{
      scans: Array<{ id: string; summary: { destructiveActions?: number } }>;
    }>(listStdout.getOutput());
    assert.equal(listData.scans[0]?.id, data.scanId);
    assert.equal(listData.scans[0]?.summary.destructiveActions, 1);

    const showStdout = captureStream();
    assert.equal(await runCli(["mac-care", "scans", "show", data.scanId, "--json"], {
      stdout: showStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);
    const showData = parseCliJsonPayload<{
      candidates: Array<{ action: string; selection: string }>;
      safety: { requiredAuthority: string; destructiveActions: string[] };
      actionPlan: { groups: Array<{ candidates: Array<{ action: string; selection: string }> }> };
    }>(showStdout.getOutput());
    assert.equal(showData.candidates[0]?.action, "move_to_trash");
    assert.equal(showData.candidates[0]?.selection, "blocked");
    assert.equal(showData.safety.requiredAuthority, "signed_host_human_confirmed");
    assert.deepEqual(showData.safety.destructiveActions, ["move_to_trash"]);
    assert.equal(showData.actionPlan.groups[0]?.candidates[0]?.action, "move_to_trash");
  });
});

test("mac-care protection exposes adapter contracts without running external engines", async () => {
  const stdout = captureStream();
  const stderr = captureStream();
  assert.equal(await runCli(["mac-care", "protection", "adapters", "--json"], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  assert.equal(stderr.getOutput(), "");

  const data = parseCliJsonPayload<{
    status: string;
    adapters: Array<{ id: string; executionMode: string; readOnly: boolean; agentCanQuarantine: boolean }>;
  }>(stdout.getOutput());
  assert.equal(data.status, "protection_adapter_contracts");
  assert.ok(data.adapters.some((adapter) => adapter.id === "mac_care.protection.yara_core" && adapter.executionMode === "fixture_only"));
  assert.ok(data.adapters.some((adapter) => adapter.id === "mac_care.protection.clamav_adapter" && adapter.executionMode === "external_engine_required"));
  assert.ok(data.adapters.every((adapter) => adapter.readOnly));
  assert.ok(data.adapters.every((adapter) => adapter.agentCanQuarantine === false));
});

test("mac-care protection engines reports local readiness without scanning or updating databases", async () => {
  const binRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-mac-care-protection-bin-"));
  const clamscan = path.join(binRoot, "clamscan");
  const freshclam = path.join(binRoot, "freshclam");
  fs.writeFileSync(clamscan, "#!/bin/sh\nexit 99\n");
  fs.writeFileSync(freshclam, "#!/bin/sh\nexit 99\n");
  fs.chmodSync(clamscan, 0o755);
  fs.chmodSync(freshclam, 0o755);

  await withPatchedEnv({ PATH: `${binRoot}${path.delimiter}${process.env.PATH ?? ""}` }, async () => {
    const stdout = captureStream();
    const stderr = captureStream();
    assert.equal(await runCli(["mac-care", "protection", "engines", "--json"], {
      stdout: stdout.stream,
      stderr: stderr.stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);
    assert.equal(stderr.getOutput(), "");

    const data = parseCliJsonPayload<{
      status: string;
      engines: Array<{
        adapterId: string;
        runtimeStatus: string;
        databaseStatus: string;
        detectedBinaries: Array<{ name: string; path: string | null; present: boolean }>;
        agentCanScan: boolean;
        agentCanUpdateDatabase: boolean;
        agentCanQuarantine: boolean;
        requiredAuthority: string;
      }>;
      summary: {
        detectedEngines: number;
        agentExecutableScans: number;
        agentDatabaseUpdates: number;
        agentQuarantineActions: number;
      };
    }>(stdout.getOutput());

    const clamav = data.engines.find((engine) => engine.adapterId === "mac_care.protection.clamav_adapter");
    const yara = data.engines.find((engine) => engine.adapterId === "mac_care.protection.yara_core");
    assert.equal(data.status, "protection_engine_readiness");
    assert.equal(clamav?.runtimeStatus, "external_engine_detected");
    assert.equal(clamav?.databaseStatus, "external_update_tool_detected");
    assert.ok(clamav?.detectedBinaries.some((binary) => binary.name === "clamscan" && binary.present && binary.path === clamscan));
    assert.equal(yara?.runtimeStatus, "fixture_only");
    assert.ok(data.engines.every((engine) => engine.agentCanScan === false));
    assert.ok(data.engines.every((engine) => engine.agentCanUpdateDatabase === false));
    assert.ok(data.engines.every((engine) => engine.agentCanQuarantine === false));
    assert.ok(data.engines.every((engine) => engine.requiredAuthority === "signed_host_human_confirmed"));
    assert.equal(data.summary.detectedEngines, 1);
    assert.equal(data.summary.agentExecutableScans, 0);
    assert.equal(data.summary.agentDatabaseUpdates, 0);
    assert.equal(data.summary.agentQuarantineActions, 0);
  });
});

test("mac-care protection approval-ready prepares a non-executing protection approval package", async () => {
  const binRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-mac-care-protection-approval-bin-"));
  const clamscan = path.join(binRoot, "clamscan");
  const freshclam = path.join(binRoot, "freshclam");
  fs.writeFileSync(clamscan, "#!/bin/sh\nexit 99\n");
  fs.writeFileSync(freshclam, "#!/bin/sh\nexit 99\n");
  fs.chmodSync(clamscan, 0o755);
  fs.chmodSync(freshclam, 0o755);

  await withPatchedEnv({ PATH: `${binRoot}${path.delimiter}${process.env.PATH ?? ""}` }, async () => {
    const readinessStdout = captureStream();
    assert.equal(await runCli(["mac-care", "protection", "engines", "--json"], {
      stdout: readinessStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);

    const readinessFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-mac-care-protection-approval-")), "readiness.json");
    fs.writeFileSync(readinessFile, readinessStdout.getOutput());

    const stdout = captureStream();
    const stderr = captureStream();
    assert.equal(await runCli([
      "mac-care",
      "protection",
      "approval-ready",
      "--readiness-file",
      readinessFile,
      "--json",
    ], {
      stdout: stdout.stream,
      stderr: stderr.stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);
    assert.equal(stderr.getOutput(), "");

    const data = parseCliJsonPayload<{
      status: string;
      sourceReadinessStatus: string;
      engines: Array<{
        adapterId: string;
        approvalState: string;
        willScan: boolean;
        willUpdateDatabase: boolean;
        willQuarantine: boolean;
        agentCanScan: boolean;
        agentCanUpdateDatabase: boolean;
        agentCanQuarantine: boolean;
        executionAuthority: string;
        requiredEvidence: string[];
        reentryCondition: string;
      }>;
      summary: {
        totalEngines: number;
        detectedEngines: number;
        scanRequestsIssued: number;
        databaseUpdateRequestsIssued: number;
        quarantineRequestsIssued: number;
        agentExecutableScans: number;
        agentDatabaseUpdates: number;
        agentQuarantineActions: number;
        signedHostRequired: number;
      };
    }>(stdout.getOutput());

    assert.equal(data.status, "protection_approval_ready");
    assert.equal(data.sourceReadinessStatus, "protection_engine_readiness");
    assert.equal(data.engines.length, 2);
    assert.ok(data.engines.some((engine) => engine.adapterId === "mac_care.protection.clamav_adapter"));
    assert.ok(data.engines.every((engine) => engine.approvalState === "not_requested"));
    assert.ok(data.engines.every((engine) => engine.willScan === false));
    assert.ok(data.engines.every((engine) => engine.willUpdateDatabase === false));
    assert.ok(data.engines.every((engine) => engine.willQuarantine === false));
    assert.ok(data.engines.every((engine) => engine.agentCanScan === false));
    assert.ok(data.engines.every((engine) => engine.agentCanUpdateDatabase === false));
    assert.ok(data.engines.every((engine) => engine.agentCanQuarantine === false));
    assert.ok(data.engines.every((engine) => engine.executionAuthority === "signed_host_human_confirmed"));
    assert.ok(data.engines.every((engine) => engine.requiredEvidence.includes("explicit_scan_scope_confirmation")));
    assert.ok(data.engines.every((engine) => engine.reentryCondition.includes("signed host")));
    assert.equal(data.summary.totalEngines, 2);
    assert.equal(data.summary.detectedEngines, 1);
    assert.equal(data.summary.scanRequestsIssued, 0);
    assert.equal(data.summary.databaseUpdateRequestsIssued, 0);
    assert.equal(data.summary.quarantineRequestsIssued, 0);
    assert.equal(data.summary.agentExecutableScans, 0);
    assert.equal(data.summary.agentDatabaseUpdates, 0);
    assert.equal(data.summary.agentQuarantineActions, 0);
    assert.equal(data.summary.signedHostRequired, 2);
  });
});

test("mac-care protection fixture-scan emits blocked quarantine plans for explicit fixtures only", async () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-mac-care-protection-"));
  fs.writeFileSync(path.join(fixtureRoot, "clean.txt"), "clean fixture");
  fs.writeFileSync(path.join(fixtureRoot, "marked.txt"), "fixture MAC_CARE_PROTECTION_FIXTURE_DETECT marker");

  const stdout = captureStream();
  const stderr = captureStream();
  assert.equal(await runCli([
    "mac-care",
    "protection",
    "fixture-scan",
    "--fixture-dir",
    fixtureRoot,
    "--json",
  ], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  assert.equal(stderr.getOutput(), "");

  const data = parseCliJsonPayload<{
    status: string;
    adapterId: string;
    fixtureDir: string;
    findings: Array<{ displayName: string; action: string; selection: string; warnings: string[] }>;
    actionPlan: { executionAuthority: string; groups: Array<{ candidates: Array<{ action: string; selection: string }> }> };
    safety: { allowed: boolean; requiredAuthority: string; destructiveActions: string[] };
    summary: { totalFindings: number; quarantineActions: number; agentQuarantineActions: number };
  }>(stdout.getOutput());

  assert.equal(data.status, "protection_fixture_scan");
  assert.equal(data.adapterId, "mac_care.protection.yara_core");
  assert.equal(data.fixtureDir, fixtureRoot);
  assert.equal(data.findings.length, 1);
  assert.equal(data.findings[0]?.displayName, "marked.txt");
  assert.equal(data.findings[0]?.action, "quarantine");
  assert.equal(data.findings[0]?.selection, "blocked");
  assert.ok(data.findings[0]?.warnings.includes("fixture_only_detection"));
  assert.equal(data.actionPlan.executionAuthority, "agent_plan_only");
  assert.ok(data.actionPlan.groups.every((group) => group.candidates.every((candidate) => candidate.action === "quarantine" && candidate.selection === "blocked")));
  assert.equal(data.safety.allowed, false);
  assert.equal(data.safety.requiredAuthority, "signed_host_human_confirmed");
  assert.deepEqual(data.safety.destructiveActions, ["quarantine"]);
  assert.equal(data.summary.totalFindings, 1);
  assert.equal(data.summary.quarantineActions, 1);
  assert.equal(data.summary.agentQuarantineActions, 0);
});

test("mac-care scans list is read-only when the sidecar does not exist", async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-mac-care-empty-history-"));
  await withPatchedEnv({ CLAW_DATA_DIR: dataRoot }, async () => {
    const stdout = captureStream();
    assert.equal(await runCli(["mac-care", "scans", "list", "--json"], {
      stdout: stdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);

    const data = parseCliJsonPayload<{ scans: unknown[] }>(stdout.getOutput());
    assert.deepEqual(data.scans, []);
    assert.equal(fs.existsSync(path.join(dataRoot, "mac_care.sqlite")), false);
  });
});

test("mac-care scan requires an explicit home path", async () => {
  const stdout = captureStream();
  assert.equal(await runCli(["mac-care", "scan", "--json"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_USAGE);

  const parsed = JSON.parse(stdout.getOutput()) as { ok: boolean; error: { code: string } };
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error.code, "missing_mac_care_home");
});

test("mac-care unknown subcommands fail without executing mutations", async () => {
  const stdout = captureStream();
  assert.equal(await runCli(["mac-care", "delete", "--json"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_USAGE);

  const parsed = JSON.parse(stdout.getOutput()) as { ok: boolean; error: { code: string } };
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error.code, "unknown_mac_care_command");
});
