import { test } from "vitest";
import assert from "node:assert/strict";

import {
  CLAW_CANONICAL_HIERARCHY,
  CLAW_CANONICAL_TERMS,
  CLAW_NON_SYNONYMS,
  ClawError,
  PRODUCTIVITY_COLLECTION_DEFINITIONS,
  activityEntryRecordSchema,
  areaRecordSchema,
  assertCodexReadOnlyPath,
  assignmentRecordSchema,
  artifactRecordSchema,
  auditEventSchema,
  blockerRecordSchema,
  buildRemoteOfflineCommandResult,
  buildRemoteConformanceReport,
  buildRemoteExternalPendingRegister,
  buildRemoteExternalValidationChecklist,
  buildRemoteExternalValidationEvidenceArtifact,
  buildRemoteExternalValidationApprovalRequest,
  buildRemoteExternalValidationEvidenceTemplate,
  buildRemoteExternalValidationReport,
  buildRemoteExternalValidationReadiness,
  buildRemoteExternalValidationRunbook,
  buildRemoteDecisionReview,
  buildRemoteGoalClosureGate,
  buildRemoteProviderDeviceE2EValidationPlan,
  buildRemoteSourceQaReviewReport,
  buildRemoteSourceQaReviewTemplate,
  parseRemoteExternalValidationEvidenceInput,
  parseRemoteSourceQaReviewInput,
  remoteGoalClosureRequiredSourceQaIds,
  buildRemoteRouteContractCatalog,
  buildSyncDriverCatalog,
  buildSyncQueueEntries,
  buildSyncPlan,
  capacityRecordSchema,
  clawAppStateProjectionSchema,
  clawAppStateSyncReceiptSchema,
  clawAppStateTransactionRequestSchema,
  clawCommandRequestSchema,
  clawCommandResponseSchema,
  clawEvolutionLedgerSchema,
  clawEvolutionPublicSurfaceBaselineSchema,
  clawEvolutionPolicy,
  clawEvolutionRecordSchema,
  clawEvolutionOperatorPlanSchema,
  clawEvolutionReceiptSchema,
  clawEvolutionRepairReportSchema,
  clawEvolutionRollbackReportSchema,
  clawEvolutionMigratorLabResultSchema,
  clawEvolutionVersionFixtureSchema,
  classifyEvolutionBackupPolicy,
  createEvolutionOperatorPlan,
  createEvolutionPublicSurfaceBaseline,
  createEvolutionRepairReport,
  createEvolutionReceipt,
  createEvolutionRollbackReport,
  diffEvolutionPublicSurfaceBaseline,
  redactEvolutionReceiptText,
  runEvolutionMigratorLab,
  clawApiPath,
  clawCorePorts,
  clawContractFixturesV1,
  clawContractVersionV1,
  clawStorageFiles,
  clawEventsPath,
  clawExportExtensions,
  clawGlobalHomeLayout,
  clawPersistentSurfaceRegistry,
  clawCliFlagContractCatalog,
  clawEventTopicContractCatalog,
  clawJsonFieldContractCatalog,
  clawLocalHostnames,
  clawPortContractCatalog,
  clawPublicApiPrefix,
  clawServiceSocketPath,
  clawServiceWindowsPipe,
  clawStableContractCatalogs,
  clawSurfaceRegistryVersion,
  clawWorkspaceLayout,
  clawixBridgePort,
  clawixHomeLayout,
  clawDomainOwnershipEntriesV1,
  clawDomainOwnershipMatrixV1,
  clawDomainSchema,
  clawHostRegistrySchema,
  clawCliCommandRegistry,
  clawJsonSchemasV1,
  agentRecordSchema,
  createCodexReadOnlySourceDescriptor,
  createMeshInvitation,
  createMeshInvitationAcceptance,
  createMeshResourceShare,
  createMeshRevocation,
  createRemoteAgentServiceExecutionReceipt,
  createRemoteClientCacheSnapshot,
  createRemoteCompatibilityAdapterReceipt,
  createRemoteGatewayAuditReceipt,
  createRemoteSurfaceClassificationReceipt,
  createSyncAuthorityHandoffReceipt,
  createSyncDriverApplicationReceipt,
  createSyncResourceManifest,
  createTtsPlaybackPlan,
  compatSnapshotSchema,
  createManifest,
  decisionRecordSchema,
  deadlineRecordSchema,
  eventRecordSchema,
  evaluateRemoteAgentServiceAccess,
  evaluateRemoteAccess,
  feedbackRecordSchema,
  findClawPersistentSurfaceNode,
  findClawSurfaceRoute,
  createExampleSyncResourceManifest,
  goalRecordSchema,
  handoffRecordSchema,
  incidentRecordSchema,
  listClawSurfaceEdges,
  listClawSurfaceRoutes,
  listClawPersistentSurfaceNodes,
  linkedEntityRefSchema,
  segmentTextForTts,
  semanticPlanSchema,
  manifestSchema,
  milestoneRecordSchema,
  maskCredential,
  meshInvitationSchema,
  meshInvitationAcceptanceSchema,
  meshResourceShareSchema,
  meshRevocationSchema,
  nodeIdentitySchema,
  noteRecordSchema,
  operationalCheckRecordSchema,
  personIdentitySchema,
  projectRecordSchema,
  productivityApprovalRecordSchema,
  releaseRecordSchema,
  reminderRecordSchema,
  reconcileSyncQueue,
  resolveClawPersistentSurfacePath,
  resolveClawGlobalDataDir,
  resolveClawHostRegistryPath,
  resolveClawHostStateDir,
  resolveClawWorkspaceDir,
  resourceKindSchema,
  remoteActorContextSchema,
  remoteAccessDecisionSchema,
  remoteAccessGrantSchema,
  remoteAccessRequestSchema,
  remoteAgentServiceDecisionSchema,
  remoteAgentServiceExecutionReceiptSchema,
  remoteCompatibilityAdapterReceiptSchema,
  remoteDecisionReviewSchema,
  remoteExternalValidationEvidenceArtifactSchema,
  remoteExternalValidationRunbookSchema,
  remoteExternalPendingRegisterSchema,
  remoteProviderDeviceE2EValidationPlanSchema,
  remoteSourceQaReviewTemplateSchema,
  remoteRouteContractCatalogSchema,
  remoteSurfaceClassificationReceiptSchema,
  remoteGatewayAuditReceiptSchema,
  remoteSecretLeaseSchema,
  remoteSyncRequiredDecisionIds,
  remoteSyncRequiredRouteIds,
  routeIdForSyncDriver,
  searchClawCliRegistry,
  syncConflictSchema,
  syncAuthorityHandoffReceiptSchema,
  syncDriverApplicationReceiptSchema,
  syncObjectSnapshotSchema,
  taskRecordSchema,
  workSessionRecordSchema,
  stripMarkdownForTts,
  summarizeReadiness,
  templatePackSchema,
  temporalItemSchema,
  workspaceSearchQuerySchema,
  withSurfaceChildren,
} from "./catalogs.ts";

const expectedRemoteRegistryMethodRoutes = [
  "GET /v1/remote/classifications",
  "POST /v1/remote/classifications/receipts",
  "GET /v1/remote/conformance",
  "GET /v1/remote/offline-command",
  "POST /v1/remote/offline-command",
  "GET /v1/remote/external-pending",
  "GET /v1/remote/external-validation-checklist",
  "GET /v1/remote/external-validation-template",
  "POST /v1/remote/external-validation-template",
  "GET /v1/remote/external-validation-artifact",
  "POST /v1/remote/external-validation-artifact",
  "GET /v1/remote/external-validation-runbook",
  "GET /v1/remote/external-validation-readiness",
  "POST /v1/remote/external-validation-readiness",
  "GET /v1/remote/external-validation-approval-request",
  "POST /v1/remote/external-validation-approval-request",
  "GET /v1/remote/external-validation-report",
  "POST /v1/remote/external-validation-report",
  "GET /v1/remote/source-qa-template",
  "POST /v1/remote/source-qa-template",
  "GET /v1/remote/decision-review",
  "POST /v1/remote/decision-review",
  "GET /v1/remote/closure-gate",
  "POST /v1/remote/closure-gate",
  "GET /v1/remote/route-contracts",
  "GET /v1/remote/provider-device-e2e-plan",
  "GET /v1/remote/compatibility/adapters",
  "POST /v1/remote/compatibility/adapters",
  "GET /v1/sync/drivers",
  "GET /v1/sync/manifests",
  "POST /v1/sync/manifests",
  "GET /v1/sync/changes",
  "POST /v1/sync/plan",
  "POST /v1/sync/conflicts",
  "POST /v1/sync/applications",
  "POST /v1/sync/authority-handoffs",
  "GET /v1/nodes",
  "POST /v1/nodes/pair",
  "POST /v1/nodes/trust",
  "POST /v1/nodes/revoke",
  "POST /v1/mesh/invitations",
  "POST /v1/mesh/invitations/accept",
  "POST /v1/mesh/shares",
  "POST /v1/mesh/revocations",
  "GET /v1/gateway/conformance",
  "POST /v1/gateway/agent-service/evaluate",
  "POST /v1/gateway/agent-service/executions",
  "POST /v1/gateway/audit/receipts",
];

test("productivity collection definitions expose the unified local and remote contract", () => {
  const collectionNames = PRODUCTIVITY_COLLECTION_DEFINITIONS.map((definition) => definition.name);
  assert.deepEqual(collectionNames.slice(0, 5), [
    "areas",
    "people",
    "tasks",
    "goals",
    "projects",
  ]);
  assert.equal(collectionNames.includes("lists"), true);
  assert.equal(collectionNames.includes("sections"), true);
  assert.equal(collectionNames.includes("comments"), true);
  assert.equal(collectionNames.includes("attachments"), true);
  assert.equal(collectionNames.includes("saved_views"), true);
  assert.equal(collectionNames.includes("recurrences"), true);
  assert.equal(collectionNames.includes("cycles"), true);
  assert.equal(collectionNames.includes("epics"), true);
  assert.equal(collectionNames.includes("custom_fields"), true);
  assert.equal(collectionNames.includes("field_values"), true);
  assert.equal(collectionNames.includes("templates"), true);
  // Keep this workspace collection block contiguous even when adjacent catalog
  // families move in or out of the productivity registry.
  const idxReminders = collectionNames.indexOf("reminders");
  assert.ok(idxReminders >= 0, "reminders collection present");
  assert.deepEqual(collectionNames.slice(idxReminders, idxReminders + 5), [
    "reminders",
    "deadlines",
    "notes",
    "inbox_threads",
    "inbox_messages",
  ]);
  assert.deepEqual(collectionNames.filter((name) => [
    "milestones",
    "events",
    "activity_entries",
    "blockers",
    "artifacts",
    "decisions",
    "work_sessions",
    "assignments",
    "handoffs",
    "approvals",
    "capacity",
    "releases",
    "incidents",
    "feedback",
    "checks",
  ].includes(name)), [
    "milestones",
    "events",
    "activity_entries",
    "blockers",
    "artifacts",
    "decisions",
    "work_sessions",
    "assignments",
    "handoffs",
    "approvals",
    "capacity",
    "releases",
    "incidents",
    "feedback",
    "checks",
  ]);

  const goalFields = PRODUCTIVITY_COLLECTION_DEFINITIONS.find((definition) => definition.name === "goals")?.fields ?? [];
  assert.equal(goalFields.some((field) => field.name === "parentId"), true);
  assert.equal(goalFields.some((field) => field.name === "parentGoalId"), true);
  assert.equal(goalFields.some((field) => field.name === "ownerAgentId"), true);

  const projectFields = PRODUCTIVITY_COLLECTION_DEFINITIONS.find((definition) => definition.name === "projects")?.fields ?? [];
  assert.equal(projectFields.some((field) => field.name === "leadAgentId"), true);
  assert.equal(projectFields.some((field) => field.name === "reviewAt"), true);
  assert.equal(projectFields.some((field) => field.name === "defaultSectionIds"), true);

  const taskFields = PRODUCTIVITY_COLLECTION_DEFINITIONS.find((definition) => definition.name === "tasks")?.fields ?? [];
  assert.equal(taskFields.some((field) => field.name === "blockedByIds"), true);
  assert.equal(taskFields.some((field) => field.name === "approvalIds"), true);
  assert.equal(taskFields.some((field) => field.name === "startAt"), true);
  assert.equal(taskFields.some((field) => field.name === "sectionId"), true);

  const blockerFields = PRODUCTIVITY_COLLECTION_DEFINITIONS.find((definition) => definition.name === "blockers")?.fields ?? [];
  assert.equal(blockerFields.some((field) => field.name === "kind"), true);

  const assignmentFields = PRODUCTIVITY_COLLECTION_DEFINITIONS.find((definition) => definition.name === "assignments")?.fields ?? [];
  assert.equal(assignmentFields.some((field) => field.name === "assignedToAgentId"), true);

  const approvalFields = PRODUCTIVITY_COLLECTION_DEFINITIONS.find((definition) => definition.name === "approvals")?.fields ?? [];
  assert.equal(approvalFields.some((field) => field.name === "policyReason"), true);

  const releaseFields = PRODUCTIVITY_COLLECTION_DEFINITIONS.find((definition) => definition.name === "releases")?.fields ?? [];
  assert.equal(releaseFields.some((field) => field.name === "incidentIds"), true);

  const incidentFields = PRODUCTIVITY_COLLECTION_DEFINITIONS.find((definition) => definition.name === "incidents")?.fields ?? [];
  assert.equal(incidentFields.some((field) => field.name === "severity"), true);
});

test("canonical terminology exports the agreed product vocabulary", () => {
  assert.equal(CLAW_CANONICAL_TERMS.runtimeAdapter, "runtime adapter");
  assert.equal(CLAW_CANONICAL_TERMS.agentProfile, "agent profile");
  assert.deepEqual(CLAW_CANONICAL_HIERARCHY, [
    "runtimeAdapter",
    "workspace",
    "agent",
    "agentProfile",
    "provider",
    "model",
    "gateway",
  ]);
  assert.deepEqual(CLAW_NON_SYNONYMS.gateway, ["runtime adapter"]);
  assert.deepEqual(CLAW_NON_SYNONYMS.workspace, ["agent"]);
  assert.deepEqual(CLAW_NON_SYNONYMS.provider, ["model"]);
});

test("tts helpers strip markdown and build a stable playback plan", () => {
  const plain = stripMarkdownForTts("## Hello\n\n**World** [link](https://example.com)\n- item");
  assert.equal(plain, "Hello. World link item");

  const segments = segmentTextForTts(
    "First sentence. Second sentence with, enough detail to split safely if needed.",
    { maxSegmentLength: 20 },
  );
  assert.deepEqual(segments, [
    "First sentence.",
    "Second sentence",
    "with, enough detail",
    "to split safely if",
    "needed.",
  ]);

  const plan = createTtsPlaybackPlan({
    text: "Paragraph one.\n\nParagraph two with `inline code`.",
  });
  assert.equal(plan.plainText, "Paragraph one. Paragraph two with inline code.");
  assert.deepEqual(
    plan.segments.map((segment) => segment.text),
    ["Paragraph one.", "Paragraph two with inline code."],
  );
});
