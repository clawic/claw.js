import assert from "node:assert/strict";
import { test } from "vitest";

import {
  assertSafeClawProjectHandoff,
  clawProjectManifestSchema,
  createClawProjectId,
  findClawProjectManifestPortabilityViolations,
  normalizeClawProjectManifest,
} from "./project-manifest.ts";

test("project manifest normalizes legacy scaffold data into portable v1 identity", () => {
  const manifest = normalizeClawProjectManifest({
    schemaVersion: 1,
    type: "workspace",
    name: "Mobile App",
    title: "Mobile App",
    workspace: {
      appId: "mobile-app",
      workspaceId: "workspace-main",
      agentId: "agent-main",
    },
    runtime: { adapter: "demo" },
    directories: { skills: "claw/skills" },
    resources: { skills: [] },
  }, "fallback", "2026-05-18T00:00:00.000Z");

  assert.equal(manifest.manifestKind, "claw.project");
  assert.equal(manifest.projectId, "mobile-app");
  assert.equal(manifest.primaryFolder.path, ".");
  assert.equal(manifest.workspaceBinding?.workspaceId, "workspace-main");
  assert.equal(manifest.attachment.state, "attached");
  assert.equal(manifest.attachment.workspaceId, "workspace-main");
  assert.equal(clawProjectManifestSchema.parse(manifest).projectId, "mobile-app");
});

test("project ids are stable portable slugs", () => {
  assert.equal(createClawProjectId("New Mobile Version"), "new-mobile-version");
  assert.equal(createClawProjectId(""), "project");
});

test("project handoff safety blocks secret-like fields", () => {
  assert.deepEqual(assertSafeClawProjectHandoff({ project: { projectId: "demo" } }), { safe: true, blockedFields: [] });
  assert.deepEqual(assertSafeClawProjectHandoff({ project: { secretToken: "bad" } }), { safe: false, blockedFields: ["project.secretToken"] });
});

test("project manifest rejects absolute paths and workspace .claw state", () => {
  assert.deepEqual(findClawProjectManifestPortabilityViolations({
    primaryFolder: { id: "primary", path: "/Users/me/work", role: "primary" },
    folderRefs: [{ id: "workspace", path: ".claw", role: "reference" }],
    directories: { memory: ".claw/memory" },
    resources: { files: [{ id: "secret", path: "C:\\Users\\me\\.claw\\secret" }] },
  }), ["primaryFolder.path", "folderRefs.0.path", "directories.memory", "resources.files.0.path"]);

  assert.throws(() => clawProjectManifestSchema.parse({
    schemaVersion: 1,
    manifestKind: "claw.project",
    projectId: "demo",
    name: "demo",
    title: "Demo",
    primaryFolder: { id: "primary", path: "/tmp/demo", role: "primary" },
  }), /relative paths/);
});

test("project manifest normalizes referenced folder access and sync policy", () => {
  const manifest = normalizeClawProjectManifest({
    schemaVersion: 1,
    manifestKind: "claw.project",
    projectId: "demo",
    name: "demo",
    title: "Demo",
    folderRefs: [{
      id: "design",
      path: "../design",
      role: "reference",
    }],
  }, "fallback", "2026-05-18T00:00:00.000Z");

  assert.deepEqual(manifest.folderRefs[0]?.access, {
    read: "explicit",
    write: "grant_required",
  });
  assert.deepEqual(manifest.folderRefs[0]?.sync, {
    include: false,
  });
});

test("project manifest requires referenced folders to opt in before sync inclusion", () => {
  assert.throws(() => clawProjectManifestSchema.parse({
    schemaVersion: 1,
    manifestKind: "claw.project",
    projectId: "demo",
    name: "demo",
    title: "Demo",
    folderRefs: [{
      id: "design",
      path: "../design",
      role: "reference",
      sync: { include: true },
    }],
  }), /manifest_explicit/);

  const manifest = clawProjectManifestSchema.parse({
    schemaVersion: 1,
    manifestKind: "claw.project",
    projectId: "demo",
    name: "demo",
    title: "Demo",
    folderRefs: [{
      id: "design",
      path: "../design",
      role: "reference",
      sync: { include: true, mode: "manifest_explicit" },
    }],
  });
  assert.deepEqual(manifest.folderRefs[0]?.sync, {
    include: true,
    mode: "manifest_explicit",
  });
});

test("project manifest keeps primary and referenced folder roles distinct", () => {
  assert.throws(() => clawProjectManifestSchema.parse({
    schemaVersion: 1,
    manifestKind: "claw.project",
    projectId: "demo",
    name: "demo",
    title: "Demo",
    primaryFolder: { id: "primary", path: ".", role: "reference" },
  }), /primary folder/);

  assert.throws(() => clawProjectManifestSchema.parse({
    schemaVersion: 1,
    manifestKind: "claw.project",
    projectId: "demo",
    name: "demo",
    title: "Demo",
    folderRefs: [{ id: "other-primary", path: "other", role: "primary" }],
  }), /Referenced folders/);
});
