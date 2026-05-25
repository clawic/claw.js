import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { applyTemplatePack } from "./template-pack.ts";
import { NodeFileSystemHost } from "../host/filesystem.ts";
import { resolveWorkspaceFileLockPath } from "../workspace/manager.ts";

test("template packs can seed and manage workspace files", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-template-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  const packDir = path.join(tempRoot, "pack");
  fs.mkdirSync(packDir, { recursive: true });

  fs.writeFileSync(path.join(packDir, "template-pack.json"), JSON.stringify({
    schemaVersion: 1,
    id: "demo",
    name: "Demo",
    mutations: [
      { targetFile: "SOUL.md", mode: "seed_if_missing", content: "# Soul\n" },
      { targetFile: "SOUL.md", mode: "managed_block", blockId: "settings", content: "flag = true" },
    ],
  }, null, 2));

  const results = applyTemplatePack(path.join(packDir, "template-pack.json"), { workspaceDir });
  assert.equal(results.length, 2);

  const content = fs.readFileSync(path.join(workspaceDir, "SOUL.md"), "utf8");
  assert.match(content, /# Soul/);
  assert.match(content, /CLAW:settings:START/);
});

test("template packs respect file locks for concurrent mutations", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-template-lock-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  const packDir = path.join(tempRoot, "pack");
  const filesystem = new NodeFileSystemHost();
  fs.mkdirSync(packDir, { recursive: true });

  fs.writeFileSync(path.join(packDir, "template-pack.json"), JSON.stringify({
    schemaVersion: 1,
    id: "demo",
    name: "Demo",
    mutations: [
      { targetFile: "SOUL.md", mode: "seed_if_missing", content: "# Soul\n" },
    ],
  }, null, 2));

  const lock = filesystem.acquireLock(resolveWorkspaceFileLockPath(workspaceDir, "SOUL.md"));
  assert.throws(() => applyTemplatePack(path.join(packDir, "template-pack.json"), {
    workspaceDir,
    filesystem,
  }));
  lock.release();
});

test("template packs reject path escapes before writing workspace files or reading sidecars", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-template-paths-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  const packDir = path.join(tempRoot, "pack");
  const outsideWorkspaceDir = path.join(tempRoot, "outside-workspace");
  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.mkdirSync(packDir, { recursive: true });
  fs.mkdirSync(outsideWorkspaceDir, { recursive: true });

  const parentEscapePack = path.join(packDir, "parent-escape-pack.json");
  const parentEscapeTarget = path.join(tempRoot, "owned-by-parent-escape.md");
  fs.writeFileSync(parentEscapePack, JSON.stringify({
    schemaVersion: 1,
    id: "parent-escape",
    name: "Parent Escape",
    mutations: [
      { targetFile: "../owned-by-parent-escape.md", mode: "replace_full", content: "owned\n" },
    ],
  }, null, 2));
  assert.throws(() => applyTemplatePack(parentEscapePack, { workspaceDir }), /relative/);
  assert.equal(fs.existsSync(parentEscapeTarget), false);

  const absoluteEscapePack = path.join(packDir, "absolute-escape-pack.json");
  const absoluteEscapeTarget = path.join(tempRoot, "owned-by-absolute-escape.md");
  fs.writeFileSync(absoluteEscapePack, JSON.stringify({
    schemaVersion: 1,
    id: "absolute-escape",
    name: "Absolute Escape",
    mutations: [
      { targetFile: absoluteEscapeTarget, mode: "replace_full", content: "owned\n" },
    ],
  }, null, 2));
  assert.throws(() => applyTemplatePack(absoluteEscapePack, { workspaceDir }), /relative/);
  assert.equal(fs.existsSync(absoluteEscapeTarget), false);

  const linkedWorkspaceDir = path.join(workspaceDir, "linked");
  const linkedWorkspaceTarget = path.join(outsideWorkspaceDir, "owned-through-link.md");
  fs.symlinkSync(outsideWorkspaceDir, linkedWorkspaceDir, "dir");
  const linkedWorkspacePack = path.join(packDir, "linked-workspace-pack.json");
  fs.writeFileSync(linkedWorkspacePack, JSON.stringify({
    schemaVersion: 1,
    id: "linked-workspace",
    name: "Linked Workspace",
    mutations: [
      { targetFile: "linked/owned-through-link.md", mode: "replace_full", content: "owned\n" },
    ],
  }, null, 2));
  assert.throws(() => applyTemplatePack(linkedWorkspacePack, { workspaceDir }), /workspace/);
  assert.equal(fs.existsSync(linkedWorkspaceTarget), false);

  const outsideSidecar = path.join(tempRoot, "outside-sidecar.md");
  fs.writeFileSync(outsideSidecar, "secret\n");
  fs.symlinkSync(outsideSidecar, path.join(packDir, "SIDE.md"));
  const sidecarEscapePack = path.join(packDir, "sidecar-escape-pack.json");
  fs.writeFileSync(sidecarEscapePack, JSON.stringify({
    schemaVersion: 1,
    id: "sidecar-escape",
    name: "Sidecar Escape",
    mutations: [
      { targetFile: "SIDE.md", mode: "seed_if_missing" },
    ],
  }, null, 2));
  assert.throws(() => applyTemplatePack(sidecarEscapePack, { workspaceDir }), /template pack/);
  assert.equal(fs.existsSync(path.join(workspaceDir, "SIDE.md")), false);
});
