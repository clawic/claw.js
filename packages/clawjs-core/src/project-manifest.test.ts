import assert from "node:assert/strict";
import { test } from "vitest";

import {
  assertSafeClawProjectHandoff,
  clawProjectManifestSchema,
  createClawProjectId,
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
