import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { resolveClawWorkspaceSurfacePath } from "../surface-paths.ts";
import {
  attachWorkspace,
  buildWorkspaceResetPlan,
  initializeWorkspace,
  inspectManagedWorkspaceFile,
  inspectWorkspaceFile,
  listManagedFiles,
  repairWorkspace,
  previewWorkspaceFile,
  readWorkspaceFile,
  resetWorkspace,
  resolveRuntimeFilePath,
  resolveWorkspaceLockPath,
  writeWorkspaceFile,
  writeWorkspaceFilePreservingManagedBlocks,
  validateWorkspace,
} from "./manager.ts";
import { NodeFileSystemHost } from "../host/filesystem.ts";
import { readCompatSnapshot, resolveCompatSnapshotPath } from "../compat/store.ts";

test("initializeWorkspace creates manifest, runtime files and internal directories", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-workspace-manager-"));
  const manifest = initializeWorkspace({
    appId: "demo",
    workspaceId: "demo-main",
    agentId: "demo-main",
    rootDir: workspaceDir,
  }, "openclaw");

  assert.equal(attachWorkspace(workspaceDir)?.workspaceId, manifest.workspaceId);
  assert.equal(validateWorkspace(workspaceDir).missingFiles.length, 0);
  assert.equal(validateWorkspace(workspaceDir).missingDirectories.length, 0);
  assert.equal(validateWorkspace(workspaceDir).ok, true);
  assert.equal(fs.existsSync(resolveClawWorkspaceSurfacePath("claw.workspace.observedState", workspaceDir)), true);
  assert.equal(fs.existsSync(resolveClawWorkspaceSurfacePath("claw.workspace.projections", workspaceDir)), true);
  assert.equal(fs.existsSync(resolveClawWorkspaceSurfacePath("claw.workspace.intents", workspaceDir)), true);
});

test("listManagedFiles and resetWorkspace only target ClawJS-managed paths", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-workspace-reset-"));
  initializeWorkspace({
    appId: "demo",
    workspaceId: "demo-main",
    agentId: "demo-main",
    rootDir: workspaceDir,
  }, "openclaw");

  const managedFiles = listManagedFiles(workspaceDir);
  assert.equal(managedFiles.length, 6);
  const soulPath = resolveRuntimeFilePath(workspaceDir, "SOUL.md");
  const userNotesPath = path.join(workspaceDir, "notes.md");
  fs.writeFileSync(userNotesPath, "keep me\n");
  assert.equal(managedFiles.includes(soulPath), true);

  const resetPlan = buildWorkspaceResetPlan(workspaceDir, { removeRuntimeFiles: true });
  assert.equal(resetPlan.targets.some((target) => target.path === soulPath && target.exists), true);

  const resetResult = resetWorkspace(workspaceDir, { removeRuntimeFiles: true });
  assert.equal(resetResult.removedPaths.includes(soulPath), true);
  assert.equal(resetResult.preservedPaths.includes(resolveClawWorkspaceSurfacePath("claw.workspace.compat", workspaceDir)), false);
  assert.equal(fs.existsSync(soulPath), false);
  assert.equal(fs.existsSync(userNotesPath), true);
});

test("resetWorkspace can fully clear managed state and repairWorkspace rebuilds it", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-workspace-full-reset-"));
  initializeWorkspace({
    appId: "demo",
    workspaceId: "demo-main",
    agentId: "demo-main",
    rootDir: workspaceDir,
  }, "openclaw");

  const backupPath = resolveClawWorkspaceSurfacePath("claw.workspace.backups", workspaceDir, "snapshot.txt");
  const lockPath = resolveClawWorkspaceSurfacePath("claw.workspace.locks", workspaceDir, "workspace.lock");
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(backupPath, "backup\n");
  fs.writeFileSync(lockPath, "lock\n");

  const resetResult = resetWorkspace(workspaceDir, {
    removeRuntimeFiles: true,
    removeObserved: true,
    removeProjections: true,
    removeIntents: true,
    removeBackups: true,
    removeLocks: true,
  });

  assert.equal(resetResult.removedPaths.includes(resolveClawWorkspaceSurfacePath("claw.workspace.projections", workspaceDir)), true);
  assert.equal(resetResult.removedPaths.includes(resolveClawWorkspaceSurfacePath("claw.workspace.observedState", workspaceDir)), true);
  assert.equal(resetResult.removedPaths.includes(resolveClawWorkspaceSurfacePath("claw.workspace.intents", workspaceDir)), true);
  assert.equal(fs.existsSync(resolveRuntimeFilePath(workspaceDir, "SOUL.md")), false);
  assert.equal(fs.existsSync(backupPath), false);
  assert.equal(fs.existsSync(lockPath), false);
  assert.equal(validateWorkspace(workspaceDir).ok, false);

  const repaired = repairWorkspace({
    appId: "demo",
    workspaceId: "demo-main",
    agentId: "demo-main",
    rootDir: workspaceDir,
  }, "openclaw");

  assert.equal(repaired.createdRuntimeFiles.length, 6);
  assert.equal(validateWorkspace(workspaceDir).ok, true);
});

test("repairWorkspace restores missing workspace layout and canonicalizes compat snapshots", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-workspace-repair-"));
  const snapshotPath = resolveClawWorkspaceSurfacePath("claw.workspace.compat", workspaceDir, "runtime-snapshot.json");
  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  fs.writeFileSync(snapshotPath, JSON.stringify({
    schemaVersion: 1,
    runtimeAdapter: "openclaw",
    runtimeVersion: "1.2.3",
    probedAt: "2026-03-20T00:00:00.000Z",
    capabilities: {
      version: true,
      modelsStatus: true,
      agentsList: true,
      gatewayCall: false,
    },
    diagnostics: {
      fixture: true,
    },
  }, null, 2));

  const result = repairWorkspace({
    appId: "demo",
    workspaceId: "demo-main",
    agentId: "demo-main",
    rootDir: workspaceDir,
  }, "openclaw");

  assert.equal(validateWorkspace(workspaceDir).ok, true);
  assert.equal(result.createdRuntimeFiles.length, 6);
  assert.equal(result.compatSnapshotCanonicalized, true);
  assert.equal(fs.existsSync(resolveCompatSnapshotPath(workspaceDir)), true);
  assert.equal(readCompatSnapshot(workspaceDir)?.runtimeVersion, "1.2.3");
  assert.equal(result.createdDirectories.includes(resolveClawWorkspaceSurfacePath("claw.workspace.sessions", workspaceDir)), true);
});

test("workspace mutations respect the workspace lock", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-workspace-lock-"));
  const filesystem = new NodeFileSystemHost();
  const lock = filesystem.acquireLock(resolveWorkspaceLockPath(workspaceDir));

  assert.throws(() => initializeWorkspace({
    appId: "demo",
    workspaceId: "demo-main",
    agentId: "demo-main",
    rootDir: workspaceDir,
  }, "openclaw", filesystem));
  assert.throws(() => repairWorkspace({
    appId: "demo",
    workspaceId: "demo-main",
    agentId: "demo-main",
    rootDir: workspaceDir,
  }, "openclaw", filesystem));
  assert.throws(() => resetWorkspace(workspaceDir, {}, filesystem));

  lock.release();
});

test("workspace file helpers read, preview, write and inspect managed blocks", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-workspace-files-"));
  const relativePath = path.relative(workspaceDir, resolveClawWorkspaceSurfacePath("claw.workspace", workspaceDir, "notes.md"));
  const filePath = path.join(workspaceDir, relativePath);

  assert.equal(readWorkspaceFile(workspaceDir, relativePath), null);

  const preview = previewWorkspaceFile(workspaceDir, relativePath, "hello\n");
  assert.equal(preview.filePath, filePath);
  assert.equal(preview.exists, false);
  assert.equal(preview.changed, true);

  const writeResult = writeWorkspaceFile(workspaceDir, relativePath, [
    "# Notes",
    "",
    "<!-- CLAWJS:persona:START -->",
    "alpha",
    "<!-- CLAWJS:persona:END -->",
    "",
  ].join("\n"));
  assert.equal(writeResult.changed, true);
  assert.equal(readWorkspaceFile(workspaceDir, relativePath), [
    "# Notes",
    "",
    "<!-- CLAWJS:persona:START -->",
    "alpha",
    "<!-- CLAWJS:persona:END -->",
    "",
  ].join("\n"));

  const inspection = inspectWorkspaceFile(workspaceDir, relativePath);
  assert.equal(inspection.exists, true);
  assert.equal(inspection.managedBlocks.length, 1);
  assert.equal(inspection.managedBlocks[0].blockId, "persona");
  assert.equal(inspection.managedBlocks[0].innerContent, "alpha");

  const managedBlock = inspectManagedWorkspaceFile(workspaceDir, relativePath, "persona");
  assert.equal(managedBlock.exists, true);
  assert.equal(managedBlock.innerContent, "alpha");
  assert.equal(fs.existsSync(resolveClawWorkspaceSurfacePath("claw.workspace.observedState", workspaceDir)), false);
});

test("writeWorkspaceFilePreservingManagedBlocks keeps original managed blocks intact", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-workspace-managed-write-"));
  const relativePath = "USER.md";

  writeWorkspaceFile(workspaceDir, relativePath, [
    "# USER",
    "",
    "<!-- CLAWJS:persona:START -->",
    "trusted",
    "<!-- CLAWJS:persona:END -->",
    "",
    "free text",
    "",
  ].join("\n"));

  writeWorkspaceFilePreservingManagedBlocks(workspaceDir, relativePath, [
    "# USER",
    "",
    "<!-- CLAWJS:persona:START -->",
    "overwritten",
    "<!-- CLAWJS:persona:END -->",
    "",
    "updated free text",
    "",
  ].join("\n"));

  const content = readWorkspaceFile(workspaceDir, relativePath) ?? "";
  assert.match(content, /trusted/);
  assert.doesNotMatch(content, /overwritten/);
  assert.match(content, /updated free text/);
});
