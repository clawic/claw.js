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
