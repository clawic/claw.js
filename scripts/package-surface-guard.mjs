import fs from "node:fs";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { createDiagnostic, printActionableFailureReport } from "./actionable-error.mjs";

const cwd = process.cwd();
const args = process.argv.slice(2);
const ownerArgIndex = args.indexOf("--owner");
const stewardArgIndex = args.indexOf("--steward");
const surfaceSteward = stewardArgIndex >= 0
  ? args[stewardArgIndex + 1]
  : ownerArgIndex >= 0
    ? args[ownerArgIndex + 1]
    : "clawjs";
const optionValueIndexes = new Set([ownerArgIndex + 1, stewardArgIndex + 1].filter((index) => index > 0));
const targets = args.filter((arg, index) => !arg.startsWith("--") && !optionValueIndexes.has(index));

const ignoredDirs = new Set([
  "node_modules",
  "dist",
  ".git",
  ".build",
  "build",
  ".next",
  ".next-e2e",
  ".tmp",
  ".tmp-pack-smoke",
  [".cl", "aude"].join(""),
  "coverage",
  "artifacts",
  "test-results",
  "playwright-report",
  "output",
]);

const clawjsUnscopedPackages = new Set([
  "create-claw-app",
  "create-claw-agent",
  "create-claw-server",
  "create-claw-plugin",
  "eslint-config-claw",
]);
const clawjsAllowedBins = new Set([
  "claw",
  "create-claw-app",
  "create-claw-agent",
  "create-claw-server",
  "create-claw-plugin",
  "claw-search-mcp",
]);
const clawixAllowedUnscopedPackages = new Set(["clawix"]);
const clawixAllowedBins = new Set(["clawix"]);

if (process.argv.includes("--self-test")) {
  runSelfTest();
  process.exit(0);
}

if (!["clawjs", "clawix"].includes(surfaceSteward)) {
  printActionableFailureReport({
    title: "Package surface guard usage error:",
    diagnostics: [usageDiagnostic("package_surface_invalid_steward", `unsupported surface steward ${surfaceSteward}`)],
  });
  process.exit(64);
}
if (targets.length === 0) {
  printActionableFailureReport({
    title: "Package surface guard usage error:",
    diagnostics: [usageDiagnostic("package_surface_missing_target", "missing file-or-dir target")],
  });
  process.exit(64);
}

function listPackageFiles(targetPath) {
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) return path.basename(targetPath) === "package.json" ? [targetPath] : [];
  return fs.readdirSync(targetPath, { withFileTypes: true }).flatMap((entry) => {
    if (ignoredDirs.has(entry.name)) return [];
    const next = path.join(targetPath, entry.name);
    if (entry.isDirectory()) return listPackageFiles(next);
    return entry.name === "package.json" ? [next] : [];
  });
}

function relative(filePath) {
  return path.relative(cwd, filePath) || filePath;
}

function isTemplateName(name) {
  return name === "__APP_NAME__";
}

function usageDiagnostic(code, message) {
  return createDiagnostic(code, message, {
    status: "USAGE",
    location: "scripts/package-surface-guard.mjs",
    suggestion: "Use a known owner and pass at least one package file or directory.",
    safeNextStep: "Run node scripts/package-surface-guard.mjs [--steward clawjs|clawix] <file-or-dir>...",
  });
}

function packageSurfaceDiagnostic(code, message, options = {}) {
  return createDiagnostic(code, message, {
    location: options.location ?? "package.json",
    suggestion: options.suggestion ?? "Keep package names, bins, and release gates aligned with the owning public surface.",
    safeNextStep: options.safeNextStep ?? "Fix the package surface issue, then rerun node scripts/package-surface-guard.mjs.",
  });
}

function packageNameViolation(name, file) {
  if (!name || isTemplateName(name)) return undefined;
  if (surfaceSteward === "clawjs") {
    if (name.startsWith("@clawjs/")) return undefined;
    if (clawjsUnscopedPackages.has(name)) return undefined;
    return packageSurfaceDiagnostic("package_surface_name_invalid", `${relative(file)} package name "${name}" must be @clawjs/* or an approved unscoped generator/config package`, {
      location: relative(file),
      suggestion: "Use the @clawjs scope unless this package is an approved generator/config exception.",
      safeNextStep: `Rename ${relative(file)} or add a reviewed unscoped exception in scripts/package-surface-guard.mjs.`,
    });
  }
  if (name.startsWith("@clawix/")) return undefined;
  if (clawixAllowedUnscopedPackages.has(name)) return undefined;
  return packageSurfaceDiagnostic("package_surface_name_invalid", `${relative(file)} package name "${name}" must be @clawix/* or the approved clawix product-host CLI package`, {
    location: relative(file),
    suggestion: "Use the @clawix scope unless this is the approved product-host CLI package.",
    safeNextStep: `Rename ${relative(file)} or add a reviewed Clawix exception in scripts/package-surface-guard.mjs.`,
  });
}

function binViolations(bin, file) {
  const entries = typeof bin === "string"
    ? [[path.basename(bin), bin]]
    : bin && typeof bin === "object" && !Array.isArray(bin)
      ? Object.entries(bin)
      : [];
  const allowed = surfaceSteward === "clawjs" ? clawjsAllowedBins : clawixAllowedBins;
  return entries.flatMap(([key, target]) => {
    const findings = [];
    if (!allowed.has(key)) {
      findings.push(packageSurfaceDiagnostic("package_surface_bin_invalid", `${relative(file)} exposes unapproved bin "${key}"`, {
        location: relative(file),
        suggestion: "Expose only approved CLI binary names for this owner.",
        safeNextStep: `Rename or remove bin "${key}" in ${relative(file)}, then rerun node scripts/package-surface-guard.mjs.`,
      }));
    }
    findings.push(...binTargetViolations(key, target, file));
    return findings;
  });
}

function binTargetViolations(key, target, file) {
  if (typeof target !== "string" || target.trim() === "") {
    return [packageSurfaceDiagnostic("package_surface_bin_target_invalid", `${relative(file)} bin "${key}" must point to a package-local executable file`, {
      location: relative(file),
      suggestion: "Use a non-empty relative path for every package bin target.",
      safeNextStep: `Set bin "${key}" in ${relative(file)} to an existing file inside its package directory.`,
    })];
  }
  if (path.isAbsolute(target)) {
    return [packageSurfaceDiagnostic("package_surface_bin_target_invalid", `${relative(file)} bin "${key}" must not use absolute path "${target}"`, {
      location: relative(file),
      suggestion: "Package bin targets must be relative paths inside the package.",
      safeNextStep: `Replace bin "${key}" in ${relative(file)} with a package-local relative path.`,
    })];
  }
  const packageDir = path.dirname(file);
  const resolved = path.resolve(packageDir, target);
  const relativeTarget = path.relative(packageDir, resolved);
  if (relativeTarget.startsWith("..") || path.isAbsolute(relativeTarget)) {
    return [packageSurfaceDiagnostic("package_surface_bin_target_invalid", `${relative(file)} bin "${key}" escapes its package directory`, {
      location: relative(file),
      suggestion: "Package bin targets must stay inside the owning package directory.",
      safeNextStep: `Move bin "${key}" under ${relative(packageDir)} or remove the bin entry.`,
    })];
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return [packageSurfaceDiagnostic("package_surface_bin_target_missing", `${relative(file)} bin "${key}" points to missing file "${target}"`, {
      location: relative(file),
      suggestion: "Package bin metadata must point at a checked-in executable entrypoint.",
      safeNextStep: `Create ${relative(resolved)} or update bin "${key}" in ${relative(file)}.`,
    })];
  }
  return [];
}

const packageFiles = targets.flatMap((target) => listPackageFiles(path.resolve(cwd, target)));
const violations = [];
const packageEntriesByName = new Map();
for (const file of packageFiles) {
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  if (typeof parsed.name === "string") {
    packageEntriesByName.set(parsed.name, { file, manifest: parsed });
  }
  const nameViolation = packageNameViolation(parsed.name, file);
  if (nameViolation) violations.push(nameViolation);
  violations.push(...binViolations(parsed.bin, file));
}

if (surfaceSteward === "clawjs") {
  const rootPackageJsonPath = path.join(cwd, "package.json");
  const buildPackagesPath = path.join(cwd, "scripts", "build-packages.mjs");
  const packSmokePath = path.join(cwd, "scripts", "pack-smoke.mjs");
  if (fs.existsSync(rootPackageJsonPath) && fs.existsSync(buildPackagesPath) && fs.existsSync(packSmokePath)) {
    const rootPackageJson = JSON.parse(fs.readFileSync(rootPackageJsonPath, "utf8"));
    const buildPackages = fs.readFileSync(buildPackagesPath, "utf8");
    const packSmoke = fs.readFileSync(packSmokePath, "utf8");
    const cliManifest = packageEntriesByName.get("@clawjs/cli")?.manifest;
    const releaseCriticalPackages = new Set([
      "@clawjs/cli",
      "@clawjs/search-mcp",
      ...Object.keys(cliManifest?.dependencies ?? {}).filter((dependency) => dependency.startsWith("@clawjs/")),
    ]);
    const releaseGateScripts = {
      "release:version": "release-version",
      "release:publish": "release-publish",
      "publish:packages": "publish-packages",
    };
    for (const [scriptName, approvalTarget] of Object.entries(releaseGateScripts)) {
      const script = rootPackageJson.scripts?.[scriptName] ?? "";
      if (!script.includes("version-governance-check.mjs --release-gate")) {
        violations.push(packageSurfaceDiagnostic("package_surface_release_gate_missing", `package.json ${scriptName} must run the pre-v1 release approval gate`, {
          location: "package.json",
          suggestion: "Release scripts must enforce exact approval before versioning or publishing.",
        }));
      }
      if (!script.includes("verify-regulated-domain-safety-goal.mjs")) {
        violations.push(packageSurfaceDiagnostic("package_surface_release_gate_missing", `package.json ${scriptName} must run the regulated-domain legal release gate`, {
          location: "package.json",
          suggestion: "Release scripts must run regulated-domain safety before publishing.",
        }));
      }
      if (!script.includes("supply-chain-security-check.mjs --release")) {
        violations.push(packageSurfaceDiagnostic("package_surface_release_gate_missing", `package.json ${scriptName} must run the supply-chain release gate`, {
          location: "package.json",
          suggestion: "Release scripts must run the supply-chain release guard.",
        }));
      }
      if (!fs.readFileSync(path.join(cwd, "RELEASING.md"), "utf8").includes(`CLAW_RELEASE_APPROVED_FOR=${approvalTarget}`)) {
        violations.push(packageSurfaceDiagnostic("package_surface_release_approval_missing", `RELEASING.md must document exact release approval ${approvalTarget}`, {
          location: "RELEASING.md",
          suggestion: "Document the exact release approval marker required for this release path.",
        }));
      }
    }

    for (const packageName of releaseCriticalPackages) {
      const entry = packageEntriesByName.get(packageName);
      if (!entry) {
        violations.push(packageSurfaceDiagnostic("package_surface_release_package_missing", `release-critical package ${packageName} is missing from workspace package scan`, {
          location: "package.json",
          suggestion: "Keep release-critical packages discoverable in the workspace package scan.",
        }));
        continue;
      }
      const packageDir = path.basename(path.dirname(entry.file));
      if (!buildPackages.includes(`"${packageName}"`)) {
        violations.push(packageSurfaceDiagnostic("package_surface_release_build_missing", `scripts/build-packages.mjs must build release-critical package ${packageName}`, {
          location: "scripts/build-packages.mjs",
          suggestion: "Build every release-critical package before packaging or publishing.",
        }));
      }
      if (!packSmoke.includes(`"packages", "${packageDir}"`)) {
        violations.push(packageSurfaceDiagnostic("package_surface_release_pack_missing", `scripts/pack-smoke.mjs must pack local tarball for release-critical package ${packageName}`, {
          location: "scripts/pack-smoke.mjs",
          suggestion: "Pack every release-critical package in the local smoke test.",
        }));
      }
      for (const scriptName of ["publish:dry-run", "publish:packages"]) {
        const script = rootPackageJson.scripts?.[scriptName] ?? "";
        if (!script.includes(`--workspace ${packageName}`)) {
          violations.push(packageSurfaceDiagnostic("package_surface_release_workspace_missing", `package.json ${scriptName} must include release-critical package ${packageName}`, {
            location: "package.json",
            suggestion: "Publish and dry-run every release-critical workspace explicitly.",
          }));
        }
      }
    }

    for (const { file, manifest } of packageEntriesByName.values()) {
      if (manifest.private || manifest.publishConfig?.access !== "public") continue;
      const prepublishOnly = manifest.scripts?.prepublishOnly ?? "";
      if (!prepublishOnly.includes("verify-regulated-domain-safety-goal.mjs")) {
        violations.push(packageSurfaceDiagnostic("package_surface_public_prepublish_gate_missing", `${relative(file)} public package must run regulated-domain legal gate in prepublishOnly`, {
          location: relative(file),
          suggestion: "Public package prepublishOnly must run regulated-domain safety.",
        }));
      }
      if (!prepublishOnly.includes("version-governance-check.mjs --release-gate")) {
        violations.push(packageSurfaceDiagnostic("package_surface_public_prepublish_gate_missing", `${relative(file)} public package must run exact release approval gate in prepublishOnly`, {
          location: relative(file),
          suggestion: "Public package prepublishOnly must require exact release approval.",
        }));
      }
      if (!prepublishOnly.includes("supply-chain-security-check.mjs --release")) {
        violations.push(packageSurfaceDiagnostic("package_surface_public_prepublish_gate_missing", `${relative(file)} public package must run supply-chain release gate in prepublishOnly`, {
          location: relative(file),
          suggestion: "Public package prepublishOnly must run the supply-chain release guard.",
        }));
      }
    }
  }
}

if (violations.length > 0) {
  printActionableFailureReport({
    title: "Package surface guard failed:",
    diagnostics: violations,
  });
  process.exit(1);
}

console.log(`Package surface guard passed (${packageFiles.length} package.json files)`);

function runSelfTest() {
  const chunks = [];
  printActionableFailureReport({
    title: "Package surface guard failed for /Users/example/private:",
    diagnostics: [
      packageSurfaceDiagnostic("package_surface_name_invalid", "packages/bad/package.json package name \"token: sk-test-secret-123456\" must be @clawjs/*", {
        location: "/Users/example/private/packages/bad/package.json",
        suggestion: "Use the @clawjs scope unless this package is an approved generator/config exception.",
        safeNextStep: "Rename the package or add a reviewed exception.",
      }),
      usageDiagnostic("package_surface_missing_target", "missing file-or-dir target"),
    ],
    stream: { write: (chunk) => chunks.push(chunk) },
  });
  const output = chunks.join("");
  assert.match(output, /code: package_surface_name_invalid/);
  assert.match(output, /code: package_surface_missing_target/);
  assert.match(output, /location: ~\/private\/packages\/bad\/package\.json/);
  assert.match(output, /suggestion: Use the @clawjs scope/);
  assert.match(output, /next: Rename the package/);
  assert.doesNotMatch(output, /\/Users\/example/);
  assert.doesNotMatch(output, /sk-test-secret-123456/);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "package-surface-guard-"));
  try {
    const packageDir = path.join(tempRoot, "pkg");
    fs.mkdirSync(path.join(packageDir, "bin"), { recursive: true });
    const file = path.join(packageDir, "package.json");
    fs.writeFileSync(path.join(packageDir, "bin", "claw.mjs"), "#!/usr/bin/env node\n");
    const binFindings = binViolations({
      claw: "bin/claw.mjs",
      "create-claw-app": "bin/missing.mjs",
      "create-claw-agent": "../escaped.mjs",
      "create-claw-plugin": 42,
    }, file);
    assert.equal(binFindings.some((finding) => finding.code === "package_surface_bin_target_missing"), true);
    assert.equal(binFindings.filter((finding) => finding.code === "package_surface_bin_target_invalid").length, 2);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  console.log("package surface guard self-test passed");
}
