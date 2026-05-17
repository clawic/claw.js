import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { CLI_EXIT_OK } from "./cli-errors.ts";
import { runCliCapture, useIsolatedClawDataRoot } from "./index-test-utils.ts";

test("guidance and resources commands expose compact JIT metadata", async (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-guidance-"));
  useIsolatedClawDataRoot(t, cwd);
  const guidanceDir = path.join(cwd, "guidance");
  const resourcesDir = path.join(cwd, "resources");
  const filePath = path.join(cwd, "instructions.md");
  fs.writeFileSync(filePath, "Keep this short.\n", "utf8");

  const registered = await runCliCapture([
    "resources", "register", filePath,
    "--kind", "instruction",
    "--label", "Instructions",
    "--resources-dir", resourcesDir,
    "--guidance-dir", guidanceDir,
    "--json",
  ], cwd);
  assert.equal(registered.code, CLI_EXIT_OK);
  const registeredPayload = JSON.parse(registered.stdout) as { data: { id: string }; meta: { actor: { actorKind: string } } };
  assert.match(registeredPayload.data.id, /^res_[a-z0-9]+$/);
  assert.equal(registeredPayload.meta.actor.actorKind, "unknown");

  const created = await runCliCapture([
    "guidance", "create",
    "--id", "resource-list-hint",
    "--title", "Resource list hint",
    "--capsule", "There are local instructions for resources.",
    "--command", "resources list",
    "--resource", registeredPayload.data.id,
    "--guidance-dir", guidanceDir,
    "--resources-dir", resourcesDir,
    "--json",
  ], cwd);
  assert.equal(created.code, CLI_EXIT_OK);

  const listed = await runCliCapture([
    "resources", "list",
    "--guidance-dir", guidanceDir,
    "--resources-dir", resourcesDir,
    "--actor-kind", "agent",
    "--json",
  ], cwd);
  assert.equal(listed.code, CLI_EXIT_OK);
  const listedPayload = JSON.parse(listed.stdout) as {
    data: { resources: Array<{ id: string }> };
    meta: { actor: { actorKind: string; trustSource: string }; guidance: Array<{ id: string; capsule: string; resourceIds: string[] }> };
  };
  assert.equal(listedPayload.data.resources.length, 1);
  assert.equal(listedPayload.meta.actor.actorKind, "agent");
  assert.equal(listedPayload.meta.actor.trustSource, "untrusted");
  assert.equal(listedPayload.meta.guidance[0]?.id, "resource-list-hint");
  assert.equal(listedPayload.meta.guidance[0]?.capsule, "There are local instructions for resources.");
  assert.deepEqual(listedPayload.meta.guidance[0]?.resourceIds, [registeredPayload.data.id]);
});
