import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { test } from "vitest";
import {
  resolveClawGlobalModulesConfigPath,
  resolveClawModulesConfigPath,
  resolveClawWorkspaceModulesConfigPath,
} from "@clawjs/core";

import { CLI_EXIT_OK, CLI_EXIT_USAGE } from "./cli-errors.ts";
import { runCli } from "./index.ts";
import { captureStream, runCliCapture } from "./index-test-utils.ts";

test("local bin uses source router for setup and coordination planning", () => {
  const binPath = new URL("../bin/claw.mjs", import.meta.url);
  const setup = spawnSync(process.execPath, [binPath.pathname, "setup", "normal", "--json"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(setup.status, 0, setup.stderr);
  const setupPayload = JSON.parse(setup.stdout) as {
    data: { configPath: string; modules: Array<{ id: string; state: string }> };
    meta: { jsonSchemaId: string };
  };
  assert.equal(setupPayload.meta.jsonSchemaId, "claw.cli.setup.v1");
  assert.equal(setupPayload.data.configPath.endsWith(path.join(".claw", "config", "modules.json")), true);
  assert.equal(setupPayload.data.modules.some((module) => module.id === "basic-productivity" && module.state === "enabled"), true);

  const plan = spawnSync(process.execPath, [binPath.pathname, "test", "plan", "--repo", ".", "--lane", "changed", "--json"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(plan.status, 0, plan.stderr || plan.stdout);
  const planPayload = JSON.parse(plan.stdout) as { data: { lane: string; checks: Array<{ id: string }> }; meta: { jsonSchemaId: string } };
  assert.equal(planPayload.meta.jsonSchemaId, "claw.cli.test.v1");
  assert.equal(planPayload.data.lane, "changed");
  assert.equal(planPayload.data.checks.some((check) => check.id === "changed"), true);
});

test("modules config paths use Core storage helpers", () => {
  assert.equal(resolveClawModulesConfigPath("/Users/demo/.claw"), "/Users/demo/.claw/config/modules.json");
  assert.equal(resolveClawGlobalModulesConfigPath({ homeDir: "/Users/demo", platform: "darwin" }), "/Users/demo/.claw/config/modules.json");
  assert.equal(resolveClawWorkspaceModulesConfigPath("/Users/demo/project"), "/Users/demo/project/.claw/config/modules.json");

  const source = fs.readFileSync(new URL("./cli-modules-command.ts", import.meta.url), "utf8");
  assert.match(source, /resolveClawGlobalDataDir\(\{ homeDir: os\.homedir\(\) \}\)/);
  assert.match(source, /resolveClawModulesConfigPath\(clawHome\(flags\)\)/);
  assert.match(source, /resolveClawWorkspaceModulesConfigPath\(path\.resolve/);
  assert.equal(source.includes('path.join(os.homedir(), ".claw")'), false);
  assert.equal(source.includes('path.join(clawHome(flags), "config", "modules.json")'), false);
  assert.equal(source.includes('path.join(path.resolve(cwd, flags.workspace ?? "."), ".claw", "config", "modules.json")'), false);
});

test("setup previews progressive mode without writing until apply", async () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-modules-home-"));
  const preview = await runCliCapture(["setup", "normal", "--claw-home", tempHome, "--json"], process.cwd());
  assert.equal(preview.code, CLI_EXIT_OK);
  const previewPayload = JSON.parse(preview.stdout) as {
    data: { applied: boolean; mode: string; configPath: string; modules: Array<{ id: string; state: string }> };
  };
  assert.equal(previewPayload.data.applied, false);
  assert.equal(previewPayload.data.mode, "normal");
  assert.equal(fs.existsSync(previewPayload.data.configPath), false);
  assert.equal(previewPayload.data.modules.some((module) => module.id === "basic-productivity" && module.state === "enabled"), true);
  assert.equal(previewPayload.data.modules.some((module) => module.id === "erp" && module.state === "available"), true);

  const apply = await runCliCapture(["setup", "normal", "--apply", "--claw-home", tempHome, "--json"], process.cwd());
  assert.equal(apply.code, CLI_EXIT_OK);
  const applyPayload = JSON.parse(apply.stdout) as { data: { applied: boolean; configPath: string } };
  assert.equal(applyPayload.data.applied, true);
  assert.equal(fs.existsSync(applyPayload.data.configPath), true);
});

test("modules list hides available niche modules by default", async () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-modules-list-"));
  await runCliCapture(["setup", "advanced", "--apply", "--claw-home", tempHome, "--json"], process.cwd());

  const list = await runCliCapture(["modules", "list", "--claw-home", tempHome, "--json"], process.cwd());
  assert.equal(list.code, CLI_EXIT_OK);
  const listPayload = JSON.parse(list.stdout) as { data: { mode: string; modules: Array<{ id: string; state: string }> } };
  assert.equal(listPayload.data.mode, "advanced");
  assert.equal(listPayload.data.modules.some((module) => module.id === "dev-diagnostics" && module.state === "enabled"), true);
  assert.equal(listPayload.data.modules.some((module) => module.id === "erp"), false);

  const available = await runCliCapture(["modules", "list", "--available", "--claw-home", tempHome, "--json"], process.cwd());
  assert.equal(available.code, CLI_EXIT_OK);
  const availablePayload = JSON.parse(available.stdout) as { data: { modules: Array<{ id: string; state: string }> } };
  assert.equal(availablePayload.data.modules.some((module) => module.id === "erp" && module.state === "available"), true);
});

test("setup details allow reviewing and adjusting modules before apply", async () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-modules-detail-"));
  const preview = await runCliCapture(["setup", "normal", "--enable", "crm", "--disable", "light-search", "--details", "--claw-home", tempHome, "--json"], process.cwd());
  assert.equal(preview.code, CLI_EXIT_OK);
  const previewPayload = JSON.parse(preview.stdout) as {
    data: {
      applied: boolean;
      adjustments: { enable: string[]; disable: string[] };
      detail: { capability: Array<{ id: string; state: string }>; area: Array<{ id: string; state: string }> };
      modules: Array<{ id: string; state: string }>;
      configPath: string;
    };
  };
  assert.equal(previewPayload.data.applied, false);
  assert.deepEqual(previewPayload.data.adjustments.enable, ["crm"]);
  assert.deepEqual(previewPayload.data.adjustments.disable, ["light-search"]);
  assert.equal(previewPayload.data.detail.capability.some((module) => module.id === "light-search" && module.state === "visible"), true);
  assert.equal(previewPayload.data.detail.area.some((module) => module.id === "crm" && module.state === "enabled"), true);
  assert.equal(fs.existsSync(previewPayload.data.configPath), false);

  const apply = await runCliCapture(["setup", "normal", "--enable", "crm", "--disable", "light-search", "--apply", "--claw-home", tempHome, "--json"], process.cwd());
  assert.equal(apply.code, CLI_EXIT_OK);
  const saved = JSON.parse(fs.readFileSync(path.join(tempHome, "config", "modules.json"), "utf8")) as { enabledModules: string[]; disabledModules: string[] };
  assert.equal(saved.enabledModules.includes("crm"), true);
  assert.equal(saved.disabledModules.includes("light-search"), true);
});

test("setup interactive asks for mode, adjustments, and confirmation before writing", async () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-modules-interactive-"));
  const stdout = captureStream();
  const stderr = captureStream();
  const stdin = new PassThrough();
  setImmediate(() => {
    stdin.write("normal\n");
    stdin.write("crm\n");
    stdin.write("light-search\n");
    stdin.write("y\n");
    stdin.end();
  });
  const code = await runCli(["setup", "--interactive", "--claw-home", tempHome, "--json"], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    stdin,
    cwd: process.cwd(),
    binName: "claw",
  });
  assert.equal(code, CLI_EXIT_OK);
  const jsonStart = stdout.getOutput().indexOf("{\n  \"ok\"");
  assert.notEqual(jsonStart, -1);
  const payload = JSON.parse(stdout.getOutput().slice(jsonStart)) as {
    data: { interactive: boolean; applied: boolean; mode: string; adjustments: { enable: string[]; disable: string[] } };
  };
  assert.equal(payload.data.interactive, true);
  assert.equal(payload.data.applied, true);
  assert.equal(payload.data.mode, "normal");
  assert.deepEqual(payload.data.adjustments.enable, ["crm"]);
  assert.deepEqual(payload.data.adjustments.disable, ["light-search"]);
  assert.equal(fs.existsSync(path.join(tempHome, "config", "modules.json")), true);
  assert.equal(stderr.getOutput(), "");
});

test("modules enable and workspace overrides do not install dependencies", async () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-modules-enable-"));
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-modules-workspace-"));

  const enable = await runCliCapture(["modules", "enable", "crm", "--workspace", workspace, "--claw-home", tempHome, "--json"], process.cwd());
  assert.equal(enable.code, CLI_EXIT_OK);
  const enablePayload = JSON.parse(enable.stdout) as { data: { state: string; configPath: string } };
  assert.equal(enablePayload.data.state, "enabled");
  assert.equal(enablePayload.data.configPath.endsWith(path.join(".claw", "config", "modules.json")), true);

  const status = await runCliCapture(["modules", "status", "--workspace", workspace, "--claw-home", tempHome, "--json"], process.cwd());
  assert.equal(status.code, CLI_EXIT_OK);
  const statusPayload = JSON.parse(status.stdout) as { data: { modules: Array<{ id: string; state: string }> } };
  assert.equal(statusPayload.data.modules.some((module) => module.id === "crm" && module.state === "enabled"), true);

  const install = await runCliCapture(["modules", "install", "audio-voice", "--claw-home", tempHome, "--json"], process.cwd());
  assert.equal(install.code, CLI_EXIT_OK);
  const installPayload = JSON.parse(install.stdout) as { data: { installed: boolean; message: string } };
  assert.equal(installPayload.data.installed, false);
  assert.match(installPayload.data.message, /explicit/i);

  const densePackInstall = await runCliCapture(["modules", "install", "health", "--claw-home", tempHome, "--json"], process.cwd());
  assert.equal(densePackInstall.code, CLI_EXIT_OK);
  const densePackInstallPayload = JSON.parse(densePackInstall.stdout) as {
    data: { installed: boolean; optionalPack: string; installCommand: string; next: string[] };
  };
  assert.equal(densePackInstallPayload.data.installed, false);
  assert.equal(densePackInstallPayload.data.optionalPack, "@clawjs/domain-pack-dense-data");
  assert.equal(densePackInstallPayload.data.installCommand, "npm install @clawjs/domain-pack-dense-data");
  assert.equal(densePackInstallPayload.data.next.includes("claw modules enable health"), true);
});

test("collections list shows active safe catalog by default and full catalog only when requested", async () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-modules-collections-"));

  const minimal = await runCliCapture(["collections", "list", "--claw-home", tempHome, "--json"], process.cwd());
  assert.equal(minimal.code, CLI_EXIT_OK);
  const minimalPayload = JSON.parse(minimal.stdout) as {
    data: { visibility: string; mode: string; collections: Array<{ name: string; family: string; state: string }> };
  };
  assert.equal(minimalPayload.data.visibility, "active");
  assert.equal(minimalPayload.data.mode, "minimal");
  assert.equal(minimalPayload.data.collections.some((collection) => collection.name === "tasks" && collection.state === "enabled"), true);
  assert.equal(minimalPayload.data.collections.some((collection) => collection.name === "patients"), false);
  assert.equal(minimalPayload.data.collections.some((collection) => collection.family === "erp"), false);
  assert.equal(minimalPayload.data.collections.length <= 4, true);

  await runCliCapture(["setup", "advanced", "--apply", "--claw-home", tempHome, "--json"], process.cwd());
  const advanced = await runCliCapture(["collections", "list", "--claw-home", tempHome, "--json"], process.cwd());
  assert.equal(advanced.code, CLI_EXIT_OK);
  const advancedPayload = JSON.parse(advanced.stdout) as {
    data: { collections: Array<{ name: string; family: string; state: string }> };
  };
  assert.equal(advancedPayload.data.collections.some((collection) => collection.name === "notes"), true);
  assert.equal(advancedPayload.data.collections.some((collection) => collection.name === "projects"), true);
  assert.equal(advancedPayload.data.collections.some((collection) => collection.name === "patients"), false);
  assert.equal(advancedPayload.data.collections.some((collection) => collection.family === "legal"), false);

  const available = await runCliCapture(["collections", "list", "--available", "--claw-home", tempHome, "--json"], process.cwd());
  assert.equal(available.code, CLI_EXIT_OK);
  const availablePayload = JSON.parse(available.stdout) as {
    data: { visibility: string; collections: Array<{ name: string; family: string; state: string }> };
  };
  assert.equal(availablePayload.data.visibility, "available");
  assert.equal(availablePayload.data.collections.some((collection) => collection.name === "patients" && collection.state === "available"), true);
  assert.equal(availablePayload.data.collections.some((collection) => collection.family === "legal" && collection.state === "available"), true);
});

test("collections list rejects invalid limits before returning a misleading subset", async () => {
  const result = await runCliCapture(["collections", "list", "--limit", "nope", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_USAGE);
  const payload = JSON.parse(result.stdout) as { ok: boolean; error: { code: string; message: string }; meta: { canonicalCommand: string } };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "invalid_collections_limit");
  assert.match(payload.error.message, /non-negative number/);
  assert.equal(payload.meta.canonicalCommand, "collections");
});

test("niche domain commands require explicit module enablement", async () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-modules-gated-"));
  await runCliCapture(["setup", "advanced", "--apply", "--claw-home", tempHome, "--json"], process.cwd());

  const blocked = await runCliCapture(["erp", "company", "acme", "overview", "--claw-home", tempHome, "--json"], process.cwd());
  assert.equal(blocked.code, 64);
  const blockedPayload = JSON.parse(blocked.stdout) as { error: { code: string; message: string }; meta: { requiredModule: string } };
  assert.equal(blockedPayload.error.code, "module_not_enabled");
  assert.equal(blockedPayload.meta.requiredModule, "erp");
  assert.match(blockedPayload.error.message, /modules enable erp/);

  await runCliCapture(["modules", "enable", "erp", "--claw-home", tempHome, "--json"], process.cwd());
  const enabled = await runCliCapture(["erp", "company", "acme", "overview", "--claw-home", tempHome, "--json"], process.cwd());
  assert.notEqual(enabled.code, 64);
  assert.doesNotMatch(enabled.stdout + enabled.stderr, /module_not_enabled/);
});

test("safe first-use productivity commands accept claw-home and suggest setup without blocking", async () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-modules-first-use-home-"));
  const tempData = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-modules-first-use-data-"));
  const oldDataDir = process.env.CLAW_DATA_DIR;
  process.env.CLAW_DATA_DIR = tempData;
  try {
    const create = await runCliCapture(["tasks", "create", "Smoke task", "--claw-home", tempHome, "--json"], process.cwd());
    assert.equal(create.code, CLI_EXIT_OK);
    assert.match(create.stderr, /Run `claw setup`/);
    assert.equal(fs.existsSync(path.join(tempHome, "config", "modules.json")), false);

    await runCliCapture(["setup", "minimal", "--apply", "--claw-home", tempHome, "--json"], process.cwd());
    const list = await runCliCapture(["tasks", "list", "--claw-home", tempHome, "--json"], process.cwd());
    assert.equal(list.code, CLI_EXIT_OK);
    assert.doesNotMatch(list.stderr, /Run `claw setup`/);
  } finally {
    if (oldDataDir === undefined) delete process.env.CLAW_DATA_DIR;
    else process.env.CLAW_DATA_DIR = oldDataDir;
  }
});
