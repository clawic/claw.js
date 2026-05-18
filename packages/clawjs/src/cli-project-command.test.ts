import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { test } from "vitest";

import { CLI_EXIT_OK, runCli } from "./index.ts";
import { captureStream, parseCliJsonPayload } from "./index-test-utils.ts";

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
  const exportStdout = captureStream();
  assert.equal(await runCli(["project", "export", folder, "--output", output, "--json"], {
    stdout: exportStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const exported = parseCliJsonPayload<{ output: string; handoff: { safety: { includesSecrets: boolean; includesSensitiveMemory: boolean; folderLocationGrantsAuthority: boolean } } }>(exportStdout.getOutput());
  assert.equal(exported.output, output);
  assert.deepEqual(exported.handoff.safety, {
    includesSecrets: false,
    includesSensitiveMemory: false,
    folderLocationGrantsAuthority: false,
  });
  assert.match(fs.readFileSync(output, "utf8"), /claw.project.handoff/);
  assert.doesNotMatch(fs.readFileSync(output, "utf8"), /token|password|credential/i);
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
  assert.equal(await runCli(["project", "export", folder, "--json"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);

  assert.equal(fs.existsSync(path.join(folder, ".claw")), false);
});
