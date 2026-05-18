import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  buildRemoteOfflineCommandResult,
  buildRemoteProviderDeviceE2EValidationPlan,
  buildRemoteRouteContractCatalog,
  buildRemoteSourceQaReviewReport,
  buildRemoteSourceQaReviewTemplate,
  buildSyncDriverCatalog,
  buildSyncPlan,
  buildSyncQueueEntries,
  clawCliCommandRegistry,
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
  evaluateRemoteAccess,
  findClawPersistentSurfaceNode,
  findClawSurfaceRoute,
  meshInvitationSchema,
  meshInvitationAcceptanceSchema,
  meshResourceShareSchema,
  meshRevocationSchema,
  remoteAccessGrantSchema,
  remoteAccessRequestSchema,
  remoteActorContextSchema,
  remoteAgentServiceDecisionSchema,
  remoteAgentServiceExecutionReceiptSchema,
  remoteCompatibilityAdapterReceiptSchema,
  parseRemoteExternalValidationEvidenceInput,
  parseRemoteSourceQaReviewInput,
  remoteExternalValidationEvidenceArtifactSchema,
  remoteExternalValidationRunbookSchema,
  remoteExternalValidationEvidenceSchema,
  remoteExternalValidationEvidenceTemplateSchema,
  remoteExternalPendingRegisterSchema,
  remoteGatewayAuditReceiptSchema,
  remoteProviderDeviceE2EValidationPlanSchema,
  remoteGoalClosureRequiredSourceQaIds,
  remoteRouteContractCatalogSchema,
  remoteSourceQaReviewTemplateSchema,
  remoteSecretLeaseSchema,
  remoteSurfaceClassificationReceiptSchema,
  remoteSyncRequiredDecisionIds,
  remoteSyncRequiredRouteIds,
  reconcileSyncQueue,
  routeIdForSyncDriver,
  syncAuthorityHandoffReceiptSchema,
  syncDriverApplicationReceiptSchema,
  syncDriverSchema,
} from "../packages/clawjs-core/src/index.ts";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceConversationId = "019e36a3-c2e6-73b3-a3fe-f3e7340e42c8";
const sourcePlanId = "019e3732-c90e-7491-9217-37020c43217e-plan";

const requiredDocs = [
  "docs/adr/0022-remote-gateway-sync-redesign.md",
  "docs/remote-gateway-sync-source-decision-audit.md",
  "docs/remote-gateway-sync-source-qa-review.json",
  "docs/remote-gateway-sync-external-validation-evidence.json",
  "docs/remote-gateway-sync-completion-audit.md",
  "docs/remote-gateway-sync-decision-matrix.md",
  "docs/relay.md",
  "docs/decision-map.md",
  "docs/interface-matrix.md",
  "docs/cli.md",
];

const requiredNodes = [
  "claw.coordinator",
  "claw.gateway",
  "claw.connector",
  "claw.sync",
  "claw.transport.iroh",
  "claw.headlessHost",
  "claw.remoteCache",
  "claw.remote.classification",
];

const requiredCliCommands = ["remote", "sync", "nodes", "gateway"];

const requiredServiceApiRoutes = [
  "remote/classifications",
  "remote/classifications/receipts",
  "remote/conformance",
  "remote/offline-command",
  "remote/external-pending",
  "remote/external-validation-checklist",
  "remote/external-validation-template",
  "remote/external-validation-artifact",
  "remote/external-validation-runbook",
  "remote/external-validation-readiness",
  "remote/external-validation-approval-request",
  "remote/external-validation-report",
  "remote/source-qa-template",
  "remote/closure-gate",
  "remote/route-contracts",
  "remote/provider-device-e2e-plan",
  "remote/compatibility/adapters",
  "gateway/conformance",
  "gateway/agent-service/evaluate",
  "gateway/agent-service/executions",
  "gateway/audit/receipts",
  "sync/drivers",
  "sync/manifests",
  "sync/changes",
  "sync/plan",
  "sync/conflicts",
  "sync/applications",
  "sync/authority-handoffs",
  "nodes",
  "nodes/pair",
  "nodes/trust",
  "nodes/revoke",
  "mesh/invitations",
  "mesh/invitations/accept",
  "mesh/shares",
  "mesh/revocations",
];

const requiredDocSnippets = [
  "Coordinator",
  "Gateway",
  "Connector",
  "Sync",
  "sovereign_e2e_tunnel",
  "governed_gateway",
  "remote-safe",
  "local-only",
  "blocked",
  "pending",
  "SyncResourceManifest",
  "Sync driver catalog",
  "/v1/sync/drivers",
  "claw sync drivers",
  "brokered leases",
  "transport-agnostic",
  "Iroh",
  "headless",
  "multi-tenant agent service",
  "remote.agent_service.evaluated",
  "RemoteSurfaceClassificationReceipt",
  "/v1/remote/classifications/receipts",
  "RemoteOfflineCommandResult",
  "/v1/remote/offline-command",
  "claw remote offline-command",
  "RemoteExternalPendingRegister",
  "/v1/remote/external-pending",
  "external validation checklist",
  "/v1/remote/external-validation-checklist",
  "claw remote validation-checklist",
  "external validation evidence template",
  "/v1/remote/external-validation-template",
  "/v1/remote/external-validation-artifact",
  "/v1/remote/external-validation-runbook",
  "/v1/remote/external-validation-readiness",
  "/v1/remote/external-validation-approval-request",
  "claw remote validation-template",
  "claw remote validation-artifact",
  "claw remote validation-runbook",
  "claw remote validation-readiness",
  "claw remote validation-approval-request",
  "ready_for_approved_run",
  "approval_required",
  "external validation report",
  "approvedRunRef",
  "invalidEvidenceRequirementIds",
  "duplicateEvidenceRequirementIds",
  "source-bound artifact mismatch",
  "/v1/remote/external-validation-report",
  "claw remote validation-report",
  "source Q/A review report",
  "duplicateSourceQaIds",
  "invalidExternalPendingDispositionQaIds",
  "source Q/A review template",
  "/v1/remote/source-qa-template",
  "claw remote source-qa-template",
  "remote closure gate",
  "/v1/remote/closure-gate",
  "claw remote closure-gate",
  "remote route contracts",
  "/v1/remote/route-contracts",
  "RemoteProviderDeviceE2EValidationPlan",
  "/v1/remote/provider-device-e2e-plan",
  "/v1/gateway/agent-service/evaluate",
  "/v1/gateway/audit/receipts",
  "RemoteGatewayAuditReceipt",
  "mesh.resourceShare",
  "MeshInvitation",
  "MeshInvitationAcceptance",
  "MeshResourceShare",
  "MeshRevocation",
  "/v1/mesh/invitations",
  "/v1/mesh/invitations/accept",
  "/v1/mesh/shares",
  "/v1/mesh/revocations",
  "--local-hash",
  "SyncDriverApplicationReceipt",
  "/v1/sync/applications",
  "SyncAuthorityHandoffReceipt",
  "/v1/sync/authority-handoffs",
  "claw sync handoff",
  "claw remote conformance",
  "claw remote e2e-plan",
  "claw remote compat",
  "claw inspect remote",
  "claw gateway conformance",
];

const driverRouteExpectations = new Map([
  ["skills", "sync.skills"],
  ["memory_user_model", "sync.memoryUserModel"],
  ["sessions", "sync.sessions"],
  ["drive_files", "sync.driveFiles"],
  ["blobs", "sync.blobs"],
  ["sqlite_tables", "sync.sqliteResources"],
  ["sqlite_partial", "sync.sqliteResources"],
  ["sidecar", "sync.sidecars"],
  ["search_index", "sync.searchIndex"],
  ["agent_config", "sync.agentConfig"],
  ["workspace_state", "sync.workspaceState"],
]);

const failures = [];

function fail(message) {
  failures.push(message);
}

function readRequired(relativePath) {
  const fullPath = path.join(rootDir, relativePath);
  if (!fs.existsSync(fullPath)) {
    fail(`missing required file ${relativePath}`);
    return "";
  }
  return fs.readFileSync(fullPath, "utf8");
}

function readRequiredJson(relativePath) {
  const text = readRequired(relativePath);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`${relativePath} must be valid JSON`);
    return {};
  }
}

function requireText(label, text, needle) {
  if (!text.includes(needle)) fail(`${label} must include ${needle}`);
}

function extractTableIds(text, prefix) {
  return new Set([...text.matchAll(new RegExp(`\\|\\s*(${prefix}-\\d{3})\\s*\\|`, "g"))].map((match) => match[1]));
}

const docTexts = new Map(requiredDocs.map((relativePath) => [relativePath, readRequired(relativePath)]));
const docCorpus = [...docTexts.values()].join("\n\n");

for (const [relativePath, text] of docTexts) {
  if (/\/Users\/|rollout-\d{4}-\d{2}-\d{2}T/.test(text)) {
    fail(`${relativePath} must not include private local session paths`);
  }
}

for (const snippet of [sourceConversationId, sourcePlanId]) {
  requireText("source decision audit", docTexts.get("docs/remote-gateway-sync-source-decision-audit.md") ?? "", snippet);
  requireText("completion audit", docTexts.get("docs/remote-gateway-sync-completion-audit.md") ?? "", snippet);
  requireText("decision matrix", docTexts.get("docs/remote-gateway-sync-decision-matrix.md") ?? "", snippet);
}

const sourceDecisionIds = extractTableIds(docTexts.get("docs/remote-gateway-sync-source-decision-audit.md") ?? "", "RQ");
const sourceQaIds = extractTableIds(docTexts.get("docs/remote-gateway-sync-source-decision-audit.md") ?? "", "QA");
const completionDecisionIds = extractTableIds(docTexts.get("docs/remote-gateway-sync-completion-audit.md") ?? "", "RQ");
const matrixDecisionIds = extractTableIds(docTexts.get("docs/remote-gateway-sync-decision-matrix.md") ?? "", "RG");
for (let index = 1; index <= remoteSyncRequiredDecisionIds.length; index += 1) {
  const sourceId = `RQ-${String(index).padStart(3, "0")}`;
  const qaId = `QA-${String(index).padStart(3, "0")}`;
  const matrixId = `RG-${String(index).padStart(3, "0")}`;
  if (!sourceDecisionIds.has(sourceId)) fail(`source decision audit missing ${sourceId}`);
  if (!sourceQaIds.has(qaId)) fail(`source Q/A review map missing ${qaId}`);
  if (!completionDecisionIds.has(sourceId)) fail(`remote gateway sync completion audit missing ${sourceId}`);
  if (!matrixDecisionIds.has(matrixId)) fail(`remote gateway sync decision matrix missing ${matrixId}`);
}
if (!sourceQaIds.has("QA-023")) fail("source Q/A review map missing QA-023 goal closure gate");

for (const decisionId of remoteSyncRequiredDecisionIds) {
  requireText("source decision audit", docTexts.get("docs/remote-gateway-sync-source-decision-audit.md") ?? "", `\`${decisionId}\``);
  requireText("completion audit", docTexts.get("docs/remote-gateway-sync-completion-audit.md") ?? "", `\`${decisionId}\``);
  requireText("decision matrix", docTexts.get("docs/remote-gateway-sync-decision-matrix.md") ?? "", `\`${decisionId}\``);
}

const sourceAudit = docTexts.get("docs/remote-gateway-sync-source-decision-audit.md") ?? "";
for (const snippet of [
  "Source Q/A Review Map",
  "Separar capas (Recommended)",
  "Doble modo (Recommended)",
  "Todo clasificable (Recommended)",
  "Adaptador principal (Recommended)",
  "Misma API proyectada (Recommended)",
  "Separar comando/sync (Recommended)",
  "Autoridad unificada (Recommended)",
  "Host completo (Recommended)",
  "Detectar y elevar (Recommended)",
  "Cache cifrada",
  "Fail cerrado (Recommended)",
  "Compat con adaptadores (Recommended)",
  "Paridad total",
  "Coordinator/Gateway/Connector/Sync (Recommended)",
  "Multi-tenant gobernado (Recommended)",
  "goal_closure_gate",
]) {
  requireText("source Q/A review map", sourceAudit, snippet);
}

const completionAudit = docTexts.get("docs/remote-gateway-sync-completion-audit.md") ?? "";
for (const snippet of [
  "Closure state: `active_goal_not_complete`",
  "SOURCE-REREAD-001",
  "reviewed_current",
  "PHYSICAL-001",
  "DOMAIN-PARITY-001",
  "RemoteExternalPendingRegister",
  "claw inspect remote",
  "claw remote pending",
  "claw remote validation-template",
  "claw remote validation-artifact",
  "claw remote source-qa-template",
  "claw remote contracts",
  "docs/remote-gateway-sync-external-validation-evidence.json",
  "artifact-native `items` array",
  "same core contracts used by CLI inspection",
]) {
  requireText("completion audit", completionAudit, snippet);
}
if (/Closure state:\s*`complete`/.test(completionAudit)) fail("remote completion audit must not claim completion while external pending rows remain");

const sourceQaReviewArtifact = readRequiredJson("docs/remote-gateway-sync-source-qa-review.json");
if (sourceQaReviewArtifact.sourceConversationId !== sourceConversationId) fail("source Q/A review artifact must bind the source conversation ID");
if (sourceQaReviewArtifact.sourcePlanId !== sourcePlanId) fail("source Q/A review artifact must bind the source plan ID");
if (sourceQaReviewArtifact.status !== "complete_with_external_pending") fail("source Q/A review artifact must be complete_with_external_pending");
if (sourceQaReviewArtifact.writes !== false) fail("source Q/A review artifact must be no-write");
const sourceQaReviewItems = parseRemoteSourceQaReviewInput(sourceQaReviewArtifact);
try {
  parseRemoteSourceQaReviewInput({
    ...sourceQaReviewArtifact,
    sourceConversationId: "wrong-source-conversation",
  });
  fail("source Q/A review parser must reject artifacts for another source conversation");
} catch (error) {
  if (!(error instanceof Error) || !error.message.includes("sourceConversationId")) throw error;
}
const sourceQaReviewReport = buildRemoteSourceQaReviewReport({
  generatedAt: "2026-05-18T11:20:00.000Z",
  reviews: sourceQaReviewItems,
});
if (sourceQaReviewReport.status !== "complete") fail("source Q/A review artifact must produce a complete report");
if (sourceQaReviewReport.reviewedSourceQaIds.length !== 23) fail("source Q/A review artifact must review all 23 source Q/A rows");
if (sourceQaReviewReport.items.length !== 23) fail("source Q/A review artifact must include one valid item per source Q/A row");
if (sourceQaReviewReport.missingSourceQaIds.length !== 0) fail("source Q/A review artifact must have no missing source Q/A rows");
if (sourceQaReviewReport.invalidSourceQaIds.length !== 0) fail("source Q/A review artifact must have no invalid source Q/A rows");
if (sourceQaReviewReport.duplicateSourceQaIds.length !== 0) fail("source Q/A review artifact must have no duplicate source Q/A rows");
if (sourceQaReviewReport.invalidExternalPendingDispositionQaIds.length !== 0) {
  fail("source Q/A review artifact must mark physical/provider rows as external_pending");
}
const expectedExternalPendingQaIds = new Set([
  "QA-002",
  "QA-004",
  "QA-005",
  "QA-006",
  "QA-007",
  "QA-010",
  "QA-012",
  "QA-013",
  "QA-015",
  "QA-018",
  "QA-020",
  "QA-021",
]);
for (const item of sourceQaReviewReport.items) {
  if (!sourceQaIds.has(item.qaId)) fail(`source Q/A review artifact includes unknown ${item.qaId}`);
  const expectedDisposition = expectedExternalPendingQaIds.has(item.qaId) ? "external_pending" : "implemented";
  if (item.disposition !== expectedDisposition) {
    fail(`source Q/A review artifact ${item.qaId} must be ${expectedDisposition}`);
  }
  if (!item.evidenceRefs.some((ref) => ref.includes("remote-gateway-sync-completion-audit.md") || ref.includes("verify-remote-sync-goal.mjs"))) {
    fail(`source Q/A review artifact ${item.qaId} must cite completion audit or verifier evidence`);
  }
}
const reviewedClosureGate = buildRemoteGoalClosureGate({
  generatedAt: "2026-05-18T11:20:01.000Z",
  sourceQaReviews: sourceQaReviewReport.items,
});
if (reviewedClosureGate.sourceQaReviewStatus !== "complete") fail("reviewed closure gate must clear the source Q/A blocker");
if (reviewedClosureGate.blockers.includes("source_qa_review")) fail("reviewed closure gate must not include source_qa_review blocker");
if (!reviewedClosureGate.blockers.includes("external_validation")) fail("reviewed closure gate must still block on external validation");

for (const snippet of requiredDocSnippets) {
  requireText("remote gateway sync public docs", docCorpus, snippet);
}

for (const nodeId of requiredNodes) {
  if (!findClawPersistentSurfaceNode(nodeId)) fail(`missing required surface node ${nodeId}`);
}

for (const node of clawPersistentSurfaceRegistry.nodes) {
  const hasStableSurface = Boolean(node.humanSurfaces?.length || node.programmaticSurfaces?.length);
  if (!hasStableSurface) continue;
  const hasRelayClassification = node.programmaticSurfaces?.includes("relay") || node.surfaceGaps?.some((gap) => gap.surface === "relay");
  if (!hasRelayClassification) fail(`${node.id} must classify relay exposure as remote-safe, local-only, blocked, or pending`);
  const relayGap = node.surfaceGaps?.find((gap) => gap.surface === "relay");
  if (relayGap?.status === "pending") {
    fail(`${node.id} must not keep a pending Relay classification before remote goal completion`);
  }
}

for (const routeId of remoteSyncRequiredRouteIds) {
  const route = findClawSurfaceRoute(routeId);
  if (!route) {
    fail(`missing required route ${routeId}`);
    continue;
  }
  if (!route.adrs?.includes("docs/adr/0022-remote-gateway-sync-redesign.md")) {
    fail(`${routeId} must cite ADR 0022`);
  }
  if (!route.tests?.includes("packages/clawjs/src/inspect-cli.test.ts")) {
    fail(`${routeId} must name inspect CLI tests`);
  }
  if (!route.steps?.length) fail(`${routeId} must declare explicit route steps`);
}

const conformance = buildRemoteConformanceReport({
  routeIds: (clawPersistentSurfaceRegistry.routes ?? []).map((route) => route.id),
  nodeIds: clawPersistentSurfaceRegistry.nodes.map((node) => node.id),
});
if (conformance.status !== "baseline_registered") fail("remote conformance must be baseline_registered");
if (conformance.missingRoutes.length > 0) fail(`remote conformance missing routes: ${conformance.missingRoutes.join(", ")}`);
if (conformance.missingNodes.length > 0) fail(`remote conformance missing nodes: ${conformance.missingNodes.join(", ")}`);
if (conformance.hostedSelfHostedParity !== "required") fail("hosted/self-hosted parity must be required");
if (conformance.transportContract !== "transport_agnostic_iroh_v1_adapter") fail("transport contract must stay Iroh-adapter and transport-agnostic");

const externalPending = buildRemoteExternalPendingRegister({ generatedAt: "2026-05-17T10:13:00.000Z" });
if (!remoteExternalPendingRegisterSchema.safeParse(externalPending).success) fail("remote external pending register must validate");
if (externalPending.status !== "external_pending") fail("remote external pending register must remain external_pending while physical checks are unproven");
if (externalPending.writes !== false) fail("remote external pending register must be no-write");
for (const requirementId of [
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
]) {
  if (!externalPending.requirements.some((entry) => entry.requirementId === requirementId && entry.status === "external_pending" && entry.writes === false)) {
    fail(`remote external pending register must include ${requirementId}`);
  }
}
if (!externalPending.requirements.some((entry) => entry.requirementId === "provider_device_e2e" && entry.sourceReceipt === "RemoteProviderDeviceE2EValidationPlan")) {
  fail("provider_device_e2e must be backed by RemoteProviderDeviceE2EValidationPlan");
}

const externalValidationChecklist = buildRemoteExternalValidationChecklist({
  generatedAt: "2026-05-17T10:13:15.000Z",
});
if (externalValidationChecklist.status !== "external_pending") fail("remote external validation checklist must remain external_pending");
if (externalValidationChecklist.writes !== false) fail("remote external validation checklist must be no-write");
if (externalValidationChecklist.coverage.requirementCount !== externalPending.requirements.length) fail("remote external validation checklist must count every pending requirement");
if (externalValidationChecklist.coverage.coveredRequirementCount !== externalPending.requirements.length) fail("remote external validation checklist must cover every pending requirement");
if (externalValidationChecklist.coverage.missingRequirementIds.length !== 0) fail("remote external validation checklist must have no missing requirement IDs");
for (const requirement of externalPending.requirements) {
  const item = externalValidationChecklist.items.find((entry) => entry.requirementId === requirement.requirementId);
  if (!item) fail(`remote external validation checklist missing ${requirement.requirementId}`);
  if (item && item.sourceReceipt !== requirement.sourceReceipt) fail(`remote external validation checklist source receipt mismatch for ${requirement.requirementId}`);
  if (item && (!item.approvedRunRequired || !item.physicalEvidenceRequired || item.plaintextMaterialIncluded !== false || item.writes !== false)) {
    fail(`remote external validation checklist invariants failed for ${requirement.requirementId}`);
  }
}
for (const requirementId of ["physical_iroh_handshake", "provider_secret_retrieval", "provider_device_e2e"]) {
  const item = externalValidationChecklist.items.find((entry) => entry.requirementId === requirementId);
  if (!item?.requiredCommand || item.requiredArtifacts.length === 0 || item.acceptanceCriteria.length === 0) {
    fail(`remote external validation checklist must include command, artifacts, and criteria for ${requirementId}`);
  }
}

const externalValidationEvidenceTemplate = buildRemoteExternalValidationEvidenceTemplate({
  generatedAt: "2026-05-17T10:13:17.000Z",
});
if (!remoteExternalValidationEvidenceTemplateSchema.safeParse(externalValidationEvidenceTemplate).success) fail("remote external validation evidence template must validate");
if (externalValidationEvidenceTemplate.status !== "external_pending") fail("remote external validation evidence template must remain external_pending");
if (externalValidationEvidenceTemplate.writes !== false) fail("remote external validation evidence template must be no-write");
if (externalValidationEvidenceTemplate.requirementCount !== externalPending.requirements.length) fail("remote external validation evidence template must count every pending requirement");
if (externalValidationEvidenceTemplate.checklistItems.length !== externalPending.requirements.length) fail("remote external validation evidence template must include every checklist item");
if (externalValidationEvidenceTemplate.evidence.length !== externalPending.requirements.length) fail("remote external validation evidence template must include one evidence row per requirement");
if (!externalValidationEvidenceTemplate.submissionCommand.includes("claw remote validation-report")) fail("remote external validation evidence template must point to validation-report submission");
if (!externalValidationEvidenceTemplate.submissionCommand.includes("--evidence-file")) fail("remote external validation evidence template must prefer versioned evidence-file submission");
if (!externalValidationEvidenceTemplate.evidence.some((entry) => entry.requirementId === "provider_device_e2e")) fail("remote external validation evidence template must include provider_device_e2e");
if (!externalValidationEvidenceTemplate.evidence.every((entry) => (
  entry.approvedRun === false
  && entry.approvedRunRef === undefined
  && entry.artifactRefs.length === 0
  && entry.acceptedCriteria.length === 0
  && entry.plaintextMaterialIncluded === false
  && entry.writes === false
))) {
  fail("remote external validation evidence template must default to unapproved empty no-plaintext no-write evidence rows");
}
const scopedExternalValidationEvidenceTemplate = buildRemoteExternalValidationEvidenceTemplate({
  generatedAt: "2026-05-17T10:13:18.000Z",
  requirementIds: ["physical_iroh_handshake", "provider_device_e2e"],
});
if (scopedExternalValidationEvidenceTemplate.requirementCount !== 2) fail("scoped remote external validation evidence template must include exactly requested known requirements");
if (scopedExternalValidationEvidenceTemplate.evidence.map((entry) => entry.requirementId).join(",") !== "physical_iroh_handshake,provider_device_e2e") {
  fail("scoped remote external validation evidence template must preserve requested known requirement order");
}

const generatedExternalValidationEvidenceArtifact = buildRemoteExternalValidationEvidenceArtifact({
  generatedAt: "2026-05-18T11:40:00.000Z",
});
if (!remoteExternalValidationEvidenceArtifactSchema.safeParse(generatedExternalValidationEvidenceArtifact).success) {
  fail("generated remote external validation evidence artifact must satisfy the core artifact schema");
}
if (generatedExternalValidationEvidenceArtifact.sourceConversationId !== sourceConversationId) fail("generated external validation evidence artifact must bind the source conversation ID");
if (generatedExternalValidationEvidenceArtifact.sourcePlanId !== sourcePlanId) fail("generated external validation evidence artifact must bind the source plan ID");
if (generatedExternalValidationEvidenceArtifact.status !== "external_pending") fail("generated external validation evidence artifact must remain external_pending");
if (generatedExternalValidationEvidenceArtifact.writes !== false) fail("generated external validation evidence artifact must be no-write");
if (generatedExternalValidationEvidenceArtifact.evidence.length !== externalPending.requirements.length) {
  fail("generated external validation evidence artifact must include one row per pending requirement");
}
const externalValidationRunbook = buildRemoteExternalValidationRunbook({
  generatedAt: "2026-05-18T11:41:00.000Z",
});
if (!remoteExternalValidationRunbookSchema.safeParse(externalValidationRunbook).success) {
  fail("remote external validation runbook must satisfy the core runbook schema");
}
if (externalValidationRunbook.status !== "external_pending") fail("remote external validation runbook must remain external_pending");
if (externalValidationRunbook.writes !== false) fail("remote external validation runbook must be no-write");
if (externalValidationRunbook.validationStepCount !== 5) fail("remote external validation runbook must include five validation steps");
if (externalValidationRunbook.externalRequirementCount !== externalPending.requirements.length) fail("remote external validation runbook must count every external requirement");
if (!externalValidationRunbook.reportCommand.includes("validation-report")) fail("remote external validation runbook must include report command");
if (!externalValidationRunbook.closureGateCommand.includes("closure-gate")) fail("remote external validation runbook must include closure gate command");
if (!externalValidationRunbook.requiredCommands.some((entry) => entry.includes("validation-artifact"))) fail("remote external validation runbook must include validation-artifact command");
if (externalValidationRunbook.e2ePlan.validationSteps.map((entry) => entry.domain).join(",") !== "chat,search,sync,secret_refs,hosted_agents") {
  fail("remote external validation runbook must carry the provider/device E2E domain steps");
}

const externalValidationEvidenceArtifact = readRequiredJson("docs/remote-gateway-sync-external-validation-evidence.json");
if (!remoteExternalValidationEvidenceArtifactSchema.safeParse(externalValidationEvidenceArtifact).success) {
  fail("external validation evidence artifact must satisfy the core artifact schema");
}
if (externalValidationEvidenceArtifact.sourceConversationId !== sourceConversationId) fail("external validation evidence artifact must bind the source conversation ID");
if (externalValidationEvidenceArtifact.sourcePlanId !== sourcePlanId) fail("external validation evidence artifact must bind the source plan ID");
if (externalValidationEvidenceArtifact.status !== "external_pending") fail("external validation evidence artifact must remain external_pending until approved physical/provider runs");
if (externalValidationEvidenceArtifact.writes !== false) fail("external validation evidence artifact must be no-write");
const externalValidationEvidenceArtifactRows = Array.isArray(externalValidationEvidenceArtifact.evidence)
  ? externalValidationEvidenceArtifact.evidence
  : [];
const parsedExternalValidationEvidenceArtifactRows = parseRemoteExternalValidationEvidenceInput(externalValidationEvidenceArtifact);
if (parsedExternalValidationEvidenceArtifactRows.length !== externalValidationEvidenceArtifactRows.length) {
  fail("external validation evidence artifact parser must return every artifact evidence row");
}
try {
  parseRemoteExternalValidationEvidenceInput({
    ...externalValidationEvidenceArtifact,
    sourcePlanId: "wrong-source-plan",
  });
  fail("external validation evidence parser must reject artifacts for another source plan");
} catch (error) {
  if (!(error instanceof Error) || !error.message.includes("sourcePlanId")) throw error;
}
if (externalValidationEvidenceArtifactRows.length !== externalPending.requirements.length) {
  fail("external validation evidence artifact must include one row per external pending requirement");
}
const externalPendingRequirementIds = externalPending.requirements.map((entry) => entry.requirementId);
const externalValidationEvidenceArtifactIds = externalValidationEvidenceArtifactRows.map((entry) => entry.requirementId);
if (externalValidationEvidenceArtifactIds.join(",") !== externalPendingRequirementIds.join(",")) {
  fail("external validation evidence artifact rows must match external pending requirements in order");
}
for (const evidence of externalValidationEvidenceArtifactRows) {
  if (!remoteExternalValidationEvidenceSchema.safeParse(evidence).success) fail(`external validation evidence artifact row ${evidence?.requirementId ?? "unknown"} must validate`);
  if (evidence.approvedRun !== false) fail(`external validation evidence artifact row ${evidence.requirementId} must not claim an approved run`);
  if (evidence.approvedRunRef !== undefined) fail(`external validation evidence artifact row ${evidence.requirementId} must not include approvedRunRef before approved validation`);
  if (evidence.physicalEvidenceRef !== undefined) fail(`external validation evidence artifact row ${evidence.requirementId} must not include physicalEvidenceRef before approved validation`);
  if (evidence.artifactRefs?.length !== 0) fail(`external validation evidence artifact row ${evidence.requirementId} must not include artifacts before approved validation`);
  if (evidence.acceptedCriteria?.length !== 0) fail(`external validation evidence artifact row ${evidence.requirementId} must not include accepted criteria before approved validation`);
  if (evidence.plaintextMaterialIncluded !== false) fail(`external validation evidence artifact row ${evidence.requirementId} must exclude plaintext material`);
  if (evidence.writes !== false) fail(`external validation evidence artifact row ${evidence.requirementId} must be no-write`);
}
const artifactExternalValidationReport = buildRemoteExternalValidationReport({
  generatedAt: externalValidationEvidenceArtifact.generatedAt ?? "2026-05-18T11:40:00.000Z",
  evidence: externalValidationEvidenceArtifactRows,
});
if (artifactExternalValidationReport.status !== "external_pending") fail("external validation evidence artifact must not clear external validation");
if (artifactExternalValidationReport.evidenceCount !== externalPending.requirements.length) fail("external validation evidence artifact report must count every row");
if (artifactExternalValidationReport.clearableRequirementIds.length !== 0) fail("external validation evidence artifact must not make any row clearable");
if (artifactExternalValidationReport.blockedRequirementIds.length !== externalPending.requirements.length) fail("external validation evidence artifact must leave every row blocked");
if (artifactExternalValidationReport.invalidEvidenceRequirementIds.length !== 0) fail("external validation evidence artifact must not include unknown evidence IDs");
if (artifactExternalValidationReport.duplicateEvidenceRequirementIds.length !== 0) fail("external validation evidence artifact must not include duplicate evidence IDs");
const artifactExternalValidationReadiness = buildRemoteExternalValidationReadiness({
  generatedAt: externalValidationEvidenceArtifact.generatedAt ?? "2026-05-18T11:40:00.000Z",
  sourceQaReviews: sourceQaReviewReport.items,
  evidence: externalValidationEvidenceArtifactRows,
});
if (artifactExternalValidationReadiness.status !== "ready_for_approved_run") {
  fail("external validation readiness must report ready_for_approved_run for complete source Q/A plus pending evidence artifact");
}
if (artifactExternalValidationReadiness.sourceQaReady !== true) fail("external validation readiness must mark source Q/A ready");
if (artifactExternalValidationReadiness.externalEvidenceReady !== true) fail("external validation readiness must mark pending evidence artifact ready");
if (artifactExternalValidationReadiness.missingEvidenceRequirementIds.length !== 0) fail("external validation readiness must not miss evidence requirement IDs");
if (artifactExternalValidationReadiness.closureGateBlockers.join(",") !== "external_validation") {
  fail("external validation readiness must leave only external_validation blocked before physical/provider runs");
}
if (artifactExternalValidationReadiness.writes !== false) fail("external validation readiness must be no-write");
const artifactExternalValidationApprovalRequest = buildRemoteExternalValidationApprovalRequest({
  generatedAt: externalValidationEvidenceArtifact.generatedAt ?? "2026-05-18T11:40:00.000Z",
  sourceQaReviews: sourceQaReviewReport.items,
  evidence: externalValidationEvidenceArtifactRows,
});
if (artifactExternalValidationApprovalRequest.status !== "approval_required") fail("external validation approval request must require approval");
if (artifactExternalValidationApprovalRequest.approvalRequired !== true || artifactExternalValidationApprovalRequest.approved !== false) {
  fail("external validation approval request must not approve the physical/provider run");
}
if (artifactExternalValidationApprovalRequest.readinessStatus !== "ready_for_approved_run") {
  fail("external validation approval request must expose ready_for_approved_run readiness for current artifacts");
}
if (artifactExternalValidationApprovalRequest.requirementIds.length !== externalPending.requirements.length) fail("external validation approval request must include every external requirement");
if (artifactExternalValidationApprovalRequest.validationDomains.join(",") !== "chat,search,sync,secret_refs,hosted_agents") fail("external validation approval request must cover all E2E domains");
if (!artifactExternalValidationApprovalRequest.requiredCommands.some((entry) => entry.includes("validation-readiness"))) fail("external validation approval request must include readiness command");
if (!artifactExternalValidationApprovalRequest.prohibitedActions.some((entry) => entry.includes("plaintext secrets"))) fail("external validation approval request must prohibit plaintext secrets");
if (artifactExternalValidationApprovalRequest.writes !== false) fail("external validation approval request must be no-write");

const emptyExternalValidationReport = buildRemoteExternalValidationReport({
  generatedAt: "2026-05-17T10:13:20.000Z",
});
if (emptyExternalValidationReport.status !== "external_pending") fail("empty remote external validation report must remain external_pending");
if (emptyExternalValidationReport.writes !== false) fail("remote external validation report must be no-write");
if (emptyExternalValidationReport.evidenceCount !== 0) fail("empty remote external validation report must have zero evidence");
if (emptyExternalValidationReport.blockedRequirementIds.length !== externalPending.requirements.length) fail("empty remote external validation report must block every requirement");
if (emptyExternalValidationReport.clearableRequirementIds.length !== 0) fail("empty remote external validation report must not clear requirements");
if (emptyExternalValidationReport.invalidEvidenceRequirementIds.length !== 0) fail("empty remote external validation report must not have invalid evidence IDs");
if (emptyExternalValidationReport.duplicateEvidenceRequirementIds.length !== 0) fail("empty remote external validation report must not have duplicate evidence IDs");

const completeExternalValidationReport = buildRemoteExternalValidationReport({
  generatedAt: "2026-05-17T10:13:25.000Z",
  evidence: externalValidationChecklist.items.map((entry) => ({
    schemaVersion: 1,
    requirementId: entry.requirementId,
    approvedRun: true,
    approvedRunRef: `approval://${entry.requirementId}`,
    physicalEvidenceRef: `evidence://${entry.requirementId}`,
    artifactRefs: entry.requiredArtifacts,
    acceptedCriteria: entry.acceptanceCriteria,
    plaintextMaterialIncluded: false,
    executedAt: "2026-05-17T10:13:24.000Z",
    writes: false,
  })),
});
if (completeExternalValidationReport.status !== "clearable") fail("complete remote external validation report must be clearable");
if (completeExternalValidationReport.clearableRequirementIds.length !== externalPending.requirements.length) fail("complete remote external validation report must clear every requirement");
if (completeExternalValidationReport.blockedRequirementIds.length !== 0) fail("complete remote external validation report must have no blocked requirements");
if (completeExternalValidationReport.invalidEvidenceRequirementIds.length !== 0) fail("complete remote external validation report must have no invalid evidence IDs");
if (completeExternalValidationReport.duplicateEvidenceRequirementIds.length !== 0) fail("complete remote external validation report must have no duplicate evidence IDs");
if (!completeExternalValidationReport.items.every((entry) => entry.clearable && entry.approvedRunRefPresent === true && entry.writes === false && entry.plaintextMaterialIncluded === false)) {
  fail("complete remote external validation report must preserve approved-run-ref/no-write/no-plaintext invariants");
}

const invalidExternalValidationReport = buildRemoteExternalValidationReport({
  generatedAt: "2026-05-17T10:13:25.250Z",
  evidence: [
    ...externalValidationChecklist.items.map((entry) => ({
      schemaVersion: 1,
      requirementId: entry.requirementId,
      approvedRun: true,
      approvedRunRef: `approval://${entry.requirementId}`,
      physicalEvidenceRef: `evidence://${entry.requirementId}`,
      artifactRefs: entry.requiredArtifacts,
      acceptedCriteria: entry.acceptanceCriteria,
      plaintextMaterialIncluded: false,
      executedAt: "2026-05-17T10:13:24.000Z",
      writes: false,
    })),
    {
      schemaVersion: 1,
      requirementId: "unknown_external_requirement",
      approvedRun: true,
      approvedRunRef: "approval://unknown",
      physicalEvidenceRef: "evidence://unknown",
      artifactRefs: ["UnknownArtifact"],
      acceptedCriteria: ["unknown criterion"],
      plaintextMaterialIncluded: false,
      executedAt: "2026-05-17T10:13:24.000Z",
      writes: false,
    },
  ],
});
if (invalidExternalValidationReport.status !== "external_pending") fail("remote external validation report must reject unknown evidence requirement IDs");
if (invalidExternalValidationReport.invalidEvidenceRequirementIds.join(",") !== "unknown_external_requirement") {
  fail("remote external validation report must expose unknown evidence requirement IDs");
}

const duplicateExternalValidationReport = buildRemoteExternalValidationReport({
  generatedAt: "2026-05-17T10:13:25.375Z",
  evidence: [
    {
      schemaVersion: 1,
      requirementId: "physical_iroh_handshake",
      approvedRun: true,
      approvedRunRef: "approval://physical_iroh_handshake/1",
      physicalEvidenceRef: "evidence://physical_iroh_handshake/1",
      artifactRefs: externalValidationChecklist.items[0].requiredArtifacts,
      acceptedCriteria: externalValidationChecklist.items[0].acceptanceCriteria,
      plaintextMaterialIncluded: false,
      executedAt: "2026-05-17T10:13:24.000Z",
      writes: false,
    },
    {
      schemaVersion: 1,
      requirementId: "physical_iroh_handshake",
      approvedRun: true,
      approvedRunRef: "approval://physical_iroh_handshake/2",
      physicalEvidenceRef: "evidence://physical_iroh_handshake/2",
      artifactRefs: externalValidationChecklist.items[0].requiredArtifacts,
      acceptedCriteria: externalValidationChecklist.items[0].acceptanceCriteria,
      plaintextMaterialIncluded: false,
      executedAt: "2026-05-17T10:13:24.000Z",
      writes: false,
    },
  ],
});
if (duplicateExternalValidationReport.status !== "external_pending") fail("remote external validation report must reject duplicate evidence requirement IDs");
if (duplicateExternalValidationReport.duplicateEvidenceRequirementIds.join(",") !== "physical_iroh_handshake") {
  fail("remote external validation report must expose duplicate evidence requirement IDs");
}

const missingApprovedRunRefExternalValidationReport = buildRemoteExternalValidationReport({
  generatedAt: "2026-05-17T10:13:25.500Z",
  evidence: externalValidationChecklist.items.map((entry) => ({
    schemaVersion: 1,
    requirementId: entry.requirementId,
    approvedRun: true,
    physicalEvidenceRef: `evidence://${entry.requirementId}`,
    artifactRefs: entry.requiredArtifacts,
    acceptedCriteria: entry.acceptanceCriteria,
    plaintextMaterialIncluded: false,
    executedAt: "2026-05-17T10:13:24.000Z",
    writes: false,
  })),
});
if (missingApprovedRunRefExternalValidationReport.status !== "external_pending") {
  fail("remote external validation report must not clear evidence without approvedRunRef");
}
if (!missingApprovedRunRefExternalValidationReport.items.every((entry) => entry.approvedRunRefPresent === false && entry.clearable === false)) {
  fail("remote external validation report must expose missing approvedRunRef on every otherwise complete row");
}
const incompleteApprovedEvidenceReadiness = buildRemoteExternalValidationReadiness({
  generatedAt: "2026-05-17T10:13:25.525Z",
  sourceQaReviews: sourceQaReviewReport.items,
  evidence: externalValidationChecklist.items.map((entry) => ({
    schemaVersion: 1,
    requirementId: entry.requirementId,
    approvedRun: true,
    physicalEvidenceRef: `evidence://${entry.requirementId}`,
    artifactRefs: entry.requiredArtifacts,
    acceptedCriteria: entry.acceptanceCriteria,
    plaintextMaterialIncluded: false,
    executedAt: "2026-05-17T10:13:24.000Z",
    writes: false,
  })),
});
if (incompleteApprovedEvidenceReadiness.status !== "not_ready") {
  fail("external validation readiness must reject partially approved evidence that is missing approvedRunRef");
}
if (incompleteApprovedEvidenceReadiness.externalEvidenceReady !== false) {
  fail("external validation readiness must not mark incomplete approved evidence as ready");
}

const blockedClosureGate = buildRemoteGoalClosureGate({
  generatedAt: "2026-05-17T10:13:26.000Z",
});
if (blockedClosureGate.status !== "blocked") fail("default remote closure gate must be blocked");
if (blockedClosureGate.writes !== false) fail("remote closure gate must be no-write");
if (blockedClosureGate.requiredSourceQaIds.length !== 23) fail("remote closure gate must require 23 source Q/A ids");
if (blockedClosureGate.missingSourceQaIds.length !== 23) fail("default remote closure gate must miss all source Q/A ids");
if (blockedClosureGate.invalidSourceQaIds.length !== 0) fail("default remote closure gate must expose no invalid source Q/A ids");
if (blockedClosureGate.duplicateSourceQaIds.length !== 0) fail("default remote closure gate must expose no duplicate source Q/A ids");
if (!blockedClosureGate.externalPendingRequiredSourceQaIds.includes("QA-007")) fail("remote closure gate must expose physical/provider source Q/A ids requiring external_pending disposition");
if (blockedClosureGate.invalidExternalPendingDispositionQaIds.length !== 0) fail("default remote closure gate must expose no invalid external-pending dispositions");
if (!blockedClosureGate.blockers.includes("source_qa_review") || !blockedClosureGate.blockers.includes("external_validation")) {
  fail("default remote closure gate must block on source Q/A review and external validation");
}
if (blockedClosureGate.blockedExternalRequirementIds.length !== externalPending.requirements.length) fail("default remote closure gate must block every external pending requirement");
if (blockedClosureGate.sourceQaReviewStatus !== "incomplete" || blockedClosureGate.sourceQaReviewItems.length !== 0) {
  fail("default remote closure gate must expose an incomplete source Q/A review report");
}

const completeSourceQaReviewReport = buildRemoteSourceQaReviewReport({
  generatedAt: "2026-05-17T10:13:26.500Z",
  reviewedSourceQaIds: remoteGoalClosureRequiredSourceQaIds,
});
if (completeSourceQaReviewReport.status !== "complete") fail("complete source Q/A review report must be complete");
if (completeSourceQaReviewReport.reviewedSourceQaIds.length !== 23) fail("complete source Q/A review report must review all 23 Q/A ids");
if (completeSourceQaReviewReport.duplicateSourceQaIds.length !== 0) fail("complete source Q/A review report must not have duplicate source Q/A ids");
if (completeSourceQaReviewReport.items.length !== 23) fail("complete source Q/A review report must include one item per Q/A id");
if (!completeSourceQaReviewReport.items.every((entry) => entry.disposition && entry.evidenceRefs.length > 0 && entry.writes === false)) {
  fail("complete source Q/A review report must include disposition, evidence refs, and no-write items");
}
if (!completeSourceQaReviewReport.externalPendingRequiredSourceQaIds.includes("QA-007")) {
  fail("complete source Q/A review report must identify source Q/A rows that still require external-pending disposition");
}
if (!completeSourceQaReviewReport.items.every((entry) => !completeSourceQaReviewReport.externalPendingRequiredSourceQaIds.includes(entry.qaId) || entry.disposition === "external_pending")) {
  fail("complete source Q/A review report must mark physical/provider source Q/A rows as external_pending");
}

const invalidSourceQaReviews = [{
  schemaVersion: 1,
  qaId: "QA-007",
  decisionKey: "transport_contract",
  requirementId: "RQ-007",
  disposition: "validated",
  evidenceRefs: ["docs/remote-gateway-sync-completion-audit.md"],
  reviewedAt: "2026-05-17T10:13:26.600Z",
  writes: false,
}];
const invalidSourceQaReviewReport = buildRemoteSourceQaReviewReport({
  generatedAt: "2026-05-17T10:13:26.600Z",
  reviews: invalidSourceQaReviews,
});
if (invalidSourceQaReviewReport.status !== "incomplete") fail("source Q/A report must reject validated disposition for external-pending physical/provider rows");
if (invalidSourceQaReviewReport.invalidExternalPendingDispositionQaIds.join(",") !== "QA-007") {
  fail("source Q/A report must expose invalid external-pending source Q/A dispositions");
}
const invalidSourceQaClosureGate = buildRemoteGoalClosureGate({
  generatedAt: "2026-05-17T10:13:26.650Z",
  sourceQaReviews: invalidSourceQaReviews,
});
if (invalidSourceQaClosureGate.invalidExternalPendingDispositionQaIds.join(",") !== "QA-007") {
  fail("remote closure gate must expose invalid external-pending source Q/A dispositions");
}

const duplicateSourceQaReviewReport = buildRemoteSourceQaReviewReport({
  generatedAt: "2026-05-17T10:13:26.700Z",
  reviews: [completeSourceQaReviewReport.items[0], completeSourceQaReviewReport.items[0]],
});
if (duplicateSourceQaReviewReport.status !== "incomplete") fail("source Q/A report must reject duplicate source Q/A rows");
if (duplicateSourceQaReviewReport.duplicateSourceQaIds.join(",") !== "QA-001") {
  fail("source Q/A report must expose duplicate source Q/A ids");
}
const duplicateSourceQaClosureGate = buildRemoteGoalClosureGate({
  generatedAt: "2026-05-17T10:13:26.710Z",
  sourceQaReviews: [completeSourceQaReviewReport.items[0], completeSourceQaReviewReport.items[0]],
});
if (duplicateSourceQaClosureGate.duplicateSourceQaIds.join(",") !== "QA-001") {
  fail("remote closure gate must expose duplicate source Q/A ids");
}

const sourceQaReviewTemplate = buildRemoteSourceQaReviewTemplate({
  generatedAt: "2026-05-17T10:13:26.750Z",
});
if (!remoteSourceQaReviewTemplateSchema.safeParse(sourceQaReviewTemplate).success) fail("remote source Q/A review template must validate");
if (sourceQaReviewTemplate.status !== "incomplete") fail("remote source Q/A review template must remain incomplete");
if (sourceQaReviewTemplate.writes !== false) fail("remote source Q/A review template must be no-write");
if (sourceQaReviewTemplate.sourceConversationId !== sourceConversationId) fail("remote source Q/A review template must bind the source conversation ID");
if (sourceQaReviewTemplate.sourcePlanId !== sourcePlanId) fail("remote source Q/A review template must bind the source plan ID");
if (sourceQaReviewTemplate.reviewCount !== 23) fail("remote source Q/A review template must include all 23 source Q/A rows");
if (sourceQaReviewTemplate.requiredSourceQaIds.length !== 23) fail("remote source Q/A review template must expose all required source Q/A ids");
if (!sourceQaReviewTemplate.submissionCommand.includes("claw remote closure-gate")) fail("remote source Q/A review template must point to closure-gate submission");
if (!sourceQaReviewTemplate.items.some((entry) => entry.qaId === "QA-023" && entry.decisionKey === "goal_closure_gate" && entry.requirementId === "Completion audit")) {
  fail("remote source Q/A review template must include QA-023 goal closure gate");
}
if (!sourceQaReviewTemplate.items.every((entry) => (
  entry.reviewed === false
  && entry.disposition === null
  && entry.evidenceRefs.length === 0
  && entry.reviewedAt === null
  && entry.writes === false
))) {
  fail("remote source Q/A review template must default to incomplete empty no-write rows");
}
const scopedSourceQaReviewTemplate = buildRemoteSourceQaReviewTemplate({
  generatedAt: "2026-05-17T10:13:26.800Z",
  sourceQaIds: ["QA-001", "QA-023"],
});
if (scopedSourceQaReviewTemplate.reviewCount !== 2) fail("scoped remote source Q/A review template must include exactly requested known Q/A rows");
if (scopedSourceQaReviewTemplate.items.map((entry) => entry.qaId).join(",") !== "QA-001,QA-023") {
  fail("scoped remote source Q/A review template must preserve requested known Q/A order");
}

const clearableClosureGate = buildRemoteGoalClosureGate({
  generatedAt: "2026-05-17T10:13:27.000Z",
  sourceQaReviews: completeSourceQaReviewReport.items,
  evidence: externalValidationChecklist.items.map((entry) => ({
    schemaVersion: 1,
    requirementId: entry.requirementId,
    approvedRun: true,
    approvedRunRef: `approval://${entry.requirementId}`,
    physicalEvidenceRef: `evidence://${entry.requirementId}`,
    artifactRefs: entry.requiredArtifacts,
    acceptedCriteria: entry.acceptanceCriteria,
    plaintextMaterialIncluded: false,
    executedAt: "2026-05-17T10:13:24.000Z",
    writes: false,
  })),
});
if (clearableClosureGate.status !== "clearable") fail("remote closure gate must become clearable only after source Q/A review and external validation clear");
if (clearableClosureGate.missingSourceQaIds.length !== 0) fail("clearable remote closure gate must have no missing source Q/A ids");
if (clearableClosureGate.sourceQaReviewStatus !== "complete" || clearableClosureGate.sourceQaReviewItems.length !== 23) fail("clearable remote closure gate must include complete source Q/A review evidence");
if (clearableClosureGate.blockedExternalRequirementIds.length !== 0) fail("clearable remote closure gate must have no blocked external requirements");
if (clearableClosureGate.clearableExternalRequirementIds.length !== externalPending.requirements.length) fail("clearable remote closure gate must clear every external requirement");
if (clearableClosureGate.blockers.length !== 0) fail("clearable remote closure gate must have no blockers");
const goalClosureReadiness = buildRemoteExternalValidationReadiness({
  generatedAt: "2026-05-17T10:13:27.100Z",
  sourceQaReviews: completeSourceQaReviewReport.items,
  evidence: externalValidationChecklist.items.map((entry) => ({
    schemaVersion: 1,
    requirementId: entry.requirementId,
    approvedRun: true,
    approvedRunRef: `approval://${entry.requirementId}`,
    physicalEvidenceRef: `evidence://${entry.requirementId}`,
    artifactRefs: entry.requiredArtifacts,
    acceptedCriteria: entry.acceptanceCriteria,
    plaintextMaterialIncluded: false,
    executedAt: "2026-05-17T10:13:24.000Z",
    writes: false,
  })),
});
if (goalClosureReadiness.status !== "ready_for_goal_closure") fail("external validation readiness must report ready_for_goal_closure after complete approved evidence");
if (goalClosureReadiness.closureGateStatus !== "clearable") fail("goal-closure readiness must expose clearable closure gate");
if (goalClosureReadiness.blockedExternalRequirementIds.length !== 0) fail("goal-closure readiness must have no blocked external rows");

const providerDeviceE2EPlan = buildRemoteProviderDeviceE2EValidationPlan({
  createdAt: "2026-05-17T10:13:30.000Z",
});
if (!remoteProviderDeviceE2EValidationPlanSchema.safeParse(providerDeviceE2EPlan).success) {
  fail("remote provider/device E2E validation plan must validate");
}
if (providerDeviceE2EPlan.status !== "external_pending") fail("provider/device E2E plan must remain external_pending until approved real validation runs");
for (const domain of ["chat", "search", "sync", "secret_refs", "hosted_agents"]) {
  if (!providerDeviceE2EPlan.requiredDomains.includes(domain)) fail(`provider/device E2E plan must include ${domain}`);
}
if (providerDeviceE2EPlan.validationSteps.map((entry) => entry.domain).join(",") !== providerDeviceE2EPlan.requiredDomains.join(",")) {
  fail("provider/device E2E plan must include one validation step per required domain in order");
}
for (const step of providerDeviceE2EPlan.validationSteps) {
  if (step.status !== "external_pending" || step.writes !== false) fail(`provider/device E2E step ${step.domain} must remain external_pending and no-write`);
  if (step.requiredRouteIds.length === 0 || step.requiredExternalPendingIds.length === 0 || step.requiredArtifacts.length === 0 || step.acceptanceCriteria.length === 0) {
    fail(`provider/device E2E step ${step.domain} must bind routes, external blockers, artifacts, and acceptance criteria`);
  }
}
if (!providerDeviceE2EPlan.validationSteps.some((entry) => entry.domain === "sync" && entry.requiredRouteIds.includes("sync.skills") && entry.requiredRouteIds.includes("mesh.resourceShare") && entry.requiredExternalPendingIds.includes("physical_sync_driver_application"))) {
  fail("provider/device E2E sync step must cover Sync routes, mesh share, and physical driver validation");
}
if (!providerDeviceE2EPlan.validationSteps.some((entry) => entry.domain === "secret_refs" && entry.requiredRouteIds.includes("remote.secretBrokeredOperation") && entry.requiredExternalPendingIds.includes("provider_secret_retrieval"))) {
  fail("provider/device E2E secret_refs step must cover brokered secret references and provider retrieval");
}
if (!providerDeviceE2EPlan.validationSteps.some((entry) => entry.domain === "hosted_agents" && entry.requiredRouteIds.includes("gateway.multiTenantAgentService") && entry.requiredExternalPendingIds.includes("billing_meter_persistence"))) {
  fail("provider/device E2E hosted_agents step must cover multi-tenant agent service and billing meter persistence");
}
for (const routeId of ["remote.chatGateway", "remote.searchGateway", "remote.secretBrokeredOperation", "gateway.multiTenantAgentService"]) {
  if (!providerDeviceE2EPlan.requiredRouteIds.includes(routeId)) fail(`provider/device E2E plan must include route ${routeId}`);
}
for (const requirementId of externalPending.requirements.map((entry) => entry.requirementId)) {
  if (!providerDeviceE2EPlan.requiredExternalPendingIds.includes(requirementId)) fail(`provider/device E2E plan must include pending gate ${requirementId}`);
}
if (!providerDeviceE2EPlan.approvedPhysicalValidationRequired) fail("provider/device E2E plan must require approved physical validation");
if (!providerDeviceE2EPlan.noPlaintextSecrets) fail("provider/device E2E plan must forbid plaintext secrets");
if (providerDeviceE2EPlan.plaintextMaterialIncluded !== false) fail("provider/device E2E plan must expose that plaintext material is absent");
if (!providerDeviceE2EPlan.hostedSelfHostedParityRequired) fail("provider/device E2E plan must require hosted/self-hosted parity");
if (providerDeviceE2EPlan.writes !== false) fail("provider/device E2E plan must be no-write");

const routeContracts = buildRemoteRouteContractCatalog({
  generatedAt: "2026-05-17T10:14:00.000Z",
  registeredRouteIds: (clawPersistentSurfaceRegistry.routes ?? []).map((route) => route.id),
});
if (!remoteRouteContractCatalogSchema.safeParse(routeContracts).success) fail("remote route contract catalog must validate");
if (routeContracts.status !== "complete") fail("remote route contract catalog must be complete");
if (routeContracts.missingRouteIds.length !== 0) fail(`remote route contract catalog missing routes: ${routeContracts.missingRouteIds.join(", ")}`);
if (routeContracts.contracts.length !== remoteSyncRequiredRouteIds.length) fail("remote route contract catalog must cover every required route");
const requiredRouteIdSet = new Set(remoteSyncRequiredRouteIds);
for (const contract of routeContracts.contracts) {
  if (!requiredRouteIdSet.has(contract.routeId)) fail(`remote route contract catalog includes unexpected route ${contract.routeId}`);
  if (contract.parityRequired !== true) fail(`${contract.routeId} must require local/remote parity`);
  if (contract.parallelApiAllowed !== false) fail(`${contract.routeId} must forbid parallel APIs`);
  if (contract.writes !== false) fail(`${contract.routeId} route contract must be no-write`);
  if (contract.localContractRefs.length === 0 || contract.remoteEntryPoints.length === 0) fail(`${contract.routeId} must bind local contract refs and remote entrypoints`);
}

for (const commandName of requiredCliCommands) {
  const command = clawCliCommandRegistry.commands.find((entry) => entry.name === commandName);
  if (!command) {
    fail(`missing CLI command ${commandName}`);
    continue;
  }
  if (!command.adrs.includes("docs/adr/0022-remote-gateway-sync-redesign.md")) fail(`${commandName} CLI must cite ADR 0022`);
  if (!command.tests.includes("packages/clawjs/src/inspect-cli.test.ts")) fail(`${commandName} CLI must name inspect CLI tests`);
}

const remoteSyncRoutesSource = readRequired("relay/src/server/remote-sync-routes.ts");
for (const route of requiredServiceApiRoutes) {
  requireText("remote sync service routes", remoteSyncRoutesSource, `clawApiPath("${route}")`);
}
const remoteSyncRoutesTestSource = readRequired("relay/src/server/remote-sync-routes.test.ts");
for (const snippet of [
  "buildRemoteExternalPendingRegister",
  "buildRemoteRouteContractCatalog",
  "remoteSyncRequiredRouteIds",
  "expectedExternalPending.requirements.map",
  "buildRemoteExternalValidationChecklist",
  "/v1/remote/external-validation-checklist",
  "buildRemoteExternalValidationEvidenceTemplate",
  "/v1/remote/external-validation-template",
  "buildRemoteExternalValidationEvidenceArtifact",
  "/v1/remote/external-validation-artifact",
  "buildRemoteExternalValidationRunbook",
  "/v1/remote/external-validation-runbook",
  "buildRemoteExternalValidationReadiness",
  "/v1/remote/external-validation-readiness",
  "buildRemoteExternalValidationApprovalRequest",
  "/v1/remote/external-validation-approval-request",
  "buildRemoteExternalValidationReport",
  "/v1/remote/external-validation-report",
  "buildRemoteSourceQaReviewTemplate",
  "/v1/remote/source-qa-template",
  "buildRemoteGoalClosureGate",
  "sourceQaReviewItems",
  "docs/remote-gateway-sync-external-validation-evidence.json",
  "artifactExternalValidationReport",
  "readyForApprovedRun",
  "sourceQaReviewArtifact",
  "reviewedPendingClosureGate",
  "/v1/remote/closure-gate",
  "expectedRouteContracts.contracts.map",
  "buildRemoteProviderDeviceE2EValidationPlan",
  "/v1/remote/provider-device-e2e-plan",
]) {
  requireText("remote sync service route tests", remoteSyncRoutesTestSource, snippet);
}

const inspectCliSource = readRequired("packages/clawjs/src/inspect-cli.ts");
for (const snippet of [
  'command === "remote"',
  "buildRemoteConformanceReport",
  "buildRemoteOfflineCommandResult",
  "buildRemoteExternalPendingRegister",
  "buildRemoteExternalValidationEvidenceTemplate",
  "buildRemoteExternalValidationReadiness",
  "buildRemoteExternalValidationApprovalRequest",
  "buildRemoteSourceQaReviewTemplate",
  "buildRemoteRouteContractCatalog",
  "buildSyncDriverCatalog",
  "SyncAuthorityHandoffReceipt",
  "transport_agnostic_iroh_v1_adapter",
]) {
  requireText("inspect remote CLI", inspectCliSource, snippet);
}

for (const [driver, expectedRoute] of driverRouteExpectations) {
  const parsed = syncDriverSchema.parse(driver);
  if (routeIdForSyncDriver(parsed) !== expectedRoute) fail(`${driver} must map to ${expectedRoute}`);
}

const syncDriverCatalog = buildSyncDriverCatalog({ registeredRouteIds: remoteSyncRequiredRouteIds });
if (syncDriverCatalog.status !== "complete") fail("sync driver catalog must be complete for required remote routes");
if (syncDriverCatalog.driverCount !== syncDriverSchema.options.length) fail("sync driver catalog must cover every sync driver");
if (syncDriverCatalog.missingDrivers.length !== 0) fail("sync driver catalog must not miss drivers");
if (syncDriverCatalog.missingRouteIds.length !== 0) fail("sync driver catalog must not miss routes");
if (syncDriverCatalog.authorityModel !== "per_resource") fail("sync driver catalog must keep per-resource authority");
if (syncDriverCatalog.conflictDefault !== "detect_and_elevate") fail("sync driver catalog must default to detect-and-elevate");
if (syncDriverCatalog.physicalApplicationStatus !== "external_pending") fail("sync driver catalog must keep physical driver application external pending");
if (!syncDriverCatalog.entries.every((entry) => entry.manifestBacked && entry.changelogBacked && entry.authorityScoped && entry.physicalDriverRequired && entry.writes === false)) {
  fail("sync driver catalog entries must be manifest/changelog backed, authority-scoped, physical-driver gated, and no-write");
}
if (!syncDriverCatalog.entries.some((entry) => entry.driver === "skills" && entry.lateralDomains.includes("skills"))) fail("sync driver catalog must include skills sync");
if (!syncDriverCatalog.entries.some((entry) => entry.driver === "memory_user_model" && entry.lateralDomains.includes("memory"))) fail("sync driver catalog must include memory/user-model sync");
if (!syncDriverCatalog.entries.some((entry) => entry.driver === "drive_files" && entry.lateralDomains.includes("drive"))) fail("sync driver catalog must include drive/files sync");
if (!syncDriverCatalog.entries.some((entry) => entry.driver === "sqlite_partial" && entry.partialResourceSupported)) fail("sync driver catalog must include partial database sync");

const manifest = createSyncResourceManifest({
  resourceId: "skills:default",
  kind: "skills",
  ownerNodeId: "node.mac",
  driver: "skills",
  allowedPeerNodeIds: ["node.server"],
});
if (manifest.secretPolicy.plaintextReplication !== false) fail("sync manifest must forbid plaintext secret replication");
if (manifest.secretPolicy.secretRefsOnly !== true) fail("sync manifest must require secret refs only");
if (manifest.secretPolicy.brokerLeaseRequired !== true) fail("sync manifest must require broker leases");
if (manifest.cachePolicy.encrypted !== true) fail("sync client cache must be encrypted");
if (manifest.cachePolicy.storesSecrets !== false) fail("sync client cache must not store secrets");
if (manifest.cachePolicy.storesAuthoritativeState !== false) fail("sync client cache must not store authoritative state");

const compatReceipt = createRemoteCompatibilityAdapterReceipt({
  legacySurface: "relay.mobile.chat",
  canonicalRouteId: "remote.chatGateway",
  clientKind: "ios",
  createdAt: "2026-05-17T10:11:00.000Z",
});
if (!remoteCompatibilityAdapterReceiptSchema.safeParse(compatReceipt).success) fail("remote compatibility adapter receipt must validate");
if (compatReceipt.mapsToCanonical !== true) fail("remote compatibility adapters must map to canonical routes");
if (compatReceipt.parallelApiIntroduced !== false) fail("remote compatibility adapters must not introduce parallel APIs");
if (compatReceipt.writes !== false) fail("remote compatibility adapter receipts must be no-write contracts");

const classificationReceipt = createRemoteSurfaceClassificationReceipt({
  capabilityId: "claw.gateway",
  classification: "remote-safe",
  routeId: "remote.chatGateway",
  policyRef: "docs/adr/0022-remote-gateway-sync-redesign.md",
  testRefs: ["scripts/verify-remote-sync-goal.mjs"],
  createdAt: "2026-05-17T10:12:00.000Z",
});
if (!remoteSurfaceClassificationReceiptSchema.safeParse(classificationReceipt).success) fail("remote surface classification receipt must validate");
if (classificationReceipt.remoteSafeReady !== true) fail("remote-safe classification receipts must require complete evidence");
if (classificationReceipt.missingEvidence.length !== 0) fail("complete remote-safe classification receipts must not report missing evidence");
if (classificationReceipt.writes !== false) fail("remote surface classification receipts must be no-write contracts");
try {
  createRemoteSurfaceClassificationReceipt({
    capabilityId: "claw.gateway",
    classification: "remote-safe",
    createdAt: "2026-05-17T10:12:30.000Z",
  });
  fail("remote-safe classification without route/policy/tests must fail closed");
} catch (error) {
  if (!(error instanceof Error) || !/requires route, policy, and tests/.test(error.message)) {
    fail("remote-safe classification failure must explain missing route/policy/tests");
  }
}

const actor = remoteActorContextSchema.parse({
  actorKind: "agent",
  actorId: "agent.sync",
  nodeId: "node.mac",
  transport: "gateway",
  trustMode: "governed_gateway",
});
const conflictPlan = buildSyncPlan({
  manifest,
  actor,
  localNodeId: "node.mac",
  peerNodeId: "node.server",
  localSnapshots: [{
    resourceId: "skills:default",
    objectRef: "skill.review",
    nodeId: "node.mac",
    contentHash: "hash-a",
    updatedAt: "2026-05-17T09:00:00.000Z",
    deleted: false,
  }],
  peerSnapshots: [{
    resourceId: "skills:default",
    objectRef: "skill.review",
    nodeId: "node.server",
    contentHash: "hash-b",
    updatedAt: "2026-05-17T09:05:00.000Z",
    deleted: false,
  }],
  now: "2026-05-17T10:00:00.000Z",
});
if (conflictPlan.writes !== false) fail("sync planning must be dry-run and write false");
if (!conflictPlan.actions.some((action) => action.action === "conflict")) fail("diverged snapshots must produce a conflict action");
if (conflictPlan.conflicts[0]?.status !== "open") fail("default conflict status must be open");
if (!conflictPlan.nextCursor?.cursor.includes("skill.review")) fail("sync conflict plan must produce a reconciliation cursor");
const conflictQueue = buildSyncQueueEntries(conflictPlan, { queuedAt: "2026-05-17T10:01:00.000Z" });
if (conflictQueue[0]?.status !== "blocked") fail("sync conflicts must enter the offline queue as blocked");
if (conflictQueue[0]?.writes !== false) fail("sync queue entries must be no-write contracts");
const blockedQueue = reconcileSyncQueue({
  manifest,
  queue: conflictQueue,
  now: "2026-05-17T10:02:00.000Z",
});
if (blockedQueue.writes !== false) fail("sync reconciliation must be dry-run/write false");
if (!blockedQueue.blockedConflictIds.includes(conflictPlan.conflicts[0]?.conflictId)) fail("sync reconciliation must keep unresolved conflicts blocked");
if (blockedQueue.nextCursor) fail("sync reconciliation must not advance cursor while conflicts remain blocked");
const resolvedQueue = reconcileSyncQueue({
  manifest,
  queue: conflictQueue,
  resolvedConflictIds: [conflictPlan.conflicts[0]?.conflictId ?? ""],
  now: "2026-05-17T10:03:00.000Z",
});
if (resolvedQueue.queue[0]?.status !== "resolved") fail("sync reconciliation must record resolved conflicts explicitly");
if (!resolvedQueue.nextCursor?.cursor.includes("skill.review")) fail("sync reconciliation must expose next cursor after terminal queue state");

const matchingPlan = buildSyncPlan({
  manifest,
  actor,
  localNodeId: "node.mac",
  peerNodeId: "node.server",
  localSnapshots: [{
    resourceId: "skills:default",
    objectRef: "skill.review",
    nodeId: "node.mac",
    contentHash: "hash-a",
    updatedAt: "2026-05-17T09:00:00.000Z",
    deleted: false,
  }],
  peerSnapshots: [{
    resourceId: "skills:default",
    objectRef: "skill.review",
    nodeId: "node.server",
    contentHash: "hash-a",
    updatedAt: "2026-05-17T09:05:00.000Z",
    deleted: false,
  }],
  now: "2026-05-17T10:00:00.000Z",
});
if (matchingPlan.actions[0]?.action !== "noop") fail("matching snapshots must produce noop");
if (matchingPlan.conflicts.length !== 0) fail("matching snapshots must not produce conflicts");

const pushPlan = buildSyncPlan({
  manifest,
  actor,
  localNodeId: "node.mac",
  peerNodeId: "node.server",
  localSnapshots: [{
    resourceId: "skills:default",
    objectRef: "skill.local-only",
    nodeId: "node.mac",
    contentHash: "hash-local",
    updatedAt: "2026-05-17T09:10:00.000Z",
    deleted: false,
  }],
  peerSnapshots: [],
  now: "2026-05-17T10:00:00.000Z",
});
const pushQueue = buildSyncQueueEntries(pushPlan, { queuedAt: "2026-05-17T10:04:00.000Z" });
if (pushQueue[0]?.status !== "queued") fail("sync push changes must enter the offline queue as queued");
const appliedQueue = reconcileSyncQueue({
  manifest,
  queue: pushQueue,
  acknowledgedChangeIds: [pushPlan.changes[0]?.changeId ?? ""],
  now: "2026-05-17T10:05:00.000Z",
});
if (appliedQueue.queue[0]?.status !== "applied") fail("sync reconciliation must mark acknowledged changes applied");
if (!appliedQueue.nextCursor?.cursor.includes("hash-local")) fail("sync reconciliation must advance cursor after acknowledged queued changes");
const syncApplicationReceipt = createSyncDriverApplicationReceipt({
  manifest,
  reconciliation: appliedQueue,
  actor,
  createdAt: "2026-05-17T10:05:30.000Z",
});
if (!syncDriverApplicationReceiptSchema.safeParse(syncApplicationReceipt).success) fail("sync driver application receipt contract must validate");
if (syncApplicationReceipt.status !== "signed_pending_driver_application") fail("sync driver application receipt must stay pending without physical driver execution");
if (!syncApplicationReceipt.externalPending.includes("physical_sync_driver_application")) fail("sync driver application receipt must mark physical driver application external pending");
if (syncApplicationReceipt.physicalDriverApplied !== false) fail("sync driver application receipt must not claim physical application by default");
if (syncApplicationReceipt.writes !== false) fail("sync driver application receipt must be a no-write contract");

const syncAuthorityHandoffReceipt = createSyncAuthorityHandoffReceipt({
  manifest,
  toNodeId: "node.server",
  actor,
  requestedAuthority: "primary",
  createdAt: "2026-05-17T10:05:45.000Z",
});
if (!syncAuthorityHandoffReceiptSchema.safeParse(syncAuthorityHandoffReceipt).success) fail("sync authority handoff receipt contract must validate");
if (syncAuthorityHandoffReceipt.status !== "signed_pending_authority_handoff") fail("sync authority handoff must stay pending without physical authority transfer");
if (!syncAuthorityHandoffReceipt.externalPending.includes("physical_authority_handoff")) fail("sync authority handoff must mark physical authority transfer external pending");
if (syncAuthorityHandoffReceipt.physicalAuthorityApplied !== false) fail("sync authority handoff must not claim physical authority transfer by default");
if (syncAuthorityHandoffReceipt.writes !== false) fail("sync authority handoff receipt must be a no-write contract");
if (!syncAuthorityHandoffReceipt.requestedResidency.includes("node.server")) fail("sync authority handoff must include target node in requested residency");
if (syncAuthorityHandoffReceipt.previousAuthority !== manifest.authority) fail("sync authority handoff must record previous manifest authority");
if (syncAuthorityHandoffReceipt.fromNodeId !== manifest.ownerNodeId) fail("sync authority handoff must record source owner node");

const offlineCommand = buildRemoteOfflineCommandResult({
  routeId: "remote.chatGateway",
  actor: {
    actorKind: "human",
    actorId: "user.local",
    nodeId: "node.mac",
    transport: "gateway",
    trustMode: "governed_gateway",
  },
  evaluatedAt: "2026-05-17T10:06:00.000Z",
});
if (offlineCommand.status !== "failed_fast") fail("offline remote commands must fail fast");
if (offlineCommand.reason !== "connector_offline") fail("offline remote commands must expose the offline reason");
if (offlineCommand.enqueued !== false) fail("offline remote commands must not be queued as sync work");
if (offlineCommand.retryable !== true) fail("offline remote command failures must remain retryable");
if (offlineCommand.writes !== false) fail("offline remote command failure must not write");

const meshInvitation = createMeshInvitation({
  issuerMeshId: "mesh.home",
  coordinatorNodeId: "node.mac",
  recipientMeshId: "mesh.server",
  allowedResourceIds: ["skills:default"],
  allowedActions: ["read", "sync"],
  createdAt: "2026-05-17T10:07:00.000Z",
  expiresAt: "2026-05-18T10:07:00.000Z",
});
if (meshInvitation.status !== "pending") fail("mesh invitations must start pending");
if (meshInvitation.writes !== false) fail("mesh invitations must be no-write until signed Coordinator execution");
if (!meshInvitationSchema.safeParse(meshInvitation).success) fail("mesh invitation contract must validate");
const meshAcceptance = createMeshInvitationAcceptance({
  invitation: meshInvitation,
  accepterMeshId: "mesh.server",
  actor: {
    actorKind: "human",
    actorId: "user.remote",
    nodeId: "node.server",
    transport: "gateway",
    trustMode: "governed_gateway",
  },
  acceptedAt: "2026-05-17T10:07:30.000Z",
});
if (meshAcceptance.status !== "signed_pending_peer_trust") fail("mesh invitation acceptance must stay pending physical peer trust");
if (!meshAcceptance.externalPending.includes("physical_peer_trust")) fail("mesh invitation acceptance must mark physical peer trust external pending");
if (!meshAcceptance.externalPending.includes("device_trust_acceptance")) fail("mesh invitation acceptance must mark device trust acceptance external pending");
if (meshAcceptance.writes !== false) fail("mesh invitation acceptance must be no-write until signed physical trust");
if (!meshInvitationAcceptanceSchema.safeParse(meshAcceptance).success) fail("mesh invitation acceptance contract must validate");
const meshShare = createMeshResourceShare({
  invitation: meshInvitation,
  toMeshId: "mesh.server",
  manifest,
  actions: ["read", "sync"],
  createdAt: "2026-05-17T10:08:00.000Z",
  expiresAt: "2026-05-18T10:08:00.000Z",
});
if (meshShare.status !== "proposed") fail("mesh resource shares must be proposed before signed execution");
if (meshShare.plaintextSecrets !== false) fail("mesh resource shares must forbid plaintext secrets");
if (meshShare.writes !== false) fail("mesh resource shares must be no-write contracts");
if (!meshResourceShareSchema.safeParse(meshShare).success) fail("mesh share contract must validate");
let disallowedShareFailed = false;
try {
  createMeshResourceShare({
    invitation: meshInvitation,
    toMeshId: "mesh.server",
    manifest: createSyncResourceManifest({
      resourceId: "memory:default",
      kind: "memory",
      ownerNodeId: "node.mac",
      driver: "memory_user_model",
    }),
    actions: ["sync"],
    expiresAt: "2026-05-18T10:09:00.000Z",
  });
} catch {
  disallowedShareFailed = true;
}
if (!disallowedShareFailed) fail("mesh shares must reject resources outside invitation scope");
const meshRevocation = createMeshRevocation({
  targetType: "share",
  targetId: meshShare.shareId,
  actor: {
    actorKind: "human",
    actorId: "user.local",
    nodeId: "node.mac",
    transport: "gateway",
    trustMode: "governed_gateway",
  },
  reason: "owner_revoked",
  revokedAt: "2026-05-17T10:09:00.000Z",
});
if (meshRevocation.cascadeSyncQueues !== true) fail("mesh revocations must cascade sync queue access");
if (meshRevocation.writes !== false) fail("mesh revocations must be no-write contracts until signed execution");
if (!meshRevocationSchema.safeParse(meshRevocation).success) fail("mesh revocation contract must validate");

const serviceAssignment = {
  schemaVersion: 1,
  tenantId: "tenant.acme",
  agentId: "agent.support",
  assignmentId: "assignment.service",
  status: "active",
  routeIds: ["gateway.multiTenantAgentService"],
  budgetId: "budget.service",
  billingAccountId: "billing.acme",
  isolationKey: "tenant.acme:assignment.service",
  auditRequired: true,
};
const serviceBudget = {
  budgetId: "budget.service",
  tenantId: "tenant.acme",
  billingAccountId: "billing.acme",
  limitCents: 5000,
  usedCents: 1200,
  billingMeterId: "meter.agent-service",
};
const serviceAllowed = evaluateRemoteAgentServiceAccess({
  request: {
    tenantId: "tenant.acme",
    agentId: "agent.support",
    assignmentId: "assignment.service",
    routeId: "gateway.multiTenantAgentService",
    estimatedCostCents: 300,
    now: "2026-05-17T10:10:00.000Z",
  },
  assignment: serviceAssignment,
  budget: serviceBudget,
});
if (!serviceAllowed.allowed) fail(`multi-tenant agent service evaluator must allow scoped assignment/budget: ${serviceAllowed.reasons.join(", ")}`);
if (serviceAllowed.audit.eventType !== "remote.agent_service.evaluated") fail("multi-tenant agent service evaluator must emit audit metadata");
if (serviceAllowed.writes !== false) fail("multi-tenant agent service evaluator must be no-write");
if (!remoteAgentServiceDecisionSchema.safeParse(serviceAllowed).success) fail("multi-tenant agent service decision contract must validate");
const serviceExecutionReceipt = createRemoteAgentServiceExecutionReceipt({
  request: {
    tenantId: "tenant.acme",
    agentId: "agent.support",
    assignmentId: "assignment.service",
    routeId: "gateway.multiTenantAgentService",
    estimatedCostCents: 300,
    now: "2026-05-17T10:10:00.000Z",
  },
  assignment: serviceAssignment,
  budget: serviceBudget,
  decision: serviceAllowed,
});
if (!remoteAgentServiceExecutionReceiptSchema.safeParse(serviceExecutionReceipt).success) fail("multi-tenant agent service execution receipt contract must validate");
if (serviceExecutionReceipt.status !== "signed_pending_runtime") fail("multi-tenant agent service receipt must stay signed pending runtime without physical execution");
if (!serviceExecutionReceipt.externalPending.includes("agent_runtime_execution")) fail("multi-tenant agent service receipt must mark runtime execution external pending");
if (!serviceExecutionReceipt.externalPending.includes("billing_meter_persistence")) fail("multi-tenant agent service receipt must mark billing meter persistence external pending");
if (serviceExecutionReceipt.writes !== false) fail("multi-tenant agent service execution receipt must be no-write");
const serviceTenantDenied = evaluateRemoteAgentServiceAccess({
  request: {
    tenantId: "tenant.other",
    agentId: "agent.support",
    assignmentId: "assignment.service",
    routeId: "gateway.multiTenantAgentService",
    estimatedCostCents: 300,
    now: "2026-05-17T10:11:00.000Z",
  },
  assignment: serviceAssignment,
  budget: serviceBudget,
});
if (serviceTenantDenied.allowed) fail("multi-tenant agent service evaluator must deny tenant mismatch");
if (!serviceTenantDenied.reasons.includes("tenant: assignment belongs to a different tenant")) fail("multi-tenant agent service evaluator must explain tenant isolation denial");
const serviceBudgetDenied = evaluateRemoteAgentServiceAccess({
  request: {
    tenantId: "tenant.acme",
    agentId: "agent.support",
    assignmentId: "assignment.service",
    routeId: "gateway.multiTenantAgentService",
    estimatedCostCents: 4000,
    now: "2026-05-17T10:12:00.000Z",
  },
  assignment: serviceAssignment,
  budget: serviceBudget,
});
if (serviceBudgetDenied.allowed) fail("multi-tenant agent service evaluator must deny over-budget requests");
if (!serviceBudgetDenied.reasons.includes("budget: estimated cost exceeds limit")) fail("multi-tenant agent service evaluator must explain budget denial");

const lease = remoteSecretLeaseSchema.parse({
  leaseId: "lease.1",
  secretRef: "vault://agents/sync",
  actor,
  action: "sync.plan",
  resourceId: "skills:default",
  expiresAt: "2026-05-17T10:10:00.000Z",
  plaintextReturned: false,
  auditEventId: "audit.lease.1",
});
if (lease.plaintextReturned !== false) fail("remote secret lease must never return plaintext");

const remoteAccessRequest = remoteAccessRequestSchema.parse({
  actor: {
    actorKind: "agent",
    actorId: "agent.sync",
    agentId: "agent.sync",
    assignmentId: "assignment.sync",
    runId: "run.sync",
    nodeId: "node.mac",
    transport: "gateway",
    trustMode: "governed_gateway",
  },
  routeId: "remote.secretBrokeredOperation",
  resourceType: "secret",
  resourceId: "vault://agents/sync",
  action: "sync.plan",
  classification: "remote-safe",
  trustMode: "governed_gateway",
  transport: "gateway",
  secretRefs: ["vault://agents/sync"],
  plaintextSecretRequested: false,
  now: "2026-05-17T10:00:00.000Z",
});
const remoteAccessGrants = [
  "agent",
  "assignment",
  "execution_profile",
  "connector",
  "host",
  "run_scope",
  "remote_classification",
  "transport_trust",
  "secret_broker",
].map((plane) => remoteAccessGrantSchema.parse({
  id: `grant.${plane}`,
  plane,
  resourceType: "secret",
  resourceId: "vault://agents/sync",
  action: "sync.plan",
  effect: "allow",
  ...(plane === "secret_broker" ? { requiresBrokerLease: true } : {}),
}));
const remoteAccessAllowed = evaluateRemoteAccess({ request: remoteAccessRequest, grants: remoteAccessGrants });
if (!remoteAccessAllowed.allowed) fail(`remote access evaluator must allow fully granted remote-safe brokered request: ${remoteAccessAllowed.reasons.join(", ")}`);
if (!remoteAccessAllowed.requiredBrokerLease) fail("remote access evaluator must require broker leases for secret refs");
const remoteAccessDenied = evaluateRemoteAccess({
  request: { ...remoteAccessRequest, classification: "blocked" },
  grants: remoteAccessGrants,
});
if (remoteAccessDenied.allowed) fail("remote access evaluator must fail closed for blocked remote classifications");
if (!remoteAccessDenied.reasons.includes("remote_classification: blocked is not remote-safe")) {
  fail("remote access evaluator must explain blocked remote classifications");
}
const gatewayAuditReceipt = createRemoteGatewayAuditReceipt({
  sourceEventType: remoteAccessAllowed.audit.eventType,
  routeId: remoteAccessAllowed.audit.routeId,
  actor: remoteAccessRequest.actor,
  resourceType: remoteAccessAllowed.audit.resourceType,
  resourceId: remoteAccessAllowed.audit.resourceId,
  action: remoteAccessAllowed.audit.action,
  decision: remoteAccessAllowed.allowed,
  createdAt: remoteAccessRequest.now,
});
if (!remoteGatewayAuditReceiptSchema.safeParse(gatewayAuditReceipt).success) fail("Gateway audit receipt contract must validate");
if (gatewayAuditReceipt.hostAuditStore !== "signed_host_audit") fail("Gateway audit receipts must target signed host audit store");
if (gatewayAuditReceipt.signedHostAuditPersisted !== false) fail("Gateway audit receipts must not claim host persistence without physical validation");
if (!gatewayAuditReceipt.externalPending.includes("signed_host_audit_persistence")) fail("Gateway audit receipts must mark signed host audit persistence external pending");
if (gatewayAuditReceipt.writes !== false) fail("Gateway audit receipts must be no-write contracts");

const packageJson = JSON.parse(readRequired("package.json"));
if (packageJson.scripts?.["test:remote-sync-goal"] !== "node --import tsx ./scripts/verify-remote-sync-goal.mjs") {
  fail("package.json must expose test:remote-sync-goal");
}
if (!packageJson.scripts?.["test:docs"]?.includes("npm run test:remote-sync-goal")) {
  fail("test:docs must include test:remote-sync-goal");
}

if (failures.length > 0) {
  console.error("remote gateway sync goal verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`remote gateway sync goal verification passed (${remoteSyncRequiredDecisionIds.length} source decisions, ${remoteSyncRequiredRouteIds.length} routes)`);
