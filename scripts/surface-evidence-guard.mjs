#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { clawPersistentSurfaceRegistry } from "../packages/clawjs-core/src/catalogs.ts";
import { createBuiltinSearchSourceManifests } from "../packages/clawjs-search/src/index.ts";
import { createDiagnostic, printActionableFailureReport } from "./actionable-error.mjs";

const requiredSearchSourceIds = new Set(["surfaces.routes", "surfaces.registry"]);
const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const baselinePath = path.join(rootDir, "docs/surface-evidence-baseline.json");

function criticalNodeIds(registry) {
  const ids = new Set();
  for (const edge of registry.edges ?? []) {
    ids.add(edge.fromId);
    ids.add(edge.toId);
    if (edge.contractId) ids.add(edge.contractId);
  }
  for (const route of registry.routes ?? []) {
    ids.add(route.fromId);
    ids.add(route.toId);
    for (const step of route.steps ?? []) {
      ids.add(step.fromId);
      ids.add(step.toId);
      if (step.contractId) ids.add(step.contractId);
    }
  }
  return ids;
}

function readBaseline() {
  if (!fs.existsSync(baselinePath)) return { version: 1, entries: [] };
  return JSON.parse(fs.readFileSync(baselinePath, "utf8"));
}

function baselineNodeIds(baseline) {
  return new Set((baseline.entries ?? []).flatMap((entry) => entry.nodeIds ?? []));
}

function validateBaseline(baseline) {
  const errors = [];
  const today = new Date().toISOString().slice(0, 10);
  if (baseline.version !== 1) errors.push("surface evidence baseline version must be 1");
  for (const entry of baseline.entries ?? []) {
    for (const field of ["id", "classification", "steward", "reason", "risk", "expires", "nextPhase", "reentryCondition"]) {
      if (!entry[field]) errors.push(`baseline entry ${entry.id ?? "<missing>"} is missing ${field}`);
    }
    if (!Array.isArray(entry.nodeIds) || entry.nodeIds.length === 0) errors.push(`baseline entry ${entry.id ?? "<missing>"} must list nodeIds`);
    if (!["direct_blocker", "lateral_debt", "external_pending", "pre_existing_dirty"].includes(entry.classification)) errors.push(`baseline entry ${entry.id ?? "<missing>"} has invalid classification ${entry.classification}`);
    if (entry.expires && entry.expires < today) errors.push(`baseline entry ${entry.id ?? "<missing>"} expired on ${entry.expires}`);
  }
  return errors;
}

function validateSurfaceEvidence(registry, baseline = readBaseline()) {
  const errors = [];
  const nodes = registry.nodes ?? [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const baselineIds = baselineNodeIds(baseline);
  const critical = criticalNodeIds(registry);

  errors.push(...validateBaseline(baseline));

  for (const nodeId of critical) {
    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (!node) {
      if (!baselineIds.has(nodeId)) errors.push(`critical surface reference is missing registered node ${nodeId}`);
      continue;
    }
    if (!node.source?.file) errors.push(`${node.id} is missing source.file`);
  }

  for (const edge of registry.edges ?? []) {
    if (!nodeIds.has(edge.fromId)) errors.push(`${edge.id} references missing fromId ${edge.fromId}`);
    if (!nodeIds.has(edge.toId)) errors.push(`${edge.id} references missing toId ${edge.toId}`);
    if (edge.contractId && !nodeIds.has(edge.contractId) && !baselineIds.has(edge.contractId)) errors.push(`${edge.id} references missing contractId ${edge.contractId}`);
    if (!edge.validation) errors.push(`${edge.id} is missing validation`);
  }

  for (const route of registry.routes ?? []) {
    if (!route.source?.file) errors.push(`${route.id} is missing source.file`);
    if (!Array.isArray(route.docs) || route.docs.length === 0) errors.push(`${route.id} is missing docs`);
    if (!Array.isArray(route.tests) || route.tests.length === 0) errors.push(`${route.id} is missing tests`);
    if (!Array.isArray(route.adrs) || route.adrs.length === 0) errors.push(`${route.id} is missing adrs`);
    if (!route.validation) errors.push(`${route.id} is missing validation`);
    if (!Array.isArray(route.steps) || route.steps.length === 0) errors.push(`${route.id} is missing route steps`);
    for (const [index, step] of (route.steps ?? []).entries()) {
      const label = `${route.id}.steps[${index}]`;
      if (!nodeIds.has(step.fromId)) errors.push(`${label} references missing fromId ${step.fromId}`);
      if (!nodeIds.has(step.toId)) errors.push(`${label} references missing toId ${step.toId}`);
      if (step.contractId && !nodeIds.has(step.contractId) && !baselineIds.has(step.contractId)) errors.push(`${label} references missing contractId ${step.contractId}`);
      if (!step.validation) errors.push(`${label} is missing validation`);
    }
  }

  const searchSourceIds = new Set(createBuiltinSearchSourceManifests().map((source) => source.id));
  for (const sourceId of requiredSearchSourceIds) {
    if (!searchSourceIds.has(sourceId)) errors.push(`missing builtin search source ${sourceId}`);
  }

  return errors;
}

function surfaceEvidenceDiagnostic(error) {
  if (error.includes("baseline")) {
    return createDiagnostic("surface_evidence_baseline_invalid", error, {
      location: "docs/surface-evidence-baseline.json",
      suggestion: "Fix the baseline row or remove stale debt only after the referenced surface is registered.",
      safeNextStep: "Update docs/surface-evidence-baseline.json, then rerun node --import tsx scripts/surface-evidence-guard.mjs.",
    });
  }
  if (error.includes("references missing")) {
    return createDiagnostic("surface_evidence_reference_missing", error, {
      location: "packages/clawjs-core/src/catalogs.ts",
      suggestion: "Register the missing surface node or add a temporary baseline entry with steward, risk, expiry, and reentry condition.",
      safeNextStep: "Fix the referenced node id in the surface registry, then rerun the surface evidence guard.",
    });
  }
  if (error.includes("source.file")) {
    return createDiagnostic("surface_evidence_source_missing", error, {
      location: "packages/clawjs-core/src/catalogs.ts",
      suggestion: "Add source.file for the registered surface node or route.",
      safeNextStep: "Point source.file at the owning public file, then rerun node --import tsx scripts/surface-evidence-guard.mjs.",
    });
  }
  if (error.includes("missing builtin search source")) {
    return createDiagnostic("surface_evidence_search_source_missing", error, {
      location: "packages/clawjs-search/src/index.ts",
      suggestion: "Restore the builtin search source manifest for routes and registry discovery.",
      safeNextStep: "Add the missing search source id, then rerun node --import tsx scripts/surface-evidence-guard.mjs.",
    });
  }
  return createDiagnostic("surface_evidence_metadata_missing", error, {
    location: "packages/clawjs-core/src/catalogs.ts",
    suggestion: "Complete route docs, tests, ADRs, validation, and route-step metadata before claiming closure.",
    safeNextStep: "Fill the missing surface evidence field, then rerun node --import tsx scripts/surface-evidence-guard.mjs.",
  });
}

function printSurfaceEvidenceFailures(errors, options = {}) {
  printActionableFailureReport({
    title: options.title ?? "surface evidence guard failed:",
    diagnostics: errors.map(surfaceEvidenceDiagnostic),
    stream: options.stream ?? process.stderr,
  });
}

function cloneRegistry() {
  return JSON.parse(JSON.stringify(clawPersistentSurfaceRegistry));
}

function runSelfTest() {
  const missingNodeSource = cloneRegistry();
  const criticalId = [...criticalNodeIds(missingNodeSource)][0];
  missingNodeSource.nodes.find((node) => node.id === criticalId).source = undefined;
  assert.match(validateSurfaceEvidence(missingNodeSource, { version: 1, entries: [] }).join("\n"), /missing source\.file/);

  const missingRouteDocs = cloneRegistry();
  missingRouteDocs.routes[0].docs = [];
  assert.match(validateSurfaceEvidence(missingRouteDocs, { version: 1, entries: [] }).join("\n"), /is missing docs/);

  const missingStepTarget = cloneRegistry();
  missingStepTarget.routes[0].steps[0].toId = "missing.surface";
  assert.match(validateSurfaceEvidence(missingStepTarget, { version: 1, entries: [] }).join("\n"), /references missing toId missing\.surface/);

  const missingContractBaseline = cloneRegistry();
  missingContractBaseline.routes[0].steps[0].contractId = "missing.contract";
  assert.doesNotMatch(validateSurfaceEvidence(missingContractBaseline, {
    version: 1,
    entries: [{
      id: "self-test",
      classification: "lateral_debt",
      steward: "test",
      reason: "self-test",
      risk: "self-test",
      expires: "2099-01-01",
      nodeIds: ["missing.contract"],
      nextPhase: "self-test",
      reentryCondition: "self-test",
    }],
  }).join("\n"), /missing\.contract/);

  const chunks = [];
  printSurfaceEvidenceFailures([
    "/Users/example/private/node is missing source.file",
    "route.steps[0] references missing toId missing.surface",
    "missing builtin search source surfaces.routes",
  ], { stream: { write: (chunk) => chunks.push(chunk) } });
  const output = chunks.join("");
  assert.match(output, /code: surface_evidence_source_missing/);
  assert.match(output, /code: surface_evidence_reference_missing/);
  assert.match(output, /code: surface_evidence_search_source_missing/);
  assert.match(output, /location: packages\/clawjs-core\/src\/catalogs\.ts/);
  assert.match(output, /suggestion: Register the missing surface node/);
  assert.match(output, /next: Add the missing search source id/);
  assert.doesNotMatch(output, /\/Users\/example/);
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
  console.log("surface evidence guard self-test passed");
  process.exit(0);
}

const errors = validateSurfaceEvidence(clawPersistentSurfaceRegistry);
if (errors.length > 0) {
  printSurfaceEvidenceFailures(errors);
  process.exit(1);
}

console.log("surface evidence guard passed");
