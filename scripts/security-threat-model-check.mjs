#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const scriptRoot = path.resolve(new URL("..", import.meta.url).pathname);
const allowedStatuses = new Set(["enforced", "partial", "external_pending"]);
const allowedThreatCategories = new Set([
  "spoofing",
  "tampering",
  "repudiation",
  "information_disclosure",
  "denial_of_service",
  "elevation_of_privilege",
]);

function parseArgs(argv) {
  const args = { root: scriptRoot, selfTest: false, profile: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") args.root = path.resolve(argv[++index]);
    else if (arg === "--profile") args.profile = argv[++index];
    else if (arg === "--self-test") args.selfTest = true;
  }
  args.profile ??= fs.existsSync(path.join(args.root, "macos")) ? "clawix" : "claw";
  return args;
}

const options = parseArgs(process.argv.slice(2));

function absolute(root, relativePath) {
  return path.join(root, relativePath);
}

function exists(root, relativePath) {
  return fs.existsSync(absolute(root, relativePath));
}

function read(root, relativePath) {
  return fs.readFileSync(absolute(root, relativePath), "utf8");
}

function readJson(root, relativePath) {
  return JSON.parse(read(root, relativePath));
}

function listFiles(root, relativeDir, predicate, output = []) {
  const dir = absolute(root, relativeDir);
  if (!fs.existsSync(dir)) return output;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relativePath = path.join(relativeDir, entry.name).split(path.sep).join("/");
    if (entry.isDirectory()) listFiles(root, relativePath, predicate, output);
    else if (entry.isFile() && predicate(relativePath)) output.push(relativePath);
  }
  return output.sort();
}

function isAcceptedAdr(root, relativePath) {
  const text = read(root, relativePath);
  return /^Status:\s*Accepted\b/im.test(text) || /^##\s+Status\s*\n+\s*Accepted\b/im.test(text);
}

function isDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function requireNonEmptyString(value, label, errors) {
  if (typeof value !== "string" || value.trim().length === 0) errors.push(`${label} must be a non-empty string`);
}

function requireNonEmptyArray(value, label, errors) {
  if (!Array.isArray(value) || value.length === 0) errors.push(`${label} must be a non-empty array`);
}

function validatePath(root, relativePath, label, errors) {
  if (typeof relativePath !== "string" || relativePath.trim().length === 0) {
    errors.push(`${label} must be a non-empty path`);
  } else if (!exists(root, relativePath)) {
    errors.push(`${label} references missing path ${relativePath}`);
  }
}

function coveredSet(rows, key) {
  const result = new Set();
  for (const row of rows) {
    for (const value of normalizeArray(row[key])) result.add(value);
  }
  return result;
}

function validateCoverage(root, errors) {
  const coveragePath = "docs/security-threat-model.coverage.json";
  validatePath(root, "docs/security-threat-model.md", "canonical threat model doc", errors);
  validatePath(root, "docs/adr/0039-global-threat-modeling-governance.md", "canonical threat model ADR", errors);
  validatePath(root, coveragePath, "threat model coverage", errors);
  if (errors.length > 0) return;

  const coverage = readJson(root, coveragePath);
  if (coverage.version !== 1) errors.push("docs/security-threat-model.coverage.json version must be 1");
  validatePath(root, coverage.canonicalDoc, "coverage.canonicalDoc", errors);
  validatePath(root, coverage.canonicalAdr, "coverage.canonicalAdr", errors);

  const requiredLayers = normalizeArray(coverage.requiredLayers);
  const rows = normalizeArray(coverage.rows);
  const rowsByLayer = new Map();
  const today = new Date().toISOString().slice(0, 10);

  requireNonEmptyArray(requiredLayers, "coverage.requiredLayers", errors);
  requireNonEmptyArray(rows, "coverage.rows", errors);

  for (const category of normalizeArray(coverage.requiredThreatCategories)) {
    if (!allowedThreatCategories.has(category)) errors.push(`unknown required threat category ${category}`);
  }

  for (const [index, row] of rows.entries()) {
    const label = row.id || `rows[${index}]`;
    requireNonEmptyString(row.id, `${label}.id`, errors);
    requireNonEmptyString(row.layer, `${label}.layer`, errors);
    requireNonEmptyArray(row.assets, `${label}.assets`, errors);
    requireNonEmptyString(row.trustBoundary, `${label}.trustBoundary`, errors);
    requireNonEmptyArray(row.adversaries, `${label}.adversaries`, errors);
    requireNonEmptyArray(row.threatCategories, `${label}.threatCategories`, errors);
    requireNonEmptyArray(row.controls, `${label}.controls`, errors);
    requireNonEmptyArray(row.validationEvidence, `${label}.validationEvidence`, errors);
    requireNonEmptyArray(row.adrs, `${label}.adrs`, errors);
    requireNonEmptyString(row.steward, `${label}.steward`, errors);
    if (!allowedStatuses.has(row.status)) errors.push(`${label}.status must be one of ${[...allowedStatuses].join(", ")}`);
    if (!isDate(row.reviewDate)) errors.push(`${label}.reviewDate must be YYYY-MM-DD`);
    else if (row.reviewDate < today) errors.push(`${label}.reviewDate expired on ${row.reviewDate}`);
    for (const category of normalizeArray(row.threatCategories)) {
      if (!allowedThreatCategories.has(category)) errors.push(`${label}.threatCategories contains unknown category ${category}`);
    }
    for (const adr of normalizeArray(row.adrs)) validatePath(root, adr, `${label}.adrs`, errors);
    rowsByLayer.set(row.layer, (rowsByLayer.get(row.layer) ?? 0) + 1);
  }

  for (const layer of requiredLayers) {
    if (!rowsByLayer.has(layer)) errors.push(`required threat layer ${layer} has no coverage row`);
  }

  const coveredAdrs = coveredSet(rows, "adrs");
  const acceptedAdrs = listFiles(root, "docs/adr", (file) => file.endsWith(".md") && !file.endsWith("TEMPLATE.md"))
    .filter((file) => isAcceptedAdr(root, file));
  for (const adr of normalizeArray(coverage.securitySensitiveAdrs)) {
    validatePath(root, adr, "coverage.securitySensitiveAdrs", errors);
    if (!acceptedAdrs.includes(adr)) errors.push(`${adr} is listed as security-sensitive but is not an accepted ADR`);
    if (!coveredAdrs.has(adr)) errors.push(`${adr} is security-sensitive but is not covered by a threat model row`);
  }

  const coveredSurfaces = coveredSet(rows, "surfaces");
  for (const surface of normalizeArray(coverage.requiredCriticalSurfaces)) {
    if (!coveredSurfaces.has(surface)) errors.push(`critical surface ${surface} has no threat model row`);
  }

  const coveredRoutes = coveredSet(rows, "routes");
  for (const route of normalizeArray(coverage.requiredCriticalRoutes)) {
    if (!coveredRoutes.has(route)) errors.push(`critical route ${route} has no threat model row`);
  }
}

function validateRouting(root, profile, errors) {
  const isClawix = profile === "clawix";
  const adrPath = isClawix
    ? "docs/adr/0028-global-threat-modeling-mirror.md"
    : "docs/adr/0039-global-threat-modeling-governance.md";
  validatePath(root, adrPath, "threat model ADR route", errors);
  for (const [file, snippets] of [
    ["docs/adr/TEMPLATE.md", ["Threat Model Impact"]],
    ["docs/decision-map.md", ["security-threat-model", "security-threat-model-check.mjs"]],
    ["docs/discoverability.registry.json", ["security-threat-model", "security-threat-model-check"]],
    ["docs/discoverability.md", ["security-threat-model", "security-threat-model-check"]],
  ]) {
    validatePath(root, file, file, errors);
    if (!exists(root, file)) continue;
    const text = read(root, file);
    for (const snippet of snippets) {
      if (!text.includes(snippet)) errors.push(`${file} must mention ${snippet}`);
    }
  }
  if (!isClawix) {
    const packageJson = readJson(root, "package.json");
    if (!String(packageJson.scripts?.["test:docs"] ?? "").includes("security-threat-model-check.mjs")) {
      errors.push("package.json test:docs must run scripts/security-threat-model-check.mjs");
    }
  } else {
    const testScript = read(root, "scripts/test.sh");
    if (!testScript.includes("security-threat-model-check.mjs")) {
      errors.push("scripts/test.sh fast lane must run scripts/security-threat-model-check.mjs");
    }
  }
}

function runCheck(root = options.root, profile = options.profile) {
  const errors = [];
  validateCoverage(root, errors);
  validateRouting(root, profile, errors);
  return errors;
}

function writeFixture(root, files) {
  for (const [relativePath, body] of Object.entries(files)) {
    const filePath = absolute(root, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, body);
  }
}

function fixtureBase(overrides = {}) {
  const baseRow = {
    id: "threat.agents",
    layer: "agents-delegation",
    assets: ["grants for agents"],
    trustBoundary: "assignment and grant intersection",
    adversaries: ["malicious agent"],
    threatCategories: ["spoofing", "tampering"],
    controls: ["fail closed"],
    validationEvidence: ["tests/agents.test.ts"],
    adrs: ["docs/adr/0001-sensitive.md"],
    surfaces: ["claw.agents"],
    routes: ["agents.internalMacAssignment"],
    status: "enforced",
    steward: "claw",
    reviewDate: "2099-01-01",
  };
  const coverage = {
    version: 1,
    canonicalDoc: "docs/security-threat-model.md",
    canonicalAdr: "docs/adr/0039-global-threat-modeling-governance.md",
    requiredLayers: ["agents-delegation"],
    requiredThreatCategories: ["spoofing", "tampering"],
    requiredCriticalSurfaces: ["claw.agents"],
    requiredCriticalRoutes: ["agents.internalMacAssignment"],
    securitySensitiveAdrs: ["docs/adr/0001-sensitive.md"],
    rows: [baseRow],
    ...overrides.coverage,
  };
  const files = {
    "docs/security-threat-model.md": "# Global Threat Model\n",
    "docs/adr/0039-global-threat-modeling-governance.md": "# ADR 0039\n\nStatus: Accepted\n",
    "docs/adr/0001-sensitive.md": "# ADR 0001\n\nStatus: Accepted\n",
    "docs/adr/TEMPLATE.md": "## Threat Model Impact\n",
    "docs/decision-map.md": "security-threat-model security-threat-model-check.mjs\n",
    "docs/discoverability.registry.json": "security-threat-model security-threat-model-check\n",
    "docs/discoverability.md": "security-threat-model security-threat-model-check\n",
    "package.json": JSON.stringify({ scripts: { "test:docs": "node ./scripts/security-threat-model-check.mjs" } }),
    "docs/security-threat-model.coverage.json": `${JSON.stringify(coverage, null, 2)}\n`,
    ...overrides.files,
  };
  return files;
}

function runFixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "security-threat-model-check."));
  writeFixture(dir, files);
  return spawnSync(process.execPath, [new URL(import.meta.url).pathname, "--root", dir], { encoding: "utf8" });
}

function runSelfTest() {
  const ok = runFixture(fixtureBase());
  assert.equal(ok.status, 0, `${ok.stderr}${ok.stdout}`);

  const missingLayer = runFixture(fixtureBase({ coverage: { requiredLayers: ["missing-layer"] } }));
  assert.notEqual(missingLayer.status, 0);
  assert.match(`${missingLayer.stderr}${missingLayer.stdout}`, /missing-layer/);

  const expired = runFixture(fixtureBase({
    coverage: {
      rows: [{
        id: "threat.agents",
        layer: "agents-delegation",
        assets: ["grants for agents"],
        trustBoundary: "assignment and grant intersection",
        adversaries: ["malicious agent"],
        threatCategories: ["spoofing", "tampering"],
        controls: ["fail closed"],
        validationEvidence: ["tests/agents.test.ts"],
        adrs: ["docs/adr/0001-sensitive.md"],
        surfaces: ["claw.agents"],
        routes: ["agents.internalMacAssignment"],
        status: "enforced",
        steward: "claw",
        reviewDate: "2000-01-01",
      }],
    },
  }));
  assert.notEqual(expired.status, 0);

  const missingAdrCoverage = runFixture(fixtureBase({ coverage: { securitySensitiveAdrs: ["docs/adr/0001-sensitive.md", "docs/adr/0002-sensitive.md"] }, files: { "docs/adr/0002-sensitive.md": "# ADR 0002\n\nStatus: Accepted\n" } }));
  assert.notEqual(missingAdrCoverage.status, 0);
  assert.match(`${missingAdrCoverage.stderr}${missingAdrCoverage.stdout}`, /0002-sensitive/);

  const missingSurface = runFixture(fixtureBase({ coverage: { requiredCriticalSurfaces: ["claw.missing"] } }));
  assert.notEqual(missingSurface.status, 0);
  assert.match(`${missingSurface.stderr}${missingSurface.stdout}`, /claw\.missing/);

  const missingRoute = runFixture(fixtureBase({ coverage: { requiredCriticalRoutes: ["route.missing"] } }));
  assert.notEqual(missingRoute.status, 0);
  assert.match(`${missingRoute.stderr}${missingRoute.stdout}`, /route\.missing/);

  console.log("security threat model check self-test passed");
}

if (options.selfTest) {
  runSelfTest();
} else {
  const errors = runCheck();
  if (errors.length > 0) {
    console.error("security threat model check failed:");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log("security threat model check passed");
}
