#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  auditClawCapabilityMaturityRegistry,
  listClawCapabilityFiches,
  listClawCapabilityMaturityEntries,
} from "../packages/clawjs-core/src/index.ts";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = "docs/governance/capability-maturity/baseline.json";
const args = new Set(process.argv.slice(2));
const failures = [];

function fail(message) {
  failures.push(message);
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

  for (const entry of entries) {
    if (entry.promotionDecision?.path.includes("/Users/") || entry.promotionDecision?.path.includes(".codex/goals")) {
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

if (args.has("--self-test")) {
  validate({ baseline: { version: 1, allowedMissingCapabilityFiches: [] } });
  if (!failures.some((failure) => failure.includes("capability fiche is missing maturity classification"))) {
    console.error("capability maturity guard self-test did not catch missing classifications");
    process.exit(1);
  }
  console.log("capability maturity guard self-test passed");
  process.exit(0);
}

validate({ baseline: readJson(baselinePath) });

if (failures.length > 0) {
  console.error("Capability maturity guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Capability maturity guard passed.");
