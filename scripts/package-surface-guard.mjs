import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const args = process.argv.slice(2);
const ownerArgIndex = args.indexOf("--owner");
const owner = ownerArgIndex >= 0 ? args[ownerArgIndex + 1] : "clawjs";
const targets = args.filter((arg, index) => !arg.startsWith("--") && index !== ownerArgIndex + 1);

if (!["clawjs", "clawix"].includes(owner)) {
  console.error("Usage: node scripts/package-surface-guard.mjs [--owner clawjs|clawix] <file-or-dir>...");
  process.exit(64);
}
if (targets.length === 0) {
  console.error("Usage: node scripts/package-surface-guard.mjs [--owner clawjs|clawix] <file-or-dir>...");
  process.exit(64);
}

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
  ".claude",
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

function packageNameViolation(name, file) {
  if (!name || isTemplateName(name)) return undefined;
  if (owner === "clawjs") {
    if (name.startsWith("@clawjs/")) return undefined;
    if (clawjsUnscopedPackages.has(name)) return undefined;
    return `${relative(file)} package name "${name}" must be @clawjs/* or an approved unscoped generator/config package`;
  }
  if (name.startsWith("@clawix/")) return undefined;
  if (clawixAllowedUnscopedPackages.has(name)) return undefined;
  return `${relative(file)} package name "${name}" must be @clawix/* or the approved clawix product-host CLI package`;
}

function binViolations(bin, file) {
  const keys = typeof bin === "string"
    ? [path.basename(bin)]
    : bin && typeof bin === "object" && !Array.isArray(bin)
      ? Object.keys(bin)
      : [];
  const allowed = owner === "clawjs" ? clawjsAllowedBins : clawixAllowedBins;
  return keys
    .filter((key) => !allowed.has(key))
    .map((key) => `${relative(file)} exposes unapproved bin "${key}"`);
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

if (owner === "clawjs") {
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
        violations.push(`package.json ${scriptName} must run the pre-v1 release approval gate`);
      }
      if (!script.includes("verify-regulated-domain-safety-goal.mjs")) {
        violations.push(`package.json ${scriptName} must run the regulated-domain legal release gate`);
      }
      if (!script.includes("supply-chain-security-check.mjs --release")) {
        violations.push(`package.json ${scriptName} must run the supply-chain release gate`);
      }
      if (!fs.readFileSync(path.join(cwd, "RELEASING.md"), "utf8").includes(`CLAW_RELEASE_APPROVED_FOR=${approvalTarget}`)) {
        violations.push(`RELEASING.md must document exact release approval ${approvalTarget}`);
      }
    }

    for (const packageName of releaseCriticalPackages) {
      const entry = packageEntriesByName.get(packageName);
      if (!entry) {
        violations.push(`release-critical package ${packageName} is missing from workspace package scan`);
        continue;
      }
      const packageDir = path.basename(path.dirname(entry.file));
      if (!buildPackages.includes(`"${packageName}"`)) {
        violations.push(`scripts/build-packages.mjs must build release-critical package ${packageName}`);
      }
      if (!packSmoke.includes(`"packages", "${packageDir}"`)) {
        violations.push(`scripts/pack-smoke.mjs must pack local tarball for release-critical package ${packageName}`);
      }
      for (const scriptName of ["publish:dry-run", "publish:packages"]) {
        const script = rootPackageJson.scripts?.[scriptName] ?? "";
        if (!script.includes(`--workspace ${packageName}`)) {
          violations.push(`package.json ${scriptName} must include release-critical package ${packageName}`);
        }
      }
    }

    for (const { file, manifest } of packageEntriesByName.values()) {
      if (manifest.private || manifest.publishConfig?.access !== "public") continue;
      const prepublishOnly = manifest.scripts?.prepublishOnly ?? "";
      if (!prepublishOnly.includes("verify-regulated-domain-safety-goal.mjs")) {
        violations.push(`${relative(file)} public package must run regulated-domain legal gate in prepublishOnly`);
      }
      if (!prepublishOnly.includes("version-governance-check.mjs --release-gate")) {
        violations.push(`${relative(file)} public package must run exact release approval gate in prepublishOnly`);
      }
      if (!prepublishOnly.includes("supply-chain-security-check.mjs --release")) {
        violations.push(`${relative(file)} public package must run supply-chain release gate in prepublishOnly`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error("Package surface guard failed:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(`Package surface guard passed (${packageFiles.length} package.json files)`);
