import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { CLI_EXIT_OK } from "./cli-errors.ts";
import { runCli } from "./index.ts";
import { captureStream, runCliCapture } from "./index-test-utils.ts";
import {
  applySourceModeToProject,
  buildSourceInstallCommand,
  collectSourcePackageClosure,
  resolveSourceModeStatus,
  sourceModeRequested,
} from "./source-mode.ts";

const repoRoot = path.resolve(process.cwd());

test("source mode status discovers the checkout and reports source trust", async () => {
  const result = await runCliCapture(["source", "status", "--json"], repoRoot);
  assert.equal(result.code, CLI_EXIT_OK);
  const payload = JSON.parse(result.stdout) as {
    data: {
      active: boolean;
      trustLabel: string;
      sourceRoot: string;
      branch: string | null;
      commit: string | null;
      packageMap: Record<string, { relativePath: string }>;
    };
  };
  assert.equal(payload.data.active, true);
  assert.equal(payload.data.trustLabel, "source");
  assert.equal(payload.data.sourceRoot, repoRoot);
  assert.equal(payload.data.packageMap["@clawjs/cli"].relativePath, path.join("packages", "clawjs"));
});

test("source mode request parsing accepts flag, source-root and env", () => {
  assert.equal(sourceModeRequested(["new", "workspace", "demo"], {}), false);
  assert.equal(sourceModeRequested(["new", "workspace", "demo", "--source"], {}), true);
  assert.equal(sourceModeRequested(["new", "workspace", "demo", "--source-root", repoRoot], { "source-root": repoRoot }), true);
  assert.equal(sourceModeRequested(["new", "workspace", "demo", `--source-root=${repoRoot}`], {}), true);
});

test("source package closure includes transitive internal packages", () => {
  const status = resolveSourceModeStatus({ cwd: repoRoot, sourceRoot: repoRoot, requested: true });
  const closure = collectSourcePackageClosure(status, ["@clawjs/domain-pack-dense-data"]);
  assert.equal(closure.includes("@clawjs/domain-pack-dense-data"), true);
  assert.equal(closure.includes("@clawjs/core"), true);
  assert.equal(closure.includes("@clawjs/claw"), true);
  assert.equal(closure.includes("@clawjs/database"), true);
  assert.equal(closure.includes("@clawjs/search"), true);
});

test("source mode rewrites generated package manifests and writes npm guard files", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-source-rewrite-"));
  fs.writeFileSync(path.join(tempRoot, "package.json"), JSON.stringify({
    name: "demo",
    private: true,
    dependencies: { "@clawjs/claw": "^0.1.0" },
    devDependencies: { "@clawjs/cli": "^0.1.0" },
  }, null, 2));

  const status = resolveSourceModeStatus({ cwd: repoRoot, sourceRoot: repoRoot, requested: true });
  const result = applySourceModeToProject(tempRoot, status);
  assert.equal(result.applied, true);

  const packageJson = JSON.parse(fs.readFileSync(path.join(tempRoot, "package.json"), "utf8"));
  assert.match(packageJson.dependencies["@clawjs/claw"], /^file:/);
  assert.match(packageJson.dependencies["@clawjs/core"], /^file:/);
  assert.match(packageJson.devDependencies["@clawjs/cli"], /^file:/);
  assert.equal(fs.readFileSync(path.join(tempRoot, ".npmrc"), "utf8").includes("install-links=true"), true);

  const sourceManifest = JSON.parse(fs.readFileSync(path.join(tempRoot, "claw.source.json"), "utf8"));
  assert.equal(sourceManifest.trustLabel, "source");
  assert.equal(sourceManifest.sourceRoot, repoRoot);
  assert.equal(sourceManifest.packageMap["@clawjs/core"].relativePath, path.join("packages", "clawjs-core"));
});

test("modules install guidance switches to local source package closure", async () => {
  const result = await runCliCapture(["modules", "install", "health", "--source", "--source-root", repoRoot, "--json"], repoRoot);
  assert.equal(result.code, CLI_EXIT_OK);
  const payload = JSON.parse(result.stdout) as {
    data: { installCommand: string; sourceMode: { trustLabel: string; sourceRoot: string } };
  };
  assert.equal(payload.data.sourceMode.trustLabel, "source");
  assert.equal(payload.data.sourceMode.sourceRoot, repoRoot);
  assert.equal(payload.data.installCommand.includes("--install-links"), true);
  assert.equal(payload.data.installCommand.includes("packages/clawjs-domain-pack-dense-data"), true);
  assert.equal(payload.data.installCommand.includes("packages/clawjs-core"), true);

  const status = resolveSourceModeStatus({ cwd: repoRoot, sourceRoot: repoRoot, requested: true });
  const direct = buildSourceInstallCommand(status, ["@clawjs/local-data"]);
  assert.ok(direct?.includes("packages/clawjs-local-data"));
  assert.ok(direct?.includes("packages/clawjs-core"));
});

test("source scaffold install keeps @clawjs packages off the npm registry", { timeout: 120_000 }, async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-source-install-"));
  const stdout = captureStream();
  const exitCode = await runCli(["new", "workspace", "demo-workspace", "--source", "--source-root", repoRoot, "--no-install", "--json"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
    binName: "claw",
  });
  assert.equal(exitCode, CLI_EXIT_OK);

  const generatedRoot = path.join(tempRoot, "demo-workspace");
  runNpm(["install", "--ignore-scripts", "--no-audit", "--no-fund"], generatedRoot);
  assertNoClawjsRegistryResolutions(generatedRoot);

  execFileSync(process.execPath, ["--input-type=module", "-e", `
    const sdk = await import("@clawjs/claw");
    const cli = await import("@clawjs/cli");
    const core = await import("@clawjs/core");
    if (typeof sdk.Claw !== "function") throw new Error("@clawjs/claw local import failed");
    if (typeof cli.runCli !== "function") throw new Error("@clawjs/cli local import failed");
    if (typeof core.clawApiPath !== "function") throw new Error("@clawjs/core local import failed");
  `], { cwd: generatedRoot, stdio: "inherit" });

  const moduleResult = await runCliCapture(["modules", "install", "health", "--source", "--source-root", repoRoot, "--json"], generatedRoot);
  const modulePayload = JSON.parse(moduleResult.stdout) as { data: { installCommand: string } };
  runShell(modulePayload.data.installCommand, generatedRoot);
  assertNoClawjsRegistryResolutions(generatedRoot);

  execFileSync(process.execPath, ["--input-type=module", "-e", `
    const dense = await import("@clawjs/domain-pack-dense-data");
    if (typeof dense.runProfessionalRecordsCli !== "function") throw new Error("dense source pack import failed");
  `], { cwd: generatedRoot, stdio: "inherit" });
});

function runNpm(args: string[], cwd: string): void {
  const result = spawnSync("npm", args, {
    cwd,
    stdio: "inherit",
    env: {
      ...process.env,
      npm_config_audit: "false",
      npm_config_fund: "false",
    },
  });
  assert.equal(result.status, 0);
}

function runShell(command: string, cwd: string): void {
  const result = spawnSync("/bin/zsh", ["-lc", command], {
    cwd,
    stdio: "inherit",
    env: {
      ...process.env,
      npm_config_audit: "false",
      npm_config_fund: "false",
    },
  });
  assert.equal(result.status, 0);
}

function assertNoClawjsRegistryResolutions(projectRoot: string): void {
  const lockPath = path.join(projectRoot, "package-lock.json");
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8")) as { packages?: Record<string, { resolved?: string }> };
  for (const [entryPath, entry] of Object.entries(lock.packages ?? {})) {
    if (!/(^|\/)node_modules\/@clawjs\/[^/]+$/.test(entryPath)) continue;
    assert.equal(String(entry.resolved ?? "").includes("registry.npmjs.org"), false, `${entryPath} resolved from npm registry`);
  }
}
