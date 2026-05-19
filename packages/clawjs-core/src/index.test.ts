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
  clawLocalHostnames,
  clawPublicApiPrefix,
  clawServiceSocketPath,
  clawServiceWindowsPipe,
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
} from "./index.ts";

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
    notes: ["prompt: please fix /Users/trabajo/private with sk-1234567890abcdef"],
    errors: ["message=/Users/trabajo/Desktop/Clawix failed"],
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

  const request = clawCommandRequestSchema.parse(clawContractFixturesV1.commandRequest);
  const response = clawCommandResponseSchema.parse(clawContractFixturesV1.commandResponse);
  const registry = clawHostRegistrySchema.parse(clawContractFixturesV1.hostRegistry);

  assert.equal(request.schemaVersion, clawContractVersionV1);
  assert.equal(response.meta.hostId, "clawix");
  assert.equal(registry.activeHostId, "clawix");
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

test("remote gateway sync contracts register required layers, routes, and safe defaults", () => {
  for (const nodeId of [
    "claw.coordinator",
    "claw.gateway",
    "claw.connector",
    "claw.sync",
    "claw.transport.iroh",
    "claw.headlessHost",
    "claw.remoteCache",
    "claw.remote.classification",
  ]) {
    assert.equal(Boolean(findClawPersistentSurfaceNode(nodeId)), true, `${nodeId} must be registered`);
  }

  for (const routeId of remoteSyncRequiredRouteIds) {
    const route = findClawSurfaceRoute(routeId);
    assert.equal(Boolean(route), true, `${routeId} must be registered`);
    assert.equal(route?.adrs?.includes("docs/adr/0022-remote-gateway-sync-redesign.md"), true, `${routeId} must cite ADR 0022`);
  }

  const manifest = createExampleSyncResourceManifest({
    resourceId: "skills:default",
    kind: "skills",
    ownerNodeId: "node.mac",
    driver: "skills",
    routeIds: ["sync.skills"],
  });
  assert.equal(manifest.conflictPolicy, "detect_and_elevate");
  assert.equal(manifest.cachePolicy.encrypted, true);
  assert.equal(manifest.cachePolicy.storesSecrets, false);
  assert.equal(manifest.secretPolicy.plaintextReplication, false);

  assert.equal(remoteActorContextSchema.safeParse({
    actorKind: "agent",
    actorId: "agent.ops",
    assignmentId: "assignment.web",
    nodeId: "node.server",
    transport: "iroh",
    trustMode: "governed_gateway",
  }).success, true);

  assert.equal(nodeIdentitySchema.safeParse({
    nodeId: "node.server",
    displayName: "Server",
    hostKind: "headless_server",
    trustLevel: "fully_owned",
    trustModes: ["sovereign_e2e_tunnel", "governed_gateway"],
    publicKeyRef: "key:server",
  }).success, true);

  assert.equal(remoteSecretLeaseSchema.safeParse({
    leaseId: "lease.1",
    secretRef: "vault://agents/ops",
    actor: {
      actorKind: "agent",
      actorId: "agent.ops",
      assignmentId: "assignment.web",
      nodeId: "node.server",
      transport: "gateway",
      trustMode: "governed_gateway",
    },
    action: "connector.invoke",
    resourceId: "support_conversations",
    expiresAt: "2026-05-17T10:00:00.000Z",
    plaintextReturned: false,
    auditEventId: "audit.lease",
  }).success, true);

  assert.equal(syncConflictSchema.safeParse({
    conflictId: "conflict.1",
    resourceId: "skills:default",
    objectRef: "skill.review",
    policy: "detect_and_elevate",
    status: "open",
    detectedAt: "2026-05-17T10:00:00.000Z",
    changeIds: ["change.a", "change.b"],
  }).success, true);

  assert.equal(remoteSyncRequiredDecisionIds.includes("sync_lateral_domains"), true);
  const compatibilityReceipt = createRemoteCompatibilityAdapterReceipt({
    legacySurface: "relay.mobile.chat",
    canonicalRouteId: "remote.chatGateway",
    clientKind: "ios",
    createdAt: "2026-05-17T10:11:00.000Z",
  });
  assert.equal(remoteCompatibilityAdapterReceiptSchema.safeParse(compatibilityReceipt).success, true);
  assert.equal(compatibilityReceipt.mapsToCanonical, true);
  assert.equal(compatibilityReceipt.parallelApiIntroduced, false);
  assert.equal(compatibilityReceipt.writes, false);
  const classificationReceipt = createRemoteSurfaceClassificationReceipt({
    capabilityId: "claw.gateway",
    classification: "remote-safe",
    routeId: "remote.chatGateway",
    policyRef: "docs/adr/0022-remote-gateway-sync-redesign.md",
    testRefs: ["packages/clawjs/src/inspect-cli.test.ts"],
    createdAt: "2026-05-17T10:12:00.000Z",
  });
  assert.equal(remoteSurfaceClassificationReceiptSchema.safeParse(classificationReceipt).success, true);
  assert.equal(classificationReceipt.remoteSafeReady, true);
  assert.deepEqual(classificationReceipt.missingEvidence, []);
  assert.equal(classificationReceipt.writes, false);
  assert.throws(() => createRemoteSurfaceClassificationReceipt({
    capabilityId: "claw.gateway",
    classification: "remote-safe",
    createdAt: "2026-05-17T10:12:30.000Z",
  }), /requires route, policy, and tests/);

  const externalPending = buildRemoteExternalPendingRegister({ generatedAt: "2026-05-17T10:13:00.000Z" });
  assert.equal(remoteExternalPendingRegisterSchema.safeParse(externalPending).success, true);
  assert.equal(externalPending.status, "external_pending");
  assert.equal(externalPending.writes, false);
  assert.equal(externalPending.requirements.some((entry) => entry.requirementId === "physical_iroh_handshake" && entry.sourceReceipt === "RemoteTransportHandshakeReceipt"), true);
  assert.equal(externalPending.requirements.some((entry) => entry.requirementId === "physical_sync_driver_application" && entry.decisionId === "sync_substrate"), true);
  assert.equal(externalPending.requirements.some((entry) => entry.requirementId === "physical_authority_handoff" && entry.decisionId === "sync_authority_model" && entry.sourceReceipt === "SyncAuthorityHandoffReceipt"), true);
  assert.equal(externalPending.requirements.some((entry) => entry.requirementId === "provider_device_e2e" && entry.sourceReceipt === "RemoteProviderDeviceE2EValidationPlan"), true);
  assert.equal(externalPending.requirements.every((entry) => entry.status === "external_pending" && entry.writes === false), true);
  const externalPendingRequirementIds = externalPending.requirements.map((entry) => entry.requirementId);

  const externalValidationChecklist = buildRemoteExternalValidationChecklist({ generatedAt: "2026-05-17T10:13:15.000Z" });
  assert.equal(externalValidationChecklist.status, "external_pending");
  assert.equal(externalValidationChecklist.writes, false);
  assert.deepEqual(externalValidationChecklist.requirementIds, externalPendingRequirementIds);
  assert.equal(externalValidationChecklist.coverage.requirementCount, externalPending.requirements.length);
  assert.equal(externalValidationChecklist.coverage.coveredRequirementCount, externalPending.requirements.length);
  assert.deepEqual(externalValidationChecklist.coverage.missingRequirementIds, []);
  assert.equal(externalValidationChecklist.items.every((entry) => entry.approvedRunRequired && entry.physicalEvidenceRequired && !entry.writes), true);
  assert.equal(externalValidationChecklist.items.every((entry) => entry.plaintextMaterialIncluded === false), true);
  assert.equal(externalValidationChecklist.items.some((entry) => entry.requirementId === "physical_iroh_handshake" && entry.requiredCommand.includes("claw nodes heartbeat")), true);
  assert.equal(externalValidationChecklist.items.some((entry) => entry.requirementId === "provider_secret_retrieval" && entry.requiredArtifacts.includes("RemoteSecretProviderReceipt")), true);
  assert.equal(externalValidationChecklist.items.some((entry) => entry.requirementId === "provider_device_e2e" && entry.requiredArtifacts.includes("RemoteProviderDeviceE2EValidationPlan")), true);
  assert.equal(externalValidationChecklist.items.some((entry) => entry.requirementId === "provider_device_e2e" && entry.acceptanceCriteria.some((criterion) => criterion.includes("personal mesh") && criterion.includes("server host") && criterion.includes("hosted Gateway"))), true);

  const externalValidationEvidenceTemplate = buildRemoteExternalValidationEvidenceTemplate({ generatedAt: "2026-05-17T10:13:17.000Z" });
  assert.equal(externalValidationEvidenceTemplate.status, "external_pending");
  assert.equal(externalValidationEvidenceTemplate.writes, false);
  assert.equal(externalValidationEvidenceTemplate.requirementCount, externalPending.requirements.length);
  assert.equal(externalValidationEvidenceTemplate.checklistItems.length, externalPending.requirements.length);
  assert.equal(externalValidationEvidenceTemplate.evidence.length, externalPending.requirements.length);
  assert.deepEqual(externalValidationEvidenceTemplate.checklistItems.map((entry) => entry.requirementId), externalPendingRequirementIds);
  assert.deepEqual(externalValidationEvidenceTemplate.evidence.map((entry) => entry.requirementId), externalPendingRequirementIds);
  assert.equal(externalValidationEvidenceTemplate.evidence.every((entry) => entry.approvedRun === false && entry.approvedRunRef === undefined && entry.artifactRefs.length === 0 && entry.acceptedCriteria.length === 0 && entry.plaintextMaterialIncluded === false && !entry.writes), true);
  assert.equal(externalValidationEvidenceTemplate.evidence.some((entry) => entry.requirementId === "provider_device_e2e"), true);
  assert.equal(externalValidationEvidenceTemplate.submissionCommand.includes("claw remote validation-report"), true);
  assert.equal(externalValidationEvidenceTemplate.submissionCommand.includes("--evidence-file"), true);

  const externalValidationEvidenceArtifact = {
    schemaVersion: 1,
    sourceConversationId: "019e36a3-c2e6-73b3-a3fe-f3e7340e42c8",
    sourcePlanId: "019e3732-c90e-7491-9217-37020c43217e-plan",
    approvalRequestId: "remote_external_validation_approval_request_request_2026_05_17t10_13_17_000z",
    generatedAt: "2026-05-17T10:13:17.000Z",
    status: "external_pending",
    writes: false,
    evidence: externalValidationEvidenceTemplate.evidence,
  };
  assert.equal(remoteExternalValidationEvidenceArtifactSchema.safeParse(externalValidationEvidenceArtifact).success, true);
  assert.deepEqual(parseRemoteExternalValidationEvidenceInput(externalValidationEvidenceTemplate.evidence), externalValidationEvidenceTemplate.evidence);
  assert.deepEqual(parseRemoteExternalValidationEvidenceInput({ evidence: externalValidationEvidenceTemplate.evidence }), externalValidationEvidenceTemplate.evidence);
  assert.deepEqual(parseRemoteExternalValidationEvidenceInput(externalValidationEvidenceArtifact), externalValidationEvidenceTemplate.evidence);
  const generatedExternalValidationEvidenceArtifact = buildRemoteExternalValidationEvidenceArtifact({ generatedAt: "2026-05-17T10:13:17.000Z" });
  assert.equal(remoteExternalValidationEvidenceArtifactSchema.safeParse(generatedExternalValidationEvidenceArtifact).success, true);
  assert.equal(generatedExternalValidationEvidenceArtifact.sourceConversationId, "019e36a3-c2e6-73b3-a3fe-f3e7340e42c8");
  assert.equal(generatedExternalValidationEvidenceArtifact.sourcePlanId, "019e3732-c90e-7491-9217-37020c43217e-plan");
  assert.equal(generatedExternalValidationEvidenceArtifact.approvalRequestId, "remote_external_validation_approval_request_request_2026_05_17t10_13_17_000z");
  assert.equal(generatedExternalValidationEvidenceArtifact.status, "external_pending");
  assert.equal(generatedExternalValidationEvidenceArtifact.writes, false);
  assert.deepEqual(generatedExternalValidationEvidenceArtifact.evidence, externalValidationEvidenceTemplate.evidence);
  assert.deepEqual(parseRemoteExternalValidationEvidenceInput(generatedExternalValidationEvidenceArtifact).map((entry) => entry.requirementId), externalPendingRequirementIds);
  assert.throws(() => parseRemoteExternalValidationEvidenceInput({
    ...generatedExternalValidationEvidenceArtifact,
    sourcePlanId: "wrong-source-plan",
  }), /sourcePlanId/);
  assert.throws(() => parseRemoteExternalValidationEvidenceInput({
    ...generatedExternalValidationEvidenceArtifact,
    approvalRequestId: "remote_external_validation_approval_request_request_other",
  }), /approvalRequestId/);
  const externalValidationRunbook = buildRemoteExternalValidationRunbook({ generatedAt: "2026-05-17T10:13:19.000Z" });
  assert.equal(remoteExternalValidationRunbookSchema.safeParse(externalValidationRunbook).success, true);
  assert.equal(externalValidationRunbook.status, "external_pending");
  assert.equal(externalValidationRunbook.writes, false);
  assert.equal(externalValidationRunbook.validationStepCount, 5);
  assert.equal(externalValidationRunbook.externalRequirementCount, externalPending.requirements.length);
  assert.deepEqual(externalValidationRunbook.e2ePlan.validationSteps.map((entry) => entry.domain), ["chat", "search", "sync", "secret_refs", "hosted_agents"]);
  assert.deepEqual(externalValidationRunbook.evidenceArtifact.evidence.map((entry) => entry.requirementId), externalPending.requirements.map((entry) => entry.requirementId));
  assert.deepEqual(externalValidationRunbook.e2ePlan.requiredTopologyTargets, [
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
  assert.equal(externalValidationRunbook.reportCommand.includes("validation-report"), true);
  assert.equal(externalValidationRunbook.closureGateCommand.includes("closure-gate"), true);
  assert.equal(externalValidationRunbook.requiredCommands.some((entry) => entry.includes("validation-artifact")), true);
  assert.equal(externalValidationRunbook.requiredCommands.some((entry) => entry.includes("decision-review")), true);
  assert.equal(externalValidationRunbook.requiredCommands.some((entry) => entry.includes("test:remote-sync-source-session")), true);

  const scopedExternalValidationEvidenceTemplate = buildRemoteExternalValidationEvidenceTemplate({
    generatedAt: "2026-05-17T10:13:18.000Z",
    requirementIds: ["physical_iroh_handshake", "provider_device_e2e"],
  });
  assert.deepEqual(scopedExternalValidationEvidenceTemplate.evidence.map((entry) => entry.requirementId), ["physical_iroh_handshake", "provider_device_e2e"]);

  const emptyExternalValidationReport = buildRemoteExternalValidationReport({ generatedAt: "2026-05-17T10:13:20.000Z" });
  assert.equal(emptyExternalValidationReport.status, "external_pending");
  assert.equal(emptyExternalValidationReport.writes, false);
  assert.equal(emptyExternalValidationReport.evidenceCount, 0);
  assert.deepEqual(emptyExternalValidationReport.blockedRequirementIds, externalPendingRequirementIds);
  assert.equal(emptyExternalValidationReport.clearableRequirementIds.length, 0);
  assert.deepEqual(emptyExternalValidationReport.invalidEvidenceRequirementIds, []);
  assert.deepEqual(emptyExternalValidationReport.duplicateEvidenceRequirementIds, []);
  assert.equal(emptyExternalValidationReport.items.every((entry) => !entry.clearable && entry.status === "external_pending"), true);
  assert.equal(emptyExternalValidationReport.items.some((entry) => entry.requirementId === "physical_iroh_handshake" && entry.missingArtifacts.includes("RemoteTransportHandshakeReceipt")), true);

  const completeExternalEvidence = externalValidationChecklist.items.map((entry) => ({
    schemaVersion: 1 as const,
    requirementId: entry.requirementId,
    approvedRun: true,
    approvedRunRef: `approval://${entry.requirementId}`,
    physicalEvidenceRef: `evidence://${entry.requirementId}`,
    artifactRefs: entry.requiredArtifacts,
    acceptedCriteria: entry.acceptanceCriteria,
    plaintextMaterialIncluded: false as const,
    executedAt: "2026-05-17T10:13:24.000Z",
    writes: false as const,
  }));
  const rawCompleteExternalValidationReport = buildRemoteExternalValidationReport({ generatedAt: "2026-05-17T10:13:24.500Z", evidence: completeExternalEvidence });
  assert.equal(rawCompleteExternalValidationReport.status, "external_pending");
  assert.equal(rawCompleteExternalValidationReport.sourceBoundEvidencePresent, false);
  assert.equal(rawCompleteExternalValidationReport.approvalRequestBoundEvidencePresent, false);
  assert.deepEqual(rawCompleteExternalValidationReport.clearableRequirementIds, []);
  assert.deepEqual(rawCompleteExternalValidationReport.blockedRequirementIds, externalPendingRequirementIds);

  const completeExternalEvidenceArtifact = buildRemoteExternalValidationEvidenceArtifact({
    generatedAt: "2026-05-17T10:13:25.000Z",
    evidence: completeExternalEvidence,
  });
  const completeExternalValidationReport = buildRemoteExternalValidationReport({ generatedAt: "2026-05-17T10:13:25.000Z", evidenceArtifact: completeExternalEvidenceArtifact });
  assert.equal(completeExternalValidationReport.status, "clearable");
  assert.equal(completeExternalValidationReport.writes, false);
  assert.equal(completeExternalValidationReport.sourceBoundEvidencePresent, true);
  assert.equal(completeExternalValidationReport.approvalRequestBoundEvidencePresent, true);
  assert.equal(completeExternalValidationReport.evidenceCount, externalPending.requirements.length);
  assert.deepEqual(completeExternalValidationReport.clearableRequirementIds, externalPendingRequirementIds);
  assert.deepEqual(completeExternalValidationReport.blockedRequirementIds, []);
  assert.deepEqual(completeExternalValidationReport.invalidEvidenceRequirementIds, []);
  assert.deepEqual(completeExternalValidationReport.duplicateEvidenceRequirementIds, []);
  assert.equal(completeExternalValidationReport.items.every((entry) => entry.clearable && entry.status === "clearable" && entry.approvedRunRefPresent && !entry.writes), true);

  const invalidExternalValidationReport = buildRemoteExternalValidationReport({
    generatedAt: "2026-05-17T10:13:25.250Z",
    evidence: [
      ...completeExternalEvidence,
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
  assert.equal(invalidExternalValidationReport.status, "external_pending");
  assert.deepEqual(invalidExternalValidationReport.invalidEvidenceRequirementIds, ["unknown_external_requirement"]);
  assert.deepEqual(invalidExternalValidationReport.duplicateEvidenceRequirementIds, []);

  const duplicateExternalValidationReport = buildRemoteExternalValidationReport({ generatedAt: "2026-05-17T10:13:25.375Z", evidence: [completeExternalEvidence[0], completeExternalEvidence[0]] });
  assert.equal(duplicateExternalValidationReport.status, "external_pending");
  assert.deepEqual(duplicateExternalValidationReport.duplicateEvidenceRequirementIds, ["physical_iroh_handshake"]);

  const missingApprovedRunRefReport = buildRemoteExternalValidationReport({
    generatedAt: "2026-05-17T10:13:25.500Z",
    evidence: completeExternalEvidence.map((entry) => ({ ...entry, approvedRunRef: undefined })),
  });
  assert.equal(missingApprovedRunRefReport.status, "external_pending");
  assert.equal(missingApprovedRunRefReport.clearableRequirementIds.length, 0);
  assert.deepEqual(missingApprovedRunRefReport.blockedRequirementIds, externalPendingRequirementIds);
  assert.equal(missingApprovedRunRefReport.items.every((entry) => !entry.clearable && !entry.approvedRunRefPresent), true);

  const emptySourceQaReviewReport = buildRemoteSourceQaReviewReport({ generatedAt: "2026-05-17T10:13:26.000Z" });
  assert.equal(emptySourceQaReviewReport.status, "incomplete");
  assert.equal(emptySourceQaReviewReport.writes, false);
  assert.equal(emptySourceQaReviewReport.requiredSourceQaIds.length, 23);
  assert.equal(emptySourceQaReviewReport.reviewedSourceQaIds.length, 0);
  assert.equal(emptySourceQaReviewReport.missingSourceQaIds.length, 23);

  const sourceQaReviewTemplate = buildRemoteSourceQaReviewTemplate({ generatedAt: "2026-05-17T10:13:26.250Z" });
  assert.equal(remoteSourceQaReviewTemplateSchema.safeParse(sourceQaReviewTemplate).success, true);
  assert.equal(sourceQaReviewTemplate.status, "incomplete");
  assert.equal(sourceQaReviewTemplate.writes, false);
  assert.equal(sourceQaReviewTemplate.sourceConversationId, "019e36a3-c2e6-73b3-a3fe-f3e7340e42c8");
  assert.equal(sourceQaReviewTemplate.sourcePlanId, "019e3732-c90e-7491-9217-37020c43217e-plan");
  assert.equal(sourceQaReviewTemplate.reviewCount, 23);
  assert.deepEqual(sourceQaReviewTemplate.requiredSourceQaIds, remoteGoalClosureRequiredSourceQaIds);
  assert.deepEqual(sourceQaReviewTemplate.externalPendingRequiredSourceQaIds, ["QA-002", "QA-004", "QA-005", "QA-006", "QA-007", "QA-010", "QA-012", "QA-013", "QA-015", "QA-018", "QA-020", "QA-021"]);
  assert.equal(sourceQaReviewTemplate.items.every((entry) => !entry.reviewed && entry.disposition === null && entry.evidenceRefs.length === 0 && entry.reviewedAt === null && !entry.writes), true);
  assert.equal(sourceQaReviewTemplate.items.some((entry) => entry.qaId === "QA-023" && entry.decisionKey === "goal_closure_gate" && entry.requirementId === "Completion audit"), true);
  assert.equal(sourceQaReviewTemplate.submissionCommand.includes("claw remote closure-gate"), true);
  const scopedSourceQaReviewTemplate = buildRemoteSourceQaReviewTemplate({
    generatedAt: "2026-05-17T10:13:26.300Z",
    sourceQaIds: ["QA-001", "QA-023"],
  });
  assert.equal(scopedSourceQaReviewTemplate.reviewCount, 2);
  assert.deepEqual(scopedSourceQaReviewTemplate.items.map((entry) => entry.qaId), ["QA-001", "QA-023"]);
  assert.deepEqual(scopedSourceQaReviewTemplate.externalPendingRequiredSourceQaIds, []);

  const externalPendingSourceQaIds = new Set(["QA-002", "QA-004", "QA-005", "QA-006", "QA-007", "QA-010", "QA-012", "QA-013", "QA-015", "QA-018", "QA-020", "QA-021"]);
  const completeSourceQaReviewReport = buildRemoteSourceQaReviewReport({
    generatedAt: "2026-05-17T10:13:26.500Z",
    reviews: remoteGoalClosureRequiredSourceQaIds.map((qaId, index) => ({
      schemaVersion: 1,
      qaId,
      decisionKey: qaId === "QA-023" ? "goal_closure_gate" : [
        "relay_boundary",
        "server_trust_model",
        "remote_surface_parity",
        "topology_priority",
        "sync_authority_model",
        "remote_secrets_model",
        "transport_contract",
        "remote_api_shape",
        "offline_behavior",
        "remote_actor_model",
        "headless_host_model",
        "first_vertical_slice",
        "sync_substrate",
        "conflict_default",
        "client_cache_policy",
        "guardrail_strictness",
        "compat_policy",
        "hosted_service_position",
        "layer_names",
        "mesh_collaboration_scope",
        "agent_service_model",
        "sync_lateral_domains",
      ][index],
      requirementId: qaId === "QA-023" ? "Completion audit" : `RQ-${String(index + 1).padStart(3, "0")}`,
      disposition: externalPendingSourceQaIds.has(qaId) ? "external_pending" : "validated",
      evidenceRefs: ["docs/remote-gateway-sync-source-decision-audit.md", "docs/remote-gateway-sync-completion-audit.md"],
      reviewedAt: "2026-05-17T10:13:26.500Z",
      writes: false,
    })),
  });
  assert.equal(completeSourceQaReviewReport.status, "complete");
  assert.equal(completeSourceQaReviewReport.reviewedSourceQaIds.length, 23);
  assert.deepEqual(completeSourceQaReviewReport.missingSourceQaIds, []);
  assert.deepEqual(completeSourceQaReviewReport.duplicateSourceQaIds, []);
  assert.deepEqual(completeSourceQaReviewReport.invalidExternalPendingDispositionQaIds, []);
  assert.deepEqual(completeSourceQaReviewReport.externalPendingRequiredSourceQaIds, [...externalPendingSourceQaIds].sort());
  assert.equal(completeSourceQaReviewReport.items.every((entry) => entry.evidenceRefs.length >= 2 && !entry.writes), true);
  const completeDecisionReview = buildRemoteDecisionReview({
    generatedAt: "2026-05-17T10:13:26.525Z",
    routeIds: remoteSyncRequiredRouteIds,
    nodeIds: ["claw.coordinator", "claw.gateway", "claw.connector", "claw.sync", "claw.transport.iroh", "claw.headlessHost", "claw.remoteCache"],
    sourceQaReviews: completeSourceQaReviewReport.items,
    evidence: externalValidationEvidenceTemplate.evidence,
    evidenceArtifact: buildRemoteExternalValidationEvidenceArtifact({
      generatedAt: "2026-05-17T10:13:26.525Z",
      evidence: externalValidationEvidenceTemplate.evidence,
    }),
  });
  assert.equal(remoteDecisionReviewSchema.safeParse(completeDecisionReview).success, true);
  assert.equal(completeDecisionReview.status, "complete");
  assert.equal(completeDecisionReview.writes, false);
  assert.equal(completeDecisionReview.reviewedCount, 23);
  assert.equal(completeDecisionReview.requiredCount, 23);
  assert.equal(completeDecisionReview.implementedCount, 0);
  assert.equal(completeDecisionReview.externalPendingCount, 12);
  assert.deepEqual(completeDecisionReview.missingSourceQaIds, []);
  assert.deepEqual(completeDecisionReview.blockers, ["external_validation"]);
  assert.equal(completeDecisionReview.items.every((entry) => entry.reviewStatus === "reviewed" && entry.disposition !== null && !entry.writes), true);
  assert.equal(completeDecisionReview.items.some((entry) => entry.qaId === "QA-006" && entry.decisionId === "remote_secrets_model" && entry.disposition === "external_pending" && entry.externalPendingRequired), true);
  assert.equal(completeDecisionReview.items.some((entry) => entry.qaId === "QA-023" && entry.decisionId === "goal_closure_gate" && entry.conformanceStatus === null), true);
  const parsedSourceQaReviewItems = parseRemoteSourceQaReviewInput({
    schemaVersion: 1,
    sourceConversationId: "019e36a3-c2e6-73b3-a3fe-f3e7340e42c8",
    sourcePlanId: "019e3732-c90e-7491-9217-37020c43217e-plan",
    reviewedAt: "2026-05-17T10:13:26.500Z",
    status: "complete_with_external_pending",
    items: completeSourceQaReviewReport.items,
    writes: false,
  });
  assert.equal(parsedSourceQaReviewItems.length, 23);
  assert.throws(() => parseRemoteSourceQaReviewInput({
    schemaVersion: 1,
    sourceConversationId: "wrong-source-conversation",
    sourcePlanId: "019e3732-c90e-7491-9217-37020c43217e-plan",
    reviewedAt: "2026-05-17T10:13:26.500Z",
    status: "complete_with_external_pending",
    items: completeSourceQaReviewReport.items,
    writes: false,
  }), /sourceConversationId/);

  const readyForApprovedRun = buildRemoteExternalValidationReadiness({
    generatedAt: "2026-05-17T10:13:26.550Z",
    sourceQaReviews: completeSourceQaReviewReport.items,
    evidence: externalValidationEvidenceTemplate.evidence,
    evidenceArtifact: buildRemoteExternalValidationEvidenceArtifact({
      generatedAt: "2026-05-17T10:13:26.550Z",
      evidence: externalValidationEvidenceTemplate.evidence,
    }),
  });
  assert.equal(readyForApprovedRun.status, "ready_for_approved_run");
  assert.equal(readyForApprovedRun.writes, false);
  assert.equal(readyForApprovedRun.sourceQaReady, true);
  assert.equal(readyForApprovedRun.externalEvidenceReady, true);
  assert.equal(readyForApprovedRun.evidenceCount, externalPending.requirements.length);
  assert.equal(readyForApprovedRun.requiredEvidenceCount, externalPending.requirements.length);
  assert.deepEqual(readyForApprovedRun.missingEvidenceRequirementIds, []);
  assert.deepEqual(readyForApprovedRun.blockedExternalRequirementIds, externalPendingRequirementIds);
  assert.deepEqual(readyForApprovedRun.clearableExternalRequirementIds, []);
  assert.deepEqual(readyForApprovedRun.closureGateBlockers, ["external_validation"]);
  assert.equal(readyForApprovedRun.nextAction.includes("approved physical/provider validation"), true);
  const approvalRequest = buildRemoteExternalValidationApprovalRequest({
    generatedAt: "2026-05-17T10:13:26.560Z",
    sourceQaReviews: completeSourceQaReviewReport.items,
    evidence: externalValidationEvidenceTemplate.evidence,
    evidenceArtifact: buildRemoteExternalValidationEvidenceArtifact({
      generatedAt: "2026-05-17T10:13:26.560Z",
      evidence: externalValidationEvidenceTemplate.evidence,
    }),
  });
  assert.equal(approvalRequest.status, "approval_required");
  assert.equal(approvalRequest.approvalRequired, true);
  assert.equal(approvalRequest.approved, false);
  assert.equal(approvalRequest.readinessStatus, "ready_for_approved_run");
  assert.deepEqual(approvalRequest.requirementIds, externalPending.requirements.map((entry) => entry.requirementId));
  assert.deepEqual(approvalRequest.validationDomains, ["chat", "search", "sync", "secret_refs", "hosted_agents"]);
  assert.deepEqual(approvalRequest.validationTopologyTargets, ["personal_mesh", "mac_host", "linux_host", "windows_host", "server_host", "headless_server", "vps_host", "mobile_client", "browser_client", "self_hosted_gateway", "hosted_gateway"]);
  assert.deepEqual(approvalRequest.validationRouteIds, remoteSyncRequiredRouteIds);
  assert.equal(approvalRequest.prohibitedActions.some((entry) => entry.includes("plaintext secrets")), true);
  assert.equal(approvalRequest.writes, false);

  const incompleteApprovedEvidenceReadiness = buildRemoteExternalValidationReadiness({
    generatedAt: "2026-05-17T10:13:26.575Z",
    sourceQaReviews: completeSourceQaReviewReport.items,
    evidence: completeExternalEvidence.map((entry) => ({ ...entry, approvedRunRef: undefined })),
  });
  assert.equal(incompleteApprovedEvidenceReadiness.status, "not_ready");
  assert.equal(incompleteApprovedEvidenceReadiness.externalEvidenceReady, false);
  assert.deepEqual(incompleteApprovedEvidenceReadiness.blockedExternalRequirementIds, externalPendingRequirementIds);
  assert.deepEqual(incompleteApprovedEvidenceReadiness.closureGateBlockers, ["external_validation"]);

  const invalidSourceQaReviews = [{
    schemaVersion: 1 as const,
    qaId: "QA-007",
    decisionKey: "transport_contract",
    requirementId: "RQ-007",
    disposition: "validated" as const,
    evidenceRefs: ["docs/remote-gateway-sync-completion-audit.md"],
    reviewedAt: "2026-05-17T10:13:26.600Z",
    writes: false as const,
  }];
  const invalidSourceQaReviewReport = buildRemoteSourceQaReviewReport({ generatedAt: "2026-05-17T10:13:26.600Z", reviews: invalidSourceQaReviews });
  assert.equal(invalidSourceQaReviewReport.status, "incomplete");
  assert.deepEqual(invalidSourceQaReviewReport.invalidExternalPendingDispositionQaIds, ["QA-007"]);

  const invalidSourceQaClosureGate = buildRemoteGoalClosureGate({
    generatedAt: "2026-05-17T10:13:26.650Z",
    sourceQaReviews: invalidSourceQaReviews,
  });
  assert.equal(invalidSourceQaClosureGate.status, "blocked");
  assert.deepEqual(invalidSourceQaClosureGate.invalidExternalPendingDispositionQaIds, ["QA-007"]);

  const duplicateSourceQaReviewReport = buildRemoteSourceQaReviewReport({
    generatedAt: "2026-05-17T10:13:26.700Z",
    reviews: [completeSourceQaReviewReport.items[0], completeSourceQaReviewReport.items[0]],
  });
  assert.equal(duplicateSourceQaReviewReport.status, "incomplete");
  assert.deepEqual(duplicateSourceQaReviewReport.duplicateSourceQaIds, ["QA-001"]);
  const duplicateSourceQaClosureGate = buildRemoteGoalClosureGate({
    generatedAt: "2026-05-17T10:13:26.710Z",
    sourceQaReviews: [completeSourceQaReviewReport.items[0], completeSourceQaReviewReport.items[0]],
  });
  assert.deepEqual(duplicateSourceQaClosureGate.duplicateSourceQaIds, ["QA-001"]);

  const blockedClosureGate = buildRemoteGoalClosureGate({ generatedAt: "2026-05-17T10:13:26.000Z" });
  assert.equal(blockedClosureGate.status, "blocked");
  assert.equal(blockedClosureGate.writes, false);
  assert.equal(blockedClosureGate.requiredSourceQaIds.length, 23);
  assert.equal(blockedClosureGate.missingSourceQaIds.length, 23);
  assert.deepEqual(blockedClosureGate.invalidSourceQaIds, []);
  assert.deepEqual(blockedClosureGate.duplicateSourceQaIds, []);
  assert.deepEqual(blockedClosureGate.externalPendingRequiredSourceQaIds, sourceQaReviewTemplate.externalPendingRequiredSourceQaIds);
  assert.deepEqual(blockedClosureGate.invalidExternalPendingDispositionQaIds, []);
  assert.equal(blockedClosureGate.blockers.includes("source_qa_review"), true);
  assert.equal(blockedClosureGate.blockers.includes("external_validation"), true);
  assert.deepEqual(blockedClosureGate.blockedExternalRequirementIds, externalPending.requirements.map((entry) => entry.requirementId));
  assert.equal(blockedClosureGate.finalSourceSessionRereadRequired, true);
  assert.equal(blockedClosureGate.sourceSessionRereadCommand, "REMOTE_SYNC_SOURCE_SESSION=<local-source-session-jsonl> npm run test:remote-sync-source-session");

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
    evidenceArtifact: buildRemoteExternalValidationEvidenceArtifact({
      generatedAt: "2026-05-17T10:13:27.000Z",
      evidence: completeExternalEvidence,
    }),
  });
  assert.equal(clearableClosureGate.status, "clearable");
  assert.equal(clearableClosureGate.writes, false);
  assert.deepEqual(clearableClosureGate.missingSourceQaIds, []);
  assert.deepEqual(clearableClosureGate.invalidSourceQaIds, []);
  assert.deepEqual(clearableClosureGate.duplicateSourceQaIds, []);
  assert.deepEqual(clearableClosureGate.invalidExternalPendingDispositionQaIds, []);
  assert.deepEqual(clearableClosureGate.blockedExternalRequirementIds, []);
  assert.deepEqual(clearableClosureGate.clearableExternalRequirementIds, externalPendingRequirementIds);
  assert.deepEqual(clearableClosureGate.blockers, []);
  assert.equal(clearableClosureGate.finalSourceSessionRereadRequired, true);
  assert.equal(clearableClosureGate.sourceSessionRereadCommand, "REMOTE_SYNC_SOURCE_SESSION=<local-source-session-jsonl> npm run test:remote-sync-source-session");

  const readyForGoalClosure = buildRemoteExternalValidationReadiness({
    generatedAt: "2026-05-17T10:13:27.100Z",
    sourceQaReviews: completeSourceQaReviewReport.items,
    evidence: completeExternalEvidence,
    evidenceArtifact: buildRemoteExternalValidationEvidenceArtifact({
      generatedAt: "2026-05-17T10:13:27.100Z",
      evidence: completeExternalEvidence,
    }),
  });
  assert.equal(readyForGoalClosure.status, "ready_for_goal_closure");
  assert.equal(readyForGoalClosure.closureGateStatus, "clearable");
  assert.deepEqual(readyForGoalClosure.blockedExternalRequirementIds, []);
  assert.deepEqual(readyForGoalClosure.clearableExternalRequirementIds, externalPendingRequirementIds);

  const providerDeviceE2EPlan = buildRemoteProviderDeviceE2EValidationPlan({
    createdAt: "2026-05-17T10:13:30.000Z",
  });
  assert.equal(remoteProviderDeviceE2EValidationPlanSchema.safeParse(providerDeviceE2EPlan).success, true);
  assert.equal(providerDeviceE2EPlan.status, "external_pending");
  assert.deepEqual(providerDeviceE2EPlan.requiredDomains, ["chat", "search", "sync", "secret_refs", "hosted_agents"]);
  assert.deepEqual(providerDeviceE2EPlan.requiredTopologyTargets, ["personal_mesh", "mac_host", "linux_host", "windows_host", "server_host", "headless_server", "vps_host", "mobile_client", "browser_client", "self_hosted_gateway", "hosted_gateway"]);
  assert.deepEqual(providerDeviceE2EPlan.requiredRouteIds, remoteSyncRequiredRouteIds);
  assert.deepEqual(providerDeviceE2EPlan.validationSteps.map((entry) => entry.domain), providerDeviceE2EPlan.requiredDomains);
  assert.deepEqual(providerDeviceE2EPlan.validationSteps.map((entry) => entry.requiredRouteIds), [
    ["remote.chatGateway"],
    ["remote.searchGateway"],
    ["sync.skills", "sync.memoryUserModel", "sync.sessions", "sync.driveFiles", "sync.blobs", "sync.searchIndex", "sync.sqliteResources", "sync.sidecars", "sync.agentConfig", "sync.workspaceState", "mesh.resourceShare"],
    ["remote.secretBrokeredOperation"],
    ["gateway.headlessAgentHost", "gateway.multiTenantAgentService"],
  ]);
  assert.equal(providerDeviceE2EPlan.validationSteps.every((entry) => entry.status === "external_pending" && entry.writes === false), true);
  assert.equal(providerDeviceE2EPlan.validationSteps.some((entry) => entry.domain === "chat" && entry.requiredRouteIds.includes("remote.chatGateway") && entry.requiredExternalPendingIds.includes("physical_iroh_handshake")), true);
  assert.equal(providerDeviceE2EPlan.validationSteps.some((entry) => entry.domain === "sync" && entry.requiredRouteIds.includes("sync.skills") && entry.requiredRouteIds.includes("mesh.resourceShare") && entry.requiredExternalPendingIds.includes("physical_sync_driver_application")), true);
  assert.equal(providerDeviceE2EPlan.validationSteps.some((entry) => entry.domain === "secret_refs" && entry.requiredRouteIds.includes("remote.secretBrokeredOperation") && entry.requiredExternalPendingIds.includes("provider_secret_retrieval")), true);
  assert.equal(providerDeviceE2EPlan.validationSteps.some((entry) => entry.domain === "hosted_agents" && entry.requiredRouteIds.includes("gateway.multiTenantAgentService") && entry.requiredExternalPendingIds.includes("billing_meter_persistence")), true);
  assert.equal(providerDeviceE2EPlan.requiredRouteIds.includes("remote.chatGateway"), true);
  assert.equal(providerDeviceE2EPlan.requiredRouteIds.includes("remote.searchGateway"), true);
  assert.equal(providerDeviceE2EPlan.requiredRouteIds.includes("remote.secretBrokeredOperation"), true);
  assert.equal(providerDeviceE2EPlan.requiredRouteIds.includes("gateway.multiTenantAgentService"), true);
  assert.equal(providerDeviceE2EPlan.requiredExternalPendingIds.includes("provider_device_e2e"), true);
  assert.equal(providerDeviceE2EPlan.approvedPhysicalValidationRequired, true);
  assert.equal(providerDeviceE2EPlan.noPlaintextSecrets, true);
  assert.equal(providerDeviceE2EPlan.plaintextMaterialIncluded, false);
  assert.equal(providerDeviceE2EPlan.hostedSelfHostedParityRequired, true);
  assert.equal(providerDeviceE2EPlan.writes, false);

  const routeContracts = buildRemoteRouteContractCatalog({
    generatedAt: "2026-05-17T10:14:00.000Z",
    registeredRouteIds: remoteSyncRequiredRouteIds,
  });
  assert.equal(remoteRouteContractCatalogSchema.safeParse(routeContracts).success, true);
  assert.equal(routeContracts.status, "complete");
  assert.deepEqual(routeContracts.missingRouteIds, []);
  assert.equal(routeContracts.writes, false);
  assert.equal(routeContracts.contracts.length, remoteSyncRequiredRouteIds.length);
  assert.deepEqual(routeContracts.contracts.map((entry) => entry.routeId), remoteSyncRequiredRouteIds);
  assert.deepEqual(routeContracts.contracts.map((entry) => entry.layer), [
    "gateway",
    "gateway",
    "connector",
    "sync",
    "sync",
    "sync",
    "sync",
    "sync",
    "sync",
    "sync",
    "sync",
    "sync",
    "sync",
    "gateway",
    "gateway",
    "mesh",
  ]);
  assert.equal(routeContracts.contracts.some((entry) => entry.routeId === "remote.searchGateway" && entry.localContractRefs.includes("claw search")), true);
  assert.equal(routeContracts.contracts.some((entry) => entry.routeId === "sync.sessions" && entry.localContractRefs.includes("claw sync manifest --driver sessions")), true);
  assert.equal(routeContracts.contracts.some((entry) => entry.routeId === "sync.searchIndex" && entry.localContractRefs.includes("claw sync manifest --driver search_index")), true);
  assert.equal(routeContracts.contracts.some((entry) => entry.routeId === "sync.blobs" && entry.localContractRefs.includes("claw sync manifest --driver blobs")), true);
  assert.equal(routeContracts.contracts.some((entry) => entry.routeId === "sync.sidecars" && entry.localContractRefs.includes("claw sync manifest --driver sidecar")), true);
  assert.equal(routeContracts.contracts.some((entry) => entry.routeId === "sync.agentConfig" && entry.localContractRefs.includes("claw sync manifest --driver agent_config")), true);
  assert.equal(routeContracts.contracts.some((entry) => entry.routeId === "sync.workspaceState" && entry.localContractRefs.includes("claw sync manifest --driver workspace_state")), true);
  assert.equal(routeContracts.contracts.some((entry) => entry.routeId === "gateway.multiTenantAgentService" && entry.remoteEntryPoints.includes("POST /v1/gateway/agent-service/evaluate")), true);
  assert.equal(routeContracts.contracts.every((entry) => entry.parityRequired && !entry.parallelApiAllowed && entry.writes === false), true);

  assert.equal(routeIdForSyncDriver("skills"), "sync.skills");
  assert.equal(routeIdForSyncDriver("memory_user_model"), "sync.memoryUserModel");
  assert.equal(routeIdForSyncDriver("sessions"), "sync.sessions");
  assert.equal(routeIdForSyncDriver("drive_files"), "sync.driveFiles");
  assert.equal(routeIdForSyncDriver("blobs"), "sync.blobs");
  assert.equal(routeIdForSyncDriver("search_index"), "sync.searchIndex");
  assert.equal(routeIdForSyncDriver("sqlite_partial"), "sync.sqliteResources");
  assert.equal(routeIdForSyncDriver("sidecar"), "sync.sidecars");
  assert.equal(routeIdForSyncDriver("agent_config"), "sync.agentConfig");
  assert.equal(routeIdForSyncDriver("workspace_state"), "sync.workspaceState");

  const syncDriverCatalog = buildSyncDriverCatalog({
    generatedAt: "2026-05-17T10:14:30.000Z",
    registeredRouteIds: remoteSyncRequiredRouteIds,
  });
  const expectedSyncDrivers = ["skills", "memory_user_model", "sessions", "drive_files", "blobs", "sqlite_tables", "sqlite_partial", "sidecar", "search_index", "agent_config", "workspace_state"];
  const expectedSyncDriverRouteIds = ["sync.skills", "sync.memoryUserModel", "sync.sessions", "sync.driveFiles", "sync.blobs", "sync.sqliteResources", "sync.sqliteResources", "sync.sidecars", "sync.searchIndex", "sync.agentConfig", "sync.workspaceState"];
  const expectedSyncDriverRequiredRouteIds = ["sync.agentConfig", "sync.blobs", "sync.driveFiles", "sync.memoryUserModel", "sync.searchIndex", "sync.sessions", "sync.sidecars", "sync.skills", "sync.sqliteResources", "sync.workspaceState"];
  const expectedSyncDriverLateralDomains = [["skills"], ["memory", "user_model", "profile"], ["sessions"], ["drive", "files"], ["blobs", "files"], ["database", "records"], ["database", "partial_database"], ["sidecars", "runtime"], ["search", "indexes"], ["agents", "config"], ["workspace", "projects"]];
  assert.equal(syncDriverCatalog.status, "complete");
  assert.equal(syncDriverCatalog.writes, false);
  assert.equal(syncDriverCatalog.authorityModel, "per_resource");
  assert.equal(syncDriverCatalog.conflictDefault, "detect_and_elevate");
  assert.equal(syncDriverCatalog.physicalApplicationStatus, "external_pending");
  assert.deepEqual(syncDriverCatalog.requiredDrivers, expectedSyncDrivers);
  assert.deepEqual(syncDriverCatalog.coveredDrivers, expectedSyncDrivers);
  assert.deepEqual(syncDriverCatalog.requiredRouteIds, expectedSyncDriverRequiredRouteIds);
  assert.deepEqual(syncDriverCatalog.missingDrivers, []);
  assert.deepEqual(syncDriverCatalog.missingRouteIds, []);
  assert.equal(syncDriverCatalog.driverCount, 11);
  assert.deepEqual(syncDriverCatalog.entries.map((entry) => entry.driver), expectedSyncDrivers);
  assert.deepEqual(syncDriverCatalog.entries.map((entry) => entry.routeId), expectedSyncDriverRouteIds);
  assert.deepEqual(syncDriverCatalog.entries.map((entry) => entry.lateralDomains), expectedSyncDriverLateralDomains);
  assert.deepEqual(syncDriverCatalog.entries.map((entry) => entry.commands), expectedSyncDrivers.map((driver) => [
    `claw sync manifest --driver ${driver} --json`,
    `claw sync plan --driver ${driver} --json`,
    `claw sync apply --driver ${driver} --record true --json`,
  ]));
  assert.equal(syncDriverCatalog.entries.every((entry) => entry.manifestBacked && entry.changelogBacked && entry.authorityScoped && entry.physicalDriverRequired && !entry.writes), true);
  assert.equal(syncDriverCatalog.entries.every((entry) => entry.conflictPolicy === "detect_and_elevate" && entry.secretPolicy.plaintextReplication === false && entry.secretPolicy.secretRefsOnly === true), true);
  assert.equal(syncDriverCatalog.entries.some((entry) => entry.driver === "skills" && entry.routeId === "sync.skills" && entry.lateralDomains.includes("skills")), true);
  assert.equal(syncDriverCatalog.entries.some((entry) => entry.driver === "memory_user_model" && entry.routeId === "sync.memoryUserModel" && entry.lateralDomains.includes("memory")), true);
  assert.equal(syncDriverCatalog.entries.some((entry) => entry.driver === "drive_files" && entry.routeId === "sync.driveFiles" && entry.lateralDomains.includes("drive")), true);
  assert.equal(syncDriverCatalog.entries.some((entry) => entry.driver === "sqlite_partial" && entry.routeId === "sync.sqliteResources" && entry.partialResourceSupported), true);
  assert.equal(syncDriverCatalog.entries.some((entry) => entry.driver === "workspace_state" && entry.commands.includes("claw sync apply --driver workspace_state --record true --json")), true);

  const plan = buildSyncPlan({
    manifest: createSyncResourceManifest({
      resourceId: "skills:default",
      kind: "skills",
      ownerNodeId: "node.mac",
      driver: "skills",
      allowedPeerNodeIds: ["node.server"],
    }),
    actor: {
      actorKind: "agent",
      actorId: "agent.sync",
      nodeId: "node.mac",
      transport: "gateway",
      trustMode: "governed_gateway",
    },
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
  assert.equal(plan.writes, false);
  assert.equal(plan.actions.some((action) => action.action === "conflict" && action.reason === "diverged_snapshots_detect_and_elevate"), true);
  assert.equal(plan.conflicts[0]?.status, "open");
  assert.equal(plan.nextCursor?.cursor.includes("skill.review"), true);
  const conflictQueue = buildSyncQueueEntries(plan, { queuedAt: "2026-05-17T10:01:00.000Z" });
  assert.equal(conflictQueue.length, 1);
  assert.equal(conflictQueue[0]?.status, "blocked");
  assert.equal(conflictQueue[0]?.direction, "conflict");
  assert.equal(conflictQueue[0]?.writes, false);
  const blockedReconciliation = reconcileSyncQueue({
    manifest: plan.manifest,
    queue: conflictQueue,
    now: "2026-05-17T10:02:00.000Z",
  });
  assert.equal(blockedReconciliation.writes, false);
  assert.deepEqual(blockedReconciliation.blockedConflictIds, [plan.conflicts[0]?.conflictId]);
  assert.equal(blockedReconciliation.nextCursor, undefined);
  const resolvedReconciliation = reconcileSyncQueue({
    manifest: plan.manifest,
    queue: conflictQueue,
    resolvedConflictIds: [plan.conflicts[0]?.conflictId ?? ""],
    now: "2026-05-17T10:03:00.000Z",
  });
  assert.equal(resolvedReconciliation.queue[0]?.status, "resolved");
  assert.equal(resolvedReconciliation.nextCursor?.cursor.includes("skill.review"), true);

  const matchingPlan = buildSyncPlan({
    manifest: plan.manifest,
    actor: {
      actorKind: "agent",
      actorId: "agent.sync",
      nodeId: "node.mac",
      transport: "gateway",
      trustMode: "governed_gateway",
    },
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
  assert.equal(matchingPlan.actions[0]?.action, "noop");
  assert.equal(matchingPlan.conflicts.length, 0);
  assert.equal(syncObjectSnapshotSchema.safeParse({
    resourceId: "skills:default",
    objectRef: "skill.review",
    nodeId: "node.mac",
    contentHash: "hash-a",
    updatedAt: "2026-05-17T09:00:00.000Z",
    deleted: false,
  }).success, true);

  const pushPlan = buildSyncPlan({
    manifest: plan.manifest,
    actor: {
      actorKind: "agent",
      actorId: "agent.sync",
      nodeId: "node.mac",
      transport: "gateway",
      trustMode: "governed_gateway",
    },
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
  assert.equal(pushPlan.writes, false);
  assert.equal(pushPlan.actions[0]?.action, "push");
  assert.equal(pushPlan.changes[0]?.objectRef, "skill.local-only");
  assert.equal(pushPlan.nextCursor?.cursor.includes("hash-local"), true);
  const pushQueue = buildSyncQueueEntries(pushPlan, { queuedAt: "2026-05-17T10:04:00.000Z" });
  assert.equal(pushQueue[0]?.status, "queued");
  assert.equal(pushQueue[0]?.changeId, pushPlan.changes[0]?.changeId);
  const appliedReconciliation = reconcileSyncQueue({
    manifest: pushPlan.manifest,
    queue: pushQueue,
    acknowledgedChangeIds: [pushPlan.changes[0]?.changeId ?? ""],
    now: "2026-05-17T10:05:00.000Z",
  });
  assert.deepEqual(appliedReconciliation.appliedChangeIds, [pushPlan.changes[0]?.changeId]);
  assert.equal(appliedReconciliation.queue[0]?.status, "applied");
  assert.equal(appliedReconciliation.nextCursor?.cursor.includes("hash-local"), true);
  const syncApplicationReceipt = createSyncDriverApplicationReceipt({
    manifest: pushPlan.manifest,
    reconciliation: appliedReconciliation,
    actor: {
      actorKind: "agent",
      actorId: "agent.sync",
      nodeId: "node.mac",
      transport: "gateway",
      trustMode: "governed_gateway",
    },
    createdAt: "2026-05-17T10:05:30.000Z",
  });
  assert.equal(syncDriverApplicationReceiptSchema.safeParse(syncApplicationReceipt).success, true);
  assert.equal(syncApplicationReceipt.status, "signed_pending_driver_application");
  assert.equal(syncApplicationReceipt.driver, "skills");
  assert.equal(syncApplicationReceipt.externalPending.includes("physical_sync_driver_application"), true);
  assert.equal(syncApplicationReceipt.physicalDriverApplied, false);
  assert.equal(syncApplicationReceipt.writes, false);

  const syncAuthorityHandoffReceipt = createSyncAuthorityHandoffReceipt({
    manifest: pushPlan.manifest,
    toNodeId: "node.server",
    actor: {
      actorKind: "agent",
      actorId: "agent.sync",
      nodeId: "node.mac",
      transport: "gateway",
      trustMode: "governed_gateway",
    },
    createdAt: "2026-05-17T10:05:45.000Z",
  });
  assert.equal(syncAuthorityHandoffReceiptSchema.safeParse(syncAuthorityHandoffReceipt).success, true);
  assert.equal(syncAuthorityHandoffReceipt.status, "signed_pending_authority_handoff");
  assert.equal(syncAuthorityHandoffReceipt.fromNodeId, "node.mac");
  assert.equal(syncAuthorityHandoffReceipt.toNodeId, "node.server");
  assert.equal(syncAuthorityHandoffReceipt.externalPending.includes("physical_authority_handoff"), true);
  assert.equal(syncAuthorityHandoffReceipt.writes, false);

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
  assert.equal(offlineCommand.status, "failed_fast");
  assert.equal(offlineCommand.reason, "connector_offline");
  assert.equal(offlineCommand.enqueued, false);
  assert.equal(offlineCommand.retryable, true);
  assert.equal(offlineCommand.writes, false);

  const meshInvitation = createMeshInvitation({
    issuerMeshId: "mesh.home",
    coordinatorNodeId: "node.mac",
    recipientMeshId: "mesh.server",
    allowedResourceIds: ["skills:default"],
    allowedActions: ["read", "sync"],
    createdAt: "2026-05-17T10:07:00.000Z",
    expiresAt: "2026-05-18T10:07:00.000Z",
  });
  assert.equal(meshInvitation.status, "pending");
  assert.equal(meshInvitation.trustMode, "sovereign_e2e_tunnel");
  assert.equal(meshInvitation.writes, false);
  assert.equal(meshInvitationSchema.safeParse(meshInvitation).success, true);
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
  assert.equal(meshAcceptance.status, "signed_pending_peer_trust");
  assert.equal(meshAcceptance.acceptedResourceIds.includes("skills:default"), true);
  assert.equal(meshAcceptance.acceptedActions.includes("sync"), true);
  assert.equal(meshAcceptance.externalPending.includes("physical_peer_trust"), true);
  assert.equal(meshAcceptance.externalPending.includes("device_trust_acceptance"), true);
  assert.equal(meshAcceptance.writes, false);
  assert.equal(meshInvitationAcceptanceSchema.safeParse(meshAcceptance).success, true);

  const meshShare = createMeshResourceShare({
    invitation: meshInvitation,
    toMeshId: "mesh.server",
    manifest: plan.manifest,
    actions: ["read", "sync"],
    createdAt: "2026-05-17T10:08:00.000Z",
    expiresAt: "2026-05-18T10:08:00.000Z",
  });
  assert.equal(meshShare.status, "proposed");
  assert.equal(meshShare.resourceId, "skills:default");
  assert.equal(meshShare.plaintextSecrets, false);
  assert.equal(meshShare.writes, false);
  assert.equal(meshResourceShareSchema.safeParse(meshShare).success, true);
  assert.throws(() => createMeshResourceShare({
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
  }), /does not allow resource/);

  const regulatedInvitation = createMeshInvitation({
    issuerMeshId: "mesh.local",
    coordinatorNodeId: "node.mac",
    recipientMeshId: "mesh.server",
    allowedResourceIds: ["health:patient:123"],
    allowedActions: ["read", "sync", "execute", "lease_secret"],
    createdAt: "2026-05-17T10:09:00.000Z",
    expiresAt: "2026-05-18T10:09:00.000Z",
  });
  const regulatedManifest = createSyncResourceManifest({
    resourceId: "health:patient:123",
    kind: "patient",
    ownerNodeId: "node.mac",
    driver: "sqlite_tables",
    routeIds: ["remote.healthRecords"],
  });
  assert.throws(() => createMeshResourceShare({
    invitation: regulatedInvitation,
    toMeshId: "mesh.server",
    manifest: regulatedManifest,
    actions: ["execute"],
    createdAt: "2026-05-17T10:09:30.000Z",
    expiresAt: "2026-05-18T10:09:30.000Z",
  }), /Regulated remote shares require explicit review/);
  assert.throws(() => createMeshResourceShare({
    invitation: regulatedInvitation,
    toMeshId: "mesh.server",
    manifest: regulatedManifest,
    actions: ["lease_secret"],
    secretRefs: ["secret://ehr/token"],
    createdAt: "2026-05-17T10:09:45.000Z",
    expiresAt: "2026-05-18T10:09:45.000Z",
  }), /sensitive_export_review_required/);

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
  assert.equal(meshRevocation.cascadeSyncQueues, true);
  assert.equal(meshRevocation.writes, false);
  assert.equal(meshRevocationSchema.safeParse(meshRevocation).success, true);

  const serviceAssignment = {
    schemaVersion: 1 as const,
    tenantId: "tenant.acme",
    agentId: "agent.support",
    assignmentId: "assignment.service",
    status: "active" as const,
    routeIds: ["gateway.multiTenantAgentService"],
    budgetId: "budget.service",
    billingAccountId: "billing.acme",
    isolationKey: "tenant.acme:assignment.service",
    auditRequired: true as const,
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
  assert.equal(serviceAllowed.allowed, true);
  assert.equal(serviceAllowed.audit.eventType, "remote.agent_service.evaluated");
  assert.equal(serviceAllowed.writes, false);
  assert.equal(remoteAgentServiceDecisionSchema.safeParse(serviceAllowed).success, true);
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
  assert.equal(remoteAgentServiceExecutionReceiptSchema.safeParse(serviceExecutionReceipt).success, true);
  assert.equal(serviceExecutionReceipt.status, "signed_pending_runtime");
  assert.equal(serviceExecutionReceipt.runtimeExecutionVerified, false);
  assert.equal(serviceExecutionReceipt.billingMeterPersisted, false);
  assert.equal(serviceExecutionReceipt.externalPending.includes("agent_runtime_execution"), true);
  assert.equal(serviceExecutionReceipt.externalPending.includes("billing_meter_persistence"), true);
  assert.equal(serviceExecutionReceipt.writes, false);
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
  assert.equal(serviceTenantDenied.allowed, false);
  assert.equal(serviceTenantDenied.reasons.includes("tenant: assignment belongs to a different tenant"), true);
  assert.equal(serviceTenantDenied.reasons.includes("budget: tenant mismatch"), true);
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
  assert.equal(serviceBudgetDenied.allowed, false);
  assert.equal(serviceBudgetDenied.reasons.includes("budget: estimated cost exceeds limit"), true);

  const conformance = buildRemoteConformanceReport({
    routeIds: remoteSyncRequiredRouteIds.map((routeId) => routeId),
    nodeIds: ["claw.coordinator", "claw.gateway", "claw.connector", "claw.sync", "claw.transport.iroh", "claw.headlessHost", "claw.remoteCache"],
  });
  assert.equal(conformance.status, "baseline_registered");

  const remoteRequest = remoteAccessRequestSchema.parse({
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
  const grants = [
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
  const allowedRemoteAccess = evaluateRemoteAccess({ request: remoteRequest, grants });
  assert.equal(allowedRemoteAccess.allowed, true);
  assert.equal(allowedRemoteAccess.requiredBrokerLease, true);
  assert.equal(allowedRemoteAccess.audit.eventType, "remote.access.evaluated");
  assert.equal(allowedRemoteAccess.audit.decision, "allow");
  assert.equal(remoteAccessDecisionSchema.safeParse(allowedRemoteAccess).success, true);
  const gatewayAuditReceipt = createRemoteGatewayAuditReceipt({
    sourceEventType: allowedRemoteAccess.audit.eventType,
    routeId: allowedRemoteAccess.audit.routeId,
    actor: remoteRequest.actor,
    resourceType: allowedRemoteAccess.audit.resourceType,
    resourceId: allowedRemoteAccess.audit.resourceId,
    action: allowedRemoteAccess.audit.action,
    decision: allowedRemoteAccess.allowed,
    createdAt: remoteRequest.now,
  });
  assert.equal(remoteGatewayAuditReceiptSchema.safeParse(gatewayAuditReceipt).success, true);
  assert.equal(gatewayAuditReceipt.hostAuditStore, "signed_host_audit");
  assert.equal(gatewayAuditReceipt.signedHostAuditPersisted, false);
  assert.equal(gatewayAuditReceipt.externalPending.includes("signed_host_audit_persistence"), true);
  assert.equal(gatewayAuditReceipt.writes, false);

  const deniedByClassification = evaluateRemoteAccess({
    request: { ...remoteRequest, classification: "local-only" },
    grants,
  });
  assert.equal(deniedByClassification.allowed, false);
  assert.equal(deniedByClassification.reasons.includes("remote_classification: local-only is not remote-safe"), true);
  assert.equal(deniedByClassification.audit.decision, "deny");

  const deniedWithoutHostGrant = evaluateRemoteAccess({
    request: { ...remoteRequest, secretRefs: [], resourceType: "skills", resourceId: "skills:default", action: "read" },
    grants: grants.filter((grant) => grant.plane !== "host").map((grant) => ({
      ...grant,
      resourceType: "skills",
      resourceId: "skills:default",
      action: "read",
    })),
  });
  assert.equal(deniedWithoutHostGrant.allowed, false);
  assert.equal(deniedWithoutHostGrant.reasons.includes("host: no active allow grant"), true);

  const deniedPlaintextSecret = evaluateRemoteAccess({
    request: { ...remoteRequest, plaintextSecretRequested: true },
    grants,
  });
  assert.equal(deniedPlaintextSecret.allowed, false);
  assert.equal(deniedPlaintextSecret.reasons.includes("secret_broker: plaintext secret access is forbidden"), true);
});

test("CLI command registry is the source for stable CLI surface nodes", () => {
  assert.equal(clawCliCommandRegistry.version, 1);
  assert.equal(clawCliCommandRegistry.commands.some((entry) => entry.name === "host" && entry.securityPolicy === "signed_host_broker"), true);
  assert.equal(clawCliCommandRegistry.commands.every((entry) => entry.docs.length > 0 && entry.adrs.includes("docs/adr/0007-cli-agent-interface.md")), true);
  assert.equal(clawCliCommandRegistry.commands.find((entry) => entry.name === "host")?.support.state, "host_required");
  assert.equal(clawCliCommandRegistry.commands.find((entry) => entry.name === "providers")?.support.state, "supported");
  assert.equal(clawCliCommandRegistry.commands.find((entry) => entry.name === "providers")?.securityPolicy, "local_write");
  assert.equal(clawCliCommandRegistry.commands.find((entry) => entry.name === "providers")?.source?.symbol, "runProviderRoutingCommand");
  assert.equal(clawCliCommandRegistry.commands.find((entry) => entry.name === "contacts")?.target, "database");
  assert.equal(clawCliCommandRegistry.commands.find((entry) => entry.name === "contacts")?.usage, "contacts list|get|create|update|delete|schema");
  assert.equal(clawCliCommandRegistry.commands.find((entry) => entry.name === "life")?.target, "signals");
  assert.equal(clawCliCommandRegistry.commands.find((entry) => entry.name === "life")?.usage, "life catalog|seed-catalog|observe|list|delete");
  assert.equal(clawCliCommandRegistry.commands.find((entry) => entry.name === "agents")?.source?.symbol, "runAgentsCommand");
  assert.equal(clawCliCommandRegistry.commands.find((entry) => entry.name === "personalities")?.source?.symbol, "runPersonalitiesCommand");
  assert.equal(clawCliCommandRegistry.commands.find((entry) => entry.name === "skill-collections")?.source?.symbol, "runSkillCollectionsCommand");
  assert.equal(clawCliCommandRegistry.commands.find((entry) => entry.name === "connections")?.source?.symbol, "runConnectionsCommand");
  assert.equal(clawCliCommandRegistry.commands.find((entry) => entry.name === "mcp")?.advanced, undefined);
  assert.equal(clawCliCommandRegistry.commands.find((entry) => entry.name === "snippets")?.source?.symbol, "runSnippetsCommand");
  assert.equal(clawCliCommandRegistry.commands.find((entry) => entry.name === "audio")?.securityPolicy, "local_write");
  assert.equal(clawCliCommandRegistry.commands.find((entry) => entry.name === "audio")?.usage, "audio index|transcript|artifact list|get|delete");
  assert.equal(clawCliCommandRegistry.commands.find((entry) => entry.name === "calendar")?.securityPolicy, "local_write");
  assert.equal(clawCliCommandRegistry.commands.find((entry) => entry.name === "calendar")?.usage, "calendar create|list|get|update|delete");
  assert.equal(clawCliCommandRegistry.commands.find((entry) => entry.name === "calendar")?.source?.symbol, "runV1DataCli");
  assert.equal(clawCliCommandRegistry.commands.find((entry) => entry.name === "content")?.usage, "content brand|destination|campaign|entry|approval|publish");
  assert.equal(clawCliCommandRegistry.commands.find((entry) => entry.name === "content")?.source?.symbol, "runDelegatedContentCli");
  assert.equal(clawCliCommandRegistry.commands.find((entry) => entry.name === "marketplace")?.usage, "marketplace choice upsert|list|get|delete");
  assert.equal(clawCliCommandRegistry.commands.find((entry) => entry.name === "marketplace")?.source?.symbol, "runV1DataCli");
  assert.equal(clawCliCommandRegistry.commands.find((entry) => entry.name === "iot")?.usage, "iot config|serve|homes|things|state|lights|climate|scenes|automations|approvals");
  assert.equal(clawCliCommandRegistry.commands.find((entry) => entry.name === "iot")?.source?.symbol, "runDelegatedIotCli");
  assert.equal(clawCliCommandRegistry.commands.find((entry) => entry.name === "images")?.support.state, "cost_risk");

  const cliNodes = clawPersistentSurfaceRegistry.nodes.filter((node) => node.kind === "cliCommand").map((node) => node.value).sort();
  const registryCommands = clawCliCommandRegistry.commands.map((entry) => entry.name).sort();
  assert.deepEqual(cliNodes, registryCommands);

  const matches = searchClawCliRegistry("system capabilities");
  assert.equal(matches.some((entry) => entry.canonicalName === "host"), true);
});

test("storage helpers resolve Claw roots and enforce Codex read-only policy", () => {
  assert.equal(
    resolveClawGlobalDataDir({ homeDir: "/Users/demo", platform: "darwin" }),
    "/Users/demo/.claw",
  );
  assert.equal(resolveClawWorkspaceDir("/repo/app"), "/repo/app/.claw");
  assert.equal(
    resolveClawHostStateDir({ homeDir: "/Users/demo", hostName: "Clawix", platform: "darwin" }),
    "/Users/demo/.clawix",
  );
  assert.equal(
    resolveClawHostRegistryPath({ homeDir: "/Users/demo", platform: "darwin" }),
    "/Users/demo/.claw/state/hosts/registry.json",
  );

  assert.doesNotThrow(() => assertCodexReadOnlyPath({
    homeDir: "/Users/demo",
    path: "/Users/demo/.codex/sessions/session.jsonl",
    operation: "mirror",
  }));
  assert.throws(() => assertCodexReadOnlyPath({
    homeDir: "/Users/demo",
    path: "/Users/demo/.codex/sessions/session.jsonl",
    operation: "delete",
  }), /Refusing delete operation/);
  assert.throws(() => assertCodexReadOnlyPath({
    homeDir: "/Users/demo",
    path: "/Users/demo/projects/../.codex/auth.json",
    operation: "write",
  }), /Refusing write operation/);
  assert.doesNotThrow(() => assertCodexReadOnlyPath({
    homeDir: "/Users/demo",
    path: "/Users/demo/.codex/AGENTS.md",
    operation: "write",
    allowAgentsMdOptIn: true,
  }));

  assert.deepEqual(createCodexReadOnlySourceDescriptor("/Users/demo"), {
    id: "codex",
    rootDir: "/Users/demo/.codex",
    allowedOperations: ["read", "mirror", "index"],
    writePolicy: "agents_md_opt_in_only",
  });
});

test("surface registry freezes ports, paths, sockets, hostnames, and data files", () => {
  assert.equal(clawSurfaceRegistryVersion, 1);
  assert.equal(clawixBridgePort, 24080);
  assert.equal(clawCorePorts.runtime, 24100);
  assert.equal(clawCorePorts.sessions, 24101);
  assert.equal(clawCorePorts.search, 24106);
  assert.equal(clawCorePorts.signals, 24110);
  assert.equal(clawCorePorts.publishing, 24111);
  assert.equal(clawCorePorts.monitor, 24114);
  assert.equal(clawLocalHostnames.board, "board.claw.localhost");
  assert.equal(clawLocalHostnames.channels, "channels.claw.localhost");
  assert.equal(clawPublicApiPrefix, "/v1");
  assert.equal(clawApiPath(), "/v1");
  assert.equal(clawApiPath("/sessions"), "/v1/sessions");
  assert.equal(clawApiPath("sessions/export"), "/v1/sessions/export");
  assert.equal(clawEventsPath, "/v1/events");
  assert.equal(clawStorageFiles.mainDatabase, "core.sqlite");
  assert.equal(clawWorkspaceLayout.manifest, ".claw/manifest.json");
  assert.equal(clawWorkspaceLayout.browser, ".claw/browser");
  assert.equal(clawGlobalHomeLayout.config, "~/.claw/config.yaml");
  assert.equal(clawixHomeLayout.bridgeSocket, "~/.clawix/run/clawix-bridge.sock");
  assert.equal(clawServiceSocketPath("runtime"), "~/.claw/run/claw-runtime.sock");
  assert.equal(clawServiceWindowsPipe("runtime"), String.raw`\\.\pipe\claw-runtime`);
  assert.equal(clawExportExtensions.backup, ".clawbackup");

  const socketFallbackEnv = findClawPersistentSurfaceNode("claw.env.hostDisableSocketFallback");
  assert.equal(socketFallbackEnv?.value, "CLAW_HOST_DISABLE_SOCKET_FALLBACK");
  assert.equal(findClawPersistentSurfaceNode("claw.env.hostDisableLegacySocketFallback"), undefined);
});

test("semantic plan schema validates agent-native action previews", () => {
  const plan = semanticPlanSchema.parse({
    schemaVersion: 1,
    intent: {
      id: "intent-code-change",
      summary: "Prepare a code change",
      constraints: ["do not publish without approval"],
    },
    objects: [
      { id: "repo", kind: "repository", label: "Example repo" },
      { id: "change", kind: "task", label: "Proposed change" },
    ],
    actions: [
      {
        id: "inspect",
        type: "inspect",
        label: "Inspect repository",
        objectIds: ["repo"],
        effectIds: ["read-local"],
        permissionIds: ["repo-read"],
        risk: "low",
      },
    ],
    effects: [
      {
        id: "read-local",
        kind: "read",
        description: "Read local repository files",
        objectIds: ["repo"],
        reversible: true,
        risk: "low",
      },
    ],
    permissions: [
      {
        id: "repo-read",
        capability: "repository.read",
        scope: "local workspace",
        risk: "low",
      },
    ],
  });

  assert.equal(plan.intent.summary, "Prepare a code change");
  assert.equal(plan.actions[0]?.requiresHumanApproval, false);
});

test("compat and template schemas validate normalized payloads", () => {
  const compat = compatSnapshotSchema.parse({
    schemaVersion: 1,
    runtimeAdapter: "openclaw",
    runtimeVersion: "1.2.3",
    probedAt: "2026-03-20T10:00:00.000Z",
    capabilities: { status: true, doctor: false },
  });
  assert.equal(compat.runtimeAdapter, "openclaw");

  const templatePack = templatePackSchema.parse({
    schemaVersion: 1,
    id: "demo",
    name: "Demo",
    mutations: [
      {
        targetFile: "SOUL.md",
        mode: "managed_block",
        blockId: "core",
        content: "hello",
      },
    ],
  });
  assert.equal(templatePack.mutations[0]?.targetFile, "SOUL.md");

  const auditEvent = auditEventSchema.parse({
    timestamp: "2026-03-21T10:00:00.000Z",
    event: "files.binding_synced",
    capability: "file_sync",
    detail: { file: "SOUL.md" },
  });
  assert.equal(auditEvent.capability, "file_sync");
});

test("workspace productivity schemas validate linked records and search queries", () => {
  const area = areaRecordSchema.parse({
    id: "area-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "local" },
    name: "Platform",
    status: "active",
  });
  assert.equal(area.status, "active");

  const link = linkedEntityRefSchema.parse({
    domain: "area",
    id: "area-1",
    relationship: "contains",
  });
  assert.equal(link.domain, "area");

  const taskLink = linkedEntityRefSchema.parse({
    domain: "task",
    id: "task-1",
    relationship: "blocks",
  });
  assert.equal(taskLink.domain, "task");

  const task = taskRecordSchema.parse({
    id: "task-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "local" },
    title: "Ship workspace layer",
    status: "todo",
    priority: "high",
    labels: ["sdk"],
    areaId: "area-1",
    watcherPersonIds: [],
    childTaskIds: [],
    dependsOnTaskIds: [],
    commentIds: [],
    attachmentIds: [],
    blockedByIds: [],
    evidenceIds: [],
    decisionIds: [],
    assignmentIds: [],
    handoffIds: [],
    approvalIds: [],
    checklist: [],
    estimateMinutes: 90,
    blockedReason: "waiting on api",
    links: [taskLink],
  });
  assert.equal(task.estimateMinutes, 90);

  const goal = goalRecordSchema.parse({
    id: "goal-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "local" },
    title: "Ship productivity",
    status: "active",
    level: "personal",
    areaId: "area-1",
    parentId: "goal-root",
    parentGoalId: "goal-root",
    ownerAgentId: "agent-1",
    reviewCadence: "weekly",
    metricDirection: "increase",
  });
  assert.equal(goal.reviewCadence, "weekly");

  const project = projectRecordSchema.parse({
    id: "project-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "local" },
    name: "Workspace local-first",
    status: "in_progress",
    areaId: "area-1",
    leadAgentId: "agent-1",
    milestoneIds: ["milestone-1"],
    defaultSectionIds: [],
  });
  assert.equal(project.milestoneIds[0], "milestone-1");

  const milestone = milestoneRecordSchema.parse({
    id: "milestone-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "local" },
    title: "CLI launch",
    status: "active",
    areaId: "area-1",
    projectId: "project-1",
  });
  assert.equal(milestone.projectId, "project-1");

  const activity = activityEntryRecordSchema.parse({
    id: "activity-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "derived" },
    entityType: "task",
    entityId: "task-1",
    kind: "created",
    title: "Task created",
    areaId: "area-1",
    projectId: "project-1",
    taskId: "task-1",
  });
  assert.equal(activity.entityType, "task");

  const blocker = blockerRecordSchema.parse({
    id: "blocker-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "local" },
    title: "Waiting on policy review",
    status: "active",
    kind: "policy_block",
    taskId: "task-1",
    dependencyTaskIds: [],
    evidenceIds: [],
  });
  assert.equal(blocker.kind, "policy_block");

  const artifact = artifactRecordSchema.parse({
    id: "artifact-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "local" },
    title: "Hermetic screenshot",
    kind: "screenshot",
    taskId: "task-1",
    summary: "Captured final screen",
  });
  assert.equal(artifact.kind, "screenshot");

  const decision = decisionRecordSchema.parse({
    id: "decision-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "local" },
    title: "Keep the loop on /tasks",
    status: "accepted",
    taskId: "task-1",
    alternatives: ["New route", "Reuse panel"],
    artifactIds: ["artifact-1"],
  });
  assert.equal(decision.status, "accepted");

  const session = workSessionRecordSchema.parse({
    id: "session-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "local" },
    title: "Focus on task loop",
    status: "active",
    taskIds: ["task-1"],
    blockerIds: ["blocker-1"],
    startedAt: "2026-03-21T10:05:00.000Z",
  });
  assert.equal(session.status, "active");

  const assignment = assignmentRecordSchema.parse({
    id: "assignment-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "local" },
    title: "Own the release gate",
    status: "accepted",
    taskId: "task-1",
    assignedToAgentId: "agent-release",
    assignedBy: "lead-agent",
  });
  assert.equal(assignment.assignedToAgentId, "agent-release");

  const handoff = handoffRecordSchema.parse({
    id: "handoff-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "local" },
    title: "Pass QA closeout to reviewer",
    status: "proposed",
    taskId: "task-1",
    fromAgentId: "agent-build",
    toAgentId: "agent-review",
    artifactIds: ["artifact-1"],
    blockerIds: ["blocker-1"],
  });
  assert.equal(handoff.toAgentId, "agent-review");

  const approval = productivityApprovalRecordSchema.parse({
    id: "approval-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "local" },
    title: "Approve publish step",
    status: "pending",
    kind: "publish",
    taskId: "task-1",
    policyReason: "Publishing requires a reviewer gate.",
    evidenceIds: ["artifact-1"],
    decisionIds: ["decision-1"],
  });
  assert.equal(approval.kind, "publish");

  const capacity = capacityRecordSchema.parse({
    id: "capacity-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "derived" },
    title: "Agent reviewer",
    status: "active",
    agentId: "agent-review",
    availability: "available",
    currentWip: 2,
    queueDepth: 3,
    blockedCount: 1,
    overdueCount: 0,
    assignedTaskIds: ["task-1"],
    pendingApprovalIds: ["approval-1"],
    pendingHandoffIds: ["handoff-1"],
  });
  assert.equal(capacity.agentId, "agent-review");

  const agent = agentRecordSchema.parse({
    id: "agent-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "local" },
    name: "Reviewer",
    status: "active",
    role: "review",
    domains: ["release", "quality"],
    availability: "busy",
    autonomyLevel: "act_limited",
    permissions: ["tasks.update", "checks.update"],
    policyGate: "approval_required",
    linkedTaskIds: ["task-1"],
  });
  assert.equal(agent.autonomyLevel, "act_limited");

  const release = releaseRecordSchema.parse({
    id: "release-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "local" },
    title: "Spring launch",
    status: "at_risk",
    projectId: "project-1",
    linkedTaskIds: ["task-1"],
    incidentIds: ["incident-1"],
    approvalIds: ["approval-1"],
  });
  assert.equal(release.status, "at_risk");

  const incident = incidentRecordSchema.parse({
    id: "incident-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "local" },
    title: "Checkout regression",
    status: "investigating",
    severity: "sev2",
    projectId: "project-1",
    taskId: "task-1",
    blockerIds: ["blocker-1"],
    feedbackIds: ["feedback-1"],
  });
  assert.equal(incident.severity, "sev2");

  const feedback = feedbackRecordSchema.parse({
    id: "feedback-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "channel", channel: "support" },
    title: "Customer saw the regression",
    status: "new",
    origin: "customer",
    priority: "high",
    incidentId: "incident-1",
  });
  assert.equal(feedback.origin, "customer");

  const check = operationalCheckRecordSchema.parse({
    id: "check-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "derived" },
    title: "Release readiness",
    status: "failing",
    kind: "release_readiness",
    releaseId: "release-1",
  });
  assert.equal(check.kind, "release_readiness");

  const reminder = reminderRecordSchema.parse({
    id: "reminder-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "local" },
    title: "Review workspace",
    status: "active",
    triggerAt: "2026-03-22T09:00:00.000Z",
    anchorType: "task",
    anchorId: "task-1",
  });
  assert.equal(reminder.anchorType, "task");

  const deadline = deadlineRecordSchema.parse({
    id: "deadline-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "local" },
    title: "Workspace ship date",
    status: "active",
    dueAt: "2026-03-25T18:00:00.000Z",
    anchorType: "project",
    anchorId: "project-1",
  });
  assert.equal(deadline.anchorType, "project");

  const note = noteRecordSchema.parse({
    id: "note-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "local" },
    title: "Context",
    blocks: [{ id: "block-1", type: "paragraph", text: "Workspace context." }],
    tags: ["workspace"],
    linkedEntityIds: ["task-1"],
    searchText: "Context Workspace context.",
  });
  assert.equal(note.blocks[0]?.type, "paragraph");

  const identity = personIdentitySchema.parse({
    channel: "telegram",
    handle: "@alice",
  });
  assert.equal(identity.channel, "telegram");

  const event = eventRecordSchema.parse({
    id: "event-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "local" },
    title: "Launch review",
    startsAt: "2026-03-22T09:00:00.000Z",
    attendeePersonIds: [],
    linkedTaskIds: ["task-1"],
    linkedNoteIds: ["note-1"],
    reminders: [{ id: "reminder-1", minutesBeforeStart: 30 }],
  });
  assert.equal(event.reminders[0]?.minutesBeforeStart, 30);

  const temporal = temporalItemSchema.parse({
    id: "time-1",
    kind: "routine",
    status: "active",
    title: "Review PRs",
    timezone: "UTC",
    schedule: {
      mode: "cron",
      timezone: "UTC",
      cron: "0 */3 * * *",
    },
    participants: [{ id: "agent-1", kind: "agent", label: "Reviewer", agentId: "reviewer" }],
    actions: [{ id: "action-1", kind: "workflow", target: "runtime_scheduler" }],
    projections: [{ id: "projection-1", itemId: "time-1", target: "relay_routines", status: "pending", updatedAt: "2026-03-21T10:00:00.000Z" }],
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
  });
  assert.equal(temporal.schedule.cron, "0 */3 * * *");

  const search = workspaceSearchQuerySchema.parse({
    query: "workspace",
    domains: ["areas", "tasks", "goals", "projects", "milestones", "blockers", "artifacts", "decisions", "work_sessions", "assignments", "handoffs", "approvals", "capacity", "agents", "releases", "incidents", "feedback", "checks", "reminders", "deadlines", "notes"],
    strategy: "hybrid",
    limit: 5,
  });
  assert.equal(search.strategy, "hybrid");
});

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
