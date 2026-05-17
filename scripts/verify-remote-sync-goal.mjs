import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildRemoteConformanceReport,
  buildRemoteExternalPendingRegister,
  buildRemoteOfflineCommandResult,
  buildRemoteRouteContractCatalog,
  buildSyncPlan,
  buildSyncQueueEntries,
  clawCliCommandRegistry,
  clawPersistentSurfaceRegistry,
  createMeshInvitation,
  createMeshInvitationAcceptance,
  createMeshResourceShare,
  createMeshRevocation,
  createRemoteAgentServiceExecutionReceipt,
  createRemoteCompatibilityAdapterReceipt,
  createRemoteGatewayAuditReceipt,
  createRemoteSurfaceClassificationReceipt,
  createSyncAuthorityHandoffReceipt,
  createSyncDriverApplicationReceipt,
  createSyncResourceManifest,
  evaluateRemoteAgentServiceAccess,
  evaluateRemoteAccess,
  findClawPersistentSurfaceNode,
  findClawSurfaceRoute,
  meshInvitationSchema,
  meshInvitationAcceptanceSchema,
  meshResourceShareSchema,
  meshRevocationSchema,
  remoteAccessGrantSchema,
  remoteAccessRequestSchema,
  remoteActorContextSchema,
  remoteAgentServiceDecisionSchema,
  remoteAgentServiceExecutionReceiptSchema,
  remoteCompatibilityAdapterReceiptSchema,
  remoteExternalPendingRegisterSchema,
  remoteGatewayAuditReceiptSchema,
  remoteRouteContractCatalogSchema,
  remoteSecretLeaseSchema,
  remoteSurfaceClassificationReceiptSchema,
  remoteSyncRequiredDecisionIds,
  remoteSyncRequiredRouteIds,
  reconcileSyncQueue,
  routeIdForSyncDriver,
  syncAuthorityHandoffReceiptSchema,
  syncDriverApplicationReceiptSchema,
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
  "remote/classifications/receipts",
  "remote/conformance",
  "remote/external-pending",
  "remote/route-contracts",
  "remote/compatibility/adapters",
  "gateway/conformance",
  "gateway/agent-service/evaluate",
  "gateway/agent-service/executions",
  "gateway/audit/receipts",
  "sync/manifests",
  "sync/changes",
  "sync/plan",
  "sync/conflicts",
  "sync/applications",
  "sync/authority-handoffs",
  "nodes",
  "nodes/pair",
  "nodes/trust",
  "nodes/revoke",
  "mesh/invitations",
  "mesh/invitations/accept",
  "mesh/shares",
  "mesh/revocations",
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
  "remote.agent_service.evaluated",
  "RemoteSurfaceClassificationReceipt",
  "/v1/remote/classifications/receipts",
  "RemoteExternalPendingRegister",
  "/v1/remote/external-pending",
  "remote route contracts",
  "/v1/remote/route-contracts",
  "/v1/gateway/agent-service/evaluate",
  "/v1/gateway/audit/receipts",
  "RemoteGatewayAuditReceipt",
  "mesh.resourceShare",
  "MeshInvitation",
  "MeshInvitationAcceptance",
  "MeshResourceShare",
  "MeshRevocation",
  "/v1/mesh/invitations",
  "/v1/mesh/invitations/accept",
  "/v1/mesh/shares",
  "/v1/mesh/revocations",
  "--local-hash",
  "SyncDriverApplicationReceipt",
  "/v1/sync/applications",
  "SyncAuthorityHandoffReceipt",
  "/v1/sync/authority-handoffs",
  "claw sync handoff",
  "claw remote conformance",
  "claw remote compat",
  "claw inspect remote",
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

for (const node of clawPersistentSurfaceRegistry.nodes) {
  const hasStableSurface = Boolean(node.humanSurfaces?.length || node.programmaticSurfaces?.length);
  if (!hasStableSurface) continue;
  const hasRelayClassification = node.programmaticSurfaces?.includes("relay") || node.surfaceGaps?.some((gap) => gap.surface === "relay");
  if (!hasRelayClassification) fail(`${node.id} must classify relay exposure as remote-safe, local-only, blocked, or pending`);
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

const externalPending = buildRemoteExternalPendingRegister({ generatedAt: "2026-05-17T10:13:00.000Z" });
if (!remoteExternalPendingRegisterSchema.safeParse(externalPending).success) fail("remote external pending register must validate");
if (externalPending.status !== "external_pending") fail("remote external pending register must remain external_pending while physical checks are unproven");
if (externalPending.writes !== false) fail("remote external pending register must be no-write");
for (const requirementId of [
  "physical_iroh_handshake",
  "device_trust_acceptance",
  "physical_peer_trust",
  "physical_sync_driver_application",
  "signed_host_audit_persistence",
  "physical_client_storage",
  "provider_secret_retrieval",
  "self_hosted_deployment",
  "hosted_deployment",
  "agent_runtime_execution",
  "billing_meter_persistence",
  "provider_device_e2e",
]) {
  if (!externalPending.requirements.some((entry) => entry.requirementId === requirementId && entry.status === "external_pending" && entry.writes === false)) {
    fail(`remote external pending register must include ${requirementId}`);
  }
}

const routeContracts = buildRemoteRouteContractCatalog({
  generatedAt: "2026-05-17T10:14:00.000Z",
  registeredRouteIds: (clawPersistentSurfaceRegistry.routes ?? []).map((route) => route.id),
});
if (!remoteRouteContractCatalogSchema.safeParse(routeContracts).success) fail("remote route contract catalog must validate");
if (routeContracts.status !== "complete") fail("remote route contract catalog must be complete");
if (routeContracts.missingRouteIds.length !== 0) fail(`remote route contract catalog missing routes: ${routeContracts.missingRouteIds.join(", ")}`);
if (routeContracts.contracts.length !== remoteSyncRequiredRouteIds.length) fail("remote route contract catalog must cover every required route");
const requiredRouteIdSet = new Set(remoteSyncRequiredRouteIds);
for (const contract of routeContracts.contracts) {
  if (!requiredRouteIdSet.has(contract.routeId)) fail(`remote route contract catalog includes unexpected route ${contract.routeId}`);
  if (contract.parityRequired !== true) fail(`${contract.routeId} must require local/remote parity`);
  if (contract.parallelApiAllowed !== false) fail(`${contract.routeId} must forbid parallel APIs`);
  if (contract.writes !== false) fail(`${contract.routeId} route contract must be no-write`);
  if (contract.localContractRefs.length === 0 || contract.remoteEntryPoints.length === 0) fail(`${contract.routeId} must bind local contract refs and remote entrypoints`);
}

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

const inspectCliSource = readRequired("packages/clawjs/src/inspect-cli.ts");
for (const snippet of [
  'command === "remote"',
  "buildRemoteConformanceReport",
  "buildRemoteExternalPendingRegister",
  "buildRemoteRouteContractCatalog",
  "SyncAuthorityHandoffReceipt",
  "transport_agnostic_iroh_v1_adapter",
]) {
  requireText("inspect remote CLI", inspectCliSource, snippet);
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

const compatReceipt = createRemoteCompatibilityAdapterReceipt({
  legacySurface: "relay.mobile.chat",
  canonicalRouteId: "remote.chatGateway",
  clientKind: "ios",
  createdAt: "2026-05-17T10:11:00.000Z",
});
if (!remoteCompatibilityAdapterReceiptSchema.safeParse(compatReceipt).success) fail("remote compatibility adapter receipt must validate");
if (compatReceipt.mapsToCanonical !== true) fail("remote compatibility adapters must map to canonical routes");
if (compatReceipt.parallelApiIntroduced !== false) fail("remote compatibility adapters must not introduce parallel APIs");
if (compatReceipt.writes !== false) fail("remote compatibility adapter receipts must be no-write contracts");

const classificationReceipt = createRemoteSurfaceClassificationReceipt({
  capabilityId: "claw.gateway",
  classification: "remote-safe",
  routeId: "remote.chatGateway",
  policyRef: "docs/adr/0022-remote-gateway-sync-redesign.md",
  testRefs: ["scripts/verify-remote-sync-goal.mjs"],
  createdAt: "2026-05-17T10:12:00.000Z",
});
if (!remoteSurfaceClassificationReceiptSchema.safeParse(classificationReceipt).success) fail("remote surface classification receipt must validate");
if (classificationReceipt.remoteSafeReady !== true) fail("remote-safe classification receipts must require complete evidence");
if (classificationReceipt.missingEvidence.length !== 0) fail("complete remote-safe classification receipts must not report missing evidence");
if (classificationReceipt.writes !== false) fail("remote surface classification receipts must be no-write contracts");
try {
  createRemoteSurfaceClassificationReceipt({
    capabilityId: "claw.gateway",
    classification: "remote-safe",
    createdAt: "2026-05-17T10:12:30.000Z",
  });
  fail("remote-safe classification without route/policy/tests must fail closed");
} catch (error) {
  if (!(error instanceof Error) || !/requires route, policy, and tests/.test(error.message)) {
    fail("remote-safe classification failure must explain missing route/policy/tests");
  }
}

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
const conflictQueue = buildSyncQueueEntries(conflictPlan, { queuedAt: "2026-05-17T10:01:00.000Z" });
if (conflictQueue[0]?.status !== "blocked") fail("sync conflicts must enter the offline queue as blocked");
if (conflictQueue[0]?.writes !== false) fail("sync queue entries must be no-write contracts");
const blockedQueue = reconcileSyncQueue({
  manifest,
  queue: conflictQueue,
  now: "2026-05-17T10:02:00.000Z",
});
if (blockedQueue.writes !== false) fail("sync reconciliation must be dry-run/write false");
if (!blockedQueue.blockedConflictIds.includes(conflictPlan.conflicts[0]?.conflictId)) fail("sync reconciliation must keep unresolved conflicts blocked");
if (blockedQueue.nextCursor) fail("sync reconciliation must not advance cursor while conflicts remain blocked");
const resolvedQueue = reconcileSyncQueue({
  manifest,
  queue: conflictQueue,
  resolvedConflictIds: [conflictPlan.conflicts[0]?.conflictId ?? ""],
  now: "2026-05-17T10:03:00.000Z",
});
if (resolvedQueue.queue[0]?.status !== "resolved") fail("sync reconciliation must record resolved conflicts explicitly");
if (!resolvedQueue.nextCursor?.cursor.includes("skill.review")) fail("sync reconciliation must expose next cursor after terminal queue state");

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

const pushPlan = buildSyncPlan({
  manifest,
  actor,
  localNodeId: "node.mac",
  peerNodeId: "node.server",
  localSnapshots: [{
    resourceId: "skills:default",
    objectRef: "skill.local-only",
    nodeId: "node.mac",
    contentHash: "hash-local",
    updatedAt: "2026-05-17T09:10:00.000Z",
    deleted: false,
  }],
  peerSnapshots: [],
  now: "2026-05-17T10:00:00.000Z",
});
const pushQueue = buildSyncQueueEntries(pushPlan, { queuedAt: "2026-05-17T10:04:00.000Z" });
if (pushQueue[0]?.status !== "queued") fail("sync push changes must enter the offline queue as queued");
const appliedQueue = reconcileSyncQueue({
  manifest,
  queue: pushQueue,
  acknowledgedChangeIds: [pushPlan.changes[0]?.changeId ?? ""],
  now: "2026-05-17T10:05:00.000Z",
});
if (appliedQueue.queue[0]?.status !== "applied") fail("sync reconciliation must mark acknowledged changes applied");
if (!appliedQueue.nextCursor?.cursor.includes("hash-local")) fail("sync reconciliation must advance cursor after acknowledged queued changes");
const syncApplicationReceipt = createSyncDriverApplicationReceipt({
  manifest,
  reconciliation: appliedQueue,
  actor,
  createdAt: "2026-05-17T10:05:30.000Z",
});
if (!syncDriverApplicationReceiptSchema.safeParse(syncApplicationReceipt).success) fail("sync driver application receipt contract must validate");
if (syncApplicationReceipt.status !== "signed_pending_driver_application") fail("sync driver application receipt must stay pending without physical driver execution");
if (!syncApplicationReceipt.externalPending.includes("physical_sync_driver_application")) fail("sync driver application receipt must mark physical driver application external pending");
if (syncApplicationReceipt.physicalDriverApplied !== false) fail("sync driver application receipt must not claim physical application by default");
if (syncApplicationReceipt.writes !== false) fail("sync driver application receipt must be a no-write contract");

const syncAuthorityHandoffReceipt = createSyncAuthorityHandoffReceipt({
  manifest,
  toNodeId: "node.server",
  actor,
  requestedAuthority: "primary",
  createdAt: "2026-05-17T10:05:45.000Z",
});
if (!syncAuthorityHandoffReceiptSchema.safeParse(syncAuthorityHandoffReceipt).success) fail("sync authority handoff receipt contract must validate");
if (syncAuthorityHandoffReceipt.status !== "signed_pending_authority_handoff") fail("sync authority handoff must stay pending without physical authority transfer");
if (!syncAuthorityHandoffReceipt.externalPending.includes("physical_authority_handoff")) fail("sync authority handoff must mark physical authority transfer external pending");
if (syncAuthorityHandoffReceipt.physicalAuthorityApplied !== false) fail("sync authority handoff must not claim physical authority transfer by default");
if (syncAuthorityHandoffReceipt.writes !== false) fail("sync authority handoff receipt must be a no-write contract");
if (!syncAuthorityHandoffReceipt.requestedResidency.includes("node.server")) fail("sync authority handoff must include target node in requested residency");
if (syncAuthorityHandoffReceipt.previousAuthority !== manifest.authority) fail("sync authority handoff must record previous manifest authority");
if (syncAuthorityHandoffReceipt.fromNodeId !== manifest.ownerNodeId) fail("sync authority handoff must record source owner node");

const offlineCommand = buildRemoteOfflineCommandResult({
  routeId: "remote.chatGateway",
  actor: {
    actorKind: "human",
    actorId: "user.local",
    nodeId: "node.mac",
    transport: "gateway",
    trustMode: "governed_gateway",
  },
  evaluatedAt: "2026-05-17T10:06:00.000Z",
});
if (offlineCommand.status !== "failed_fast") fail("offline remote commands must fail fast");
if (offlineCommand.enqueued !== false) fail("offline remote commands must not be queued as sync work");
if (offlineCommand.writes !== false) fail("offline remote command failure must not write");

const meshInvitation = createMeshInvitation({
  issuerMeshId: "mesh.home",
  coordinatorNodeId: "node.mac",
  recipientMeshId: "mesh.server",
  allowedResourceIds: ["skills:default"],
  allowedActions: ["read", "sync"],
  createdAt: "2026-05-17T10:07:00.000Z",
  expiresAt: "2026-05-18T10:07:00.000Z",
});
if (meshInvitation.status !== "pending") fail("mesh invitations must start pending");
if (meshInvitation.writes !== false) fail("mesh invitations must be no-write until signed Coordinator execution");
if (!meshInvitationSchema.safeParse(meshInvitation).success) fail("mesh invitation contract must validate");
const meshAcceptance = createMeshInvitationAcceptance({
  invitation: meshInvitation,
  accepterMeshId: "mesh.server",
  actor: {
    actorKind: "human",
    actorId: "user.remote",
    nodeId: "node.server",
    transport: "gateway",
    trustMode: "governed_gateway",
  },
  acceptedAt: "2026-05-17T10:07:30.000Z",
});
if (meshAcceptance.status !== "signed_pending_peer_trust") fail("mesh invitation acceptance must stay pending physical peer trust");
if (!meshAcceptance.externalPending.includes("physical_peer_trust")) fail("mesh invitation acceptance must mark physical peer trust external pending");
if (!meshAcceptance.externalPending.includes("device_trust_acceptance")) fail("mesh invitation acceptance must mark device trust acceptance external pending");
if (meshAcceptance.writes !== false) fail("mesh invitation acceptance must be no-write until signed physical trust");
if (!meshInvitationAcceptanceSchema.safeParse(meshAcceptance).success) fail("mesh invitation acceptance contract must validate");
const meshShare = createMeshResourceShare({
  invitation: meshInvitation,
  toMeshId: "mesh.server",
  manifest,
  actions: ["read", "sync"],
  createdAt: "2026-05-17T10:08:00.000Z",
  expiresAt: "2026-05-18T10:08:00.000Z",
});
if (meshShare.status !== "proposed") fail("mesh resource shares must be proposed before signed execution");
if (meshShare.plaintextSecrets !== false) fail("mesh resource shares must forbid plaintext secrets");
if (meshShare.writes !== false) fail("mesh resource shares must be no-write contracts");
if (!meshResourceShareSchema.safeParse(meshShare).success) fail("mesh share contract must validate");
let disallowedShareFailed = false;
try {
  createMeshResourceShare({
    invitation: meshInvitation,
    toMeshId: "mesh.server",
    manifest: createSyncResourceManifest({
      resourceId: "memory:default",
      kind: "memory",
      ownerNodeId: "node.mac",
      driver: "memory_user_model",
    }),
    actions: ["sync"],
    expiresAt: "2026-05-18T10:09:00.000Z",
  });
} catch {
  disallowedShareFailed = true;
}
if (!disallowedShareFailed) fail("mesh shares must reject resources outside invitation scope");
const meshRevocation = createMeshRevocation({
  targetType: "share",
  targetId: meshShare.shareId,
  actor: {
    actorKind: "human",
    actorId: "user.local",
    nodeId: "node.mac",
    transport: "gateway",
    trustMode: "governed_gateway",
  },
  reason: "owner_revoked",
  revokedAt: "2026-05-17T10:09:00.000Z",
});
if (meshRevocation.cascadeSyncQueues !== true) fail("mesh revocations must cascade sync queue access");
if (meshRevocation.writes !== false) fail("mesh revocations must be no-write contracts until signed execution");
if (!meshRevocationSchema.safeParse(meshRevocation).success) fail("mesh revocation contract must validate");

const serviceAssignment = {
  schemaVersion: 1,
  tenantId: "tenant.acme",
  agentId: "agent.support",
  assignmentId: "assignment.service",
  status: "active",
  routeIds: ["gateway.multiTenantAgentService"],
  budgetId: "budget.service",
  billingAccountId: "billing.acme",
  isolationKey: "tenant.acme:assignment.service",
  auditRequired: true,
};
const serviceBudget = {
  budgetId: "budget.service",
  tenantId: "tenant.acme",
  billingAccountId: "billing.acme",
  limitCents: 5000,
  usedCents: 1200,
  billingMeterId: "meter.agent-service",
};
const serviceAllowed = evaluateRemoteAgentServiceAccess({
  request: {
    tenantId: "tenant.acme",
    agentId: "agent.support",
    assignmentId: "assignment.service",
    routeId: "gateway.multiTenantAgentService",
    estimatedCostCents: 300,
    now: "2026-05-17T10:10:00.000Z",
  },
  assignment: serviceAssignment,
  budget: serviceBudget,
});
if (!serviceAllowed.allowed) fail(`multi-tenant agent service evaluator must allow scoped assignment/budget: ${serviceAllowed.reasons.join(", ")}`);
if (serviceAllowed.audit.eventType !== "remote.agent_service.evaluated") fail("multi-tenant agent service evaluator must emit audit metadata");
if (serviceAllowed.writes !== false) fail("multi-tenant agent service evaluator must be no-write");
if (!remoteAgentServiceDecisionSchema.safeParse(serviceAllowed).success) fail("multi-tenant agent service decision contract must validate");
const serviceExecutionReceipt = createRemoteAgentServiceExecutionReceipt({
  request: {
    tenantId: "tenant.acme",
    agentId: "agent.support",
    assignmentId: "assignment.service",
    routeId: "gateway.multiTenantAgentService",
    estimatedCostCents: 300,
    now: "2026-05-17T10:10:00.000Z",
  },
  assignment: serviceAssignment,
  budget: serviceBudget,
  decision: serviceAllowed,
});
if (!remoteAgentServiceExecutionReceiptSchema.safeParse(serviceExecutionReceipt).success) fail("multi-tenant agent service execution receipt contract must validate");
if (serviceExecutionReceipt.status !== "signed_pending_runtime") fail("multi-tenant agent service receipt must stay signed pending runtime without physical execution");
if (!serviceExecutionReceipt.externalPending.includes("agent_runtime_execution")) fail("multi-tenant agent service receipt must mark runtime execution external pending");
if (!serviceExecutionReceipt.externalPending.includes("billing_meter_persistence")) fail("multi-tenant agent service receipt must mark billing meter persistence external pending");
if (serviceExecutionReceipt.writes !== false) fail("multi-tenant agent service execution receipt must be no-write");
const serviceTenantDenied = evaluateRemoteAgentServiceAccess({
  request: {
    tenantId: "tenant.other",
    agentId: "agent.support",
    assignmentId: "assignment.service",
    routeId: "gateway.multiTenantAgentService",
    estimatedCostCents: 300,
    now: "2026-05-17T10:11:00.000Z",
  },
  assignment: serviceAssignment,
  budget: serviceBudget,
});
if (serviceTenantDenied.allowed) fail("multi-tenant agent service evaluator must deny tenant mismatch");
if (!serviceTenantDenied.reasons.includes("tenant: assignment belongs to a different tenant")) fail("multi-tenant agent service evaluator must explain tenant isolation denial");
const serviceBudgetDenied = evaluateRemoteAgentServiceAccess({
  request: {
    tenantId: "tenant.acme",
    agentId: "agent.support",
    assignmentId: "assignment.service",
    routeId: "gateway.multiTenantAgentService",
    estimatedCostCents: 4000,
    now: "2026-05-17T10:12:00.000Z",
  },
  assignment: serviceAssignment,
  budget: serviceBudget,
});
if (serviceBudgetDenied.allowed) fail("multi-tenant agent service evaluator must deny over-budget requests");
if (!serviceBudgetDenied.reasons.includes("budget: estimated cost exceeds limit")) fail("multi-tenant agent service evaluator must explain budget denial");

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
const gatewayAuditReceipt = createRemoteGatewayAuditReceipt({
  sourceEventType: remoteAccessAllowed.audit.eventType,
  routeId: remoteAccessAllowed.audit.routeId,
  actor: remoteAccessRequest.actor,
  resourceType: remoteAccessAllowed.audit.resourceType,
  resourceId: remoteAccessAllowed.audit.resourceId,
  action: remoteAccessAllowed.audit.action,
  decision: remoteAccessAllowed.allowed,
  createdAt: remoteAccessRequest.now,
});
if (!remoteGatewayAuditReceiptSchema.safeParse(gatewayAuditReceipt).success) fail("Gateway audit receipt contract must validate");
if (gatewayAuditReceipt.hostAuditStore !== "signed_host_audit") fail("Gateway audit receipts must target signed host audit store");
if (gatewayAuditReceipt.signedHostAuditPersisted !== false) fail("Gateway audit receipts must not claim host persistence without physical validation");
if (!gatewayAuditReceipt.externalPending.includes("signed_host_audit_persistence")) fail("Gateway audit receipts must mark signed host audit persistence external pending");
if (gatewayAuditReceipt.writes !== false) fail("Gateway audit receipts must be no-write contracts");

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
