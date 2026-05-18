import { z } from "zod";

import { buildRemoteExternalPendingRegister, remoteSyncRequiredRouteIds } from "./remote-sync.ts";

export const remoteProviderDeviceE2EDomainSchema = z.enum([
  "chat",
  "search",
  "sync",
  "secret_refs",
  "hosted_agents",
]);

export const remoteProviderDeviceE2EValidationStepSchema = z.object({
  schemaVersion: z.literal(1),
  domain: remoteProviderDeviceE2EDomainSchema,
  requiredRouteIds: z.array(z.string().min(1)).min(1),
  requiredExternalPendingIds: z.array(z.string().min(1)).min(1),
  requiredArtifacts: z.array(z.string().min(1)).min(1),
  acceptanceCriteria: z.array(z.string().min(1)).min(1),
  status: z.literal("external_pending"),
  writes: z.literal(false),
});

export const remoteProviderDeviceE2EValidationPlanSchema = z.object({
  schemaVersion: z.literal(1),
  planId: z.string().min(1),
  requiredDomains: z.array(remoteProviderDeviceE2EDomainSchema).min(5),
  requiredRouteIds: z.array(z.string().min(1)).min(1),
  requiredExternalPendingIds: z.array(z.string().min(1)).min(1),
  validationSteps: z.array(remoteProviderDeviceE2EValidationStepSchema).min(5),
  evidenceRefs: z.array(z.string().min(1)).min(1),
  status: z.literal("external_pending"),
  approvedPhysicalValidationRequired: z.literal(true),
  noPlaintextSecrets: z.literal(true),
  plaintextMaterialIncluded: z.literal(false),
  hostedSelfHostedParityRequired: z.literal(true),
  createdAt: z.string().datetime(),
  writes: z.literal(false),
});

export type RemoteProviderDeviceE2EDomain = z.infer<typeof remoteProviderDeviceE2EDomainSchema>;
export type RemoteProviderDeviceE2EValidationStep = z.infer<typeof remoteProviderDeviceE2EValidationStepSchema>;
export type RemoteProviderDeviceE2EValidationPlan = z.infer<typeof remoteProviderDeviceE2EValidationPlanSchema>;

export const remoteExternalValidationChecklistItemSchema = z.object({
  schemaVersion: z.literal(1),
  requirementId: z.string().min(1),
  decisionId: z.string().min(1),
  category: z.string().min(1),
  sourceReceipt: z.string().min(1),
  requiredCommand: z.string().min(1),
  requiredArtifacts: z.array(z.string().min(1)).min(1),
  acceptanceCriteria: z.array(z.string().min(1)).min(1),
  approvedRunRequired: z.literal(true),
  physicalEvidenceRequired: z.literal(true),
  plaintextMaterialIncluded: z.literal(false),
  status: z.literal("external_pending"),
  writes: z.literal(false),
});

export const remoteExternalValidationChecklistSchema = z.object({
  schemaVersion: z.literal(1),
  checklistId: z.string().min(1),
  generatedAt: z.string().datetime(),
  status: z.literal("external_pending"),
  requirementIds: z.array(z.string().min(1)).min(1),
  items: z.array(remoteExternalValidationChecklistItemSchema).min(1),
  coverage: z.object({
    requirementCount: z.number().int().nonnegative(),
    coveredRequirementCount: z.number().int().nonnegative(),
    missingRequirementIds: z.array(z.string()),
  }),
  writes: z.literal(false),
});

export type RemoteExternalValidationChecklistItem = z.infer<typeof remoteExternalValidationChecklistItemSchema>;
export type RemoteExternalValidationChecklist = z.infer<typeof remoteExternalValidationChecklistSchema>;

export const remoteExternalValidationEvidenceSchema = z.object({
  schemaVersion: z.literal(1),
  requirementId: z.string().min(1),
  approvedRun: z.boolean(),
  approvedRunRef: z.string().min(1).optional(),
  physicalEvidenceRef: z.string().min(1).optional(),
  artifactRefs: z.array(z.string().min(1)),
  acceptedCriteria: z.array(z.string().min(1)),
  plaintextMaterialIncluded: z.literal(false),
  executedAt: z.string().datetime().optional(),
  operatorId: z.string().min(1).optional(),
  writes: z.literal(false),
});

export const remoteExternalValidationEvidenceEnvelopeSchema = z.object({
  evidence: z.array(remoteExternalValidationEvidenceSchema),
});

export const remoteExternalValidationEvidenceArtifactSchema = z.object({
  schemaVersion: z.literal(1),
  sourceConversationId: z.string().min(1),
  sourcePlanId: z.string().min(1),
  generatedAt: z.string().datetime(),
  status: z.literal("external_pending"),
  writes: z.literal(false),
  evidence: z.array(remoteExternalValidationEvidenceSchema).min(1),
});

export const remoteExternalValidationReportItemSchema = z.object({
  schemaVersion: z.literal(1),
  requirementId: z.string().min(1),
  decisionId: z.string().min(1),
  category: z.string().min(1),
  sourceReceipt: z.string().min(1),
  status: z.enum(["external_pending", "clearable"]),
  approvedRun: z.boolean(),
  approvedRunRefPresent: z.boolean(),
  physicalEvidencePresent: z.boolean(),
  missingArtifacts: z.array(z.string()),
  missingAcceptanceCriteria: z.array(z.string()),
  plaintextMaterialIncluded: z.literal(false),
  clearable: z.boolean(),
  writes: z.literal(false),
});

export const remoteExternalValidationReportSchema = z.object({
  schemaVersion: z.literal(1),
  reportId: z.string().min(1),
  generatedAt: z.string().datetime(),
  status: z.enum(["external_pending", "clearable"]),
  requirementCount: z.number().int().nonnegative(),
  evidenceCount: z.number().int().nonnegative(),
  clearableRequirementIds: z.array(z.string()),
  blockedRequirementIds: z.array(z.string()),
  invalidEvidenceRequirementIds: z.array(z.string()),
  duplicateEvidenceRequirementIds: z.array(z.string()),
  items: z.array(remoteExternalValidationReportItemSchema),
  writes: z.literal(false),
});

export const remoteExternalValidationEvidenceTemplateSchema = z.object({
  schemaVersion: z.literal(1),
  templateId: z.string().min(1),
  generatedAt: z.string().datetime(),
  status: z.literal("external_pending"),
  requirementCount: z.number().int().nonnegative(),
  submissionCommand: z.string().min(1),
  checklistItems: z.array(remoteExternalValidationChecklistItemSchema).min(1),
  evidence: z.array(remoteExternalValidationEvidenceSchema).min(1),
  instructions: z.array(z.string().min(1)).min(1),
  writes: z.literal(false),
});

export const remoteSourceQaReviewDispositionSchema = z.enum(["implemented", "validated", "external_pending"]);

export const remoteSourceQaReviewItemSchema = z.object({
  schemaVersion: z.literal(1),
  qaId: z.string().min(1),
  decisionKey: z.string().min(1),
  requirementId: z.string().min(1),
  disposition: remoteSourceQaReviewDispositionSchema,
  evidenceRefs: z.array(z.string().min(1)).min(1),
  reviewedAt: z.string().datetime(),
  writes: z.literal(false),
});

export const remoteSourceQaReviewReportSchema = z.object({
  schemaVersion: z.literal(1),
  reportId: z.string().min(1),
  generatedAt: z.string().datetime(),
  status: z.enum(["incomplete", "complete"]),
  requiredSourceQaIds: z.array(z.string().min(1)).min(1),
  reviewedSourceQaIds: z.array(z.string().min(1)),
  missingSourceQaIds: z.array(z.string().min(1)),
  invalidSourceQaIds: z.array(z.string().min(1)),
  duplicateSourceQaIds: z.array(z.string().min(1)),
  externalPendingRequiredSourceQaIds: z.array(z.string().min(1)),
  invalidExternalPendingDispositionQaIds: z.array(z.string().min(1)),
  items: z.array(remoteSourceQaReviewItemSchema),
  writes: z.literal(false),
});

export const remoteSourceQaReviewTemplateItemSchema = z.object({
  schemaVersion: z.literal(1),
  qaId: z.string().min(1),
  decisionKey: z.string().min(1),
  requirementId: z.string().min(1),
  reviewed: z.literal(false),
  disposition: z.null(),
  evidenceRefs: z.array(z.string()).length(0),
  reviewedAt: z.null(),
  writes: z.literal(false),
});

export const remoteSourceQaReviewTemplateSchema = z.object({
  schemaVersion: z.literal(1),
  templateId: z.string().min(1),
  sourceConversationId: z.string().min(1),
  sourcePlanId: z.string().min(1),
  generatedAt: z.string().datetime(),
  status: z.literal("incomplete"),
  requiredSourceQaIds: z.array(z.string().min(1)).min(1),
  reviewCount: z.number().int().nonnegative(),
  submissionCommand: z.string().min(1),
  items: z.array(remoteSourceQaReviewTemplateItemSchema).min(1),
  instructions: z.array(z.string().min(1)).min(1),
  writes: z.literal(false),
});

export const remoteGoalClosureGateSchema = z.object({
  schemaVersion: z.literal(1),
  gateId: z.string().min(1),
  generatedAt: z.string().datetime(),
  status: z.enum(["blocked", "clearable"]),
  requiredSourceQaIds: z.array(z.string().min(1)).min(1),
  reviewedSourceQaIds: z.array(z.string().min(1)),
  missingSourceQaIds: z.array(z.string().min(1)),
  invalidSourceQaIds: z.array(z.string().min(1)),
  duplicateSourceQaIds: z.array(z.string().min(1)),
  externalPendingRequiredSourceQaIds: z.array(z.string().min(1)),
  invalidExternalPendingDispositionQaIds: z.array(z.string().min(1)),
  sourceQaReviewStatus: z.enum(["incomplete", "complete"]),
  sourceQaReviewItems: z.array(remoteSourceQaReviewItemSchema),
  externalValidationStatus: z.enum(["external_pending", "clearable"]),
  blockedExternalRequirementIds: z.array(z.string().min(1)),
  clearableExternalRequirementIds: z.array(z.string().min(1)),
  blockers: z.array(z.enum(["source_qa_review", "external_validation"])),
  writes: z.literal(false),
});

export type RemoteExternalValidationEvidence = z.infer<typeof remoteExternalValidationEvidenceSchema>;
export type RemoteExternalValidationEvidenceEnvelope = z.infer<typeof remoteExternalValidationEvidenceEnvelopeSchema>;
export type RemoteExternalValidationEvidenceArtifact = z.infer<typeof remoteExternalValidationEvidenceArtifactSchema>;
export type RemoteExternalValidationReportItem = z.infer<typeof remoteExternalValidationReportItemSchema>;
export type RemoteExternalValidationReport = z.infer<typeof remoteExternalValidationReportSchema>;
export type RemoteExternalValidationEvidenceTemplate = z.infer<typeof remoteExternalValidationEvidenceTemplateSchema>;
export type RemoteSourceQaReviewDisposition = z.infer<typeof remoteSourceQaReviewDispositionSchema>;
export type RemoteSourceQaReviewItem = z.infer<typeof remoteSourceQaReviewItemSchema>;
export type RemoteSourceQaReviewReport = z.infer<typeof remoteSourceQaReviewReportSchema>;
export type RemoteSourceQaReviewTemplateItem = z.infer<typeof remoteSourceQaReviewTemplateItemSchema>;
export type RemoteSourceQaReviewTemplate = z.infer<typeof remoteSourceQaReviewTemplateSchema>;
export type RemoteGoalClosureGate = z.infer<typeof remoteGoalClosureGateSchema>;

function providerDeviceE2EPlanId(parts: string[]): string {
  return `provider_device_e2e_${parts.join("_").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase()}`;
}

const providerDeviceE2ERequiredExternalPendingIds = [
  "physical_iroh_handshake",
  "device_trust_acceptance",
  "physical_peer_trust",
  "physical_sync_driver_application",
  "physical_authority_handoff",
  "signed_host_audit_persistence",
  "physical_client_storage",
  "provider_secret_retrieval",
  "self_hosted_deployment",
  "hosted_deployment",
  "agent_runtime_execution",
  "billing_meter_persistence",
  "provider_device_e2e",
] as const;

function providerDeviceE2EValidationSteps(requiredRouteIds: readonly string[]): RemoteProviderDeviceE2EValidationStep[] {
  const routeIds = new Set(requiredRouteIds);
  const step = (
    domain: RemoteProviderDeviceE2EDomain,
    routes: string[],
    externalPendingIds: string[],
    requiredArtifacts: string[],
    acceptanceCriteria: string[],
  ) => remoteProviderDeviceE2EValidationStepSchema.parse({
    schemaVersion: 1,
    domain,
    requiredRouteIds: routes.filter((routeId) => routeIds.has(routeId)),
    requiredExternalPendingIds: externalPendingIds,
    requiredArtifacts,
    acceptanceCriteria,
    status: "external_pending",
    writes: false,
  });
  return [
    step("chat", ["remote.chatGateway"], ["physical_iroh_handshake", "device_trust_acceptance", "provider_device_e2e"], ["remote chat gateway transcript", "RemoteTransportHandshakeReceipt", "remote conformance output"], ["chat uses registered Gateway route", "transport handshake and device trust are physically verified", "no parallel chat API is introduced"]),
    step("search", ["remote.searchGateway"], ["physical_iroh_handshake", "provider_device_e2e"], ["remote search result trace", "route contract output", "remote conformance output"], ["search uses the registered local search contract through Gateway", "results are returned without a parallel API", "provider/device run includes search together with other domains"]),
    step("sync", ["sync.skills", "sync.memoryUserModel", "sync.sessions", "sync.driveFiles", "sync.blobs", "sync.searchIndex", "sync.sqliteResources", "sync.sidecars", "sync.agentConfig", "sync.workspaceState", "mesh.resourceShare"], ["physical_peer_trust", "physical_sync_driver_application", "physical_authority_handoff", "physical_client_storage", "provider_device_e2e"], ["SyncDriverApplicationReceipt", "SyncAuthorityHandoffReceipt", "RemoteClientCacheSnapshot", "mesh share/revocation trace"], ["every required Sync driver route is covered", "conflicts are detected and elevated", "authority handoff and client cache behavior are physically verified"]),
    step("secret_refs", ["remote.secretBrokeredOperation"], ["provider_secret_retrieval", "signed_host_audit_persistence", "provider_device_e2e"], ["RemoteSecretProviderReceipt", "broker lease audit", "provider request trace"], ["secret material stays reference-only", "provider retrieval uses broker leases", "lease use and Gateway decision are audited"]),
    step("hosted_agents", ["gateway.headlessAgentHost", "gateway.multiTenantAgentService"], ["self_hosted_deployment", "hosted_deployment", "agent_runtime_execution", "billing_meter_persistence", "provider_device_e2e"], ["RemoteAgentServiceExecutionReceipt", "GatewayDeploymentManifest", "billing meter event", "tenant isolation evidence"], ["headless ClawJS acts as a full host", "hosted and self-hosted modes pass the same route contracts", "assignments, budgets, billing, isolation, and audit are present"]),
  ];
}

export function buildRemoteProviderDeviceE2EValidationPlan(input: {
  createdAt?: string;
  requiredRouteIds?: readonly string[];
  evidenceRefs?: string[];
} = {}): RemoteProviderDeviceE2EValidationPlan {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const requiredRouteIds = input.requiredRouteIds?.length ? [...input.requiredRouteIds] : remoteSyncRequiredRouteIds.slice();
  return remoteProviderDeviceE2EValidationPlanSchema.parse({
    schemaVersion: 1,
    planId: providerDeviceE2EPlanId(["plan", createdAt]),
    requiredDomains: ["chat", "search", "sync", "secret_refs", "hosted_agents"],
    requiredRouteIds,
    requiredExternalPendingIds: providerDeviceE2ERequiredExternalPendingIds,
    validationSteps: providerDeviceE2EValidationSteps(requiredRouteIds),
    evidenceRefs: input.evidenceRefs?.length ? input.evidenceRefs : [
      "claw inspect remote --json",
      "claw remote contracts --json",
      "claw remote pending --json",
      "Relay /v1/remote/conformance",
      "Relay /v1/remote/route-contracts",
      "Relay /v1/remote/external-pending",
    ],
    status: "external_pending",
    approvedPhysicalValidationRequired: true,
    noPlaintextSecrets: true,
    plaintextMaterialIncluded: false,
    hostedSelfHostedParityRequired: true,
    createdAt,
    writes: false,
  });
}

type ExternalValidationDefinition = Pick<RemoteExternalValidationChecklistItem, "requiredCommand" | "requiredArtifacts" | "acceptanceCriteria">;

const externalValidationDefinitions: Record<string, ExternalValidationDefinition> = {
  physical_iroh_handshake: {
    requiredCommand: "claw nodes heartbeat --record true --transport iroh",
    requiredArtifacts: ["RemoteTransportHandshakeReceipt", "Coordinator signature", "physical node logs"],
    acceptanceCriteria: [
      "two approved nodes complete a real Iroh handshake",
      "transport receipt records physicalTransportVerified: true",
      "receipt is signed and later verifiable from the Coordinator ledger",
    ],
  },
  device_trust_acceptance: {
    requiredCommand: "claw nodes trust --record true --physical-accepted true",
    requiredArtifacts: ["NodeTrustDecision", "device acceptance prompt/result", "Coordinator signature"],
    acceptanceCriteria: [
      "the subject device is physically accepted by an approved actor",
      "allow decisions do not become authoritative without physicalAcceptanceVerified: true",
      "deny and revoke decisions remain audited",
    ],
  },
  physical_peer_trust: {
    requiredCommand: "claw mesh accept --record true --physical-peer-trust true",
    requiredArtifacts: ["MeshInvitationAcceptance", "peer device evidence", "Coordinator signature"],
    acceptanceCriteria: [
      "the accepted mesh invitation is bound to the intended peer",
      "physical peer trust is verified before share/sync rights are usable",
      "revocation remains possible through the same mesh ledger",
    ],
  },
  physical_sync_driver_application: {
    requiredCommand: "claw sync apply --record true",
    requiredArtifacts: ["SyncDriverApplicationReceipt", "before/after resource evidence", "Coordinator signature"],
    acceptanceCriteria: [
      "an approved driver applies a real resource change or merge",
      "conflicts are detected and elevated instead of overwritten",
      "the application receipt is signed and links to the resource manifest",
    ],
  },
  physical_authority_handoff: {
    requiredCommand: "claw sync handoff --record true --physical-verified true",
    requiredArtifacts: ["SyncAuthorityHandoffReceipt", "source node state", "target node state"],
    acceptanceCriteria: [
      "authority and residency transfer between approved nodes is physically observed",
      "the old authority cannot continue as primary after handoff",
      "the signed handoff remains verifiable in sync status",
    ],
  },
  signed_host_audit_persistence: {
    requiredCommand: "claw gateway audit --record true --host-audit-persisted true",
    requiredArtifacts: ["RemoteGatewayAuditReceipt", "signed host audit record", "audit store verification"],
    acceptanceCriteria: [
      "the Gateway decision is persisted in the signed host audit store",
      "actor, action, resource, policy, and decision are present",
      "the persisted audit event signature verifies",
    ],
  },
  physical_client_storage: {
    requiredCommand: "claw sync cache --record true --physical-client true",
    requiredArtifacts: ["RemoteClientCacheSnapshot", "client storage inspection", "TTL expiration evidence"],
    acceptanceCriteria: [
      "real client cache storage is encrypted",
      "cache entries expire by TTL",
      "cache stores no authoritative state and no plaintext material",
    ],
  },
  provider_secret_retrieval: {
    requiredCommand: "claw gateway secret-provider --record true",
    requiredArtifacts: ["RemoteSecretProviderReceipt", "broker lease audit", "provider request trace"],
    acceptanceCriteria: [
      "provider retrieval happens through a broker lease",
      "remote responses include references only, never plaintext material",
      "lease use is audited and bounded",
    ],
  },
  self_hosted_deployment: {
    requiredCommand: "claw gateway serve --record true --physical-verified true",
    requiredArtifacts: ["GatewayDeploymentManifest", "self-hosted process health", "remote conformance output"],
    acceptanceCriteria: [
      "a real self-hosted Gateway binds and serves the registered contract",
      "route contracts match local registered API routes",
      "self-hosted mode passes the same conformance report as hosted mode",
    ],
  },
  hosted_deployment: {
    requiredCommand: "claw gateway project --record true --physical-verified true",
    requiredArtifacts: ["GatewayDeploymentManifest", "hosted rollout evidence", "remote conformance output"],
    acceptanceCriteria: [
      "a real hosted rollout serves the registered contract",
      "hosted mode does not introduce a parallel API",
      "hosted mode passes the same conformance report as self-hosted mode",
    ],
  },
  agent_runtime_execution: {
    requiredCommand: "claw gateway agent-service --record true --runtime-executed true",
    requiredArtifacts: ["RemoteAgentServiceExecutionReceipt", "runtime execution log", "tenant isolation evidence"],
    acceptanceCriteria: [
      "an approved remote agent-service run executes through governed control",
      "assignment, budget, isolation key, and audit reference are present",
      "runtime execution is linked to the tenant and route contract",
    ],
  },
  billing_meter_persistence: {
    requiredCommand: "claw gateway agent-service --record true --billing-meter-persisted true",
    requiredArtifacts: ["RemoteAgentServiceExecutionReceipt", "billing meter event", "budget ledger evidence"],
    acceptanceCriteria: [
      "a real billing meter event is persisted for the agent-service run",
      "usage is tied to the assignment and billing account",
      "the event can be reconciled against the budget ledger",
    ],
  },
  provider_device_e2e: {
    requiredCommand: "claw remote e2e-plan --json, then approved provider/device E2E run",
    requiredArtifacts: ["RemoteProviderDeviceE2EValidationPlan", "provider/device run report", "remote conformance output"],
    acceptanceCriteria: [
      "chat, search, Sync, reference-based provider retrieval, and hosted agents pass together",
      "the run covers all required route IDs and all external pending requirement IDs",
      "hosted/self-hosted parity and no-plaintext-material invariants hold",
    ],
  },
};

function externalValidationChecklistId(parts: string[]): string {
  return `remote_external_validation_${parts.join("_").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase()}`;
}

function externalValidationReportId(parts: string[]): string {
  return `remote_external_validation_report_${parts.join("_").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase()}`;
}

function externalValidationEvidenceTemplateId(parts: string[]): string {
  return `remote_external_validation_evidence_template_${parts.join("_").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase()}`;
}

function sourceQaReviewTemplateId(parts: string[]): string {
  return `remote_source_qa_review_template_${parts.join("_").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase()}`;
}

function remoteGoalClosureGateId(parts: string[]): string {
  return `remote_goal_closure_gate_${parts.join("_").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase()}`;
}

export const remoteSourceConversationId = "019e36a3-c2e6-73b3-a3fe-f3e7340e42c8";
export const remoteSourcePlanId = "019e3732-c90e-7491-9217-37020c43217e-plan";
export const remoteGoalClosureRequiredSourceQaIds = Array.from({ length: 23 }, (_, index) => `QA-${String(index + 1).padStart(3, "0")}`);

export function parseRemoteExternalValidationEvidenceInput(input: unknown): RemoteExternalValidationEvidence[] {
  if (input === undefined || input === null) return [];
  if (Array.isArray(input)) return input.map((entry) => remoteExternalValidationEvidenceSchema.parse(entry));
  if (input && typeof input === "object" && Array.isArray((input as { evidence?: unknown }).evidence)) {
    const envelope = (
      "sourceConversationId" in input
      || "sourcePlanId" in input
      || "generatedAt" in input
      || "status" in input
      || "writes" in input
    )
      ? remoteExternalValidationEvidenceArtifactSchema.parse(input)
      : remoteExternalValidationEvidenceEnvelopeSchema.parse(input);
    return envelope.evidence;
  }
  return [remoteExternalValidationEvidenceSchema.parse(input)];
}

const remoteSourceQaCatalog: Record<string, { decisionKey: string; requirementId: string }> = {
  "QA-001": { decisionKey: "relay_boundary", requirementId: "RQ-001" },
  "QA-002": { decisionKey: "server_trust_model", requirementId: "RQ-002" },
  "QA-003": { decisionKey: "remote_surface_parity", requirementId: "RQ-003" },
  "QA-004": { decisionKey: "topology_priority", requirementId: "RQ-004" },
  "QA-005": { decisionKey: "sync_authority_model", requirementId: "RQ-005" },
  "QA-006": { decisionKey: "remote_secrets_model", requirementId: "RQ-006" },
  "QA-007": { decisionKey: "transport_contract", requirementId: "RQ-007" },
  "QA-008": { decisionKey: "remote_api_shape", requirementId: "RQ-008" },
  "QA-009": { decisionKey: "offline_behavior", requirementId: "RQ-009" },
  "QA-010": { decisionKey: "remote_actor_model", requirementId: "RQ-010" },
  "QA-011": { decisionKey: "headless_host_model", requirementId: "RQ-011" },
  "QA-012": { decisionKey: "first_vertical_slice", requirementId: "RQ-012" },
  "QA-013": { decisionKey: "sync_substrate", requirementId: "RQ-013" },
  "QA-014": { decisionKey: "conflict_default", requirementId: "RQ-014" },
  "QA-015": { decisionKey: "client_cache_policy", requirementId: "RQ-015" },
  "QA-016": { decisionKey: "guardrail_strictness", requirementId: "RQ-016" },
  "QA-017": { decisionKey: "compat_policy", requirementId: "RQ-017" },
  "QA-018": { decisionKey: "hosted_service_position", requirementId: "RQ-018" },
  "QA-019": { decisionKey: "layer_names", requirementId: "RQ-019" },
  "QA-020": { decisionKey: "mesh_collaboration_scope", requirementId: "RQ-020" },
  "QA-021": { decisionKey: "agent_service_model", requirementId: "RQ-021" },
  "QA-022": { decisionKey: "sync_lateral_domains", requirementId: "RQ-022" },
  "QA-023": { decisionKey: "goal_closure_gate", requirementId: "Completion audit" },
};

const remoteSourceQaIdsByDecisionKey = new Map(
  Object.entries(remoteSourceQaCatalog).map(([qaId, entry]) => [entry.decisionKey, qaId]),
);

function sourceQaReviewReportId(parts: string[]): string {
  return `remote_source_qa_review_${parts.join("_").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase()}`;
}

function externalPendingRequiredSourceQaIds(generatedAt: string): string[] {
  return [...new Set(
    buildRemoteExternalPendingRegister({ generatedAt }).requirements
      .map((entry) => remoteSourceQaIdsByDecisionKey.get(entry.decisionId))
      .filter((qaId): qaId is string => !!qaId),
  )].sort();
}

export function buildRemoteExternalValidationChecklist(input: {
  generatedAt?: string;
} = {}): RemoteExternalValidationChecklist {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const register = buildRemoteExternalPendingRegister({ generatedAt });
  const items = register.requirements.map((requirement) => {
    const definition = externalValidationDefinitions[requirement.requirementId];
    if (!definition) {
      throw new Error(`Missing external validation definition for ${requirement.requirementId}`);
    }
    return remoteExternalValidationChecklistItemSchema.parse({
      schemaVersion: 1,
      requirementId: requirement.requirementId,
      decisionId: requirement.decisionId,
      category: requirement.category,
      sourceReceipt: requirement.sourceReceipt,
      requiredCommand: definition.requiredCommand,
      requiredArtifacts: definition.requiredArtifacts,
      acceptanceCriteria: definition.acceptanceCriteria,
      approvedRunRequired: true,
      physicalEvidenceRequired: true,
      plaintextMaterialIncluded: false,
      status: requirement.status,
      writes: false,
    });
  });
  const coveredIds = new Set(items.map((item) => item.requirementId));
  const requirementIds = register.requirements.map((requirement) => requirement.requirementId);
  return remoteExternalValidationChecklistSchema.parse({
    schemaVersion: 1,
    checklistId: externalValidationChecklistId(["checklist", generatedAt]),
    generatedAt,
    status: "external_pending",
    requirementIds,
    items,
    coverage: {
      requirementCount: requirementIds.length,
      coveredRequirementCount: coveredIds.size,
      missingRequirementIds: requirementIds.filter((requirementId) => !coveredIds.has(requirementId)),
    },
    writes: false,
  });
}

export function buildRemoteExternalValidationReport(input: {
  generatedAt?: string;
  evidence?: RemoteExternalValidationEvidence[];
} = {}): RemoteExternalValidationReport {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const checklist = buildRemoteExternalValidationChecklist({ generatedAt });
  const checklistRequirementIds = new Set(checklist.requirementIds);
  const parsedEvidence = (input.evidence ?? []).map((entry) => remoteExternalValidationEvidenceSchema.parse(entry));
  const seenEvidenceRequirementIds = new Set<string>();
  const invalidEvidenceRequirementIds = [...new Set(
    parsedEvidence
      .map((entry) => entry.requirementId)
      .filter((requirementId) => !checklistRequirementIds.has(requirementId)),
  )];
  const duplicateEvidenceRequirementIds = [...new Set(
    parsedEvidence
      .map((entry) => entry.requirementId)
      .filter((requirementId) => {
        if (seenEvidenceRequirementIds.has(requirementId)) return true;
        seenEvidenceRequirementIds.add(requirementId);
        return false;
      }),
  )];
  const evidenceByRequirement = new Map(
    parsedEvidence
      .filter((entry) => checklistRequirementIds.has(entry.requirementId))
      .map((evidence) => [evidence.requirementId, evidence] as const),
  );
  const items = checklist.items.map((checklistItem) => {
    const evidence = evidenceByRequirement.get(checklistItem.requirementId);
    const artifactRefs = new Set(evidence?.artifactRefs ?? []);
    const acceptedCriteria = new Set(evidence?.acceptedCriteria ?? []);
    const missingArtifacts = checklistItem.requiredArtifacts.filter((artifact) => !artifactRefs.has(artifact));
    const missingAcceptanceCriteria = checklistItem.acceptanceCriteria.filter((criterion) => !acceptedCriteria.has(criterion));
    const approvedRun = evidence?.approvedRun === true;
    const approvedRunRefPresent = !!evidence?.approvedRunRef;
    const physicalEvidencePresent = !!evidence?.physicalEvidenceRef;
    const clearable = approvedRun
      && approvedRunRefPresent
      && physicalEvidencePresent
      && missingArtifacts.length === 0
      && missingAcceptanceCriteria.length === 0
      && evidence?.plaintextMaterialIncluded === false;
    return remoteExternalValidationReportItemSchema.parse({
      schemaVersion: 1,
      requirementId: checklistItem.requirementId,
      decisionId: checklistItem.decisionId,
      category: checklistItem.category,
      sourceReceipt: checklistItem.sourceReceipt,
      status: clearable ? "clearable" : "external_pending",
      approvedRun,
      approvedRunRefPresent,
      physicalEvidencePresent,
      missingArtifacts,
      missingAcceptanceCriteria,
      plaintextMaterialIncluded: false,
      clearable,
      writes: false,
    });
  });
  const clearableRequirementIds = items.filter((item) => item.clearable).map((item) => item.requirementId);
  const blockedRequirementIds = items.filter((item) => !item.clearable).map((item) => item.requirementId);
  return remoteExternalValidationReportSchema.parse({
    schemaVersion: 1,
    reportId: externalValidationReportId(["report", generatedAt]),
    generatedAt,
    status: blockedRequirementIds.length === 0 && invalidEvidenceRequirementIds.length === 0 && duplicateEvidenceRequirementIds.length === 0 ? "clearable" : "external_pending",
    requirementCount: checklist.requirementIds.length,
    evidenceCount: parsedEvidence.length,
    clearableRequirementIds,
    blockedRequirementIds,
    invalidEvidenceRequirementIds,
    duplicateEvidenceRequirementIds,
    items,
    writes: false,
  });
}

export function buildRemoteExternalValidationEvidenceTemplate(input: {
  generatedAt?: string;
  requirementIds?: string[];
} = {}): RemoteExternalValidationEvidenceTemplate {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const checklist = buildRemoteExternalValidationChecklist({ generatedAt });
  const requestedIds = input.requirementIds?.length ? new Set(input.requirementIds) : null;
  const checklistItems = requestedIds
    ? checklist.items.filter((entry) => requestedIds.has(entry.requirementId))
    : checklist.items;
  const evidence = checklistItems.map((entry) => remoteExternalValidationEvidenceSchema.parse({
    schemaVersion: 1,
    requirementId: entry.requirementId,
    approvedRun: false,
    artifactRefs: [],
    acceptedCriteria: [],
    plaintextMaterialIncluded: false,
    executedAt: generatedAt,
    writes: false,
  }));
  return remoteExternalValidationEvidenceTemplateSchema.parse({
    schemaVersion: 1,
    templateId: externalValidationEvidenceTemplateId(["template", generatedAt]),
    generatedAt,
    status: "external_pending",
    requirementCount: checklistItems.length,
    submissionCommand: "claw remote validation-report --evidence-file docs/remote-gateway-sync-external-validation-evidence.json --json",
    checklistItems,
    evidence,
    instructions: [
      "Fill one evidence row per requirement after an explicitly approved physical/provider validation run.",
      "Set approvedRun true only for approved runs and set approvedRunRef to the approval/audit record for that run.",
      "Copy every required artifact name into artifactRefs only when that artifact exists.",
      "Copy every acceptance criterion into acceptedCriteria only when the run proves it.",
      "Keep plaintextMaterialIncluded false; never attach plaintext secrets or raw credential material.",
    ],
    writes: false,
  });
}

export function buildRemoteExternalValidationEvidenceArtifact(input: {
  generatedAt?: string;
  requirementIds?: string[];
  evidence?: RemoteExternalValidationEvidence[] | RemoteExternalValidationEvidenceEnvelope | RemoteExternalValidationEvidenceArtifact;
} = {}): RemoteExternalValidationEvidenceArtifact {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const evidence = input.evidence === undefined
    ? buildRemoteExternalValidationEvidenceTemplate({ generatedAt, requirementIds: input.requirementIds }).evidence
    : parseRemoteExternalValidationEvidenceInput(input.evidence);
  return remoteExternalValidationEvidenceArtifactSchema.parse({
    schemaVersion: 1,
    sourceConversationId: remoteSourceConversationId,
    sourcePlanId: remoteSourcePlanId,
    generatedAt,
    status: "external_pending",
    writes: false,
    evidence,
  });
}

export function buildRemoteSourceQaReviewReport(input: {
  generatedAt?: string;
  reviewedSourceQaIds?: string[];
  reviews?: RemoteSourceQaReviewItem[];
} = {}): RemoteSourceQaReviewReport {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const explicitReviews = (input.reviews ?? []).map((entry) => remoteSourceQaReviewItemSchema.parse(entry));
  const explicitQaIds = new Set(explicitReviews.map((entry) => entry.qaId));
  const externalPendingQaIds = externalPendingRequiredSourceQaIds(generatedAt);
  const seenSourceQaIds = new Set<string>();
  const duplicateSourceQaIds = [...new Set(
    explicitReviews
      .map((entry) => entry.qaId)
      .filter((qaId) => {
        if (seenSourceQaIds.has(qaId)) return true;
        seenSourceQaIds.add(qaId);
        return false;
      }),
  )];
  const idOnlyReviews = [...new Set(input.reviewedSourceQaIds ?? [])]
    .filter((qaId) => remoteGoalClosureRequiredSourceQaIds.includes(qaId) && !explicitQaIds.has(qaId))
    .map((qaId) => {
      const catalogEntry = remoteSourceQaCatalog[qaId];
      const requiresExternalPendingDisposition = externalPendingQaIds.includes(qaId);
      return remoteSourceQaReviewItemSchema.parse({
        schemaVersion: 1,
        qaId,
        decisionKey: catalogEntry.decisionKey,
        requirementId: catalogEntry.requirementId,
        disposition: requiresExternalPendingDisposition ? "external_pending" : "validated",
        evidenceRefs: ["claw remote closure-gate --reviewed-source-qa-ids"],
        reviewedAt: generatedAt,
        writes: false,
      });
    });
  const invalidExternalPendingDispositionQaIds = [...new Set([...explicitReviews, ...idOnlyReviews]
    .filter((entry) => externalPendingQaIds.includes(entry.qaId) && entry.disposition !== "external_pending")
    .map((entry) => entry.qaId))];
  const validItems = [...explicitReviews, ...idOnlyReviews].filter((entry) => {
    const catalogEntry = remoteSourceQaCatalog[entry.qaId];
    return catalogEntry
      && catalogEntry.decisionKey === entry.decisionKey
      && catalogEntry.requirementId === entry.requirementId
      && entry.evidenceRefs.length > 0
      && !duplicateSourceQaIds.includes(entry.qaId)
      && !invalidExternalPendingDispositionQaIds.includes(entry.qaId)
      && entry.writes === false;
  });
  const reviewedSourceQaIds = [...new Set(validItems.map((entry) => entry.qaId))].filter((qaId) => remoteGoalClosureRequiredSourceQaIds.includes(qaId));
  const missingSourceQaIds = remoteGoalClosureRequiredSourceQaIds.filter((qaId) => !reviewedSourceQaIds.includes(qaId));
  const invalidSourceQaIds = [...new Set([...explicitReviews, ...idOnlyReviews].map((entry) => entry.qaId))]
    .filter((qaId) => !reviewedSourceQaIds.includes(qaId));
  return remoteSourceQaReviewReportSchema.parse({
    schemaVersion: 1,
    reportId: sourceQaReviewReportId(["report", generatedAt]),
    generatedAt,
    status: missingSourceQaIds.length === 0 && invalidSourceQaIds.length === 0 ? "complete" : "incomplete",
    requiredSourceQaIds: remoteGoalClosureRequiredSourceQaIds,
    reviewedSourceQaIds,
    missingSourceQaIds,
    invalidSourceQaIds,
    duplicateSourceQaIds,
    externalPendingRequiredSourceQaIds: externalPendingQaIds,
    invalidExternalPendingDispositionQaIds,
    items: validItems,
    writes: false,
  });
}

export function buildRemoteSourceQaReviewTemplate(input: {
  generatedAt?: string;
  sourceQaIds?: string[];
} = {}): RemoteSourceQaReviewTemplate {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const requestedIds = input.sourceQaIds?.length ? input.sourceQaIds : remoteGoalClosureRequiredSourceQaIds;
  const sourceQaIds = requestedIds.filter((qaId) => remoteGoalClosureRequiredSourceQaIds.includes(qaId));
  const items = sourceQaIds.map((qaId) => {
    const catalogEntry = remoteSourceQaCatalog[qaId];
    return remoteSourceQaReviewTemplateItemSchema.parse({
      schemaVersion: 1,
      qaId,
      decisionKey: catalogEntry.decisionKey,
      requirementId: catalogEntry.requirementId,
      reviewed: false,
      disposition: null,
      evidenceRefs: [],
      reviewedAt: null,
      writes: false,
    });
  });
  return remoteSourceQaReviewTemplateSchema.parse({
    schemaVersion: 1,
    templateId: sourceQaReviewTemplateId(["template", generatedAt]),
    sourceConversationId: remoteSourceConversationId,
    sourcePlanId: remoteSourcePlanId,
    generatedAt,
    status: "incomplete",
    requiredSourceQaIds: sourceQaIds,
    reviewCount: items.length,
    submissionCommand: "claw remote closure-gate --source-qa-review-json '<completed RemoteSourceQaReviewItem[]>' --json",
    items,
    instructions: [
      "Review each source Q/A row against the current implementation before filling this template.",
      "Convert each completed row into a RemoteSourceQaReviewItem with disposition, non-empty evidenceRefs, reviewedAt, and writes false.",
      "Use disposition external_pending only for physical/provider rows that cannot be completed locally.",
      "Do not submit this template directly; incomplete rows are intentionally rejected by the closure gate.",
    ],
    writes: false,
  });
}

export function buildRemoteGoalClosureGate(input: {
  generatedAt?: string;
  reviewedSourceQaIds?: string[];
  sourceQaReviews?: RemoteSourceQaReviewItem[];
  evidence?: RemoteExternalValidationEvidence[];
} = {}): RemoteGoalClosureGate {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const sourceQaReviewReport = buildRemoteSourceQaReviewReport({
    generatedAt,
    reviewedSourceQaIds: input.reviewedSourceQaIds,
    reviews: input.sourceQaReviews,
  });
  const externalValidationReport = buildRemoteExternalValidationReport({
    generatedAt,
    evidence: input.evidence,
  });
  const blockers: Array<"source_qa_review" | "external_validation"> = [];
  if (sourceQaReviewReport.status !== "complete") blockers.push("source_qa_review");
  if (externalValidationReport.status !== "clearable") blockers.push("external_validation");
  return remoteGoalClosureGateSchema.parse({
    schemaVersion: 1,
    gateId: remoteGoalClosureGateId(["gate", generatedAt]),
    generatedAt,
    status: blockers.length === 0 ? "clearable" : "blocked",
    requiredSourceQaIds: remoteGoalClosureRequiredSourceQaIds,
    reviewedSourceQaIds: sourceQaReviewReport.reviewedSourceQaIds,
    missingSourceQaIds: sourceQaReviewReport.missingSourceQaIds,
    invalidSourceQaIds: sourceQaReviewReport.invalidSourceQaIds,
    duplicateSourceQaIds: sourceQaReviewReport.duplicateSourceQaIds,
    externalPendingRequiredSourceQaIds: sourceQaReviewReport.externalPendingRequiredSourceQaIds,
    invalidExternalPendingDispositionQaIds: sourceQaReviewReport.invalidExternalPendingDispositionQaIds,
    sourceQaReviewStatus: sourceQaReviewReport.status,
    sourceQaReviewItems: sourceQaReviewReport.items,
    externalValidationStatus: externalValidationReport.status,
    blockedExternalRequirementIds: externalValidationReport.blockedRequirementIds,
    clearableExternalRequirementIds: externalValidationReport.clearableRequirementIds,
    blockers,
    writes: false,
  });
}
