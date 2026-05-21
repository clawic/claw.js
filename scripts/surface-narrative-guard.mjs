#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { clawPersistentSurfaceRegistry } from "../packages/clawjs-core/src/catalogs.ts";
import { v1MainSchemaSurfaceNodes } from "../packages/clawjs/src/v1-data-surface.ts";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = path.join(rootDir, "docs/surface-narrative-baseline.json");
const today = new Date().toISOString().slice(0, 10);

function sha256Ids(ids) {
  return crypto.createHash("sha256").update([...ids].sort().join("\n")).digest("hex");
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function existingRelativePath(relativePath) {
  return hasText(relativePath) && fs.existsSync(path.join(rootDir, relativePath));
}

function validateNarrative(narrative, label, failures) {
  if (!narrative || typeof narrative !== "object" || Array.isArray(narrative)) {
    failures.push(`${label} is missing surfaceNarrative`);
    return;
  }
  if (!hasText(narrative.concept)) failures.push(`${label}.surfaceNarrative.concept must be a non-empty string`);
  if (!hasText(narrative.nonInference)) failures.push(`${label}.surfaceNarrative.nonInference must be a non-empty string`);
  const decision = narrative.authorizingDecision;
  if (!decision || typeof decision !== "object" || Array.isArray(decision)) {
    failures.push(`${label}.surfaceNarrative.authorizingDecision must be an object`);
  } else {
    if (!hasText(decision.ref)) failures.push(`${label}.surfaceNarrative.authorizingDecision.ref must be a non-empty string`);
    if (!hasText(decision.path)) {
      failures.push(`${label}.surfaceNarrative.authorizingDecision.path must be a non-empty string`);
    } else if (!existingRelativePath(decision.path)) {
      failures.push(`${label}.surfaceNarrative.authorizingDecision.path does not exist: ${decision.path}`);
    }
  }
  const completingSurface = narrative.completingSurface;
  if (!completingSurface || typeof completingSurface !== "object" || Array.isArray(completingSurface)) {
    failures.push(`${label}.surfaceNarrative.completingSurface must be an object`);
  } else {
    if (!hasText(completingSurface.human)) failures.push(`${label}.surfaceNarrative.completingSurface.human must be a non-empty string`);
    if (!hasText(completingSurface.programmatic)) failures.push(`${label}.surfaceNarrative.completingSurface.programmatic must be a non-empty string`);
  }
}

function missingNarrativeIds(items) {
  return items.filter((item) => !item.surfaceNarrative).map((item) => item.id).sort();
}

function missingNarrativeSummary(ids) {
  const sortedIds = [...ids].sort();
  return { count: sortedIds.length, idsSha256: sha256Ids(sortedIds), ids: sortedIds };
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

function readBaseline() {
  if (!fs.existsSync(baselinePath)) return { version: 1, entries: [] };
  return JSON.parse(fs.readFileSync(baselinePath, "utf8"));
}

function validateBaselineEnvelope(baseline) {
  const failures = [];
  if (baseline.version !== 1) failures.push("surface narrative baseline version must be 1");
  for (const [index, entry] of (baseline.entries ?? []).entries()) {
    const label = entry.id ?? `<entry ${index + 1}>`;
    for (const field of ["id", "classification", "owner", "reason", "risk", "expires", "nextPhase", "reentryCondition"]) {
      if (!entry[field]) failures.push(`${label} is missing ${field}`);
    }
    if (!["lateral_debt", "pre_existing_dirty"].includes(entry.classification)) {
      failures.push(`${label} has invalid classification ${entry.classification}`);
    }
    if (entry.expires && entry.expires < today) failures.push(`${label} expired on ${entry.expires}`);
    for (const key of ["nodes", "routes"]) {
      const summary = entry.missingNarrative?.[key];
      if (!summary || typeof summary.count !== "number" || !hasText(summary.idsSha256) || !Array.isArray(summary.ids)) {
        failures.push(`${label}.missingNarrative.${key} must include count, idsSha256, and ids`);
        continue;
      }
      const invalidIds = summary.ids.filter((id) => !hasText(id));
      if (invalidIds.length > 0) failures.push(`${label}.missingNarrative.${key}.ids must contain only non-empty strings`);
      if (!isSorted(summary.ids)) failures.push(`${label}.missingNarrative.${key}.ids must be sorted`);
      if (summary.count !== summary.ids.length) {
        failures.push(`${label}.missingNarrative.${key}.count must match ids length: ${summary.count} !== ${summary.ids.length}`);
      }
      const baselineHash = sha256Ids(summary.ids);
      if (summary.idsSha256 !== baselineHash) {
        failures.push(`${label}.missingNarrative.${key}.idsSha256 must match ids: expected ${baselineHash}, got ${summary.idsSha256}`);
      }
    }
  }
  return failures;
}

function baselineEntry(baseline) {
  return (baseline.entries ?? []).find((entry) => entry.id === "clawjs.existing-surfaces-without-narrative");
}

function compareMissingToBaseline(kind, ids, entry, failures) {
  const expected = entry?.missingNarrative?.[kind];
  if (!expected) {
    failures.push(`missing narrative baseline does not include ${kind}`);
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
    failures.push(`${kind} without surfaceNarrative baseline drift: expected ${expected.count}/${expected.idsSha256}, got ${ids.length}/${actualHash}${details.length > 0 ? ` (${details.join("; ")})` : ""}`);
  }
}

function inspectableRegistry(registry = clawPersistentSurfaceRegistry) {
  return {
    nodes: registry === clawPersistentSurfaceRegistry ? [...(registry.nodes ?? []), ...v1MainSchemaSurfaceNodes] : [...(registry.nodes ?? [])],
    routes: registry.routes ?? [],
  };
}

function validateSurfaceNarratives(registry = clawPersistentSurfaceRegistry, baseline = readBaseline()) {
  const failures = [];
  failures.push(...validateBaselineEnvelope(baseline));
  const { nodes, routes } = inspectableRegistry(registry);

  for (const node of nodes) {
    if (node.surfaceNarrative) validateNarrative(node.surfaceNarrative, `node ${node.id}`, failures);
  }
  for (const route of routes) {
    if (route.surfaceNarrative) validateNarrative(route.surfaceNarrative, `route ${route.id}`, failures);
  }

  const entry = baselineEntry(baseline);
  if (!entry) {
    failures.push("surface narrative baseline must include clawjs.existing-surfaces-without-narrative");
  } else {
    compareMissingToBaseline("nodes", missingNarrativeIds(nodes), entry, failures);
    compareMissingToBaseline("routes", missingNarrativeIds(routes), entry, failures);
  }

  return failures;
}

function buildBaseline(registry = clawPersistentSurfaceRegistry) {
  const { nodes, routes } = inspectableRegistry(registry);
  const missingNodes = missingNarrativeIds(nodes);
  const missingRoutes = missingNarrativeIds(routes);
  return {
    version: 1,
    entries: [
      {
        id: "clawjs.existing-surfaces-without-narrative",
        classification: "lateral_debt",
        owner: "claw",
        reason: "Initial bounded baseline for stable surfaces that predate the surfaceNarrative contract.",
        risk: "Existing surfaces remain inspectable, but their conceptual authorization is not yet machine-checkable.",
        expires: "2026-08-18",
        missingNarrative: {
          nodes: missingNarrativeSummary(missingNodes),
          routes: missingNarrativeSummary(missingRoutes),
        },
        nextPhase: "Backfill surfaceNarrative on high-change and runtime-critical surfaces, then reduce this baseline.",
        reentryCondition: "Any new API, UI, CLI, schema, storage key, route, permission, or feature flag must carry surfaceNarrative before landing.",
      },
    ],
  };
}

function runSelfTest() {
  const validNarrative = {
    concept: "Self-test concept",
    authorizingDecision: {
      ref: "ADR 0004",
      path: "docs/adr/0004-persistent-surface-registry-and-inspection.md",
    },
    completingSurface: {
      human: "self-test human surface",
      programmatic: "self-test programmatic surface",
    },
    nonInference: "self-test does not authorize other surfaces",
  };
  const registry = {
    nodes: [
      { id: "self.node.withNarrative", surfaceNarrative: validNarrative },
      { id: "self.node.baselined" },
    ],
    routes: [
      { id: "self.route.withNarrative", surfaceNarrative: validNarrative },
      { id: "self.route.baselined" },
    ],
  };
  const baseline = {
    version: 1,
    entries: [
      {
        ...buildBaseline(registry).entries[0],
        missingNarrative: {
          nodes: missingNarrativeSummary(["self.node.baselined"]),
          routes: missingNarrativeSummary(["self.route.baselined"]),
        },
      },
    ],
  };
  assert.deepEqual(validateSurfaceNarratives(registry, baseline), []);

  const newNodeFailures = validateSurfaceNarratives({ ...registry, nodes: [...registry.nodes, { id: "self.node.new" }] }, baseline);
  assert.match(newNodeFailures.join("\n"), /nodes without surfaceNarrative baseline drift/);
  assert.match(newNodeFailures.join("\n"), /self\.node\.new/);

  const invalidNarrativeFailures = validateSurfaceNarratives({
    ...registry,
    nodes: [{ id: "self.node.invalid", surfaceNarrative: { ...validNarrative, authorizingDecision: { ref: "missing", path: "docs/missing.md" } } }, registry.nodes[1]],
  }, baseline);
  assert.match(invalidNarrativeFailures.join("\n"), /authorizingDecision\.path does not exist/);
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
  console.log("surface narrative guard self-test passed");
  process.exit(0);
}

if (process.argv.includes("--print-baseline")) {
  console.log(JSON.stringify(buildBaseline(), null, 2));
  process.exit(0);
}

const failures = validateSurfaceNarratives();
if (failures.length > 0) {
  console.error("surface narrative guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("surface narrative guard passed");
