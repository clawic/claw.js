#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { clawPersistentSurfaceRegistry } from "../packages/clawjs-core/src/catalogs.ts";
import { v1MainSchemaSurfaceNodes } from "../packages/clawjs/src/v1-data-surface.ts";
import { createDiagnostic, printActionableFailureReport } from "./actionable-error.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = path.join(rootDir, "docs/surface-resource-contract-baseline.json");
const today = new Date().toISOString().slice(0, 10);
const requiredFields = ["startup", "idle", "memory", "streaming", "storage", "hotPath", "scale", "validation"];

function sha256Ids(ids) {
  return crypto.createHash("sha256").update([...ids].sort().join("\n")).digest("hex");
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isSorted(ids) {
  return ids.every((id, index) => index === 0 || ids[index - 1] <= id);
}

function idCounts(ids) {
  const counts = new Map();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

function formatIdDelta(id, count) {
  return count === 1 ? id : `${id} x${count}`;
}

function validateResourceContract(contract, label, failures) {
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) {
    failures.push(`${label} is missing resourceContract`);
    return;
  }
  for (const field of requiredFields) {
    if (!hasText(contract[field])) failures.push(`${label}.resourceContract.${field} must be a non-empty string`);
  }
}

function missingResourceContractIds(items) {
  return items.filter((item) => !item.resourceContract).map((item) => item.id).sort();
}

function missingResourceContractSummary(ids) {
  const sortedIds = [...ids].sort();
  return { count: sortedIds.length, idsSha256: sha256Ids(sortedIds), ids: sortedIds };
}

function readBaseline() {
  if (!fs.existsSync(baselinePath)) return { version: 1, entries: [] };
  return JSON.parse(fs.readFileSync(baselinePath, "utf8"));
}

function validateBaselineEnvelope(baseline) {
  const failures = [];
  if (baseline.version !== 1) failures.push("surface resource contract baseline version must be 1");
  for (const [index, entry] of (baseline.entries ?? []).entries()) {
    const label = entry.id ?? `<entry ${index + 1}>`;
    for (const field of ["id", "classification", "steward", "reason", "risk", "expires", "nextPhase", "reentryCondition"]) {
      if (!entry[field]) failures.push(`${label} is missing ${field}`);
    }
    if (!["lateral_debt", "pre_existing_dirty"].includes(entry.classification)) {
      failures.push(`${label} has invalid classification ${entry.classification}`);
    }
    if (entry.expires && entry.expires < today) failures.push(`${label} expired on ${entry.expires}`);
    for (const key of ["nodes", "routes"]) {
      const summary = entry.missingResourceContract?.[key];
      if (!summary || typeof summary.count !== "number" || !hasText(summary.idsSha256) || !Array.isArray(summary.ids)) {
        failures.push(`${label}.missingResourceContract.${key} must include count, idsSha256, and ids`);
        continue;
      }
      const invalidIds = summary.ids.filter((id) => !hasText(id));
      if (invalidIds.length > 0) failures.push(`${label}.missingResourceContract.${key}.ids must contain only non-empty strings`);
      if (!isSorted(summary.ids)) failures.push(`${label}.missingResourceContract.${key}.ids must be sorted`);
      if (summary.count !== summary.ids.length) {
        failures.push(`${label}.missingResourceContract.${key}.count must match ids length: ${summary.count} !== ${summary.ids.length}`);
      }
      const baselineHash = sha256Ids(summary.ids);
      if (summary.idsSha256 !== baselineHash) {
        failures.push(`${label}.missingResourceContract.${key}.idsSha256 must match ids: expected ${baselineHash}, got ${summary.idsSha256}`);
      }
    }
  }
  return failures;
}

function baselineEntry(baseline) {
  return (baseline.entries ?? []).find((entry) => entry.id === "clawjs.existing-surfaces-without-resource-contract");
}

function compareMissingToBaseline(kind, ids, entry, failures) {
  const expected = entry?.missingResourceContract?.[kind];
  if (!expected) {
    failures.push(`missing resource contract baseline does not include ${kind}`);
    return;
  }
  const actualHash = sha256Ids(ids);
  const expectedIds = Array.isArray(expected.ids) ? expected.ids : [];
  if (ids.length !== expected.count || actualHash !== expected.idsSha256) {
    const actualCounts = idCounts(ids);
    const expectedCounts = idCounts(expectedIds);
    const allIds = [...new Set([...expectedIds, ...ids])].sort();
    const added = allIds.flatMap((id) => {
      const count = (actualCounts.get(id) ?? 0) - (expectedCounts.get(id) ?? 0);
      return count > 0 ? [formatIdDelta(id, count)] : [];
    });
    const removed = allIds.flatMap((id) => {
      const count = (expectedCounts.get(id) ?? 0) - (actualCounts.get(id) ?? 0);
      return count > 0 ? [formatIdDelta(id, count)] : [];
    });
    const details = [
      ...(added.length > 0 ? [`added ${kind}: ${added.join(", ")}`] : []),
      ...(removed.length > 0 ? [`removed ${kind}: ${removed.join(", ")}`] : []),
    ];
    failures.push(`${kind} without resourceContract baseline drift: expected ${expected.count}/${expected.idsSha256}, got ${ids.length}/${actualHash}${details.length > 0 ? ` (${details.join("; ")})` : ""}`);
  }
}

function inspectableRegistry(registry = clawPersistentSurfaceRegistry) {
  return {
    nodes: registry === clawPersistentSurfaceRegistry ? [...(registry.nodes ?? []), ...v1MainSchemaSurfaceNodes] : [...(registry.nodes ?? [])],
    routes: registry.routes ?? [],
  };
}

function validateSurfaceResourceContracts(registry = clawPersistentSurfaceRegistry, baseline = readBaseline()) {
  const failures = [];
  failures.push(...validateBaselineEnvelope(baseline));
  const { nodes, routes } = inspectableRegistry(registry);

  for (const node of nodes) {
    if (node.resourceContract) validateResourceContract(node.resourceContract, `node ${node.id}`, failures);
  }
  for (const route of routes) {
    if (route.resourceContract) validateResourceContract(route.resourceContract, `route ${route.id}`, failures);
  }

  const entry = baselineEntry(baseline);
  if (!entry) {
    failures.push("surface resource contract baseline must include clawjs.existing-surfaces-without-resource-contract");
  } else {
    compareMissingToBaseline("nodes", missingResourceContractIds(nodes), entry, failures);
    compareMissingToBaseline("routes", missingResourceContractIds(routes), entry, failures);
  }

  return failures;
}

function resourceContractDiagnostic(failure) {
  if (failure.includes("baseline drift")) {
    return createDiagnostic("surface_resource_contract_baseline_drift", failure, {
      location: "docs/surface-resource-contract-baseline.json",
      suggestion: "Backfill resourceContract on new surfaces, or intentionally update the baseline after classifying the debt.",
      safeNextStep: "Run node --import tsx scripts/surface-resource-contract-guard.mjs --update-baseline only after documenting owner, risk, expiry, and reentry condition.",
    });
  }
  if (failure.includes("resourceContract.")) {
    return createDiagnostic("surface_resource_contract_field_missing", failure, {
      location: "packages/clawjs-core/src/catalogs.ts",
      suggestion: "Complete every resourceContract dimension: startup, idle, memory, streaming, storage, hotPath, scale, and validation.",
      safeNextStep: "Add the missing resourceContract field, then rerun node --import tsx scripts/surface-resource-contract-guard.mjs.",
    });
  }
  if (failure.includes("baseline") || failure.includes("missingResourceContract")) {
    return createDiagnostic("surface_resource_contract_baseline_invalid", failure, {
      location: "docs/surface-resource-contract-baseline.json",
      suggestion: "Fix the baseline envelope, sorted ids, count, hash, expiry, or classification.",
      safeNextStep: "Repair docs/surface-resource-contract-baseline.json, then rerun node --import tsx scripts/surface-resource-contract-guard.mjs.",
    });
  }
  return createDiagnostic("surface_resource_contract_guard_failed", failure, {
    location: "scripts/surface-resource-contract-guard.mjs",
    suggestion: "Inspect the surface resource contract guard and restore the expected invariant.",
    safeNextStep: "Fix the reported resource contract issue, then rerun node --import tsx scripts/surface-resource-contract-guard.mjs.",
  });
}

function printFailures(failures, options = {}) {
  printActionableFailureReport({
    title: options.title ?? "surface resource contract guard failed:",
    diagnostics: failures.map(resourceContractDiagnostic),
    stream: options.stream ?? process.stderr,
  });
}

function buildBaseline(registry = clawPersistentSurfaceRegistry) {
  const { nodes, routes } = inspectableRegistry(registry);
  const missingNodes = missingResourceContractIds(nodes);
  const missingRoutes = missingResourceContractIds(routes);
  return {
    version: 1,
    entries: [
      {
        id: "clawjs.existing-surfaces-without-resource-contract",
        classification: "lateral_debt",
        steward: "claw",
        reason: "Initial bounded baseline for stable surfaces that predate the resourceContract requirement.",
        risk: "Existing surfaces remain inspectable, but their startup, idle, memory, streaming, storage, hot-path, scale, and validation contract is not yet machine-checkable.",
        expires: "2026-08-18",
        missingResourceContract: {
          nodes: missingResourceContractSummary(missingNodes),
          routes: missingResourceContractSummary(missingRoutes),
        },
        nextPhase: "Backfill resourceContract on high-change and runtime-critical surfaces, then reduce this baseline.",
        reentryCondition: "Any new API, UI, CLI, schema, storage key, route, stream, cache, permission, or feature flag must carry resourceContract before landing.",
      },
    ],
  };
}

function runSelfTest() {
  const validResourceContract = {
    startup: "self-test startup",
    idle: "self-test idle",
    memory: "self-test memory",
    streaming: "self-test streaming",
    storage: "self-test storage",
    hotPath: "self-test hot path",
    scale: "self-test scale",
    validation: "self-test validation",
  };
  const registry = {
    nodes: [
      { id: "self.node.withResourceContract", resourceContract: validResourceContract },
      { id: "self.node.baselined" },
    ],
    routes: [
      { id: "self.route.withResourceContract", resourceContract: validResourceContract },
      { id: "self.route.baselined" },
    ],
  };
  const baseline = buildBaseline(registry);
  assert.deepEqual(validateSurfaceResourceContracts(registry, baseline), []);

  const newNodeFailures = validateSurfaceResourceContracts({
    ...registry,
    nodes: [...registry.nodes, { id: "self.node.new" }],
  }, baseline);
  assert.match(newNodeFailures.join("\n"), /added nodes: self\.node\.new/);

  const malformedContractFailures = validateSurfaceResourceContracts({
    nodes: [{ id: "self.node.bad", resourceContract: { ...validResourceContract, memory: "" } }],
    routes: [],
  }, buildBaseline({ nodes: [], routes: [] }));
  assert.match(malformedContractFailures.join("\n"), /resourceContract\.memory must be a non-empty string/);

  const chunks = [];
  printFailures([
    "/Users/example/private node self.node resourceContract.memory must be a non-empty string",
    "nodes without resourceContract baseline drift: expected 1/abc, got 2/def (added nodes: self.node.new)",
    "entry.missingResourceContract.nodes.ids must be sorted",
  ], { stream: { write: (chunk) => chunks.push(chunk) } });
  const output = chunks.join("");
  assert.match(output, /code: surface_resource_contract_field_missing/);
  assert.match(output, /code: surface_resource_contract_baseline_drift/);
  assert.match(output, /code: surface_resource_contract_baseline_invalid/);
  assert.match(output, /location: docs\/surface-resource-contract-baseline\.json/);
  assert.match(output, /suggestion: Backfill resourceContract on new surfaces/);
  assert.match(output, /next: Add the missing resourceContract field/);
  assert.doesNotMatch(output, /\/Users\/example/);
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
  console.log("surface resource contract guard self-test passed");
  process.exit(0);
}

if (process.argv.includes("--update-baseline")) {
  fs.writeFileSync(baselinePath, `${JSON.stringify(buildBaseline(), null, 2)}\n`);
  console.log(`updated ${path.relative(rootDir, baselinePath)}`);
  process.exit(0);
}

const failures = validateSurfaceResourceContracts();
if (failures.length > 0) {
  printFailures(failures);
  process.exit(1);
}

console.log("surface resource contract guard passed");
