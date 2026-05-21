#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expectedClasses = [
  "recoverable",
  "snapshot_recoverable",
  "rebuildable",
  "external_recoverable",
  "irreversible_external_requires_exact_human_approval",
  "forbidden_for_agents",
];
const expectedTargets = [
  "local-delete",
  "hard-purge",
  "trash-archive",
  "migration",
  "import-overwrite",
  "export",
  "sync-apply",
  "agent-action",
  "agent-self-modification",
  "external-provider-mutation",
  "provider-hard-delete",
];
const assertionIds = [
  "II.6.backups-and-export-are-a-user-right",
  "II.10.updates-preserve-use-before-perfection",
  "VII.5.the-trash-is-the-metaphor",
  "VII.6.agents-improve-themselves",
  "VII.11.agents-operate-within-budgets",
  "RedLine.4.no-irreversible-data-loss",
];

function parseArgs(argv) {
  const args = { root: scriptRoot, profile: null, selfTest: false };
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
let rootDir = options.root;

function absolute(relativePath) {
  return path.join(rootDir, relativePath);
}

function exists(relativePath) {
  return fs.existsSync(absolute(relativePath));
}

function read(relativePath) {
  return fs.readFileSync(absolute(relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function countKeywordHits(relativePath, keywords) {
  const text = read(relativePath).toLowerCase();
  let total = 0;
  for (const keyword of keywords) {
    const pattern = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "giu");
    total += text.match(pattern)?.length ?? 0;
  }
  return total;
}

function validateFixture(entry) {
  if (entry.auditReceipt !== true) return "destructive operations require audit receipt";
  if (entry.class === "forbidden_for_agents" && entry.actor === "agent") {
    return "agents cannot perform irreversible purge";
  }
  if (entry.class === "snapshot_recoverable" && !entry.recoveryEvidence?.some((item) => /snapshot/i.test(item))) {
    return "snapshot recoverable operations require snapshot evidence";
  }
  if (entry.class === "irreversible_external_requires_exact_human_approval" && entry.approval !== "exact_human_approval") {
    return "irreversible external operations require exact human approval";
  }
  return null;
}

function validateRoot(root, profile = "claw") {
  rootDir = root;
  const errors = [];
  const manifestPath = "docs/governance/no-irreversible-data-loss/manifest.json";
  const fixturePath = "docs/governance/no-irreversible-data-loss/fixtures.json";
  const assertionPath = "docs/constitution.assertions.json";
  if (!exists(manifestPath)) errors.push(`missing ${manifestPath}`);
  if (!exists(fixturePath)) errors.push(`missing ${fixturePath}`);
  if (!exists(assertionPath)) errors.push(`missing ${assertionPath}`);
  if (errors.length > 0) return errors;

  const manifest = readJson(manifestPath);
  const baseline = readJson(manifest.rollout?.baselinePath ?? "docs/governance/no-irreversible-data-loss/baseline.json");
  const fixtures = readJson(fixturePath);
  const assertions = readJson(assertionPath);
  const today = new Date().toISOString().slice(0, 10);

  if (manifest.schemaVersion !== 1) errors.push("manifest schemaVersion must be 1");
  if (manifest.policyId !== "no-irreversible-data-loss.v1") errors.push("manifest policyId must be no-irreversible-data-loss.v1");
  if (!exists(manifest.canonicalAdr)) errors.push(`manifest canonicalAdr is missing: ${manifest.canonicalAdr}`);
  assert.deepEqual([...manifest.recoveryClasses].sort(), [...expectedClasses].sort(), "recovery classes drifted");
  for (const target of expectedTargets) {
    if (!manifest.coverageTargets?.includes(target)) errors.push(`manifest missing coverage target ${target}`);
    if (!manifest.policies?.some((policy) => policy.targets?.includes(target))) {
      errors.push(`coverage target ${target} has no policy`);
    }
  }
  for (const policy of manifest.policies ?? []) {
    if (!policy.id || !expectedClasses.includes(policy.class)) errors.push(`policy ${policy.id ?? "<missing>"} has invalid class`);
    if (!Array.isArray(policy.targets) || policy.targets.length === 0) errors.push(`policy ${policy.id} must declare targets`);
    if (!policy.defaultBehavior) errors.push(`policy ${policy.id} must declare defaultBehavior`);
    if (!policy.actorPolicy) errors.push(`policy ${policy.id} must declare actorPolicy`);
    if (!policy.approvalPolicy) errors.push(`policy ${policy.id} must declare approvalPolicy`);
    if (policy.auditReceipt !== "required") errors.push(`policy ${policy.id} must require auditReceipt`);
    for (const evidence of policy.testEvidence ?? []) {
      if (!exists(evidence)) errors.push(`policy ${policy.id} references missing evidence ${evidence}`);
    }
  }

  if (baseline.schemaVersion !== 1) errors.push("baseline schemaVersion must be 1");
  const baselineIds = new Set();
  for (const entry of baseline.entries ?? []) {
    for (const field of ["id", "owner", "severity", "surface", "reason", "expiresAt", "repair", "reference"]) {
      if (!entry[field]) errors.push(`baseline entry ${entry.id ?? "<missing>"} missing ${field}`);
    }
    if (entry.reason && String(entry.reason).length < 40) errors.push(`baseline entry ${entry.id} reason is too vague`);
    if (entry.expiresAt && entry.expiresAt < today) errors.push(`baseline entry ${entry.id} expired on ${entry.expiresAt}`);
    if (baselineIds.has(entry.id)) errors.push(`duplicate baseline entry ${entry.id}`);
    baselineIds.add(entry.id);
  }

  const keywordByPath = new Map((baseline.monitoredKeywordBaselines ?? []).map((entry) => [entry.path, entry]));
  for (const monitored of manifest.monitoredFiles ?? []) {
    if (!exists(monitored.path)) {
      errors.push(`monitored file is missing: ${monitored.path}`);
      continue;
    }
    const baselineEntry = keywordByPath.get(monitored.path);
    if (!baselineEntry) {
      errors.push(`monitored file ${monitored.path} missing baseline count`);
      continue;
    }
    const count = countKeywordHits(monitored.path, monitored.keywords ?? []);
    if (count > baselineEntry.maxKeywordHits) {
      errors.push(`${monitored.path} has ${count} destructive/data-moving keyword hits, above baseline ${baselineEntry.maxKeywordHits}`);
    }
  }

  for (const entry of fixtures.valid ?? []) {
    const reason = validateFixture(entry);
    if (reason) errors.push(`valid fixture ${entry.id} failed: ${reason}`);
  }
  for (const entry of fixtures.invalid ?? []) {
    const reason = validateFixture(entry);
    if (!reason) errors.push(`invalid fixture ${entry.id} unexpectedly passed`);
    else if (entry.expectedReason && reason !== entry.expectedReason) {
      errors.push(`invalid fixture ${entry.id} expected ${entry.expectedReason}, got ${reason}`);
    }
  }

  const assertionById = new Map((assertions.assertions ?? []).map((entry) => [entry.id, entry]));
  for (const id of assertionIds) {
    const assertion = assertionById.get(id);
    if (!assertion) {
      errors.push(`constitution assertions missing ${id}`);
      continue;
    }
    if (!assertion.canonicalDocs?.includes(manifestPath)) {
      errors.push(`${id} must route to ${manifestPath}`);
    }
    if (!assertion.protectorScripts?.includes("scripts/no-irreversible-data-loss-check.mjs")) {
      errors.push(`${id} must be protected by scripts/no-irreversible-data-loss-check.mjs`);
    }
    if (assertion.status !== "enforced") errors.push(`${id} must be enforced`);
  }

  const decisionMap = exists("docs/decision-map.md") ? read("docs/decision-map.md") : "";
  if (!decisionMap.includes("no-irreversible-data-loss")) errors.push("docs/decision-map.md must route no-irreversible-data-loss");
  if (!decisionMap.includes("scripts/no-irreversible-data-loss-check.mjs")) {
    errors.push("docs/decision-map.md must mention scripts/no-irreversible-data-loss-check.mjs");
  }
  const constitutionMap = exists("docs/constitution-map.md") ? read("docs/constitution-map.md") : "";
  if (!constitutionMap.includes("No Irreversible Data Loss") && !constitutionMap.includes("no-irreversible-data-loss")) {
    errors.push("docs/constitution-map.md must route no irreversible data loss");
  }

  if (profile === "claw") {
    const pkg = exists("package.json") ? read("package.json") : "";
    if (!pkg.includes("no-irreversible-data-loss-check.mjs")) {
      errors.push("package.json test:docs must run no-irreversible-data-loss-check.mjs");
    }
  } else {
    const fast = exists("scripts/test.sh") ? read("scripts/test.sh") : "";
    if (!fast.includes("no-irreversible-data-loss-check.mjs")) {
      errors.push("scripts/test.sh fast must run no-irreversible-data-loss-check.mjs");
    }
  }

  return errors;
}

function runSelfTest() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "no-data-loss-check."));
  fs.mkdirSync(path.join(temp, "docs/governance/no-irreversible-data-loss"), { recursive: true });
  fs.copyFileSync(absolute("docs/governance/no-irreversible-data-loss/manifest.json"), path.join(temp, "docs/governance/no-irreversible-data-loss/manifest.json"));
  fs.copyFileSync(absolute("docs/governance/no-irreversible-data-loss/baseline.json"), path.join(temp, "docs/governance/no-irreversible-data-loss/baseline.json"));
  fs.copyFileSync(absolute("docs/governance/no-irreversible-data-loss/fixtures.json"), path.join(temp, "docs/governance/no-irreversible-data-loss/fixtures.json"));
  const manifest = JSON.parse(fs.readFileSync(path.join(temp, "docs/governance/no-irreversible-data-loss/manifest.json"), "utf8"));
  const files = new Set([
    "CONSTITUTION.md",
    "scripts/no-irreversible-data-loss-check.mjs",
    manifest.canonicalAdr,
    ...(manifest.monitoredFiles ?? []).map((entry) => entry.path),
    ...(manifest.policies ?? []).flatMap((policy) => policy.testEvidence ?? []),
  ]);
  for (const file of files) {
    if (file.startsWith("docs/governance/no-irreversible-data-loss/")) continue;
    fs.mkdirSync(path.dirname(path.join(temp, file)), { recursive: true });
    fs.writeFileSync(path.join(temp, file), "delete archive migration backup rollback snapshot destructive approval audit\n");
  }
  fs.writeFileSync(path.join(temp, "docs/decision-map.md"), "no-irreversible-data-loss scripts/no-irreversible-data-loss-check.mjs\n");
  fs.writeFileSync(path.join(temp, "docs/constitution-map.md"), "No Irreversible Data Loss no-irreversible-data-loss\n");
  fs.writeFileSync(path.join(temp, "package.json"), JSON.stringify({ scripts: { "test:docs": "node scripts/no-irreversible-data-loss-check.mjs" } }));
  fs.mkdirSync(path.join(temp, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(temp, "scripts/test.sh"), "node scripts/no-irreversible-data-loss-check.mjs\n");
  fs.writeFileSync(path.join(temp, "docs/constitution.assertions.json"), JSON.stringify({
    assertions: assertionIds.map((id) => ({
      id,
      canonicalDocs: ["docs/governance/no-irreversible-data-loss/manifest.json"],
      protectorScripts: ["scripts/no-irreversible-data-loss-check.mjs"],
      status: "enforced",
    })),
  }));
  const errors = validateRoot(temp, options.profile);
  assert.deepEqual(errors, []);
  const baseline = JSON.parse(fs.readFileSync(path.join(temp, "docs/governance/no-irreversible-data-loss/baseline.json"), "utf8"));
  baseline.monitoredKeywordBaselines[0].maxKeywordHits = 0;
  fs.writeFileSync(path.join(temp, "docs/governance/no-irreversible-data-loss/baseline.json"), JSON.stringify(baseline, null, 2));
  assert(validateRoot(temp, "claw").some((error) => error.includes("above baseline")));
}

if (options.selfTest) {
  try {
    runSelfTest();
    console.log("no irreversible data loss self-test passed");
  } catch (error) {
    console.error("no irreversible data loss self-test failed:");
    console.error(error);
    process.exit(1);
  }
} else {
  const errors = validateRoot(rootDir, options.profile);
  if (errors.length > 0) {
    console.error("no irreversible data loss check failed:");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log("no irreversible data loss check passed");
}
