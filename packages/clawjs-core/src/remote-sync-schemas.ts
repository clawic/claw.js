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

export const nodeStateSchema = z.enum(["joining", "online", "offline", "stale", "degraded", "quarantined", "retired"]);

export const observedNodeLocatorSchema = z.object({
  kind: z.enum(["display_name", "hostname", "lan_ip", "public_ip", "tailscale", "relay", "iroh", "rendezvous", "other"]),
  value: z.string().min(1),
  observedAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  source: z.string().min(1).default("local_observation"),
  authority: z.literal(false).default(false),
});

export const nodeIdentitySchema = z.object({
  nodeId: z.string().min(1),
  displayName: z.string().min(1),
  hostKind: z.enum(["mac", "linux", "windows", "headless_server", "mobile_client", "browser_client", "participant"]),
  platform: z.string().min(1).default("unknown"),
  state: nodeStateSchema.default("offline"),
  trustLevel: z.enum(["fully_owned", "partially_trusted", "untrusted"]),
  trustModes: z.array(remoteTrustModeSchema).min(1),
  nodeFingerprint: z.string().min(16).default("fingerprint:unknown"),
  publicKeyRef: z.string().min(1),
  keyAlgorithm: z.enum(["ed25519", "p256", "rsa", "external_ref"]).default("external_ref"),
  createdAt: z.string().datetime().default("1970-01-01T00:00:00.000Z"),
  rotatedFrom: z.string().min(1).optional(),
  observedLocators: z.array(observedNodeLocatorSchema).default([]),
});

export const nodeKeyRotationReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  receiptId: z.string().min(1),
  nodeId: z.string().min(1),
  previousNodeFingerprint: z.string().min(16),
  proposedNodeFingerprint: z.string().min(16),
  rotationMethod: z.enum(["signed_old_key", "human_repair"]),
  oldKeySignatureRef: z.string().min(1).optional(),
  humanRepairingRef: z.string().min(1).optional(),
  accepted: z.boolean(),
  failClosed: z.boolean(),
  status: z.enum(["accepted", "rejected"]),
  reason: z.enum([
    "signed_old_key_verified",
    "human_repair_verified",
    "missing_old_key_signature",
    "missing_human_repair",
    "same_fingerprint",
  ]),
  createdAt: z.string().datetime(),
  auditEventId: z.string().min(1),
  writes: z.literal(false),
});

export const nodeReconnectReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  receiptId: z.string().min(1),
  nodeId: z.string().min(1),
  expectedNodeFingerprint: z.string().min(16),
  observedNodeFingerprint: z.string().min(16),
  previousState: nodeStateSchema,
  nextState: nodeStateSchema,
  locatorKind: observedNodeLocatorSchema.shape.kind.optional(),
  locatorValue: z.string().min(1).optional(),
  handshakeReceiptId: z.string().min(1),
  identityVerified: z.boolean(),
  proofOfPossessionVerified: z.boolean(),
  keyMismatch: z.boolean(),
  transportReachable: z.boolean(),
  remoteWorkAvailable: z.boolean(),
  failClosed: z.boolean(),
  reason: z.enum([
    "identity_verified_after_reconnect",
    "node_id_mismatch",
    "fingerprint_mismatch",
    "missing_private_key_proof",
    "transport_unreachable",
  ]),
  evaluatedAt: z.string().datetime(),
  auditEventId: z.string().min(1),
  writes: z.literal(false),
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

export const clusterResourceClassSchema = z.enum([
  "core_sqlite",
  "blob_file",
  "search_index",
  "metrics_logs",
]);

export const clusterStoragePolicyReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  receiptId: z.string().min(1),
  resourceClass: clusterResourceClassSchema,
  replicationClass: z.enum([
    "snapshot_backup_standby",
    "manifest_demand_residency",
    "rebuildable_or_explicit_shard",
    "node_local_bounded_rollup",
  ]),
  directCrossNodeFileRead: z.literal(false),
  blindReplication: z.literal(false),
  plaintextSecretsIncluded: z.literal(false),
  physicalDriverRequired: z.boolean(),
  policyRef: z.string().min(1),
  createdAt: z.string().datetime(),
  auditEventId: z.string().min(1),
  writes: z.literal(false),
});

export const clusterLogicalServiceAccessReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  receiptId: z.string().min(1),
  serviceId: z.string().min(1),
  routeId: z.string().min(1),
  resourceClass: clusterResourceClassSchema,
  requesterNodeId: z.string().min(1),
  authorityNodeId: z.string().min(1),
  accessPath: z.literal("logical_framework_service"),
  directDatabaseFileRead: z.literal(false),
  bounded: z.literal(true),
  createdAt: z.string().datetime(),
  auditEventId: z.string().min(1),
  writes: z.literal(false),
});

export const clusterCoordinatorRecordSchema = z.object({
  schemaVersion: z.literal(1),
  coordinatorId: z.string().min(1),
  clusterRootRef: z.string().min(1),
  coordinatorNodeId: z.string().min(1),
  standbyNodeIds: z.array(z.string().min(1)),
  epoch: z.number().int().nonnegative(),
  term: z.number().int().nonnegative(),
  status: z.enum(["active", "standby_pending", "promotion_pending", "external_pending"]),
  auditEventId: z.string().min(1),
  createdAt: z.string().datetime(),
  writes: z.literal(false),
});

export const clusterPolicySnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  snapshotId: z.string().min(1),
  coordinatorId: z.string().min(1),
  coordinatorAvailable: z.boolean(),
  lastKnownGood: z.literal(true),
  authorizedLocalWorkNodeIds: z.array(z.string().min(1)),
  permitsAuthorizedLocalWork: z.boolean(),
  failClosedForNewAuthority: z.literal(true),
  capturedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  auditEventId: z.string().min(1),
  writes: z.literal(false),
});

export const clusterAuthorityEvaluationSchema = z.object({
  schemaVersion: z.literal(1),
  evaluationId: z.string().min(1),
  coordinatorId: z.string().min(1),
  requesterNodeId: z.string().min(1),
  action: z.enum(["new_authority_decision", "authorized_local_work"]),
  coordinatorAvailable: z.boolean(),
  decision: z.enum(["allow", "deny"]),
  failClosed: z.boolean(),
  reason: z.enum([
    "coordinator_available",
    "coordinator_unavailable_new_authority_denied",
    "last_known_good_authorized_local_work",
    "last_known_good_missing_authorization",
  ]),
  evaluatedAt: z.string().datetime(),
  auditEventId: z.string().min(1),
  writes: z.literal(false),
});

export const clusterExportRestoreReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  receiptId: z.string().min(1),
  coordinatorId: z.string().min(1),
  mode: z.enum(["export_preview", "restore_preview"]),
  includesCoreSqliteSnapshot: z.literal(true),
  includesPolicySnapshot: z.literal(true),
  destructive: z.literal(false),
  physicalRestoreApplied: z.boolean(),
  externalPending: z.array(z.enum(["physical_authority_handoff"])),
  createdAt: z.string().datetime(),
  auditEventId: z.string().min(1),
  writes: z.literal(false),
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

export const governedBrowserSessionStateSchema = z.enum([
  "initializing",
  "active",
  "login_required",
  "handoff_required",
  "locked_for_handoff",
  "transferred_stale",
  "blocked",
  "closed",
]);

export const governedBrowserSubmitPolicySchema = z.enum(["no_submit", "submit_after_fill"]);
export const governedBrowserCredentialFieldKindSchema = z.enum(["password", "totp"]);
export const governedBrowserProfileHandoffModeSchema = z.enum(["closed_profile"]);

export const governedBrowserSessionResourceSchema = z.object({
  schemaVersion: z.literal(1),
  sessionId: z.string().min(1),
  profileId: z.string().min(1),
  ownerNodeId: z.string().min(1),
  assignedAgentId: z.string().min(1),
  allowedOrigins: z.array(z.string().url()).min(1),
  state: governedBrowserSessionStateSchema,
  profileRoot: z.literal(".claw/browser"),
  rawProfileAccessOwner: z.literal("signed_host_browser_broker"),
  agentRawDomAccess: z.literal(false),
  createdAt: z.string().datetime(),
  lastActivityAt: z.string().datetime(),
  writes: z.literal(false),
});

export const governedBrowserHumanNodePreferenceSchema = z.object({
  schemaVersion: z.literal(1),
  actorId: z.string().min(1),
  defaultHumanNodeId: z.string().min(1).optional(),
  explicitTargetNodeId: z.string().min(1).optional(),
  presenceCandidateNodeId: z.string().min(1).optional(),
  selectedNodeId: z.string().min(1).optional(),
  selectionReason: z.enum([
    "explicit_override",
    "manual_default",
    "presence_candidate",
    "missing_target",
  ]),
  configWinsOverPresence: z.literal(true),
  failClosed: z.boolean(),
  evaluatedAt: z.string().datetime(),
  writes: z.literal(false),
});

export const governedBrowserCredentialFillReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  receiptId: z.string().min(1),
  sessionId: z.string().min(1),
  profileId: z.string().min(1),
  ownerNodeId: z.string().min(1),
  assignedAgentId: z.string().min(1),
  secretRef: z.string().min(1),
  leaseId: z.string().min(1),
  fieldKind: governedBrowserCredentialFieldKindSchema,
  fieldTarget: z.string().min(1),
  allowedOrigin: z.string().url(),
  observedOrigin: z.string().url(),
  submitPolicy: governedBrowserSubmitPolicySchema,
  fillStatus: z.enum(["filled", "blocked", "handoff_required"]),
  submitted: z.boolean(),
  handoffRequired: z.boolean(),
  blockedReasons: z.array(z.enum([
    "origin_mismatch",
    "lease_expired",
    "field_hidden",
    "field_ambiguous",
    "unsafe_agent_browser_read",
    "missing_broker_isolation",
    "host_audit_missing",
    "untrusted_node",
    "unsupported_profile",
    "physical_broker_unavailable",
  ])),
  brokerIsolationVerified: z.boolean(),
  hostAuditPersisted: z.boolean(),
  plaintextReturned: z.literal(false),
  totpSeedReturned: z.literal(false),
  totpCodeReturned: z.literal(false),
  cookieMaterialReturned: z.literal(false),
  domFieldValueReturned: z.literal(false),
  createdAt: z.string().datetime(),
  auditEventId: z.string().min(1),
  writes: z.literal(false),
});

export const governedBrowserHumanHandoffReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  receiptId: z.string().min(1),
  sessionId: z.string().min(1),
  requestedByAgentId: z.string().min(1),
  targetNodeId: z.string().min(1).optional(),
  defaultHumanNodeUsed: z.boolean(),
  presenceSignalUsed: z.boolean(),
  status: z.enum(["opened", "blocked", "completed"]),
  blockedReasons: z.array(z.enum(["missing_human_node", "untrusted_node", "session_unavailable"])),
  handoffUrl: z.string().min(1).optional(),
  cookiesReturned: z.literal(false),
  secretsReturned: z.literal(false),
  createdAt: z.string().datetime(),
  auditEventId: z.string().min(1),
  writes: z.literal(false),
});

export const governedBrowserProfileHandoffReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  receiptId: z.string().min(1),
  sessionId: z.string().min(1),
  profileId: z.string().min(1),
  fromNodeId: z.string().min(1),
  toNodeId: z.string().min(1),
  mode: governedBrowserProfileHandoffModeSchema,
  sourceSessionClosed: z.boolean(),
  sourceProfileLocked: z.boolean(),
  encryptedForTargetNode: z.boolean(),
  targetNodeTrusted: z.boolean(),
  plaintextCookiesIncluded: z.literal(false),
  plaintextSecretsIncluded: z.literal(false),
  liveCookieSync: z.literal(false),
  sourceProfileStatus: z.enum(["transferred_stale", "retained_read_only", "blocked"]),
  importStatus: z.enum(["pending_import", "imported", "blocked"]),
  status: z.enum(["ready_for_import", "imported", "blocked"]),
  blockedReasons: z.array(z.enum([
    "source_session_open",
    "source_profile_unlocked",
    "target_node_untrusted",
    "missing_target_encryption",
    "live_sync_requested",
  ])),
  externalPending: z.array(z.enum(["physical_profile_export", "physical_profile_import"])),
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
  initiatorNodeFingerprint: z.string().min(16).default("fingerprint:unknown"),
  responderNodeId: z.string().min(1),
  responderNodeFingerprint: z.string().min(16).default("fingerprint:unknown"),
  expectedResponderFingerprint: z.string().min(16).default("fingerprint:unknown"),
  coordinatorNodeId: z.string().min(1),
  trustMode: remoteTrustModeSchema,
  challengeNonce: z.string().min(16),
  responseNonce: z.string().min(16),
  proofOfPossession: z.object({
    algorithm: z.enum(["ed25519", "p256", "rsa", "external_attestation"]),
    challengeSigned: z.literal(true),
    signatureRef: z.string().min(1),
  }).default({
    algorithm: "external_attestation",
    challengeSigned: true,
    signatureRef: "external:pending",
  }),
  contractVerified: z.literal(true),
  identityVerified: z.boolean().default(false),
  transportReachable: z.boolean().default(true),
  keyMismatch: z.boolean().default(false),
  discoveryAuthority: z.literal(false).default(false),
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
  subjectNodeFingerprint: z.string().min(16).default("fingerprint:unknown"),
  coordinatorNodeId: z.string().min(1),
  actor: remoteActorContextSchema,
  trustMode: remoteTrustModeSchema,
  transport: z.string().min(1),
  trustSubject: z.literal("node_identity_fingerprint").default("node_identity_fingerprint"),
  locatorAuthority: z.literal(false).default(false),
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
export type NodeKeyRotationReceipt = z.infer<typeof nodeKeyRotationReceiptSchema>;
export type NodeReconnectReceipt = z.infer<typeof nodeReconnectReceiptSchema>;
export type RemoteActorContext = z.infer<typeof remoteActorContextSchema>;
export type SyncResourceManifest = z.infer<typeof syncResourceManifestSchema>;
export type ClusterResourceClass = z.infer<typeof clusterResourceClassSchema>;
export type ClusterStoragePolicyReceipt = z.infer<typeof clusterStoragePolicyReceiptSchema>;
export type ClusterLogicalServiceAccessReceipt = z.infer<typeof clusterLogicalServiceAccessReceiptSchema>;
export type ClusterCoordinatorRecord = z.infer<typeof clusterCoordinatorRecordSchema>;
export type ClusterPolicySnapshot = z.infer<typeof clusterPolicySnapshotSchema>;
export type ClusterAuthorityEvaluation = z.infer<typeof clusterAuthorityEvaluationSchema>;
export type ClusterExportRestoreReceipt = z.infer<typeof clusterExportRestoreReceiptSchema>;
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
export type GovernedBrowserSessionState = z.infer<typeof governedBrowserSessionStateSchema>;
export type GovernedBrowserSubmitPolicy = z.infer<typeof governedBrowserSubmitPolicySchema>;
export type GovernedBrowserCredentialFieldKind = z.infer<typeof governedBrowserCredentialFieldKindSchema>;
export type GovernedBrowserProfileHandoffMode = z.infer<typeof governedBrowserProfileHandoffModeSchema>;
export type GovernedBrowserSessionResource = z.infer<typeof governedBrowserSessionResourceSchema>;
export type GovernedBrowserHumanNodePreference = z.infer<typeof governedBrowserHumanNodePreferenceSchema>;
export type GovernedBrowserCredentialFillReceipt = z.infer<typeof governedBrowserCredentialFillReceiptSchema>;
export type GovernedBrowserHumanHandoffReceipt = z.infer<typeof governedBrowserHumanHandoffReceiptSchema>;
export type GovernedBrowserProfileHandoffReceipt = z.infer<typeof governedBrowserProfileHandoffReceiptSchema>;
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
