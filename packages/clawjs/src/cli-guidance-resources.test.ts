import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { CLI_EXIT_OK, CLI_EXIT_USAGE } from "./cli-errors.ts";
import { runCliCapture, useIsolatedClawDataRoot } from "./index-test-utils.ts";

test("guidance and resources commands expose JIT metadata only when requested", async (t) => {
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

  const listedDefault = await runCliCapture([
    "resources", "list",
    "--guidance-dir", guidanceDir,
    "--resources-dir", resourcesDir,
    "--actor-kind", "agent",
    "--json",
  ], cwd);
  assert.equal(listedDefault.code, CLI_EXIT_OK);
  const listedDefaultPayload = JSON.parse(listedDefault.stdout) as {
    data: { resources: Array<{ id: string }> };
    meta: { actor: { actorKind: string; trustSource: string }; guidance?: Array<{ id: string }> };
  };
  assert.equal(listedDefaultPayload.data.resources.length, 1);
  assert.equal(listedDefaultPayload.meta.actor.actorKind, "agent");
  assert.equal(listedDefaultPayload.meta.actor.trustSource, "untrusted");
  assert.equal("guidance" in listedDefaultPayload.meta, false);

  const listed = await runCliCapture([
    "resources", "list",
    "--guidance-dir", guidanceDir,
    "--resources-dir", resourcesDir,
    "--actor-kind", "agent",
    "--guidance", "compact",
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

  const listedOff = await runCliCapture([
    "resources", "list",
    "--guidance-dir", guidanceDir,
    "--resources-dir", resourcesDir,
    "--actor-kind", "agent",
    "--guidance", "off",
    "--json",
  ], cwd);
  assert.equal(listedOff.code, CLI_EXIT_OK);
  const listedOffPayload = JSON.parse(listedOff.stdout) as {
    data: { resources: Array<{ id: string }> };
    meta: { actor: { actorKind: string; trustSource: string }; guidance?: Array<{ id: string }> };
  };
  assert.equal(listedOffPayload.data.resources.length, 1);
  assert.equal(listedOffPayload.meta.actor.actorKind, "agent");
  assert.equal(listedOffPayload.meta.actor.trustSource, "untrusted");
  assert.equal("guidance" in listedOffPayload.meta, false);
});

test("guidance match rejects invalid limits before matching", async (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-guidance-limit-"));
  useIsolatedClawDataRoot(t, cwd);
  const guidanceDir = path.join(cwd, "guidance");

  const invalidText = await runCliCapture([
    "guidance", "match",
    "--command", "resources list",
    "--limit", "nope",
    "--guidance-dir", guidanceDir,
    "--json",
  ], cwd);
  assert.equal(invalidText.code, CLI_EXIT_USAGE);
  const invalidTextPayload = JSON.parse(invalidText.stdout) as { ok: boolean; error: { code: string; status: string; location: string } };
  assert.equal(invalidTextPayload.ok, false);
  assert.equal(invalidTextPayload.error.code, "invalid_guidance_limit");
  assert.equal(invalidTextPayload.error.status, "USAGE");
  assert.equal(invalidTextPayload.error.location, "cli.guidance.limit");

  const negative = await runCliCapture([
    "guidance", "match",
    "--command", "resources list",
    "--limit", "-1",
    "--guidance-dir", guidanceDir,
    "--json",
  ], cwd);
  assert.equal(negative.code, CLI_EXIT_USAGE);
  const negativePayload = JSON.parse(negative.stdout) as { ok: boolean; error: { code: string } };
  assert.equal(negativePayload.ok, false);
  assert.equal(negativePayload.error.code, "invalid_guidance_limit");
});

test("guidance and resources list reject invalid status filters", async (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-guidance-status-"));
  useIsolatedClawDataRoot(t, cwd);
  const guidanceDir = path.join(cwd, "guidance");
  const resourcesDir = path.join(cwd, "resources");

  const guidance = await runCliCapture([
    "guidance", "list",
    "--status", "nope",
    "--guidance-dir", guidanceDir,
    "--json",
  ], cwd);
  assert.equal(guidance.code, CLI_EXIT_USAGE);
  const guidancePayload = JSON.parse(guidance.stdout) as { ok: boolean; error: { code: string; status: string; location: string } };
  assert.equal(guidancePayload.ok, false);
  assert.equal(guidancePayload.error.code, "invalid_guidance_status");
  assert.equal(guidancePayload.error.status, "USAGE");
  assert.equal(guidancePayload.error.location, "cli.guidance.status");

  const resources = await runCliCapture([
    "resources", "list",
    "--status", "nope",
    "--resources-dir", resourcesDir,
    "--json",
  ], cwd);
  assert.equal(resources.code, CLI_EXIT_USAGE);
  const resourcesPayload = JSON.parse(resources.stdout) as { ok: boolean; error: { code: string; status: string; location: string } };
  assert.equal(resourcesPayload.ok, false);
  assert.equal(resourcesPayload.error.code, "invalid_resource_status");
  assert.equal(resourcesPayload.error.status, "USAGE");
  assert.equal(resourcesPayload.error.location, "cli.resources.status");
});

test("guidance create rejects invalid enum and integer flags before writing state", async (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-guidance-create-flags-"));
  useIsolatedClawDataRoot(t, cwd);
  const guidanceDir = path.join(cwd, "guidance");

  for (const [flag, value, code, location] of [
    ["--severity", "urgent", "invalid_guidance_severity", "cli.guidance.severity"],
    ["--priority", "soon", "invalid_guidance_priority", "cli.guidance.priority"],
  ] as const) {
    const result = await runCliCapture([
      "guidance", "create",
      "--title", "Bad guidance",
      "--capsule", "This should not be written.",
      flag, value,
      "--guidance-dir", guidanceDir,
      "--json",
    ], cwd);
    assert.equal(result.code, CLI_EXIT_USAGE);
    const payload = JSON.parse(result.stdout) as { ok: boolean; error: { code: string; status: string; location: string } };
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, code);
    assert.equal(payload.error.status, "USAGE");
    assert.equal(payload.error.location, location);
  }

  assert.equal(fs.existsSync(path.join(guidanceDir, "guidance.json")), false);
});

test("resources read rejects invalid max byte limits before reading", async (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-resources-max-bytes-"));
  useIsolatedClawDataRoot(t, cwd);
  const resourcesDir = path.join(cwd, "resources");
  const filePath = path.join(cwd, "notes.txt");
  fs.writeFileSync(filePath, "abcdef\n", "utf8");

  const registered = await runCliCapture([
    "resources", "register", filePath,
    "--kind", "file",
    "--resources-dir", resourcesDir,
    "--json",
  ], cwd);
  assert.equal(registered.code, CLI_EXIT_OK);
  const registeredPayload = JSON.parse(registered.stdout) as { data: { id: string } };

  for (const value of ["nope", "-1", "0", "256001"]) {
    const read = await runCliCapture([
      "resources", "read", registeredPayload.data.id,
      "--max-bytes", value,
      "--resources-dir", resourcesDir,
      "--json",
    ], cwd);
    assert.equal(read.code, CLI_EXIT_USAGE);
    const payload = JSON.parse(read.stdout) as { ok: boolean; error: { code: string; status: string; location: string } };
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, "invalid_resource_max_bytes");
    assert.equal(payload.error.status, "USAGE");
    assert.equal(payload.error.location, "cli.resources.max_bytes");
  }

  const boundedRead = await runCliCapture([
    "resources", "read", registeredPayload.data.id,
    "--max-bytes", "3",
    "--resources-dir", resourcesDir,
    "--json",
  ], cwd);
  assert.equal(boundedRead.code, CLI_EXIT_OK);
  const boundedPayload = JSON.parse(boundedRead.stdout) as { data: { content: string; truncated: boolean } };
  assert.equal(boundedPayload.data.content, "abc");
  assert.equal(boundedPayload.data.truncated, true);
});
