#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const args = new Set(process.argv.slice(2));
let releaseMode = args.has("--release");
const selfTest = args.has("--self-test");
const errors = [];

const ignoredDirs = new Set([
  ".git",
  ".claude",
  ".codex",
  ".next",
  ".tmp",
  ".tmp-pack-smoke",
  "artifacts",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "output",
  "playwright-report",
  "test-results",
]);

function fail(message) {
  errors.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function exists(relativePath) {
  return fs.existsSync(path.join(rootDir, relativePath));
}

function listFiles(relativeDir, predicate, output = []) {
  const absoluteDir = path.join(rootDir, relativeDir);
  if (!fs.existsSync(absoluteDir)) return output;
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const next = path.join(relativeDir, entry.name).split(path.sep).join("/");
    if (entry.isDirectory()) listFiles(next, predicate, output);
    else if (entry.isFile() && predicate(next)) output.push(next);
  }
  return output.sort();
}

function requireSnippet(relativePath, snippet) {
  if (!exists(relativePath)) {
    fail(`${relativePath} is missing`);
    return;
  }
  if (!read(relativePath).includes(snippet)) fail(`${relativePath} must mention ${snippet}`);
}

function validateControl(surface, fieldName) {
  const control = surface[fieldName];
  if (!control || typeof control !== "object" || Array.isArray(control)) {
    fail(`${surface.id}.${fieldName} must be an object`);
    return;
  }
  if (!["pass", "baseline_exception", "external_pending"].includes(control.status)) {
    fail(`${surface.id}.${fieldName}.status must be pass, baseline_exception, or external_pending`);
  }
  if (typeof control.evidence !== "string" || control.evidence.trim() === "") {
    fail(`${surface.id}.${fieldName}.evidence must be non-empty`);
  }
  if (control.status !== "pass" && typeof control.exception !== "string") {
    fail(`${surface.id}.${fieldName} with ${control.status} must record an exception`);
  }
  const acceptedTemplateLockfileException = fieldName === "lockfile"
    && surface.dependencyScope === "template"
    && control.status === "baseline_exception";
  if (releaseMode && surface.releaseCritical && control.status !== "pass" && !acceptedTemplateLockfileException) {
    fail(`${surface.id}.${fieldName} blocks release: ${control.status}`);
  }
}

function validateManifest(manifest = readJson("docs/supply-chain-security.manifest.json")) {
  if (manifest.schemaVersion !== 1) fail("supply-chain manifest schemaVersion must be 1");
  const policy = manifest.policy ?? {};
  if (policy.mode !== "baseline-plus-release-hard-fail") fail("manifest policy.mode must be baseline-plus-release-hard-fail");
  if (policy.releaseHardFail !== true) fail("manifest policy.releaseHardFail must be true");
  if (policy.sbomFormat !== "CycloneDX JSON") fail("manifest policy.sbomFormat must be CycloneDX JSON");
  if (!String(policy.provenanceTarget ?? "").includes("SLSA Build L2")) fail("manifest policy.provenanceTarget must target SLSA Build L2");
  const sla = policy.vulnerabilitySla ?? {};
  for (const [field, value] of Object.entries({ acknowledgeHours: 48, criticalPlanHours: 24, criticalFixHours: 72, highDays: 7, mediumDays: 30, lowDays: 90 })) {
    if (sla[field] !== value) fail(`manifest vulnerabilitySla.${field} must be ${value}`);
  }
  const surfaces = manifest.surfaces;
  if (!Array.isArray(surfaces) || surfaces.length === 0) fail("manifest.surfaces must be a non-empty array");
  const ids = new Set();
  for (const surface of surfaces ?? []) {
    if (!surface.id || ids.has(surface.id)) fail(`surface id is missing or duplicated: ${surface.id}`);
    ids.add(surface.id);
    if (!surface.kind) fail(`${surface.id}.kind is required`);
    if (!surface.path || !exists(surface.path)) fail(`${surface.id}.path does not exist: ${surface.path}`);
    if (typeof surface.releaseCritical !== "boolean") fail(`${surface.id}.releaseCritical must be boolean`);
    for (const field of ["lockfile", "sbom", "provenance", "dependencyReview", "vulnerabilityTriage", "artifactIntegrity", "malwareReview"]) {
      validateControl(surface, field);
    }
  }
}

function validatePackageManagerPin() {
  const rootPackage = readJson("package.json");
  if (!/^npm@\d+\.\d+\.\d+$/u.test(rootPackage.packageManager ?? "")) {
    fail("package.json must pin packageManager as npm@<major>.<minor>.<patch>");
  }
}

function validateCodeowners() {
  requireSnippet(".github/CODEOWNERS", "package.json");
  requireSnippet(".github/CODEOWNERS", "package-lock.json");
  requireSnippet(".github/CODEOWNERS", "docs/supply-chain-security");
  requireSnippet(".github/CODEOWNERS", "scripts/supply-chain-security-check.mjs");
}

function dependencySections(packageJson) {
  return [
    ["dependencies", packageJson.dependencies ?? {}],
    ["devDependencies", packageJson.devDependencies ?? {}],
    ["optionalDependencies", packageJson.optionalDependencies ?? {}],
    ["peerDependencies", packageJson.peerDependencies ?? {}],
  ];
}

function validateDependencySpecs() {
  const packageFiles = listFiles(".", (file) => path.basename(file) === "package.json");
  const unsafeSpec = /^(?:file:|https?:|git\+|github:)|\.(?:tgz|tar\.gz)$/u;
  for (const relativePath of packageFiles) {
    const packageJson = readJson(relativePath);
    for (const [section, entries] of dependencySections(packageJson)) {
      for (const [name, spec] of Object.entries(entries)) {
        if (typeof spec !== "string") continue;
        if (spec.startsWith("file:") && isReviewedInternalFileDependency(relativePath, name, spec)) continue;
        if (unsafeSpec.test(spec)) {
          fail(`${relativePath} ${section}.${name} uses unreviewed non-registry spec ${spec}`);
        }
      }
    }
  }
}

function isReviewedInternalFileDependency(relativePath, dependencyName, spec) {
  if (!dependencyName.startsWith("@clawjs/")) return false;
  if (spec.startsWith("file:../packages/") || spec.startsWith("file:../../packages/")) return true;
  const packageDir = path.dirname(path.join(rootDir, relativePath));
  const target = path.resolve(packageDir, spec.slice("file:".length));
  const relativeTarget = path.relative(rootDir, target).split(path.sep).join("/");
  return relativeTarget.startsWith("packages/") && exists(path.join(relativeTarget, "package.json").split(path.sep).join("/"));
}

function validatePublicPackagePrepublish() {
  const packageFiles = fs.readdirSync(path.join(rootDir, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `packages/${entry.name}/package.json`)
    .filter(exists);
  for (const relativePath of packageFiles) {
    const packageJson = readJson(relativePath);
    if (packageJson.private) continue;
    const prepublishOnly = packageJson.scripts?.prepublishOnly ?? "";
    if (!prepublishOnly.includes("supply-chain-security-check.mjs --release")) {
      fail(`${relativePath} public package must run supply-chain-security-check.mjs --release in prepublishOnly`);
    }
  }
}

function validateReleaseScripts() {
  const scripts = readJson("package.json").scripts ?? {};
  for (const name of ["test:docs", "publish:dry-run", "release:publish", "publish:packages"]) {
    if (!String(scripts[name] ?? "").includes("supply-chain-security-check.mjs")) {
      fail(`package.json script ${name} must run scripts/supply-chain-security-check.mjs`);
    }
  }
  for (const name of ["publish:dry-run", "release:publish", "publish:packages"]) {
    if (!String(scripts[name] ?? "").includes("supply-chain-security-check.mjs --release")) {
      fail(`package.json script ${name} must run scripts/supply-chain-security-check.mjs --release`);
    }
  }
}

function validateDocs() {
  for (const [file, snippets] of [
    ["docs/supply-chain-security.md", ["CycloneDX JSON", "SLSA", "trusted publishing", "claw verify release", "claw verify plugin", "72 hours"]],
    ["docs/adr/0051-supply-chain-security-governance.md", ["baseline", "release-critical", "claw verify"]],
    ["SECURITY.md", ["Supply-chain security"]],
    ["RELEASING.md", ["Supply-chain evidence"]],
    [".github/PULL_REQUEST_TEMPLATE.md", ["Dependency and supply-chain review"]],
    ["docs/decision-map.md", ["Supply-chain security governance", "scripts/supply-chain-security-check.mjs"]],
    ["docs/discoverability.registry.json", ["supply-chain-security-check.mjs"]],
  ]) {
    for (const snippet of snippets) requireSnippet(file, snippet);
  }
}

function runCheck() {
  validateManifest();
  validatePackageManagerPin();
  validateCodeowners();
  validateDependencySpecs();
  validatePublicPackagePrepublish();
  validateReleaseScripts();
  validateDocs();
}

function runSelfTest() {
  const validManifest = {
    schemaVersion: 1,
    policy: {
      mode: "baseline-plus-release-hard-fail",
      releaseHardFail: true,
      sbomFormat: "CycloneDX JSON",
      provenanceTarget: "SLSA Build L2 for CI-built official artifacts",
      vulnerabilitySla: { acknowledgeHours: 48, criticalPlanHours: 24, criticalFixHours: 72, highDays: 7, mediumDays: 30, lowDays: 90 },
    },
    surfaces: [{
      id: "fixture",
      kind: "npm-workspace",
      path: "package.json",
      releaseCritical: true,
      dependencyScope: "runtime",
      lockfile: { status: "pass", evidence: "package-lock.json" },
      sbom: { status: "pass", evidence: "fixture" },
      provenance: { status: "pass", evidence: "fixture" },
      dependencyReview: { status: "pass", evidence: "fixture" },
      vulnerabilityTriage: { status: "pass", evidence: "fixture" },
      artifactIntegrity: { status: "pass", evidence: "fixture" },
      malwareReview: { status: "pass", evidence: "fixture" },
    }],
  };
  errors.length = 0;
  validateManifest(validManifest);
  assert.equal(errors.length, 0);

  const invalidManifest = structuredClone(validManifest);
  invalidManifest.surfaces[0].sbom = { status: "baseline_exception", evidence: "missing", exception: "fixture" };
  errors.length = 0;
  const previousReleaseMode = releaseMode;
  releaseMode = true;
  validateManifest(invalidManifest);
  releaseMode = previousReleaseMode;
  assert(errors.some((error) => error.includes("fixture.sbom blocks release")));
  errors.length = 0;

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-supply-chain-fixture-"));
  fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify({ dependencies: { bad: "git+https://example.invalid/repo.git" } }));
  assert(fs.existsSync(tempDir));
}

if (selfTest) {
  runSelfTest();
  console.log("Supply-chain security check self-test passed");
  process.exit(0);
}

runCheck();
if (errors.length > 0) {
  console.error("Supply-chain security check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Supply-chain security check passed${releaseMode ? " (release)" : ""}`);
