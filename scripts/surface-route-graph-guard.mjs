import { clawPersistentSurfaceRegistry } from "../packages/clawjs-core/src/index.ts";

const requiredNodeIds = [
  "clawix.ui.chat",
  "clawix.companion.client",
  "clawix.bridge.local",
  "claw.daemon.local",
  "claw.runtime.agent",
  "claw.sessions",
  "claw.remote.client",
  "claw.relay",
  "claw.relay.connector",
  "claw.workspace",
];

const requiredRouteIds = [
  "chat.localDesktop",
  "chat.companionBridge",
  "chat.remoteRelay",
];

const allowedEdgeTypes = new Set(["owns", "consumes", "exposes", "brokers"]);
const errors = [];

const nodes = clawPersistentSurfaceRegistry.nodes ?? [];
const edges = clawPersistentSurfaceRegistry.edges ?? [];
const routes = clawPersistentSurfaceRegistry.routes ?? [];
const nodeIds = new Set(nodes.map((node) => node.id));
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
  if (edge.contractId && !nodeIds.has(edge.contractId)) fail(`${edge.id} references missing contractId ${edge.contractId}`);
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
    if (step.contractId && !nodeIds.has(step.contractId)) fail(`${label} references missing contractId ${step.contractId}`);
    if (!step.validation) fail(`${label} is missing validation`);
  }
}

if (errors.length > 0) {
  console.error("surface route graph guard failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("surface route graph guard passed");
