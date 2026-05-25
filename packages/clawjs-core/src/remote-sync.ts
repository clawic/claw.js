import { evaluateRegulatedAction, type RegulatedDomain } from "./regulated-domain-safety.ts";

export * from "./remote-sync-schemas.ts";
import {
  remoteSurfaceClassificationSchema,
  remoteTrustModeSchema,
  remoteActorKindSchema,
  syncAuthoritySchema,
  syncDriverSchema,
  syncConflictPolicySchema,
  syncCachePolicySchema,
  remoteClientCacheSnapshotSchema,
  remoteCompatibilityClientKindSchema,
  remoteCompatibilityAdapterReceiptSchema,
  remoteSurfaceClassificationReceiptSchema,
  remoteExternalPendingRequirementSchema,
  remoteExternalPendingRegisterSchema,
  nodeIdentitySchema,
  remoteActorContextSchema,
  syncResourceManifestSchema,
  syncCursorSchema,
  syncChangeSchema,
  syncConflictSchema,
  syncObjectSnapshotSchema,
  syncPlanActionSchema,
  syncPlanResultSchema,
  syncDriverCatalogEntrySchema,
  syncDriverCatalogSchema,
  syncQueueEntrySchema,
  syncReconciliationResultSchema,
  syncDriverApplicationReceiptSchema,
  remoteSecretLeaseSchema,
  remoteSecretProviderReceiptSchema,
  remoteAccessGrantPlaneSchema,
  remoteAccessGrantSchema,
  remoteAccessRequestSchema,
  remoteAccessDecisionSchema,
  remoteGatewayAuditReceiptSchema,
  remoteOfflineCommandResultSchema,
  remoteTransportHandshakeReceiptSchema,
  nodeTrustDecisionSchema,
  gatewayDeploymentManifestSchema,
  meshShareActionSchema,
  meshInvitationSchema,
  meshInvitationAcceptanceSchema,
  meshResourceShareSchema,
  meshRevocationSchema,
  remoteAgentServiceAssignmentSchema,
  remoteAgentServiceBudgetSchema,
  remoteAgentServiceRequestSchema,
  remoteAgentServiceDecisionSchema,
  remoteAgentServiceExecutionReceiptSchema,
  type RemoteSurfaceClassification,
  type RemoteTrustMode,
  type RemoteActorKind,
  type SyncAuthority,
  type SyncDriver,
  type SyncConflictPolicy,
  type SyncCachePolicy,
  type RemoteClientCacheSnapshot,
  type RemoteCompatibilityClientKind,
  type RemoteCompatibilityAdapterReceipt,
  type RemoteSurfaceClassificationReceipt,
  type RemoteExternalPendingRequirement,
  type RemoteExternalPendingRegister,
  type NodeIdentity,
  type RemoteActorContext,
  type SyncResourceManifest,
  type SyncCursor,
  type SyncChange,
  type SyncConflict,
  type SyncObjectSnapshot,
  type SyncPlanAction,
  type SyncPlanResult,
  type SyncDriverCatalogEntry,
  type SyncDriverCatalog,
  type SyncQueueEntry,
  type SyncReconciliationResult,
  type SyncDriverApplicationReceipt,
  type RemoteSecretLease,
  type RemoteSecretProviderReceipt,
  type RemoteAccessGrantPlane,
  type RemoteAccessGrant,
  type RemoteAccessRequest,
  type RemoteAccessDecision,
  type RemoteGatewayAuditReceipt,
  type RemoteOfflineCommandResult,
  type RemoteTransportHandshakeReceipt,
  type NodeTrustDecision,
  type GatewayDeploymentManifest,
  type MeshShareAction,
  type MeshInvitation,
  type MeshInvitationAcceptance,
  type MeshResourceShare,
  type MeshRevocation,
  type RemoteAgentServiceAssignment,
  type RemoteAgentServiceBudget,
  type RemoteAgentServiceRequest,
  type RemoteAgentServiceDecision,
  type RemoteAgentServiceExecutionReceipt,
} from "./remote-sync-schemas.ts";

export const remoteSyncRequiredDecisionIds = [
  "relay_boundary",
  "server_trust_model",
  "remote_surface_parity",
  "topology_priority",
  "sync_authority_model",
  "remote_secrets_model",
  "transport_contract",
  "remote_api_shape",
  "offline_behavior",
  "remote_actor_model",
  "headless_host_model",
  "first_vertical_slice",
  "sync_substrate",
  "conflict_default",
  "client_cache_policy",
  "guardrail_strictness",
  "compat_policy",
  "hosted_service_position",
  "layer_names",
  "mesh_collaboration_scope",
  "agent_service_model",
  "sync_lateral_domains",
] as const;

export const remoteSyncRequiredRouteIds = [
  "remote.chatGateway",
  "remote.searchGateway",
  "remote.secretBrokeredOperation",
  "sync.skills",
  "sync.memoryUserModel",
  "sync.sessions",
  "sync.driveFiles",
  "sync.blobs",
  "sync.searchIndex",
  "sync.sqliteResources",
  "sync.sidecars",
  "sync.agentConfig",
  "sync.workspaceState",
  "gateway.headlessAgentHost",
  "gateway.multiTenantAgentService",
  "mesh.resourceShare",
] as const;

export function buildRemoteExternalPendingRegister(input: {
  generatedAt?: string;
} = {}): RemoteExternalPendingRegister {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const requirements = [
    {
      schemaVersion: 1 as const,
      requirementId: "physical_iroh_handshake",
      decisionId: "transport_contract",
      category: "transport" as const,
      sourceReceipt: "RemoteTransportHandshakeReceipt",
      evidenceRefs: ["claw nodes heartbeat --record true", "docs/adr/0022-remote-gateway-sync-redesign.md"],
      unblockCriteria: "Validate a real Iroh handshake between approved physical or server nodes.",
      status: "external_pending" as const,
      writes: false as const,
    },
    {
      schemaVersion: 1 as const,
      requirementId: "device_trust_acceptance",
      decisionId: "server_trust_model",
      category: "device_trust" as const,
      sourceReceipt: "NodeTrustDecision",
      evidenceRefs: ["claw nodes trust --record true", "docs/relay.md"],
      unblockCriteria: "Validate signed device acceptance on the physical node before trust becomes authoritative.",
      status: "external_pending" as const,
      writes: false as const,
    },
    {
      schemaVersion: 1 as const,
      requirementId: "physical_peer_trust",
      decisionId: "mesh_collaboration_scope",
      category: "peer_trust" as const,
      sourceReceipt: "MeshInvitationAcceptance",
      evidenceRefs: ["claw nodes accept --record true", "docs/relay.md"],
      unblockCriteria: "Validate physical peer trust for the accepted mesh invitation.",
      status: "external_pending" as const,
      writes: false as const,
    },
    {
      schemaVersion: 1 as const,
      requirementId: "physical_sync_driver_application",
      decisionId: "sync_substrate",
      category: "sync_driver" as const,
      sourceReceipt: "SyncDriverApplicationReceipt",
      evidenceRefs: ["claw sync apply --record true", "docs/relay.md"],
      unblockCriteria: "Run an approved signed-host sync driver and verify the physical write or merge.",
      status: "external_pending" as const,
      writes: false as const,
    },
    {
      schemaVersion: 1 as const,
      requirementId: "physical_authority_handoff",
      decisionId: "sync_authority_model",
      category: "authority_handoff" as const,
      sourceReceipt: "SyncAuthorityHandoffReceipt",
      evidenceRefs: ["claw sync handoff --record true", "docs/relay.md"],
      unblockCriteria: "Validate the physical resource authority and residency transfer between approved nodes.",
      status: "external_pending" as const,
      writes: false as const,
    },
    {
      schemaVersion: 1 as const,
      requirementId: "signed_host_audit_persistence",
      decisionId: "remote_actor_model",
      category: "host_audit" as const,
      sourceReceipt: "RemoteGatewayAuditReceipt",
      evidenceRefs: ["claw gateway audit --record true", "docs/relay.md"],
      unblockCriteria: "Persist the Gateway audit event in the signed host audit store and verify the signature.",
      status: "external_pending" as const,
      writes: false as const,
    },
    {
      schemaVersion: 1 as const,
      requirementId: "physical_client_storage",
      decisionId: "client_cache_policy",
      category: "client_storage" as const,
      sourceReceipt: "RemoteClientCacheSnapshot",
      evidenceRefs: ["claw sync cache --record true", "docs/adr/0022-remote-gateway-sync-redesign.md"],
      unblockCriteria: "Validate encrypted TTL cache storage on an approved real client without plaintext or secrets.",
      status: "external_pending" as const,
      writes: false as const,
    },
    {
      schemaVersion: 1 as const,
      requirementId: "provider_secret_retrieval",
      decisionId: "remote_secrets_model",
      category: "provider" as const,
      sourceReceipt: "RemoteSecretProviderReceipt",
      evidenceRefs: ["claw gateway secret-provider", "docs/relay.md"],
      unblockCriteria: "Run an approved provider retrieval that returns no plaintext through the remote contract.",
      status: "external_pending" as const,
      writes: false as const,
    },
    {
      schemaVersion: 1 as const,
      requirementId: "self_hosted_deployment",
      decisionId: "hosted_service_position",
      category: "deployment" as const,
      sourceReceipt: "GatewayDeploymentManifest",
      evidenceRefs: ["claw gateway serve --record true", "docs/relay.md"],
      unblockCriteria: "Bind a real self-hosted Gateway process and verify the same conformance contract.",
      status: "external_pending" as const,
      writes: false as const,
    },
    {
      schemaVersion: 1 as const,
      requirementId: "hosted_deployment",
      decisionId: "hosted_service_position",
      category: "deployment" as const,
      sourceReceipt: "GatewayDeploymentManifest",
      evidenceRefs: ["claw gateway project --record true", "docs/relay.md"],
      unblockCriteria: "Validate a real hosted rollout against the same Gateway conformance contract.",
      status: "external_pending" as const,
      writes: false as const,
    },
    {
      schemaVersion: 1 as const,
      requirementId: "agent_runtime_execution",
      decisionId: "agent_service_model",
      category: "runtime" as const,
      sourceReceipt: "RemoteAgentServiceExecutionReceipt",
      evidenceRefs: ["claw gateway agent-service --record true", "docs/relay.md"],
      unblockCriteria: "Execute an approved remote agent-service run through signed host or Coordinator control.",
      status: "external_pending" as const,
      writes: false as const,
    },
    {
      schemaVersion: 1 as const,
      requirementId: "billing_meter_persistence",
      decisionId: "agent_service_model",
      category: "billing" as const,
      sourceReceipt: "RemoteAgentServiceExecutionReceipt",
      evidenceRefs: ["claw gateway agent-service --record true", "docs/relay.md"],
      unblockCriteria: "Persist a real billing meter event for the governed remote agent-service run.",
      status: "external_pending" as const,
      writes: false as const,
    },
    {
      schemaVersion: 1 as const,
      requirementId: "provider_device_e2e",
      decisionId: "first_vertical_slice",
      category: "e2e_validation" as const,
      sourceReceipt: "RemoteProviderDeviceE2EValidationPlan",
      evidenceRefs: ["RemoteProviderDeviceE2EValidationPlan", "npm run test:remote-sync-goal", "docs/governance/remote-gateway-sync/decision-matrix.md"],
      unblockCriteria: "Run approved provider/device end-to-end validation across chat, search, sync, secret refs, and hosted agents.",
      status: "external_pending" as const,
      writes: false as const,
    },
  ];
  return remoteExternalPendingRegisterSchema.parse({
    schemaVersion: 1,
    generatedAt,
    status: requirements.length ? "external_pending" : "clear",
    requirements,
    writes: false,
  });
}

export function createExampleSyncResourceManifest(input: {
  resourceId: string;
  kind: string;
  ownerNodeId: string;
  driver: SyncDriver;
  routeIds: string[];
}): SyncResourceManifest {
  return syncResourceManifestSchema.parse({
    schemaVersion: 1,
    resourceId: input.resourceId,
    kind: input.kind,
    ownerNodeId: input.ownerNodeId,
    authority: "primary",
    residency: [input.ownerNodeId],
    driver: input.driver,
    conflictPolicy: "detect_and_elevate",
    cachePolicy: {
      encrypted: true,
      ttlSeconds: 3600,
      storesSecrets: false,
      storesAuthoritativeState: false,
    },
    allowedPeerNodeIds: [],
    routeIds: input.routeIds,
    secretPolicy: {
      plaintextReplication: false,
      secretRefsOnly: true,
      brokerLeaseRequired: true,
    },
  });
}

export function routeIdForSyncDriver(driver: SyncDriver): string {
  if (driver === "skills") return "sync.skills";
  if (driver === "memory_user_model") return "sync.memoryUserModel";
  if (driver === "sessions") return "sync.sessions";
  if (driver === "drive_files") return "sync.driveFiles";
  if (driver === "blobs") return "sync.blobs";
  if (driver === "search_index") return "sync.searchIndex";
  if (driver === "sqlite_tables" || driver === "sqlite_partial") return "sync.sqliteResources";
  if (driver === "sidecar") return "sync.sidecars";
  if (driver === "agent_config") return "sync.agentConfig";
  return "sync.workspaceState";
}

const syncDriverCatalogMetadata: Record<SyncDriver, { resourceKinds: string[]; lateralDomains: string[]; partialResourceSupported?: boolean }> = {
  skills: { resourceKinds: ["skills", "skill packs", "projected skills"], lateralDomains: ["skills"] },
  memory_user_model: { resourceKinds: ["global memory", "user model", "profile memory"], lateralDomains: ["memory", "user_model", "profile"] },
  sessions: { resourceKinds: ["sessions", "session transcripts", "handoffs"], lateralDomains: ["sessions"] },
  drive_files: { resourceKinds: ["drive files", "documents", "folders"], lateralDomains: ["drive", "files"] },
  blobs: { resourceKinds: ["binary blobs", "attachments", "large artifacts"], lateralDomains: ["blobs", "files"] },
  sqlite_tables: { resourceKinds: ["SQLite databases", "tables", "collections"], lateralDomains: ["database", "records"] },
  sqlite_partial: { resourceKinds: ["SQLite row ranges", "filtered tables", "partial databases"], lateralDomains: ["database", "partial_database"], partialResourceSupported: true },
  sidecar: { resourceKinds: ["sidecar stores", "runtime sidecar state"], lateralDomains: ["sidecars", "runtime"] },
  search_index: { resourceKinds: ["search indexes", "embedding shards", "query caches"], lateralDomains: ["search", "indexes"] },
  agent_config: { resourceKinds: ["agent config", "assignments", "budgets"], lateralDomains: ["agents", "config"] },
  workspace_state: { resourceKinds: ["workspace state", "project state", "local UI state"], lateralDomains: ["workspace", "projects"] },
};

export function buildSyncDriverCatalog(input: {
  generatedAt?: string;
  registeredRouteIds?: readonly string[];
} = {}): SyncDriverCatalog {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const requiredDrivers = syncDriverSchema.options;
  const registeredRouteIds = new Set(input.registeredRouteIds ?? remoteSyncRequiredRouteIds);
  const entries = requiredDrivers.map((driver) => {
    const metadata = syncDriverCatalogMetadata[driver];
    const routeId = routeIdForSyncDriver(driver);
    const cachePolicy = {
      encrypted: true as const,
      ttlSeconds: 3600,
      storesSecrets: false as const,
      storesAuthoritativeState: false as const,
    };
    return syncDriverCatalogEntrySchema.parse({
      schemaVersion: 1,
      driver,
      routeId,
      resourceKinds: metadata.resourceKinds,
      lateralDomains: metadata.lateralDomains,
      manifestBacked: true,
      changelogBacked: true,
      authorityScoped: true,
      partialResourceSupported: metadata.partialResourceSupported === true,
      conflictPolicy: "detect_and_elevate",
      cachePolicy,
      secretPolicy: {
        plaintextReplication: false,
        secretRefsOnly: true,
        brokerLeaseRequired: true,
      },
      physicalDriverRequired: true,
      externalPendingRequirementId: "physical_sync_driver_application",
      commands: [
        `claw sync manifest --driver ${driver} --json`,
        `claw sync plan --driver ${driver} --json`,
        `claw sync apply --driver ${driver} --record true --json`,
      ],
      writes: false,
    });
  });
  const requiredRouteIds = [...new Set(entries.map((entry) => entry.routeId))].sort();
  const coveredDrivers = entries.filter((entry) => registeredRouteIds.has(entry.routeId)).map((entry) => entry.driver);
  const missingDrivers = requiredDrivers.filter((driver) => !coveredDrivers.includes(driver));
  const missingRouteIds = requiredRouteIds.filter((routeId) => !registeredRouteIds.has(routeId));
  return syncDriverCatalogSchema.parse({
    schemaVersion: 1,
    generatedAt,
    status: missingDrivers.length === 0 && missingRouteIds.length === 0 ? "complete" : "incomplete",
    driverCount: entries.length,
    requiredDrivers,
    coveredDrivers,
    missingDrivers,
    requiredRouteIds,
    missingRouteIds,
    entries,
    authorityModel: "per_resource",
    conflictDefault: "detect_and_elevate",
    physicalApplicationStatus: "external_pending",
    writes: false,
  });
}

export function createSyncResourceManifest(input: {
  resourceId: string;
  kind: string;
  ownerNodeId: string;
  driver: SyncDriver;
  authority?: SyncAuthority;
  allowedPeerNodeIds?: string[];
  residency?: string[];
  routeIds?: string[];
  ttlSeconds?: number;
}): SyncResourceManifest {
  const routeIds = input.routeIds?.length ? input.routeIds : [routeIdForSyncDriver(input.driver)];
  return syncResourceManifestSchema.parse({
    schemaVersion: 1,
    resourceId: input.resourceId,
    kind: input.kind,
    ownerNodeId: input.ownerNodeId,
    authority: input.authority ?? "primary",
    residency: input.residency?.length ? input.residency : [input.ownerNodeId],
    driver: input.driver,
    conflictPolicy: "detect_and_elevate",
    cachePolicy: {
      encrypted: true,
      ttlSeconds: input.ttlSeconds ?? 3600,
      storesSecrets: false,
      storesAuthoritativeState: false,
    },
    allowedPeerNodeIds: input.allowedPeerNodeIds ?? [],
    routeIds,
    secretPolicy: {
      plaintextReplication: false,
      secretRefsOnly: true,
      brokerLeaseRequired: true,
    },
  });
}

export function createRemoteClientCacheSnapshot(input: {
  manifest: SyncResourceManifest;
  objectRef: string;
  nodeId: string;
  clientId: string;
  contentHash: string;
  cachedAt?: string;
  ttlSeconds?: number;
  physicalClientStorageVerified?: boolean;
}): RemoteClientCacheSnapshot {
  const manifest = syncResourceManifestSchema.parse(input.manifest);
  const cachedAt = input.cachedAt ?? new Date().toISOString();
  const ttlSeconds = input.ttlSeconds ?? manifest.cachePolicy.ttlSeconds;
  const physicalClientStorageVerified = input.physicalClientStorageVerified ?? false;
  return remoteClientCacheSnapshotSchema.parse({
    schemaVersion: 1,
    cacheEntryId: remoteClientCacheEntryId([
      manifest.resourceId,
      input.objectRef,
      input.clientId,
      input.contentHash,
    ]),
    resourceId: manifest.resourceId,
    objectRef: input.objectRef,
    nodeId: input.nodeId,
    clientId: input.clientId,
    contentHash: input.contentHash,
    encrypted: true,
    ttlSeconds,
    cachedAt,
    expiresAt: new Date(Date.parse(cachedAt) + ttlSeconds * 1000).toISOString(),
    storesSecrets: false,
    storesAuthoritativeState: false,
    plaintextIncluded: false,
    physicalClientStorageVerified,
    externalPending: physicalClientStorageVerified ? [] : ["physical_client_storage"],
    auditEventId: remoteClientCacheEntryId(["audit", manifest.resourceId, input.objectRef, input.clientId, cachedAt]),
    writes: false,
  });
}

function syncChangeId(parts: string[]): string {
  return `sync_change_${parts.join("_").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase()}`;
}

function syncConflictId(resourceId: string, objectRef: string): string {
  return `sync_conflict_${resourceId}_${objectRef}`.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();
}

function syncQueueEntryId(parts: string[]): string {
  return `sync_queue_${parts.join("_").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase()}`;
}

function meshId(prefix: string, parts: string[]): string {
  return `${prefix}_${parts.join("_").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase()}`;
}

function remoteTransportReceiptId(parts: string[]): string {
  return `transport_handshake_${parts.join("_").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase()}`;
}

function nodeTrustDecisionId(parts: string[]): string {
  return `node_trust_${parts.join("_").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase()}`;
}

function gatewayDeploymentId(parts: string[]): string {
  return `gateway_deployment_${parts.join("_").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase()}`;
}

function secretProviderReceiptId(parts: string[]): string {
  return `secret_provider_${parts.join("_").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase()}`;
}

function remoteClientCacheEntryId(parts: string[]): string {
  return `remote_cache_${parts.join("_").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase()}`;
}

function remoteCompatibilityAdapterId(parts: string[]): string {
  return `remote_compat_${parts.join("_").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase()}`;
}

function remoteClassificationReceiptId(parts: string[]): string {
  return `remote_classification_${parts.join("_").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase()}`;
}

function remoteAgentServiceExecutionReceiptId(parts: string[]): string {
  return `agent_service_execution_${parts.join("_").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase()}`;
}

function remoteGatewayAuditReceiptId(parts: string[]): string {
  return `gateway_audit_${parts.join("_").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase()}`;
}

function syncDriverApplicationReceiptId(parts: string[]): string {
  return `sync_driver_application_${parts.join("_").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase()}`;
}

function newestSnapshot(left: SyncObjectSnapshot, right: SyncObjectSnapshot): SyncObjectSnapshot {
  return left.updatedAt >= right.updatedAt ? left : right;
}

export function buildSyncPlan(input: {
  manifest: SyncResourceManifest;
  actor: RemoteActorContext;
  localNodeId: string;
  peerNodeId: string;
  localSnapshots?: SyncObjectSnapshot[];
  peerSnapshots?: SyncObjectSnapshot[];
  now?: string;
}): SyncPlanResult {
  const manifest = syncResourceManifestSchema.parse(input.manifest);
  const actor = remoteActorContextSchema.parse(input.actor);
  const now = input.now ?? new Date().toISOString();
  if (manifest.allowedPeerNodeIds.length > 0 && !manifest.allowedPeerNodeIds.includes(input.peerNodeId)) {
    throw new Error(`Sync peer ${input.peerNodeId} is not allowed for ${manifest.resourceId}.`);
  }
  const localByRef = new Map((input.localSnapshots ?? []).map((snapshot) => [snapshot.objectRef, syncObjectSnapshotSchema.parse(snapshot)]));
  const peerByRef = new Map((input.peerSnapshots ?? []).map((snapshot) => [snapshot.objectRef, syncObjectSnapshotSchema.parse(snapshot)]));
  const refs = [...new Set([...localByRef.keys(), ...peerByRef.keys()])].sort();
  const actions: SyncPlanAction[] = [];
  const changes: SyncChange[] = [];
  const conflicts: SyncConflict[] = [];

  for (const objectRef of refs) {
    const local = localByRef.get(objectRef);
    const peer = peerByRef.get(objectRef);
    if (local && peer && local.contentHash === peer.contentHash && local.deleted === peer.deleted) {
      actions.push(syncPlanActionSchema.parse({
        action: "noop",
        resourceId: manifest.resourceId,
        objectRef,
        localHash: local.contentHash,
        peerHash: peer.contentHash,
        reason: "snapshots_match",
      }));
      continue;
    }
    if (local && peer) {
      const conflict = syncConflictSchema.parse({
        conflictId: syncConflictId(manifest.resourceId, objectRef),
        resourceId: manifest.resourceId,
        objectRef,
        policy: manifest.conflictPolicy,
        status: manifest.conflictPolicy === "detect_and_elevate" ? "open" : "blocked",
        detectedAt: now,
        changeIds: [
          syncChangeId([manifest.resourceId, objectRef, local.nodeId, local.contentHash]),
          syncChangeId([manifest.resourceId, objectRef, peer.nodeId, peer.contentHash]),
        ],
      });
      conflicts.push(conflict);
      actions.push(syncPlanActionSchema.parse({
        action: "conflict",
        resourceId: manifest.resourceId,
        objectRef,
        localHash: local.contentHash,
        peerHash: peer.contentHash,
        reason: "diverged_snapshots_detect_and_elevate",
      }));
      continue;
    }
    const source = local ?? peer;
    if (!source) continue;
    const action = local ? "push" : "pull";
    actions.push(syncPlanActionSchema.parse({
      action,
      resourceId: manifest.resourceId,
      objectRef,
      ...(local ? { localHash: local.contentHash } : { peerHash: peer?.contentHash }),
      reason: local ? "local_snapshot_missing_on_peer" : "peer_snapshot_missing_locally",
    }));
    changes.push(syncChangeSchema.parse({
      changeId: syncChangeId([manifest.resourceId, objectRef, source.nodeId, source.contentHash]),
      resourceId: manifest.resourceId,
      nodeId: source.nodeId,
      actor,
      operation: source.deleted ? "tombstone" : "update",
      objectRef,
      occurredAt: source.updatedAt,
      secretRefs: [],
    }));
  }

  const newest = [...(input.localSnapshots ?? []), ...(input.peerSnapshots ?? [])]
    .map((snapshot) => syncObjectSnapshotSchema.parse(snapshot))
    .reduce<SyncObjectSnapshot | null>((current, snapshot) => current ? newestSnapshot(current, snapshot) : snapshot, null);
  const nextCursor = newest
    ? syncCursorSchema.parse({
      resourceId: manifest.resourceId,
      nodeId: input.localNodeId,
      cursor: `${newest.updatedAt}:${newest.objectRef}:${newest.contentHash}`,
      observedAt: now,
    })
    : undefined;

  return syncPlanResultSchema.parse({
    manifest,
    actions,
    changes,
    conflicts,
    ...(nextCursor ? { nextCursor } : {}),
    writes: false,
  });
}

export function buildSyncQueueEntries(
  planInput: SyncPlanResult,
  input: {
    queuedAt?: string;
    cursorBefore?: SyncCursor;
  } = {},
): SyncQueueEntry[] {
  const plan = syncPlanResultSchema.parse(planInput);
  const queuedAt = input.queuedAt ?? new Date().toISOString();
  const cursorBefore = input.cursorBefore ? syncCursorSchema.parse(input.cursorBefore) : undefined;
  const changesByRef = new Map(plan.changes.map((change) => [change.objectRef, change]));
  const conflictsByRef = new Map(plan.conflicts.map((conflict) => [conflict.objectRef, conflict]));

  return plan.actions.flatMap((action) => {
    if (action.action === "noop") return [];
    const change = changesByRef.get(action.objectRef);
    const conflict = conflictsByRef.get(action.objectRef);
    return [syncQueueEntrySchema.parse({
      queueEntryId: syncQueueEntryId([
        plan.manifest.resourceId,
        action.objectRef,
        action.action,
        change?.changeId ?? conflict?.conflictId ?? "pending",
      ]),
      resourceId: action.resourceId,
      objectRef: action.objectRef,
      direction: action.action,
      status: action.action === "conflict" ? "blocked" : "queued",
      ...(change ? { changeId: change.changeId } : {}),
      ...(conflict ? { conflictId: conflict.conflictId } : {}),
      ...(cursorBefore ? { cursorBefore } : {}),
      ...(plan.nextCursor ? { cursorAfter: plan.nextCursor } : {}),
      queuedAt,
      updatedAt: queuedAt,
      reason: action.reason,
      secretRefs: change?.secretRefs ?? [],
      writes: false,
    })];
  });
}

function isTerminalSyncQueueStatus(status: SyncQueueEntry["status"]): boolean {
  return status === "applied" || status === "resolved" || status === "failed" || status === "skipped";
}

export function reconcileSyncQueue(input: {
  manifest: SyncResourceManifest;
  queue: SyncQueueEntry[];
  acknowledgedChangeIds?: string[];
  resolvedConflictIds?: string[];
  now?: string;
}): SyncReconciliationResult {
  const manifest = syncResourceManifestSchema.parse(input.manifest);
  const acknowledgedChangeIds = new Set(input.acknowledgedChangeIds ?? []);
  const resolvedConflictIds = new Set(input.resolvedConflictIds ?? []);
  const now = input.now ?? new Date().toISOString();
  const appliedChangeIds: string[] = [];
  const blockedConflictIds: string[] = [];

  const queue = input.queue.map((entryInput) => {
    const entry = syncQueueEntrySchema.parse(entryInput);
    if (entry.resourceId !== manifest.resourceId) {
      return syncQueueEntrySchema.parse({
        ...entry,
        status: "failed",
        updatedAt: now,
        reason: "queue_entry_resource_does_not_match_manifest",
        writes: false,
      });
    }
    if (entry.status === "queued" && entry.changeId && acknowledgedChangeIds.has(entry.changeId)) {
      appliedChangeIds.push(entry.changeId);
      return syncQueueEntrySchema.parse({
        ...entry,
        status: "applied",
        updatedAt: now,
        writes: false,
      });
    }
    if (entry.status === "blocked" && entry.conflictId && resolvedConflictIds.has(entry.conflictId)) {
      return syncQueueEntrySchema.parse({
        ...entry,
        status: "resolved",
        updatedAt: now,
        writes: false,
      });
    }
    if (entry.status === "blocked" && entry.conflictId) blockedConflictIds.push(entry.conflictId);
    return syncQueueEntrySchema.parse({ ...entry, writes: false });
  });

  const nextCursor = queue.length > 0 && queue.every((entry) => isTerminalSyncQueueStatus(entry.status))
    ? queue.findLast((entry) => entry.cursorAfter)?.cursorAfter
    : undefined;

  return syncReconciliationResultSchema.parse({
    manifest,
    queue,
    appliedChangeIds,
    blockedConflictIds,
    ...(nextCursor ? { nextCursor } : {}),
    writes: false,
  });
}

export function createSyncDriverApplicationReceipt(input: {
  manifest: SyncResourceManifest;
  reconciliation: SyncReconciliationResult;
  actor: RemoteActorContext;
  createdAt?: string;
  physicalDriverApplied?: boolean;
}): SyncDriverApplicationReceipt {
  const manifest = syncResourceManifestSchema.parse(input.manifest);
  const reconciliation = syncReconciliationResultSchema.parse(input.reconciliation);
  const actor = remoteActorContextSchema.parse(input.actor);
  if (reconciliation.manifest.resourceId !== manifest.resourceId) {
    throw new Error(`Sync application receipt manifest mismatch: ${manifest.resourceId} != ${reconciliation.manifest.resourceId}`);
  }
  const createdAt = input.createdAt ?? new Date().toISOString();
  const physicalDriverApplied = input.physicalDriverApplied ?? false;
  const blocked = reconciliation.blockedConflictIds.length > 0;
  const status = blocked
    ? "blocked"
    : physicalDriverApplied ? "applied" : "signed_pending_driver_application";
  return syncDriverApplicationReceiptSchema.parse({
    schemaVersion: 1,
    receiptId: syncDriverApplicationReceiptId([
      manifest.resourceId,
      manifest.driver,
      status,
      createdAt,
    ]),
    resourceId: manifest.resourceId,
    driver: manifest.driver,
    routeId: manifest.routeIds[0] ?? routeIdForSyncDriver(manifest.driver),
    actor,
    appliedChangeIds: reconciliation.appliedChangeIds,
    blockedConflictIds: reconciliation.blockedConflictIds,
    status,
    physicalDriverApplied,
    externalPending: physicalDriverApplied || blocked ? [] : ["physical_sync_driver_application"],
    createdAt,
    auditEventId: syncDriverApplicationReceiptId(["audit", manifest.resourceId, manifest.driver, createdAt]),
    writes: false,
  });
}

export function buildRemoteOfflineCommandResult(input: {
  routeId: string;
  actor: RemoteActorContext;
  reason?: RemoteOfflineCommandResult["reason"];
  evaluatedAt?: string;
}): RemoteOfflineCommandResult {
  return remoteOfflineCommandResultSchema.parse({
    routeId: input.routeId,
    actor: remoteActorContextSchema.parse(input.actor),
    status: "failed_fast",
    reason: input.reason ?? "connector_offline",
    enqueued: false,
    retryable: true,
    evaluatedAt: input.evaluatedAt ?? new Date().toISOString(),
    writes: false,
  });
}

export function createTransportHandshakeReceipt(input: {
  transport?: string;
  adapter?: string;
  initiatorNodeId: string;
  responderNodeId: string;
  coordinatorNodeId: string;
  trustMode?: RemoteTrustMode;
  challengeNonce: string;
  responseNonce: string;
  createdAt?: string;
  expiresAt?: string;
  physicalTransportVerified?: boolean;
}): RemoteTransportHandshakeReceipt {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const expiresAt = input.expiresAt ?? new Date(Date.parse(createdAt) + 15 * 60 * 1000).toISOString();
  const physicalTransportVerified = input.physicalTransportVerified ?? false;
  const transport = input.transport ?? "iroh";
  return remoteTransportHandshakeReceiptSchema.parse({
    schemaVersion: 1,
    receiptId: remoteTransportReceiptId([
      transport,
      input.initiatorNodeId,
      input.responderNodeId,
      input.coordinatorNodeId,
      input.challengeNonce,
    ]),
    transport,
    adapter: input.adapter ?? (transport === "iroh" ? "iroh_v1" : `${transport}_adapter`),
    initiatorNodeId: input.initiatorNodeId,
    responderNodeId: input.responderNodeId,
    coordinatorNodeId: input.coordinatorNodeId,
    trustMode: input.trustMode ?? "sovereign_e2e_tunnel",
    challengeNonce: input.challengeNonce,
    responseNonce: input.responseNonce,
    contractVerified: true,
    physicalTransportVerified,
    externalPending: physicalTransportVerified ? [] : ["physical_iroh_handshake", "device_trust_acceptance"],
    createdAt,
    expiresAt,
    auditEventId: remoteTransportReceiptId(["audit", input.initiatorNodeId, input.responderNodeId, createdAt]),
    writes: false,
  });
}

export function createNodeTrustDecision(input: {
  subjectNodeId: string;
  coordinatorNodeId: string;
  actor: RemoteActorContext;
  trustMode?: RemoteTrustMode;
  transport?: string;
  effect?: "allow" | "deny" | "revoke";
  grantedRouteIds?: string[];
  createdAt?: string;
  expiresAt?: string;
  physicalAcceptanceVerified?: boolean;
}): NodeTrustDecision {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const effect = input.effect ?? "allow";
  const physicalAcceptanceVerified = input.physicalAcceptanceVerified ?? false;
  const status = effect === "deny"
    ? "denied"
    : effect === "revoke"
      ? "revoked"
      : physicalAcceptanceVerified
        ? "active"
        : "signed_pending_physical_acceptance";
  return nodeTrustDecisionSchema.parse({
    schemaVersion: 1,
    decisionId: nodeTrustDecisionId([
      input.subjectNodeId,
      input.coordinatorNodeId,
      effect,
      createdAt,
    ]),
    subjectNodeId: input.subjectNodeId,
    coordinatorNodeId: input.coordinatorNodeId,
    actor: remoteActorContextSchema.parse(input.actor),
    trustMode: input.trustMode ?? "sovereign_e2e_tunnel",
    transport: input.transport ?? "iroh",
    effect,
    status,
    grantedRouteIds: input.grantedRouteIds ?? remoteSyncRequiredRouteIds.slice(),
    physicalAcceptanceVerified,
    externalPending: physicalAcceptanceVerified ? [] : ["device_trust_acceptance", "physical_iroh_handshake"],
    createdAt,
    ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
    auditEventId: nodeTrustDecisionId(["audit", input.subjectNodeId, input.coordinatorNodeId, createdAt]),
    writes: false,
  });
}

export function createGatewayDeploymentManifest(input: {
  deploymentKind?: "self_hosted" | "hosted";
  gatewayNodeId: string;
  coordinatorNodeId: string;
  bindAddress?: string;
  publicBaseUrl?: string;
  contractRouteIds?: string[];
  createdAt?: string;
  physicalDeploymentVerified?: boolean;
}): GatewayDeploymentManifest {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const deploymentKind = input.deploymentKind ?? "self_hosted";
  const physicalDeploymentVerified = input.physicalDeploymentVerified ?? false;
  return gatewayDeploymentManifestSchema.parse({
    schemaVersion: 1,
    deploymentId: gatewayDeploymentId([
      deploymentKind,
      input.gatewayNodeId,
      input.coordinatorNodeId,
      createdAt,
    ]),
    deploymentKind,
    gatewayNodeId: input.gatewayNodeId,
    coordinatorNodeId: input.coordinatorNodeId,
    bindAddress: input.bindAddress ?? "127.0.0.1:24102",
    ...(input.publicBaseUrl ? { publicBaseUrl: input.publicBaseUrl } : {}),
    contractRouteIds: input.contractRouteIds?.length ? input.contractRouteIds : remoteSyncRequiredRouteIds.slice(),
    hostedSelfHostedParity: true,
    conformanceStatus: physicalDeploymentVerified ? "baseline_registered" : "external_pending",
    physicalDeploymentVerified,
    externalPending: physicalDeploymentVerified ? [] : [deploymentKind === "hosted" ? "hosted_deployment" : "self_hosted_deployment"],
    createdAt,
    auditEventId: gatewayDeploymentId(["audit", deploymentKind, input.gatewayNodeId, createdAt]),
    writes: false,
  });
}

export function createRemoteSecretProviderReceipt(input: {
  lease: RemoteSecretLease;
  providerId: string;
  credentialBindingId: string;
  operationId?: string;
  createdAt?: string;
  providerAccessVerified?: boolean;
}): RemoteSecretProviderReceipt {
  const lease = remoteSecretLeaseSchema.parse(input.lease);
  const createdAt = input.createdAt ?? new Date().toISOString();
  const providerAccessVerified = input.providerAccessVerified ?? false;
  return remoteSecretProviderReceiptSchema.parse({
    schemaVersion: 1,
    receiptId: secretProviderReceiptId([
      lease.leaseId,
      input.providerId,
      input.credentialBindingId,
      createdAt,
    ]),
    leaseId: lease.leaseId,
    secretRef: lease.secretRef,
    providerId: input.providerId,
    credentialBindingId: input.credentialBindingId,
    operationId: input.operationId ?? "secret.retrieve",
    actor: lease.actor,
    resourceId: lease.resourceId,
    providerAccessVerified,
    plaintextReturned: false,
    externalPending: providerAccessVerified ? [] : ["provider_secret_retrieval"],
    createdAt,
    auditEventId: secretProviderReceiptId(["audit", lease.leaseId, input.providerId, createdAt]),
    writes: false,
  });
}

export function createRemoteCompatibilityAdapterReceipt(input: {
  legacySurface: string;
  canonicalRouteId: string;
  clientKind?: RemoteCompatibilityClientKind;
  status?: "active_adapter" | "deprecated_adapter" | "blocked";
  createdAt?: string;
}): RemoteCompatibilityAdapterReceipt {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const status = input.status ?? "active_adapter";
  return remoteCompatibilityAdapterReceiptSchema.parse({
    schemaVersion: 1,
    adapterId: remoteCompatibilityAdapterId([
      input.legacySurface,
      input.canonicalRouteId,
      input.clientKind ?? "unknown",
      createdAt,
    ]),
    legacySurface: input.legacySurface,
    canonicalRouteId: input.canonicalRouteId,
    clientKind: input.clientKind ?? "unknown",
    status,
    mapsToCanonical: true,
    parallelApiIntroduced: false,
    migrationRequired: status !== "blocked",
    createdAt,
    auditEventId: remoteCompatibilityAdapterId(["audit", input.legacySurface, input.canonicalRouteId, createdAt]),
    writes: false,
  });
}

export function createRemoteSurfaceClassificationReceipt(input: {
  capabilityId: string;
  classification: RemoteSurfaceClassification;
  routeId?: string;
  policyRef?: string;
  testRefs?: string[];
  reason?: string;
  createdAt?: string;
}): RemoteSurfaceClassificationReceipt {
  const classification = remoteSurfaceClassificationSchema.parse(input.classification);
  const testRefs = input.testRefs ?? [];
  const missingEvidence = [
    ...(input.routeId ? [] : ["route" as const]),
    ...(input.policyRef ? [] : ["policy" as const]),
    ...(testRefs.length ? [] : ["tests" as const]),
  ];
  const remoteSafeReady = classification === "remote-safe" && missingEvidence.length === 0;
  const createdAt = input.createdAt ?? new Date().toISOString();
  if (classification === "remote-safe" && !remoteSafeReady) {
    throw new Error(`remote-safe classification for ${input.capabilityId} requires route, policy, and tests`);
  }
  return remoteSurfaceClassificationReceiptSchema.parse({
    schemaVersion: 1,
    receiptId: remoteClassificationReceiptId([
      input.capabilityId,
      classification,
      createdAt,
    ]),
    capabilityId: input.capabilityId,
    classification,
    ...(input.routeId ? { routeId: input.routeId } : {}),
    ...(input.policyRef ? { policyRef: input.policyRef } : {}),
    testRefs,
    remoteSafeReady,
    missingEvidence,
    ...(input.reason ? { reason: input.reason } : {}),
    createdAt,
    auditEventId: remoteClassificationReceiptId(["audit", input.capabilityId, classification, createdAt]),
    writes: false,
  });
}

export function createMeshInvitation(input: {
  issuerMeshId: string;
  coordinatorNodeId: string;
  recipientMeshId?: string;
  inviteePublicKeyRef?: string;
  trustMode?: RemoteTrustMode;
  transport?: string;
  allowedResourceIds: string[];
  allowedActions: MeshShareAction[];
  createdAt?: string;
  expiresAt: string;
}): MeshInvitation {
  const createdAt = input.createdAt ?? new Date().toISOString();
  return meshInvitationSchema.parse({
    schemaVersion: 1,
    invitationId: meshId("mesh_invitation", [
      input.issuerMeshId,
      input.recipientMeshId ?? input.inviteePublicKeyRef ?? "recipient",
      createdAt,
    ]),
    issuerMeshId: input.issuerMeshId,
    coordinatorNodeId: input.coordinatorNodeId,
    ...(input.recipientMeshId ? { recipientMeshId: input.recipientMeshId } : {}),
    ...(input.inviteePublicKeyRef ? { inviteePublicKeyRef: input.inviteePublicKeyRef } : {}),
    trustMode: input.trustMode ?? "sovereign_e2e_tunnel",
    transport: input.transport ?? "iroh",
    status: "pending",
    allowedResourceIds: input.allowedResourceIds,
    allowedActions: input.allowedActions,
    createdAt,
    expiresAt: input.expiresAt,
    writes: false,
  });
}

export function createMeshInvitationAcceptance(input: {
  invitation: MeshInvitation;
  accepterMeshId?: string;
  actor: RemoteActorContext;
  acceptedAt?: string;
  physicalPeerTrustVerified?: boolean;
}): MeshInvitationAcceptance {
  const invitation = meshInvitationSchema.parse(input.invitation);
  const actor = remoteActorContextSchema.parse(input.actor);
  const acceptedAt = input.acceptedAt ?? new Date().toISOString();
  const physicalPeerTrustVerified = input.physicalPeerTrustVerified ?? false;
  const status = invitation.status === "pending" || invitation.status === "accepted"
    ? physicalPeerTrustVerified ? "active" : "signed_pending_peer_trust"
    : "blocked";
  return meshInvitationAcceptanceSchema.parse({
    schemaVersion: 1,
    acceptanceId: meshId("mesh_invitation_acceptance", [
      invitation.invitationId,
      input.accepterMeshId ?? invitation.recipientMeshId ?? actor.nodeId,
      acceptedAt,
    ]),
    invitationId: invitation.invitationId,
    issuerMeshId: invitation.issuerMeshId,
    accepterMeshId: input.accepterMeshId ?? invitation.recipientMeshId ?? actor.nodeId,
    coordinatorNodeId: invitation.coordinatorNodeId,
    actor,
    trustMode: invitation.trustMode,
    transport: invitation.transport,
    acceptedResourceIds: invitation.allowedResourceIds,
    acceptedActions: invitation.allowedActions,
    status,
    physicalPeerTrustVerified,
    externalPending: status === "signed_pending_peer_trust" ? ["physical_peer_trust", "device_trust_acceptance"] : [],
    acceptedAt,
    auditEventId: meshId("audit_mesh_invitation_acceptance", [invitation.invitationId, acceptedAt]),
    writes: false,
  });
}

export function createMeshResourceShare(input: {
  invitation: MeshInvitation;
  fromMeshId?: string;
  toMeshId: string;
  manifest: SyncResourceManifest;
  actions: MeshShareAction[];
  secretRefs?: string[];
  createdAt?: string;
  expiresAt: string;
}): MeshResourceShare {
  const invitation = meshInvitationSchema.parse(input.invitation);
  const manifest = syncResourceManifestSchema.parse(input.manifest);
  const createdAt = input.createdAt ?? new Date().toISOString();
  if (!invitation.allowedResourceIds.includes(manifest.resourceId)) {
    throw new Error(`Mesh invitation ${invitation.invitationId} does not allow resource ${manifest.resourceId}`);
  }
  for (const action of input.actions) {
    if (!invitation.allowedActions.includes(action)) {
      throw new Error(`Mesh invitation ${invitation.invitationId} does not allow action ${action}`);
    }
  }
  if ((input.secretRefs?.length ?? 0) > 0 && !input.actions.includes("lease_secret")) {
    throw new Error("Mesh shares with secret refs require lease_secret scope");
  }
  const regulatedDomains = regulatedDomainsForRemoteManifest(manifest);
  if (regulatedDomains.length > 0 && input.actions.some((action) => action === "execute" || action === "lease_secret")) {
    const denialMessages = regulatedDomains.flatMap((regulatedDomain) => {
      const decision = evaluateRegulatedAction({
        regulatedDomain,
        decisionEffect: "external_action",
        externalAction: true,
        remoteOrProviderUse: true,
        sensitiveExport: input.actions.includes("lease_secret") || (input.secretRefs?.length ?? 0) > 0,
      });
      return decision.allowed ? [] : [`${regulatedDomain}:${decision.denialCodes.join(",")}`];
    });
    if (denialMessages.length > 0) {
      throw new Error(`Regulated remote shares require explicit review and cannot grant execute or lease_secret directly: ${denialMessages.join(";")}`);
    }
  }
  return meshResourceShareSchema.parse({
    schemaVersion: 1,
    shareId: meshId("mesh_share", [invitation.invitationId, manifest.resourceId, input.toMeshId]),
    invitationId: invitation.invitationId,
    fromMeshId: input.fromMeshId ?? invitation.issuerMeshId,
    toMeshId: input.toMeshId,
    resourceId: manifest.resourceId,
    resourceKind: manifest.kind,
    routeId: manifest.routeIds[0],
    actions: input.actions,
    syncManifest: manifest,
    secretRefs: input.secretRefs ?? [],
    plaintextSecrets: false,
    status: "proposed",
    createdAt,
    expiresAt: input.expiresAt,
    auditEventId: meshId("audit_mesh_share", [invitation.invitationId, manifest.resourceId, createdAt]),
    writes: false,
  });
}

function regulatedDomainsForRemoteManifest(manifest: SyncResourceManifest): RegulatedDomain[] {
  const haystack = [
    manifest.resourceId,
    manifest.kind,
    manifest.driver,
    ...manifest.routeIds,
  ].join(" ").toLowerCase();
  const domains: RegulatedDomain[] = [];
  const add = (domain: RegulatedDomain) => {
    if (!domains.includes(domain)) domains.push(domain);
  };

  if (/\b(health|ehr|patient|encounter|medication|clinical)\b/.test(haystack)) add("health");
  if (/\b(mental[_-]?health|therapy|crisis)\b/.test(haystack)) add("mental_health");
  if (/\b(pharma|drug|batch|adverse|pharmacovigilance)\b/.test(haystack)) add("pharma");
  if (/\b(finance|accounting|transaction|investment|credit|tax)\b/.test(haystack)) add("finance");
  if (/\b(bank|banking|lending|loan)\b/.test(haystack)) add("banking");
  if (/\b(insurance|claim|underwriting)\b/.test(haystack)) add("insurance");
  if (/\b(legal|case|court|filing|tribunal)\b/.test(haystack)) add("legal");
  if (/\b(hr|employment|employee|candidate|hiring)\b/.test(haystack)) add("hr_employment");
  if (/\b(education|learner|student|admission|credential)\b/.test(haystack)) add("education");
  if (/\b(government|public[_-]?case|permit|license|benefits)\b/.test(haystack)) add("government_public_services");
  if (/\b(real[_-]?estate|property|housing|lease)\b/.test(haystack)) add("housing_real_estate");
  if (/\b(compliance|grc|audit|control|attestation)\b/.test(haystack)) add("compliance_grc");
  if (/\b(identity|passport|ssn|credential)\b/.test(haystack)) add("identity");
  if (/\b(security|secret|credential|token)\b/.test(haystack)) add("security");
  if (/\b(payment|billing|invoice|subscription)\b/.test(haystack)) add("billing_payments");
  if (/\b(lab|lims|eln|notebook|sample|assay|research)\b/.test(haystack)) add("labs_research");
  if (/\b(iot|device|thing|physical[_-]?action)\b/.test(haystack)) add("iot_physical_actions");
  if (/\b(vehicle|transport|shipment|driver)\b/.test(haystack)) add("vehicles_transport");
  if (/\b(minor|child|children)\b/.test(haystack)) add("minors");
  if (/\b(public[_-]?safety|emergency|dispatch|cad)\b/.test(haystack)) add("government_public_services");

  return domains;
}

export function createMeshRevocation(input: {
  targetType: MeshRevocation["targetType"];
  targetId: string;
  actor: RemoteActorContext;
  reason: string;
  revokedAt?: string;
}): MeshRevocation {
  const revokedAt = input.revokedAt ?? new Date().toISOString();
  return meshRevocationSchema.parse({
    schemaVersion: 1,
    revocationId: meshId("mesh_revocation", [input.targetType, input.targetId, revokedAt]),
    targetType: input.targetType,
    targetId: input.targetId,
    actor: remoteActorContextSchema.parse(input.actor),
    reason: input.reason,
    revokedAt,
    cascadeSyncQueues: true,
    auditEventId: meshId("audit_mesh_revocation", [input.targetType, input.targetId, revokedAt]),
    writes: false,
  });
}

export function evaluateRemoteAgentServiceAccess(input: {
  request: RemoteAgentServiceRequest;
  assignment: RemoteAgentServiceAssignment;
  budget?: RemoteAgentServiceBudget;
}): RemoteAgentServiceDecision {
  const request = remoteAgentServiceRequestSchema.parse(input.request);
  const assignment = remoteAgentServiceAssignmentSchema.parse(input.assignment);
  const budget = input.budget ? remoteAgentServiceBudgetSchema.parse(input.budget) : undefined;
  const reasons: string[] = [];

  if (assignment.tenantId !== request.tenantId) reasons.push("tenant: assignment belongs to a different tenant");
  if (assignment.agentId !== request.agentId) reasons.push("agent: assignment belongs to a different agent");
  if (assignment.assignmentId !== request.assignmentId) reasons.push("assignment: requested assignment does not match");
  if (assignment.status !== "active") reasons.push(`assignment: status ${assignment.status} is not active`);
  if (!assignment.routeIds.includes(request.routeId)) reasons.push("route: assignment does not allow requested Gateway route");
  if (!assignment.isolationKey) reasons.push("isolation: tenant isolation key required");
  if (assignment.auditRequired !== true) reasons.push("audit: service assignment must require audit");

  if (!budget) {
    reasons.push("budget: service assignment requires budget and billing account");
  } else {
    if (budget.tenantId !== request.tenantId) reasons.push("budget: tenant mismatch");
    if (budget.budgetId !== assignment.budgetId) reasons.push("budget: assignment budget mismatch");
    if (budget.billingAccountId !== assignment.billingAccountId) reasons.push("billing: assignment billing account mismatch");
    if (!budget.billingMeterId) reasons.push("billing: meter id required");
    if (budget.usedCents + request.estimatedCostCents > budget.limitCents) reasons.push("budget: estimated cost exceeds limit");
  }

  const allowed = reasons.length === 0;
  return remoteAgentServiceDecisionSchema.parse({
    allowed,
    reasons,
    tenantId: request.tenantId,
    agentId: request.agentId,
    assignmentId: request.assignmentId,
    billingAccountId: assignment.billingAccountId,
    isolationKey: assignment.isolationKey,
    audit: {
      eventType: "remote.agent_service.evaluated",
      tenantId: request.tenantId,
      agentId: request.agentId,
      assignmentId: request.assignmentId,
      routeId: request.routeId,
      decision: allowed ? "allow" : "deny",
    },
    writes: false,
  });
}

export function createRemoteAgentServiceExecutionReceipt(input: {
  request: RemoteAgentServiceRequest;
  assignment: RemoteAgentServiceAssignment;
  budget: RemoteAgentServiceBudget;
  decision: RemoteAgentServiceDecision;
  createdAt?: string;
  runtimeExecutionVerified?: boolean;
  billingMeterPersisted?: boolean;
}): RemoteAgentServiceExecutionReceipt {
  const request = remoteAgentServiceRequestSchema.parse(input.request);
  const assignment = remoteAgentServiceAssignmentSchema.parse(input.assignment);
  const budget = remoteAgentServiceBudgetSchema.parse(input.budget);
  const decision = remoteAgentServiceDecisionSchema.parse(input.decision);
  const createdAt = input.createdAt ?? request.now;
  const runtimeExecutionVerified = input.runtimeExecutionVerified ?? false;
  const billingMeterPersisted = input.billingMeterPersisted ?? false;
  const externalPending = decision.allowed
    ? [
      ...(runtimeExecutionVerified ? [] : ["agent_runtime_execution" as const]),
      ...(billingMeterPersisted ? [] : ["billing_meter_persistence" as const]),
    ]
    : [];
  const status = decision.allowed
    ? runtimeExecutionVerified && billingMeterPersisted ? "executed" : "signed_pending_runtime"
    : "denied";
  return remoteAgentServiceExecutionReceiptSchema.parse({
    schemaVersion: 1,
    receiptId: remoteAgentServiceExecutionReceiptId([
      request.tenantId,
      request.agentId,
      request.assignmentId,
      request.routeId,
      createdAt,
    ]),
    tenantId: request.tenantId,
    agentId: request.agentId,
    assignmentId: request.assignmentId,
    routeId: request.routeId,
    billingAccountId: assignment.billingAccountId,
    budgetId: assignment.budgetId,
    billingMeterId: budget.billingMeterId,
    estimatedCostCents: request.estimatedCostCents,
    isolationKey: assignment.isolationKey,
    decisionAllowed: decision.allowed,
    status,
    runtimeExecutionVerified,
    billingMeterPersisted,
    externalPending,
    createdAt,
    auditEventId: remoteAgentServiceExecutionReceiptId(["audit", request.tenantId, request.agentId, request.assignmentId, createdAt]),
    writes: false,
  });
}

export function createRemoteGatewayAuditReceipt(input: {
  sourceEventType?: "remote.access.evaluated" | "remote.agent_service.evaluated" | "gateway.agent_service.execution";
  routeId: string;
  actor: RemoteActorContext;
  resourceType: string;
  resourceId?: string;
  action: string;
  decision: "allow" | "deny" | boolean;
  createdAt?: string;
  signedHostAuditPersisted?: boolean;
}): RemoteGatewayAuditReceipt {
  const actor = remoteActorContextSchema.parse(input.actor);
  const createdAt = input.createdAt ?? new Date().toISOString();
  const decision = typeof input.decision === "boolean" ? input.decision ? "allow" : "deny" : input.decision;
  const signedHostAuditPersisted = input.signedHostAuditPersisted ?? false;
  return remoteGatewayAuditReceiptSchema.parse({
    schemaVersion: 1,
    receiptId: remoteGatewayAuditReceiptId([
      input.routeId,
      actor.actorId,
      input.resourceType,
      input.resourceId ?? "none",
      input.action,
      createdAt,
    ]),
    sourceEventType: input.sourceEventType ?? "remote.access.evaluated",
    routeId: input.routeId,
    actor,
    resourceType: input.resourceType,
    ...(input.resourceId ? { resourceId: input.resourceId } : {}),
    action: input.action,
    decision,
    hostAuditStore: "signed_host_audit",
    signedHostAuditPersisted,
    externalPending: signedHostAuditPersisted ? [] : ["signed_host_audit_persistence"],
    createdAt,
    auditEventId: remoteGatewayAuditReceiptId(["audit", input.routeId, actor.actorId, createdAt]),
    writes: false,
  });
}

const governedGatewayRequiredGrantPlanes: RemoteAccessGrantPlane[] = [
  "agent",
  "execution_profile",
  "connector",
  "host",
  "run_scope",
  "remote_classification",
  "transport_trust",
];

function remoteGrantMatches(request: RemoteAccessRequest, grant: RemoteAccessGrant, now: Date): boolean {
  if (grant.expiresAt && Date.parse(grant.expiresAt) <= now.getTime()) return false;
  return (grant.resourceType === "*" || grant.resourceType === request.resourceType)
    && (grant.action === "*" || grant.action === request.action)
    && (grant.resourceId === undefined || grant.resourceId === "*" || grant.resourceId === request.resourceId);
}

function evaluateRemoteGrantPlane(input: {
  request: RemoteAccessRequest;
  grants: RemoteAccessGrant[];
  plane: RemoteAccessGrantPlane;
  now: Date;
}): string | null {
  const planeGrants = input.grants
    .map((grant) => remoteAccessGrantSchema.parse(grant))
    .filter((grant) => grant.plane === input.plane && remoteGrantMatches(input.request, grant, input.now));
  const deny = planeGrants.find((grant) => grant.effect === "deny");
  if (deny) return `${input.plane}: denied by ${deny.id}`;
  const allow = planeGrants.find((grant) => grant.effect === "allow");
  return allow ? null : `${input.plane}: no active allow grant`;
}

function remoteAccessAuditFor(request: RemoteAccessRequest, allowed: boolean): RemoteAccessDecision["audit"] {
  return {
    eventType: "remote.access.evaluated",
    actorId: request.actor.actorId,
    actorKind: request.actor.actorKind,
    nodeId: request.actor.nodeId,
    routeId: request.routeId,
    resourceType: request.resourceType,
    ...(request.resourceId ? { resourceId: request.resourceId } : {}),
    action: request.action,
    trustMode: request.trustMode,
    classification: request.classification,
    decision: allowed ? "allow" : "deny",
  };
}

export function evaluateRemoteAccess(input: {
  request: RemoteAccessRequest;
  grants: RemoteAccessGrant[];
}): RemoteAccessDecision {
  const request = remoteAccessRequestSchema.parse(input.request);
  const grants = input.grants.map((grant) => remoteAccessGrantSchema.parse(grant));
  const now = new Date(request.now ?? new Date().toISOString());
  const reasons: string[] = [];
  const requiredBrokerLease = request.secretRefs.length > 0;

  if (request.classification !== "remote-safe") {
    reasons.push(`remote_classification: ${request.classification} is not remote-safe`);
  }
  if (request.actor.trustMode !== request.trustMode) {
    reasons.push("transport_trust: actor trust mode mismatch");
  }
  if (request.actor.transport !== request.transport) {
    reasons.push("transport_trust: actor transport mismatch");
  }
  if (request.actor.actorKind === "agent" && !request.actor.assignmentId) {
    reasons.push("assignment: agent remote access requires assignmentId");
  }
  if (request.plaintextSecretRequested) {
    reasons.push("secret_broker: plaintext secret access is forbidden");
  }

  const requiredPlanes = request.trustMode === "governed_gateway"
    ? [...governedGatewayRequiredGrantPlanes]
    : ["remote_classification", "transport_trust"] as RemoteAccessGrantPlane[];
  if (request.actor.actorKind === "agent") requiredPlanes.splice(1, 0, "assignment");
  if (requiredBrokerLease) requiredPlanes.push("secret_broker");

  for (const plane of [...new Set(requiredPlanes)]) {
    const planeFailure = evaluateRemoteGrantPlane({ request, grants, plane, now });
    if (planeFailure) reasons.push(planeFailure);
  }

  if (requiredBrokerLease) {
    const brokerAllowsLease = grants.some((grant) => {
      const parsed = remoteAccessGrantSchema.parse(grant);
      return parsed.plane === "secret_broker"
        && parsed.effect === "allow"
        && (parsed.requiresBrokerLease || parsed.action === "lease_secret" || parsed.action === "*")
        && remoteGrantMatches({ ...request, action: parsed.action === "lease_secret" ? "lease_secret" : request.action }, parsed, now);
    });
    if (!brokerAllowsLease) reasons.push("secret_broker: broker lease grant required for secret refs");
  }

  const allowed = reasons.length === 0;
  return remoteAccessDecisionSchema.parse({
    allowed,
    reasons,
    requiredBrokerLease,
    audit: remoteAccessAuditFor(request, allowed),
  });
}

export function buildRemoteConformanceReport(input: {
  routeIds: string[];
  nodeIds: string[];
}): {
  status: "baseline_registered" | "baseline_incomplete";
  decisions: Array<{ decisionId: string; status: "must_verify_before_goal_completion" }>;
  requiredRoutes: Array<{ routeId: string; registered: boolean }>;
  requiredNodes: Array<{ nodeId: string; registered: boolean }>;
  missingRoutes: string[];
  missingNodes: string[];
  hostedSelfHostedParity: "required";
  trustModes: RemoteTrustMode[];
  transportContract: "transport_agnostic_iroh_v1_adapter";
} {
  const requiredNodes = [
    "claw.coordinator",
    "claw.gateway",
    "claw.connector",
    "claw.sync",
    "claw.transport.iroh",
    "claw.headlessHost",
    "claw.remoteCache",
  ];
  const missingRoutes = remoteSyncRequiredRouteIds.filter((routeId) => !input.routeIds.includes(routeId));
  const missingNodes = requiredNodes.filter((nodeId) => !input.nodeIds.includes(nodeId));
  return {
    status: missingRoutes.length === 0 && missingNodes.length === 0 ? "baseline_registered" : "baseline_incomplete",
    decisions: remoteSyncRequiredDecisionIds.map((decisionId) => ({ decisionId, status: "must_verify_before_goal_completion" })),
    requiredRoutes: remoteSyncRequiredRouteIds.map((routeId) => ({ routeId, registered: input.routeIds.includes(routeId) })),
    requiredNodes: requiredNodes.map((nodeId) => ({ nodeId, registered: input.nodeIds.includes(nodeId) })),
    missingRoutes,
    missingNodes,
    hostedSelfHostedParity: "required",
    trustModes: ["sovereign_e2e_tunnel", "governed_gateway"],
    transportContract: "transport_agnostic_iroh_v1_adapter",
  };
}
