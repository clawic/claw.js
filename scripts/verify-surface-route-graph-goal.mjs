import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  clawSurfaceGraphEdges,
  findClawPersistentSurfaceNode,
  findClawSurfaceRoute,
} from "../packages/clawjs-core/src/catalogs.ts";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ledgerPath = path.join(rootDir, "docs/governance/surface-route-graph/closure-matrix.json");
const sourceReviewPath = path.join(rootDir, "docs/governance/surface-route-graph/source-review.json");
const narrativeBaselinePath = path.join(rootDir, "docs/surface-narrative-baseline.json");
const resourceBaselinePath = path.join(rootDir, "docs/surface-resource-contract-baseline.json");

const requiredCentralRouteIds = [
  "chat.localDesktop",
  "chat.companionBridge",
  "chat.remoteRelay",
];

const requiredCriticalRouteIds = [
  "chat.localDesktop",
  "chat.companionBridge",
  "chat.remoteRelay",
  "remote.chatGateway",
  "agents.mcpApiAssignment",
  "cli.commandIntentResolution",
  "mac.directCliAction",
  "mac.permissionLifecycle",
  "gateway.headlessAgentHost",
  "sync.sessions",
];

const requiredCriticalSurfaceIds = [
  "clawix.ui.chat",
  "clawix.companion.client",
  "clawix.bridge.local",
  "claw.daemon.local",
  "claw.runtime.agent",
  "claw.sessions",
  "claw.remote.client",
  "claw.relay",
  "claw.relay.connector",
  "claw.mcp.surface",
  "claw.cli.command.commands",
  "claw.host.signed",
  "claw.host.permissions",
  "claw.host.audit",
];

const edgeTypes = ["consumes", "owns", "exposes", "brokers"];
const edgeById = new Map(clawSurfaceGraphEdges.map((edge) => [edge.id, edge]));
const expectedSourceReview = [
  ["QA-001", "primary_outcome"],
  ["QA-002", "graph_scope"],
  ["QA-003", "work_modes"],
  ["QA-004", "edge_source"],
  ["QA-005", "strictness"],
  ["QA-006", "agent_packaging"],
  ["QA-007", "initial_slice"],
  ["QA-008", "edge_taxonomy"],
  ["QA-009", "route_validation"],
  ["QA-010", "initial_routes"],
  ["QA-011", "fail_scope"],
  ["QA-012", "agent_output"],
  ["QA-013", "all_definition"],
  ["QA-014", "gate_activation"],
  ["QA-015", "relay_status"],
  ["QA-016", "adr_shape"],
  ["QA-017", "skill_shape"],
  ["QA-018", "route_shape"],
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sameOrderedList(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonEmptyStringArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
}

function resolveReference(reference) {
  if (!isNonEmptyString(reference)) return null;
  if (reference.startsWith("clawix:")) {
    return reference.slice("clawix:".length).length > 0 ? reference : null;
  }
  if (reference.startsWith("clawjs:")) return path.join(rootDir, reference.slice("clawjs:".length));
  return path.join(rootDir, reference);
}

function fileExists(reference) {
  if (reference.startsWith("clawix:")) return true;
  const resolved = resolveReference(reference);
  return Boolean(resolved && fs.existsSync(resolved));
}

function baselineIds(baseline, targetKind) {
  const key = baseline.entries?.[0]?.missingNarrative ? "missingNarrative" : "missingResourceContract";
  return new Set(baseline.entries?.flatMap((entry) => entry[key]?.[targetKind]?.ids ?? []) ?? []);
}

function validateLedger(ledger) {
  const errors = [];
  const fail = (message) => errors.push(message);

  if (ledger.version !== 1) fail("ledger version must be 1");
  if (!isNonEmptyString(ledger.closureReasonRequired)) fail("ledger must record closureReasonRequired");
  if (!sameOrderedList(ledger.centralRouteIds, requiredCentralRouteIds)) fail("centralRouteIds do not match the route-graph closure scope");
  if (!sameOrderedList(ledger.criticalRouteIds, requiredCriticalRouteIds)) fail("criticalRouteIds do not match the route-graph closure scope");
  if (!sameOrderedList(ledger.criticalSurfaceIds, requiredCriticalSurfaceIds)) fail("criticalSurfaceIds do not match the route-graph closure scope");

  const routeRows = new Map((ledger.routes ?? []).map((row) => [row.id, row]));
  const surfaceRows = new Map((ledger.surfaces ?? []).map((row) => [row.id, row]));
  const blockedGaps = new Map((ledger.blockedGaps ?? []).map((gap) => [gap.id, gap]));
  const narrativeBaseline = readJson(narrativeBaselinePath);
  const resourceBaseline = readJson(resourceBaselinePath);
  const narrativeRouteIds = baselineIds(narrativeBaseline, "routes");
  const resourceRouteIds = baselineIds(resourceBaseline, "routes");
  const narrativeNodeIds = baselineIds(narrativeBaseline, "nodes");
  const resourceNodeIds = baselineIds(resourceBaseline, "nodes");

  for (const routeId of requiredCriticalRouteIds) {
    const row = routeRows.get(routeId);
    const route = findClawSurfaceRoute(routeId);
    if (!row) {
      fail(`missing ledger route row ${routeId}`);
      continue;
    }
    if (!route) {
      fail(`missing registry route ${routeId}`);
      continue;
    }
    validateRowShape("route", row, fail);
    validateRowEdges("route", row, route, fail);
    validateFixtures("route", row, fail);
    validateDebt("route", row, blockedGaps, fail);

    if (requiredCentralRouteIds.includes(routeId)) {
      if (!route.surfaceNarrative) fail(`${routeId} must have route surfaceNarrative`);
      if (!route.resourceContract) fail(`${routeId} must have route resourceContract`);
    } else if (!route.surfaceNarrative || !route.resourceContract) {
      requireGapForBaseline(row, blockedGaps, "route", routeId, narrativeRouteIds, resourceRouteIds, fail);
    }
  }

  for (const surfaceId of requiredCriticalSurfaceIds) {
    const row = surfaceRows.get(surfaceId);
    const node = findClawPersistentSurfaceNode(surfaceId);
    if (!row) {
      fail(`missing ledger surface row ${surfaceId}`);
      continue;
    }
    if (!node) {
      fail(`missing registry surface ${surfaceId}`);
      continue;
    }
    validateRowShape("surface", row, fail);
    validateRowEdges("surface", row, null, fail);
    validateFixtures("surface", row, fail);
    validateDebt("surface", row, blockedGaps, fail);

    for (const type of edgeTypes) {
      for (const edgeId of row.edges[type]) {
        const edge = edgeById.get(edgeId);
        if (edge && edge.fromId !== surfaceId && edge.toId !== surfaceId) fail(`${surfaceId} ${type} edge ${edgeId} does not touch the surface`);
      }
    }
    if (!node.surfaceNarrative || !node.resourceContract) {
      requireGapForBaseline(row, blockedGaps, "surface", surfaceId, narrativeNodeIds, resourceNodeIds, fail);
    }
  }

  for (const [gapId, gap] of blockedGaps) validateBlockedGap(gapId, gap, routeRows, surfaceRows, narrativeRouteIds, resourceRouteIds, narrativeNodeIds, resourceNodeIds, fail);
  return errors;
}

function validateSourceReview(review) {
  const errors = [];
  const fail = (message) => errors.push(message);
  if (review.schemaVersion !== 1) fail("source review schemaVersion must be 1");
  if (review.reviewId !== "surface-route-graph-source-review-v1") fail("source review reviewId is wrong");
  if (review.status !== "complete_with_blocked_gaps") fail("source review status must be complete_with_blocked_gaps");
  if (!Array.isArray(review.items) || review.items.length !== expectedSourceReview.length) fail("source review must contain exactly 18 one-by-one Q/A items");

  const items = new Map((review.items ?? []).map((item) => [item.qaId, item]));
  for (const [qaId, promptId] of expectedSourceReview) {
    const item = items.get(qaId);
    if (!item) {
      fail(`source review missing ${qaId}`);
      continue;
    }
    if (item.promptId !== promptId) fail(`${qaId} promptId must be ${promptId}`);
    if (!isNonEmptyString(item.decisionAnchor)) fail(`${qaId} is missing decisionAnchor`);
    if (!isNonEmptyString(item.userDecision)) fail(`${qaId} is missing userDecision`);
    if (!["implemented", "implemented_with_blocked_gaps", "external_pending", "blocked"].includes(item.disposition)) fail(`${qaId} has invalid disposition ${item.disposition}`);
    if (!isNonEmptyStringArray(item.evidenceRefs)) fail(`${qaId} is missing evidenceRefs`);
  }

  return errors;
}

function validateRowShape(kind, row, fail) {
  if (!isNonEmptyString(row.owner)) fail(`${kind} ${row.id} is missing owner`);
  if (!isNonEmptyStringArray(row.inputContracts)) fail(`${kind} ${row.id} is missing inputContracts`);
  if (!isNonEmptyStringArray(row.outputContracts)) fail(`${kind} ${row.id} is missing outputContracts`);
  if (!row.edges || typeof row.edges !== "object") fail(`${kind} ${row.id} is missing edges`);
  for (const type of edgeTypes) {
    if (!Array.isArray(row.edges?.[type])) fail(`${kind} ${row.id} edges.${type} must be an array`);
  }
  if (!isNonEmptyStringArray(row.fixtures)) fail(`${kind} ${row.id} is missing fixtures`);
  if (!isNonEmptyString(row.hermeticValidation)) fail(`${kind} ${row.id} is missing hermeticValidation`);
  if (!row.debt || !isNonEmptyString(row.debt.status)) fail(`${kind} ${row.id} is missing debt.status`);
}

function validateRowEdges(kind, row, route, fail) {
  const routeEdgeIds = new Set((route?.steps ?? []).map((step) => step.edgeId).filter(Boolean));
  for (const type of edgeTypes) {
    for (const edgeId of row.edges[type] ?? []) {
      const edge = edgeById.get(edgeId);
      if (!edge) {
        fail(`${kind} ${row.id} references missing edge ${edgeId}`);
        continue;
      }
      if (edge.type !== type) fail(`${kind} ${row.id} lists ${edgeId} under ${type}, but registry type is ${edge.type}`);
      if (route && !routeEdgeIds.has(edgeId)) fail(`route ${row.id} edge ${edgeId} is not present in explicit route steps`);
    }
  }
}

function validateFixtures(kind, row, fail) {
  for (const fixture of row.fixtures) {
    if (!fileExists(fixture)) fail(`${kind} ${row.id} fixture does not exist: ${fixture}`);
  }
}

function validateDebt(kind, row, blockedGaps, fail) {
  if (row.debt.status === "complete") {
    if (!isNonEmptyString(row.debt.evidence)) fail(`${kind} ${row.id} complete debt state must include evidence`);
    return;
  }
  if (!["blocked", "external_pending"].includes(row.debt.status)) fail(`${kind} ${row.id} has invalid debt status ${row.debt.status}`);
  if (!Array.isArray(row.debt.blockedGapIds) || row.debt.blockedGapIds.length === 0) fail(`${kind} ${row.id} blocked debt must list blockedGapIds`);
  for (const gapId of row.debt.blockedGapIds ?? []) {
    if (!blockedGaps.has(gapId)) fail(`${kind} ${row.id} references missing blocked gap ${gapId}`);
  }
}

function requireGapForBaseline(row, blockedGaps, kind, targetId, narrativeIds, resourceIds, fail) {
  const expectedGapId = `${kind}.${targetId}.narrative-resource`;
  if (!narrativeIds.has(targetId)) fail(`${targetId} is missing narrative but is not listed in the narrative baseline`);
  if (!resourceIds.has(targetId)) fail(`${targetId} is missing resourceContract but is not listed in the resource baseline`);
  if (!row.debt?.blockedGapIds?.includes(expectedGapId)) fail(`${targetId} must reference blocked gap ${expectedGapId}`);
  if (!blockedGaps.has(expectedGapId)) fail(`${targetId} missing blocked gap row ${expectedGapId}`);
}

function validateBlockedGap(gapId, gap, routeRows, surfaceRows, narrativeRouteIds, resourceRouteIds, narrativeNodeIds, resourceNodeIds, fail) {
  if (!isNonEmptyString(gap.surfaceOrRouteId)) fail(`${gapId} is missing surfaceOrRouteId`);
  if (!["blocked", "external_pending"].includes(gap.status)) fail(`${gapId} has invalid status ${gap.status}`);
  if (!isNonEmptyString(gap.file)) fail(`${gapId} is missing file`);
  if (!isNonEmptyString(gap.pendingDecision)) fail(`${gapId} is missing pendingDecision`);
  if (!isNonEmptyString(gap.evidence)) fail(`${gapId} is missing evidence`);
  if (gap.file && !fileExists(gap.file)) fail(`${gapId} file does not exist: ${gap.file}`);
  if (gap.pairedFile && !fileExists(gap.pairedFile)) fail(`${gapId} pairedFile does not exist: ${gap.pairedFile}`);

  const isRouteGap = routeRows.has(gap.surfaceOrRouteId);
  const isSurfaceGap = surfaceRows.has(gap.surfaceOrRouteId);
  if (!isRouteGap && !isSurfaceGap) fail(`${gapId} targets ${gap.surfaceOrRouteId}, which is not a critical route or surface row`);

  if (gapId.endsWith(".narrative-resource")) {
    const narrativeIds = isRouteGap ? narrativeRouteIds : narrativeNodeIds;
    const resourceIds = isRouteGap ? resourceRouteIds : resourceNodeIds;
    if (!narrativeIds.has(gap.surfaceOrRouteId)) fail(`${gapId} target is not in narrative baseline`);
    if (!resourceIds.has(gap.surfaceOrRouteId)) fail(`${gapId} target is not in resource baseline`);
    if (gap.file !== "docs/surface-narrative-baseline.json") fail(`${gapId} must point at docs/surface-narrative-baseline.json`);
    if (gap.pairedFile !== "docs/surface-resource-contract-baseline.json") fail(`${gapId} must pair docs/surface-resource-contract-baseline.json`);
  }
}

function runSelfTest() {
  const ledger = readJson(ledgerPath);
  const missingCentralRouteNarrative = structuredClone(ledger);
  missingCentralRouteNarrative.routes.find((row) => row.id === "chat.companionBridge").debt = { status: "blocked", blockedGapIds: [] };
  assert.match(validateLedger(missingCentralRouteNarrative).join("\n"), /blocked debt must list blockedGapIds/);

  const missingEdge = structuredClone(ledger);
  missingEdge.surfaces.find((row) => row.id === "claw.relay").edges.brokers.push("missing.edge");
  assert.match(validateLedger(missingEdge).join("\n"), /references missing edge missing\.edge/);

  const missingBaselineGap = structuredClone(ledger);
  missingBaselineGap.surfaces.find((row) => row.id === "claw.relay").debt.blockedGapIds = ["remote.physical-provider-validation"];
  assert.match(validateLedger(missingBaselineGap).join("\n"), /claw\.relay must reference blocked gap surface\.claw\.relay\.narrative-resource/);
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
  console.log("surface route graph goal verifier self-test passed");
  process.exit(0);
}

const errors = [
  ...validateLedger(readJson(ledgerPath)),
  ...validateSourceReview(readJson(sourceReviewPath)),
];
if (errors.length > 0) {
  console.error("surface route graph goal verifier failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("surface route graph goal verifier passed");
