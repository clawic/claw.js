import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { clawPersistentSurfaceRegistry } from "../packages/clawjs-core/src/catalogs.ts";
import { createDiagnostic, printActionableFailureReport } from "./actionable-error.mjs";

const requiredNodeIds = [
  "claw.cli.public",
  "claw.mcp.surface",
  "claw.storage.canonical",
  "claw.host.signed",
  "claw.host.permissions",
  "claw.host.grants",
  "claw.host.approvals",
  "claw.host.audit",
  "claw.mac.controlPlane",
  "claw.mac.capabilityAtlas",
  "claw.mac.permissionBroker",
  "claw.mac.actionBroker",
  "clawix.ui.chat",
  "clawix.companion.client",
  "clawix.bridge.local",
  "claw.daemon.local",
  "claw.runtime.agent",
  "claw.sessions",
  "claw.remote.client",
  "claw.relay",
  "claw.relay.connector",
  "claw.coordinator",
  "claw.gateway",
  "claw.connector",
  "claw.sync",
  "claw.transport.iroh",
  "claw.headlessHost",
  "claw.remoteCache",
  "claw.workspace",
];

const requiredRouteIds = [
  "chat.localDesktop",
  "chat.companionBridge",
  "chat.remoteRelay",
  "remote.chatGateway",
  "remote.searchGateway",
  "remote.secretBrokeredOperation",
  "sync.skills",
  "sync.memoryUserModel",
  "sync.driveFiles",
  "sync.sqliteResources",
  "gateway.headlessAgentHost",
  "gateway.multiTenantAgentService",
  "mac.directCliAction",
  "mac.permissionLifecycle",
  "mesh.resourceShare",
];

const requiredContractIds = [
  "clawix.protocol.bridge.v1",
  "claw.api.relay.remote",
  "claw.api.relay.connector",
  "claw.api.remote.classifications",
  "claw.api.sync.manifests",
  "claw.api.gateway.conformance",
  "claw.protocol.hostCommand.v1",
  "claw.mac.actionPlan.v1",
  "claw.mac.actionReceipt.v1",
  "claw.mac.permissionState.v1",
];

const requiredTransportTokens = ["24080"];
const allowedEdgeTypes = new Set(["owns", "consumes", "exposes", "brokers"]);
const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const baselinePath = path.join(rootDir, "docs/surface-evidence-baseline.json");
const args = new Set(process.argv.slice(2));
const allowedArgs = new Set(["--self-test"]);

function readBaseline() {
  if (!fs.existsSync(baselinePath)) return { entries: [] };
  return JSON.parse(fs.readFileSync(baselinePath, "utf8"));
}

function baselineNodeIds() {
  return new Set((readBaseline().entries ?? []).flatMap((entry) => entry.nodeIds ?? []));
}

function validateRegistry(registry) {
  const errors = [];
  const nodes = registry.nodes ?? [];
  const edges = registry.edges ?? [];
  const routes = registry.routes ?? [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const baselineIds = baselineNodeIds();
  const edgeIds = new Set();

  function fail(message) {
    errors.push(message);
  }

  for (const nodeId of requiredNodeIds) {
    if (!nodeIds.has(nodeId)) fail(`missing required surface graph node ${nodeId}`);
  }

  for (const routeId of requiredRouteIds) {
    if (!routes.some((route) => route.id === routeId)) fail(`missing required surface graph route ${routeId}`);
  }

  for (const edge of edges) {
    if (!edge.id) fail("surface graph edge is missing id");
    if (edgeIds.has(edge.id)) fail(`duplicate surface graph edge id ${edge.id}`);
    edgeIds.add(edge.id);
    if (!allowedEdgeTypes.has(edge.type)) fail(`${edge.id} has invalid edge type ${edge.type}`);
    if (!nodeIds.has(edge.fromId)) fail(`${edge.id} references missing fromId ${edge.fromId}`);
    if (!nodeIds.has(edge.toId)) fail(`${edge.id} references missing toId ${edge.toId}`);
    if (edge.contractId && !nodeIds.has(edge.contractId) && !baselineIds.has(edge.contractId)) fail(`${edge.id} references missing contractId ${edge.contractId}`);
    if (!edge.validation) fail(`${edge.id} is missing validation`);
  }

  for (const route of routes) {
    if (!nodeIds.has(route.fromId)) fail(`${route.id} references missing fromId ${route.fromId}`);
    if (!nodeIds.has(route.toId)) fail(`${route.id} references missing toId ${route.toId}`);
    if (!route.validation) fail(`${route.id} is missing validation`);
    if (!Array.isArray(route.tests) || route.tests.length === 0) fail(`${route.id} must list route tests`);
    if (!Array.isArray(route.steps) || route.steps.length === 0) fail(`${route.id} must define explicit steps`);
    for (const [index, step] of (route.steps ?? []).entries()) {
      const label = `${route.id}.steps[${index}]`;
      if (!allowedEdgeTypes.has(step.edgeType)) fail(`${label} has invalid edgeType ${step.edgeType}`);
      if (!nodeIds.has(step.fromId)) fail(`${label} references missing fromId ${step.fromId}`);
      if (!nodeIds.has(step.toId)) fail(`${label} references missing toId ${step.toId}`);
      if (step.edgeId && !edgeIds.has(step.edgeId)) fail(`${label} references missing edgeId ${step.edgeId}`);
      if (step.contractId && !nodeIds.has(step.contractId) && !baselineIds.has(step.contractId)) fail(`${label} references missing contractId ${step.contractId}`);
      if (!step.validation) fail(`${label} is missing validation`);
    }
  }

  const graphContractIds = new Set([
    ...edges.map((edge) => edge.contractId).filter(Boolean),
    ...routes.flatMap((route) => (route.steps ?? []).map((step) => step.contractId).filter(Boolean)),
  ]);
  for (const contractId of requiredContractIds) {
    if (!graphContractIds.has(contractId)) fail(`required critical contract is not referenced by the surface graph: ${contractId}`);
  }

  const transportText = [
    ...edges.map((edge) => edge.transport ?? ""),
    ...routes.flatMap((route) => [route.transport ?? "", ...(route.steps ?? []).map((step) => step.transport ?? "")]),
  ].join("\n");
  for (const token of requiredTransportTokens) {
    if (!transportText.includes(token)) fail(`required critical transport token is not covered by the surface graph: ${token}`);
  }

  return errors;
}

function cloneRegistry() {
  return JSON.parse(JSON.stringify(clawPersistentSurfaceRegistry));
}

function surfaceRouteDiagnostic(error) {
  if (error.startsWith("unknown argument")) {
    return createDiagnostic("surface_route_graph_usage_error", error, {
      status: "USAGE",
      location: "scripts/surface-route-graph-guard.mjs",
      suggestion: "Use --self-test or no arguments.",
      safeNextStep: "Rerun node --import tsx scripts/surface-route-graph-guard.mjs with a supported argument.",
    });
  }
  if (error.startsWith("missing required surface graph node")) {
    return createDiagnostic("surface_route_graph_required_node_missing", error, {
      location: "packages/clawjs-core/src/catalogs.ts",
      suggestion: "Restore the required surface graph node or update the guard only with a public routing decision.",
      safeNextStep: "Add the missing node to the persistent surface registry, then rerun this guard.",
    });
  }
  if (error.startsWith("missing required surface graph route")) {
    return createDiagnostic("surface_route_graph_required_route_missing", error, {
      location: "packages/clawjs-core/src/catalogs.ts",
      suggestion: "Restore the required route that proves the surface path can be followed end to end.",
      safeNextStep: "Add the missing route with tests and explicit steps, then rerun this guard.",
    });
  }
  if (error.includes("missing id") || error.includes("duplicate surface graph edge id") || error.includes("invalid edge type")) {
    return createDiagnostic("surface_route_graph_edge_shape_invalid", error, {
      location: "packages/clawjs-core/src/catalogs.ts",
      suggestion: "Give every edge a unique id and one of the allowed edge types: owns, consumes, exposes, brokers.",
      safeNextStep: "Fix the edge shape in the registry, then rerun node --import tsx scripts/surface-route-graph-guard.mjs.",
    });
  }
  if (error.includes("references missing fromId") || error.includes("references missing toId")) {
    return createDiagnostic("surface_route_graph_node_reference_missing", error, {
      location: "packages/clawjs-core/src/catalogs.ts",
      suggestion: "Point the edge or route step at an existing registry node.",
      safeNextStep: "Add the missing node or correct the fromId/toId reference, then rerun this guard.",
    });
  }
  if (error.includes("references missing contractId") || error.startsWith("required critical contract is not referenced")) {
    return createDiagnostic("surface_route_graph_contract_reference_missing", error, {
      location: "packages/clawjs-core/src/catalogs.ts",
      suggestion: "Reference an existing contract node or a baselined evidence contract for the route.",
      safeNextStep: "Add or correct the contractId, then rerun node --import tsx scripts/surface-route-graph-guard.mjs.",
    });
  }
  if (error.includes("is missing validation")) {
    return createDiagnostic("surface_route_graph_validation_missing", error, {
      location: "packages/clawjs-core/src/catalogs.ts",
      suggestion: "Attach validation evidence to every route, edge, and explicit route step.",
      safeNextStep: "Add the missing validation field, then rerun this guard.",
    });
  }
  if (error.includes("must list route tests")) {
    return createDiagnostic("surface_route_graph_route_tests_missing", error, {
      location: "packages/clawjs-core/src/catalogs.ts",
      suggestion: "List the tests that prove the route works before treating it as closed.",
      safeNextStep: "Add route tests to the route entry, then rerun this guard.",
    });
  }
  if (error.includes("must define explicit steps")) {
    return createDiagnostic("surface_route_graph_route_steps_missing", error, {
      location: "packages/clawjs-core/src/catalogs.ts",
      suggestion: "Define explicit route steps so agents can see each handoff and contract in the path.",
      safeNextStep: "Add route steps to the route entry, then rerun this guard.",
    });
  }
  if (error.startsWith("required critical transport token")) {
    return createDiagnostic("surface_route_graph_transport_missing", error, {
      location: "packages/clawjs-core/src/catalogs.ts",
      suggestion: "Document the critical transport token in the edge, route, or step transport metadata.",
      safeNextStep: "Add the missing transport evidence, then rerun node --import tsx scripts/surface-route-graph-guard.mjs.",
    });
  }
  return createDiagnostic("surface_route_graph_guard_failed", error, {
    location: "packages/clawjs-core/src/catalogs.ts",
    suggestion: "Inspect the surface route graph invariant and restore the missing graph evidence.",
    safeNextStep: "Fix the reported graph issue, then rerun node --import tsx scripts/surface-route-graph-guard.mjs.",
  });
}

function printErrors(items, options = {}) {
  printActionableFailureReport({
    title: options.title ?? "surface route graph guard failed:",
    diagnostics: items.map(surfaceRouteDiagnostic),
    stream: options.stream ?? process.stderr,
  });
}

function runSelfTest() {
  const missingNode = cloneRegistry();
  missingNode.routes[0].steps[0].toId = "missing.node";
  assert.match(validateRegistry(missingNode).join("\n"), /references missing toId missing\.node/);

  const missingContract = cloneRegistry();
  missingContract.edges.find((edge) => edge.id === "claw.edge.remote.consumes.relay").contractId = "missing.contract";
  assert.match(validateRegistry(missingContract).join("\n"), /references missing contractId missing\.contract/);

  const missingRelay = cloneRegistry();
  missingRelay.nodes = missingRelay.nodes.filter((node) => node.id !== "claw.relay");
  assert.match(validateRegistry(missingRelay).join("\n"), /missing required surface graph node claw\.relay/);

  const missingBridgeRoute = cloneRegistry();
  missingBridgeRoute.routes = missingBridgeRoute.routes.filter((route) => route.id !== "chat.companionBridge");
  assert.match(validateRegistry(missingBridgeRoute).join("\n"), /missing required surface graph route chat\.companionBridge/);

  const missingTransport = cloneRegistry();
  for (const edge of missingTransport.edges) edge.transport = edge.transport?.replace("24080", "PORT");
  for (const route of missingTransport.routes) {
    route.transport = route.transport?.replace("24080", "PORT");
    for (const step of route.steps ?? []) step.transport = step.transport?.replace("24080", "PORT");
  }
  assert.match(validateRegistry(missingTransport).join("\n"), /required critical transport token is not covered/);

  const chunks = [];
  printErrors([
    "unknown argument --bad-token-sk-test-secret-123456",
    "missing required surface graph node /Users/example/private",
    "missing required surface graph route chat.companionBridge",
    "edge.1 references missing fromId missing.node",
    "edge.1 references missing contractId missing.contract",
    "chat.localDesktop is missing validation",
    "chat.localDesktop must list route tests",
    "chat.localDesktop must define explicit steps",
    "required critical transport token is not covered by the surface graph: 24080",
  ], { stream: { write: (chunk) => chunks.push(chunk) } });
  const output = chunks.join("");
  for (const code of [
    "surface_route_graph_usage_error",
    "surface_route_graph_required_node_missing",
    "surface_route_graph_required_route_missing",
    "surface_route_graph_node_reference_missing",
    "surface_route_graph_contract_reference_missing",
    "surface_route_graph_validation_missing",
    "surface_route_graph_route_tests_missing",
    "surface_route_graph_route_steps_missing",
    "surface_route_graph_transport_missing",
  ]) {
    if (!output.includes(`code: ${code}`)) throw new Error(`self-test missing ${code}`);
  }
  if (!output.includes("suggestion: Restore the required route")) throw new Error("self-test missing actionable suggestion");
  if (output.includes("/Users/example") || output.includes("sk-test-secret-123456")) throw new Error("self-test leaked private data");
}

for (const arg of args) {
  if (!allowedArgs.has(arg)) {
    printErrors([`unknown argument ${arg}`]);
    process.exit(64);
  }
}

if (args.has("--self-test")) {
  runSelfTest();
  console.log("surface route graph guard self-test passed");
  process.exit(0);
}

const errors = validateRegistry(clawPersistentSurfaceRegistry);
if (errors.length > 0) {
  printErrors(errors);
  process.exit(1);
}

console.log("surface route graph guard passed");
