import { z } from "zod";

import { buildRemoteExternalPendingRegister, remoteSyncRequiredRouteIds } from "./remote-sync.ts";

export const remoteProviderDeviceE2EDomainSchema = z.enum([
  "chat",
  "search",
  "sync",
  "secret_refs",
  "hosted_agents",
]);

export const remoteProviderDeviceE2EValidationPlanSchema = z.object({
  schemaVersion: z.literal(1),
  planId: z.string().min(1),
  requiredDomains: z.array(remoteProviderDeviceE2EDomainSchema).min(5),
  requiredRouteIds: z.array(z.string().min(1)).min(1),
  requiredExternalPendingIds: z.array(z.string().min(1)).min(1),
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
  physicalEvidenceRef: z.string().min(1).optional(),
  artifactRefs: z.array(z.string().min(1)),
  acceptedCriteria: z.array(z.string().min(1)),
  plaintextMaterialIncluded: z.literal(false),
  executedAt: z.string().datetime().optional(),
  operatorId: z.string().min(1).optional(),
  writes: z.literal(false),
});

export const remoteExternalValidationReportItemSchema = z.object({
  schemaVersion: z.literal(1),
  requirementId: z.string().min(1),
  decisionId: z.string().min(1),
  category: z.string().min(1),
  sourceReceipt: z.string().min(1),
  status: z.enum(["external_pending", "clearable"]),
  approvedRun: z.boolean(),
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
  items: z.array(remoteExternalValidationReportItemSchema),
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
  externalValidationStatus: z.enum(["external_pending", "clearable"]),
  blockedExternalRequirementIds: z.array(z.string().min(1)),
  clearableExternalRequirementIds: z.array(z.string().min(1)),
  blockers: z.array(z.enum(["source_qa_review", "external_validation"])),
  writes: z.literal(false),
});

export type RemoteExternalValidationEvidence = z.infer<typeof remoteExternalValidationEvidenceSchema>;
export type RemoteExternalValidationReportItem = z.infer<typeof remoteExternalValidationReportItemSchema>;
export type RemoteExternalValidationReport = z.infer<typeof remoteExternalValidationReportSchema>;
export type RemoteGoalClosureGate = z.infer<typeof remoteGoalClosureGateSchema>;

function providerDeviceE2EPlanId(parts: string[]): string {
  return `provider_device_e2e_${parts.join("_").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase()}`;
}

export function buildRemoteProviderDeviceE2EValidationPlan(input: {
  createdAt?: string;
  requiredRouteIds?: readonly string[];
  evidenceRefs?: string[];
} = {}): RemoteProviderDeviceE2EValidationPlan {
  const createdAt = input.createdAt ?? new Date().toISOString();
  return remoteProviderDeviceE2EValidationPlanSchema.parse({
    schemaVersion: 1,
    planId: providerDeviceE2EPlanId(["plan", createdAt]),
    requiredDomains: ["chat", "search", "sync", "secret_refs", "hosted_agents"],
    requiredRouteIds: input.requiredRouteIds?.length ? [...input.requiredRouteIds] : remoteSyncRequiredRouteIds.slice(),
    requiredExternalPendingIds: [
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
    ],
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

function remoteGoalClosureGateId(parts: string[]): string {
  return `remote_goal_closure_gate_${parts.join("_").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase()}`;
}

export const remoteGoalClosureRequiredSourceQaIds = Array.from({ length: 23 }, (_, index) => `QA-${String(index + 1).padStart(3, "0")}`);

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
  const evidenceByRequirement = new Map(
    (input.evidence ?? []).map((entry) => {
      const evidence = remoteExternalValidationEvidenceSchema.parse(entry);
      return [evidence.requirementId, evidence] as const;
    }),
  );
  const items = checklist.items.map((checklistItem) => {
    const evidence = evidenceByRequirement.get(checklistItem.requirementId);
    const artifactRefs = new Set(evidence?.artifactRefs ?? []);
    const acceptedCriteria = new Set(evidence?.acceptedCriteria ?? []);
    const missingArtifacts = checklistItem.requiredArtifacts.filter((artifact) => !artifactRefs.has(artifact));
    const missingAcceptanceCriteria = checklistItem.acceptanceCriteria.filter((criterion) => !acceptedCriteria.has(criterion));
    const approvedRun = evidence?.approvedRun === true;
    const physicalEvidencePresent = !!evidence?.physicalEvidenceRef;
    const clearable = approvedRun
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
    status: blockedRequirementIds.length === 0 ? "clearable" : "external_pending",
    requirementCount: checklist.requirementIds.length,
    evidenceCount: evidenceByRequirement.size,
    clearableRequirementIds,
    blockedRequirementIds,
    items,
    writes: false,
  });
}

export function buildRemoteGoalClosureGate(input: {
  generatedAt?: string;
  reviewedSourceQaIds?: string[];
  evidence?: RemoteExternalValidationEvidence[];
} = {}): RemoteGoalClosureGate {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const reviewedSourceQaIds = [...new Set(input.reviewedSourceQaIds ?? [])].filter((id) => remoteGoalClosureRequiredSourceQaIds.includes(id));
  const missingSourceQaIds = remoteGoalClosureRequiredSourceQaIds.filter((id) => !reviewedSourceQaIds.includes(id));
  const externalValidationReport = buildRemoteExternalValidationReport({
    generatedAt,
    evidence: input.evidence,
  });
  const blockers: Array<"source_qa_review" | "external_validation"> = [];
  if (missingSourceQaIds.length > 0) blockers.push("source_qa_review");
  if (externalValidationReport.status !== "clearable") blockers.push("external_validation");
  return remoteGoalClosureGateSchema.parse({
    schemaVersion: 1,
    gateId: remoteGoalClosureGateId(["gate", generatedAt]),
    generatedAt,
    status: blockers.length === 0 ? "clearable" : "blocked",
    requiredSourceQaIds: remoteGoalClosureRequiredSourceQaIds,
    reviewedSourceQaIds,
    missingSourceQaIds,
    externalValidationStatus: externalValidationReport.status,
    blockedExternalRequirementIds: externalValidationReport.blockedRequirementIds,
    clearableExternalRequirementIds: externalValidationReport.clearableRequirementIds,
    blockers,
    writes: false,
  });
}
