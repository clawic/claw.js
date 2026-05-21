#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const manifestPath = path.join(rootDir, "docs/runtime-ecosystem-integration.manifest.json");
const standardPath = path.join(rootDir, "docs/runtime-ecosystem-integration-standard.md");
const adrPath = path.join(rootDir, "docs/adr/0047-runtime-ecosystem-integration-standard.md");
const supportMatrixPath = path.join(rootDir, "docs/support-matrix.md");
const decisionMapPath = path.join(rootDir, "docs/decision-map.md");
const discoverabilityPath = path.join(rootDir, "docs/discoverability.registry.json");
const adrCoveragePath = path.join(rootDir, "docs/adr-operational-coverage.manifest.json");

const requiredRuntimeIds = ["openclaw", "codex", "hermes"];
const requiredDomains = [
  "sessions",
  "skills",
  "memory",
  "channels",
  "providers",
  "auth",
  "models",
  "scheduler",
  "plugins",
  "gateway",
  "doctorCompat",
  "sandboxPermissions",
  "configuration",
];
const allowedClaims = new Set([
  "inventoried",
  "projected",
  "operable",
  "write_back",
  "preserved",
  "native_parity",
  "recommended",
  "production",
]);
const stableStages = new Set(["recommended", "production", "native_parity"]);

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function hasAllDomains(rows, label, errors) {
  const domains = new Set((rows ?? []).map((row) => row.domain));
  for (const domain of requiredDomains) {
    if (!domains.has(domain)) errors.push(`${label} missing domain ${domain}`);
  }
}

function main() {
  const errors = [];
  for (const file of [manifestPath, standardPath, adrPath, supportMatrixPath, decisionMapPath, discoverabilityPath, adrCoveragePath]) {
    if (!fs.existsSync(file)) errors.push(`missing required file ${path.relative(rootDir, file)}`);
  }
  if (errors.length > 0) {
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  const manifest = readJson(manifestPath);
  if (manifest.schemaVersion !== 1) errors.push("manifest schemaVersion must be 1");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(manifest.sourceSnapshotDate ?? "")) {
    errors.push("manifest sourceSnapshotDate must be YYYY-MM-DD");
  }

  const manifestDomains = new Set(manifest.requiredDomains ?? []);
  for (const domain of requiredDomains) {
    if (!manifestDomains.has(domain)) errors.push(`manifest requiredDomains missing ${domain}`);
  }
  for (const claim of manifest.claimLadder ?? []) {
    if (!allowedClaims.has(claim)) errors.push(`unknown claim ladder value ${claim}`);
  }

  const runtimes = new Map((manifest.runtimes ?? []).map((runtime) => [runtime.id, runtime]));
  for (const runtimeId of requiredRuntimeIds) {
    if (!runtimes.has(runtimeId)) errors.push(`manifest missing required runtime ${runtimeId}`);
  }

  for (const [runtimeId, runtime] of runtimes) {
    const snapshot = runtime.officialSnapshot ?? {};
    if (!Array.isArray(snapshot.sources) || snapshot.sources.length === 0) {
      errors.push(`${runtimeId} officialSnapshot.sources must be non-empty`);
    }
    if (!snapshot.capturedAt || !snapshot.driftPolicy) {
      errors.push(`${runtimeId} officialSnapshot must include capturedAt and driftPolicy`);
    }
    if (!runtime.portal?.shape?.startsWith(`claw runtime ${runtimeId}`)) {
      errors.push(`${runtimeId} portal shape must start with claw runtime ${runtimeId}`);
    }
    if (stableStages.has(runtime.supportStage) || runtime.recommended || runtime.production) {
      if (!snapshot.sourceType || !snapshot.sources?.length) {
        errors.push(`${runtimeId} promoted support needs an official snapshot`);
      }
      if (!runtime.uiParityClaim || runtime.uiParityClaim === "visual_clone") {
        errors.push(`${runtimeId} promoted support needs semantic UI parity, not visual clone`);
      }
    }
    if ((runtime.id === "codex" || runtime.id === "hermes") && (runtime.recommended || runtime.production)) {
      errors.push(`${runtime.id} must remain dev-only until explicit evidence promotes it`);
    }

    const matrix = runtime.tripleMatrix ?? {};
    hasAllDomains(matrix.nativeSurface, `${runtimeId}.nativeSurface`, errors);
    hasAllDomains(matrix.clawDomainSurface, `${runtimeId}.clawDomainSurface`, errors);
    hasAllDomains(matrix.linkMatrix, `${runtimeId}.linkMatrix`, errors);

    for (const row of matrix.nativeSurface ?? []) {
      if (!allowedClaims.has(row.claim)) errors.push(`${runtimeId}.${row.domain} has invalid claim ${row.claim}`);
      if (!row.authority) errors.push(`${runtimeId}.${row.domain} nativeSurface is missing authority`);
    }
    for (const row of matrix.linkMatrix ?? []) {
      for (const field of ["relation", "lossPolicy", "writeBackPolicy", "validation"]) {
        if (!row[field]) errors.push(`${runtimeId}.${row.domain} linkMatrix missing ${field}`);
      }
    }
  }

  for (const adapter of manifest.baselineAdapters ?? []) {
    if (adapter.recommended || adapter.production || stableStages.has(adapter.supportStage)) {
      errors.push(`baseline adapter ${adapter.id} cannot claim stable/recommended/production support`);
    }
  }

  const standard = fs.readFileSync(standardPath, "utf8");
  for (const snippet of ["Triple Matrix", "claw runtime <runtime-id>", "semantic native parity", "no silent overwrite"]) {
    if (!standard.includes(snippet)) errors.push(`standard doc missing snippet: ${snippet}`);
  }

  const adr = fs.readFileSync(adrPath, "utf8");
  for (const snippet of ["Status: Accepted", "Source Decision Audit", "Surface Parity", "Discovery Route"]) {
    if (!adr.includes(snippet)) errors.push(`ADR missing snippet: ${snippet}`);
  }

  const support = fs.readFileSync(supportMatrixPath, "utf8");
  if (!support.includes("openclaw") || !support.includes("codex") || !support.includes("hermes")) {
    errors.push("support matrix must include OpenClaw, Codex, and Hermes rows");
  }

  const decisionMap = fs.readFileSync(decisionMapPath, "utf8");
  if (!decisionMap.includes("Runtime ecosystem integration")) {
    errors.push("decision map missing Runtime ecosystem integration row");
  }

  const discoverability = readJson(discoverabilityPath);
  const discoverabilitySources = new Set((discoverability.artifacts ?? []).map((entry) => entry.canonicalSource));
  for (const source of [
    "docs/runtime-ecosystem-integration-standard.md",
    "docs/runtime-ecosystem-integration.manifest.json",
    "docs/adr/0047-runtime-ecosystem-integration-standard.md",
    "scripts/verify-runtime-ecosystem-integration.mjs",
  ]) {
    if (!discoverabilitySources.has(source)) errors.push(`discoverability registry missing ${source}`);
  }

  const coverage = readJson(adrCoveragePath);
  const coverageAdrs = new Set((coverage.acceptedAdrCoverage ?? []).map((entry) => entry.adr));
  if (!coverageAdrs.has("docs/adr/0047-runtime-ecosystem-integration-standard.md")) {
    errors.push("ADR operational coverage missing ADR 0047");
  }

  const packageJson = JSON.parse(read("package.json"));
  if (!packageJson.scripts?.["test:runtime-ecosystem"]?.includes("verify-runtime-ecosystem-integration.mjs")) {
    errors.push("package.json missing test:runtime-ecosystem script");
  }

  if (errors.length > 0) {
    console.error("Runtime ecosystem integration check failed:");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log("runtime ecosystem integration check passed");
}

main();
