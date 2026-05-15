import fs from "node:fs";
import path from "node:path";

const scriptRootDir = path.resolve(new URL("..", import.meta.url).pathname);
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
for (const file of packageFiles) {
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  const nameViolation = packageNameViolation(parsed.name, file);
  if (nameViolation) violations.push(nameViolation);
  violations.push(...binViolations(parsed.bin, file));
}

if (violations.length > 0) {
  console.error("Package surface guard failed:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(`Package surface guard passed (${packageFiles.length} package.json files)`);
