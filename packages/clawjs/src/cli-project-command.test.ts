import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { test } from "vitest";

import { CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE, runCli } from "./index.ts";
import { captureStream, parseCliJsonPayload, useIsolatedClawDataRoot } from "./index-test-utils.ts";

test("claw project attach previews then writes portable manifest and handoff shims", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-project-manifest-"));
  const folder = path.join(cwd, "Mobile App");
  fs.mkdirSync(folder, { recursive: true });

  const previewStdout = captureStream();
  assert.equal(await runCli([
    "project",
    "attach",
    folder,
    "--workspace-id",
    "workspace-main",
    "--project-id",
    "mobile-app",
    "--name",
    "mobile-app",
    "--json",
  ], {
    stdout: previewStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const preview = parseCliJsonPayload<{ accepted: boolean; writes: Array<{ action: string }>; manifest: { projectId: string }; versionHistory: { existingGitDetected: boolean; enabledByDefault: boolean; willEnableOnAttach: boolean; mode: string } }>(previewStdout.getOutput());
  assert.equal(preview.accepted, false);
  assert.equal(preview.manifest.projectId, "mobile-app");
  assert.deepEqual(preview.versionHistory, {
    existingGitDetected: false,
    enabledByDefault: false,
    willEnableOnAttach: false,
    mode: "off_until_explicit_opt_in",
  });
  assert.equal(fs.existsSync(path.join(folder, "claw.project.json")), false);
  assert.equal(fs.existsSync(path.join(folder, ".git")), false);
  assert.equal(preview.writes.filter((entry) => entry.action === "create").length, 3);

  const attachStdout = captureStream();
  assert.equal(await runCli([
    "project",
    "attach",
    folder,
    "--workspace-id",
    "workspace-main",
    "--project-id",
    "mobile-app",
    "--name",
    "mobile-app",
    "--accept",
    "--json",
  ], {
    stdout: attachStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const attached = parseCliJsonPayload<{ accepted: boolean; manifest: { projectId: string; attachment: { state: string; workspaceId: string }; primaryFolder: { path: string } } }>(attachStdout.getOutput());
  assert.equal(attached.accepted, true);
  assert.equal(attached.manifest.projectId, "mobile-app");
  assert.deepEqual(attached.manifest.attachment, { state: "attached", workspaceId: "workspace-main" });
  assert.equal(attached.manifest.primaryFolder.path, ".");
  assert.match(fs.readFileSync(path.join(folder, "AGENTS.md"), "utf8"), /folder is a Claw Project primary folder/);
  assert.match(fs.readFileSync(path.join(folder, "CLAUDE.md"), "utf8"), /Read `AGENTS.md` first/);

  const inspectStdout = captureStream();
  assert.equal(await runCli(["project", "inspect", folder, "--json"], {
    stdout: inspectStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const inspected = parseCliJsonPayload<{ state: string; manifest: { projectId: string }; agentsManaged: boolean; claudeShim: boolean }>(inspectStdout.getOutput());
  assert.equal(inspected.state, "attached");
  assert.equal(inspected.manifest.projectId, "mobile-app");
  assert.equal(inspected.agentsManaged, true);
  assert.equal(inspected.claudeShim, true);
});

test("claw project attach detects existing Git without rewriting repository files", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-project-existing-git-"));
  const folder = path.join(cwd, "git-project");
  const gitDir = path.join(folder, ".git");
  fs.mkdirSync(gitDir, { recursive: true });
  const gitConfigPath = path.join(gitDir, "config");
  const headPath = path.join(gitDir, "HEAD");
  fs.writeFileSync(gitConfigPath, "[remote \"origin\"]\n\turl = git@example.invalid:demo/repo.git\n", "utf8");
  fs.writeFileSync(headPath, "ref: refs/heads/main\n", "utf8");

  const previewStdout = captureStream();
  assert.equal(await runCli([
    "project",
    "attach",
    folder,
    "--workspace-id",
    "workspace-main",
    "--project-id",
    "git-project",
    "--json",
  ], {
    stdout: previewStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const preview = parseCliJsonPayload<{ accepted: boolean; versionHistory: { existingGitDetected: boolean; enabledByDefault: boolean; willEnableOnAttach: boolean; mode: string } }>(previewStdout.getOutput());
  assert.equal(preview.accepted, false);
  assert.deepEqual(preview.versionHistory, {
    existingGitDetected: true,
    enabledByDefault: false,
    willEnableOnAttach: false,
    mode: "existing_git_detected",
  });
  assert.equal(fs.readFileSync(gitConfigPath, "utf8"), "[remote \"origin\"]\n\turl = git@example.invalid:demo/repo.git\n");
  assert.equal(fs.readFileSync(headPath, "utf8"), "ref: refs/heads/main\n");
  assert.equal(fs.existsSync(path.join(folder, "claw.project.json")), false);
});

test("claw project attach honors explicit false accept flags", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-project-accept-false-"));
  const folder = path.join(cwd, "project");
  fs.mkdirSync(folder, { recursive: true });

  const stdout = captureStream();
  assert.equal(await runCli([
    "project",
    "attach",
    folder,
    "--workspace-id",
    "workspace-main",
    "--project-id",
    "preview-only",
    "--accept",
    "false",
    "--json",
  ], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const preview = parseCliJsonPayload<{ accepted: boolean }>(stdout.getOutput());
  assert.equal(preview.accepted, false);
  assert.equal(fs.existsSync(path.join(folder, "claw.project.json")), false);

  const invalidStdout = captureStream();
  assert.equal(await runCli([
    "project",
    "attach",
    folder,
    "--workspace-id",
    "workspace-main",
    "--accept",
    "sometimes",
    "--json",
  ], {
    stdout: invalidStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_USAGE);
  const invalid = JSON.parse(invalidStdout.getOutput()) as { error: { code: string; status: string } };
  assert.equal(invalid.error.code, "invalid_boolean_flag");
  assert.equal(invalid.error.status, "USAGE");
  assert.equal(fs.existsSync(path.join(folder, "claw.project.json")), false);
});

test("claw project returns JSON usage errors for unknown subcommands without writing state", { concurrency: false }, async (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-project-unknown-"));
  const dataRoot = useIsolatedClawDataRoot(t, cwd);
  const folder = path.join(cwd, "project");
  fs.mkdirSync(folder, { recursive: true });

  const stdout = captureStream();
  const stderr = captureStream();
  assert.equal(await runCli(["project", "definitely_missing", folder, "--json"], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    cwd,
  }), CLI_EXIT_USAGE);
  assert.equal(stderr.getOutput(), "");

  const payload = JSON.parse(stdout.getOutput()) as {
    ok: boolean;
    error: {
      code: string;
      status: string;
      location: string;
      safeNextStep: string;
      details: {
        received: string;
        validSubcommands: string[];
      };
    };
  };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "unknown_project_subcommand");
  assert.equal(payload.error.status, "USAGE");
  assert.equal(payload.error.location, "cli.project.subcommand");
  assert.equal(payload.error.details.received, "definitely_missing");
  assert.deepEqual(payload.error.details.validSubcommands, ["inspect", "attach", "detach", "export", "import", "sync-handoff", "preflight", "worktree", "claim", "snapshot", "review", "merge-plan", "recover", "forge-status"]);
  assert.match(payload.error.safeNextStep, /claw project inspect --json/);
  assert.match(payload.error.safeNextStep, /claw help project --json/);
  assert.equal(fs.existsSync(path.join(folder, "claw.project.json")), false);
  assert.equal(fs.existsSync(path.join(folder, "AGENTS.md")), false);
  assert.equal(fs.existsSync(path.join(folder, "CLAUDE.md")), false);
  assert.equal(fs.existsSync(dataRoot), false);

  const textStdout = captureStream();
  const textStderr = captureStream();
  assert.equal(await runCli(["project", "definitely_missing", folder], {
    stdout: textStdout.stream,
    stderr: textStderr.stream,
    cwd,
  }), CLI_EXIT_USAGE);
  assert.equal(textStdout.getOutput(), "");
  assert.match(textStderr.getOutput(), /Usage: claw project inspect\|attach\|detach\|export\|import\|sync-handoff\|preflight\|worktree\|claim\|snapshot\|review\|merge-plan\|recover\|forge-status \[folder\] \[--json\]/);
});

test("claw project detach and export keep folder data while producing safe handoff", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-project-handoff-"));
  const folder = path.join(cwd, "project");
  fs.mkdirSync(folder, { recursive: true });

  assert.equal(await runCli(["project", "attach", folder, "--workspace-id", "workspace-main", "--accept", "--json"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);

  const detachStdout = captureStream();
  assert.equal(await runCli(["project", "detach", folder, "--reason", "finder-copy", "--json"], {
    stdout: detachStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const detached = parseCliJsonPayload<{ manifest: { attachment: { state: string; detachedReason: string } } }>(detachStdout.getOutput());
  assert.deepEqual(detached.manifest.attachment, { state: "detached", detachedReason: "finder-copy" });
  assert.equal(fs.existsSync(folder), true);

  const output = path.join(cwd, "handoff.clawexport");
  const blockedExport = await runCli(["project", "export", folder, "--output", output, "--json"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd,
  });
  assert.equal(blockedExport, CLI_EXIT_FAILURE);

  const exportStdout = captureStream();
  assert.equal(await runCli([
    "project",
    "export",
    folder,
    "--output",
    output,
    "--confirm",
    "--approval-id",
    "approval_project_export",
    "--legal-label",
    "Project handoff - human reviewed",
    "--json",
  ], {
    stdout: exportStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const exported = parseCliJsonPayload<{ output: string; handoff: { safety: { includesSecrets: boolean; includesSensitiveMemory: boolean; folderLocationGrantsAuthority: boolean }; legal: { approvalId: string; legalLabel: string; exportKind: string; policy: { decision: string; reasonCodes: string[]; requirements: string[]; outputLabels: string[] } } } }>(exportStdout.getOutput());
  assert.equal(exported.output, output);
  assert.deepEqual(exported.handoff.safety, {
    includesSecrets: false,
    includesSensitiveMemory: false,
    folderLocationGrantsAuthority: false,
  });
  assert.equal(exported.handoff.legal.approvalId, "approval_project_export");
  assert.equal(exported.handoff.legal.legalLabel, "Project handoff - human reviewed");
  assert.equal(exported.handoff.legal.exportKind, "project.handoff");
  assert.equal(exported.handoff.legal.policy.decision, "allow");
  assert.equal(exported.handoff.legal.policy.reasonCodes.includes("sensitive_export_review_required"), true);
  assert.equal(exported.handoff.legal.policy.requirements.includes("human_review"), true);
  assert.equal(exported.handoff.legal.policy.outputLabels.includes("regulated_domain:identity"), true);
  assert.match(fs.readFileSync(output, "utf8"), /claw.project.handoff/);
  assert.doesNotMatch(fs.readFileSync(output, "utf8"), /token|password|credential/i);
});

test("claw project export rejects output paths outside the workspace", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-project-export-path-"));
  const folder = path.join(cwd, "project");
  fs.mkdirSync(folder, { recursive: true });

  assert.equal(await runCli(["project", "attach", folder, "--workspace-id", "workspace-main", "--accept", "--json"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);

  const escapedOutput = path.join(path.dirname(cwd), `${path.basename(cwd)}.clawexport`);
  const stdout = captureStream();
  assert.equal(await runCli([
    "project",
    "export",
    folder,
    "--output",
    `../${path.basename(escapedOutput)}`,
    "--confirm",
    "--approval-id",
    "approval_project_export_path",
    "--legal-label",
    "Project export path reviewed",
    "--json",
  ], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_USAGE);

  const payload = JSON.parse(stdout.getOutput()) as { error: { code: string; status: string } };
  assert.equal(payload.error.code, "invalid_project_output_path");
  assert.equal(payload.error.status, "USAGE");
  assert.equal(fs.existsSync(escapedOutput), false);
});

test("claw project import previews and restores safe handoff into a new workspace", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-project-import-"));
  const source = path.join(cwd, "source-project");
  const target = path.join(cwd, "target-project");
  fs.mkdirSync(source, { recursive: true });
  fs.mkdirSync(target, { recursive: true });

  assert.equal(await runCli([
    "project",
    "attach",
    source,
    "--workspace-id",
    "workspace-main",
    "--project-id",
    "portable-project",
    "--accept",
    "--json",
  ], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);

  const output = path.join(cwd, "portable-project.clawexport");
  assert.equal(await runCli([
    "project",
    "export",
    source,
    "--output",
    output,
    "--confirm",
    "--approval-id",
    "approval_project_import_fixture",
    "--legal-label",
    "Project import fixture - human reviewed",
    "--json",
  ], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);

  const previewStdout = captureStream();
  assert.equal(await runCli([
    "project",
    "import",
    output,
    target,
    "--workspace-id",
    "workspace-other",
    "--json",
  ], {
    stdout: previewStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const preview = parseCliJsonPayload<{ accepted: boolean; handoffKind: string; manifest: { projectId: string } }>(previewStdout.getOutput());
  assert.equal(preview.accepted, false);
  assert.equal(preview.handoffKind, "claw.project.handoff");
  assert.equal(preview.manifest.projectId, "portable-project");
  assert.equal(fs.existsSync(path.join(target, "claw.project.json")), false);

  const importStdout = captureStream();
  assert.equal(await runCli([
    "project",
    "import",
    output,
    target,
    "--workspace-id",
    "workspace-other",
    "--accept",
    "--json",
  ], {
    stdout: importStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const imported = parseCliJsonPayload<{ accepted: boolean; manifest: { projectId: string; attachment: { state: string; workspaceId: string }; workspaceBinding: { workspaceId: string } } }>(importStdout.getOutput());
  assert.equal(imported.accepted, true);
  assert.equal(imported.manifest.projectId, "portable-project");
  assert.deepEqual(imported.manifest.attachment, { state: "attached", workspaceId: "workspace-other" });
  assert.deepEqual(imported.manifest.workspaceBinding, { workspaceId: "workspace-other" });
  assert.match(fs.readFileSync(path.join(target, "AGENTS.md"), "utf8"), /folder is a Claw Project primary folder/);
  assert.equal(fs.existsSync(path.join(target, ".claw")), false);
});

test("claw project copy into another workspace stays detached until explicitly replaced", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-project-copy-"));
  const folder = path.join(cwd, "copied-project");
  fs.mkdirSync(folder, { recursive: true });

  assert.equal(await runCli([
    "project",
    "attach",
    folder,
    "--workspace-id",
    "workspace-main",
    "--project-id",
    "copied-project",
    "--accept",
    "--json",
  ], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);

  const duplicateInspectStdout = captureStream();
  assert.equal(await runCli([
    "project",
    "inspect",
    folder,
    "--workspace-id",
    "workspace-other",
    "--json",
  ], {
    stdout: duplicateInspectStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const duplicateInspection = parseCliJsonPayload<{ state: string; warnings: string[] }>(duplicateInspectStdout.getOutput());
  assert.equal(duplicateInspection.state, "duplicate");
  assert.equal(duplicateInspection.warnings.includes("duplicate_project_id_attached_to_different_workspace"), true);

  const attachCopyStdout = captureStream();
  assert.equal(await runCli([
    "project",
    "attach",
    folder,
    "--workspace-id",
    "workspace-other",
    "--accept",
    "--json",
  ], {
    stdout: attachCopyStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const attachCopy = parseCliJsonPayload<{ warnings: string[]; manifest: { attachment: { state: string; detachedReason: string }; workspaceBinding?: unknown } }>(attachCopyStdout.getOutput());
  assert.equal(attachCopy.warnings.includes("duplicate_project_id_attached_to_different_workspace"), true);
  assert.deepEqual(attachCopy.manifest.attachment, {
    state: "detached",
    detachedReason: "duplicate_project_id_attached_to_different_workspace",
  });
  assert.equal(attachCopy.manifest.workspaceBinding, undefined);

  const replaceStdout = captureStream();
  assert.equal(await runCli([
    "project",
    "attach",
    folder,
    "--workspace-id",
    "workspace-other",
    "--replace",
    "--accept",
    "--json",
  ], {
    stdout: replaceStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const replaced = parseCliJsonPayload<{ manifest: { attachment: { state: string; workspaceId: string }; workspaceBinding: { workspaceId: string } } }>(replaceStdout.getOutput());
  assert.deepEqual(replaced.manifest.attachment, { state: "attached", workspaceId: "workspace-other" });
  assert.deepEqual(replaced.manifest.workspaceBinding, { workspaceId: "workspace-other" });
});

test("claw project commands never create a workspace .claw directory in project folders", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-project-no-claw-"));
  const folder = path.join(cwd, "project");
  fs.mkdirSync(folder, { recursive: true });

  assert.equal(await runCli(["project", "attach", folder, "--workspace-id", "workspace-main", "--accept", "--json"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  assert.equal(await runCli(["project", "sync-handoff", folder, "--json"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  assert.equal(await runCli([
    "project",
    "export",
    folder,
    "--confirm",
    "--approval-id",
    "approval_project_no_claw",
    "--legal-label",
    "Project no-claw export - human reviewed",
    "--json",
  ], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);

  assert.equal(fs.existsSync(path.join(folder, ".claw")), false);
});

test("claw project local forge records worktrees and exposes checkout location without mutating the project", { concurrency: false }, async (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-project-forge-worktree-"));
  const dataRoot = useIsolatedClawDataRoot(t, cwd);
  const folder = path.join(cwd, "portable-project");
  fs.mkdirSync(path.join(folder, "src"), { recursive: true });
  fs.writeFileSync(path.join(folder, "src", "index.ts"), "export const value = 1;\n", "utf8");

  const previewStdout = captureStream();
  assert.equal(await runCli(["project", "worktree", folder, "--data-dir", dataRoot, "--json"], {
    stdout: previewStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const preview = parseCliJsonPayload<{ accepted: boolean; worktree: { projectId: string; worktreeId: string } }>(previewStdout.getOutput());
  assert.equal(preview.accepted, false);
  assert.equal(fs.existsSync(path.join(dataRoot, "local-forge", "local-forge-state.json")), false);
  assert.equal(fs.existsSync(path.join(folder, ".git")), false);
  assert.equal(fs.existsSync(path.join(folder, ".claw")), false);

  const recordStdout = captureStream();
  assert.equal(await runCli(["project", "worktree", folder, "--data-dir", dataRoot, "--accept", "--node-id", "node.local", "--json"], {
    stdout: recordStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const recorded = parseCliJsonPayload<{ accepted: boolean; worktree: { projectId: string; worktreeId: string; nodeCheckout: { nodeId: string }; checkoutLocator: { authority: boolean; mutable: boolean } } }>(recordStdout.getOutput());
  assert.equal(recorded.accepted, true);
  assert.equal(recorded.worktree.nodeCheckout.nodeId, "node.local");
  assert.equal(recorded.worktree.checkoutLocator.authority, false);
  assert.equal(recorded.worktree.checkoutLocator.mutable, true);
  assert.equal(fs.existsSync(path.join(folder, ".git")), false);
  assert.equal(fs.existsSync(path.join(folder, ".claw")), false);

  const getStdout = captureStream();
  assert.equal(await runCli(["get", "worktrees", "--data-dir", dataRoot, "--json"], {
    stdout: getStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const getWorktrees = parseCliJsonPayload<{ status: string; items: Array<{ worktreeId: string }> }>(getStdout.getOutput());
  assert.equal(getWorktrees.status, "ok");
  assert.deepEqual(getWorktrees.items.map((item) => item.worktreeId), [recorded.worktree.worktreeId]);

  const whereStdout = captureStream();
  assert.equal(await runCli(["where", "project", recorded.worktree.projectId, "--data-dir", dataRoot, "--json"], {
    stdout: whereStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const where = parseCliJsonPayload<{ status: string; checkouts: Array<{ worktreeId: string; authorityService: { serviceId: string; externalProviderAuthority: boolean } }> }>(whereStdout.getOutput());
  assert.equal(where.status, "ok");
  assert.equal(where.checkouts[0]?.worktreeId, recorded.worktree.worktreeId);
  assert.equal(where.checkouts[0]?.authorityService.serviceId, "local.forge");
  assert.equal(where.checkouts[0]?.authorityService.externalProviderAuthority, false);
});

test("claw project local forge preflight excludes private files and records claims snapshots reviews and recovery", { concurrency: false }, async (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-project-forge-review-"));
  const dataRoot = useIsolatedClawDataRoot(t, cwd);
  const folder = path.join(cwd, "review-project");
  fs.mkdirSync(path.join(folder, "src"), { recursive: true });
  fs.mkdirSync(path.join(folder, "node_modules", "dep"), { recursive: true });
  fs.writeFileSync(path.join(folder, "src", "index.ts"), "export const value = 1;\n", "utf8");
  fs.writeFileSync(path.join(folder, ".env"), "REDACTED_ENV_FIXTURE=1\n", "utf8");
  fs.writeFileSync(path.join(folder, "large.bin"), Buffer.alloc(10 * 1024 * 1024 + 1));
  fs.writeFileSync(path.join(folder, "node_modules", "dep", "index.js"), "module.exports = 1;\n", "utf8");

  const preflightStdout = captureStream();
  assert.equal(await runCli(["project", "preflight", folder, "--json"], {
    stdout: preflightStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const preflight = parseCliJsonPayload<{ status: string; includedFiles: Array<{ path: string }>; findings: Array<{ path: string; kind: string; action: string }> }>(preflightStdout.getOutput());
  assert.equal(preflight.status, "attention_required");
  assert.deepEqual(preflight.includedFiles.map((file) => file.path), ["src/index.ts"]);
  assert.equal(preflight.findings.some((finding) => finding.path === ".env" && finding.kind === "secret_like" && finding.action === "block"), true);
  assert.equal(preflight.findings.some((finding) => finding.path === "large.bin" && finding.kind === "large_file" && finding.action === "block"), true);
  assert.equal(preflight.findings.some((finding) => finding.path === "node_modules/" && finding.kind === "dependency" && finding.action === "exclude"), true);

  const claimAStdout = captureStream();
  assert.equal(await runCli(["project", "claim", folder, "--data-dir", dataRoot, "--accept", "--task", "edit docs", "--agent-id", "agent.a", "--json"], {
    stdout: claimAStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const claimA = parseCliJsonPayload<{ claim: { claimId: string; exclusive: boolean; status: string } }>(claimAStdout.getOutput());
  assert.equal(claimA.claim.exclusive, false);
  assert.equal(claimA.claim.status, "active");

  const claimBStdout = captureStream();
  assert.equal(await runCli(["project", "claim", folder, "--data-dir", dataRoot, "--accept", "--task", "edit tests", "--agent-id", "agent.b", "--json"], {
    stdout: claimBStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const claimB = parseCliJsonPayload<{ claim: { exclusive: boolean; status: string } }>(claimBStdout.getOutput());
  assert.equal(claimB.claim.exclusive, false);
  assert.equal(claimB.claim.status, "active");

  const lockStdout = captureStream();
  assert.equal(await runCli(["project", "claim", folder, "--data-dir", dataRoot, "--accept", "--exclusive", "--task", "risky refactor", "--agent-id", "agent.c", "--json"], {
    stdout: lockStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_USAGE);
  const lock = JSON.parse(lockStdout.getOutput()) as { error: { code: string; details: { conflicts: unknown[] } } };
  assert.equal(lock.error.code, "local_forge_claim_lock_conflict");
  assert.equal(lock.error.details.conflicts.length, 2);

  const snapshotStdout = captureStream();
  assert.equal(await runCli(["project", "snapshot", folder, "--data-dir", dataRoot, "--accept", "--reason", "before risky edit", "--json"], {
    stdout: snapshotStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const snapshot = parseCliJsonPayload<{ snapshot: { snapshotId: string; status: string; files: Array<{ path: string }>; blockedPaths: string[]; excludedPaths: string[] } }>(snapshotStdout.getOutput());
  assert.equal(snapshot.snapshot.status, "attention_required");
  assert.deepEqual(snapshot.snapshot.files.map((file) => file.path), ["src/index.ts"]);
  assert.equal(snapshot.snapshot.blockedPaths.includes(".env"), true);
  assert.equal(snapshot.snapshot.blockedPaths.includes("large.bin"), true);
  assert.equal(snapshot.snapshot.excludedPaths.includes("node_modules/"), true);

  const reviewStdout = captureStream();
  assert.equal(await runCli(["project", "review", folder, "--data-dir", dataRoot, "--accept", "--claim-id", claimA.claim.claimId, "--snapshot-id", snapshot.snapshot.snapshotId, "--tests-run", "unit,privacy", "--risks", "needs human review", "--json"], {
    stdout: reviewStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const review = parseCliJsonPayload<{ review: { testsRun: string[]; diffSummary: { includedPaths: string[]; blockedPaths: string[]; excludedPaths: string[] } } }>(reviewStdout.getOutput());
  assert.deepEqual(review.review.testsRun, ["unit", "privacy"]);
  assert.deepEqual(review.review.diffSummary.includedPaths, ["src/index.ts"]);
  assert.equal(review.review.diffSummary.blockedPaths.includes(".env"), true);
  assert.equal(review.review.diffSummary.blockedPaths.includes("large.bin"), true);
  assert.equal(review.review.diffSummary.excludedPaths.includes("node_modules/"), true);

  fs.writeFileSync(path.join(folder, "src", "index.ts"), "export const value = 2;\n", "utf8");
  const proposedSnapshotStdout = captureStream();
  assert.equal(await runCli(["project", "snapshot", folder, "--data-dir", dataRoot, "--accept", "--reason", "after risky edit", "--json"], {
    stdout: proposedSnapshotStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const proposedSnapshot = parseCliJsonPayload<{ snapshot: { snapshotId: string } }>(proposedSnapshotStdout.getOutput());
  const mergePlanStdout = captureStream();
  assert.equal(await runCli(["project", "merge-plan", folder, "--data-dir", dataRoot, "--accept", "--base-snapshot-id", snapshot.snapshot.snapshotId, "--proposed-snapshot-id", proposedSnapshot.snapshot.snapshotId, "--json"], {
    stdout: mergePlanStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const mergePlan = parseCliJsonPayload<{ mergePlan: { conflictPolicy: string; status: string; noProjectMutation: boolean; conflicts: Array<{ path: string; resolution: string }> } }>(mergePlanStdout.getOutput());
  assert.equal(mergePlan.mergePlan.conflictPolicy, "detect_and_elevate");
  assert.equal(mergePlan.mergePlan.status, "blocked_conflicts");
  assert.equal(mergePlan.mergePlan.noProjectMutation, true);
  assert.deepEqual(mergePlan.mergePlan.conflicts.map((conflict) => [conflict.path, conflict.resolution]), [["src/index.ts", "human_review_required"]]);

  const recoveryStdout = captureStream();
  assert.equal(await runCli(["project", "recover", folder, "--data-dir", dataRoot, "--accept", "--claim-id", claimA.claim.claimId, "--action", "abandon", "--json"], {
    stdout: recoveryStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const recovery = parseCliJsonPayload<{ recovery: { action: string; noIrreversibleDataLoss: boolean; mutationPolicy: string } }>(recoveryStdout.getOutput());
  assert.equal(recovery.recovery.action, "abandon");
  assert.equal(recovery.recovery.noIrreversibleDataLoss, true);
  assert.equal(recovery.recovery.mutationPolicy, "metadata_only");

  const statusStdout = captureStream();
  assert.equal(await runCli(["project", "forge-status", "--data-dir", dataRoot, "--project-id", snapshot.snapshot.snapshotId.replace(/^snapshot_/, "missing-"), "--json"], {
    stdout: statusStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const stateText = fs.readFileSync(path.join(dataRoot, "local-forge", "local-forge-state.json"), "utf8");
  assert.doesNotMatch(stateText, /REDACTED_ENV_FIXTURE=1/);
});

test("claw project forge-status can mark stale local forge claims by explicit threshold", { concurrency: false }, async (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-project-forge-stale-"));
  const dataRoot = useIsolatedClawDataRoot(t, cwd);
  const folder = path.join(cwd, "stale-project");
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, "README.md"), "stale test\n", "utf8");

  const claimStdout = captureStream();
  assert.equal(await runCli(["project", "claim", folder, "--data-dir", dataRoot, "--accept", "--task", "stale work", "--agent-id", "agent.stale", "--json"], {
    stdout: claimStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const claim = parseCliJsonPayload<{ claim: { claimId: string; projectId: string } }>(claimStdout.getOutput());
  const statePath = path.join(dataRoot, "local-forge", "local-forge-state.json");
  const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as { claims: Record<string, { heartbeatAt: string; status: string }> };
  state.claims[claim.claim.claimId] = {
    ...state.claims[claim.claim.claimId],
    heartbeatAt: "2026-01-01T00:00:00.000Z",
  };
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");

  const previewStdout = captureStream();
  assert.equal(await runCli(["project", "forge-status", "--data-dir", dataRoot, "--project-id", claim.claim.projectId, "--stale-after-minutes", "60", "--json"], {
    stdout: previewStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const preview = parseCliJsonPayload<{ staleEvaluation: { accepted: boolean; writes: boolean; staleClaims: Array<{ claimId: string; status: string }> }; claims: Array<{ status: string }> }>(previewStdout.getOutput());
  assert.equal(preview.staleEvaluation.accepted, false);
  assert.equal(preview.staleEvaluation.writes, false);
  assert.deepEqual(preview.staleEvaluation.staleClaims.map((entry) => entry.claimId), [claim.claim.claimId]);
  assert.equal(preview.claims[0]?.status, "active");

  const markStdout = captureStream();
  assert.equal(await runCli(["project", "forge-status", "--data-dir", dataRoot, "--project-id", claim.claim.projectId, "--stale-after-minutes", "60", "--mark-stale", "--accept", "--json"], {
    stdout: markStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const marked = parseCliJsonPayload<{ staleEvaluation: { accepted: boolean; writes: boolean; staleClaims: Array<{ status: string }> }; claims: Array<{ status: string }> }>(markStdout.getOutput());
  assert.equal(marked.staleEvaluation.accepted, true);
  assert.equal(marked.staleEvaluation.writes, true);
  assert.equal(marked.staleEvaluation.staleClaims[0]?.status, "stale");
  assert.equal(marked.claims[0]?.status, "stale");
});
