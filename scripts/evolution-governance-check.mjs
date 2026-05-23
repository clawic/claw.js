#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createDiagnostic, printActionableFailureReport } from "./actionable-error.mjs";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const args = new Set(process.argv.slice(2));
const allowedArgs = new Set(["--self-test"]);
const errors = [];

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function requireFile(relativePath) {
  if (!fs.existsSync(path.join(rootDir, relativePath))) errors.push(`missing ${relativePath}`);
}

function requireSnippet(relativePath, snippet) {
  const text = read(relativePath);
  if (!text.includes(snippet)) errors.push(`${relativePath} is missing ${JSON.stringify(snippet)}`);
}

function evolutionDiagnostic(error) {
  if (error.startsWith("unknown argument")) {
    return createDiagnostic("evolution_governance_usage_error", error, {
      status: "USAGE",
      location: "scripts/evolution-governance-check.mjs",
      suggestion: "Use --self-test or no arguments.",
      safeNextStep: "Rerun node scripts/evolution-governance-check.mjs with a supported argument.",
    });
  }
  const missing = error.match(/^missing (.+)$/);
  if (missing) {
    return createDiagnostic("evolution_governance_required_file_missing", error, {
      location: missing[1],
      suggestion: "Restore the required evolution doc, fixture, source file, CLI file, or skill.",
      safeNextStep: `Add or restore ${missing[1]}, then rerun node scripts/evolution-governance-check.mjs.`,
    });
  }
  const missingSnippet = error.match(/^(.+) is missing (.+)$/);
  if (missingSnippet) {
    return createDiagnostic("evolution_governance_required_snippet_missing", error, {
      location: missingSnippet[1],
      suggestion: "Restore the required policy, API, CLI, decision, or audit marker in the named file.",
      safeNextStep: "Add the missing marker, then rerun node scripts/evolution-governance-check.mjs.",
    });
  }
  if (error.includes("partial or blocked rows")) {
    return createDiagnostic("evolution_governance_source_audit_incomplete", error, {
      location: "docs/governance/evolution/source-audit.md",
      suggestion: "Do not close the evolution goal while any source-audit decision is partial or blocked.",
      safeNextStep: "Implement, document, or explicitly resolve the partial/blocked rows, then rerun this check.",
    });
  }
  if (error.startsWith("evolution ledger") || error.startsWith("postV1Migration") || error.startsWith("rescueCore")) {
    return createDiagnostic("evolution_governance_ledger_invalid", error, {
      location: "docs/evolution/baseline.json",
      suggestion: "Restore the evolution ledger schema, policy, and record structure.",
      safeNextStep: "Fix docs/evolution/baseline.json, then rerun node scripts/evolution-governance-check.mjs.",
    });
  }
  if (error.startsWith("public versions manifest") || error.startsWith("public version ") || error.startsWith("duplicate public version")) {
    return createDiagnostic("evolution_governance_public_versions_invalid", error, {
      location: "docs/evolution/public-versions.json",
      suggestion: "Keep every public version listed once with a matching fixture and previous-version chain.",
      safeNextStep: "Fix docs/evolution/public-versions.json or its named fixture, then rerun this check.",
    });
  }
  if (error.startsWith("public fixture is not listed")) {
    return createDiagnostic("evolution_governance_fixture_unlisted", error, {
      location: "docs/evolution/fixtures",
      suggestion: "List every public fixture in the public versions manifest, or remove obsolete fixtures.",
      safeNextStep: "Update docs/evolution/public-versions.json, then rerun this check.",
    });
  }
  if (error.includes("forbidden private/sensitive token")) {
    return createDiagnostic("evolution_governance_fixture_privacy_leak", error, {
      location: "docs/evolution/fixtures/v1-foundation.json",
      suggestion: "Remove private paths and secret-like tokens from public evolution fixtures.",
      safeNextStep: "Replace the sensitive fixture value with a synthetic public-safe placeholder, then rerun this check.",
    });
  }
  if (error.startsWith("public surface baseline diff")) {
    return createDiagnostic("evolution_governance_surface_diff_failed", error, {
      location: "docs/evolution/public-surface-baseline.json",
      suggestion: "Fix the nested diff command or rebuild the public surface baseline inputs.",
      safeNextStep: "Run the diff path locally, fix its first failure, then rerun node scripts/evolution-governance-check.mjs.",
    });
  }
  if (error.startsWith("public surface baseline")) {
    return createDiagnostic("evolution_governance_public_surface_baseline_invalid", error, {
      location: "docs/evolution/public-surface-baseline.json",
      suggestion: "Refresh or cover public surface baseline changes with an active evolution record.",
      safeNextStep: "Update the baseline or add the covering evolution record, then rerun this check.",
    });
  }
  if (error.startsWith("v1 foundation fixture")) {
    return createDiagnostic("evolution_governance_v1_fixture_invalid", error, {
      location: "docs/evolution/fixtures/v1-foundation.json",
      suggestion: "Restore the v1 foundation fixture schema, identity, rescue core, and required surface inventory.",
      safeNextStep: "Fix docs/evolution/fixtures/v1-foundation.json, then rerun node scripts/evolution-governance-check.mjs.",
    });
  }
  if (error.includes("self-test")) {
    return createDiagnostic("evolution_governance_self_test_failed", error, {
      location: "scripts/evolution-governance-check.mjs",
      suggestion: "Fix the evolution guard self-test before trusting the check.",
      safeNextStep: "Update the detector logic, then rerun node scripts/evolution-governance-check.mjs --self-test.",
    });
  }
  return createDiagnostic("evolution_governance_check_failed", error, {
    location: "scripts/evolution-governance-check.mjs",
    suggestion: "Inspect the named evolution governance invariant and restore the expected contract.",
    safeNextStep: "Fix the reported evolution issue, then rerun node scripts/evolution-governance-check.mjs.",
  });
}

function printErrors(items, options = {}) {
  printActionableFailureReport({
    title: options.title ?? "evolution governance check failed:",
    diagnostics: items.map(evolutionDiagnostic),
    stream: options.stream ?? process.stderr,
  });
}

for (const arg of args) {
  if (!allowedArgs.has(arg)) {
    printErrors([`unknown argument ${arg}`]);
    process.exit(64);
  }
}

for (const file of [
  "docs/adr/0030-post-v1-evolution-rescue-backbone.md",
  "docs/evolution/README.md",
  "docs/evolution/schema.json",
  "docs/evolution/baseline.json",
  "docs/evolution/public-versions.json",
  "docs/evolution/public-surface-baseline.json",
  "docs/evolution/fixtures/v1-foundation.json",
  "docs/governance/evolution/source-audit.md",
  "packages/clawjs-core/src/evolution.ts",
  "packages/clawjs/src/cli-evolution-command.ts",
  "skills/compatibility-evolution-work/SKILL.md",
]) requireFile(file);

for (const snippet of [
  "postV1Migration: \"step_by_step_all_public_versions\"",
  "rescueCore: \"launch_chat_repair\"",
  "legacyLocation: \"boundary_migrators_adapters_receipts\"",
  "externalSubmission: \"explicit_approval_only\"",
  "createEvolutionPublicSurfaceBaseline",
  "diffEvolutionPublicSurfaceBaseline",
  "createEvolutionOperatorPlan",
  "classifyEvolutionBackupPolicy",
  "createEvolutionReceipt",
  "createEvolutionRepairReport",
  "clawEvolutionRepairReportSchema",
  "createEvolutionRestorePoint",
  "createEvolutionRollbackReport",
  "clawEvolutionRollbackReportSchema",
  "best_effort_forward_repair",
  "universalRollbackPromised",
  "previousPublicVersion",
  "versionChain",
  "version_chain_complete",
  "adapterChecks",
  "rebuildChecks",
  "adapterRetirementChecks",
  "stableSurfaceCoverage",
  "adapter_contracts_present",
  "rebuild_contracts_present",
  "adapter_retirement_policy",
  "stable_surface_strategy_coverage",
  "CLAW_EVOLUTION_STABLE_SURFACE_STRATEGIES",
  "redactEvolutionReceiptText",
  "runEvolutionMigratorLab",
]) requireSnippet("packages/clawjs-core/src/evolution.ts", snippet);

for (const snippet of [
  "evolution list|show|diff",
  "docs/adr/0030-post-v1-evolution-rescue-backbone.md",
  "packages/clawjs/src/cli-evolution-command.ts",
]) requireSnippet("packages/clawjs-core/src/cli-command-registry.ts", snippet);

for (const snippet of [
  "evolution-governance-check.mjs",
  "compatibility-evolution-work",
  "Post-V1 evolution and rescue backbone",
]) requireSnippet("docs/decision-map.md", snippet);

for (const snippet of [
  "The current code path must not branch through old versions.",
  "knowledge in migrators, adapters, receipts, repair tools, and fixtures.",
]) requireSnippet("docs/evolution/README.md", snippet);

for (const snippet of [
  "function evolutionGate()",
  "npmRun(\"test:evolution\")",
  "function fast(",
  "function changed()",
  "function release()",
  "integration();",
]) requireSnippet("scripts/test-lane.mjs", snippet);

for (const snippet of [
  "source-audit.md",
  "Source conversation: `source:evolution-rescue-backbone`",
  "Binding plan item: `plan:evolution-rescue-backbone`",
  "Status: `verified`",
  "## Superseded Prompts",
  "The active goal must not be closed while any row is `partial` or `blocked`.",
]) requireSnippet("docs/governance/evolution/source-audit.md", snippet);
if (/\|\s*(?:partial|blocked)\s*\|/u.test(read("docs/governance/evolution/source-audit.md"))) {
  errors.push("evolution source audit still has partial or blocked rows");
}

for (const decisionId of [
  "plan_scope",
  "canon_owner",
  "compat_policy",
  "legacy_location",
  "success_criteria",
  "gate_strictness",
  "first_delivery_shape",
  "v1_baseline_strategy",
  "implementation_sequence",
  "cli_surface_name",
  "ledger_location",
  "breaking_approval",
  "repair_policy",
  "receipt_privacy",
  "migration_backup_policy",
  "large_object_policy",
  "snapshot_scope_policy",
  "atomicity_policy",
  "backup_class_policy",
  "size_threshold_policy",
  "external_source_policy",
  "backup_retention",
  "backup_location",
  "default_size_threshold",
  "clawix_phase1",
  "agent_skill_phase1",
  "phase1_contents",
  "version_support_window",
  "migration_chain_policy",
  "adapter_retirement_policy",
  "startup_survival_policy",
  "repair_agent_role",
  "repair_surface_shape",
  "runtime_fallback_policy",
  "repair_tool_scope",
  "minimum_chat_contract",
  "health_detection_scope",
  "runaway_protection",
  "user_notification_tone",
  "agent_fix_output",
  "report_submission_policy",
  "creator_report_policy",
  "survival_acceptance",
  "rescue_priority",
  "constitution_update_scope",
  "evolution_cli_commands",
  "evolution_record_granularity",
  "evolution_diff_gate",
  "change_classification_taxonomy",
  "evolution_record_status",
  "record_ownership_fields",
  "adapter_boundary_policy",
  "rollback_policy",
  "migration_engine_scope",
  "external_rollback_policy",
  "destructive_change_policy",
  "rollback_refinement",
  "down_migration_requirement",
  "restore_point_policy",
  "downgrade_user_goal",
  "downgrade_product_principle",
  "repair_visibility_default",
  "offline_repair_policy",
  "repair_approval_threshold",
  "release_gate_policy",
  "fixture_corpus_policy",
  "survival_test_matrix",
  "survival_test_matrix_refined",
  "log_redaction_policy",
  "report_destination_policy",
  "public_private_boundary",
  "clawix_visual_scope",
  "implementation_phasing",
  "core_api_shape",
]) requireSnippet("docs/governance/evolution/source-audit.md", `\`${decisionId}\``);

for (const supersededPromptId of [
  "startup_migration_policy",
  "blocked_state_policy",
  "migration_user_surface",
]) requireSnippet("docs/governance/evolution/source-audit.md", `\`${supersededPromptId}\``);

const ledger = readJson("docs/evolution/baseline.json");
const publicVersions = readJson("docs/evolution/public-versions.json");
const publicSurfaceBaseline = readJson("docs/evolution/public-surface-baseline.json");
const v1FoundationFixture = readJson("docs/evolution/fixtures/v1-foundation.json");
if (ledger.schemaVersion !== 1) errors.push("evolution ledger schemaVersion must be 1");
if (ledger.policy?.sourceOfTruth !== "clawjs") errors.push("evolution ledger sourceOfTruth must be clawjs");
if (ledger.policy?.postV1Migration !== "step_by_step_all_public_versions") errors.push("postV1Migration policy drifted");
if (ledger.policy?.rescueCore !== "launch_chat_repair") errors.push("rescueCore policy drifted");
if (!Array.isArray(ledger.records) || ledger.records.length < 1) errors.push("evolution ledger must have at least one record");
for (const record of ledger.records ?? []) {
  for (const key of ["id", "title", "class", "status", "steward", "surfaces", "tests", "createdAt"]) {
    if (record[key] === undefined) errors.push(`evolution record ${record.id ?? "<unknown>"} is missing ${key}`);
  }
  if (!Array.isArray(record.surfaces) || record.surfaces.length < 1) errors.push(`evolution record ${record.id} needs surfaces`);
  if (!Array.isArray(record.tests)) errors.push(`evolution record ${record.id} needs tests`);
}

if (publicVersions.schemaVersion !== 1) errors.push("public versions manifest schemaVersion must be 1");
if (publicVersions.sourceOfTruth !== "clawjs") errors.push("public versions manifest sourceOfTruth must be clawjs");
if (publicVersions.policy !== "every_public_version_has_fixture") errors.push("public versions manifest policy drifted");
if (!Array.isArray(publicVersions.versions) || publicVersions.versions.length < 1) errors.push("public versions manifest must list at least v1");
const publicVersionIds = new Set();
const publicVersionFixturePaths = new Set();
for (const entry of publicVersions.versions ?? []) {
  if (typeof entry.publicVersion !== "string" || entry.publicVersion.length < 1) errors.push("public version entry needs publicVersion");
  if (publicVersionIds.has(entry.publicVersion)) errors.push(`duplicate public version ${entry.publicVersion}`);
  publicVersionIds.add(entry.publicVersion);
  if (typeof entry.fixture !== "string" || !entry.fixture.startsWith("docs/evolution/fixtures/")) {
    errors.push(`public version ${entry.publicVersion} needs fixture under docs/evolution/fixtures`);
    continue;
  }
  publicVersionFixturePaths.add(entry.fixture);
  if (!fs.existsSync(path.join(rootDir, entry.fixture))) {
    errors.push(`public version ${entry.publicVersion} fixture is missing: ${entry.fixture}`);
    continue;
  }
  const fixture = readJson(entry.fixture);
  if (fixture.publicVersion !== entry.publicVersion) {
    errors.push(`public version ${entry.publicVersion} fixture has mismatched publicVersion ${fixture.publicVersion}`);
  }
  if (fixture.phase !== entry.phase) {
    errors.push(`public version ${entry.publicVersion} fixture has mismatched phase ${fixture.phase}`);
  }
  if ((fixture.previousPublicVersion ?? null) !== (entry.previousPublicVersion ?? null)) {
    errors.push(`public version ${entry.publicVersion} fixture has mismatched previousPublicVersion`);
  }
  if (entry.phase === "public_release" && !entry.previousPublicVersion) {
    errors.push(`public release ${entry.publicVersion} must declare previousPublicVersion`);
  }
  if (entry.previousPublicVersion && !publicVersionIds.has(entry.previousPublicVersion)) {
    errors.push(`public version ${entry.publicVersion} references unknown previousPublicVersion ${entry.previousPublicVersion}`);
  }
}
for (const entry of fs.readdirSync(path.join(rootDir, "docs/evolution/fixtures")).filter((name) => name.endsWith(".json"))) {
  const fixturePath = `docs/evolution/fixtures/${entry}`;
  if (!publicVersionFixturePaths.has(fixturePath)) {
    errors.push(`public fixture is not listed in public-versions manifest: ${fixturePath}`);
  }
}

if (publicSurfaceBaseline.schemaVersion !== 1) errors.push("public surface baseline schemaVersion must be 1");
if (publicSurfaceBaseline.sources?.surfaces !== "packages/clawjs-core/src/surface-registry.ts") errors.push("public surface baseline must cite surface registry");
if (publicSurfaceBaseline.sources?.cliCommands !== "packages/clawjs-core/src/cli-command-registry.ts") errors.push("public surface baseline must cite CLI registry");
if (!Array.isArray(publicSurfaceBaseline.surfaces) || publicSurfaceBaseline.surfaces.length < 1) errors.push("public surface baseline must include surfaces");
if (!Array.isArray(publicSurfaceBaseline.cliCommands) || publicSurfaceBaseline.cliCommands.length < 1) errors.push("public surface baseline must include CLI commands");
if (publicSurfaceBaseline.counts?.surfaces !== publicSurfaceBaseline.surfaces?.length) errors.push("public surface baseline surface count drifted internally");
if (publicSurfaceBaseline.counts?.cliCommands !== publicSurfaceBaseline.cliCommands?.length) errors.push("public surface baseline CLI count drifted internally");

if (v1FoundationFixture.schemaVersion !== 1) errors.push("v1 foundation fixture schemaVersion must be 1");
if (v1FoundationFixture.fixtureId !== "evo_fixture_v1_foundation") errors.push("v1 foundation fixture id drifted");
if (v1FoundationFixture.publicVersion !== "v1") errors.push("v1 foundation fixture must target v1");
if (v1FoundationFixture.rescueCore !== "launch_chat_repair") errors.push("v1 foundation fixture must preserve launch_chat_repair");
if (!Array.isArray(v1FoundationFixture.surfaces) || v1FoundationFixture.surfaces.length < 1) errors.push("v1 foundation fixture must include surfaces");
const fixtureText = JSON.stringify(v1FoundationFixture);
for (const forbidden of ["/Users/", "sk-", "ghp_", "github_pat_", "xoxb-"]) {
  if (fixtureText.includes(forbidden)) errors.push(`v1 foundation fixture includes forbidden private/sensitive token ${forbidden}`);
}
for (const kind of [
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
]) {
  if (!(v1FoundationFixture.surfaces ?? []).some((surface) => surface.kind === kind)) {
    errors.push(`v1 foundation fixture missing required surface kind ${kind}`);
  }
}

const diff = currentPublicSurfaceDiff();
if (!diff) {
  errors.push("public surface baseline diff must run successfully");
} else {
  if (diff.status !== "unchanged") {
    errors.push("public surface baseline must be refreshed after stable surface changes");
  }
  if (diff.uncoveredChanges?.length > 0) {
    for (const change of diff.uncoveredChanges) {
      errors.push(`public surface baseline drift is not covered by an active evolution record: ${change.area}:${change.change}:${change.id}`);
    }
  }
}

if (args.has("--self-test")) {
  const invalid = { schemaVersion: 1, policy: { sourceOfTruth: "other" }, records: [] };
  if (invalid.policy.sourceOfTruth === "clawjs") errors.push("self-test fixture unexpectedly passed");
  const simulated = currentPublicSurfaceDiff({ simulateMissingCliCommand: true });
  if (!simulated || simulated.uncoveredChanges.length < 1) {
    errors.push("self-test must detect uncovered CLI baseline drift");
  }
  const chunks = [];
  printErrors([
    "unknown argument --bad-token-sk-test-secret-123456",
    "missing /Users/example/private/docs/evolution/README.md",
    "docs/evolution/README.md is missing \"launch_chat_repair\"",
    "evolution source audit still has partial or blocked rows",
    "evolution ledger sourceOfTruth must be clawjs",
    "public version v2 fixture is missing: docs/evolution/fixtures/v2.json",
    "public fixture is not listed in public-versions manifest: docs/evolution/fixtures/old.json",
    "public surface baseline must be refreshed after stable surface changes",
    "v1 foundation fixture includes forbidden private/sensitive token sk-",
    "public surface baseline diff failed: token: sk-test-secret-123456",
  ], { stream: { write: (chunk) => chunks.push(chunk) } });
  const output = chunks.join("");
  for (const code of [
    "evolution_governance_usage_error",
    "evolution_governance_required_file_missing",
    "evolution_governance_required_snippet_missing",
    "evolution_governance_source_audit_incomplete",
    "evolution_governance_ledger_invalid",
    "evolution_governance_public_versions_invalid",
    "evolution_governance_fixture_unlisted",
    "evolution_governance_public_surface_baseline_invalid",
    "evolution_governance_fixture_privacy_leak",
    "evolution_governance_surface_diff_failed",
  ]) {
    if (!output.includes(`code: ${code}`)) errors.push(`self-test missing ${code}`);
  }
  if (!output.includes("suggestion: Restore the required evolution doc")) errors.push("self-test missing actionable suggestion");
  if (output.includes("/Users/example") || output.includes("sk-test-secret-123456")) errors.push("self-test leaked private data");
}

if (errors.length > 0) {
  printErrors(errors);
  process.exit(1);
}

console.log("evolution governance check passed");

function currentPublicSurfaceDiff(options = {}) {
  const code = `
    import fs from "node:fs";
    import {
      clawCliCommandRegistry,
      clawEvolutionLedgerSchema,
      clawEvolutionPublicSurfaceBaselineSchema,
      clawPersistentSurfaceRegistry,
      createEvolutionPublicSurfaceBaseline,
      diffEvolutionPublicSurfaceBaseline,
    } from "./packages/clawjs-core/src/index.ts";
    const baseline = clawEvolutionPublicSurfaceBaselineSchema.parse(JSON.parse(fs.readFileSync("docs/evolution/public-surface-baseline.json", "utf8")));
    const ledger = clawEvolutionLedgerSchema.parse(JSON.parse(fs.readFileSync("docs/evolution/baseline.json", "utf8")));
    const cliCommands = ${options.simulateMissingCliCommand ? "clawCliCommandRegistry.commands.filter((command) => command.name !== \"host\")" : "clawCliCommandRegistry.commands"};
    const current = createEvolutionPublicSurfaceBaseline({
      generatedAt: baseline.generatedAt,
      surfaces: clawPersistentSurfaceRegistry.nodes,
      cliCommands,
    });
    process.stdout.write(JSON.stringify(diffEvolutionPublicSurfaceBaseline({ baseline, current, ledger })));
  `;
  const result = spawnSync(process.execPath, ["--import", "tsx", "-e", code], {
    cwd: rootDir,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
    errors.push(`public surface baseline diff failed${output ? `:\n${output}` : ""}`);
    return null;
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    errors.push("public surface baseline diff output must be valid JSON");
    return null;
  }
}
