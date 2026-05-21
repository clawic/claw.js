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

export const remoteClientCacheSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  cacheEntryId: z.string().min(1),
  resourceId: z.string().min(1),
  objectRef: z.string().min(1),
  nodeId: z.string().min(1),
  clientId: z.string().min(1),
  contentHash: z.string().min(1),
  encrypted: z.literal(true),
  ttlSeconds: z.number().int().positive(),
  cachedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  storesSecrets: z.literal(false),
  storesAuthoritativeState: z.literal(false),
  plaintextIncluded: z.literal(false),
  physicalClientStorageVerified: z.boolean().default(false),
  externalPending: z.array(z.enum(["physical_client_storage"])).default(["physical_client_storage"]),
  auditEventId: z.string().min(1),
  writes: z.literal(false),
});

export const remoteCompatibilityClientKindSchema = z.enum([
  "ios",
  "android",
  "web",
  "desktop",
  "server",
  "unknown",
]);

export const remoteCompatibilityAdapterReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  adapterId: z.string().min(1),
  legacySurface: z.string().min(1),
  canonicalRouteId: z.string().min(1),
  clientKind: remoteCompatibilityClientKindSchema,
  status: z.enum(["active_adapter", "deprecated_adapter", "blocked"]),
  mapsToCanonical: z.literal(true),
  parallelApiIntroduced: z.literal(false),
  migrationRequired: z.boolean(),
  createdAt: z.string().datetime(),
  auditEventId: z.string().min(1),
  writes: z.literal(false),
});

export const remoteSurfaceClassificationReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  receiptId: z.string().min(1),
  capabilityId: z.string().min(1),
  classification: remoteSurfaceClassificationSchema,
  routeId: z.string().min(1).optional(),
  policyRef: z.string().min(1).optional(),
  testRefs: z.array(z.string().min(1)),
  remoteSafeReady: z.boolean(),
  missingEvidence: z.array(z.enum(["route", "policy", "tests"])),
  reason: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  auditEventId: z.string().min(1),
  writes: z.literal(false),
});

export const remoteExternalPendingRequirementSchema = z.object({
  schemaVersion: z.literal(1),
  requirementId: z.string().min(1),
  decisionId: z.string().min(1),
  category: z.enum([
    "transport",
    "device_trust",
    "peer_trust",
    "host_audit",
    "sync_driver",
    "authority_handoff",
    "client_storage",
    "provider",
    "deployment",
    "runtime",
    "billing",
    "e2e_validation",
  ]),
  sourceReceipt: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)).min(1),
  unblockCriteria: z.string().min(1),
  status: z.literal("external_pending"),
  writes: z.literal(false),
});

export const remoteExternalPendingRegisterSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime(),
  status: z.enum(["external_pending", "clear"]),
  requirements: z.array(remoteExternalPendingRequirementSchema),
  writes: z.literal(false),
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

export const syncDriverCatalogEntrySchema = z.object({
  schemaVersion: z.literal(1),
  driver: syncDriverSchema,
  routeId: z.string().min(1),
  resourceKinds: z.array(z.string().min(1)).min(1),
  lateralDomains: z.array(z.string().min(1)).min(1),
  manifestBacked: z.literal(true),
  changelogBacked: z.literal(true),
  authorityScoped: z.literal(true),
  partialResourceSupported: z.boolean(),
  conflictPolicy: syncConflictPolicySchema,
  cachePolicy: syncCachePolicySchema,
  secretPolicy: z.object({
    plaintextReplication: z.literal(false),
    secretRefsOnly: z.literal(true),
    brokerLeaseRequired: z.literal(true),
  }),
  physicalDriverRequired: z.literal(true),
  externalPendingRequirementId: z.literal("physical_sync_driver_application"),
  commands: z.array(z.string().min(1)).min(1),
  writes: z.literal(false),
});

export const syncDriverCatalogSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime(),
  status: z.enum(["complete", "incomplete"]),
  driverCount: z.number().int().nonnegative(),
  requiredDrivers: z.array(syncDriverSchema).min(1),
  coveredDrivers: z.array(syncDriverSchema),
  missingDrivers: z.array(syncDriverSchema),
  requiredRouteIds: z.array(z.string().min(1)).min(1),
  missingRouteIds: z.array(z.string().min(1)),
  entries: z.array(syncDriverCatalogEntrySchema).min(1),
  authorityModel: z.literal("per_resource"),
  conflictDefault: z.literal("detect_and_elevate"),
  physicalApplicationStatus: z.literal("external_pending"),
  writes: z.literal(false),
});

export const syncQueueEntrySchema = z.object({
  queueEntryId: z.string().min(1),
  resourceId: z.string().min(1),
  objectRef: z.string().min(1),
  direction: z.enum(["push", "pull", "conflict"]),
  status: z.enum(["queued", "applied", "blocked", "resolved", "failed", "skipped"]),
  changeId: z.string().min(1).optional(),
  conflictId: z.string().min(1).optional(),
  cursorBefore: syncCursorSchema.optional(),
  cursorAfter: syncCursorSchema.optional(),
  queuedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  reason: z.string().min(1),
  secretRefs: z.array(z.string().min(1)).default([]),
  writes: z.literal(false),
});

export const syncReconciliationResultSchema = z.object({
  manifest: syncResourceManifestSchema,
  queue: z.array(syncQueueEntrySchema),
  appliedChangeIds: z.array(z.string().min(1)),
  blockedConflictIds: z.array(z.string().min(1)),
  nextCursor: syncCursorSchema.optional(),
  writes: z.literal(false),
});

export const syncDriverApplicationReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  receiptId: z.string().min(1),
  resourceId: z.string().min(1),
  driver: syncDriverSchema,
  routeId: z.string().min(1),
  actor: remoteActorContextSchema,
  appliedChangeIds: z.array(z.string().min(1)),
  blockedConflictIds: z.array(z.string().min(1)),
  status: z.enum(["signed_pending_driver_application", "applied", "blocked"]),
  physicalDriverApplied: z.boolean(),
  externalPending: z.array(z.enum(["physical_sync_driver_application"])),
  createdAt: z.string().datetime(),
  auditEventId: z.string().min(1),
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

export const remoteSecretProviderReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  receiptId: z.string().min(1),
  leaseId: z.string().min(1),
  secretRef: z.string().min(1),
  providerId: z.string().min(1),
  credentialBindingId: z.string().min(1),
  operationId: z.string().min(1),
  actor: remoteActorContextSchema,
  resourceId: z.string().min(1),
  providerAccessVerified: z.boolean(),
  plaintextReturned: z.literal(false),
  externalPending: z.array(z.enum(["provider_secret_retrieval"])),
  createdAt: z.string().datetime(),
  auditEventId: z.string().min(1),
  writes: z.literal(false),
});

export const remoteAccessGrantPlaneSchema = z.enum([
  "agent",
  "assignment",
  "execution_profile",
  "connector",
  "host",
  "run_scope",
  "remote_classification",
  "transport_trust",
  "secret_broker",
]);

export const remoteAccessGrantSchema = z.object({
  id: z.string().min(1),
  plane: remoteAccessGrantPlaneSchema,
  resourceType: z.string().min(1),
  resourceId: z.string().min(1).optional(),
  action: z.string().min(1),
  effect: z.enum(["allow", "deny"]).default("allow"),
  expiresAt: z.string().datetime().optional(),
  requiresBrokerLease: z.boolean().default(false),
});

export const remoteAccessRequestSchema = z.object({
  actor: remoteActorContextSchema,
  routeId: z.string().min(1),
  resourceType: z.string().min(1),
  resourceId: z.string().min(1).optional(),
  action: z.string().min(1),
  classification: remoteSurfaceClassificationSchema,
  trustMode: remoteTrustModeSchema,
  transport: z.string().min(1),
  secretRefs: z.array(z.string().min(1)).default([]),
  plaintextSecretRequested: z.boolean().default(false),
  now: z.string().datetime().optional(),
});

export const remoteAccessDecisionSchema = z.object({
  allowed: z.boolean(),
  reasons: z.array(z.string()),
  requiredBrokerLease: z.boolean(),
  audit: z.object({
    eventType: z.literal("remote.access.evaluated"),
    actorId: z.string().min(1),
    actorKind: remoteActorKindSchema,
    nodeId: z.string().min(1),
    routeId: z.string().min(1),
    resourceType: z.string().min(1),
    resourceId: z.string().min(1).optional(),
    action: z.string().min(1),
    trustMode: remoteTrustModeSchema,
    classification: remoteSurfaceClassificationSchema,
    decision: z.enum(["allow", "deny"]),
  }),
});

export const remoteGatewayAuditReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  receiptId: z.string().min(1),
  sourceEventType: z.enum([
    "remote.access.evaluated",
    "remote.agent_service.evaluated",
    "gateway.agent_service.execution",
  ]),
  routeId: z.string().min(1),
  actor: remoteActorContextSchema,
  resourceType: z.string().min(1),
  resourceId: z.string().min(1).optional(),
  action: z.string().min(1),
  decision: z.enum(["allow", "deny"]),
  hostAuditStore: z.literal("signed_host_audit"),
  signedHostAuditPersisted: z.boolean(),
  externalPending: z.array(z.enum(["signed_host_audit_persistence"])),
  createdAt: z.string().datetime(),
  auditEventId: z.string().min(1),
  writes: z.literal(false),
});

export const remoteOfflineCommandResultSchema = z.object({
  routeId: z.string().min(1),
  actor: remoteActorContextSchema,
  status: z.literal("failed_fast"),
  reason: z.enum(["connector_offline", "node_unreachable", "transport_unavailable"]),
  enqueued: z.literal(false),
  retryable: z.literal(true),
  evaluatedAt: z.string().datetime(),
  writes: z.literal(false),
});

export const remoteTransportHandshakeReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  receiptId: z.string().min(1),
  transport: z.string().min(1),
  adapter: z.string().min(1),
  initiatorNodeId: z.string().min(1),
  responderNodeId: z.string().min(1),
  coordinatorNodeId: z.string().min(1),
  trustMode: remoteTrustModeSchema,
  challengeNonce: z.string().min(16),
  responseNonce: z.string().min(16),
  contractVerified: z.literal(true),
  physicalTransportVerified: z.boolean(),
  externalPending: z.array(z.enum(["physical_iroh_handshake", "device_trust_acceptance"])),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  auditEventId: z.string().min(1),
  writes: z.literal(false),
});

export const nodeTrustDecisionSchema = z.object({
  schemaVersion: z.literal(1),
  decisionId: z.string().min(1),
  subjectNodeId: z.string().min(1),
  coordinatorNodeId: z.string().min(1),
  actor: remoteActorContextSchema,
  trustMode: remoteTrustModeSchema,
  transport: z.string().min(1),
  effect: z.enum(["allow", "deny", "revoke"]),
  status: z.enum(["signed_pending_physical_acceptance", "active", "denied", "revoked"]),
  grantedRouteIds: z.array(z.string().min(1)),
  physicalAcceptanceVerified: z.boolean(),
  externalPending: z.array(z.enum(["device_trust_acceptance", "physical_iroh_handshake"])),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  auditEventId: z.string().min(1),
  writes: z.literal(false),
});

export const gatewayDeploymentManifestSchema = z.object({
  schemaVersion: z.literal(1),
  deploymentId: z.string().min(1),
  deploymentKind: z.enum(["self_hosted", "hosted"]),
  gatewayNodeId: z.string().min(1),
  coordinatorNodeId: z.string().min(1),
  bindAddress: z.string().min(1),
  publicBaseUrl: z.string().min(1).optional(),
  contractRouteIds: z.array(z.string().min(1)).min(1),
  hostedSelfHostedParity: z.literal(true),
  conformanceStatus: z.enum(["baseline_registered", "external_pending"]),
  physicalDeploymentVerified: z.boolean(),
  externalPending: z.array(z.enum(["self_hosted_deployment", "hosted_deployment"])),
  createdAt: z.string().datetime(),
  auditEventId: z.string().min(1),
  writes: z.literal(false),
});

export const meshShareActionSchema = z.enum([
  "read",
  "sync",
  "search",
  "execute",
  "lease_secret",
]);

export const meshInvitationSchema = z.object({
  schemaVersion: z.literal(1),
  invitationId: z.string().min(1),
  issuerMeshId: z.string().min(1),
  coordinatorNodeId: z.string().min(1),
  recipientMeshId: z.string().min(1).optional(),
  inviteePublicKeyRef: z.string().min(1).optional(),
  trustMode: remoteTrustModeSchema,
  transport: z.string().min(1),
  status: z.enum(["pending", "accepted", "revoked", "expired"]),
  allowedResourceIds: z.array(z.string().min(1)).min(1),
  allowedActions: z.array(meshShareActionSchema).min(1),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  writes: z.literal(false),
});

export const meshInvitationAcceptanceSchema = z.object({
  schemaVersion: z.literal(1),
  acceptanceId: z.string().min(1),
  invitationId: z.string().min(1),
  issuerMeshId: z.string().min(1),
  accepterMeshId: z.string().min(1),
  coordinatorNodeId: z.string().min(1),
  actor: remoteActorContextSchema,
  trustMode: remoteTrustModeSchema,
  transport: z.string().min(1),
  acceptedResourceIds: z.array(z.string().min(1)).min(1),
  acceptedActions: z.array(meshShareActionSchema).min(1),
  status: z.enum(["signed_pending_peer_trust", "active", "blocked"]),
  physicalPeerTrustVerified: z.boolean(),
  externalPending: z.array(z.enum(["physical_peer_trust", "device_trust_acceptance"])),
  acceptedAt: z.string().datetime(),
  auditEventId: z.string().min(1),
  writes: z.literal(false),
});

export const meshResourceShareSchema = z.object({
  schemaVersion: z.literal(1),
  shareId: z.string().min(1),
  invitationId: z.string().min(1),
  fromMeshId: z.string().min(1),
  toMeshId: z.string().min(1),
  resourceId: z.string().min(1),
  resourceKind: z.string().min(1),
  routeId: z.string().min(1),
  actions: z.array(meshShareActionSchema).min(1),
  syncManifest: syncResourceManifestSchema,
  secretRefs: z.array(z.string().min(1)).default([]),
  plaintextSecrets: z.literal(false),
  status: z.enum(["proposed", "active", "revoked", "expired"]),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  auditEventId: z.string().min(1),
  writes: z.literal(false),
});

export const meshRevocationSchema = z.object({
  schemaVersion: z.literal(1),
  revocationId: z.string().min(1),
  targetType: z.enum(["invitation", "share", "node_trust"]),
  targetId: z.string().min(1),
  actor: remoteActorContextSchema,
  reason: z.string().min(1),
  revokedAt: z.string().datetime(),
  cascadeSyncQueues: z.literal(true),
  auditEventId: z.string().min(1),
  writes: z.literal(false),
});

export const remoteAgentServiceAssignmentSchema = z.object({
  schemaVersion: z.literal(1),
  tenantId: z.string().min(1),
  agentId: z.string().min(1),
  assignmentId: z.string().min(1),
  status: z.enum(["active", "paused", "revoked"]),
  routeIds: z.array(z.string().min(1)).min(1),
  budgetId: z.string().min(1),
  billingAccountId: z.string().min(1),
  isolationKey: z.string().min(1),
  auditRequired: z.literal(true),
});

export const remoteAgentServiceBudgetSchema = z.object({
  budgetId: z.string().min(1),
  tenantId: z.string().min(1),
  billingAccountId: z.string().min(1),
  limitCents: z.number().int().nonnegative(),
  usedCents: z.number().int().nonnegative(),
  billingMeterId: z.string().min(1),
});

export const remoteAgentServiceRequestSchema = z.object({
  tenantId: z.string().min(1),
  agentId: z.string().min(1),
  assignmentId: z.string().min(1),
  routeId: z.string().min(1),
  estimatedCostCents: z.number().int().nonnegative().default(0),
  now: z.string().datetime(),
});

export const remoteAgentServiceDecisionSchema = z.object({
  allowed: z.boolean(),
  reasons: z.array(z.string()),
  tenantId: z.string().min(1),
  agentId: z.string().min(1),
  assignmentId: z.string().min(1),
  billingAccountId: z.string().min(1).optional(),
  isolationKey: z.string().min(1).optional(),
  audit: z.object({
    eventType: z.literal("remote.agent_service.evaluated"),
    tenantId: z.string().min(1),
    agentId: z.string().min(1),
    assignmentId: z.string().min(1),
    routeId: z.string().min(1),
    decision: z.enum(["allow", "deny"]),
  }),
  writes: z.literal(false),
});

export const remoteAgentServiceExecutionReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  receiptId: z.string().min(1),
  tenantId: z.string().min(1),
  agentId: z.string().min(1),
  assignmentId: z.string().min(1),
  routeId: z.string().min(1),
  billingAccountId: z.string().min(1),
  budgetId: z.string().min(1),
  billingMeterId: z.string().min(1),
  estimatedCostCents: z.number().int().nonnegative(),
  isolationKey: z.string().min(1),
  decisionAllowed: z.boolean(),
  status: z.enum(["signed_pending_runtime", "executed", "denied"]),
  runtimeExecutionVerified: z.boolean(),
  billingMeterPersisted: z.boolean(),
  externalPending: z.array(z.enum(["agent_runtime_execution", "billing_meter_persistence"])),
  createdAt: z.string().datetime(),
  auditEventId: z.string().min(1),
  writes: z.literal(false),
});

export type RemoteSurfaceClassification = z.infer<typeof remoteSurfaceClassificationSchema>;
export type RemoteTrustMode = z.infer<typeof remoteTrustModeSchema>;
export type RemoteActorKind = z.infer<typeof remoteActorKindSchema>;
export type SyncAuthority = z.infer<typeof syncAuthoritySchema>;
export type SyncDriver = z.infer<typeof syncDriverSchema>;
export type SyncConflictPolicy = z.infer<typeof syncConflictPolicySchema>;
export type SyncCachePolicy = z.infer<typeof syncCachePolicySchema>;
export type RemoteClientCacheSnapshot = z.infer<typeof remoteClientCacheSnapshotSchema>;
export type RemoteCompatibilityClientKind = z.infer<typeof remoteCompatibilityClientKindSchema>;
export type RemoteCompatibilityAdapterReceipt = z.infer<typeof remoteCompatibilityAdapterReceiptSchema>;
export type RemoteSurfaceClassificationReceipt = z.infer<typeof remoteSurfaceClassificationReceiptSchema>;
export type RemoteExternalPendingRequirement = z.infer<typeof remoteExternalPendingRequirementSchema>;
export type RemoteExternalPendingRegister = z.infer<typeof remoteExternalPendingRegisterSchema>;
export type NodeIdentity = z.infer<typeof nodeIdentitySchema>;
export type RemoteActorContext = z.infer<typeof remoteActorContextSchema>;
export type SyncResourceManifest = z.infer<typeof syncResourceManifestSchema>;
export type SyncCursor = z.infer<typeof syncCursorSchema>;
export type SyncChange = z.infer<typeof syncChangeSchema>;
export type SyncConflict = z.infer<typeof syncConflictSchema>;
export type SyncObjectSnapshot = z.infer<typeof syncObjectSnapshotSchema>;
export type SyncPlanAction = z.infer<typeof syncPlanActionSchema>;
export type SyncPlanResult = z.infer<typeof syncPlanResultSchema>;
export type SyncDriverCatalogEntry = z.infer<typeof syncDriverCatalogEntrySchema>;
export type SyncDriverCatalog = z.infer<typeof syncDriverCatalogSchema>;
export type SyncQueueEntry = z.infer<typeof syncQueueEntrySchema>;
export type SyncReconciliationResult = z.infer<typeof syncReconciliationResultSchema>;
export type SyncDriverApplicationReceipt = z.infer<typeof syncDriverApplicationReceiptSchema>;
export type RemoteSecretLease = z.infer<typeof remoteSecretLeaseSchema>;
export type RemoteSecretProviderReceipt = z.infer<typeof remoteSecretProviderReceiptSchema>;
export type RemoteAccessGrantPlane = z.infer<typeof remoteAccessGrantPlaneSchema>;
export type RemoteAccessGrant = z.infer<typeof remoteAccessGrantSchema>;
export type RemoteAccessRequest = z.infer<typeof remoteAccessRequestSchema>;
export type RemoteAccessDecision = z.infer<typeof remoteAccessDecisionSchema>;
export type RemoteGatewayAuditReceipt = z.infer<typeof remoteGatewayAuditReceiptSchema>;
export type RemoteOfflineCommandResult = z.infer<typeof remoteOfflineCommandResultSchema>;
export type RemoteTransportHandshakeReceipt = z.infer<typeof remoteTransportHandshakeReceiptSchema>;
export type NodeTrustDecision = z.infer<typeof nodeTrustDecisionSchema>;
export type GatewayDeploymentManifest = z.infer<typeof gatewayDeploymentManifestSchema>;
export type MeshShareAction = z.infer<typeof meshShareActionSchema>;
export type MeshInvitation = z.infer<typeof meshInvitationSchema>;
export type MeshInvitationAcceptance = z.infer<typeof meshInvitationAcceptanceSchema>;
export type MeshResourceShare = z.infer<typeof meshResourceShareSchema>;
export type MeshRevocation = z.infer<typeof meshRevocationSchema>;
export type RemoteAgentServiceAssignment = z.infer<typeof remoteAgentServiceAssignmentSchema>;
export type RemoteAgentServiceBudget = z.infer<typeof remoteAgentServiceBudgetSchema>;
export type RemoteAgentServiceRequest = z.infer<typeof remoteAgentServiceRequestSchema>;
export type RemoteAgentServiceDecision = z.infer<typeof remoteAgentServiceDecisionSchema>;
export type RemoteAgentServiceExecutionReceipt = z.infer<typeof remoteAgentServiceExecutionReceiptSchema>;
