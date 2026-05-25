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
  const preview = parseCliJsonPayload<{ accepted: boolean; writes: Array<{ action: string }>; manifest: { projectId: string } }>(previewStdout.getOutput());
  assert.equal(preview.accepted, false);
  assert.equal(preview.manifest.projectId, "mobile-app");
  assert.equal(fs.existsSync(path.join(folder, "claw.project.json")), false);
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
  assert.deepEqual(payload.error.details.validSubcommands, ["inspect", "attach", "detach", "export", "import", "sync-handoff"]);
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
  assert.match(textStderr.getOutput(), /Usage: claw project inspect\|attach\|detach\|export\|import\|sync-handoff \[folder\] \[--json\]/);
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
