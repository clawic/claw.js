import { z } from "zod";

import {
  resourceKindSchema,
  resourceRecordSchema,
  resourceStatusSchema,
} from "./cli-guidance.ts";
import { CUSTOM_APP_REDACTION_POLICY_ID } from "./custom-app-redaction-policy.ts";

export const CUSTOM_APP_SDK_SCHEMA_REFS = {
  searchQuery: "claw.search.query.v1",
  searchResults: "claw.search.results.v1",
  dbQuery: "claw.db.query.v1",
  dbRecords: "claw.db.records.v1",
  resourcesList: "claw.resources.list.v1",
  resourcesListResult: "claw.resources.listResult.v1",
  resourcesRead: "claw.resources.read.v1",
  resourcesPayload: "claw.resources.payload.v1",
  nodesInventoryRequest: "claw.nodes.inventoryRequest.v1",
  nodesInventory: "claw.nodes.inventory.v1",
  resourcesLocationRequest: "claw.resources.locationRequest.v1",
  resourcesLocation: "claw.resources.location.v1",
  localForgeInventoryRequest: "claw.localForge.inventoryRequest.v1",
  localForgeInventory: "claw.localForge.inventory.v1",
  clusterControlPlaneInspectRequest: "claw.cluster.controlPlaneInspectRequest.v1",
  clusterControlPlaneInspect: "claw.cluster.controlPlaneInspect.v1",
  systemTelemetrySnapshotRequest: "claw.system.telemetry.snapshot.request.v1",
  systemTelemetrySnapshot: "claw.system.telemetry.snapshot.v1",
  systemTelemetryHistoryRequest: "claw.system.telemetry.history.request.v1",
  systemTelemetryHistory: "claw.system.telemetry.history.v1",
  systemTelemetryMetricsRequest: "claw.system.telemetry.metrics.request.v1",
  systemTelemetryMetrics: "claw.system.telemetry.metrics.v1",
  systemTelemetryWidgetsRequest: "claw.system.telemetry.widgets.request.v1",
  systemTelemetryWidgets: "claw.system.telemetry.widgets.v1",
  systemTelemetryProvidersRequest: "claw.system.telemetry.providers.request.v1",
  systemTelemetryProviders: "claw.system.telemetry.providers.v1",
  systemTelemetryControlPlanRequest: "claw.system.telemetry.controlPlan.request.v1",
  systemTelemetryControlPlan: "claw.system.telemetry.controlPlan.v1",
  jobsList: "claw.jobs.list.v1",
  jobsListResult: "claw.jobs.listResult.v1",
  jobsGet: "claw.jobs.get.v1",
  jobsDetail: "claw.jobs.detail.v1",
  jobsEvents: "claw.jobs.events.v1",
  jobsEventsResult: "claw.jobs.eventsResult.v1",
  jobsStream: "claw.jobs.stream.v1",
  jobsStreamResult: "claw.jobs.streamResult.v1",
  jobsStart: "claw.jobs.start.v1",
  jobsStartResult: "claw.jobs.startResult.v1",
  jobsCancel: "claw.jobs.cancel.v1",
  jobsCancelResult: "claw.jobs.cancelResult.v1",
  actionsInvoke: "claw.actions.invoke.v1",
  actionsReceipt: "claw.actions.receipt.v1",
  secretsBroker: "claw.secrets.broker.v1",
  secretsReceipt: "claw.secrets.receipt.v1",
  macActionRequest: "claw.mac.actionRequest.v1",
  macActionPlan: "claw.mac.actionPlan.v1",
  iotAction: "claw.iot.action.v1",
  iotActionResult: "claw.iot.actionResult.v1",
  requestCancel: "claw.customApp.request.cancel.v1",
  requestProgress: "claw.customApp.request.progress.v1",
  requestPartial: "claw.customApp.request.partial.v1",
} as const;

export type CustomAppSDKSchemaRef = typeof CUSTOM_APP_SDK_SCHEMA_REFS[keyof typeof CUSTOM_APP_SDK_SCHEMA_REFS];

const stringArraySchema = z.array(z.string().min(1)).default([]);
const customAppSDKCollectionIdSchema = z.string().min(1).max(128)
  .regex(/^[A-Za-z][A-Za-z0-9_.:-]*$/)
  .refine((value) => !/^sqlite_/i.test(value));

export const customAppSDKRequestCancelSchema = z.object({
  requestId: z.string().min(1),
}).strict();

export const customAppSDKRequestProgressSchema = z.object({
  message: z.string().min(1),
  progress: z.number().min(0).max(1).optional(),
  partialCount: z.number().int().min(0).optional(),
}).strict();

export const customAppSDKFacetBucketSchema = z.object({
  value: z.string(),
  count: z.number().int().min(0),
}).strict();

export const customAppSDKBridgeRecordSchema = z.object({
  id: z.string().min(1),
  collection: customAppSDKCollectionIdSchema,
  title: z.string().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  data: z.record(z.unknown()),
  redactedFields: z.array(z.string()),
  redactionPolicy: z.literal(CUSTOM_APP_REDACTION_POLICY_ID),
}).strict();

export const customAppSDKDBFilterOperatorSchema = z.object({
  neq: z.unknown().optional(),
  isNull: z.boolean().optional(),
}).strict();

export const customAppSDKDBQuerySchema = z.object({
  collection: customAppSDKCollectionIdSchema,
  filter: z.record(z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    customAppSDKDBFilterOperatorSchema,
  ])).default({}),
  search: z.string().optional(),
  query: z.string().optional(),
  sort: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).max(10_000).optional(),
  cursor: z.string().min(1).optional(),
  facets: stringArraySchema,
}).strict();

export const customAppSDKDBRecordsSchema = z.object({
  collection: customAppSDKCollectionIdSchema,
  items: z.array(customAppSDKBridgeRecordSchema),
  limit: z.number().int().min(1).max(100),
  offset: z.number().int().min(0),
  total: z.number().int().min(0).optional(),
  nextCursor: z.string().nullable(),
  facets: z.record(z.array(customAppSDKFacetBucketSchema)),
  source: z.literal("db.query"),
}).strict();

export const customAppSDKSearchQuerySchema = z.object({
  query: z.string().min(1),
  collections: z.array(customAppSDKCollectionIdSchema).default([]),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).max(10_000).optional(),
  cursor: z.string().min(1).optional(),
  facets: stringArraySchema,
}).strict();

export const customAppSDKSearchResultsSchema = z.object({
  query: z.string().min(1),
  collections: z.array(customAppSDKCollectionIdSchema),
  items: z.array(customAppSDKBridgeRecordSchema),
  limit: z.number().int().min(1).max(100),
  offset: z.number().int().min(0),
  nextCursor: z.string().nullable(),
  facets: z.record(z.array(customAppSDKFacetBucketSchema)),
  source: z.literal("search.query"),
}).strict();

export const customAppSDKResourcesListSchema = z.object({
  status: resourceStatusSchema.nullish(),
  kind: resourceKindSchema.nullish(),
}).strict();

export const customAppSDKResourcesListResultSchema = z.object({
  items: z.array(resourceRecordSchema),
  source: z.literal("resources.list"),
}).strict();

export const customAppSDKResourcesReadSchema = z.object({
  id: z.string().regex(/^res_[a-z0-9]+$/),
  maxBytes: z.number().int().min(1).max(256_000).optional(),
}).strict();

export const customAppSDKResourcesPayloadSchema = z.object({
  resource: resourceRecordSchema,
  content: z.string().optional(),
  truncated: z.boolean(),
  error: z.string().optional(),
  redactionPolicy: z.literal(CUSTOM_APP_REDACTION_POLICY_ID),
  source: z.literal("resources.read"),
}).strict();

export const customAppSDKNodesInventoryRequestSchema = z.object({
  nodeId: z.string().min(1).optional(),
  includeLocators: z.boolean().default(true),
  includeOperationalSummary: z.boolean().default(true),
}).strict();

export const customAppSDKNodesInventorySchema = z.object({
  source: z.literal("nodes.inventory"),
  nodes: z.array(z.object({
    nodeId: z.string().min(1),
    displayName: z.string().min(1).optional(),
    nodeFingerprint: z.string().min(16).optional(),
    state: z.string().min(1).optional(),
    observedLocators: z.array(z.object({
      kind: z.string().min(1),
      value: z.string().min(1),
      authority: z.literal(false),
    }).passthrough()).default([]),
    operationalSummary: z.object({
      bounded: z.literal(true),
      startsPolling: z.literal(false),
      grantsAuthority: z.literal(false),
    }).passthrough().optional(),
  }).passthrough()),
  redactionPolicy: z.literal(CUSTOM_APP_REDACTION_POLICY_ID),
}).strict();

export const customAppSDKResourcesLocationRequestSchema = z.object({
  resourceId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  includeRisk: z.boolean().default(false),
}).strict();

export const customAppSDKResourcesLocationSchema = z.object({
  source: z.literal("resources.location"),
  resources: z.array(z.object({
    id: z.string().min(1),
    kind: z.string().min(1),
    authority: z.string().min(1).optional(),
    locators: z.array(z.object({
      kind: z.string().min(1),
      value: z.string().min(1),
      authority: z.boolean(),
    }).passthrough()).default([]),
    risk: z.unknown().optional(),
  }).passthrough()),
  redactionPolicy: z.literal(CUSTOM_APP_REDACTION_POLICY_ID),
}).strict();

export const customAppSDKLocalForgeInventoryRequestSchema = z.object({
  projectId: z.string().min(1).optional(),
  includeMergePlans: z.boolean().default(true),
  includeRecoveries: z.boolean().default(true),
}).strict();

export const customAppSDKLocalForgeInventorySchema = z.object({
  source: z.literal("localForge.inventory"),
  worktrees: z.array(z.unknown()),
  claims: z.array(z.unknown()),
  snapshots: z.array(z.unknown()),
  reviews: z.array(z.unknown()),
  mergePlans: z.array(z.unknown()).default([]),
  recoveries: z.array(z.unknown()),
  staleEvaluation: z.unknown().optional(),
  redactionPolicy: z.literal(CUSTOM_APP_REDACTION_POLICY_ID),
}).strict();

export const customAppSDKClusterControlPlaneInspectRequestSchema = z.object({
  coordinatorId: z.string().min(1).optional(),
  includeStoragePolicies: z.boolean().default(true),
  includePolicySnapshots: z.boolean().default(true),
}).strict();

export const customAppSDKClusterControlPlaneInspectSchema = z.object({
  source: z.literal("cluster.controlPlane.inspect"),
  coordinatorRecords: z.array(z.unknown()).default([]),
  storagePolicies: z.array(z.object({
    resourceClass: z.string().min(1),
    replicationClass: z.string().min(1),
    directCrossNodeFileRead: z.literal(false),
    blindReplication: z.literal(false),
  }).passthrough()).default([]),
  logicalServiceAccess: z.array(z.object({
    accessPath: z.literal("logical_framework_service"),
    directDatabaseFileRead: z.literal(false),
    bounded: z.literal(true),
  }).passthrough()).default([]),
  policySnapshots: z.array(z.unknown()).default([]),
  authorityEvaluations: z.array(z.unknown()).default([]),
  exportRestoreReceipts: z.array(z.unknown()).default([]),
  redactionPolicy: z.literal(CUSTOM_APP_REDACTION_POLICY_ID),
}).strict();

const systemTelemetryMetricValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const systemTelemetryUnitSchema = z.enum([
  "count",
  "load",
  "percent",
  "bytes",
  "bytes_per_second",
  "milliseconds",
  "minutes",
  "seconds",
  "celsius",
  "rpm",
  "volts",
  "amps",
  "watts",
  "hertz",
  "lux",
  "boolean",
  "state",
  "string",
]);
const systemTelemetryAvailabilitySchema = z.enum(["available", "unavailable", "external_pending", "permission_required", "host_required"]);
const systemTelemetrySourceConfidenceSchema = z.enum(["official", "derived", "experimental", "provider"]);
const systemTelemetryTagsSchema = z.record(z.string());

export const customAppSDKSystemTelemetrySnapshotRequestSchema = z.object({
  source: z.literal("local").default("local"),
  metricKeys: z.array(z.string().min(1)).max(100).optional(),
  includeUnavailable: z.boolean().default(true),
}).strict();

export const customAppSDKSystemTelemetrySampleSchema = z.object({
  key: z.string().min(1),
  value: systemTelemetryMetricValueSchema,
  unit: systemTelemetryUnitSchema,
  capturedAt: z.string().min(1),
  availability: systemTelemetryAvailabilitySchema,
  source: z.object({
    adapter: z.enum(["node", "signed_host", "provider", "fixture"]),
    confidence: systemTelemetrySourceConfidenceSchema,
    detail: z.string().min(1).optional(),
  }).strict(),
  quality: z.enum(["ok", "degraded", "unsupported"]).optional(),
  tags: systemTelemetryTagsSchema.optional(),
}).strict();

export const customAppSDKSystemTelemetrySnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().min(1),
  host: z.object({
    platform: z.string().min(1),
    arch: z.string().min(1),
    id: z.literal("local"),
  }).strict(),
  policy: z.object({
    defaultAgentAccess: z.literal("safe_read"),
    sensitiveRequiresGrant: z.literal(true),
    controlsRequireSignedHostBroker: z.literal(true),
  }).strict(),
  samples: z.array(customAppSDKSystemTelemetrySampleSchema),
  unavailableMetrics: z.array(z.string().min(1)),
  source: z.literal("system.telemetry.snapshot"),
  redactionPolicy: z.literal(CUSTOM_APP_REDACTION_POLICY_ID),
}).strict();

export const customAppSDKSystemTelemetryHistoryRequestSchema = z.object({
  metricKey: z.string().min(1),
  range: z.enum(["1h", "24h"]).default("1h"),
}).strict();

export const customAppSDKSystemTelemetryHistorySchema = z.object({
  metricKey: z.string().min(1),
  rangeMs: z.union([z.literal(3_600_000), z.literal(86_400_000)]),
  retention: z.object({
    store: z.literal("monitor.sqlite"),
    status: z.enum(["recorded", "empty"]),
  }).passthrough(),
  samples: z.array(z.object({
    metricKey: z.string().min(1),
    value: systemTelemetryMetricValueSchema.optional(),
    unit: systemTelemetryUnitSchema.optional(),
    capturedAt: z.number().optional(),
    tags: systemTelemetryTagsSchema.optional(),
  }).passthrough()),
  rollups: z.array(z.object({
    metricKey: z.string().min(1),
    bucketMs: z.number().int().positive().optional(),
    count: z.number().int().nonnegative().optional(),
  }).passthrough()),
  incidents: z.array(z.object({
    metricKey: z.string().min(1),
    ruleId: z.string().min(1).optional(),
    status: z.string().min(1).optional(),
  }).passthrough()),
  chart: z.object({
    kind: z.literal("line"),
    source: z.enum(["metric_samples", "metric_rollups", "empty"]),
    empty: z.boolean(),
    points: z.array(z.object({
      value: z.number(),
    }).passthrough()),
  }).strict(),
  render: z.object({
    kind: z.literal("ascii_sparkline"),
    source: z.enum(["metric_samples", "metric_rollups", "empty"]),
    empty: z.boolean(),
    line: z.string(),
  }).passthrough(),
  source: z.literal("system.telemetry.history"),
  redactionPolicy: z.literal(CUSTOM_APP_REDACTION_POLICY_ID),
}).strict();

const systemTelemetryMetricDefinitionSchema = z.object({
  key: z.string().min(1),
  family: z.string().min(1),
  label: z.string().min(1),
  unit: systemTelemetryUnitSchema,
  privacyTier: z.string().min(1),
  sourceConfidence: systemTelemetrySourceConfidenceSchema,
  samplingCost: z.enum(["low", "medium", "high"]),
  support: z.array(z.enum(["snapshot", "stream", "history"])),
  availability: systemTelemetryAvailabilitySchema,
  requiresGrant: z.string().min(1).optional(),
  description: z.string().min(1),
}).strict();

export const customAppSDKSystemTelemetryMetricsRequestSchema = z.object({
  family: z.string().min(1).optional(),
  includeUnavailable: z.boolean().default(true),
}).strict();

export const customAppSDKSystemTelemetryMetricsSchema = z.object({
  metrics: z.array(systemTelemetryMetricDefinitionSchema),
  source: z.literal("system.telemetry.metrics"),
  redactionPolicy: z.literal(CUSTOM_APP_REDACTION_POLICY_ID),
}).strict();

const systemTelemetryWidgetDefinitionSchema = z.object({
  id: z.string().min(1),
  metricKey: z.string().min(1),
  title: z.string().min(1),
  presentation: z.enum(["text", "icon", "gauge", "sparkline", "threshold", "dropdown"]),
  placement: z.enum(["menubar", "combined_panel", "both"]),
  enabledByDefault: z.boolean(),
}).strict();

export const customAppSDKSystemTelemetryWidgetsRequestSchema = z.object({
  placement: z.enum(["menubar", "combined_panel", "both"]).optional(),
  includeDisabled: z.boolean().default(true),
}).strict();

export const customAppSDKSystemTelemetryWidgetsSchema = z.object({
  widgets: z.array(systemTelemetryWidgetDefinitionSchema),
  source: z.literal("system.telemetry.widgets"),
  redactionPolicy: z.literal(CUSTOM_APP_REDACTION_POLICY_ID),
}).strict();

const systemTelemetryProviderSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  label: z.string().min(1),
  mode: z.enum(["mock", "offline", "live"]),
  status: z.enum(["ready", "disabled", "external_pending"]),
  metricKeys: z.array(z.string().min(1)),
  widgetIds: z.array(z.string().min(1)),
  capabilities: z.array(z.enum(["snapshot", "stream", "history"])),
  defaultEnabled: z.boolean(),
  privacyTier: z.string().min(1),
  requiresGrant: z.string().min(1).optional(),
  credentialRefRequired: z.boolean(),
  freshnessMs: z.number().int().nonnegative(),
  description: z.string().min(1),
}).passthrough();

export const customAppSDKSystemTelemetryProvidersRequestSchema = z.object({
  includeExternalPending: z.boolean().default(true),
  kind: z.string().min(1).optional(),
}).strict();

export const customAppSDKSystemTelemetryProvidersSchema = z.object({
  providers: z.array(systemTelemetryProviderSchema),
  source: z.literal("system.telemetry.providers"),
  redactionPolicy: z.literal(CUSTOM_APP_REDACTION_POLICY_ID),
}).strict();

export const customAppSDKSystemTelemetryControlPlanRequestSchema = z.object({
  controlId: z.string().min(1),
  target: z.string().min(1).nullable().optional(),
  value: z.string().min(1).nullable().optional(),
  reason: z.string().min(1).optional(),
}).strict();

export const customAppSDKSystemTelemetryControlPlanSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  status: z.literal("planned"),
  willExecute: z.literal(false),
  broker: z.object({
    required: z.literal(true),
    status: z.literal("external_pending"),
    mode: z.literal("signed_host_plan_first"),
    failClosed: z.literal(true),
  }).strict(),
  policy: z.object({
    requiresConfirmation: z.boolean(),
    requiredGrants: z.array(z.string().min(1)),
    riskTier: z.string().min(1),
    sensitiveDetailRedacted: z.literal(true),
  }).passthrough(),
  receipt: z.object({
    required: z.literal(true),
    status: z.literal("not_issued"),
    auditEvent: z.string().min(1),
  }).passthrough(),
  externalPending: z.literal(true),
  source: z.literal("system.telemetry.controlPlan").optional(),
  redactionPolicy: z.literal(CUSTOM_APP_REDACTION_POLICY_ID).optional(),
}).passthrough();

export const customAppSDKJobsListSchema = z.object({
  kind: z.string().min(1).optional(),
  status: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
}).strict();

export const customAppSDKJobRecordSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  status: z.string().min(1),
  startedAt: z.union([z.string().min(1), z.number()]).nullable(),
  endedAt: z.union([z.string().min(1), z.number()]).nullable().optional(),
  createdAt: z.union([z.string().min(1), z.number()]).nullable().optional(),
  source: z.string().min(1),
  metadata: z.record(z.unknown()).default({}),
  redactionPolicy: z.literal(CUSTOM_APP_REDACTION_POLICY_ID),
}).strict();

export const customAppSDKJobsListResultSchema = z.object({
  items: z.array(customAppSDKJobRecordSchema),
  source: z.literal("jobs.list"),
  redactionPolicy: z.literal(CUSTOM_APP_REDACTION_POLICY_ID),
}).strict();

export const customAppSDKJobsGetSchema = z.object({
  id: z.string().min(1),
}).strict();

export const customAppSDKJobEntitySummarySchema = z.object({
  id: z.string().min(1),
  typeId: z.string().min(1),
  typeName: z.string().min(1),
  title: z.string().min(1).optional(),
  firstSeenAt: z.string().min(1),
  lastSeenAt: z.string().min(1),
  observationCount: z.number().int().min(0),
  hasSourceUrl: z.boolean().optional(),
  hasThumbnail: z.boolean().optional(),
  redactionPolicy: z.literal(CUSTOM_APP_REDACTION_POLICY_ID),
}).strict();

export const customAppSDKJobDetailSchema = z.object({
  run: customAppSDKJobRecordSchema,
  entities: z.array(customAppSDKJobEntitySummarySchema),
  source: z.literal("jobs.get"),
  redactionPolicy: z.literal(CUSTOM_APP_REDACTION_POLICY_ID),
}).strict();

export const customAppSDKJobsEventsSchema = z.object({
  id: z.string().min(1).optional(),
  kind: z.string().min(1).optional(),
  status: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(200).optional(),
}).strict();

export const customAppSDKJobEventSchema = z.object({
  id: z.string().min(1),
  jobId: z.string().min(1),
  kind: z.string().min(1),
  level: z.enum(["info", "warning", "error"]),
  message: z.string().min(1),
  occurredAt: z.union([z.string().min(1), z.number()]).nullable(),
  status: z.string().min(1).optional(),
  metadata: z.record(z.unknown()).default({}),
  source: z.literal("index.runs"),
  redactionPolicy: z.literal(CUSTOM_APP_REDACTION_POLICY_ID),
}).strict();

export const customAppSDKJobsEventsResultSchema = z.object({
  items: z.array(customAppSDKJobEventSchema),
  source: z.literal("jobs.events"),
  redactionPolicy: z.literal(CUSTOM_APP_REDACTION_POLICY_ID),
}).strict();

export const customAppSDKJobsStreamSchema = z.object({
  id: z.string().min(1).optional(),
  after: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(500).optional(),
}).strict();

export const customAppSDKRuntimeJobRecordSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  status: z.string().min(1),
  startedAt: z.number(),
  completedAt: z.number().nullable(),
  error: z.string().nullable(),
  payload: z.record(z.unknown()).nullable(),
}).passthrough();

export const customAppSDKRuntimeJobEventSchema = z.object({
  id: z.number().int().min(0),
  jobId: z.string().min(1),
  kind: z.string().min(1),
  level: z.enum(["info", "warning", "error"]),
  message: z.string().min(1),
  recordedAt: z.number(),
  payload: z.record(z.unknown()).nullable(),
}).passthrough();

export const customAppSDKJobsStreamResultSchema = z.object({
  items: z.array(customAppSDKRuntimeJobEventSchema),
  source: z.literal("jobs.stream"),
  redactionPolicy: z.literal(CUSTOM_APP_REDACTION_POLICY_ID),
}).passthrough();

export const customAppSDKJobsStartSchema = z.object({
  kind: z.enum(["distill", "nudge", "user_model_refresh"]),
  input: z.record(z.unknown()).default({}),
  reason: z.string().min(1).optional(),
}).strict();

export const customAppSDKJobsStartResultSchema = z.object({
  job: customAppSDKRuntimeJobRecordSchema,
  result: z.unknown(),
  source: z.literal("runtime.jobs.start"),
}).passthrough();

export const customAppSDKJobsCancelSchema = z.object({
  id: z.string().min(1),
  reason: z.string().min(1).optional(),
}).strict();

export const customAppSDKJobsCancelResultSchema = z.object({
  job: customAppSDKRuntimeJobRecordSchema,
  cancelled: z.boolean(),
  source: z.literal("runtime.jobs.cancel"),
}).passthrough();

const stringRecordSchema = z.record(z.string().min(1));

export const customAppSDKActionsInvokeSchema = z.object({
  capabilityId: z.string().min(1).optional(),
  domain: z.string().min(1).optional(),
  action: z.string().min(1),
  arguments: z.record(z.unknown()).default({}),
  dryRun: z.boolean().default(true),
  reason: z.string().min(1).optional(),
}).strict();

export const customAppSDKActionsReceiptSchema = z.object({
  schemaVersion: z.number().int().min(1).default(1),
  capabilityId: z.string().min(1),
  action: z.string().min(1),
  outcome: z.enum(["planned", "approval_required", "blocked", "dispatched", "failed"]),
  receiptId: z.string().min(1).optional(),
  auditId: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
  source: z.literal("actions.invoke"),
}).strict();

export const customAppSDKSecretsBrokerSchema = z.object({
  operation: z.enum(["resolve_ref", "lease", "use", "revoke"]),
  secretRef: z.string().min(1),
  purpose: z.string().min(1).optional(),
  ttlSeconds: z.number().int().min(1).max(3_600).optional(),
  reason: z.string().min(1).optional(),
}).strict();

export const customAppSDKSecretsReceiptSchema = z.object({
  schemaVersion: z.number().int().min(1).default(1),
  operation: z.enum(["resolve_ref", "lease", "use", "revoke"]),
  secretRef: z.string().min(1),
  outcome: z.enum(["approved", "denied", "blocked", "leased", "revoked", "failed"]),
  leaseId: z.string().min(1).optional(),
  expiresAt: z.string().min(1).optional(),
  auditId: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
  source: z.literal("secrets.broker"),
}).strict();

export const customAppSDKMacActionRequestSchema = z.object({
  capabilityId: z.string().regex(/^mac\.[a-z0-9_.-]+$/),
  arguments: stringRecordSchema.default({}),
  dryRun: z.literal(true).default(true),
  reason: z.string().min(1).optional(),
}).strict();

export const customAppSDKMacActionPlanSchema = z.object({
  schemaVersion: z.number().int().min(1),
  planId: z.string().min(1),
  requestId: z.string().min(1),
  capabilityId: z.string().regex(/^mac\.[a-z0-9_.-]+$/),
  risk: z.enum(["read", "low", "medium", "high", "critical"]),
  coverageState: z.string().min(1),
  requiredApprovals: z.array(z.object({
    risk: z.string().min(1),
    reason: z.string().min(1),
    approverRoles: z.array(z.string().min(1)),
    requestId: z.string().min(1).optional(),
  }).strict()),
  willMutate: z.boolean(),
  executable: z.boolean(),
  blockedReasons: z.array(z.string()),
  relatedSurfaces: z.array(z.string()),
  source: z.literal("mac.action.plan").optional(),
}).passthrough();

export const customAppSDKIoTActionSchema = z.object({
  homeId: z.string().min(1).optional(),
  selector: z.string().min(1).optional(),
  area: z.string().min(1).optional(),
  family: z.string().min(1).optional(),
  capability: z.string().min(1).optional(),
  action: z.string().min(1),
  value: z.unknown().optional(),
  targets: z.array(z.string().min(1)).optional(),
}).strict();

export const customAppSDKIoTActionResultSchema = z.object({
  schemaVersion: z.number().int().min(1).optional(),
  status: z.string().min(1),
  homeId: z.string().min(1).optional(),
  actionId: z.string().min(1).optional(),
  invocationId: z.string().min(1).optional(),
  value: z.unknown().optional(),
  changed: z.boolean().optional(),
  errors: z.array(z.string()).optional(),
  source: z.literal("iot.device.action.invoke").optional(),
}).passthrough();

export const customAppSDKRequestPartialSchema = z.object({
  source: z.enum([
    "search.query",
    "db.query",
    "resources.list",
    "resources.read",
    "nodes.inventory",
    "resources.location",
    "localForge.inventory",
    "cluster.controlPlane.inspect",
    "system.telemetry.snapshot",
    "system.telemetry.history",
    "system.telemetry.metrics",
    "system.telemetry.widgets",
    "system.telemetry.providers",
    "jobs.list",
    "jobs.get",
    "jobs.events",
  ]),
  collection: z.string().min(1).optional(),
  items: z.array(z.union([customAppSDKBridgeRecordSchema, resourceRecordSchema, customAppSDKJobRecordSchema, customAppSDKJobEntitySummarySchema, customAppSDKJobEventSchema])).optional(),
  resource: resourceRecordSchema.optional(),
  content: z.string().optional(),
  truncated: z.boolean().optional(),
  error: z.string().optional(),
  partialCount: z.number().int().min(0).optional(),
  progress: z.number().min(0).max(1).optional(),
  redactionPolicy: z.literal(CUSTOM_APP_REDACTION_POLICY_ID).optional(),
}).strict();

export const customAppSDKSchemaRegistry = {
  [CUSTOM_APP_SDK_SCHEMA_REFS.searchQuery]: customAppSDKSearchQuerySchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.searchResults]: customAppSDKSearchResultsSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.dbQuery]: customAppSDKDBQuerySchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.dbRecords]: customAppSDKDBRecordsSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.resourcesList]: customAppSDKResourcesListSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.resourcesListResult]: customAppSDKResourcesListResultSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.resourcesRead]: customAppSDKResourcesReadSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.resourcesPayload]: customAppSDKResourcesPayloadSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.nodesInventoryRequest]: customAppSDKNodesInventoryRequestSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.nodesInventory]: customAppSDKNodesInventorySchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.resourcesLocationRequest]: customAppSDKResourcesLocationRequestSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.resourcesLocation]: customAppSDKResourcesLocationSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.localForgeInventoryRequest]: customAppSDKLocalForgeInventoryRequestSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.localForgeInventory]: customAppSDKLocalForgeInventorySchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.clusterControlPlaneInspectRequest]: customAppSDKClusterControlPlaneInspectRequestSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.clusterControlPlaneInspect]: customAppSDKClusterControlPlaneInspectSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetrySnapshotRequest]: customAppSDKSystemTelemetrySnapshotRequestSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetrySnapshot]: customAppSDKSystemTelemetrySnapshotSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetryHistoryRequest]: customAppSDKSystemTelemetryHistoryRequestSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetryHistory]: customAppSDKSystemTelemetryHistorySchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetryMetricsRequest]: customAppSDKSystemTelemetryMetricsRequestSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetryMetrics]: customAppSDKSystemTelemetryMetricsSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetryWidgetsRequest]: customAppSDKSystemTelemetryWidgetsRequestSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetryWidgets]: customAppSDKSystemTelemetryWidgetsSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetryProvidersRequest]: customAppSDKSystemTelemetryProvidersRequestSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetryProviders]: customAppSDKSystemTelemetryProvidersSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetryControlPlanRequest]: customAppSDKSystemTelemetryControlPlanRequestSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetryControlPlan]: customAppSDKSystemTelemetryControlPlanSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.jobsList]: customAppSDKJobsListSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.jobsListResult]: customAppSDKJobsListResultSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.jobsGet]: customAppSDKJobsGetSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.jobsDetail]: customAppSDKJobDetailSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.jobsEvents]: customAppSDKJobsEventsSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.jobsEventsResult]: customAppSDKJobsEventsResultSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.jobsStream]: customAppSDKJobsStreamSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.jobsStreamResult]: customAppSDKJobsStreamResultSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.jobsStart]: customAppSDKJobsStartSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.jobsStartResult]: customAppSDKJobsStartResultSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.jobsCancel]: customAppSDKJobsCancelSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.jobsCancelResult]: customAppSDKJobsCancelResultSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.actionsInvoke]: customAppSDKActionsInvokeSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.actionsReceipt]: customAppSDKActionsReceiptSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.secretsBroker]: customAppSDKSecretsBrokerSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.secretsReceipt]: customAppSDKSecretsReceiptSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.macActionRequest]: customAppSDKMacActionRequestSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.macActionPlan]: customAppSDKMacActionPlanSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.iotAction]: customAppSDKIoTActionSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.iotActionResult]: customAppSDKIoTActionResultSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.requestCancel]: customAppSDKRequestCancelSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.requestProgress]: customAppSDKRequestProgressSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.requestPartial]: customAppSDKRequestPartialSchema,
} satisfies Record<CustomAppSDKSchemaRef, z.ZodTypeAny>;

export function listCustomAppSDKSchemaRefs(): CustomAppSDKSchemaRef[] {
  return Object.keys(customAppSDKSchemaRegistry).sort() as CustomAppSDKSchemaRef[];
}

export function getCustomAppSDKSchema(ref: string): z.ZodTypeAny | undefined {
  return customAppSDKSchemaRegistry[ref as CustomAppSDKSchemaRef];
}
