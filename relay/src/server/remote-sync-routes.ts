import {
  buildRemoteConformanceReport,
  buildRemoteExternalPendingRegister,
  buildRemoteExternalValidationEvidenceArtifact,
  buildRemoteExternalValidationApprovalRequest,
  buildRemoteExternalValidationChecklist,
  buildRemoteExternalValidationEvidenceTemplate,
  buildRemoteExternalValidationReport,
  buildRemoteExternalValidationReadiness,
  buildRemoteExternalValidationRunbook,
  buildRemoteGoalClosureGate,
  buildRemoteProviderDeviceE2EValidationPlan,
  buildRemoteRouteContractCatalog,
  buildRemoteSourceQaReviewTemplate,
  buildSyncPlan,
  buildSyncQueueEntries,
  clawApiPath,
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
  parseRemoteExternalValidationEvidenceInput,
  parseRemoteSourceQaReviewInput,
  reconcileSyncQueue,
  remoteSyncRequiredRouteIds,
  syncDriverSchema,
  syncObjectSnapshotSchema,
  type MeshShareAction,
  type RemoteExternalValidationEvidence,
  type RemoteCompatibilityClientKind,
  type SyncAuthority,
  type SyncDriver,
  type SyncObjectSnapshot,
} from "@clawjs/core";
import type { FastifyInstance, FastifyRequest } from "fastify";

function routeIds(): string[] {
  return (clawPersistentSurfaceRegistry.routes ?? []).map((route) => route.id);
}

function nodeIds(): string[] {
  return clawPersistentSurfaceRegistry.nodes.map((node) => node.id);
}

function remoteConformancePayload() {
  return buildRemoteConformanceReport({ routeIds: routeIds(), nodeIds: nodeIds() });
}

function remoteExternalPendingPayload() {
  return buildRemoteExternalPendingRegister();
}

function remoteExternalValidationChecklistPayload() {
  return buildRemoteExternalValidationChecklist();
}

function remoteExternalValidationEvidenceTemplatePayload(input: Record<string, unknown> = {}) {
  return buildRemoteExternalValidationEvidenceTemplate({
    requirementIds: arrayOfStrings(input.requirementIds ?? input["requirement-ids"], []),
  });
}

function remoteExternalValidationEvidenceFromInput(input: Record<string, unknown>): RemoteExternalValidationEvidence[] {
  if (
    input.evidence !== undefined
    || input.sourceConversationId !== undefined
    || input.sourcePlanId !== undefined
    || input.generatedAt !== undefined
    || input.status !== undefined
  ) {
    return parseRemoteExternalValidationEvidenceInput(input);
  }
  return [];
}

function remoteExternalValidationEvidenceArtifactPayload(input: Record<string, unknown> = {}) {
  const evidence = remoteExternalValidationEvidenceFromInput(input);
  return buildRemoteExternalValidationEvidenceArtifact({
    requirementIds: arrayOfStrings(input.requirementIds ?? input["requirement-ids"], []),
    evidence: evidence.length ? evidence : undefined,
  });
}

function remoteExternalValidationRunbookPayload() {
  return buildRemoteExternalValidationRunbook();
}

function remoteSourceQaReviewsFromInput(input: Record<string, unknown>): ReturnType<typeof parseRemoteSourceQaReviewInput> {
  if (input.sourceQaReviews !== undefined) return parseRemoteSourceQaReviewInput(input.sourceQaReviews);
  if (
    Array.isArray(input.items)
    || "sourceConversationId" in input
    || "sourcePlanId" in input
    || "reviewedAt" in input
  ) {
    return parseRemoteSourceQaReviewInput(input);
  }
  return [];
}

function remoteExternalValidationReadinessPayload(input: Record<string, unknown> = {}) {
  const sourceQaReviews = remoteSourceQaReviewsFromInput(input);
  const evidence = input.evidence === undefined
    ? remoteExternalValidationEvidenceFromInput(input)
    : parseRemoteExternalValidationEvidenceInput(input.evidence);
  return buildRemoteExternalValidationReadiness({
    reviewedSourceQaIds: Array.isArray(input.reviewedSourceQaIds) ? input.reviewedSourceQaIds.filter((entry): entry is string => typeof entry === "string") : [],
    sourceQaReviews,
    evidence,
  });
}

function remoteExternalValidationApprovalRequestPayload(input: Record<string, unknown> = {}) {
  const sourceQaReviews = remoteSourceQaReviewsFromInput(input);
  const evidence = input.evidence === undefined
    ? remoteExternalValidationEvidenceFromInput(input)
    : parseRemoteExternalValidationEvidenceInput(input.evidence);
  return buildRemoteExternalValidationApprovalRequest({
    reviewedSourceQaIds: Array.isArray(input.reviewedSourceQaIds) ? input.reviewedSourceQaIds.filter((entry): entry is string => typeof entry === "string") : [],
    sourceQaReviews,
    evidence,
  });
}

function remoteExternalValidationReportPayload(input: Record<string, unknown> = {}) {
  return buildRemoteExternalValidationReport({
    evidence: remoteExternalValidationEvidenceFromInput(input),
  });
}

function remoteGoalClosureGatePayload(input: Record<string, unknown> = {}) {
  const sourceQaReviews = remoteSourceQaReviewsFromInput(input);
  return buildRemoteGoalClosureGate({
    reviewedSourceQaIds: Array.isArray(input.reviewedSourceQaIds) ? input.reviewedSourceQaIds.filter((entry): entry is string => typeof entry === "string") : [],
    sourceQaReviews,
    evidence: input.evidence === undefined
      ? remoteExternalValidationEvidenceFromInput(input)
      : parseRemoteExternalValidationEvidenceInput(input.evidence),
  });
}

function remoteSourceQaReviewTemplatePayload(input: Record<string, unknown> = {}) {
  return buildRemoteSourceQaReviewTemplate({
    sourceQaIds: arrayOfStrings(input.sourceQaIds ?? input["source-qa-ids"] ?? input.qaIds ?? input["qa-ids"], []),
  });
}

function remoteRouteContractsPayload() {
  return buildRemoteRouteContractCatalog({ registeredRouteIds: routeIds() });
}

function remoteProviderDeviceE2EPlanPayload() {
  return buildRemoteProviderDeviceE2EValidationPlan({ requiredRouteIds: remoteSyncRequiredRouteIds });
}

function remoteClassificationsPayload() {
  const classifications = clawPersistentSurfaceRegistry.nodes
    .filter((node) => node.programmaticSurfaces?.includes("relay") || node.surfaceGaps?.some((gap) => gap.surface === "relay"))
    .map((node) => ({
      id: node.id,
      name: node.name,
      relay: node.programmaticSurfaces?.includes("relay")
        ? "remote-safe"
        : node.surfaceGaps?.find((gap) => gap.surface === "relay")?.status ?? "pending",
      policy: node.notes ?? null,
    }));
  return { classifications };
}

function remoteClassificationReceiptFromInput(input: Record<string, unknown>) {
  const classification = input.classification === "local-only" || input.classification === "blocked" || input.classification === "pending"
    ? input.classification
    : "remote-safe";
  return createRemoteSurfaceClassificationReceipt({
    capabilityId: stringValue(input.capabilityId ?? input["capability-id"], "remote.chatGateway"),
    classification,
    routeId: typeof input.routeId === "string" || typeof input["route-id"] === "string" ? stringValue(input.routeId ?? input["route-id"], "remote.chatGateway") : undefined,
    policyRef: typeof input.policyRef === "string" || typeof input["policy-ref"] === "string" ? stringValue(input.policyRef ?? input["policy-ref"], "docs/relay.md") : undefined,
    testRefs: arrayOfStrings(input.testRefs ?? input["test-refs"], []),
    reason: typeof input.reason === "string" ? input.reason : undefined,
    createdAt: stringValue(input.createdAt ?? input.now, "2026-05-17T10:15:00.000Z"),
  });
}

function remoteLayerNodesPayload() {
  const layerIds = new Set([
    "claw.coordinator",
    "claw.gateway",
    "claw.connector",
    "claw.sync",
    "claw.transport.iroh",
    "claw.headlessHost",
    "claw.remoteCache",
    "claw.remote.classification",
  ]);
  return { nodes: clawPersistentSurfaceRegistry.nodes.filter((node) => layerIds.has(node.id)) };
}

function readBody(request: FastifyRequest): Record<string, unknown> {
  const body = request.body;
  if (!body) return {};
  if (Buffer.isBuffer(body)) {
    if (body.byteLength === 0) return {};
    const parsed = JSON.parse(body.toString("utf8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  }
  return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

function parseDriver(value: unknown): SyncDriver {
  return syncDriverSchema.parse(stringValue(value, "skills"));
}

function parseAuthority(value: unknown): SyncAuthority | undefined {
  if (value === undefined || value === null) return undefined;
  if (value === "primary" || value === "replica" || value === "cache" || value === "mirror" || value === "joint") return value;
  return undefined;
}

function parseSnapshots(value: unknown, fallback: SyncObjectSnapshot[]): SyncObjectSnapshot[] {
  if (value === undefined || value === null) return fallback;
  const entries = Array.isArray(value) ? value : [value];
  return entries.map((entry) => syncObjectSnapshotSchema.parse(entry));
}

function manifestFromInput(input: Record<string, unknown>) {
  const driver = parseDriver(input.driver);
  return createSyncResourceManifest({
    resourceId: stringValue(input.resourceId ?? input["resource-id"], "skills:default"),
    kind: stringValue(input.kind, driver),
    ownerNodeId: stringValue(input.ownerNodeId ?? input["owner-node"], "local"),
    driver,
    authority: typeof input.authority === "string" ? input.authority as SyncAuthority : undefined,
    allowedPeerNodeIds: typeof input.peerNodeId === "string"
      ? [input.peerNodeId]
      : Array.isArray(input.allowedPeerNodeIds) ? input.allowedPeerNodeIds.filter((entry): entry is string => typeof entry === "string") : [],
    ttlSeconds: numberValue(input.ttlSeconds, 3600),
  });
}

function planFromInput(input: Record<string, unknown>) {
  const manifest = manifestFromInput(input);
  const now = stringValue(input.now, "2026-05-17T10:00:00.000Z");
  const localNodeId = stringValue(input.localNodeId ?? input.ownerNodeId ?? input["owner-node"], "local");
  const peerNodeId = stringValue(input.peerNodeId ?? input["peer-node"], "peer");
  const objectRef = stringValue(input.objectRef ?? input["object-ref"], "skill.review");
  const localSnapshots = parseSnapshots(input.localSnapshots ?? input.localSnapshot, [{
    resourceId: manifest.resourceId,
    objectRef,
    nodeId: localNodeId,
    contentHash: stringValue(input.localHash ?? input["local-hash"], "hash-local"),
    updatedAt: stringValue(input.localUpdatedAt ?? input["local-updated-at"], "2026-05-17T09:00:00.000Z"),
    deleted: false,
  }]);
  const peerSnapshots = parseSnapshots(input.peerSnapshots ?? input.peerSnapshot, [{
    resourceId: manifest.resourceId,
    objectRef,
    nodeId: peerNodeId,
    contentHash: stringValue(input.peerHash ?? input["peer-hash"], "hash-peer"),
    updatedAt: stringValue(input.peerUpdatedAt ?? input["peer-updated-at"], "2026-05-17T09:05:00.000Z"),
    deleted: false,
  }]);
  return buildSyncPlan({
    manifest,
    actor: {
      actorKind: "agent",
      actorId: stringValue(input.actorId ?? input["actor-id"], "agent.sync"),
      nodeId: localNodeId,
      transport: stringValue(input.transport, "gateway"),
      trustMode: "governed_gateway",
    },
    localNodeId,
    peerNodeId,
    localSnapshots,
    peerSnapshots,
    now,
  });
}

function dryRunNodeOperation(operation: string, body: Record<string, unknown>) {
  return {
    operation,
    status: "dry_run_only",
    writes: false,
    nodeId: typeof body.nodeId === "string" ? body.nodeId : null,
    reason: "Pairing, trust, sharing, and revocation mutations require signed Coordinator execution.",
  };
}

function arrayOfStrings(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const strings = value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
  return strings.length ? strings : fallback;
}

function meshActions(value: unknown, fallback: MeshShareAction[]): MeshShareAction[] {
  const allowed = new Set<MeshShareAction>(["read", "sync", "search", "execute", "lease_secret"]);
  const parsed = arrayOfStrings(value, fallback).filter((entry): entry is MeshShareAction => allowed.has(entry as MeshShareAction));
  return parsed.length ? parsed : fallback;
}

function compatibilityClientKind(value: unknown): RemoteCompatibilityClientKind {
  if (value === "ios" || value === "android" || value === "web" || value === "desktop" || value === "server" || value === "unknown") return value;
  return "unknown";
}

function remoteCompatibilityAdapterFromInput(input: Record<string, unknown>) {
  const status = input.status === "deprecated_adapter" || input.status === "blocked" ? input.status : "active_adapter";
  return createRemoteCompatibilityAdapterReceipt({
    legacySurface: stringValue(input.legacySurface ?? input["legacy-surface"] ?? input.surface, "relay.mobile.chat"),
    canonicalRouteId: stringValue(input.canonicalRouteId ?? input["canonical-route"] ?? input.routeId ?? input["route-id"], "remote.chatGateway"),
    clientKind: compatibilityClientKind(input.clientKind ?? input["client-kind"]),
    status,
    createdAt: stringValue(input.createdAt ?? input.now, "2026-05-17T10:11:00.000Z"),
  });
}

function meshActorFromInput(input: Record<string, unknown>) {
  return {
    actorKind: "human" as const,
    actorId: stringValue(input.actorId ?? input["actor-id"], "user.remote"),
    nodeId: stringValue(input.nodeId ?? input["node-id"], "local"),
    transport: stringValue(input.transport, "gateway"),
    trustMode: "governed_gateway" as const,
  };
}

function syncAuthorityHandoffFromInput(input: Record<string, unknown>) {
  return createSyncAuthorityHandoffReceipt({
    manifest: manifestFromInput(input),
    toNodeId: stringValue(input.toNodeId ?? input["to-node"] ?? input.peerNodeId ?? input["peer-node"], "peer"),
    actor: meshActorFromInput(input),
    requestedAuthority: parseAuthority(input.requestedAuthority ?? input["requested-authority"] ?? input.authority),
    requestedResidency: arrayOfStrings(input.requestedResidency ?? input["requested-residency"], []),
    createdAt: stringValue(input.createdAt ?? input.now, "2026-05-17T10:15:00.000Z"),
    physicalAuthorityApplied: input.physicalAuthorityApplied === true || input["physical-authority-applied"] === true,
    rejected: input.rejected === true,
  });
}

function meshInvitationFromInput(input: Record<string, unknown>) {
  return createMeshInvitation({
    issuerMeshId: stringValue(input.issuerMeshId ?? input["issuer-mesh"], "mesh.local"),
    coordinatorNodeId: stringValue(input.coordinatorNodeId ?? input["coordinator-node"], "local"),
    recipientMeshId: typeof input.recipientMeshId === "string" ? input.recipientMeshId : typeof input["recipient-mesh"] === "string" ? input["recipient-mesh"] : undefined,
    inviteePublicKeyRef: typeof input.inviteePublicKeyRef === "string" ? input.inviteePublicKeyRef : typeof input["invitee-key"] === "string" ? input["invitee-key"] : undefined,
    trustMode: input.trustMode === "governed_gateway" ? "governed_gateway" : "sovereign_e2e_tunnel",
    transport: stringValue(input.transport, "iroh"),
    allowedResourceIds: arrayOfStrings(input.allowedResourceIds ?? input["allowed-resources"], ["skills:default"]),
    allowedActions: meshActions(input.allowedActions ?? input.actions, ["read", "sync"]),
    createdAt: stringValue(input.createdAt ?? input.now, "2026-05-17T10:07:00.000Z"),
    expiresAt: stringValue(input.expiresAt ?? input["expires-at"], "2026-05-18T10:07:00.000Z"),
  });
}

function meshShareFromInput(input: Record<string, unknown>) {
  const manifest = manifestFromInput(input);
  const invitation = meshInvitationFromInput({
    ...input,
    allowedResourceIds: arrayOfStrings(input.allowedResourceIds ?? input["allowed-resources"], [manifest.resourceId]),
  });
  return createMeshResourceShare({
    invitation,
    fromMeshId: stringValue(input.fromMeshId ?? input["from-mesh"], invitation.issuerMeshId),
    toMeshId: stringValue(input.toMeshId ?? input["to-mesh"], invitation.recipientMeshId ?? "mesh.peer"),
    manifest,
    actions: meshActions(input.actions ?? input.allowedActions, ["read", "sync"]),
    secretRefs: arrayOfStrings(input.secretRefs ?? input["secret-refs"], []),
    createdAt: stringValue(input.createdAt ?? input.now, "2026-05-17T10:08:00.000Z"),
    expiresAt: stringValue(input.expiresAt ?? input["expires-at"], "2026-05-18T10:08:00.000Z"),
  });
}

function meshInvitationAcceptanceFromInput(input: Record<string, unknown>) {
  const invitation = meshInvitationFromInput(input);
  return createMeshInvitationAcceptance({
    invitation,
    accepterMeshId: stringValue(input.accepterMeshId ?? input["accepter-mesh"] ?? input.recipientMeshId ?? input["recipient-mesh"], "mesh.peer"),
    actor: meshActorFromInput(input),
    acceptedAt: stringValue(input.acceptedAt ?? input.now, "2026-05-17T10:07:30.000Z"),
    physicalPeerTrustVerified: input.physicalPeerTrustVerified === true,
  });
}

function remoteAgentServiceAssignmentFromInput(input: Record<string, unknown>) {
  const tenantId = stringValue(input.tenantId ?? input["tenant-id"], "tenant.demo");
  const agentId = stringValue(input.agentId ?? input["agent-id"], "agent.service");
  const assignmentId = stringValue(input.assignmentId ?? input["assignment-id"], "assignment.service");
  const routeIds = arrayOfStrings(input.routeIds ?? input["route-ids"], ["gateway.multiTenantAgentService"]);
  return {
    schemaVersion: 1 as const,
    tenantId,
    agentId,
    assignmentId,
    status: input.assignmentStatus === "paused" || input.assignmentStatus === "revoked" ? input.assignmentStatus : "active" as const,
    routeIds,
    budgetId: stringValue(input.budgetId ?? input["budget-id"], "budget.service"),
    billingAccountId: stringValue(input.billingAccountId ?? input["billing-account"], "billing.demo"),
    isolationKey: stringValue(input.isolationKey ?? input["isolation-key"], `${tenantId}:${assignmentId}`),
    auditRequired: true as const,
  };
}

function remoteAgentServiceBudgetFromInput(input: Record<string, unknown>, assignment: ReturnType<typeof remoteAgentServiceAssignmentFromInput>) {
  return {
    budgetId: stringValue(input.budgetId ?? input["budget-id"], assignment.budgetId),
    tenantId: stringValue(input.budgetTenantId ?? input["budget-tenant-id"], assignment.tenantId),
    billingAccountId: stringValue(input.billingAccountId ?? input["billing-account"], assignment.billingAccountId),
    limitCents: numberValue(input.limitCents ?? input["limit-cents"], 5000),
    usedCents: numberValue(input.usedCents ?? input["used-cents"], 0),
    billingMeterId: stringValue(input.billingMeterId ?? input["billing-meter"], "meter.agent-service"),
  };
}

function gatewayAuditReceiptFromInput(input: Record<string, unknown>) {
  const sourceEventType = input.sourceEventType === "remote.agent_service.evaluated" || input.sourceEventType === "gateway.agent_service.execution"
    ? input.sourceEventType
    : "remote.access.evaluated";
  return createRemoteGatewayAuditReceipt({
    sourceEventType,
    routeId: stringValue(input.routeId ?? input["route-id"], "remote.chatGateway"),
    actor: meshActorFromInput(input),
    resourceType: stringValue(input.resourceType ?? input["resource-type"], "session"),
    ...(typeof input.resourceId === "string" || typeof input["resource-id"] === "string"
      ? { resourceId: stringValue(input.resourceId ?? input["resource-id"], "session.default") }
      : {}),
    action: stringValue(input.action, "read"),
    decision: input.decision === "deny" ? "deny" : "allow",
    createdAt: stringValue(input.createdAt ?? input.now, "2026-05-17T10:13:00.000Z"),
    signedHostAuditPersisted: input.signedHostAuditPersisted === true || input["host-audit-persisted"] === true,
  });
}

export function registerRemoteSyncRoutes(app: FastifyInstance): void {
  app.get(clawApiPath("remote/classifications"), async () => remoteClassificationsPayload());

  app.post(clawApiPath("remote/classifications/receipts"), async (request) => ({
    status: "dry_run_only",
    receipt: remoteClassificationReceiptFromInput(readBody(request)),
    writes: false,
  }));

  app.get(clawApiPath("remote/conformance"), async () => remoteConformancePayload());

  app.get(clawApiPath("remote/external-pending"), async () => remoteExternalPendingPayload());

  app.get(clawApiPath("remote/external-validation-checklist"), async () => remoteExternalValidationChecklistPayload());

  app.get(clawApiPath("remote/external-validation-template"), async () => remoteExternalValidationEvidenceTemplatePayload());

  app.post(clawApiPath("remote/external-validation-template"), async (request) => remoteExternalValidationEvidenceTemplatePayload(readBody(request)));

  app.get(clawApiPath("remote/external-validation-artifact"), async () => remoteExternalValidationEvidenceArtifactPayload());

  app.post(clawApiPath("remote/external-validation-artifact"), async (request) => remoteExternalValidationEvidenceArtifactPayload(readBody(request)));

  app.get(clawApiPath("remote/external-validation-runbook"), async () => remoteExternalValidationRunbookPayload());

  app.get(clawApiPath("remote/external-validation-readiness"), async () => remoteExternalValidationReadinessPayload());

  app.post(clawApiPath("remote/external-validation-readiness"), async (request) => remoteExternalValidationReadinessPayload(readBody(request)));

  app.get(clawApiPath("remote/external-validation-approval-request"), async () => remoteExternalValidationApprovalRequestPayload());

  app.post(clawApiPath("remote/external-validation-approval-request"), async (request) => remoteExternalValidationApprovalRequestPayload(readBody(request)));

  app.get(clawApiPath("remote/external-validation-report"), async () => remoteExternalValidationReportPayload());

  app.post(clawApiPath("remote/external-validation-report"), async (request) => remoteExternalValidationReportPayload(readBody(request)));

  app.get(clawApiPath("remote/source-qa-template"), async () => remoteSourceQaReviewTemplatePayload());

  app.post(clawApiPath("remote/source-qa-template"), async (request) => remoteSourceQaReviewTemplatePayload(readBody(request)));

  app.get(clawApiPath("remote/closure-gate"), async () => remoteGoalClosureGatePayload());

  app.post(clawApiPath("remote/closure-gate"), async (request) => remoteGoalClosureGatePayload(readBody(request)));

  app.get(clawApiPath("remote/route-contracts"), async () => remoteRouteContractsPayload());

  app.get(clawApiPath("remote/provider-device-e2e-plan"), async () => remoteProviderDeviceE2EPlanPayload());

  app.get(clawApiPath("remote/compatibility/adapters"), async () => ({
    adapters: [
      createRemoteCompatibilityAdapterReceipt({
        legacySurface: "relay.mobile.chat",
        canonicalRouteId: "remote.chatGateway",
        clientKind: "ios",
        createdAt: "2026-05-17T10:11:00.000Z",
      }),
      createRemoteCompatibilityAdapterReceipt({
        legacySurface: "relay.mobile.search",
        canonicalRouteId: "remote.searchGateway",
        clientKind: "web",
        createdAt: "2026-05-17T10:11:00.000Z",
      }),
    ],
    writes: false,
  }));

  app.post(clawApiPath("remote/compatibility/adapters"), async (request) => ({
    receipt: remoteCompatibilityAdapterFromInput(readBody(request)),
    status: "dry_run_only",
    writes: false,
  }));

  app.get(clawApiPath("gateway/conformance"), async () => ({
    ...remoteConformancePayload(),
    gateway: {
      mode: "dry_run_conformance",
      contract: "registered_local_contract_projection",
      hostedSelfHostedParity: "required",
    },
  }));

  app.post(clawApiPath("gateway/agent-service/evaluate"), async (request) => {
    const body = readBody(request);
    const assignment = remoteAgentServiceAssignmentFromInput(body);
    const budget = remoteAgentServiceBudgetFromInput(body, assignment);
    return evaluateRemoteAgentServiceAccess({
      request: {
        tenantId: stringValue(body.tenantId ?? body["tenant-id"], assignment.tenantId),
        agentId: stringValue(body.agentId ?? body["agent-id"], assignment.agentId),
        assignmentId: stringValue(body.assignmentId ?? body["assignment-id"], assignment.assignmentId),
        routeId: stringValue(body.routeId ?? body["route-id"], "gateway.multiTenantAgentService"),
        estimatedCostCents: numberValue(body.estimatedCostCents ?? body["estimated-cost-cents"], 0),
        now: stringValue(body.now, "2026-05-17T10:10:00.000Z"),
      },
      assignment,
      budget,
    });
  });

  app.post(clawApiPath("gateway/agent-service/executions"), async (request) => {
    const body = readBody(request);
    const assignment = remoteAgentServiceAssignmentFromInput(body);
    const budget = remoteAgentServiceBudgetFromInput(body, assignment);
    const agentRequest = {
      tenantId: stringValue(body.tenantId ?? body["tenant-id"], assignment.tenantId),
      agentId: stringValue(body.agentId ?? body["agent-id"], assignment.agentId),
      assignmentId: stringValue(body.assignmentId ?? body["assignment-id"], assignment.assignmentId),
      routeId: stringValue(body.routeId ?? body["route-id"], "gateway.multiTenantAgentService"),
      estimatedCostCents: numberValue(body.estimatedCostCents ?? body["estimated-cost-cents"], 0),
      now: stringValue(body.now, "2026-05-17T10:10:00.000Z"),
    };
    const decision = evaluateRemoteAgentServiceAccess({
      request: agentRequest,
      assignment,
      budget,
    });
    return {
      status: "dry_run_external_pending",
      decision,
      receipt: createRemoteAgentServiceExecutionReceipt({
        request: agentRequest,
        assignment,
        budget,
        decision,
        createdAt: agentRequest.now,
        runtimeExecutionVerified: body.runtimeExecutionVerified === true,
        billingMeterPersisted: body.billingMeterPersisted === true,
      }),
      writes: false,
    };
  });

  app.post(clawApiPath("gateway/audit/receipts"), async (request) => ({
    status: "dry_run_external_pending",
    receipt: gatewayAuditReceiptFromInput(readBody(request)),
    writes: false,
  }));

  app.get(clawApiPath("sync/manifests"), async (request) => {
    const query = request.query as Record<string, unknown>;
    const drivers = query.driver ? [parseDriver(query.driver)] : [...syncDriverSchema.options];
    return {
      manifests: drivers.map((driver) => createSyncResourceManifest({
        resourceId: `${driver}:default`,
        kind: driver,
        ownerNodeId: stringValue(query.ownerNodeId ?? query["owner-node"], "local"),
        driver,
        allowedPeerNodeIds: typeof query.peerNodeId === "string" ? [query.peerNodeId] : [],
      })),
    };
  });

  app.post(clawApiPath("sync/manifests"), async (request) => ({
    manifest: manifestFromInput(readBody(request)),
    writes: false,
    mode: "dry_run_manifest",
  }));

  app.get(clawApiPath("sync/changes"), async () => ({
    changes: [],
    cursorRequired: true,
    resources: remoteSyncRequiredRouteIds.filter((routeId) => routeId.startsWith("sync.")),
    writes: false,
  }));

  app.post(clawApiPath("sync/plan"), async (request) => ({
    mode: "plan",
    ...planFromInput(readBody(request)),
  }));

  app.post(clawApiPath("sync/conflicts"), async (request) => {
    const plan = planFromInput(readBody(request));
    return {
      conflicts: plan.conflicts,
      defaultPolicy: "detect_and_elevate",
      silentOverwriteAllowed: false,
      writes: false,
    };
  });

  app.post(clawApiPath("sync/applications"), async (request) => {
    const body = readBody(request);
    const plan = planFromInput(body);
    const queuedAt = stringValue(body.queuedAt ?? body.now, "2026-05-17T10:14:00.000Z");
    const queue = buildSyncQueueEntries(plan, { queuedAt });
    const reconciliation = reconcileSyncQueue({
      manifest: plan.manifest,
      queue,
      acknowledgedChangeIds: arrayOfStrings(body.acknowledgedChangeIds ?? body["ack-change-ids"], plan.changes.map((change) => change.changeId)),
      resolvedConflictIds: arrayOfStrings(body.resolvedConflictIds ?? body["resolved-conflict-ids"], []),
      now: queuedAt,
    });
    return {
      status: "dry_run_external_pending",
      receipt: createSyncDriverApplicationReceipt({
        manifest: plan.manifest,
        reconciliation,
        actor: meshActorFromInput(body),
        createdAt: queuedAt,
        physicalDriverApplied: body.physicalDriverApplied === true,
      }),
      reconciliation,
      writes: false,
    };
  });

  app.post(clawApiPath("sync/authority-handoffs"), async (request) => ({
    status: "dry_run_external_pending",
    receipt: syncAuthorityHandoffFromInput(readBody(request)),
    writes: false,
  }));

  app.get(clawApiPath("nodes"), async () => remoteLayerNodesPayload());
  app.post(clawApiPath("nodes/pair"), async (request) => dryRunNodeOperation("pair", readBody(request)));
  app.post(clawApiPath("nodes/trust"), async (request) => dryRunNodeOperation("trust", readBody(request)));
  app.post(clawApiPath("nodes/revoke"), async (request) => dryRunNodeOperation("revoke", readBody(request)));
  app.post(clawApiPath("mesh/invitations"), async (request) => ({
    invitation: meshInvitationFromInput(readBody(request)),
    status: "dry_run_only",
    writes: false,
  }));
  app.post(clawApiPath("mesh/invitations/accept"), async (request) => ({
    acceptance: meshInvitationAcceptanceFromInput(readBody(request)),
    status: "dry_run_external_pending",
    writes: false,
  }));
  app.post(clawApiPath("mesh/shares"), async (request) => ({
    share: meshShareFromInput(readBody(request)),
    status: "dry_run_only",
    writes: false,
  }));
  app.post(clawApiPath("mesh/revocations"), async (request) => {
    const body = readBody(request);
    return {
      revocation: createMeshRevocation({
        targetType: body.targetType === "invitation" || body.targetType === "node_trust" ? body.targetType : "share",
        targetId: stringValue(body.targetId ?? body["target-id"], "mesh_share_default"),
        actor: meshActorFromInput(body),
        reason: stringValue(body.reason, "owner_revoked"),
        revokedAt: stringValue(body.revokedAt ?? body.now, "2026-05-17T10:09:00.000Z"),
      }),
      status: "dry_run_only",
      writes: false,
    };
  });
}
