import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildRemoteConformanceReport,
  buildSyncPlan,
  clawCliCommandRegistry,
  clawPersistentSurfaceRegistry,
  createSyncResourceManifest,
  evaluateRemoteAccess,
  findClawPersistentSurfaceNode,
  findClawSurfaceRoute,
  remoteAccessGrantSchema,
  remoteAccessRequestSchema,
  remoteActorContextSchema,
  remoteSecretLeaseSchema,
  remoteSyncRequiredDecisionIds,
  remoteSyncRequiredRouteIds,
  routeIdForSyncDriver,
  syncDriverSchema,
} from "../packages/clawjs-core/src/index.ts";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceConversationId = "019e36a3-c2e6-73b3-a3fe-f3e7340e42c8";
const sourcePlanId = "019e3732-c90e-7491-9217-37020c43217e-plan";

const requiredDocs = [
  "docs/adr/0022-remote-gateway-sync-redesign.md",
  "docs/remote-gateway-sync-source-decision-audit.md",
  "docs/remote-gateway-sync-decision-matrix.md",
  "docs/relay.md",
  "docs/decision-map.md",
  "docs/interface-matrix.md",
  "docs/cli.md",
];

const requiredNodes = [
  "claw.coordinator",
  "claw.gateway",
  "claw.connector",
  "claw.sync",
  "claw.transport.iroh",
  "claw.headlessHost",
  "claw.remoteCache",
  "claw.remote.classification",
];

const requiredCliCommands = ["remote", "sync", "nodes", "gateway"];

const requiredServiceApiRoutes = [
  "remote/classifications",
  "remote/conformance",
  "gateway/conformance",
  "sync/manifests",
  "sync/changes",
  "sync/plan",
  "sync/conflicts",
  "nodes",
  "nodes/pair",
  "nodes/trust",
  "nodes/revoke",
];

const requiredDocSnippets = [
  "Coordinator",
  "Gateway",
  "Connector",
  "Sync",
  "sovereign_e2e_tunnel",
  "governed_gateway",
  "remote-safe",
  "local-only",
  "blocked",
  "pending",
  "SyncResourceManifest",
  "brokered leases",
  "transport-agnostic",
  "Iroh",
  "headless",
  "multi-tenant agent service",
  "mesh.resourceShare",
  "--local-hash",
  "claw remote conformance",
  "claw gateway conformance",
];

const driverRouteExpectations = new Map([
  ["skills", "sync.skills"],
  ["memory_user_model", "sync.memoryUserModel"],
  ["sessions", "remote.chatGateway"],
  ["drive_files", "sync.driveFiles"],
  ["blobs", "sync.driveFiles"],
  ["sqlite_tables", "sync.sqliteResources"],
  ["sqlite_partial", "sync.sqliteResources"],
  ["sidecar", "sync.sqliteResources"],
  ["search_index", "remote.searchGateway"],
  ["agent_config", "sync.sqliteResources"],
  ["workspace_state", "sync.sqliteResources"],
]);

const failures = [];

function fail(message) {
  failures.push(message);
}

function readRequired(relativePath) {
  const fullPath = path.join(rootDir, relativePath);
  if (!fs.existsSync(fullPath)) {
    fail(`missing required file ${relativePath}`);
    return "";
  }
  return fs.readFileSync(fullPath, "utf8");
}

function requireText(label, text, needle) {
  if (!text.includes(needle)) fail(`${label} must include ${needle}`);
}

function extractTableIds(text, prefix) {
  return new Set([...text.matchAll(new RegExp(`\\|\\s*(${prefix}-\\d{3})\\s*\\|`, "g"))].map((match) => match[1]));
}

const docTexts = new Map(requiredDocs.map((relativePath) => [relativePath, readRequired(relativePath)]));
const docCorpus = [...docTexts.values()].join("\n\n");

for (const [relativePath, text] of docTexts) {
  if (/\/Users\/|rollout-\d{4}-\d{2}-\d{2}T/.test(text)) {
    fail(`${relativePath} must not include private local session paths`);
  }
}

for (const snippet of [sourceConversationId, sourcePlanId]) {
  requireText("source decision audit", docTexts.get("docs/remote-gateway-sync-source-decision-audit.md") ?? "", snippet);
  requireText("decision matrix", docTexts.get("docs/remote-gateway-sync-decision-matrix.md") ?? "", snippet);
}

const sourceDecisionIds = extractTableIds(docTexts.get("docs/remote-gateway-sync-source-decision-audit.md") ?? "", "RQ");
const matrixDecisionIds = extractTableIds(docTexts.get("docs/remote-gateway-sync-decision-matrix.md") ?? "", "RG");
for (let index = 1; index <= remoteSyncRequiredDecisionIds.length; index += 1) {
  const sourceId = `RQ-${String(index).padStart(3, "0")}`;
  const matrixId = `RG-${String(index).padStart(3, "0")}`;
  if (!sourceDecisionIds.has(sourceId)) fail(`source decision audit missing ${sourceId}`);
  if (!matrixDecisionIds.has(matrixId)) fail(`remote gateway sync decision matrix missing ${matrixId}`);
}

for (const decisionId of remoteSyncRequiredDecisionIds) {
  requireText("source decision audit", docTexts.get("docs/remote-gateway-sync-source-decision-audit.md") ?? "", `\`${decisionId}\``);
  requireText("decision matrix", docTexts.get("docs/remote-gateway-sync-decision-matrix.md") ?? "", `\`${decisionId}\``);
}

for (const snippet of requiredDocSnippets) {
  requireText("remote gateway sync public docs", docCorpus, snippet);
}

for (const nodeId of requiredNodes) {
  if (!findClawPersistentSurfaceNode(nodeId)) fail(`missing required surface node ${nodeId}`);
}

for (const routeId of remoteSyncRequiredRouteIds) {
  const route = findClawSurfaceRoute(routeId);
  if (!route) {
    fail(`missing required route ${routeId}`);
    continue;
  }
  if (!route.adrs?.includes("docs/adr/0022-remote-gateway-sync-redesign.md")) {
    fail(`${routeId} must cite ADR 0022`);
  }
  if (!route.tests?.includes("packages/clawjs/src/inspect-cli.test.ts")) {
    fail(`${routeId} must name inspect CLI tests`);
  }
  if (!route.steps?.length) fail(`${routeId} must declare explicit route steps`);
}

const conformance = buildRemoteConformanceReport({
  routeIds: (clawPersistentSurfaceRegistry.routes ?? []).map((route) => route.id),
  nodeIds: clawPersistentSurfaceRegistry.nodes.map((node) => node.id),
});
if (conformance.status !== "baseline_registered") fail("remote conformance must be baseline_registered");
if (conformance.missingRoutes.length > 0) fail(`remote conformance missing routes: ${conformance.missingRoutes.join(", ")}`);
if (conformance.missingNodes.length > 0) fail(`remote conformance missing nodes: ${conformance.missingNodes.join(", ")}`);
if (conformance.hostedSelfHostedParity !== "required") fail("hosted/self-hosted parity must be required");
if (conformance.transportContract !== "transport_agnostic_iroh_v1_adapter") fail("transport contract must stay Iroh-adapter and transport-agnostic");

for (const commandName of requiredCliCommands) {
  const command = clawCliCommandRegistry.commands.find((entry) => entry.name === commandName);
  if (!command) {
    fail(`missing CLI command ${commandName}`);
    continue;
  }
  if (!command.adrs.includes("docs/adr/0022-remote-gateway-sync-redesign.md")) fail(`${commandName} CLI must cite ADR 0022`);
  if (!command.tests.includes("packages/clawjs/src/inspect-cli.test.ts")) fail(`${commandName} CLI must name inspect CLI tests`);
}

const remoteSyncRoutesSource = readRequired("relay/src/server/remote-sync-routes.ts");
for (const route of requiredServiceApiRoutes) {
  requireText("remote sync service routes", remoteSyncRoutesSource, `clawApiPath("${route}")`);
}

for (const [driver, expectedRoute] of driverRouteExpectations) {
  const parsed = syncDriverSchema.parse(driver);
  if (routeIdForSyncDriver(parsed) !== expectedRoute) fail(`${driver} must map to ${expectedRoute}`);
}

const manifest = createSyncResourceManifest({
  resourceId: "skills:default",
  kind: "skills",
  ownerNodeId: "node.mac",
  driver: "skills",
  allowedPeerNodeIds: ["node.server"],
});
if (manifest.secretPolicy.plaintextReplication !== false) fail("sync manifest must forbid plaintext secret replication");
if (manifest.secretPolicy.secretRefsOnly !== true) fail("sync manifest must require secret refs only");
if (manifest.secretPolicy.brokerLeaseRequired !== true) fail("sync manifest must require broker leases");
if (manifest.cachePolicy.encrypted !== true) fail("sync client cache must be encrypted");
if (manifest.cachePolicy.storesSecrets !== false) fail("sync client cache must not store secrets");
if (manifest.cachePolicy.storesAuthoritativeState !== false) fail("sync client cache must not store authoritative state");

const actor = remoteActorContextSchema.parse({
  actorKind: "agent",
  actorId: "agent.sync",
  nodeId: "node.mac",
  transport: "gateway",
  trustMode: "governed_gateway",
});
const conflictPlan = buildSyncPlan({
  manifest,
  actor,
  localNodeId: "node.mac",
  peerNodeId: "node.server",
  localSnapshots: [{
    resourceId: "skills:default",
    objectRef: "skill.review",
    nodeId: "node.mac",
    contentHash: "hash-a",
    updatedAt: "2026-05-17T09:00:00.000Z",
    deleted: false,
  }],
  peerSnapshots: [{
    resourceId: "skills:default",
    objectRef: "skill.review",
    nodeId: "node.server",
    contentHash: "hash-b",
    updatedAt: "2026-05-17T09:05:00.000Z",
    deleted: false,
  }],
  now: "2026-05-17T10:00:00.000Z",
});
if (conflictPlan.writes !== false) fail("sync planning must be dry-run and write false");
if (!conflictPlan.actions.some((action) => action.action === "conflict")) fail("diverged snapshots must produce a conflict action");
if (conflictPlan.conflicts[0]?.status !== "open") fail("default conflict status must be open");
if (!conflictPlan.nextCursor?.cursor.includes("skill.review")) fail("sync conflict plan must produce a reconciliation cursor");

const matchingPlan = buildSyncPlan({
  manifest,
  actor,
  localNodeId: "node.mac",
  peerNodeId: "node.server",
  localSnapshots: [{
    resourceId: "skills:default",
    objectRef: "skill.review",
    nodeId: "node.mac",
    contentHash: "hash-a",
    updatedAt: "2026-05-17T09:00:00.000Z",
    deleted: false,
  }],
  peerSnapshots: [{
    resourceId: "skills:default",
    objectRef: "skill.review",
    nodeId: "node.server",
    contentHash: "hash-a",
    updatedAt: "2026-05-17T09:05:00.000Z",
    deleted: false,
  }],
  now: "2026-05-17T10:00:00.000Z",
});
if (matchingPlan.actions[0]?.action !== "noop") fail("matching snapshots must produce noop");
if (matchingPlan.conflicts.length !== 0) fail("matching snapshots must not produce conflicts");

const lease = remoteSecretLeaseSchema.parse({
  leaseId: "lease.1",
  secretRef: "vault://agents/sync",
  actor,
  action: "sync.plan",
  resourceId: "skills:default",
  expiresAt: "2026-05-17T10:10:00.000Z",
  plaintextReturned: false,
  auditEventId: "audit.lease.1",
});
if (lease.plaintextReturned !== false) fail("remote secret lease must never return plaintext");

const remoteAccessRequest = remoteAccessRequestSchema.parse({
  actor: {
    actorKind: "agent",
    actorId: "agent.sync",
    agentId: "agent.sync",
    assignmentId: "assignment.sync",
    runId: "run.sync",
    nodeId: "node.mac",
    transport: "gateway",
    trustMode: "governed_gateway",
  },
  routeId: "remote.secretBrokeredOperation",
  resourceType: "secret",
  resourceId: "vault://agents/sync",
  action: "sync.plan",
  classification: "remote-safe",
  trustMode: "governed_gateway",
  transport: "gateway",
  secretRefs: ["vault://agents/sync"],
  plaintextSecretRequested: false,
  now: "2026-05-17T10:00:00.000Z",
});
const remoteAccessGrants = [
  "agent",
  "assignment",
  "execution_profile",
  "connector",
  "host",
  "run_scope",
  "remote_classification",
  "transport_trust",
  "secret_broker",
].map((plane) => remoteAccessGrantSchema.parse({
  id: `grant.${plane}`,
  plane,
  resourceType: "secret",
  resourceId: "vault://agents/sync",
  action: "sync.plan",
  effect: "allow",
  ...(plane === "secret_broker" ? { requiresBrokerLease: true } : {}),
}));
const remoteAccessAllowed = evaluateRemoteAccess({ request: remoteAccessRequest, grants: remoteAccessGrants });
if (!remoteAccessAllowed.allowed) fail(`remote access evaluator must allow fully granted remote-safe brokered request: ${remoteAccessAllowed.reasons.join(", ")}`);
if (!remoteAccessAllowed.requiredBrokerLease) fail("remote access evaluator must require broker leases for secret refs");
const remoteAccessDenied = evaluateRemoteAccess({
  request: { ...remoteAccessRequest, classification: "blocked" },
  grants: remoteAccessGrants,
});
if (remoteAccessDenied.allowed) fail("remote access evaluator must fail closed for blocked remote classifications");
if (!remoteAccessDenied.reasons.includes("remote_classification: blocked is not remote-safe")) {
  fail("remote access evaluator must explain blocked remote classifications");
}

const packageJson = JSON.parse(readRequired("package.json"));
if (packageJson.scripts?.["test:remote-sync-goal"] !== "node --import tsx ./scripts/verify-remote-sync-goal.mjs") {
  fail("package.json must expose test:remote-sync-goal");
}
if (!packageJson.scripts?.["test:docs"]?.includes("npm run test:remote-sync-goal")) {
  fail("test:docs must include test:remote-sync-goal");
}

if (failures.length > 0) {
  console.error("remote gateway sync goal verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`remote gateway sync goal verification passed (${remoteSyncRequiredDecisionIds.length} source decisions, ${remoteSyncRequiredRouteIds.length} routes)`);
