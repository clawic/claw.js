import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { generateProjectResource, type ClawProjectConfig } from "./project.ts";

function projectConfigWithSkillDir(directory: string): ClawProjectConfig {
  return {
    schemaVersion: 1,
    manifestKind: "claw.project",
    projectId: "project.test",
    type: "project",
    name: "project-test",
    title: "Project Test",
    runtime: { adapter: "demo" },
    directories: { skills: directory },
    resources: {
      skills: [],
      plugins: [],
      providers: [],
      channels: [],
      commands: [],
      schedulers: [],
      memory: [],
    },
  };
}

test("project resource generation rejects directories outside the project root", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-project-dir-"));
  const projectRoot = path.join(root, "project");
  fs.mkdirSync(projectRoot, { recursive: true });

  for (const directory of ["../outside", "/tmp/outside", "C:\\outside", "safe/../../outside"]) {
    await assert.rejects(
      () => generateProjectResource(projectRoot, projectConfigWithSkillDir(directory), "skill", "escape"),
      /Invalid project skills directory/,
    );
  }

  assert.equal(fs.existsSync(path.join(root, "outside")), false);
  const created = await generateProjectResource(projectRoot, projectConfigWithSkillDir("claw/skills"), "skill", "inside");
  assert.equal(created.path, "claw/skills/inside.ts");
  assert.equal(fs.existsSync(path.join(projectRoot, created.path)), true);
});
