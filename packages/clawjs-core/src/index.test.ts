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
  "GET /v1/remote/custom-app-sdk",
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

test("createManifest returns a valid manifest", () => {
  const manifest = createManifest({
    appId: "demo-app",
    workspaceId: "demo-workspace",
    agentId: "demo-agent",
    rootDir: "/tmp/demo",
    projectId: "demo-project",
    logicalAgentId: "designer",
    runtimeAgentId: "designer-demo-project",
    materializationVersion: 1,
  }, "openclaw");

  assert.deepEqual(manifestSchema.parse(manifest), manifest);
  assert.equal(manifest.projectId, "demo-project");
  assert.equal(manifest.logicalAgentId, "designer");
  assert.equal(manifest.runtimeAgentId, "designer-demo-project");
  assert.equal(manifest.materializationVersion, 1);
});

test("evolution policy and ledger schemas preserve the rescue backbone", () => {
  assert.equal(clawEvolutionPolicy.sourceOfTruth, "clawjs");
  assert.equal(clawEvolutionPolicy.postV1Migration, "step_by_step_all_public_versions");
  assert.equal(clawEvolutionPolicy.rescueCore, "launch_chat_repair");
  assert.equal(clawEvolutionPolicy.legacyLocation, "boundary_migrators_adapters_receipts");
  assert.equal(clawEvolutionPolicy.receipts.externalSubmission, "explicit_approval_only");
  assert.equal(clawEvolutionPolicy.cli.subcommands.includes("repair"), true);
  assert.equal(clawEvolutionPolicy.cli.subcommands.includes("rollback"), true);

  const record = clawEvolutionRecordSchema.parse({
    id: "evo_test_record",
    title: "Test record",
    class: "migration_required",
    status: "active",
    owner: "claw",
    surfaces: ["claw.schema.example"],
    tests: ["packages/clawjs-core/src/index.test.ts"],
    createdAt: "2026-05-18T00:00:00.000Z",
  });
  assert.equal(record.class, "migration_required");

  const ledger = clawEvolutionLedgerSchema.parse({
    schemaVersion: 1,
    policy: {
      sourceOfTruth: "clawjs",
      postV1Migration: "step_by_step_all_public_versions",
      rescueCore: "launch_chat_repair",
    },
    records: [record],
  });
  assert.equal(ledger.records.length, 1);
});

test("evolution public surface baseline detects uncovered drift", () => {
  const baseline = createEvolutionPublicSurfaceBaseline({
    generatedAt: "2026-05-18T00:00:00.000Z",
    surfaces: clawPersistentSurfaceRegistry.nodes,
    cliCommands: clawCliCommandRegistry.commands,
  });
  assert.equal(clawEvolutionPublicSurfaceBaselineSchema.safeParse(baseline).success, true);
  assert.equal(baseline.counts.cliCommands, clawCliCommandRegistry.commands.length);
  assert.equal(baseline.counts.surfaces, clawPersistentSurfaceRegistry.nodes.length);

  const unchanged = diffEvolutionPublicSurfaceBaseline({
    baseline,
    current: baseline,
    ledger: {
      schemaVersion: 1,
      policy: {
        sourceOfTruth: "clawjs",
        postV1Migration: "step_by_step_all_public_versions",
        rescueCore: "launch_chat_repair",
      },
      records: [],
    },
  });
  assert.equal(unchanged.status, "unchanged");
  assert.equal(unchanged.summary.uncovered, 0);

  const current = createEvolutionPublicSurfaceBaseline({
    generatedAt: baseline.generatedAt,
    surfaces: clawPersistentSurfaceRegistry.nodes,
    cliCommands: clawCliCommandRegistry.commands.slice(1),
  });
  const changed = diffEvolutionPublicSurfaceBaseline({
    baseline,
    current,
    ledger: {
      schemaVersion: 1,
      policy: {
        sourceOfTruth: "clawjs",
        postV1Migration: "step_by_step_all_public_versions",
        rescueCore: "launch_chat_repair",
      },
      records: [],
    },
  });
  assert.equal(changed.status, "changed");
  assert.equal(changed.uncoveredChanges.length > 0, true);
});

test("evolution operator plan gates mutations and classifies backups", () => {
  const ledger = clawEvolutionLedgerSchema.parse({
    schemaVersion: 1,
    policy: {
      sourceOfTruth: "clawjs",
      postV1Migration: "step_by_step_all_public_versions",
      rescueCore: "launch_chat_repair",
    },
    records: [{
      id: "evo_test_migration",
      title: "Test migration",
      class: "migration_required",
      status: "active",
      owner: "claw",
      surfaces: ["claw.database.records", "claw.search.index", "claw.external.provider"],
      tests: ["packages/clawjs-core/src/index.test.ts"],
      createdAt: "2026-05-18T00:00:00.000Z",
    }],
  });

  const dryRun = createEvolutionOperatorPlan({ action: "dry-run", ledger, ledgerPath: "docs/evolution/baseline.json" });
  assert.equal(clawEvolutionOperatorPlanSchema.safeParse(dryRun).success, true);
  assert.equal(dryRun.status, "dry_run_ready");
  assert.equal(dryRun.mutates, false);
  assert.equal(dryRun.requiresApproval, false);
  assert.equal(dryRun.rescueCore, "launch_chat_repair");
  assert.equal(dryRun.steps.some((step) => step.id === "preserve_launch_chat_repair"), true);
  assert.equal(dryRun.backupPolicies.find((policy) => policy.surface === "claw.database.records")?.strategy, "snapshot_before_mutation");
  assert.equal(dryRun.backupPolicies.find((policy) => policy.surface === "claw.search.index")?.strategy, "rebuildable_no_canonical_backup");
  assert.equal(dryRun.backupPolicies.find((policy) => policy.surface === "claw.external.provider")?.strategy, "external_read_only");

  const repair = createEvolutionOperatorPlan({ action: "repair", ledger });
  assert.equal(repair.status, "approval_gated_plan");
  assert.equal(repair.mutates, true);
  assert.equal(repair.requiresApproval, true);
  assert.equal(repair.steps.find((step) => step.id === "prepare_best_effort_backup")?.status, "approval_gated");

  assert.equal(classifyEvolutionBackupPolicy("claw.schema.v1").strategy, "snapshot_before_mutation");
  assert.equal(classifyEvolutionBackupPolicy("@clawjs/core migration lab API").strategy, "touched_objects_metadata");
});

test("evolution rollback report records restore point and forward repair contract", () => {
  const ledger = clawEvolutionLedgerSchema.parse({
    schemaVersion: 1,
    policy: {
      sourceOfTruth: "clawjs",
      postV1Migration: "step_by_step_all_public_versions",
      rescueCore: "launch_chat_repair",
    },
    records: [{
      id: "evo_test_rollback",
      title: "Test rollback",
      class: "migration_required",
      status: "active",
      owner: "claw",
      surfaces: ["claw.database.records", "claw.search.index", "claw.external.provider"],
      tests: ["packages/clawjs-core/src/index.test.ts"],
      createdAt: "2026-05-18T00:00:00.000Z",
    }],
  });

  const rollbackPlan = createEvolutionOperatorPlan({
    action: "rollback",
    ledger,
    fromVersion: "v2",
    toVersion: "v1",
  });
  const rollbackReport = createEvolutionRollbackReport({
    action: "rollback",
    plan: rollbackPlan,
    createdAt: "2026-05-18T00:00:00.000Z",
  });

  assert.equal(clawEvolutionRollbackReportSchema.safeParse(rollbackReport).success, true);
  assert.equal(rollbackReport.status, "needs_approval");
  assert.equal(rollbackReport.restorePoint.reversibility, "best_effort_forward_repair");
  assert.equal(rollbackReport.restorePoint.universalRollbackPromised, false);
  assert.equal(rollbackReport.restorePoint.retentionDays, clawEvolutionPolicy.backup.retentionDays);
  assert.equal(rollbackReport.restorePoint.maxBytesBeforeOverride, clawEvolutionPolicy.backup.threshold.maxBytes);
  assert.equal(rollbackReport.restorePoint.maxFilesBeforeOverride, clawEvolutionPolicy.backup.threshold.maxFiles);
  assert.equal(rollbackReport.restorePoint.surfaces.find((surface) => surface.surface === "claw.database.records")?.canonical, true);
  assert.equal(rollbackReport.restorePoint.surfaces.find((surface) => surface.surface === "claw.search.index")?.canonical, false);
  assert.equal(rollbackReport.forwardRepair.required, true);
  assert.equal(rollbackReport.forwardRepair.command, "claw evolution repair --json");
  assert.equal(rollbackReport.approvalRequiredActions.some((action) => action.id === "mutate_local_state"), true);
  assert.equal(rollbackReport.approvalRequiredActions.some((action) => action.id === "snapshot_canonical_data"), true);
  assert.equal(rollbackReport.approvalRequiredActions.some((action) => action.id === "create_restore_point"), true);
  assert.equal(rollbackReport.approvalRequiredActions.some((action) => action.id === "forward_repair_after_rollback"), true);
  assert.equal(rollbackReport.redaction.promptsIncluded, false);
  assert.equal(rollbackReport.receipt.redaction.fullLocalPathsIncluded, false);
});

test("evolution receipts redact paths, prompts, and secrets", () => {
  const ledger = clawEvolutionLedgerSchema.parse({
    schemaVersion: 1,
    policy: {
      sourceOfTruth: "clawjs",
      postV1Migration: "step_by_step_all_public_versions",
      rescueCore: "launch_chat_repair",
    },
    records: [{
      id: "evo_test_receipt",
      title: "Test receipt",
      class: "compatible",
      status: "active",
      owner: "claw",
      surfaces: ["claw.workspace.state"],
      tests: ["packages/clawjs-core/src/index.test.ts"],
      createdAt: "2026-05-18T00:00:00.000Z",
    }],
  });
  const plan = createEvolutionOperatorPlan({ action: "plan", ledger });
  const receipt = createEvolutionReceipt({
    action: "plan",
    plan,
    createdAt: "2026-05-18T00:00:00.000Z",
    notes: [`prompt: please fix ${["/Users", "trabajo", "private"].join("/")} with sk-1234567890abcdef`],
    errors: [`message=${["/Users", "trabajo", "Desktop", "Clawix"].join("/")} failed`],
  });
  assert.equal(clawEvolutionReceiptSchema.safeParse(receipt).success, true);
  assert.equal(receipt.redaction.promptsIncluded, false);
  assert.equal(receipt.redaction.secretsIncluded, false);
  assert.equal(receipt.redaction.fullLocalPathsIncluded, false);
  assert.equal(receipt.notes[0].includes("please fix"), false);
  assert.equal(receipt.notes[0].includes("sk-"), false);
  assert.equal(receipt.notes[0].includes("/Users/"), false);
  assert.equal(receipt.errors[0].includes("/Users/"), false);
  assert.equal(redactEvolutionReceiptText("input: hello; path /Users/me/demo"), "input: [redacted_prompt]; path [redacted_path]");
});

test("evolution migrator lab validates foundation fixtures", () => {
  const ledger = clawEvolutionLedgerSchema.parse({
    schemaVersion: 1,
    policy: {
      sourceOfTruth: "clawjs",
      postV1Migration: "step_by_step_all_public_versions",
      rescueCore: "launch_chat_repair",
    },
    records: [{
      id: "evo_test_lab",
      title: "Test lab",
      class: "migration_required",
      status: "active",
      owner: "claw",
      surfaces: ["docs/evolution/fixtures", "@clawjs/core migration lab API"],
      tests: ["packages/clawjs-core/src/index.test.ts"],
      createdAt: "2026-05-18T00:00:00.000Z",
    }],
  });
  const kinds = [
    "database",
    "workspace_file",
    "global_file",
    "protocol",
    "cli_json",
    "package_export",
    "agent_instruction",
    "skill",
    "route",
    "schema",
    "backup",
    "search_index",
    "permission",
    "audit",
    "rescue",
  ] as const;
  const fixture = clawEvolutionVersionFixtureSchema.parse({
    schemaVersion: 1,
    fixtureId: "evo_fixture_test_foundation",
    publicVersion: "v1",
    createdAt: "2026-05-18T00:00:00.000Z",
    phase: "pre_v1_foundation",
    rescueCore: "launch_chat_repair",
    surfaces: kinds.map((kind) => ({
      id: `claw.fixture.${kind}.v1`,
      kind,
      owner: kind === "rescue" ? "clawix" : "clawjs",
      backupStrategy: kind === "database" || kind === "schema" || kind === "permission"
        ? "snapshot_before_mutation"
        : kind === "search_index"
          ? "rebuildable_no_canonical_backup"
          : "touched_objects_metadata",
      payload: kind === "search_index" ? { source: "core.sqlite" } : { synthetic: true },
      expectedCurrent: (() => {
        switch (kind) {
        case "protocol":
          return { degradeTo: "ephemeral_chat" };
        case "route":
          return { command: "claw evolution doctor --json", survivesPartialMigration: true };
        case "cli_json":
          return { json: true, schemaVersion: 1 };
        case "package_export":
          return { exportsRemainTyped: true };
        case "agent_instruction":
          return { instruction: "Keep current code clean; legacy only in migrators/adapters/receipts/fixtures." };
        case "skill":
          return { skill: "compatibility-evolution-work", projectedToClawix: true };
        case "search_index":
          return { rebuildFromCanonical: true };
        default:
          return { preserved: true };
        }
      })(),
    })),
    notes: ["synthetic"],
  });

  const result = runEvolutionMigratorLab({
    fixtures: [fixture],
    ledger,
    stableSurfaces: clawPersistentSurfaceRegistry.nodes,
    fromVersion: "v1",
    toVersion: "current",
    createdAt: "2026-05-18T00:00:00.000Z",
  });
  assert.equal(clawEvolutionMigratorLabResultSchema.safeParse(result).success, true);
  assert.equal(result.status, "pass");
  assert.equal(result.fixtureIds.includes("evo_fixture_test_foundation"), true);
  assert.equal(result.versionChain.length, 1);
  assert.equal(result.versionChain[0]?.fromVersion, "foundation");
  assert.equal(result.versionChain[0]?.toVersion, "v1");
  assert.equal(result.versionChain[0]?.status, "pass");
  assert.equal(result.checks.every((check) => check.status === "pass"), true);
  assert.equal(result.checks.find((check) => check.id === "version_chain_complete")?.status, "pass");
  assert.equal(result.checks.find((check) => check.id === "adapter_contracts_present")?.status, "pass");
  assert.equal(result.checks.find((check) => check.id === "rebuild_contracts_present")?.status, "pass");
  assert.equal(result.checks.find((check) => check.id === "adapter_retirement_policy")?.status, "pass");
  assert.equal(result.checks.find((check) => check.id === "stable_surface_strategy_coverage")?.status, "pass");
  assert.equal(result.stableSurfaceCoverage.length > 0, true);
  assert.equal(result.stableSurfaceCoverage.every((check) => check.status === "pass"), true);
  assert.equal(result.adapterChecks.every((check) => check.status === "pass"), true);
  assert.equal(result.rebuildChecks.every((check) => check.status === "pass"), true);
  assert.equal(result.receipts[0].redaction.promptsIncluded, false);

  const v2Fixture = clawEvolutionVersionFixtureSchema.parse({
    ...fixture,
    fixtureId: "evo_fixture_test_v2",
    publicVersion: "v2",
    previousPublicVersion: "v1",
    phase: "public_release",
    notes: ["synthetic v2"],
  });
  const chained = runEvolutionMigratorLab({
    fixtures: [fixture, v2Fixture],
    ledger,
    fromVersion: "v1",
    toVersion: "v2",
    createdAt: "2026-05-18T00:00:00.000Z",
  });
  assert.equal(chained.status, "pass");
  assert.equal(chained.versionChain.some((entry) => entry.fromVersion === "v1" && entry.toVersion === "v2" && entry.status === "pass"), true);

  const brokenV2Fixture = clawEvolutionVersionFixtureSchema.parse({
    ...v2Fixture,
    fixtureId: "evo_fixture_test_v2_broken",
    previousPublicVersion: undefined,
  });
  const brokenChain = runEvolutionMigratorLab({
    fixtures: [fixture, brokenV2Fixture],
    ledger,
  });
  assert.equal(brokenChain.status, "fail");
  assert.equal(brokenChain.checks.find((check) => check.id === "version_chain_complete")?.status, "fail");

  const repairPlan = createEvolutionOperatorPlan({ action: "repair", ledger, fromVersion: "v1", toVersion: "current" });
  const repairReport = createEvolutionRepairReport({
    action: "repair",
    plan: repairPlan,
    migrationLab: result,
    surfaceBaseline: { status: "unchanged", changed: 0, uncovered: 0 },
    createdAt: "2026-05-18T00:00:00.000Z",
  });
  assert.equal(clawEvolutionRepairReportSchema.safeParse(repairReport).success, true);
  assert.equal(repairReport.status, "needs_approval");
  assert.equal(repairReport.patch.format, "unified_diff");
  assert.equal(repairReport.patch.redacted, true);
  assert.equal(repairReport.safeActions.some((action) => action.command === "claw evolution doctor --json"), true);
  assert.equal(repairReport.safeActions.some((action) => action.command?.startsWith("claw evolution dry-run")), true);
  assert.equal(repairReport.approvalRequiredActions.some((action) => action.id === "mutate_local_state"), true);
  assert.equal(repairReport.receipt.redaction.promptsIncluded, false);
  assert.equal(repairReport.receipt.redaction.secretsIncluded, false);
  assert.equal(repairReport.receipt.redaction.fullLocalPathsIncluded, false);

  const externalReport = createEvolutionRepairReport({
    action: "report",
    plan: createEvolutionOperatorPlan({ action: "report", ledger }),
    migrationLab: result,
    createdAt: "2026-05-18T00:00:00.000Z",
  });
  assert.equal(externalReport.redaction.externalSubmission, "explicit_approval_only");
  assert.equal(externalReport.approvalRequiredActions.some((action) => action.id === "submit_external_report"), true);

  const incomplete = runEvolutionMigratorLab({
    fixtures: [{ ...fixture, surfaces: fixture.surfaces.filter((surface) => surface.kind !== "rescue") }],
    ledger,
  });
  assert.equal(incomplete.status, "fail");
  assert.equal(incomplete.checks.find((check) => check.id === "required_surface_kinds")?.status, "fail");

  const missingRebuildContract = runEvolutionMigratorLab({
    fixtures: [{
      ...fixture,
      fixtureId: "evo_fixture_test_missing_rebuild",
      surfaces: fixture.surfaces.map((surface) => surface.kind === "search_index"
        ? { ...surface, expectedCurrent: { preserved: true } }
        : surface),
    }],
    ledger,
  });
  assert.equal(missingRebuildContract.status, "fail");
  assert.equal(missingRebuildContract.checks.find((check) => check.id === "rebuild_contracts_present")?.status, "fail");

  const missingAdapterContract = runEvolutionMigratorLab({
    fixtures: [{
      ...fixture,
      fixtureId: "evo_fixture_test_missing_adapter",
      surfaces: fixture.surfaces.map((surface) => surface.kind === "protocol"
        ? { ...surface, expectedCurrent: { preserved: true } }
        : surface),
    }],
    ledger,
  });
  assert.equal(missingAdapterContract.status, "fail");
  assert.equal(missingAdapterContract.checks.find((check) => check.id === "adapter_contracts_present")?.status, "fail");

  const retiredRuntimeAdapter = runEvolutionMigratorLab({
    fixtures: [fixture],
    ledger: {
      ...ledger,
      records: [...ledger.records, {
        id: "evo_retired_runtime_adapter_test",
        title: "Retired runtime adapter test",
        class: "adapter_required",
        status: "retired_runtime_adapter",
        owner: "claw",
        surfaces: ["claw.runtime.adapter.test"],
        tests: ["packages/clawjs-core/src/index.test.ts"],
        adapter: "runtime protocol adapter retired after compatibility window",
        createdAt: "2026-05-18T00:00:00.000Z",
      }],
    },
  });
  assert.equal(retiredRuntimeAdapter.status, "pass");
  assert.equal(retiredRuntimeAdapter.checks.find((check) => check.id === "adapter_retirement_policy")?.status, "pass");

  const retiredDataMigrator = runEvolutionMigratorLab({
    fixtures: [fixture],
    ledger: {
      ...ledger,
      records: [...ledger.records, {
        id: "evo_retired_data_migrator_test",
        title: "Retired data migrator test",
        class: "migration_required",
        status: "retired_runtime_adapter",
        owner: "claw",
        surfaces: ["claw.database.core.records.v1"],
        tests: ["packages/clawjs-core/src/index.test.ts"],
        migration: "public data migrator must remain forward-compatible",
        createdAt: "2026-05-18T00:00:00.000Z",
      }],
    },
  });
  assert.equal(retiredDataMigrator.status, "fail");
  assert.equal(retiredDataMigrator.checks.find((check) => check.id === "adapter_retirement_policy")?.status, "fail");

  const missingStableSurfaceStrategy = runEvolutionMigratorLab({
    fixtures: [fixture],
    ledger,
    stableSurfaces: [{
      id: "test.unknown.stable.surface",
      kind: "unsupportedStableKind",
      owner: "claw",
      name: "Unsupported Stable Surface",
      storageClass: "frameworkGlobal",
      canonicality: "canonical",
      privacy: "userData",
      lifecycle: "durable",
      surfaceClass: "persistent",
      stability: "v1",
    } as any],
  });
  assert.equal(missingStableSurfaceStrategy.status, "fail");
  assert.equal(missingStableSurfaceStrategy.checks.find((check) => check.id === "stable_surface_strategy_coverage")?.status, "fail");
});

test("maskCredential keeps only the tail", () => {
  assert.equal(maskCredential("sk-12345678"), "*******5678");
  assert.equal(maskCredential("abcd", 4), "****");
  assert.equal(maskCredential(""), null);
});

test("summarizeReadiness degrades until all tracked capabilities are ready", () => {
  const degraded = summarizeReadiness({
    runtime: { name: "runtime", status: "ready" },
    workspace: { name: "workspace", status: "ready" },
    auth: { name: "auth", status: "degraded", recommendedActions: ["login"] },
  });

  assert.equal(degraded.overallStatus, "degraded");
  assert.deepEqual(degraded.recommendedActions, ["login"]);

  const ready = summarizeReadiness({
    runtime: { name: "runtime", status: "ready" },
    workspace: { name: "workspace", status: "ready" },
    auth: { name: "auth", status: "ready" },
    models: { name: "models", status: "ready" },
    file_sync: { name: "file_sync", status: "ready" },
  });

  assert.equal(ready.overallStatus, "ready");
});

test("ClawError preserves code and repair hint", () => {
  const error = new ClawError({
    code: "runtime_not_found",
    message: "OpenClaw CLI is missing",
    capability: "runtime",
    repairHint: "Install the runtime first.",
  });

  assert.equal(error.code, "runtime_not_found");
  assert.equal(error.repairHint, "Install the runtime first.");
});

test("host contract schemas validate v1 command and registry payloads", () => {
  const request = clawCommandRequestSchema.parse({
    schemaVersion: clawContractVersionV1,
    requestId: "req-1",
    domain: "calendar",
    resource: "events",
    action: "list",
    arguments: { limit: 10 },
    clientContext: { bundleId: "com.example.host" },
  });

  assert.equal(request.validationMode, "host_real");
  assert.equal(request.domain, "calendar");

  const registry = clawHostRegistrySchema.parse({
    schemaVersion: clawContractVersionV1,
    activeHostId: "claw",
    updatedAt: "2026-05-13T10:00:00.000Z",
    hosts: [
      {
        schemaVersion: clawContractVersionV1,
        id: "claw",
        displayName: "Claw",
        kind: "standalone",
        bundleId: "com.example.claw",
        endpoint: { transport: "xpc", address: "com.example.claw.runtime" },
        capabilities: [
          {
            id: "calendar.events.list",
            domain: "calendar",
            actions: ["list"],
            riskLevel: "read",
            brokerRequired: true,
            requiresOSPermission: true,
          },
        ],
        registeredAt: "2026-05-13T10:00:00.000Z",
        updatedAt: "2026-05-13T10:00:00.000Z",
      },
    ],
  });

  assert.equal(registry.hosts[0]?.capabilities[0]?.osPermissionState, "unknown");
});

test("host contract fixtures and JSON schema exports cover the public v1 surface", () => {
  assert.equal(clawJsonSchemasV1.commandRequest.$id, "https://schemas.clawjs.ai/v1/command-request.schema.json");
  assert.equal(clawJsonSchemasV1.commandResponse.$id, "https://schemas.clawjs.ai/v1/command-response.schema.json");
  assert.equal(clawJsonSchemasV1.hostDescriptor.$id, "https://schemas.clawjs.ai/v1/host-descriptor.schema.json");
  assert.equal(clawJsonSchemasV1.appStateTransactionRequest.$id, "https://schemas.clawjs.ai/v1/app-state-transaction-request.schema.json");
  assert.equal(clawJsonSchemasV1.appStateSyncReceipt.$id, "https://schemas.clawjs.ai/v1/app-state-sync-receipt.schema.json");
  assert.equal(clawJsonSchemasV1.appStateProjection.$id, "https://schemas.clawjs.ai/v1/app-state-projection.schema.json");

  const request = clawCommandRequestSchema.parse(clawContractFixturesV1.commandRequest);
  const response = clawCommandResponseSchema.parse(clawContractFixturesV1.commandResponse);
  const registry = clawHostRegistrySchema.parse(clawContractFixturesV1.hostRegistry);

  assert.equal(request.schemaVersion, clawContractVersionV1);
  assert.equal(response.meta.hostId, "clawix");
  assert.equal(registry.activeHostId, "clawix");
});

test("appState host contract validates transactional operations, receipts and projections", () => {
  const request = clawAppStateTransactionRequestSchema.parse({
    schemaVersion: clawContractVersionV1,
    requestId: "req-appstate-1",
    hostId: "clawix",
    operations: [
      { kind: "project.upsert", id: "proj-1", name: "Project", path: "/tmp/project" },
      { kind: "pin.upsert", threadId: "thread-1", sortOrder: 1000 },
    ],
  });
  assert.equal(request.operations.length, 2);
  assert.equal(request.operations[0]?.kind, "project.upsert");

  const receipt = clawAppStateSyncReceiptSchema.parse({
    schemaVersion: clawContractVersionV1,
    receiptId: "receipt-req-appstate-1",
    requestId: "req-appstate-1",
    hostId: "clawix",
    status: "applied",
    operationCount: 2,
    appliedAt: "2026-05-20T10:00:00.000Z",
  });
  assert.equal(receipt.error, null);

  const projection = clawAppStateProjectionSchema.parse({
    schemaVersion: clawContractVersionV1,
    projectedAt: "2026-05-20T10:00:00.000Z",
    projects: [{ id: "proj-1" }],
    pinnedThreads: [{ threadId: "thread-1" }],
    titles: [],
    archives: [],
    sidebar: [],
    terminalTabs: [],
    receipts: [receipt],
  });
  assert.equal(projection.receipts[0]?.requestId, "req-appstate-1");
});

test("domain ownership matrix covers every v1 host domain", () => {
  const domains = new Set(clawDomainSchema.options);
  const requiredClosedDomains = [
    "agents",
    "skills",
    "skill_collections",
    "connections",
    "personalities",
    "apps",
    "design",
    "audio",
    "provider_routing",
    "snippets",
    "mcp",
    "integrations",
    "calendar",
    "contacts",
    "database",
    "index",
    "marketplace",
    "iot",
    "publishing",
    "signals",
    "health",
    "travel",
    "career",
    "family",
    "legal",
    "finance",
    "location",
    "accounts",
    "resource_registry",
  ] as const;

  assert.equal(clawDomainOwnershipEntriesV1.length, domains.size);
  assert.deepEqual(
    Object.keys(clawDomainOwnershipMatrixV1).sort(),
    [...domains].sort(),
  );

  for (const domain of requiredClosedDomains) {
    assert.equal(domains.has(domain), true, `${domain} must be first-class in the v1 host domain enum`);
    assert.equal(clawDomainOwnershipMatrixV1[domain].status, "contract_defined", `${domain} must be explicitly contract-defined`);
  }

  for (const entry of clawDomainOwnershipEntriesV1) {
    assert.equal(entry.domain in clawDomainOwnershipMatrixV1, true);
    assert.equal(entry.frameworkOwns.length > 0, true, entry.domain);
    assert.equal(entry.hostOwns.length > 0, true, entry.domain);
    assert.equal(entry.clawixUiOwns.length > 0, true, entry.domain);
    assert.ok(entry.phase >= 5 && entry.phase <= 12, entry.domain);
    assert.ok(entry.requiredTests.includes("contract_fixture"), entry.domain);
    assert.ok(entry.requiredTests.includes("cli_json"), entry.domain);
    assert.ok(entry.requiredTests.includes("clawix_embedded"), entry.domain);
  }

  assert.deepEqual(clawDomainOwnershipMatrixV1.calendar.requiredTests.includes("signed_permission_preflight"), true);
  assert.deepEqual(clawDomainOwnershipMatrixV1.system.brokerRequired, true);
  assert.deepEqual(clawDomainOwnershipMatrixV1.sessions.requiredTests.includes("codex_read_only"), true);
  assert.deepEqual(clawDomainOwnershipMatrixV1.voice.destructivePolicy, "none");
});

test("resource registry exposes first-class resource kinds for closed domains", () => {
  const requiredResourceKinds = [
    "app",
    "design",
    "audio",
    "provider",
    "model",
    "prompt",
    "snippet",
    "mcp-server",
    "marketplace-listing",
    "iot-device",
    "publishing-artifact",
    "signal-record",
    "health-record",
    "travel-record",
    "career-record",
    "family-record",
    "legal-record",
    "finance-record",
    "location-record",
    "account-record",
    "calendar-event",
    "contact",
    "index",
    "connection",
    "personality",
    "skill-collection",
  ] as const;

  for (const kind of requiredResourceKinds) {
    assert.equal(resourceKindSchema.safeParse(kind).success, true, `${kind} must be a v1 resource kind`);
  }
});

test("persistent surface registry exposes framework and host storage nodes", () => {
  assert.equal(clawPersistentSurfaceRegistry.version, clawSurfaceRegistryVersion);

  const coreDatabase = findClawPersistentSurfaceNode("claw.database.core");
  assert.equal(coreDatabase?.kind, "database");
  assert.equal(coreDatabase?.path, "~/.claw/data/core.sqlite");
  assert.deepEqual(coreDatabase?.envOverrides?.includes("CLAW_DATABASE_DB_PATH"), true);

  const contracts = findClawPersistentSurfaceNode("claw.contracts");
  assert.equal(contracts?.name, "Claw stable contract surface");

  const workspaceChildren = listClawPersistentSurfaceNodes("claw.workspace");
  assert.equal(workspaceChildren.some((node) => node.id === "claw.workspace.manifest"), true);
  assert.equal(findClawPersistentSurfaceNode(".claw/manifest.json")?.id, "claw.workspace.manifest");
  assert.equal(resolveClawPersistentSurfacePath("claw.workspace.styles", "/repo/app", "brand"), "/repo/app/.claw/styles/brand");

  const externalCodex = findClawPersistentSurfaceNode("claw.external.codex");
  assert.equal(externalCodex?.canonicality, "externalReadOnly");
  assert.equal(externalCodex?.lifecycle, "external");

  const indexed = withSurfaceChildren(clawPersistentSurfaceRegistry.nodes);
  assert.deepEqual(indexed.find((node) => node.id === "claw.global")?.children?.includes("claw.database.core"), true);

  const remoteApiMethodRoutes = clawPersistentSurfaceRegistry.nodes
    .filter((node) => node.kind === "apiRoute")
    .filter((node) => /^\/v1\/(remote|gateway|sync|nodes|mesh)\b/.test(node.route ?? ""))
    .map((node) => `${node.method} ${node.route}`);
  assert.deepEqual(remoteApiMethodRoutes, expectedRemoteRegistryMethodRoutes);
});

test("stable contract catalogs feed the persistent surface registry", () => {
  const registryNodeIds = new Set(clawPersistentSurfaceRegistry.nodes.map((node) => node.id));
  const catalogNodeIds = Object.values(clawStableContractCatalogs).flatMap((catalog) => catalog.nodes.map((node) => node.id));

  for (const nodeId of catalogNodeIds) {
    assert.equal(registryNodeIds.has(nodeId), true, `${nodeId} must be rendered from the typed stable contract catalogs`);
  }

  assert.equal(clawPortContractCatalog.runtime.value, clawCorePorts.runtime);
  assert.equal(clawPortContractCatalog.runtime.port, clawCorePorts.runtime);
  assert.equal(findClawPersistentSurfaceNode("claw.port.runtime")?.value, String(clawCorePorts.runtime));

  assert.equal(clawJsonFieldContractCatalog.schemaVersion.value, "schemaVersion");
  assert.equal(findClawPersistentSurfaceNode("claw.schema.common.field.schemaVersion")?.fieldPath, "schemaVersion");

  assert.equal(clawCliFlagContractCatalog.json.value, "--json");
  assert.equal(findClawPersistentSurfaceNode("claw.cli.flag.json")?.value, "--json");

  assert.equal(clawEventTopicContractCatalog["claw.event.sessions.message.appended"]?.value, "message.appended");
  assert.equal(findClawPersistentSurfaceNode("claw.event.sessions.message.appended")?.value, "message.appended");
});

test("surface graph registers critical chat routes and Relay", () => {
  for (const nodeId of [
    "claw.cli.public",
    "claw.cli.commandIntentRegistry",
    "claw.mcp.surface",
    "claw.storage.canonical",
    "claw.host.signed",
    "claw.host.permissions",
    "claw.host.grants",
    "claw.host.approvals",
    "claw.host.audit",
    "claw.mac.controlPlane",
    "claw.mac.capabilityAtlas",
    "claw.mac.permissionBroker",
    "claw.mac.actionBroker",
  ]) {
    assert.equal(Boolean(findClawPersistentSurfaceNode(nodeId)), true, `${nodeId} must be covered by the surface graph first cut`);
  }
  assert.equal(findClawPersistentSurfaceNode("claw.relay")?.name, "Relay control plane");
  assert.equal(findClawPersistentSurfaceNode("clawix.bridge.local")?.path, "clawix-bridge");

  const macEdges = listClawSurfaceEdges("claw.mac.controlPlane");
  assert.equal(macEdges.some((edge) => edge.type === "consumes" && edge.toId === "claw.mac.capabilityAtlas"), true);
  assert.equal(macEdges.some((edge) => edge.type === "brokers" && edge.toId === "claw.mac.permissionBroker"), true);
  assert.equal(macEdges.some((edge) => edge.type === "brokers" && edge.toId === "claw.mac.actionBroker"), true);

  const relayEdges = listClawSurfaceEdges("claw.relay");
  assert.equal(relayEdges.some((edge) => edge.type === "brokers" && edge.toId === "claw.relay.connector"), true);
  assert.equal(relayEdges.some((edge) => edge.type === "exposes" && edge.toId === "claw.remote.client"), true);

  const routes = listClawSurfaceRoutes();
  assert.deepEqual(routes.map((route) => route.id).sort(), [
    "agents.externalSupportAssignment",
    "agents.internalMacAssignment",
    "agents.mcpApiAssignment",
    "chat.companionBridge",
    "chat.localDesktop",
    "chat.remoteRelay",
    "clawix.menuBarSystemIndicators",
    "cli.commandIntentResolution",
    "gateway.headlessAgentHost",
    "gateway.multiTenantAgentService",
    "mac.directCliAction",
    "mac.permissionLifecycle",
    "mesh.resourceShare",
    "remote.chatGateway",
    "remote.searchGateway",
    "remote.secretBrokeredOperation",
    "sync.agentConfig",
    "sync.blobs",
    "sync.driveFiles",
    "sync.memoryUserModel",
    "sync.searchIndex",
    "sync.sessions",
    "sync.sidecars",
    "sync.skills",
    "sync.sqliteResources",
    "sync.workspaceState",
    "system.telemetryAgentContext",
    "system.telemetrySignedHostControl",
  ]);
  assert.equal(findClawSurfaceRoute("chat.remoteRelay")?.steps.some((step) => step.toId === "claw.relay"), true);
  assert.equal(findClawSurfaceRoute("cli.commandIntentResolution")?.steps.some((step) => step.toId === "claw.workspace.command_intents.ledger"), true);
  assert.equal(findClawSurfaceRoute("agents.externalSupportAssignment")?.steps.some((step) => step.toId === "claw.support.inbox"), true);
  assert.equal(findClawSurfaceRoute("mac.directCliAction")?.steps.some((step) => step.toId === "claw.host.audit"), true);
  assert.equal(findClawPersistentSurfaceNode("claw.mac.actionReceipt.v1")?.kind, "jsonSchema");

  for (const route of routes) {
    assert.equal(route.steps.length > 0, true, `${route.id} must declare explicit steps`);
    assert.equal(route.tests?.includes("packages/clawjs/src/inspect-cli.test.ts"), true, `${route.id} must name an inspect test`);
    for (const step of route.steps) {
      assert.equal(Boolean(findClawPersistentSurfaceNode(step.fromId)), true, `${route.id} step source ${step.fromId} must exist`);
      assert.equal(Boolean(findClawPersistentSurfaceNode(step.toId)), true, `${route.id} step target ${step.toId} must exist`);
      assert.ok(["owns", "consumes", "exposes", "brokers"].includes(step.edgeType), `${route.id} has invalid edge type ${step.edgeType}`);
    }
  }
});
