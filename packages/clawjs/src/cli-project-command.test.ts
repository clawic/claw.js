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
