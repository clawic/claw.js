#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createDiagnostic, printActionableFailureReport } from "./actionable-error.mjs";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const manifestPath = "docs/governance/adoption-canonicity.manifest.json";
const fixturesPath = "docs/governance/adoption-canonicity.fixtures.json";
const args = new Set(process.argv.slice(2));
const isSelfTestChild = process.env.CLAW_ADOPTION_CANONICITY_SELF_TEST === "1";
const errors = [];

function fail(message) {
  errors.push(message);
}

function adoptionDiagnostic(error) {
  if (error.startsWith("unknown argument")) {
    return createDiagnostic("adoption_canonicity_usage_error", error, {
      status: "USAGE",
      location: "scripts/adoption-canonicity-check.mjs",
      suggestion: "Use --self-test or one of the supported --simulate-* self-test flags.",
      safeNextStep: "Rerun node scripts/adoption-canonicity-check.mjs with a supported argument.",
    });
  }
  const invalidJson = error.match(/^(.+) is not valid JSON:/);
  if (invalidJson) {
    return createDiagnostic("adoption_canonicity_invalid_json", error, {
      location: invalidJson[1],
      suggestion: "Fix JSON syntax before trusting adoption/canonicity promotion results.",
      safeNextStep: `Repair ${invalidJson[1]}, then rerun node scripts/adoption-canonicity-check.mjs.`,
    });
  }
  const localPath = error.match(/^(.+) must not contain local paths$/);
  if (localPath) {
    return createDiagnostic("adoption_canonicity_private_path_leak", error, {
      location: localPath[1],
      suggestion: "Replace local filesystem evidence with a public-safe path or approved external evidence alias.",
      safeNextStep: "Update docs/governance/adoption-canonicity.manifest.json, then rerun node scripts/adoption-canonicity-check.mjs.",
    });
  }
  if (error.includes("telemetryDefault")) {
    return createDiagnostic("adoption_canonicity_telemetry_enabled", error, {
      location: manifestPath,
      suggestion: "Keep adoption telemetry disabled unless it is explicitly opt-in and governed.",
      safeNextStep: `Set telemetryDefault to disabled in ${manifestPath}, then rerun node scripts/adoption-canonicity-check.mjs.`,
    });
  }
  if (error.includes("feedbackLoop")) {
    return createDiagnostic("adoption_canonicity_feedback_loop_missing", error, {
      location: manifestPath,
      suggestion: "Add the required feedback loop mechanism, cadence, and evidence references before promotion.",
      safeNextStep: `Complete feedbackLoop in ${manifestPath}, then rerun node scripts/adoption-canonicity-check.mjs.`,
    });
  }
  if (error.includes("evidenceRefs") || error.includes("public-safe") || error.includes("external evidence alias")) {
    return createDiagnostic("adoption_canonicity_evidence_invalid", error, {
      location: manifestPath,
      suggestion: "Use public-safe evidence refs or approved external aliases; do not include private paths.",
      safeNextStep: `Fix evidenceRefs in ${manifestPath}, then rerun node scripts/adoption-canonicity-check.mjs.`,
    });
  }
  if (error.includes("capability maturity") || error.includes("seed packet") || error.includes("packet")) {
    return createDiagnostic("adoption_canonicity_packet_invalid", error, {
      location: manifestPath,
      suggestion: "Restore the referenced promotion packet and keep capability maturity references in sync.",
      safeNextStep: `Update ${manifestPath} or packages/clawjs-core/src/capability-maturity.ts, then rerun node scripts/adoption-canonicity-check.mjs.`,
    });
  }
  return createDiagnostic("adoption_canonicity_manifest_invalid", error, {
    location: manifestPath,
    suggestion: "Fix required fields, stage, claim type, privacy mode, review dates, promotion decision, or references.",
    safeNextStep: `Repair ${manifestPath}, then rerun node scripts/adoption-canonicity-check.mjs.`,
  });
}

function printErrors(options = {}) {
  printActionableFailureReport({
    title: options.title ?? "adoption/canonicity check failed:",
    diagnostics: errors.map(adoptionDiagnostic),
    stream: options.stream ?? process.stderr,
  });
}

function readJson(relativePath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), "utf8"));
  } catch (error) {
    fail(`${relativePath} is not valid JSON: ${error.message}`);
    return null;
  }
}

function requireFields(object, label, fields) {
  if (!object) return;
  for (const field of fields) {
    if (object[field] === undefined || object[field] === null || object[field] === "") {
      fail(`${label} is missing ${field}`);
    }
  }
}

function requireArray(object, label, field, { nonEmpty = true } = {}) {
  const value = object?.[field];
  if (!Array.isArray(value)) {
    fail(`${label}.${field} must be an array`);
    return [];
  }
  if (nonEmpty && value.length === 0) fail(`${label}.${field} must not be empty`);
  return value;
}

function isIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function scanForLocalPaths(value, label) {
  if (Array.isArray(value)) {
    value.forEach((child, index) => scanForLocalPaths(child, `${label}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) scanForLocalPaths(child, `${label}.${key}`);
    return;
  }
  if (typeof value === "string" && (/^\/Users\//.test(value) || value.startsWith("~/") || value.startsWith("file://") || /^[A-Z]:\\/.test(value))) {
    fail(`${label} must not contain local paths`);
  }
}

function evidenceRefIsSafe(ref, aliases) {
  if (typeof ref !== "string" || ref.length === 0) return false;
  if (ref.startsWith("docs/") || ref.startsWith("packages/") || ref.startsWith("scripts/") || ref.startsWith("qa/") || ref.startsWith("skills/")) return true;
  return aliases.some((alias) => ref.startsWith(`${alias}:`) && !ref.includes("..") && !ref.includes("//"));
}

function stageRank(stage) {
  return ["unproven", "exploratory", "understandable", "adopted", "canonical"].indexOf(stage);
}

function validateManifest(manifest, { mutation } = {}) {
  if (!manifest) return;
  if (mutation === "missing-feedback-loop") delete manifest.packets[0].feedbackLoop;
  if (mutation === "silent-telemetry") manifest.packets[0].telemetryDefault = "enabled";
  if (mutation === "local-private-path") manifest.packets[0].evidenceRefs[0].ref = "/Users/example/research.json";

  requireFields(manifest, manifestPath, [
    "schemaVersion",
    "status",
    "policy",
    "stages",
    "claimTypes",
    "privacyModes",
    "requiredPromotionPacketFields",
    "packets",
  ]);
  if (manifest.schemaVersion !== 1) fail(`${manifestPath}.schemaVersion must be 1`);
  const stages = new Set(requireArray(manifest, manifestPath, "stages"));
  const claimTypes = new Set(requireArray(manifest, manifestPath, "claimTypes"));
  const privacyModes = new Set(requireArray(manifest, manifestPath, "privacyModes"));
  const aliases = requireArray(manifest, manifestPath, "externalEvidenceAliases", { nonEmpty: false });
  for (const required of ["unproven", "exploratory", "understandable", "adopted", "canonical"]) {
    if (!stages.has(required)) fail(`${manifestPath}.stages must include ${required}`);
  }
  for (const required of ["stable_capability", "standard_canonicity", "ui_canon_promotion", "any_human_comprehension", "pmf_adoption"]) {
    if (!claimTypes.has(required)) fail(`${manifestPath}.claimTypes must include ${required}`);
  }
  for (const required of ["hybrid_private", "manual_public", "explicit_opt_in_metrics"]) {
    if (!privacyModes.has(required)) fail(`${manifestPath}.privacyModes must include ${required}`);
  }

  const requiredPacketFields = requireArray(manifest, manifestPath, "requiredPromotionPacketFields");
  const packetIds = new Set();
  const packets = requireArray(manifest, manifestPath, "packets");
  for (const [index, packet] of packets.entries()) {
    const label = `${manifestPath}.packets[${index}]`;
    requireFields(packet, label, requiredPacketFields);
    if (packet.id) {
      if (packetIds.has(packet.id)) fail(`${label}.id duplicates another packet`);
      packetIds.add(packet.id);
    }
    if (!stages.has(packet.stage)) fail(`${label}.stage is invalid`);
    if (!claimTypes.has(packet.claimType)) fail(`${label}.claimType is invalid`);
    if (!privacyModes.has(packet.privacyMode)) fail(`${label}.privacyMode is invalid`);
    if (packet.telemetryDefault !== "disabled") fail(`${label}.telemetryDefault must be disabled`);
    if (!isIsoDate(packet.reviewedAt)) fail(`${label}.reviewedAt must be an ISO date`);
    if (!isIsoDate(packet.expiresAt)) fail(`${label}.expiresAt must be an ISO date`);
    if (isIsoDate(packet.reviewedAt) && isIsoDate(packet.expiresAt) && Date.parse(packet.expiresAt) <= Date.parse(packet.reviewedAt)) {
      fail(`${label}.expiresAt must be after reviewedAt`);
    }
    const evidenceRefs = requireArray(packet, label, "evidenceRefs");
    for (const [evidenceIndex, evidence] of evidenceRefs.entries()) {
      requireFields(evidence, `${label}.evidenceRefs[${evidenceIndex}]`, ["kind", "ref", "summary"]);
      if (!evidenceRefIsSafe(evidence.ref, aliases)) fail(`${label}.evidenceRefs[${evidenceIndex}].ref must be public-safe or use an approved external evidence alias`);
    }
    requireFields(packet.feedbackLoop, `${label}.feedbackLoop`, ["mechanism", "cadence", "evidenceRefs"]);
    requireArray(packet.feedbackLoop, `${label}.feedbackLoop`, "evidenceRefs");
    requireFields(packet.promotionDecision, `${label}.promotionDecision`, ["state", "decidedBy", "decidedAt", "refs"]);
    if (!isIsoDate(packet.promotionDecision?.decidedAt)) fail(`${label}.promotionDecision.decidedAt must be an ISO date`);
    requireArray(packet.promotionDecision, `${label}.promotionDecision`, "refs");

    if (packet.claimType === "stable_capability" && stageRank(packet.stage) < stageRank("understandable")) {
      fail(`${label}.stage must be understandable or higher for stable capability promotion`);
    }
    if (packet.claimType === "pmf_adoption" && stageRank(packet.stage) < stageRank("adopted")) {
      fail(`${label}.stage must be adopted or canonical for PMF/adoption claims`);
    }
    if (packet.claimType === "standard_canonicity" && packet.stage !== "canonical") {
      fail(`${label}.stage must be canonical for standard canonicity claims`);
    }
  }

  const capabilitySource = fs.readFileSync(path.join(rootDir, "packages/clawjs-core/src/capability-maturity.ts"), "utf8");
  for (const match of capabilitySource.matchAll(/adoptionCanonicityPacketId:\s*"([^"]+)"/g)) {
    if (!packetIds.has(match[1])) fail(`capability maturity references missing adoption/canonicity packet ${match[1]}`);
  }
  if (!packetIds.has("claw-shell-core-stable-2026-05-21")) {
    fail("missing seed packet claw-shell-core-stable-2026-05-21");
  }

  scanForLocalPaths(manifest, manifestPath);
}

function runSelfTests() {
  const fixtures = readJson(fixturesPath);
  const expected = new Map((fixtures?.negativeFixtures ?? []).map((fixture) => [fixture.id, fixture.expectedFailure]));
  for (const id of expected.keys()) {
    const result = spawnSync(process.execPath, [new URL(import.meta.url).pathname, `--simulate-${id}`], {
      cwd: rootDir,
      env: { ...process.env, CLAW_ADOPTION_CANONICITY_SELF_TEST: "1" },
      encoding: "utf8",
    });
    const output = `${result.stdout || ""}${result.stderr || ""}`;
    if (result.status === 0) fail(`self-test ${id} must fail`);
    if (!output.includes(expected.get(id))) fail(`self-test ${id} output must include ${expected.get(id)}`);
    if (!output.includes("code: ")) fail(`self-test ${id} output must include a diagnostic code`);
  }

  const before = errors.length;
  errors.push(
    "docs/governance/adoption-canonicity.manifest.json.packets[0].evidenceRefs[0].ref must be public-safe or use an approved external evidence alias",
    "/Users/example/private/research.json must not contain local paths",
    "docs/governance/adoption-canonicity.manifest.json is not valid JSON: token sk-test-secret-123456",
  );
  const chunks = [];
  printErrors({ stream: { write: (chunk) => chunks.push(chunk) } });
  errors.splice(before);
  const output = chunks.join("");
  if (!output.includes("code: adoption_canonicity_evidence_invalid")) fail("self-test output missing evidence code");
  if (!output.includes("code: adoption_canonicity_private_path_leak")) fail("self-test output missing local path code");
  if (!output.includes("code: adoption_canonicity_invalid_json")) fail("self-test output missing invalid JSON code");
  if (!output.includes("suggestion: Use public-safe evidence refs")) fail("self-test output missing suggestion");
  if (output.includes("/Users/example") || output.includes("sk-test-secret-123456")) fail("self-test output leaked private data");
}

if (args.has("--self-test") && !isSelfTestChild) runSelfTests();

let mutation = null;
for (const arg of args) {
  if (![
    "--self-test",
    "--simulate-missing-feedback-loop",
    "--simulate-silent-telemetry",
    "--simulate-local-private-path",
  ].includes(arg)) {
    fail(`unknown argument ${arg}`);
  }
  if (arg === "--simulate-missing-feedback-loop") mutation = "missing-feedback-loop";
  if (arg === "--simulate-silent-telemetry") mutation = "silent-telemetry";
  if (arg === "--simulate-local-private-path") mutation = "local-private-path";
}

validateManifest(readJson(manifestPath), { mutation });

if (errors.length > 0) {
  printErrors();
  process.exit(1);
}

console.log("Adoption/canonicity check passed.");
