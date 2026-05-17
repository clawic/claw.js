import { z } from "zod";

export const remoteSurfaceClassificationSchema = z.enum([
  "remote-safe",
  "local-only",
  "blocked",
  "pending",
]);

export const remoteTrustModeSchema = z.enum([
  "sovereign_e2e_tunnel",
  "governed_gateway",
]);

export const remoteActorKindSchema = z.enum([
  "human",
  "device",
  "agent",
  "service",
  "organization",
]);

export const syncAuthoritySchema = z.enum([
  "primary",
  "replica",
  "cache",
  "mirror",
  "joint",
]);

export const syncDriverSchema = z.enum([
  "skills",
  "memory_user_model",
  "sessions",
  "drive_files",
  "blobs",
  "sqlite_tables",
  "sqlite_partial",
  "sidecar",
  "search_index",
  "agent_config",
  "workspace_state",
]);

export const syncConflictPolicySchema = z.enum([
  "detect_and_elevate",
  "explicit_owner_wins",
  "explicit_merge_driver",
  "append_only",
]);

export const syncCachePolicySchema = z.object({
  encrypted: z.literal(true),
  ttlSeconds: z.number().int().positive(),
  storesSecrets: z.literal(false),
  storesAuthoritativeState: z.literal(false),
});

export const nodeIdentitySchema = z.object({
  nodeId: z.string().min(1),
  displayName: z.string().min(1),
  hostKind: z.enum(["mac", "linux", "windows", "headless_server", "mobile_client", "browser_client", "participant"]),
  trustLevel: z.enum(["fully_owned", "partially_trusted", "untrusted"]),
  trustModes: z.array(remoteTrustModeSchema).min(1),
  publicKeyRef: z.string().min(1),
});

export const remoteActorContextSchema = z.object({
  actorKind: remoteActorKindSchema,
  actorId: z.string().min(1),
  deviceId: z.string().min(1).optional(),
  organizationId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
  assignmentId: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
  nodeId: z.string().min(1),
  transport: z.string().min(1),
  trustMode: remoteTrustModeSchema,
});

export const syncResourceManifestSchema = z.object({
  schemaVersion: z.literal(1),
  resourceId: z.string().min(1),
  kind: z.string().min(1),
  ownerNodeId: z.string().min(1),
  authority: syncAuthoritySchema,
  residency: z.array(z.string().min(1)).min(1),
  driver: syncDriverSchema,
  conflictPolicy: syncConflictPolicySchema.default("detect_and_elevate"),
  cachePolicy: syncCachePolicySchema,
  allowedPeerNodeIds: z.array(z.string().min(1)),
  routeIds: z.array(z.string().min(1)).min(1),
  secretPolicy: z.object({
    plaintextReplication: z.literal(false),
    secretRefsOnly: z.literal(true),
    brokerLeaseRequired: z.literal(true),
  }),
});

export const syncCursorSchema = z.object({
  resourceId: z.string().min(1),
  nodeId: z.string().min(1),
  cursor: z.string().min(1),
  observedAt: z.string().datetime(),
});

export const syncChangeSchema = z.object({
  changeId: z.string().min(1),
  resourceId: z.string().min(1),
  nodeId: z.string().min(1),
  actor: remoteActorContextSchema,
  operation: z.enum(["create", "update", "delete", "append", "tombstone"]),
  objectRef: z.string().min(1),
  occurredAt: z.string().datetime(),
  secretRefs: z.array(z.string().min(1)).default([]),
});

export const syncConflictSchema = z.object({
  conflictId: z.string().min(1),
  resourceId: z.string().min(1),
  objectRef: z.string().min(1),
  policy: syncConflictPolicySchema,
  status: z.enum(["open", "blocked", "resolved", "external_pending"]),
  detectedAt: z.string().datetime(),
  changeIds: z.array(z.string().min(1)).min(2),
});

export const syncObjectSnapshotSchema = z.object({
  resourceId: z.string().min(1),
  objectRef: z.string().min(1),
  nodeId: z.string().min(1),
  contentHash: z.string().min(1),
  updatedAt: z.string().datetime(),
  deleted: z.boolean().default(false),
});

export const syncPlanActionSchema = z.object({
  action: z.enum(["noop", "push", "pull", "conflict"]),
  resourceId: z.string().min(1),
  objectRef: z.string().min(1),
  localHash: z.string().min(1).optional(),
  peerHash: z.string().min(1).optional(),
  reason: z.string().min(1),
});

export const syncPlanResultSchema = z.object({
  manifest: syncResourceManifestSchema,
  actions: z.array(syncPlanActionSchema),
  changes: z.array(syncChangeSchema),
  conflicts: z.array(syncConflictSchema),
  nextCursor: syncCursorSchema.optional(),
  writes: z.literal(false),
});

export const remoteSecretLeaseSchema = z.object({
  leaseId: z.string().min(1),
  secretRef: z.string().min(1),
  actor: remoteActorContextSchema,
  action: z.string().min(1),
  resourceId: z.string().min(1),
  expiresAt: z.string().datetime(),
  plaintextReturned: z.literal(false),
  auditEventId: z.string().min(1),
});

export type RemoteSurfaceClassification = z.infer<typeof remoteSurfaceClassificationSchema>;
export type RemoteTrustMode = z.infer<typeof remoteTrustModeSchema>;
export type RemoteActorKind = z.infer<typeof remoteActorKindSchema>;
export type SyncAuthority = z.infer<typeof syncAuthoritySchema>;
export type SyncDriver = z.infer<typeof syncDriverSchema>;
export type SyncConflictPolicy = z.infer<typeof syncConflictPolicySchema>;
export type SyncCachePolicy = z.infer<typeof syncCachePolicySchema>;
export type NodeIdentity = z.infer<typeof nodeIdentitySchema>;
export type RemoteActorContext = z.infer<typeof remoteActorContextSchema>;
export type SyncResourceManifest = z.infer<typeof syncResourceManifestSchema>;
export type SyncCursor = z.infer<typeof syncCursorSchema>;
export type SyncChange = z.infer<typeof syncChangeSchema>;
export type SyncConflict = z.infer<typeof syncConflictSchema>;
export type SyncObjectSnapshot = z.infer<typeof syncObjectSnapshotSchema>;
export type SyncPlanAction = z.infer<typeof syncPlanActionSchema>;
export type SyncPlanResult = z.infer<typeof syncPlanResultSchema>;
export type RemoteSecretLease = z.infer<typeof remoteSecretLeaseSchema>;

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
  "sync.driveFiles",
  "sync.sqliteResources",
  "gateway.headlessAgentHost",
  "gateway.multiTenantAgentService",
  "mesh.resourceShare",
] as const;

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
  if (driver === "drive_files" || driver === "blobs") return "sync.driveFiles";
  if (driver === "sqlite_tables" || driver === "sqlite_partial") return "sync.sqliteResources";
  if (driver === "sessions") return "remote.chatGateway";
  if (driver === "search_index") return "remote.searchGateway";
  return "sync.sqliteResources";
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

function syncChangeId(parts: string[]): string {
  return `sync_change_${parts.join("_").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase()}`;
}

function syncConflictId(resourceId: string, objectRef: string): string {
  return `sync_conflict_${resourceId}_${objectRef}`.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();
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
