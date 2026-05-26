#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createDiagnostic, printActionableFailureReport } from "./actionable-error.mjs";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const clawBin = path.join(rootDir, "packages", "clawjs", "bin", "claw.mjs");
const diagnostics = [];

try {
  verifyPackageScripts();
  verifySourceCommandRegistry();
  verifyScaffoldSourceMode();
  verifyModulesSourceMode();
} catch (error) {
  diagnostics.push(diagnostic("source_mode_guard_failed", error instanceof Error ? error.message : String(error), {
    location: "scripts/verify-source-mode.mjs",
  }));
}

if (diagnostics.length > 0) {
  printActionableFailureReport({
    title: "Source mode verification failed:",
    diagnostics,
  });
  process.exit(1);
}

console.log("source mode verification passed");

function verifyPackageScripts() {
  const packageJson = readJson("package.json");
  for (const scriptName of ["source:activate", "source:status", "source:verify"]) {
    if (!packageJson.scripts?.[scriptName]?.includes("scripts/source-mode.mjs")) {
      diagnostics.push(diagnostic("source_mode_script_missing", `package.json must define ${scriptName} through scripts/source-mode.mjs`, {
        location: "package.json",
      }));
    }
  }
  if (!packageJson.scripts?.["test:docs"]?.includes("verify-source-mode.mjs")) {
    diagnostics.push(diagnostic("source_mode_docs_gate_missing", "npm run test:docs must run scripts/verify-source-mode.mjs", {
      location: "package.json",
    }));
  }
}

function verifySourceCommandRegistry() {
  const registry = fs.readFileSync(path.join(rootDir, "packages", "clawjs-core", "src", "cli-command-registry.ts"), "utf8");
  const router = fs.readFileSync(path.join(rootDir, "packages", "clawjs", "src", "cli-router.generated.ts"), "utf8");
  const cliIndex = fs.readFileSync(path.join(rootDir, "packages", "clawjs", "src", "index.ts"), "utf8");
  if (!registry.includes('name: "source"') || !registry.includes("runSourceCli")) {
    diagnostics.push(diagnostic("source_mode_registry_missing", "The public CLI registry must include claw source.", {
      location: "packages/clawjs-core/src/cli-command-registry.ts",
    }));
  }
  if (!router.includes('name: "source"')) {
    diagnostics.push(diagnostic("source_mode_router_missing", "The generated CLI router must include claw source.", {
      location: "packages/clawjs/src/cli-router.generated.ts",
    }));
  }
  if (!cliIndex.includes('group === "source"') || !cliIndex.includes("cli-source-command")) {
    diagnostics.push(diagnostic("source_mode_route_missing", "The CLI dispatcher must route claw source before legacy fallback.", {
      location: "packages/clawjs/src/index.ts",
    }));
  }
}

function verifyScaffoldSourceMode() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-source-guard-"));
  const result = spawnSync(process.execPath, [
    clawBin,
    "new",
    "workspace",
    "demo-workspace",
    "--source",
    "--source-root",
    rootDir,
    "--no-install",
    "--json",
  ], {
    cwd: tempRoot,
    encoding: "utf8",
    env: { ...process.env, CLAWJS_SOURCE_ROOT: "" },
  });
  if (result.status !== 0) {
    diagnostics.push(diagnostic("source_mode_scaffold_failed", `claw new --source failed: ${result.stderr || result.stdout}`, {
      location: "packages/clawjs/src/scaffold.ts",
    }));
    return;
  }
  const generatedRoot = path.join(tempRoot, "demo-workspace");
  const packageJson = JSON.parse(fs.readFileSync(path.join(generatedRoot, "package.json"), "utf8"));
  const sourceManifest = JSON.parse(fs.readFileSync(path.join(generatedRoot, "claw.source.json"), "utf8"));
  const npmrc = fs.readFileSync(path.join(generatedRoot, ".npmrc"), "utf8");
  const internalSpecs = Object.entries({
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
    ...packageJson.optionalDependencies,
    ...packageJson.peerDependencies,
  }).filter(([packageName]) => packageName.startsWith("@clawjs/"));

  if (!npmrc.includes("install-links=true")) {
    diagnostics.push(diagnostic("source_mode_npmrc_missing", "Generated source projects must set install-links=true.", {
      location: path.join(generatedRoot, ".npmrc"),
    }));
  }
  if (sourceManifest.trustLabel !== "source" || sourceManifest.sourceRoot !== rootDir) {
    diagnostics.push(diagnostic("source_mode_manifest_invalid", "Generated source projects must write claw.source.json with trustLabel source and sourceRoot.", {
      location: path.join(generatedRoot, "claw.source.json"),
    }));
  }
  const nonSourceSpec = internalSpecs.find(([, version]) => !String(version).startsWith("file:"));
  if (nonSourceSpec) {
    diagnostics.push(diagnostic("source_mode_internal_dependency_not_local", `${nonSourceSpec[0]} must resolve through a local file: spec in source mode.`, {
      location: path.join(generatedRoot, "package.json"),
    }));
  }
  if (!("@clawjs/core" in (packageJson.dependencies ?? {}))) {
    diagnostics.push(diagnostic("source_mode_transitive_missing", "Generated source projects must add transitive @clawjs/core as a local dependency.", {
      location: path.join(generatedRoot, "package.json"),
    }));
  }
}

function verifyModulesSourceMode() {
  const result = spawnSync(process.execPath, [
    clawBin,
    "modules",
    "install",
    "health",
    "--source",
    "--source-root",
    rootDir,
    "--json",
  ], {
    cwd: rootDir,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    diagnostics.push(diagnostic("source_mode_modules_failed", `claw modules install --source failed: ${result.stderr || result.stdout}`, {
      location: "packages/clawjs/src/cli-modules-command.ts",
    }));
    return;
  }
  const payload = JSON.parse(result.stdout);
  const installCommand = payload.data?.installCommand ?? "";
  if (!installCommand.includes("--install-links") || !installCommand.includes("packages/clawjs-domain-pack-dense-data") || !installCommand.includes("packages/clawjs-core")) {
    diagnostics.push(diagnostic("source_mode_modules_command_incomplete", "Source-mode module install guidance must include local package file specs for the optional pack and internal closure.", {
      location: "packages/clawjs/src/cli-modules-command.ts",
    }));
  }
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), "utf8"));
}

function diagnostic(code, message, options) {
  return createDiagnostic(code, message, {
    location: options.location,
    suggestion: "Keep source mode explicit, verifiable, and free of registry-resolved @clawjs/* packages.",
    safeNextStep: "Fix the source mode implementation or documentation, then rerun node scripts/verify-source-mode.mjs.",
  });
}
