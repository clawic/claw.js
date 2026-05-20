import { z } from "zod";

import { buildRemoteConformanceReport, buildRemoteExternalPendingRegister, remoteSyncRequiredRouteIds } from "./remote-sync.ts";

export const remoteProviderDeviceE2EDomainSchema = z.enum([
  "chat",
  "search",
  "sync",
  "secret_refs",
  "hosted_agents",
]);

export const remoteProviderDeviceE2ETopologyTargetSchema = z.enum([
  "personal_mesh",
  "mac_host",
  "linux_host",
  "windows_host",
  "server_host",
  "headless_server",
  "vps_host",
  "mobile_client",
  "browser_client",
  "self_hosted_gateway",
  "hosted_gateway",
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
  requiredTopologyTargets: z.array(remoteProviderDeviceE2ETopologyTargetSchema).min(11),
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
export type RemoteProviderDeviceE2ETopologyTarget = z.infer<typeof remoteProviderDeviceE2ETopologyTargetSchema>;
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
  approvalRequestId: z.string().min(1),
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
  sourceBoundEvidencePresent: z.boolean(),
  approvalRequestBoundEvidencePresent: z.boolean(),
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

export const remoteExternalValidationRunbookSchema = z.object({
  schemaVersion: z.literal(1),
  runbookId: z.string().min(1),
  sourceConversationId: z.string().min(1),
  sourcePlanId: z.string().min(1),
  generatedAt: z.string().datetime(),
  status: z.literal("external_pending"),
  e2ePlan: remoteProviderDeviceE2EValidationPlanSchema,
  checklist: remoteExternalValidationChecklistSchema,
  evidenceArtifact: remoteExternalValidationEvidenceArtifactSchema,
  validationStepCount: z.number().int().nonnegative(),
  externalRequirementCount: z.number().int().nonnegative(),
  reportCommand: z.string().min(1),
  closureGateCommand: z.string().min(1),
  requiredCommands: z.array(z.string().min(1)).min(1),
  instructions: z.array(z.string().min(1)).min(1),
  writes: z.literal(false),
});

export const remoteExternalValidationReadinessSchema = z.object({
  schemaVersion: z.literal(1),
  readinessId: z.string().min(1),
  sourceConversationId: z.string().min(1),
  sourcePlanId: z.string().min(1),
  generatedAt: z.string().datetime(),
  status: z.enum(["not_ready", "ready_for_approved_run", "ready_for_goal_closure"]),
  sourceQaReady: z.boolean(),
  sourceQaReviewStatus: z.enum(["incomplete", "complete"]),
  missingSourceQaIds: z.array(z.string().min(1)),
  invalidSourceQaIds: z.array(z.string().min(1)),
  duplicateSourceQaIds: z.array(z.string().min(1)),
  invalidExternalPendingDispositionQaIds: z.array(z.string().min(1)),
  externalEvidenceReady: z.boolean(),
  externalValidationStatus: z.enum(["external_pending", "clearable"]),
  evidenceCount: z.number().int().nonnegative(),
  requiredEvidenceCount: z.number().int().nonnegative(),
  missingEvidenceRequirementIds: z.array(z.string().min(1)),
  invalidEvidenceRequirementIds: z.array(z.string().min(1)),
  duplicateEvidenceRequirementIds: z.array(z.string().min(1)),
  clearableExternalRequirementIds: z.array(z.string().min(1)),
  blockedExternalRequirementIds: z.array(z.string().min(1)),
  runbookReady: z.boolean(),
  checklistReady: z.boolean(),
  e2ePlanReady: z.boolean(),
  validationStepCount: z.number().int().nonnegative(),
  externalRequirementCount: z.number().int().nonnegative(),
  closureGateStatus: z.enum(["blocked", "clearable"]),
  closureGateBlockers: z.array(z.enum(["source_qa_review", "external_validation"])),
  requiredCommands: z.array(z.string().min(1)).min(1),
  nextAction: z.string().min(1),
  instructions: z.array(z.string().min(1)).min(1),
  writes: z.literal(false),
});

export const remoteExternalValidationApprovalRequestSchema = z.object({
  schemaVersion: z.literal(1),
  requestId: z.string().min(1),
  sourceConversationId: z.string().min(1),
  sourcePlanId: z.string().min(1),
  generatedAt: z.string().datetime(),
  status: z.literal("approval_required"),
  approvalRequired: z.literal(true),
  approved: z.literal(false),
  readinessStatus: z.enum(["not_ready", "ready_for_approved_run", "ready_for_goal_closure"]),
  requirementIds: z.array(z.string().min(1)).min(1),
  validationDomains: z.array(remoteProviderDeviceE2EDomainSchema).min(1),
  validationTopologyTargets: z.array(remoteProviderDeviceE2ETopologyTargetSchema).min(1),
  validationRouteIds: z.array(z.string().min(1)).min(1),
  requiredCommands: z.array(z.string().min(1)).min(1),
  approvalScope: z.array(z.string().min(1)).min(1),
  prohibitedActions: z.array(z.string().min(1)).min(1),
  readiness: remoteExternalValidationReadinessSchema,
  runbook: remoteExternalValidationRunbookSchema,
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

export const remoteSourceQaReviewArtifactSchema = z.object({
  schemaVersion: z.literal(1),
  sourceConversationId: z.string().min(1),
  sourcePlanId: z.string().min(1),
  reviewedAt: z.string().datetime().optional(),
  status: z.string().min(1),
  items: z.array(remoteSourceQaReviewItemSchema).min(1),
  writes: z.literal(false).optional(),
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
  externalPendingRequiredSourceQaIds: z.array(z.string().min(1)),
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
  finalSourceSessionRereadRequired: z.literal(true),
  sourceSessionRereadCommand: z.string().min(1),
  writes: z.literal(false),
});

export const remoteDecisionReviewItemSchema = z.object({
  schemaVersion: z.literal(1),
  qaId: z.string().min(1),
  decisionId: z.string().min(1),
  requirementId: z.string().min(1),
  reviewStatus: z.enum(["missing", "invalid", "reviewed"]),
  disposition: remoteSourceQaReviewDispositionSchema.nullable(),
  evidenceRefs: z.array(z.string().min(1)),
  conformanceStatus: z.enum(["must_verify_before_goal_completion"]).nullable(),
  externalPendingRequired: z.boolean(),
  writes: z.literal(false),
});

export const remoteDecisionReviewSchema = z.object({
  schemaVersion: z.literal(1),
  reviewId: z.string().min(1),
  generatedAt: z.string().datetime(),
  status: z.enum(["incomplete", "complete"]),
  sourceConversationId: z.string().min(1),
  sourcePlanId: z.string().min(1),
  reviewedCount: z.number().int().nonnegative(),
  requiredCount: z.number().int().nonnegative(),
  implementedCount: z.number().int().nonnegative(),
  externalPendingCount: z.number().int().nonnegative(),
  missingSourceQaIds: z.array(z.string().min(1)),
  invalidSourceQaIds: z.array(z.string().min(1)),
  duplicateSourceQaIds: z.array(z.string().min(1)),
  invalidExternalPendingDispositionQaIds: z.array(z.string().min(1)),
  blockers: z.array(z.enum(["source_qa_review", "external_validation"])),
  items: z.array(remoteDecisionReviewItemSchema).min(1),
  writes: z.literal(false),
});

export type RemoteExternalValidationEvidence = z.infer<typeof remoteExternalValidationEvidenceSchema>;
export type RemoteExternalValidationEvidenceEnvelope = z.infer<typeof remoteExternalValidationEvidenceEnvelopeSchema>;
export type RemoteExternalValidationEvidenceArtifact = z.infer<typeof remoteExternalValidationEvidenceArtifactSchema>;
export type RemoteExternalValidationReportItem = z.infer<typeof remoteExternalValidationReportItemSchema>;
export type RemoteExternalValidationReport = z.infer<typeof remoteExternalValidationReportSchema>;
export type RemoteExternalValidationEvidenceTemplate = z.infer<typeof remoteExternalValidationEvidenceTemplateSchema>;
export type RemoteExternalValidationRunbook = z.infer<typeof remoteExternalValidationRunbookSchema>;
export type RemoteExternalValidationReadiness = z.infer<typeof remoteExternalValidationReadinessSchema>;
export type RemoteExternalValidationApprovalRequest = z.infer<typeof remoteExternalValidationApprovalRequestSchema>;
export type RemoteSourceQaReviewDisposition = z.infer<typeof remoteSourceQaReviewDispositionSchema>;
export type RemoteSourceQaReviewItem = z.infer<typeof remoteSourceQaReviewItemSchema>;
export type RemoteSourceQaReviewArtifact = z.infer<typeof remoteSourceQaReviewArtifactSchema>;
export type RemoteSourceQaReviewReport = z.infer<typeof remoteSourceQaReviewReportSchema>;
export type RemoteSourceQaReviewTemplateItem = z.infer<typeof remoteSourceQaReviewTemplateItemSchema>;
export type RemoteSourceQaReviewTemplate = z.infer<typeof remoteSourceQaReviewTemplateSchema>;
export type RemoteGoalClosureGate = z.infer<typeof remoteGoalClosureGateSchema>;
export type RemoteDecisionReviewItem = z.infer<typeof remoteDecisionReviewItemSchema>;
export type RemoteDecisionReview = z.infer<typeof remoteDecisionReviewSchema>;

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

const providerDeviceE2ERequiredTopologyTargets = [
  "personal_mesh",
  "mac_host",
  "linux_host",
  "windows_host",
  "server_host",
  "headless_server",
  "vps_host",
  "mobile_client",
  "browser_client",
  "self_hosted_gateway",
  "hosted_gateway",
] as const satisfies readonly RemoteProviderDeviceE2ETopologyTarget[];

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
    requiredTopologyTargets: providerDeviceE2ERequiredTopologyTargets,
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
    requiredCommand: "claw nodes heartbeat --record true --transport iroh --physical-verified true --approved-run-ref <approved-run-ref> --physical-evidence-ref <physical-evidence-ref>",
    requiredArtifacts: ["RemoteTransportHandshakeReceipt", "Coordinator signature", "physical node logs"],
    acceptanceCriteria: [
      "two approved nodes complete a real Iroh handshake",
      "transport receipt records physicalTransportVerified: true",
      "receipt is signed and later verifiable from the Coordinator ledger",
    ],
  },
  device_trust_acceptance: {
    requiredCommand: "claw nodes trust --record true --physical-accepted true --approved-run-ref <approved-run-ref> --physical-evidence-ref <physical-evidence-ref>",
    requiredArtifacts: ["NodeTrustDecision", "device acceptance prompt/result", "Coordinator signature"],
    acceptanceCriteria: [
      "the subject device is physically accepted by an approved actor",
      "allow decisions do not become authoritative without physicalAcceptanceVerified: true",
      "deny and revoke decisions remain audited",
    ],
  },
  physical_peer_trust: {
    requiredCommand: "claw mesh accept --record true --physical-peer-trust true --approved-run-ref <approved-run-ref> --physical-evidence-ref <physical-evidence-ref>",
    requiredArtifacts: ["MeshInvitationAcceptance", "peer device evidence", "Coordinator signature"],
    acceptanceCriteria: [
      "the accepted mesh invitation is bound to the intended peer",
      "physical peer trust is verified before share/sync rights are usable",
      "revocation remains possible through the same mesh ledger",
    ],
  },
  physical_sync_driver_application: {
    requiredCommand: "claw sync apply --record true --physical-driver-applied true --approved-run-ref <approved-run-ref> --physical-evidence-ref <physical-evidence-ref>",
    requiredArtifacts: ["SyncDriverApplicationReceipt", "before/after resource evidence", "Coordinator signature"],
    acceptanceCriteria: [
      "an approved driver applies a real resource change or merge",
      "conflicts are detected and elevated instead of overwritten",
      "the application receipt is signed and links to the resource manifest",
    ],
  },
  physical_authority_handoff: {
    requiredCommand: "claw sync handoff --record true --physical-authority-applied true --approved-run-ref <approved-run-ref> --physical-evidence-ref <physical-evidence-ref>",
    requiredArtifacts: ["SyncAuthorityHandoffReceipt", "source node state", "target node state"],
    acceptanceCriteria: [
      "authority and residency transfer between approved nodes is physically observed",
      "the old authority cannot continue as primary after handoff",
      "the signed handoff remains verifiable in sync status",
    ],
  },
  signed_host_audit_persistence: {
    requiredCommand: "claw gateway audit --record true --host-audit-persisted true --approved-run-ref <approved-run-ref> --physical-evidence-ref <physical-evidence-ref>",
    requiredArtifacts: ["RemoteGatewayAuditReceipt", "signed host audit record", "audit store verification"],
    acceptanceCriteria: [
      "the Gateway decision is persisted in the signed host audit store",
      "actor, action, resource, policy, and decision are present",
      "the persisted audit event signature verifies",
    ],
  },
  physical_client_storage: {
    requiredCommand: "claw sync cache --record true --physical-client true --approved-run-ref <approved-run-ref> --physical-evidence-ref <physical-evidence-ref>",
    requiredArtifacts: ["RemoteClientCacheSnapshot", "client storage inspection", "TTL expiration evidence"],
    acceptanceCriteria: [
      "real client cache storage is encrypted",
      "cache entries expire by TTL",
      "cache stores no authoritative state and no plaintext material",
    ],
  },
  provider_secret_retrieval: {
    requiredCommand: "claw gateway secret-provider --record true --provider-verified true --approved-run-ref <approved-run-ref> --physical-evidence-ref <physical-evidence-ref>",
    requiredArtifacts: ["RemoteSecretProviderReceipt", "broker lease audit", "provider request trace"],
    acceptanceCriteria: [
      "provider retrieval happens through a broker lease",
      "remote responses include references only, never plaintext material",
      "lease use is audited and bounded",
    ],
  },
  self_hosted_deployment: {
    requiredCommand: "claw gateway serve --record true --physical-verified true --approved-run-ref <approved-run-ref> --physical-evidence-ref <physical-evidence-ref>",
    requiredArtifacts: ["GatewayDeploymentManifest", "self-hosted process health", "remote conformance output"],
    acceptanceCriteria: [
      "a real self-hosted Gateway binds and serves the registered contract",
      "route contracts match local registered API routes",
      "self-hosted mode passes the same conformance report as hosted mode",
    ],
  },
  hosted_deployment: {
    requiredCommand: "claw gateway project --record true --physical-verified true --approved-run-ref <approved-run-ref> --physical-evidence-ref <physical-evidence-ref>",
    requiredArtifacts: ["GatewayDeploymentManifest", "hosted rollout evidence", "remote conformance output"],
    acceptanceCriteria: [
      "a real hosted rollout serves the registered contract",
      "hosted mode does not introduce a parallel API",
      "hosted mode passes the same conformance report as self-hosted mode",
    ],
  },
  agent_runtime_execution: {
    requiredCommand: "claw gateway agent-service --record true --runtime-verified true --approved-run-ref <approved-run-ref> --physical-evidence-ref <physical-evidence-ref>",
    requiredArtifacts: ["RemoteAgentServiceExecutionReceipt", "runtime execution log", "tenant isolation evidence"],
    acceptanceCriteria: [
      "an approved remote agent-service run executes through governed control",
      "assignment, budget, isolation key, and audit reference are present",
      "runtime execution is linked to the tenant and route contract",
    ],
  },
  billing_meter_persistence: {
    requiredCommand: "claw gateway agent-service --record true --billing-meter-persisted true --approved-run-ref <approved-run-ref> --physical-evidence-ref <physical-evidence-ref>",
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
      "the run covers personal mesh, server host, OS hosts, headless/VPS, mobile/browser clients, self-hosted Gateway, and hosted Gateway topology targets",
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

function externalValidationRunbookId(parts: string[]): string {
  return `remote_external_validation_runbook_${parts.join("_").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase()}`;
}

function externalValidationReadinessId(parts: string[]): string {
  return `remote_external_validation_readiness_${parts.join("_").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase()}`;
}

function externalValidationApprovalRequestId(parts: string[]): string {
  return `remote_external_validation_approval_request_${parts.join("_").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase()}`;
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
export const remoteSourceSessionRereadCommand = "REMOTE_SYNC_SOURCE_SESSION=<local-source-session-jsonl> npm run test:remote-sync-source-session";

function assertRemoteSourceBinding(kind: string, sourceConversationId: string, sourcePlanId: string): void {
  if (sourceConversationId !== remoteSourceConversationId) {
    throw new Error(`${kind} sourceConversationId ${sourceConversationId} does not match ${remoteSourceConversationId}`);
  }
  if (sourcePlanId !== remoteSourcePlanId) {
    throw new Error(`${kind} sourcePlanId ${sourcePlanId} does not match ${remoteSourcePlanId}`);
  }
}

function assertRemoteApprovalRequestBinding(kind: string, approvalRequestId: string, generatedAt: string): void {
  const expectedApprovalRequestId = externalValidationApprovalRequestId(["request", generatedAt]);
  if (approvalRequestId !== expectedApprovalRequestId) {
    throw new Error(`${kind} approvalRequestId ${approvalRequestId} does not match ${expectedApprovalRequestId}`);
  }
}

export function parseRemoteExternalValidationEvidenceInput(input: unknown): RemoteExternalValidationEvidence[] {
  if (input === undefined || input === null) return [];
  if (Array.isArray(input)) return input.map((entry) => remoteExternalValidationEvidenceSchema.parse(entry));
  if (input && typeof input === "object" && Array.isArray((input as { evidence?: unknown }).evidence)) {
    if (
      "sourceConversationId" in input
      || "sourcePlanId" in input
      || "generatedAt" in input
      || "status" in input
      || "writes" in input
    ) {
      const envelope = remoteExternalValidationEvidenceArtifactSchema.parse(input);
      assertRemoteSourceBinding("external validation evidence artifact", envelope.sourceConversationId, envelope.sourcePlanId);
      assertRemoteApprovalRequestBinding("external validation evidence artifact", envelope.approvalRequestId, envelope.generatedAt);
      return envelope.evidence;
    }
    const envelope = remoteExternalValidationEvidenceEnvelopeSchema.parse(input);
    return envelope.evidence;
  }
  return [remoteExternalValidationEvidenceSchema.parse(input)];
}

export function parseRemoteSourceQaReviewInput(input: unknown): RemoteSourceQaReviewItem[] {
  if (input === undefined || input === null) return [];
  if (Array.isArray(input)) return input.map((entry) => remoteSourceQaReviewItemSchema.parse(entry));
  if (input && typeof input === "object" && Array.isArray((input as { items?: unknown }).items)) {
    if (
      "sourceConversationId" in input
      || "sourcePlanId" in input
      || "reviewedAt" in input
    ) {
      const artifact = remoteSourceQaReviewArtifactSchema.parse(input);
      assertRemoteSourceBinding("source Q/A review artifact", artifact.sourceConversationId, artifact.sourcePlanId);
      return artifact.items;
    }
    return (input as { items: unknown[] }).items.map((entry) => remoteSourceQaReviewItemSchema.parse(entry));
  }
  return [remoteSourceQaReviewItemSchema.parse(input)];
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

function remoteDecisionReviewId(parts: string[]): string {
  return `remote_decision_review_${parts.join("_").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase()}`;
}

function externalPendingRequiredSourceQaIds(generatedAt: string): string[] {
  return [...new Set(
    [
      "QA-004",
      ...buildRemoteExternalPendingRegister({ generatedAt }).requirements
        .map((entry) => remoteSourceQaIdsByDecisionKey.get(entry.decisionId))
        .filter((qaId): qaId is string => !!qaId),
    ],
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
  evidenceArtifact?: unknown;
} = {}): RemoteExternalValidationReport {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const checklist = buildRemoteExternalValidationChecklist({ generatedAt });
  const checklistRequirementIds = new Set(checklist.requirementIds);
  const evidenceArtifact = input.evidenceArtifact === undefined
    ? undefined
    : remoteExternalValidationEvidenceArtifactSchema.parse(input.evidenceArtifact);
  if (evidenceArtifact) {
    assertRemoteSourceBinding("external validation evidence artifact", evidenceArtifact.sourceConversationId, evidenceArtifact.sourcePlanId);
    assertRemoteApprovalRequestBinding("external validation evidence artifact", evidenceArtifact.approvalRequestId, evidenceArtifact.generatedAt);
  }
  const sourceBoundEvidencePresent = evidenceArtifact !== undefined;
  const approvalRequestBoundEvidencePresent = evidenceArtifact !== undefined;
  const parsedEvidence = evidenceArtifact
    ? evidenceArtifact.evidence
    : (input.evidence ?? []).map((entry) => remoteExternalValidationEvidenceSchema.parse(entry));
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
      && sourceBoundEvidencePresent
      && approvalRequestBoundEvidencePresent
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
    sourceBoundEvidencePresent,
    approvalRequestBoundEvidencePresent,
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
    submissionCommand: "claw remote validation-report --evidence-file docs/governance/remote-gateway-sync/external-validation-evidence.json --json",
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
    approvalRequestId: externalValidationApprovalRequestId(["request", generatedAt]),
    generatedAt,
    status: "external_pending",
    writes: false,
    evidence,
  });
}

export function buildRemoteExternalValidationRunbook(input: {
  generatedAt?: string;
} = {}): RemoteExternalValidationRunbook {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const e2ePlan = buildRemoteProviderDeviceE2EValidationPlan({ createdAt: generatedAt });
  const checklist = buildRemoteExternalValidationChecklist({ generatedAt });
  const evidenceArtifact = buildRemoteExternalValidationEvidenceArtifact({ generatedAt });
  return remoteExternalValidationRunbookSchema.parse({
    schemaVersion: 1,
    runbookId: externalValidationRunbookId(["runbook", generatedAt]),
    sourceConversationId: remoteSourceConversationId,
    sourcePlanId: remoteSourcePlanId,
    generatedAt,
    status: "external_pending",
    e2ePlan,
    checklist,
    evidenceArtifact,
    validationStepCount: e2ePlan.validationSteps.length,
    externalRequirementCount: checklist.requirementIds.length,
    reportCommand: "claw remote validation-report --evidence-file docs/governance/remote-gateway-sync/external-validation-evidence.json --json",
    closureGateCommand: "claw remote closure-gate --source-qa-review-file docs/governance/remote-gateway-sync/source-review.json --external-validation-file docs/governance/remote-gateway-sync/external-validation-evidence.json --json",
    requiredCommands: [
      "claw remote e2e-plan --json",
      "claw remote validation-checklist --json",
	      "claw remote validation-artifact --json",
	      "claw remote validation-report --evidence-file docs/governance/remote-gateway-sync/external-validation-evidence.json --json",
	      "claw remote decision-review --source-qa-review-file docs/governance/remote-gateway-sync/source-review.json --external-validation-file docs/governance/remote-gateway-sync/external-validation-evidence.json --json",
	      remoteSourceSessionRereadCommand,
	      "claw remote closure-gate --source-qa-review-file docs/governance/remote-gateway-sync/source-review.json --external-validation-file docs/governance/remote-gateway-sync/external-validation-evidence.json --json",
	    ],
    instructions: [
      "Run the approved physical/provider validation for every validationSteps domain before changing evidence rows.",
      "Keep approvedRun false until an approved run has an approval/audit reference and physical evidence.",
      "After each approved run, fill approvedRunRef, physicalEvidenceRef, artifactRefs, and acceptedCriteria for the matching external requirement.",
      "Never attach plaintext secrets or raw credential material.",
      "The closure gate remains blocked until the evidence report is clearable and the source Q/A review remains complete.",
    ],
    writes: false,
  });
}

export function buildRemoteExternalValidationReadiness(input: {
  generatedAt?: string;
  sourceQaReviews?: RemoteSourceQaReviewItem[];
  reviewedSourceQaIds?: string[];
  evidence?: RemoteExternalValidationEvidence[];
  evidenceArtifact?: unknown;
} = {}): RemoteExternalValidationReadiness {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const sourceQaReport = buildRemoteSourceQaReviewReport({
    generatedAt,
    reviews: input.sourceQaReviews,
    reviewedSourceQaIds: input.reviewedSourceQaIds,
  });
  const evidenceArtifact = input.evidenceArtifact === undefined
    ? undefined
    : remoteExternalValidationEvidenceArtifactSchema.parse(input.evidenceArtifact);
  const evidence = evidenceArtifact
    ? parseRemoteExternalValidationEvidenceInput(evidenceArtifact)
    : (input.evidence ?? []).map((entry) => remoteExternalValidationEvidenceSchema.parse(entry));
  const checklist = buildRemoteExternalValidationChecklist({ generatedAt });
  const report = buildRemoteExternalValidationReport({ generatedAt, evidence, evidenceArtifact });
  const runbook = buildRemoteExternalValidationRunbook({ generatedAt });
  const gate = buildRemoteGoalClosureGate({
    generatedAt,
    sourceQaReviews: sourceQaReport.items,
    evidence,
    evidenceArtifact,
  });
  const evidenceIds = new Set(evidence.map((entry) => entry.requirementId));
  const missingEvidenceRequirementIds = checklist.requirementIds.filter((requirementId) => !evidenceIds.has(requirementId));
  const sourceQaReady = sourceQaReport.status === "complete"
    && sourceQaReport.missingSourceQaIds.length === 0
    && sourceQaReport.invalidSourceQaIds.length === 0
    && sourceQaReport.duplicateSourceQaIds.length === 0
    && sourceQaReport.invalidExternalPendingDispositionQaIds.length === 0;
  const evidenceIdsReady = missingEvidenceRequirementIds.length === 0
    && report.invalidEvidenceRequirementIds.length === 0
    && report.duplicateEvidenceRequirementIds.length === 0;
  const pendingEvidenceRowsReady = evidence.every((entry) => entry.approvedRun === false
    && entry.approvedRunRef === undefined
    && entry.physicalEvidenceRef === undefined
    && entry.artifactRefs.length === 0
    && entry.acceptedCriteria.length === 0
    && entry.plaintextMaterialIncluded === false
    && entry.writes === false);
  const clearableEvidenceReady = report.status === "clearable"
    && report.blockedRequirementIds.length === 0
    && report.clearableRequirementIds.length === checklist.requirementIds.length;
  const externalEvidenceReady = evidenceIdsReady
    && report.sourceBoundEvidencePresent
    && report.approvalRequestBoundEvidencePresent
    && (pendingEvidenceRowsReady || clearableEvidenceReady);
  const validationDomains = new Set(runbook.e2ePlan.validationSteps.map((entry) => entry.domain));
  const e2ePlanReady = runbook.e2ePlan.validationSteps.length === 5
    && ["chat", "search", "sync", "secret_refs", "hosted_agents"].every((domain) => validationDomains.has(domain as RemoteProviderDeviceE2EDomain))
    && runbook.e2ePlan.requiredExternalPendingIds.length === checklist.requirementIds.length
    && runbook.e2ePlan.writes === false;
  const checklistReady = checklist.coverage.missingRequirementIds.length === 0
    && checklist.coverage.coveredRequirementCount === checklist.coverage.requirementCount
    && checklist.items.every((entry) => entry.approvedRunRequired && entry.physicalEvidenceRequired && entry.writes === false);
  const runbookReady = runbook.writes === false
    && runbook.checklist.requirementIds.length === checklist.requirementIds.length
    && runbook.evidenceArtifact.evidence.length === checklist.requirementIds.length
	    && runbook.requiredCommands.some((entry) => entry.includes("validation-artifact"))
	    && runbook.requiredCommands.some((entry) => entry.includes("validation-report"))
	    && runbook.requiredCommands.some((entry) => entry.includes("decision-review"))
	    && runbook.requiredCommands.some((entry) => entry.includes("test:remote-sync-source-session"))
	    && runbook.requiredCommands.some((entry) => entry.includes("closure-gate"));
  const readyForApprovedRun = sourceQaReady
    && externalEvidenceReady
    && pendingEvidenceRowsReady
    && report.status === "external_pending"
    && runbookReady
    && checklistReady
    && e2ePlanReady
    && gate.status === "blocked"
    && gate.blockers.length === 1
    && gate.blockers[0] === "external_validation";
  const status = gate.status === "clearable"
    ? "ready_for_goal_closure"
    : readyForApprovedRun ? "ready_for_approved_run" : "not_ready";
  const nextAction = status === "ready_for_goal_closure"
    ? "Run the final source Q/A reread against current implementation, then close the goal if all evidence still proves completion."
    : status === "ready_for_approved_run"
      ? "Run the approved physical/provider validation and replace pending evidence rows with approvedRunRef, physicalEvidenceRef, artifacts, and accepted criteria."
      : "Complete the source Q/A review artifact and evidence artifact readiness gaps before requesting a physical/provider validation run.";
  return remoteExternalValidationReadinessSchema.parse({
    schemaVersion: 1,
    readinessId: externalValidationReadinessId(["readiness", generatedAt]),
    sourceConversationId: remoteSourceConversationId,
    sourcePlanId: remoteSourcePlanId,
    generatedAt,
    status,
    sourceQaReady,
    sourceQaReviewStatus: sourceQaReport.status,
    missingSourceQaIds: sourceQaReport.missingSourceQaIds,
    invalidSourceQaIds: sourceQaReport.invalidSourceQaIds,
    duplicateSourceQaIds: sourceQaReport.duplicateSourceQaIds,
    invalidExternalPendingDispositionQaIds: sourceQaReport.invalidExternalPendingDispositionQaIds,
    externalEvidenceReady,
    externalValidationStatus: report.status,
    evidenceCount: report.evidenceCount,
    requiredEvidenceCount: checklist.requirementIds.length,
    missingEvidenceRequirementIds,
    invalidEvidenceRequirementIds: report.invalidEvidenceRequirementIds,
    duplicateEvidenceRequirementIds: report.duplicateEvidenceRequirementIds,
    clearableExternalRequirementIds: report.clearableRequirementIds,
    blockedExternalRequirementIds: report.blockedRequirementIds,
    runbookReady,
    checklistReady,
    e2ePlanReady,
    validationStepCount: runbook.validationStepCount,
    externalRequirementCount: runbook.externalRequirementCount,
    closureGateStatus: gate.status,
    closureGateBlockers: gate.blockers,
    requiredCommands: runbook.requiredCommands,
    nextAction,
    instructions: [
      "This readiness gate is no-write and does not approve physical/provider validation by itself.",
      "Use ready_for_approved_run only as the handoff point before an explicitly approved real validation run.",
      "Keep external evidence rows unapproved until the real run provides approvedRunRef and physical/provider evidence.",
    ],
    writes: false,
  });
}

export function buildRemoteExternalValidationApprovalRequest(input: {
  generatedAt?: string;
  sourceQaReviews?: RemoteSourceQaReviewItem[];
  reviewedSourceQaIds?: string[];
  evidence?: RemoteExternalValidationEvidence[];
  evidenceArtifact?: unknown;
} = {}): RemoteExternalValidationApprovalRequest {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const evidenceArtifact = input.evidenceArtifact === undefined
    ? undefined
    : remoteExternalValidationEvidenceArtifactSchema.parse(input.evidenceArtifact);
  const evidence = evidenceArtifact
    ? parseRemoteExternalValidationEvidenceInput(evidenceArtifact)
    : (input.evidence ?? []).map((entry) => remoteExternalValidationEvidenceSchema.parse(entry));
  const runbook = buildRemoteExternalValidationRunbook({ generatedAt });
  const readiness = buildRemoteExternalValidationReadiness({
    generatedAt,
    sourceQaReviews: input.sourceQaReviews,
    reviewedSourceQaIds: input.reviewedSourceQaIds,
    evidence,
    evidenceArtifact,
  });
  return remoteExternalValidationApprovalRequestSchema.parse({
    schemaVersion: 1,
    requestId: externalValidationApprovalRequestId(["request", generatedAt]),
    sourceConversationId: remoteSourceConversationId,
    sourcePlanId: remoteSourcePlanId,
    generatedAt,
    status: "approval_required",
    approvalRequired: true,
    approved: false,
    readinessStatus: readiness.status,
    requirementIds: runbook.checklist.requirementIds,
    validationDomains: runbook.e2ePlan.requiredDomains,
    validationTopologyTargets: runbook.e2ePlan.requiredTopologyTargets,
    validationRouteIds: runbook.e2ePlan.requiredRouteIds,
    requiredCommands: [
      "claw remote validation-readiness --source-qa-review-file docs/governance/remote-gateway-sync/source-review.json --external-validation-file docs/governance/remote-gateway-sync/external-validation-evidence.json --json",
      ...runbook.requiredCommands,
    ],
    approvalScope: [
      "Execute physical/provider validation for the 13 RemoteExternalPendingRegister rows only.",
      "Cover chat, search, Sync, secret_refs, and hosted_agents together in the provider/device E2E run.",
      "Cover personal mesh, server host, OS hosts, headless/VPS, mobile/browser clients, self-hosted Gateway, and hosted Gateway targets in the same approved run.",
      "Cover every required remote route contract ID from RemoteProviderDeviceE2EValidationPlan in the same approved run.",
      "Collect approvedRunRef, physicalEvidenceRef, artifactRefs, and acceptedCriteria for each requirement.",
      "Keep source Q/A review complete and source-bound to this goal before and after the run.",
    ],
    prohibitedActions: [
      "Do not mutate production, stores, billing, providers, devices, or hosted deployments without explicit approval for this request.",
      "Do not attach plaintext secrets, raw credentials, access tokens, or decrypted secret material to evidence.",
      "Do not mark approvedRun true without an approval/audit reference and physical evidence reference.",
      "Do not reuse evidence artifacts from another conversation or plan.",
      "Do not call update_goal until the closure gate is clearable and the final source Q/A reread passes.",
    ],
    readiness,
    runbook,
    instructions: [
      "Use this no-write request as the approval packet for the real physical/provider validation run.",
      "A readinessStatus of ready_for_approved_run means the software-side packet is ready, not that approval has been granted.",
      "After approval and execution, replace pending evidence rows and rerun validation-report, decision-review, closure-gate, and readiness.",
    ],
    writes: false,
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
  const externalPendingQaIds = externalPendingRequiredSourceQaIds(generatedAt).filter((qaId) => sourceQaIds.includes(qaId));
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
    externalPendingRequiredSourceQaIds: externalPendingQaIds,
    reviewCount: items.length,
    submissionCommand: "claw remote closure-gate --source-qa-review-json '<completed RemoteSourceQaReviewItem[]>' --json",
    items,
    instructions: [
      "Review each source Q/A row against the current implementation before filling this template.",
      "Convert each completed row into a RemoteSourceQaReviewItem with disposition, non-empty evidenceRefs, reviewedAt, and writes false.",
      "Use disposition external_pending only for the externalPendingRequiredSourceQaIds rows until physical/provider evidence clears.",
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
  evidenceArtifact?: unknown;
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
    evidenceArtifact: input.evidenceArtifact,
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
    finalSourceSessionRereadRequired: true,
    sourceSessionRereadCommand: remoteSourceSessionRereadCommand,
    writes: false,
  });
}

export function buildRemoteDecisionReview(input: {
  generatedAt?: string;
  routeIds?: string[];
  nodeIds?: string[];
  reviewedSourceQaIds?: string[];
  sourceQaReviews?: RemoteSourceQaReviewItem[];
  evidence?: RemoteExternalValidationEvidence[];
  evidenceArtifact?: unknown;
} = {}): RemoteDecisionReview {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const sourceQaReviewTemplate = buildRemoteSourceQaReviewTemplate({ generatedAt });
  const closureGate = buildRemoteGoalClosureGate({
    generatedAt,
    reviewedSourceQaIds: input.reviewedSourceQaIds,
    sourceQaReviews: input.sourceQaReviews,
    evidence: input.evidence,
    evidenceArtifact: input.evidenceArtifact,
  });
  const conformance = buildRemoteConformanceReport({
    routeIds: input.routeIds ?? [],
    nodeIds: input.nodeIds ?? [],
  });
  const reviewedSourceQaById = new Map(closureGate.sourceQaReviewItems.map((item) => [item.qaId, item]));
  const conformanceDecisionStatusById = new Map(conformance.decisions.map((decision) => [decision.decisionId, decision.status]));
  const items = sourceQaReviewTemplate.items.map((item) => {
    const reviewed = reviewedSourceQaById.get(item.qaId);
    const invalid = closureGate.invalidSourceQaIds.includes(item.qaId);
    const missing = closureGate.missingSourceQaIds.includes(item.qaId);
    return remoteDecisionReviewItemSchema.parse({
      schemaVersion: 1,
      qaId: item.qaId,
      decisionId: item.decisionKey,
      requirementId: item.requirementId,
      reviewStatus: invalid ? "invalid" : missing ? "missing" : "reviewed",
      disposition: reviewed?.disposition ?? null,
      evidenceRefs: reviewed?.evidenceRefs ?? [],
      conformanceStatus: conformanceDecisionStatusById.get(item.decisionKey) ?? null,
      externalPendingRequired: sourceQaReviewTemplate.externalPendingRequiredSourceQaIds.includes(item.qaId),
      writes: false,
    });
  });
  return remoteDecisionReviewSchema.parse({
    schemaVersion: 1,
    reviewId: remoteDecisionReviewId(["review", generatedAt]),
    generatedAt,
    status: closureGate.sourceQaReviewStatus,
    sourceConversationId: remoteSourceConversationId,
    sourcePlanId: remoteSourcePlanId,
    reviewedCount: closureGate.reviewedSourceQaIds.length,
    requiredCount: closureGate.requiredSourceQaIds.length,
    implementedCount: items.filter((item) => item.disposition === "implemented").length,
    externalPendingCount: items.filter((item) => item.disposition === "external_pending").length,
    missingSourceQaIds: closureGate.missingSourceQaIds,
    invalidSourceQaIds: closureGate.invalidSourceQaIds,
    duplicateSourceQaIds: closureGate.duplicateSourceQaIds,
    invalidExternalPendingDispositionQaIds: closureGate.invalidExternalPendingDispositionQaIds,
    blockers: closureGate.blockers,
    items,
    writes: false,
  });
}
