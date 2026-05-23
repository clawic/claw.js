#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  auditClawCapabilityMaturityRegistry,
  listClawCapabilityFiches,
  listClawCapabilityMaturityEntries,
} from "../packages/clawjs-core/src/catalogs.ts";
import { createDiagnostic, printActionableFailureReport } from "./actionable-error.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = "docs/governance/capability-maturity/baseline.json";
const args = new Set(process.argv.slice(2));
const failures = [];

function fail(message) {
  failures.push(message);
}

function maturityDiagnostic(failure) {
  if (failure.startsWith("unknown argument")) {
    return createDiagnostic("capability_maturity_usage_error", failure, {
      status: "USAGE",
      location: "scripts/capability-maturity-guard.mjs",
      suggestion: "Use --self-test or no arguments.",
      safeNextStep: "Rerun node scripts/capability-maturity-guard.mjs with supported arguments.",
    });
  }
  if (failure.startsWith(`${baselinePath}:`)) {
    return createDiagnostic("capability_maturity_baseline_invalid", failure, {
      location: baselinePath,
      suggestion: "Update the public baseline so it is versioned, sorted, unique, and only lists currently missing capability fiches.",
      safeNextStep: "Fix docs/governance/capability-maturity/baseline.json, then rerun node scripts/capability-maturity-guard.mjs.",
    });
  }
  if (failure.startsWith("missing required seed maturity entry:")) {
    return createDiagnostic("capability_maturity_seed_missing", failure, {
      location: "packages/clawjs-core/src/catalogs.ts",
      suggestion: "Restore the required seed maturity entry before changing promotion behavior.",
      safeNextStep: "Add the named maturity entry, then rerun node scripts/capability-maturity-guard.mjs.",
    });
  }
  if (failure.includes("promotion decision path must be public-safe")) {
    return createDiagnostic("capability_maturity_private_path", failure, {
      location: "packages/clawjs-core/src/catalogs.ts",
      suggestion: "Replace private machine, goal, or session paths with a public ADR, doc, or redacted decision reference.",
      safeNextStep: "Remove the private path from the capability maturity registry, then rerun this guard.",
    });
  }
  if (failure.includes("invalid activation policy")) {
    return createDiagnostic("capability_maturity_activation_invalid", failure, {
      location: "packages/clawjs-core/src/catalogs.ts",
      suggestion: "Use an activation policy allowed for promoted capabilities: enabled or opt_in.",
      safeNextStep: "Correct the activation policy, then rerun node scripts/capability-maturity-guard.mjs.",
    });
  }
  if (failure.includes("capability fiche is missing maturity classification")) {
    return createDiagnostic("capability_maturity_classification_missing", failure, {
      location: "packages/clawjs-core/src/catalogs.ts",
      suggestion: "Classify the capability in the maturity registry, or add a sorted temporary exception to the baseline when intentionally deferred.",
      safeNextStep: "Update the registry or baseline, then rerun node scripts/capability-maturity-guard.mjs.",
    });
  }
  if (failure.includes("must remain")) {
    return createDiagnostic("capability_maturity_contract_changed", failure, {
      location: "packages/clawjs-core/src/catalogs.ts",
      suggestion: "Keep the protected maturity contract unchanged unless a new explicit public decision updates it.",
      safeNextStep: "Restore the protected maturity value or add the required decision first, then rerun this guard.",
    });
  }
  return createDiagnostic("capability_maturity_registry_invalid", failure, {
    location: "packages/clawjs-core/src/catalogs.ts",
    suggestion: "Inspect the capability maturity registry audit failure and fix the named registry entry.",
    safeNextStep: "Fix the reported registry issue, then rerun node scripts/capability-maturity-guard.mjs.",
  });
}

function printFailures(items, options = {}) {
  printActionableFailureReport({
    title: options.title ?? "Capability maturity guard failed:",
    diagnostics: items.map(maturityDiagnostic),
    stream: options.stream ?? process.stderr,
  });
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), "utf8"));
}

function isSorted(values) {
  return values.every((value, index) => index === 0 || values[index - 1].localeCompare(value) <= 0);
}

function validate({ baseline }) {
  const entries = listClawCapabilityMaturityEntries();
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
  const audit = auditClawCapabilityMaturityRegistry();
  if (!audit.ok) {
    for (const item of audit.failures) fail(item);
  }

  if (!baseline || baseline.version !== 1) fail(`${baselinePath}: version must be 1`);
  const allowedMissing = baseline?.allowedMissingCapabilityFiches ?? [];
  if (!Array.isArray(allowedMissing)) fail(`${baselinePath}: allowedMissingCapabilityFiches must be an array`);
  if (!isSorted(allowedMissing)) fail(`${baselinePath}: allowedMissingCapabilityFiches must be sorted`);
  const allowedMissingSet = new Set(allowedMissing);
  if (allowedMissingSet.size !== allowedMissing.length) fail(`${baselinePath}: allowedMissingCapabilityFiches has duplicates`);

  for (const id of [
    "claw.shell.core",
    "system.telemetry",
    "system.telemetry.cpu.monitoring",
    "system.telemetry.cpu.graphs",
    "claw.dev.incomplete-work",
  ]) {
    if (!entriesById.has(id)) fail(`missing required seed maturity entry: ${id}`);
  }

  const privateGoalPathMarker = [[".co", "dex"].join(""), "goals"].join("/");
  for (const entry of entries) {
    if (entry.promotionDecision?.path.includes("/Users/") || entry.promotionDecision?.path.includes(privateGoalPathMarker)) {
      fail(`${entry.id}: promotion decision path must be public-safe`);
    }
    if ((entry.maturity === "stable" || entry.maturity === "beta") && entry.activationPolicy !== "enabled" && entry.activationPolicy !== "opt_in") {
      fail(`${entry.id}: promoted capability has invalid activation policy ${entry.activationPolicy}`);
    }
  }

  const maturityIds = new Set(entries.map((entry) => entry.id));
  const capabilityFicheIds = listClawCapabilityFiches().map((fiche) => fiche.id).sort();
  for (const id of capabilityFicheIds) {
    if (!maturityIds.has(id) && !allowedMissingSet.has(id)) {
      fail(`${id}: capability fiche is missing maturity classification`);
    }
  }
  for (const id of allowedMissing) {
    if (!capabilityFicheIds.includes(id)) fail(`${baselinePath}: obsolete missing capability fiche baseline ${id}`);
    if (maturityIds.has(id)) fail(`${baselinePath}: ${id} is now classified and must be removed from the baseline`);
  }

  const shell = entriesById.get("claw.shell.core");
  if (shell?.maturity !== "stable" || shell.activationPolicy !== "enabled") {
    fail("claw.shell.core must remain stable and enabled until a new explicit decision changes it");
  }
  for (const id of ["system.telemetry", "system.telemetry.cpu.monitoring", "system.telemetry.cpu.graphs"]) {
    const entry = entriesById.get(id);
    if (entry?.maturity !== "experimental" || entry.activationPolicy !== "opt_in") {
      fail(`${id} must remain experimental and opt_in until a promotion decision exists`);
    }
  }
  const incomplete = entriesById.get("claw.dev.incomplete-work");
  if (incomplete?.maturity !== "incomplete" || incomplete.activationPolicy !== "dev_allowlist") {
    fail("claw.dev.incomplete-work must default to incomplete and dev_allowlist");
  }
}

for (const arg of args) {
  if (arg !== "--self-test") {
    printFailures([`unknown argument ${arg}`]);
    process.exit(64);
  }
}

if (args.has("--self-test")) {
  validate({ baseline: { version: 1, allowedMissingCapabilityFiches: [] } });
  if (!failures.some((failure) => failure.includes("capability fiche is missing maturity classification"))) {
    console.error("capability maturity guard self-test did not catch missing classifications");
    process.exit(1);
  }
  const chunks = [];
  printFailures([
    `${baselinePath}: allowedMissingCapabilityFiches has duplicates`,
    "missing required seed maturity entry: claw.shell.core",
    "secret.capability: promotion decision path must be public-safe: /Users/example/private token: sk-test-secret-123456",
    "demo.capability: capability fiche is missing maturity classification",
  ], { stream: { write: (chunk) => chunks.push(chunk) } });
  const output = chunks.join("");
  if (!output.includes("code: capability_maturity_baseline_invalid")) throw new Error("self-test missing baseline code");
  if (!output.includes("code: capability_maturity_seed_missing")) throw new Error("self-test missing seed code");
  if (!output.includes("code: capability_maturity_private_path")) throw new Error("self-test missing private-path code");
  if (!output.includes("code: capability_maturity_classification_missing")) throw new Error("self-test missing classification code");
  if (!output.includes("suggestion: Classify the capability")) throw new Error("self-test missing actionable suggestion");
  if (output.includes("/Users/example") || output.includes("sk-test-secret-123456")) throw new Error("self-test leaked private data");
  console.log("capability maturity guard self-test passed");
  process.exit(0);
}

validate({ baseline: readJson(baselinePath) });

if (failures.length > 0) {
  printFailures(failures);
  process.exit(1);
}

console.log("Capability maturity guard passed.");
