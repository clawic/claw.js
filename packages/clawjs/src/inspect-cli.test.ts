import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import Database from "better-sqlite3";
import { test } from "vitest";
import assert from "node:assert/strict";
import { clawEventsPath, remoteSyncRequiredRouteIds } from "@clawjs/core";

import { CLI_EXIT_OK, CLI_EXIT_USAGE } from "./cli-errors.ts";
import { ensureV1MainSchema } from "./v1-data-core.ts";
import { withPatchedEnv } from "./index-test-utils.ts";
import {
  expectedInspectSyncRouteIds,
  expectedRemoteApiMethodRoutes,
  expectedRemoteClassificationEntries,
  expectedRemoteSafeClassificationIds,
  expectedSyncDriverCommands,
  expectedSyncDriverLateralDomains,
  expectedSyncDriverRequiredRouteIds,
  expectedSyncDriverRouteIds,
  expectedSyncDrivers,
  parseCliJson,
  runCliCapture,
} from "./inspect-cli-test-support.ts";

const CANONICAL_CAPABILITY_SURFACES = ["sdk", "cli", "serviceApi", "mcp", "relay", "hostBridge"];

function assertCompleteResolvedSurfaces(
  capabilities: Array<{ id: string; surfaces: Array<{ surface: string; status: string; ref?: string }> }>,
): void {
  for (const capability of capabilities) {
    assert.deepEqual(capability.surfaces.map((surface) => surface.surface), CANONICAL_CAPABILITY_SURFACES, capability.id);
    for (const surface of capability.surfaces) {
      assert.notEqual(surface.status, "pending", `${capability.id}:${surface.surface}`);
      if (surface.status === "available") {
        assert.equal(Boolean(surface.ref), true, `${capability.id}:${surface.surface}`);
      } else {
        assert.equal(surface.ref, undefined, `${capability.id}:${surface.surface}`);
      }
    }
  }
}

test("runCli exposes the generated stable surface inspection CLI", async () => {
  const allHelp = await runCliCapture(["--help", "--all"], process.cwd());
  assert.equal(allHelp.code, CLI_EXIT_OK);
  assert.match(allHelp.stdout, /^\s+inspect\s+canonical/m);
  const inspectHelp = await runCliCapture(["inspect", "--help"], process.cwd());
  assert.equal(inspectHelp.code, CLI_EXIT_OK);
  for (const subcommand of ["command-intents", "remote-sync", "version-governance", "custom-app-sdk", "surfaces", "surface-parity"]) {
    assert.match(inspectHelp.stdout, new RegExp(`\\b${subcommand}\\b`));
  }

  const tree = await runCliCapture(["inspect", "tree", "--json"], process.cwd());
  assert.equal(tree.code, CLI_EXIT_OK);
  const treeEnvelope = parseCliJson<{ version: number; nodes: Array<{ id: string }> }>(tree.stdout);
  assert.equal(treeEnvelope.ok, true);
  assert.equal(treeEnvelope.meta.canonicalCommand, "inspect");
  assert.equal(treeEnvelope.meta.subcommand, "tree");
  const treePayload = treeEnvelope.data;
  assert.equal(treePayload.version, 1);
  assert.equal(treePayload.nodes.some((node: { id: string }) => node.id === "claw.database.core"), true);
  assert.equal(treePayload.nodes.some((node: { id: string }) => node.id === "claw.database.monitor.table.metric_samples"), true);
  assert.equal(treePayload.nodes.some((node: { id: string }) => node.id === "claw.database.monitor.table.metric_incidents"), true);
  assert.equal(treePayload.nodes.some((node: { id: string }) => node.id === "claw.contracts"), true);

  const maturity = await runCliCapture(["inspect", "maturity", "--json"], process.cwd());
  assert.equal(maturity.code, CLI_EXIT_OK);
  const maturityPayload = parseCliJson<{
    defaultMaturity: string;
    blockedCode: string;
    audit: { ok: boolean };
    entries: Array<{ id: string; maturity: string; activationPolicy: string; promotionDecision?: { ref: string } }>;
  }>(maturity.stdout).data;
  assert.equal(maturityPayload.defaultMaturity, "incomplete");
  assert.equal(maturityPayload.blockedCode, "maturity_blocked");
  assert.equal(maturityPayload.audit.ok, true);
  assert.equal(maturityPayload.entries.some((entry) => entry.id === "claw.shell.core" && entry.maturity === "stable" && Boolean(entry.promotionDecision?.ref)), true);
  assert.equal(maturityPayload.entries.some((entry) => entry.id === "system.telemetry.cpu.monitoring" && entry.maturity === "experimental" && entry.activationPolicy === "opt_in"), true);

  const canonicity = await runCliCapture(["inspect", "canonicity", "--json"], process.cwd());
  assert.equal(canonicity.code, CLI_EXIT_OK);
  const canonicityPayload = parseCliJson<{
    telemetryDefault?: string;
    packets: Array<{ id: string; targetId: string; claimType: string; stage: string; telemetryDefault: string }>;
    audit: { validation: string; telemetryDefault: string };
  }>(canonicity.stdout).data;
  assert.equal(canonicityPayload.audit.validation, "scripts/adoption-canonicity-check.mjs");
  assert.equal(canonicityPayload.audit.telemetryDefault, "disabled");
  assert.equal(canonicityPayload.packets.some((packet) => packet.id === "claw-shell-core-stable-2026-05-21" && packet.targetId === "claw.shell.core" && packet.claimType === "stable_capability" && packet.stage === "understandable" && packet.telemetryDefault === "disabled"), true);

  const maturityCommand = await runCliCapture(["maturity", "show", "system.telemetry", "--json"], process.cwd());
  assert.equal(maturityCommand.code, CLI_EXIT_OK);
  const maturityCommandEnvelope = parseCliJson<{ entries: Array<{ id: string; parentId?: string; maturity: string }> }>(maturityCommand.stdout);
  assert.equal(maturityCommandEnvelope.meta.canonicalCommand, "maturity");
  assert.equal(maturityCommandEnvelope.meta.subcommand, "show");
  const maturityCommandPayload = maturityCommandEnvelope.data;
  assert.equal(maturityCommandPayload.entries.some((entry) => entry.id === "system.telemetry" && entry.maturity === "experimental"), true);
  assert.equal(maturityCommandPayload.entries.some((entry) => entry.parentId === "system.telemetry"), true);

  const maturityAudit = await runCliCapture(["maturity", "audit", "--json"], process.cwd());
  assert.equal(maturityAudit.code, CLI_EXIT_OK);
  const maturityAuditEnvelope = parseCliJson<{ ok: boolean; failures: string[]; checkedEntries: number }>(maturityAudit.stdout);
  assert.equal(maturityAuditEnvelope.meta.canonicalCommand, "maturity");
  assert.equal(maturityAuditEnvelope.meta.subcommand, "audit");
  assert.equal(maturityAuditEnvelope.data.ok, true);
  assert.equal(maturityAuditEnvelope.data.failures.length, 0);
  assert.equal(maturityAuditEnvelope.data.checkedEntries > 0, true);

  const maturityTier = await runCliCapture(["maturity", "tier", "--json"], process.cwd());
  assert.equal(maturityTier.code, CLI_EXIT_OK);
  const maturityTierEnvelope = parseCliJson<{ activationTierOrder: string[]; blockedCode: string }>(maturityTier.stdout);
  assert.equal(maturityTierEnvelope.meta.canonicalCommand, "maturity");
  assert.equal(maturityTierEnvelope.meta.subcommand, "tier");
  assert.deepEqual(maturityTierEnvelope.data.activationTierOrder, ["stable", "beta", "experimental", "dev"]);
  assert.equal(maturityTierEnvelope.data.blockedCode, "maturity_blocked");

  const show = await runCliCapture(["inspect", "show", "/database/core", "--json"], process.cwd());
  assert.equal(show.code, CLI_EXIT_OK);
  const coreDatabase = parseCliJson<{ id: string; path: string; incomingEdges?: unknown[]; outgoingEdges?: unknown[]; routes?: unknown[] }>(show.stdout).data;
  assert.equal(coreDatabase.id, "claw.database.core");
  assert.equal(coreDatabase.path, "~/.claw/data/core.sqlite");
  assert.equal(Array.isArray(coreDatabase.incomingEdges), true);
  assert.equal(Array.isArray(coreDatabase.outgoingEdges), true);
  assert.equal(Array.isArray(coreDatabase.routes), true);

  const coordinationShow = await runCliCapture(["inspect", "show", "claw.database.agentCoordination", "--json"], process.cwd());
  assert.equal(coordinationShow.code, CLI_EXIT_OK);
  const coordinationDatabase = parseCliJson<{ id: string; path: string; resourceContract: { storage: string; validation: string } }>(coordinationShow.stdout).data;
  assert.equal(coordinationDatabase.id, "claw.database.agentCoordination");
  assert.equal(coordinationDatabase.path, "~/.claw/state/agent-coordination.sqlite");
  assert.match(coordinationDatabase.resourceContract.storage, /SQLite/);

  const narrativeShow = await runCliCapture(["inspect", "show", "claw.contracts", "--json"], process.cwd());
  assert.equal(narrativeShow.code, CLI_EXIT_OK);
  const narrativeSurface = parseCliJson<{
    id: string;
    surfaceNarrative: {
      concept: string;
      authorizingDecision: { ref: string; path: string };
      completingSurface: { human: string; programmatic: string };
      nonInference: string;
    };
    resourceContract: { startup: string; idle: string; memory: string; streaming: string; storage: string; hotPath: string; scale: string; validation: string };
  }>(narrativeShow.stdout).data;
  assert.equal(narrativeSurface.id, "claw.contracts");
  assert.match(narrativeSurface.surfaceNarrative.concept, /Stable surface registry/);
  assert.equal(narrativeSurface.surfaceNarrative.authorizingDecision.path, "docs/adr/0004-persistent-surface-registry-and-inspection.md");
  assert.match(narrativeSurface.surfaceNarrative.completingSurface.programmatic, /claw inspect/);
  assert.match(narrativeSurface.surfaceNarrative.nonInference, /does not by itself authorize/);
  assert.match(narrativeSurface.resourceContract.startup, /static registry/);
  assert.match(narrativeSurface.resourceContract.validation, /surface-resource-contract-guard/);

  const narrativeRoute = await runCliCapture(["inspect", "route", "chat.localDesktop", "--json"], process.cwd());
  assert.equal(narrativeRoute.code, CLI_EXIT_OK);
  const narrativeRoutePayload = parseCliJson<{
    id: string;
    surfaceNarrative: { authorizingDecision: { path: string }; completingSurface: { human: string; programmatic: string } };
    resourceContract: { streaming: string; hotPath: string; validation: string };
  }>(narrativeRoute.stdout).data;
  assert.equal(narrativeRoutePayload.id, "chat.localDesktop");
  assert.equal(narrativeRoutePayload.surfaceNarrative.authorizingDecision.path, "docs/adr/0049-surface-route-graph.md");
  assert.match(narrativeRoutePayload.surfaceNarrative.completingSurface.human, /Clawix macOS agent chat UI/);
  assert.match(narrativeRoutePayload.resourceContract.streaming, /cancellation/);
  assert.match(narrativeRoutePayload.resourceContract.hotPath, /UI body/);

  for (const routeId of ["chat.companionBridge", "chat.remoteRelay"]) {
    const criticalChatRoute = await runCliCapture(["inspect", "route", routeId, "--json"], process.cwd());
    assert.equal(criticalChatRoute.code, CLI_EXIT_OK);
    const criticalChatPayload = parseCliJson<{
      id: string;
      surfaceNarrative?: { authorizingDecision: { path: string }; nonInference: string };
      resourceContract?: { startup: string; streaming: string; validation: string };
    }>(criticalChatRoute.stdout).data;
    assert.equal(criticalChatPayload.id, routeId);
    assert.equal(criticalChatPayload.surfaceNarrative?.authorizingDecision.path, "docs/adr/0049-surface-route-graph.md");
    assert.match(criticalChatPayload.surfaceNarrative?.nonInference ?? "", /does not/);
    assert.match(criticalChatPayload.resourceContract?.startup ?? "", /start/i);
    assert.match(criticalChatPayload.resourceContract?.streaming ?? "", /cancellation/);
    assert.match(criticalChatPayload.resourceContract?.validation ?? "", /inspect-cli\.test\.ts/);
  }

  const markdown = await runCliCapture(["inspect", "render", "--format", "markdown"], process.cwd());
  assert.equal(markdown.code, CLI_EXIT_OK);
  assert.match(markdown.stdout, /Generated from `claw inspect render --format markdown`/);
  assert.match(markdown.stdout, /# Claw stable surface/);
  assert.match(markdown.stdout, /Human \| Programmatic \| Gaps/);
  assert.match(markdown.stdout, /```mermaid/);

  const mermaid = await runCliCapture(["inspect", "render", "--format", "mermaid"], process.cwd());
  assert.equal(mermaid.code, CLI_EXIT_OK);
  assert.match(mermaid.stdout, /^flowchart TD/);
  assert.match(mermaid.stdout, /claw_database_core/);
  assert.match(mermaid.stdout, /claw_relay/);
});

test("runCli exposes pre-v1 version governance through inspect", async () => {
  const governance = await runCliCapture(["inspect", "version-governance", "--json"], process.cwd());
  assert.equal(governance.code, CLI_EXIT_OK);
  const payload = parseCliJson<{
    phase: string;
    branchPolicy: string;
    sourceOfTruth: string;
    freezeTrigger: { kind: string; examples: string[] };
    approvalGate: { requiredForOwnedPublicContracts: boolean; blockedWithoutApproval: string[] };
    changesets: { mode: string; existingBaseline: string; ordinaryWorkCreatesChangesets: boolean };
    ownedVersionPolicy: { normalizeAggressively: boolean; blockedPatterns: string[] };
    externalAllowlist: string[];
    surface: { id: string; stability: string } | null;
  }>(governance.stdout).data;
  assert.equal(payload.phase, "pre_v1_mutable");
  assert.equal(payload.branchPolicy, "main_mutable");
  assert.equal(payload.sourceOfTruth, "clawjs");
  assert.equal(payload.freezeTrigger.kind, "explicit_user_instruction");
  assert.equal(payload.freezeTrigger.examples.includes("congela V1"), true);
  assert.equal(payload.approvalGate.requiredForOwnedPublicContracts, true);
  assert.equal(payload.approvalGate.blockedWithoutApproval.includes("new_changeset_bump"), true);
  assert.equal(payload.changesets.mode, "frozen_until_freeze");
  assert.equal(payload.changesets.ordinaryWorkCreatesChangesets, false);
  assert.equal(payload.ownedVersionPolicy.normalizeAggressively, true);
  assert.equal(payload.externalAllowlist.includes("third_party_api_versions"), true);
  assert.equal(payload.surface?.id, "claw.versionGovernance.preV1");
  assert.equal(payload.surface?.stability, "preV1Reset");

  const why = await runCliCapture(["inspect", "why", "claw.versionGovernance.preV1", "--json"], process.cwd());
  assert.equal(why.code, CLI_EXIT_OK);
  const whyPayload = parseCliJson<{ type: string; id: string; notes: string }>(why.stdout).data;
  assert.equal(whyPayload.type, "surfaceNode");
  assert.equal(whyPayload.id, "claw.versionGovernance.preV1");
  assert.match(whyPayload.notes, /Owned version bumps require explicit user approval/);
});

test("runCli explains discoverability artifacts through inspect why", async () => {
  const result = await runCliCapture(["inspect", "why", "adr:discoverability-meta-code-routing", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK, result.stderr || result.stdout);
  const payload = parseCliJson<{
    type: string;
    id: string;
    canonicalName: string;
    canonicalSource: string;
    searchQueries: Array<{ query: string; expectPath: string }>;
  }>(result.stdout).data;
  assert.equal(payload.type, "discoverabilityArtifact");
  assert.equal(payload.id, "discoverability-contract");
  assert.equal(payload.canonicalName, "adr:discoverability-meta-code-routing");
  assert.equal(payload.canonicalSource, "docs/adr/0017-discoverability-and-meta-code-routing.md");
  assert.equal(payload.searchQueries.some((query) => query.query === "discoverability" && query.expectPath === "docs/adr/0017-discoverability-and-meta-code-routing.md"), true);
});

test("runCli explains inspect subcommands through inspect why", async () => {
  const result = await runCliCapture(["inspect", "why", "surface-parity", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK, result.stderr || result.stdout);
  const payload = parseCliJson<{
    type: string;
    name: string;
    canonicalName: string;
    subcommand: string;
    source: { file: string; symbol?: string };
    tests: string[];
  }>(result.stdout).data;
  assert.equal(payload.type, "inspectSubcommand");
  assert.equal(payload.name, "inspect surface-parity");
  assert.equal(payload.canonicalName, "inspect");
  assert.equal(payload.subcommand, "surface-parity");
  assert.equal(payload.source.file, "packages/clawjs/src/inspect-cli.ts");
  assert.equal(payload.tests.includes("packages/clawjs/src/inspect-cli.test.ts"), true);
});

test("runCli exposes evolution policy through inspect", async () => {
  const evolution = await runCliCapture(["inspect", "evolution", "--json"], process.cwd());
  assert.equal(evolution.code, CLI_EXIT_OK);
  const payload = parseCliJson<{
    policy: { sourceOfTruth: string; postV1Migration: string; rescueCore: string };
    surfaces: Array<{ id: string }>;
  }>(evolution.stdout).data;
  assert.equal(payload.policy.sourceOfTruth, "clawjs");
  assert.equal(payload.policy.postV1Migration, "step_by_step_all_public_versions");
  assert.equal(payload.policy.rescueCore, "launch_chat_repair");
  assert.equal(payload.surfaces.some((surface) => surface.id === "claw.schema.evolutionRecord.v1"), true);

  const why = await runCliCapture(["inspect", "why", "claw.schema.evolutionRecord.v1", "--json"], process.cwd());
  assert.equal(why.code, CLI_EXIT_OK);
  const whyPayload = parseCliJson<{ type: string; id: string; notes: string }>(why.stdout).data;
  assert.equal(whyPayload.type, "surfaceNode");
  assert.equal(whyPayload.id, "claw.schema.evolutionRecord.v1");
  assert.match(whyPayload.notes, /rescue policy/);
});

test("runCli exposes governance model invariants through inspect", async () => {
  const governance = await runCliCapture(["inspect", "governance", "--json"], process.cwd());
  assert.equal(governance.code, CLI_EXIT_OK);
  const payload = parseCliJson<{
    model: { principalKinds: string[]; entityKinds: string[]; scopeKinds: string[]; capabilities: string[] };
    invariants: string[];
    sample: {
      hierarchyDoesNotGrantRead: { allowed: boolean; reasons: string[] };
      controlWithoutRead: { allowed: boolean; matchedGrantIds: string[] };
      delegationIntersection: { allowed: boolean; matchedGrantIds: string[] };
    };
    tests: string[];
  }>(governance.stdout).data;
  assert.equal(payload.model.principalKinds.includes("agent"), true);
  assert.equal(payload.model.entityKinds.includes("organization"), true);
  assert.equal(payload.model.scopeKinds.includes("project"), true);
  assert.equal(payload.model.capabilities.includes("control"), true);
  assert.equal(payload.invariants.includes("membership and hierarchy do not imply read access"), true);
  assert.deepEqual(payload.sample.hierarchyDoesNotGrantRead, { allowed: false, reasons: ["no_explicit_grant"], matchedGrantIds: [], matchedRestrictionIds: [], implicitLocal: false });
  assert.equal(payload.sample.controlWithoutRead.allowed, true);
  assert.deepEqual(payload.sample.controlWithoutRead.matchedGrantIds, ["grant.control"]);
  assert.equal(payload.sample.delegationIntersection.allowed, true);
  assert.deepEqual(payload.sample.delegationIntersection.matchedGrantIds, ["grant.parent", "grant.child"]);
  assert.equal(payload.tests.includes("packages/clawjs-core/src/governance.test.ts"), true);
});

test("runCli exposes custom app SDK read contracts through inspect", async () => {
  const inspected = await runCliCapture(["inspect", "custom-app-sdk", "--json"], process.cwd());
  assert.equal(inspected.code, CLI_EXIT_OK, inspected.stderr || inspected.stdout);
  const payload = parseCliJson<{
    cliRole: string;
    richUiRuntime: string;
    executionBoundary: {
      kind: string;
      executesCapabilityCalls: boolean;
      richUiExecutionPath: string;
      nonExecutableSurfaces: string[];
      dbSearchExecution: string;
    };
    riskMap: { authorityModel: string; ordinaryAccess: string[]; approvalRequired: string[] };
    schemaRefs: string[];
    referencedSchemaRefs: string[];
    missingSchemaRefs: string[];
    capabilities: Array<{
      id: string;
      inputSchemaRef: string;
      outputSchemaRef: string;
      eventSchemaRefs?: { cancel: string; progress: string; partial: string };
      redactionPolicyRef?: string;
      dispatch?: { status: string; mode: string; approvalRequired: boolean; runner: string; externalValidation?: string };
      surfaces: Array<{ surface: string; status: string; ref?: string }>;
    }>;
  }>(inspected.stdout).data;

  assert.equal(payload.cliRole, "inspection_validation_fallback_json");
  assert.equal(payload.richUiRuntime, "sdk_host_bridge_not_cli_process");
  assert.equal(payload.executionBoundary.kind, "metadata_only_contract_catalog");
  assert.equal(payload.executionBoundary.executesCapabilityCalls, false);
  assert.equal(payload.executionBoundary.richUiExecutionPath, "sdk_host_bridge");
  assert.equal(payload.executionBoundary.nonExecutableSurfaces.includes("cli.inspect"), true);
  assert.equal(payload.executionBoundary.dbSearchExecution, "host_bridge_only");
  assert.equal(payload.riskMap.authorityModel, "localWideReadsHighRiskApproval");
  assert.deepEqual(payload.missingSchemaRefs, []);
  assert.equal(payload.schemaRefs.includes("claw.search.query.v1"), true);
  assert.equal(payload.schemaRefs.includes("claw.mac.actionRequest.v1"), true);
  assert.equal(payload.schemaRefs.includes("claw.customApp.request.partial.v1"), true);
  assert.equal(payload.referencedSchemaRefs.includes("claw.actions.invoke.v1"), true);
  assertCompleteResolvedSurfaces(payload.capabilities);

  const search = payload.capabilities.find((capability) => capability.id === "search.query");
  const db = payload.capabilities.find((capability) => capability.id === "db.query");
  const resources = payload.capabilities.find((capability) => capability.id === "resources.read");
  const telemetrySnapshot = payload.capabilities.find((capability) => capability.id === "system.telemetry.snapshot");
  const telemetryHistory = payload.capabilities.find((capability) => capability.id === "system.telemetry.history");
  const telemetryMetrics = payload.capabilities.find((capability) => capability.id === "system.telemetry.metrics");
  const telemetryWidgets = payload.capabilities.find((capability) => capability.id === "system.telemetry.widgets");
  const telemetryProviders = payload.capabilities.find((capability) => capability.id === "system.telemetry.providers");
  const telemetryControlPlan = payload.capabilities.find((capability) => capability.id === "system.telemetry.control.plan");
  const mac = payload.capabilities.find((capability) => capability.id === "mac.action.plan");
  const secrets = payload.capabilities.find((capability) => capability.id === "secrets.broker");
  assert.equal(search?.inputSchemaRef, "claw.search.query.v1");
  assert.equal(search?.eventSchemaRefs?.partial, "claw.customApp.request.partial.v1");
  assert.equal(db?.outputSchemaRef, "claw.db.records.v1");
  assert.equal(resources?.inputSchemaRef, "claw.resources.read.v1");
  assert.equal(resources?.redactionPolicyRef, "claw.customApps.redaction.v1");
  assert.equal(payload.schemaRefs.includes("claw.system.telemetry.snapshot.v1"), true);
  assert.equal(payload.schemaRefs.includes("claw.system.telemetry.history.v1"), true);
  assert.equal(payload.schemaRefs.includes("claw.system.telemetry.metrics.v1"), true);
  assert.equal(payload.schemaRefs.includes("claw.system.telemetry.widgets.v1"), true);
  assert.equal(payload.schemaRefs.includes("claw.system.telemetry.providers.v1"), true);
  assert.equal(payload.schemaRefs.includes("claw.system.telemetry.controlPlan.v1"), true);
  assert.equal(payload.referencedSchemaRefs.includes("claw.system.telemetry.snapshot.request.v1"), true);
  assert.equal(payload.referencedSchemaRefs.includes("claw.system.telemetry.history.request.v1"), true);
  assert.equal(payload.referencedSchemaRefs.includes("claw.system.telemetry.metrics.request.v1"), true);
  assert.equal(payload.referencedSchemaRefs.includes("claw.system.telemetry.widgets.request.v1"), true);
  assert.equal(payload.referencedSchemaRefs.includes("claw.system.telemetry.providers.request.v1"), true);
  assert.equal(payload.referencedSchemaRefs.includes("claw.system.telemetry.controlPlan.request.v1"), true);
  assert.equal(payload.riskMap.ordinaryAccess.includes("system.telemetry.snapshot"), true);
  assert.equal(payload.riskMap.ordinaryAccess.includes("system.telemetry.history"), true);
  assert.equal(payload.riskMap.ordinaryAccess.includes("system.telemetry.metrics"), true);
  assert.equal(payload.riskMap.ordinaryAccess.includes("system.telemetry.widgets"), true);
  assert.equal(payload.riskMap.ordinaryAccess.includes("system.telemetry.providers"), true);
  assert.equal(payload.riskMap.approvalRequired.includes("system.telemetry.snapshot"), false);
  assert.equal(payload.riskMap.approvalRequired.includes("system.telemetry.history"), false);
  assert.equal(payload.riskMap.approvalRequired.includes("system.telemetry.control.plan"), true);
  assert.equal(telemetrySnapshot?.inputSchemaRef, "claw.system.telemetry.snapshot.request.v1");
  assert.equal(telemetrySnapshot?.outputSchemaRef, "claw.system.telemetry.snapshot.v1");
  assert.equal(telemetrySnapshot?.redactionPolicyRef, "claw.customApps.redaction.v1");
  assert.equal(telemetrySnapshot?.surfaces.some((surface) => surface.surface === "cli" && surface.status === "available" && surface.ref === "claw system snapshot --json"), true);
  assert.equal(telemetryHistory?.inputSchemaRef, "claw.system.telemetry.history.request.v1");
  assert.equal(telemetryHistory?.outputSchemaRef, "claw.system.telemetry.history.v1");
  assert.equal(telemetryHistory?.redactionPolicyRef, "claw.customApps.redaction.v1");
  assert.equal(telemetryHistory?.surfaces.some((surface) => surface.surface === "cli" && surface.status === "available" && surface.ref === "claw system history <metric-key> --range 1h|24h --json"), true);
  assert.equal(telemetryMetrics?.inputSchemaRef, "claw.system.telemetry.metrics.request.v1");
  assert.equal(telemetryMetrics?.outputSchemaRef, "claw.system.telemetry.metrics.v1");
  assert.equal(telemetryMetrics?.surfaces.some((surface) => surface.surface === "cli" && surface.status === "available" && surface.ref === "claw system metrics list --json"), true);
  assert.equal(telemetryWidgets?.inputSchemaRef, "claw.system.telemetry.widgets.request.v1");
  assert.equal(telemetryWidgets?.outputSchemaRef, "claw.system.telemetry.widgets.v1");
  assert.equal(telemetryWidgets?.surfaces.some((surface) => surface.surface === "cli" && surface.status === "available" && surface.ref === "claw system widgets list --json"), true);
  assert.equal(telemetryProviders?.inputSchemaRef, "claw.system.telemetry.providers.request.v1");
  assert.equal(telemetryProviders?.outputSchemaRef, "claw.system.telemetry.providers.v1");
  assert.equal(telemetryProviders?.surfaces.some((surface) => surface.surface === "cli" && surface.status === "available" && surface.ref === "claw system providers list --json"), true);
  assert.equal(telemetryControlPlan?.inputSchemaRef, "claw.system.telemetry.controlPlan.request.v1");
  assert.equal(telemetryControlPlan?.outputSchemaRef, "claw.system.telemetry.controlPlan.v1");
  assert.equal(telemetryControlPlan?.dispatch?.mode, "approvalRequiredPlanOnly");
  assert.equal(telemetryControlPlan?.surfaces.some((surface) => surface.surface === "cli" && surface.status === "available" && surface.ref === "claw system controls plan <control-id> --json"), true);
  assert.equal(mac?.inputSchemaRef, "claw.mac.actionRequest.v1");
  assert.equal(mac?.outputSchemaRef, "claw.mac.actionPlan.v1");
  assert.equal(mac?.dispatch?.mode, "approvalRequiredPlanOnly");
  assert.equal(secrets?.inputSchemaRef, "claw.secrets.broker.v1");
  assert.equal(secrets?.dispatch?.mode, "approvalRequiredNoPlaintextBroker");
  assert.equal(search?.surfaces.some((surface) => surface.surface === "cli" && surface.status === "available"), true);
  assert.equal(search?.dispatch?.mode, "localWideRead");
  assert.equal(payload.riskMap.approvalRequired.includes("actions.invoke"), true);
});

test("runCli exposes surface graph routes and neighbors through inspect", async () => {
  const relay = await runCliCapture(["inspect", "why", "relay", "--json"], process.cwd());
  assert.equal(relay.code, CLI_EXIT_OK);
  const relayWhy = parseCliJson<{ type: string; id: string; name: string }>(relay.stdout).data;
  assert.equal(relayWhy.type, "surfaceNode");
  assert.equal(relayWhy.id, "claw.relay");
  assert.equal(relayWhy.name, "Relay control plane");

  const show = await runCliCapture(["inspect", "show", "claw.relay", "--json"], process.cwd());
  assert.equal(show.code, CLI_EXIT_OK);
  const showPayload = parseCliJson<{
    id: string;
    incomingEdges: Array<{ id: string; type: string; fromId: string }>;
    outgoingEdges: Array<{ id: string; type: string; toId: string }>;
    routes: Array<{ id: string }>;
  }>(show.stdout).data;
  assert.equal(showPayload.id, "claw.relay");
  assert.equal(showPayload.incomingEdges.some((edge) => edge.fromId === "claw.remote.client" && edge.type === "consumes"), true);
  assert.equal(showPayload.outgoingEdges.some((edge) => edge.toId === "claw.relay.connector" && edge.type === "brokers"), true);
  assert.equal(showPayload.routes.some((route) => route.id === "chat.remoteRelay"), true);

  const routes = await runCliCapture(["inspect", "routes", "--json"], process.cwd());
  assert.equal(routes.code, CLI_EXIT_OK);
  const routeList = parseCliJson<Array<{ id: string; steps: Array<{ edgeType: string; fromId: string; toId: string }> }>>(routes.stdout).data;
  assert.deepEqual(routeList.map((route) => route.id).sort(), [
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
  assert.equal(routeList.find((route) => route.id === "chat.localDesktop")?.steps.every((step) => ["owns", "consumes", "exposes", "brokers"].includes(step.edgeType)), true);
  assert.equal(routeList.find((route) => route.id === "agents.externalSupportAssignment")?.steps.some((step) => step.toId === "claw.support.inbox"), true);
  assert.equal(routeList.find((route) => route.id === "cli.commandIntentResolution")?.steps.every((step) => ["owns", "consumes", "exposes", "brokers"].includes(step.edgeType)), true);
  assert.equal(routeList.find((route) => route.id === "mac.directCliAction")?.steps.some((step) => step.toId === "claw.mac.actionBroker"), true);
  assert.equal(routeList.find((route) => route.id === "system.telemetryAgentContext")?.steps.some((step) => step.toId === "claw.database.monitor"), true);
  assert.equal(routeList.find((route) => route.id === "clawix.menuBarSystemIndicators")?.steps.some((step) => step.fromId === "clawix.menuBar.systemIndicators"), true);

  const route = await runCliCapture(["inspect", "route", "chat.remoteRelay", "--json"], process.cwd());
  assert.equal(route.code, CLI_EXIT_OK);
  const remoteRoute = parseCliJson<{ id: string; edges: Array<{ id: string; type: string }>; tests: string[] }>(route.stdout).data;
  assert.equal(remoteRoute.id, "chat.remoteRelay");
  assert.equal(remoteRoute.edges.some((edge) => edge.id === "claw.edge.relay.brokers.connector" && edge.type === "brokers"), true);
  assert.equal(remoteRoute.tests.includes("packages/clawjs/src/inspect-cli.test.ts"), true);

  const commandIntentRoute = await runCliCapture(["inspect", "route", "cli.commandIntentResolution", "--json"], process.cwd());
  assert.equal(commandIntentRoute.code, CLI_EXIT_OK);
  const commandIntentPayload = parseCliJson<{ id: string; edges: Array<{ id: string; type: string }>; tests: string[] }>(commandIntentRoute.stdout).data;
  assert.equal(commandIntentPayload.id, "cli.commandIntentResolution");
  assert.equal(commandIntentPayload.edges.some((edge) => edge.id === "claw.edge.commands.owns.intentLedger" && edge.type === "owns"), true);
  assert.equal(commandIntentPayload.tests.includes("packages/clawjs/src/cli-commands.test.ts"), true);

  const systemTelemetryRoute = await runCliCapture(["inspect", "route", "system.telemetryAgentContext", "--json"], process.cwd());
  assert.equal(systemTelemetryRoute.code, CLI_EXIT_OK);
  const systemTelemetryPayload = parseCliJson<{ id: string; edges: Array<{ id: string; type: string }>; tests: string[]; docs: string[] }>(systemTelemetryRoute.stdout).data;
  assert.equal(systemTelemetryPayload.id, "system.telemetryAgentContext");
  assert.equal(systemTelemetryPayload.edges.some((edge) => edge.id === "claw.edge.system.telemetry.owns.monitor" && edge.type === "owns"), true);
  assert.equal(systemTelemetryPayload.edges.some((edge) => edge.id === "claw.edge.system.telemetry.consumes.contextProviders" && edge.type === "consumes"), true);
  assert.equal(systemTelemetryPayload.tests.includes("packages/clawjs-mcp/src/control-plane.test.ts"), true);
  assert.equal(systemTelemetryPayload.docs.includes("docs/api.md"), true);

  const systemNeighbors = await runCliCapture(["inspect", "neighbors", "claw.systemTelemetry", "--json"], process.cwd());
  assert.equal(systemNeighbors.code, CLI_EXIT_OK);
  const systemNeighborPayload = parseCliJson<{ neighbors: Array<{ id: string }>; routes: Array<{ id: string }> }>(systemNeighbors.stdout).data;
  assert.equal(systemNeighborPayload.neighbors.some((node) => node.id === "claw.cli.command.system"), true);
  assert.equal(systemNeighborPayload.neighbors.some((node) => node.id === "claw.database.monitor"), true);
  assert.equal(systemNeighborPayload.neighbors.some((node) => node.id === "claw.systemTelemetry.contextProviders"), true);
  assert.equal(systemNeighborPayload.routes.some((entry) => entry.id === "system.telemetryAgentContext"), true);

  const neighbors = await runCliCapture(["inspect", "neighbors", "clawix.bridge.local", "--json"], process.cwd());
  assert.equal(neighbors.code, CLI_EXIT_OK);
  const neighborPayload = parseCliJson<{ neighbors: Array<{ id: string }>; routes: Array<{ id: string }> }>(neighbors.stdout).data;
  assert.equal(neighborPayload.neighbors.some((node) => node.id === "claw.daemon.local"), true);
  assert.equal(neighborPayload.routes.some((entry) => entry.id === "chat.companionBridge"), true);

  const gatewayRoute = await runCliCapture(["inspect", "route", "remote.searchGateway", "--json"], process.cwd());
  assert.equal(gatewayRoute.code, CLI_EXIT_OK);
  const gatewayRoutePayload = parseCliJson<{ id: string; edges: Array<{ id: string }>; adrs: string[] }>(gatewayRoute.stdout).data;
  assert.equal(gatewayRoutePayload.id, "remote.searchGateway");
  assert.equal(gatewayRoutePayload.edges.some((edge) => edge.id === "claw.edge.connector.brokers.search"), true);
  assert.equal(gatewayRoutePayload.adrs.includes("docs/adr/0022-remote-gateway-sync-redesign.md"), true);

  const remoteInspect = await runCliCapture(["inspect", "remote", "--json"], process.cwd());
  assert.equal(remoteInspect.code, CLI_EXIT_OK);
  const remoteInspectPayload = parseCliJson<{
    conformance: { status: string; missingRoutes: string[]; decisions: Array<{ decisionId: string }> };
    decisionReview: {
      status: string;
      reviewedCount: number;
      requiredCount: number;
      implementedCount: number;
      externalPendingCount: number;
      missingSourceQaIds: string[];
      blockers: string[];
      writes: boolean;
      items: Array<{ qaId: string; decisionId: string; reviewStatus: string; disposition: string | null; conformanceStatus: string | null; externalPendingRequired: boolean; writes: boolean }>;
    };
    classifications: Array<{ id: string; classification: string; routeIds: string[] }>;
    sync: { authorityClasses: string[]; drivers: string[]; driverCatalog: { status: string; writes: boolean; driverCount: number; requiredDrivers: string[]; coveredDrivers: string[]; requiredRouteIds: string[]; missingDrivers: string[]; missingRouteIds: string[]; authorityModel: string; conflictDefault: string; physicalApplicationStatus: string; entries: Array<{ driver: string; routeId: string; lateralDomains: string[]; manifestBacked: boolean; changelogBacked: boolean; authorityScoped: boolean; partialResourceSupported: boolean; physicalDriverRequired: boolean; commands: string[]; writes: boolean }> }; conflictDefault: string; receiptContracts: string[]; routeIds: string[]; writes: boolean };
    transport: { contract: string; adapterNodeId: string; trustModes: string[]; receiptContract: string; writes: boolean };
    offlineCommand: { routeId: string; status: string; reason: string; enqueued: boolean; retryable: boolean; writes: boolean };
    gaps: Array<{ requirementId: string; status: string; writes: boolean }>;
    externalValidationChecklist: { status: string; writes: boolean; requirementIds: string[]; coverage: { requirementCount: number; coveredRequirementCount: number; missingRequirementIds: string[] }; items: Array<{ requirementId: string; requiredCommand: string; requiredArtifacts: string[]; approvedRunRequired: boolean; physicalEvidenceRequired: boolean; plaintextMaterialIncluded: boolean; writes: boolean }> };
    externalValidationEvidenceTemplate: { status: string; writes: boolean; requirementCount: number; submissionCommand: string; checklistItems: Array<{ requirementId: string }>; evidence: Array<{ requirementId: string; approvedRun: boolean; artifactRefs: string[]; acceptedCriteria: string[]; plaintextMaterialIncluded: boolean; writes: boolean }> };
    externalValidationReadiness: { status: string; writes: boolean; sourceQaReady: boolean; externalEvidenceReady: boolean; sourceQaReviewStatus: string; evidenceCount: number; requiredEvidenceCount: number; missingEvidenceRequirementIds: string[]; clearableExternalRequirementIds: string[]; blockedExternalRequirementIds: string[]; closureGateBlockers: string[]; nextAction: string };
    externalValidationApprovalRequest: { status: string; approvalRequired: boolean; approved: boolean; readinessStatus: string; writes: boolean; requirementIds: string[]; validationDomains: string[]; validationTopologyTargets: string[]; validationRouteIds: string[]; prohibitedActions: string[] };
    externalValidationReport: { status: string; writes: boolean; requirementCount: number; evidenceCount: number; clearableRequirementIds: string[]; blockedRequirementIds: string[]; items: Array<{ requirementId: string; clearable: boolean; status: string; writes: boolean }> };
    sourceQaReviewTemplate: { status: string; writes: boolean; sourceConversationId: string; sourcePlanId: string; requiredSourceQaIds: string[]; externalPendingRequiredSourceQaIds: string[]; reviewCount: number; submissionCommand: string; items: Array<{ qaId: string; decisionKey: string; requirementId: string; reviewed: boolean; disposition: null; evidenceRefs: string[]; reviewedAt: null; writes: boolean }> };
    closureGate: { status: string; writes: boolean; requiredSourceQaIds: string[]; reviewedSourceQaIds: string[]; missingSourceQaIds: string[]; externalPendingRequiredSourceQaIds: string[]; sourceQaReviewStatus: string; sourceQaReviewItems: unknown[]; blockedExternalRequirementIds: string[]; clearableExternalRequirementIds: string[]; blockers: string[]; finalSourceSessionRereadRequired: boolean; sourceSessionRereadCommand: string };
    providerDeviceE2EPlan: { status: string; writes: boolean; requiredDomains: string[]; requiredTopologyTargets: string[]; requiredRouteIds: string[]; requiredExternalPendingIds: string[]; validationSteps: Array<{ domain: string; requiredRouteIds: string[]; requiredExternalPendingIds: string[]; requiredArtifacts: string[]; acceptanceCriteria: string[]; writes: boolean }>; plaintextMaterialIncluded: boolean };
    routeContracts: Array<{ routeId: string; parallelApiAllowed: boolean; writes: boolean }>;
    tests: string[];
  }>(remoteInspect.stdout).data;
  assert.equal(remoteInspectPayload.conformance.status, "baseline_registered");
  assert.deepEqual(remoteInspectPayload.conformance.missingRoutes, []);
  assert.equal(remoteInspectPayload.conformance.decisions.some((entry) => entry.decisionId === "remote_surface_parity"), true);
  assert.equal(remoteInspectPayload.decisionReview.status, "incomplete");
  assert.equal(remoteInspectPayload.decisionReview.reviewedCount, 0);
  assert.equal(remoteInspectPayload.decisionReview.requiredCount, 23);
  assert.equal(remoteInspectPayload.decisionReview.missingSourceQaIds.length, 23);
  assert.equal(remoteInspectPayload.decisionReview.implementedCount, 0);
  assert.equal(remoteInspectPayload.decisionReview.externalPendingCount, 0);
  assert.equal(remoteInspectPayload.decisionReview.blockers.includes("source_qa_review"), true);
  assert.equal(remoteInspectPayload.decisionReview.blockers.includes("external_validation"), true);
  assert.equal(remoteInspectPayload.decisionReview.writes, false);
  assert.equal(remoteInspectPayload.decisionReview.items.length, 23);
  assert.equal(remoteInspectPayload.decisionReview.items.every((entry) => entry.reviewStatus === "missing" && entry.disposition === null && !entry.writes), true);
  assert.equal(remoteInspectPayload.decisionReview.items.some((entry) => entry.qaId === "QA-003" && entry.decisionId === "remote_surface_parity" && entry.conformanceStatus === "must_verify_before_goal_completion"), true);
  assert.equal(remoteInspectPayload.decisionReview.items.some((entry) => entry.qaId === "QA-023" && entry.decisionId === "goal_closure_gate" && entry.conformanceStatus === null), true);
  const expectedRemoteClassifications = expectedRemoteClassificationEntries();
  assert.equal(remoteInspectPayload.classifications.length, expectedRemoteClassifications.length);
  assert.deepEqual(
    remoteInspectPayload.classifications.map((entry) => ({ id: entry.id, classification: entry.classification })),
    expectedRemoteClassifications,
  );
  assert.deepEqual(
    remoteInspectPayload.classifications.filter((entry) => entry.classification === "remote-safe").map((entry) => entry.id),
    expectedRemoteSafeClassificationIds,
  );
  assert.equal(remoteInspectPayload.classifications.some((entry) => entry.classification === "pending" || entry.classification === "blocked"), false);
  assert.deepEqual(remoteInspectPayload.classifications.find((entry) => entry.id === "claw.gateway")?.routeIds, ["remote.chatGateway", "remote.searchGateway", "remote.secretBrokeredOperation", "gateway.headlessAgentHost"]);
  assert.equal(remoteInspectPayload.sync.authorityClasses.includes("joint"), true);
  assert.deepEqual(remoteInspectPayload.sync.drivers, expectedSyncDrivers);
  assert.equal(remoteInspectPayload.sync.conflictDefault, "detect_and_elevate");
  assert.equal(remoteInspectPayload.sync.receiptContracts.includes("SyncAuthorityHandoffReceipt"), true);
  assert.deepEqual(remoteInspectPayload.sync.routeIds, expectedInspectSyncRouteIds);
  assert.equal(remoteInspectPayload.sync.driverCatalog.status, "complete");
  assert.equal(remoteInspectPayload.sync.driverCatalog.writes, false);
  assert.equal(remoteInspectPayload.sync.driverCatalog.driverCount, 11);
  assert.deepEqual(remoteInspectPayload.sync.driverCatalog.requiredDrivers, expectedSyncDrivers);
  assert.deepEqual(remoteInspectPayload.sync.driverCatalog.coveredDrivers, expectedSyncDrivers);
  assert.deepEqual(remoteInspectPayload.sync.driverCatalog.requiredRouteIds, expectedSyncDriverRequiredRouteIds);
  assert.deepEqual(remoteInspectPayload.sync.driverCatalog.missingDrivers, []);
  assert.deepEqual(remoteInspectPayload.sync.driverCatalog.missingRouteIds, []);
  assert.equal(remoteInspectPayload.sync.driverCatalog.authorityModel, "per_resource");
  assert.equal(remoteInspectPayload.sync.driverCatalog.conflictDefault, "detect_and_elevate");
  assert.equal(remoteInspectPayload.sync.driverCatalog.physicalApplicationStatus, "external_pending");
  assert.deepEqual(remoteInspectPayload.sync.driverCatalog.entries.map((entry) => entry.driver), expectedSyncDrivers);
  assert.deepEqual(remoteInspectPayload.sync.driverCatalog.entries.map((entry) => entry.routeId), expectedSyncDriverRouteIds);
  assert.deepEqual(remoteInspectPayload.sync.driverCatalog.entries.map((entry) => entry.lateralDomains), expectedSyncDriverLateralDomains);
  assert.deepEqual(remoteInspectPayload.sync.driverCatalog.entries.map((entry) => entry.commands), expectedSyncDriverCommands);
  assert.deepEqual(remoteInspectPayload.sync.driverCatalog.entries.map((entry) => entry.partialResourceSupported), [false, false, false, false, false, false, true, false, false, false, false]);
  assert.equal(remoteInspectPayload.sync.driverCatalog.entries.every((entry) => entry.manifestBacked && entry.changelogBacked && entry.authorityScoped && entry.physicalDriverRequired && !entry.writes), true);
  assert.equal(remoteInspectPayload.sync.writes, false);
  assert.equal(remoteInspectPayload.transport.contract, "transport_agnostic_iroh_v1_adapter");
  assert.equal(remoteInspectPayload.transport.adapterNodeId, "claw.transport.iroh");
  assert.equal(remoteInspectPayload.transport.trustModes.includes("governed_gateway"), true);
  assert.equal(remoteInspectPayload.transport.receiptContract, "RemoteTransportHandshakeReceipt");
  assert.equal(remoteInspectPayload.transport.writes, false);
  assert.equal(remoteInspectPayload.offlineCommand.routeId, "remote.chatGateway");
  assert.equal(remoteInspectPayload.offlineCommand.status, "failed_fast");
  assert.equal(remoteInspectPayload.offlineCommand.reason, "connector_offline");
  assert.equal(remoteInspectPayload.offlineCommand.enqueued, false);
  assert.equal(remoteInspectPayload.offlineCommand.retryable, true);
  assert.equal(remoteInspectPayload.offlineCommand.writes, false);
  assert.equal(remoteInspectPayload.gaps.some((entry) => entry.requirementId === "physical_iroh_handshake" && entry.status === "external_pending" && entry.writes === false), true);
  assert.equal(remoteInspectPayload.gaps.some((entry) => entry.requirementId === "physical_authority_handoff" && entry.status === "external_pending" && entry.writes === false), true);
  const remoteInspectPendingRequirementIds = remoteInspectPayload.gaps.map((entry) => entry.requirementId);
  assert.equal(remoteInspectPayload.externalValidationChecklist.status, "external_pending");
  assert.equal(remoteInspectPayload.externalValidationChecklist.writes, false);
  assert.equal(remoteInspectPayload.externalValidationChecklist.coverage.requirementCount, remoteInspectPayload.gaps.length);
  assert.equal(remoteInspectPayload.externalValidationChecklist.coverage.coveredRequirementCount, remoteInspectPayload.gaps.length);
  assert.deepEqual(remoteInspectPayload.externalValidationChecklist.coverage.missingRequirementIds, []);
  assert.deepEqual(remoteInspectPayload.externalValidationChecklist.requirementIds, remoteInspectPendingRequirementIds);
  assert.equal(remoteInspectPayload.externalValidationChecklist.requirementIds.includes("provider_device_e2e"), true);
  assert.equal(remoteInspectPayload.externalValidationChecklist.items.some((entry) => entry.requirementId === "physical_iroh_handshake" && entry.requiredCommand.includes("claw nodes heartbeat")), true);
  assert.equal(remoteInspectPayload.externalValidationChecklist.items.some((entry) => entry.requirementId === "provider_device_e2e" && entry.requiredArtifacts.includes("RemoteProviderDeviceE2EValidationPlan")), true);
  assert.equal(remoteInspectPayload.externalValidationChecklist.items.every((entry) => entry.approvedRunRequired && entry.physicalEvidenceRequired && entry.plaintextMaterialIncluded === false && !entry.writes), true);
  assert.equal(remoteInspectPayload.externalValidationEvidenceTemplate.status, "external_pending");
  assert.equal(remoteInspectPayload.externalValidationEvidenceTemplate.writes, false);
  assert.equal(remoteInspectPayload.externalValidationEvidenceTemplate.requirementCount, remoteInspectPayload.gaps.length);
  assert.equal(remoteInspectPayload.externalValidationEvidenceTemplate.checklistItems.length, remoteInspectPayload.gaps.length);
  assert.equal(remoteInspectPayload.externalValidationEvidenceTemplate.evidence.length, remoteInspectPayload.gaps.length);
  assert.deepEqual(remoteInspectPayload.externalValidationEvidenceTemplate.checklistItems.map((entry) => entry.requirementId), remoteInspectPendingRequirementIds);
  assert.deepEqual(remoteInspectPayload.externalValidationEvidenceTemplate.evidence.map((entry) => entry.requirementId), remoteInspectPendingRequirementIds);
  assert.equal(remoteInspectPayload.externalValidationEvidenceTemplate.evidence.every((entry) => !entry.approvedRun && entry.artifactRefs.length === 0 && entry.acceptedCriteria.length === 0 && entry.plaintextMaterialIncluded === false && !entry.writes), true);
  assert.equal(remoteInspectPayload.externalValidationEvidenceTemplate.submissionCommand.includes("claw remote validation-report"), true);
  assert.equal(remoteInspectPayload.externalValidationReadiness.status, "not_ready");
  assert.equal(remoteInspectPayload.externalValidationReadiness.writes, false);
  assert.equal(remoteInspectPayload.externalValidationReadiness.sourceQaReady, false);
  assert.equal(remoteInspectPayload.externalValidationReadiness.externalEvidenceReady, false);
  assert.equal(remoteInspectPayload.externalValidationApprovalRequest.status, "approval_required");
  assert.equal(remoteInspectPayload.externalValidationApprovalRequest.approvalRequired, true);
  assert.equal(remoteInspectPayload.externalValidationApprovalRequest.approved, false);
  assert.equal(remoteInspectPayload.externalValidationApprovalRequest.readinessStatus, "not_ready");
  assert.equal(remoteInspectPayload.externalValidationApprovalRequest.writes, false);
  assert.deepEqual(remoteInspectPayload.externalValidationApprovalRequest.requirementIds, remoteInspectPendingRequirementIds);
  assert.deepEqual(remoteInspectPayload.externalValidationApprovalRequest.validationDomains, ["chat", "search", "sync", "secret_refs", "hosted_agents"]);
  assert.deepEqual(remoteInspectPayload.externalValidationApprovalRequest.validationTopologyTargets, ["personal_mesh", "mac_host", "linux_host", "windows_host", "server_host", "headless_server", "vps_host", "mobile_client", "browser_client", "self_hosted_gateway", "hosted_gateway"]);
  assert.deepEqual(remoteInspectPayload.externalValidationApprovalRequest.validationRouteIds, remoteSyncRequiredRouteIds);
  assert.equal(remoteInspectPayload.externalValidationApprovalRequest.prohibitedActions.some((entry) => entry.includes("plaintext secrets")), true);
  assert.equal(remoteInspectPayload.externalValidationReadiness.sourceQaReviewStatus, "incomplete");
  assert.equal(remoteInspectPayload.externalValidationReadiness.evidenceCount, 0);
  assert.equal(remoteInspectPayload.externalValidationReadiness.requiredEvidenceCount, remoteInspectPayload.gaps.length);
  assert.deepEqual(remoteInspectPayload.externalValidationReadiness.missingEvidenceRequirementIds, remoteInspectPendingRequirementIds);
  assert.deepEqual(remoteInspectPayload.externalValidationReadiness.clearableExternalRequirementIds, []);
  assert.deepEqual(remoteInspectPayload.externalValidationReadiness.blockedExternalRequirementIds, remoteInspectPendingRequirementIds);
  assert.equal(remoteInspectPayload.externalValidationReadiness.closureGateBlockers.includes("source_qa_review"), true);
  assert.equal(remoteInspectPayload.externalValidationReadiness.nextAction.includes("Complete the source Q/A review artifact"), true);
  assert.equal(remoteInspectPayload.externalValidationReport.status, "external_pending");
  assert.equal(remoteInspectPayload.externalValidationReport.writes, false);
  assert.equal(remoteInspectPayload.externalValidationReport.requirementCount, remoteInspectPayload.gaps.length);
  assert.equal(remoteInspectPayload.externalValidationReport.evidenceCount, 0);
  assert.equal(remoteInspectPayload.externalValidationReport.clearableRequirementIds.length, 0);
  assert.deepEqual(remoteInspectPayload.externalValidationReport.blockedRequirementIds, remoteInspectPendingRequirementIds);
  assert.equal(remoteInspectPayload.externalValidationReport.items.every((entry) => !entry.clearable && entry.status === "external_pending" && !entry.writes), true);
  assert.equal(remoteInspectPayload.sourceQaReviewTemplate.status, "incomplete");
  assert.equal(remoteInspectPayload.sourceQaReviewTemplate.writes, false);
  assert.equal(remoteInspectPayload.sourceQaReviewTemplate.sourceConversationId, "source:remote-gateway-sync");
  assert.equal(remoteInspectPayload.sourceQaReviewTemplate.sourcePlanId, "plan:remote-gateway-sync");
  assert.equal(remoteInspectPayload.sourceQaReviewTemplate.reviewCount, 23);
  assert.equal(remoteInspectPayload.sourceQaReviewTemplate.requiredSourceQaIds.length, 23);
  assert.deepEqual(remoteInspectPayload.sourceQaReviewTemplate.externalPendingRequiredSourceQaIds, ["QA-002", "QA-004", "QA-005", "QA-006", "QA-007", "QA-010", "QA-012", "QA-013", "QA-015", "QA-018", "QA-020", "QA-021"]);
  assert.equal(remoteInspectPayload.sourceQaReviewTemplate.items.every((entry) => !entry.reviewed && entry.disposition === null && entry.evidenceRefs.length === 0 && entry.reviewedAt === null && !entry.writes), true);
  assert.equal(remoteInspectPayload.sourceQaReviewTemplate.items.some((entry) => entry.qaId === "QA-023" && entry.decisionKey === "goal_closure_gate"), true);
  assert.equal(remoteInspectPayload.sourceQaReviewTemplate.submissionCommand.includes("claw remote closure-gate"), true);
  assert.equal(remoteInspectPayload.closureGate.status, "blocked");
  assert.equal(remoteInspectPayload.closureGate.writes, false);
  assert.equal(remoteInspectPayload.closureGate.requiredSourceQaIds.length, 23);
  assert.equal(remoteInspectPayload.closureGate.reviewedSourceQaIds.length, 0);
  assert.equal(remoteInspectPayload.closureGate.missingSourceQaIds.length, 23);
  assert.deepEqual(remoteInspectPayload.closureGate.externalPendingRequiredSourceQaIds, remoteInspectPayload.sourceQaReviewTemplate.externalPendingRequiredSourceQaIds);
  assert.equal(remoteInspectPayload.closureGate.sourceQaReviewStatus, "incomplete");
  assert.equal(remoteInspectPayload.closureGate.sourceQaReviewItems.length, 0);
  assert.deepEqual(remoteInspectPayload.closureGate.blockedExternalRequirementIds, remoteInspectPendingRequirementIds);
  assert.equal(remoteInspectPayload.closureGate.clearableExternalRequirementIds.length, 0);
  assert.equal(remoteInspectPayload.closureGate.blockers.includes("source_qa_review"), true);
  assert.equal(remoteInspectPayload.closureGate.blockers.includes("external_validation"), true);
  assert.equal(remoteInspectPayload.closureGate.finalSourceSessionRereadRequired, true);
  assert.equal(remoteInspectPayload.closureGate.sourceSessionRereadCommand, "REMOTE_SYNC_SOURCE_SESSION=<local-source-session-jsonl> npm run test:remote-sync-source-session");
  const remoteInspectText = await runCliCapture(["inspect", "remote"], process.cwd());
  assert.equal(remoteInspectText.code, CLI_EXIT_OK);
  assert.equal(remoteInspectText.stdout.includes("decisionReview\tincomplete 0/23 implemented=0 external=0 blockers=source_qa_review,external_validation"), true);
  assert.equal(remoteInspectText.stdout.includes("validationReadiness\tnot_ready sourceQa=incomplete evidence=external_pending blockers=source_qa_review,external_validation"), true);
  assert.equal(remoteInspectText.stdout.includes("approvalRequest\tapproval_required readiness=not_ready approved=false"), true);
  assert.equal(remoteInspectText.stdout.includes("closureGate\tblocked sourceQa=incomplete blockers=source_qa_review,external_validation finalReread=required"), true);
  const remoteInspectWithArtifacts = await runCliCapture([
    "inspect",
    "remote",
    "--source-qa-review-file",
    "docs/governance/remote-gateway-sync/source-review.json",
    "--external-validation-file",
    "docs/governance/remote-gateway-sync/external-validation-evidence.json",
    "--json",
  ], process.cwd());
  assert.equal(remoteInspectWithArtifacts.code, CLI_EXIT_OK);
  const remoteInspectWithArtifactsPayload = parseCliJson<{
    decisionReview: {
      status: string;
      reviewedCount: number;
      requiredCount: number;
      implementedCount: number;
      externalPendingCount: number;
      missingSourceQaIds: string[];
      blockers: string[];
      writes: boolean;
      items: Array<{ qaId: string; decisionId: string; reviewStatus: string; disposition: string | null; conformanceStatus: string | null; externalPendingRequired: boolean; writes: boolean }>;
    };
    externalValidationReadiness: { status: string; sourceQaReady: boolean; externalEvidenceReady: boolean; closureGateBlockers: string[]; blockedExternalRequirementIds: string[] };
    externalValidationApprovalRequest: { status: string; approvalRequired: boolean; approved: boolean; readinessStatus: string; requirementIds: string[]; validationRouteIds: string[]; writes: boolean };
    externalValidationReport: { status: string; clearableRequirementIds: string[]; blockedRequirementIds: string[]; writes: boolean };
    closureGate: { sourceQaReviewStatus: string; missingSourceQaIds: string[]; blockers: string[]; blockedExternalRequirementIds: string[]; finalSourceSessionRereadRequired: boolean; sourceSessionRereadCommand: string; writes: boolean };
  }>(remoteInspectWithArtifacts.stdout).data;
  assert.equal(remoteInspectWithArtifactsPayload.decisionReview.status, "complete");
  assert.equal(remoteInspectWithArtifactsPayload.decisionReview.reviewedCount, 23);
  assert.equal(remoteInspectWithArtifactsPayload.decisionReview.requiredCount, 23);
  assert.deepEqual(remoteInspectWithArtifactsPayload.decisionReview.missingSourceQaIds, []);
  assert.equal(remoteInspectWithArtifactsPayload.decisionReview.implementedCount, 11);
  assert.equal(remoteInspectWithArtifactsPayload.decisionReview.externalPendingCount, 12);
  assert.deepEqual(remoteInspectWithArtifactsPayload.decisionReview.blockers, ["external_validation"]);
  assert.equal(remoteInspectWithArtifactsPayload.decisionReview.writes, false);
  assert.equal(remoteInspectWithArtifactsPayload.decisionReview.items.every((entry) => entry.reviewStatus === "reviewed" && entry.disposition !== null && !entry.writes), true);
  assert.equal(remoteInspectWithArtifactsPayload.decisionReview.items.some((entry) => entry.qaId === "QA-006" && entry.decisionId === "remote_secrets_model" && entry.disposition === "external_pending" && entry.externalPendingRequired), true);
  assert.equal(remoteInspectWithArtifactsPayload.decisionReview.items.some((entry) => entry.qaId === "QA-023" && entry.decisionId === "goal_closure_gate" && entry.disposition === "implemented" && entry.conformanceStatus === null), true);
  assert.equal(remoteInspectWithArtifactsPayload.externalValidationReadiness.status, "ready_for_approved_run");
  assert.equal(remoteInspectWithArtifactsPayload.externalValidationReadiness.sourceQaReady, true);
  assert.equal(remoteInspectWithArtifactsPayload.externalValidationReadiness.externalEvidenceReady, true);
  assert.deepEqual(remoteInspectWithArtifactsPayload.externalValidationReadiness.closureGateBlockers, ["external_validation"]);
  assert.deepEqual(remoteInspectWithArtifactsPayload.externalValidationReadiness.blockedExternalRequirementIds, remoteInspectPendingRequirementIds);
  assert.equal(remoteInspectWithArtifactsPayload.externalValidationApprovalRequest.status, "approval_required");
  assert.equal(remoteInspectWithArtifactsPayload.externalValidationApprovalRequest.approvalRequired, true);
  assert.equal(remoteInspectWithArtifactsPayload.externalValidationApprovalRequest.approved, false);
  assert.equal(remoteInspectWithArtifactsPayload.externalValidationApprovalRequest.readinessStatus, "ready_for_approved_run");
  assert.deepEqual(remoteInspectWithArtifactsPayload.externalValidationApprovalRequest.requirementIds, remoteInspectPendingRequirementIds);
  assert.deepEqual(remoteInspectWithArtifactsPayload.externalValidationApprovalRequest.validationRouteIds, remoteSyncRequiredRouteIds);
  assert.equal(remoteInspectWithArtifactsPayload.externalValidationApprovalRequest.writes, false);
  assert.equal(remoteInspectWithArtifactsPayload.externalValidationReport.status, "external_pending");
  assert.deepEqual(remoteInspectWithArtifactsPayload.externalValidationReport.clearableRequirementIds, []);
  assert.deepEqual(remoteInspectWithArtifactsPayload.externalValidationReport.blockedRequirementIds, remoteInspectPendingRequirementIds);
  assert.equal(remoteInspectWithArtifactsPayload.externalValidationReport.writes, false);
  assert.equal(remoteInspectWithArtifactsPayload.closureGate.sourceQaReviewStatus, "complete");
  assert.deepEqual(remoteInspectWithArtifactsPayload.closureGate.missingSourceQaIds, []);
  assert.deepEqual(remoteInspectWithArtifactsPayload.closureGate.blockers, ["external_validation"]);
  assert.deepEqual(remoteInspectWithArtifactsPayload.closureGate.blockedExternalRequirementIds, remoteInspectPendingRequirementIds);
  assert.equal(remoteInspectWithArtifactsPayload.closureGate.finalSourceSessionRereadRequired, true);
  assert.equal(remoteInspectWithArtifactsPayload.closureGate.sourceSessionRereadCommand, "REMOTE_SYNC_SOURCE_SESSION=<local-source-session-jsonl> npm run test:remote-sync-source-session");
  assert.equal(remoteInspectWithArtifactsPayload.closureGate.writes, false);
  const remoteInspectWithArtifactsText = await runCliCapture([
    "inspect",
    "remote",
    "--source-qa-review-file",
    "docs/governance/remote-gateway-sync/source-review.json",
    "--external-validation-file",
    "docs/governance/remote-gateway-sync/external-validation-evidence.json",
  ], process.cwd());
  assert.equal(remoteInspectWithArtifactsText.code, CLI_EXIT_OK);
  assert.equal(remoteInspectWithArtifactsText.stdout.includes("decisionReview\tcomplete 23/23 implemented=11 external=12 blockers=external_validation"), true);
  assert.equal(remoteInspectWithArtifactsText.stdout.includes("validationReadiness\tready_for_approved_run sourceQa=complete evidence=external_pending blockers=external_validation"), true);
  assert.equal(remoteInspectWithArtifactsText.stdout.includes("approvalRequest\tapproval_required readiness=ready_for_approved_run approved=false"), true);
  assert.equal(remoteInspectWithArtifactsText.stdout.includes("closureGate\tblocked sourceQa=complete blockers=external_validation finalReread=required"), true);
  assert.equal(remoteInspectPayload.providerDeviceE2EPlan.status, "external_pending");
  assert.equal(remoteInspectPayload.providerDeviceE2EPlan.writes, false);
  assert.equal(remoteInspectPayload.providerDeviceE2EPlan.requiredDomains.includes("hosted_agents"), true);
  assert.equal(remoteInspectPayload.providerDeviceE2EPlan.requiredTopologyTargets.includes("windows_host"), true);
  assert.equal(remoteInspectPayload.providerDeviceE2EPlan.requiredTopologyTargets.includes("mobile_client"), true);
  assert.equal(remoteInspectPayload.providerDeviceE2EPlan.requiredTopologyTargets.includes("hosted_gateway"), true);
  assert.deepEqual(remoteInspectPayload.providerDeviceE2EPlan.requiredRouteIds, remoteSyncRequiredRouteIds);
  assert.deepEqual(remoteInspectPayload.providerDeviceE2EPlan.validationSteps.map((entry) => entry.domain), remoteInspectPayload.providerDeviceE2EPlan.requiredDomains);
  assert.deepEqual(remoteInspectPayload.providerDeviceE2EPlan.validationSteps.map((entry) => entry.requiredRouteIds), [
    ["remote.chatGateway"],
    ["remote.searchGateway"],
    ["sync.skills", "sync.memoryUserModel", "sync.sessions", "sync.driveFiles", "sync.blobs", "sync.searchIndex", "sync.sqliteResources", "sync.sidecars", "sync.agentConfig", "sync.workspaceState", "mesh.resourceShare"],
    ["remote.secretBrokeredOperation"],
    ["gateway.headlessAgentHost", "gateway.multiTenantAgentService"],
  ]);
  assert.equal(remoteInspectPayload.providerDeviceE2EPlan.validationSteps.some((entry) => entry.domain === "sync" && entry.requiredRouteIds.includes("sync.skills") && entry.requiredExternalPendingIds.includes("physical_sync_driver_application")), true);
  assert.equal(remoteInspectPayload.providerDeviceE2EPlan.validationSteps.every((entry) => entry.requiredArtifacts.length > 0 && entry.acceptanceCriteria.length > 0 && !entry.writes), true);
  assert.equal(remoteInspectPayload.providerDeviceE2EPlan.requiredRouteIds.includes("remote.secretBrokeredOperation"), true);
  assert.deepEqual(remoteInspectPayload.providerDeviceE2EPlan.requiredExternalPendingIds, remoteInspectPendingRequirementIds);
  assert.equal(remoteInspectPayload.providerDeviceE2EPlan.requiredExternalPendingIds.includes("provider_device_e2e"), true);
  assert.equal(remoteInspectPayload.providerDeviceE2EPlan.plaintextMaterialIncluded, false);
  assert.deepEqual(remoteInspectPayload.routeContracts.map((entry) => entry.routeId), remoteSyncRequiredRouteIds);
  assert.equal(remoteInspectPayload.routeContracts.every((entry) => !entry.parallelApiAllowed && !entry.writes), true);
  assert.equal(remoteInspectPayload.tests.includes("packages/clawjs/src/inspect-cli.test.ts"), true);
});

test("inspect filtered collections fail when a target has no matches", async () => {
  for (const [subcommand, missingTarget, expectedMessage] of [
    ["routes", "missing.route", /No surface route found for missing\.route/],
    ["edges", "missing.edge", /No surface edge found for missing\.edge/],
    ["capabilities", "missing.capability", /No capability fiche found for missing\.capability/],
  ] as const) {
    const result = await runCliCapture(["inspect", subcommand, missingTarget, "--json"], process.cwd());
    assert.equal(result.code, CLI_EXIT_USAGE);
    const envelope = JSON.parse(result.stdout) as { ok: boolean; error: { code: string; message: string }; meta: { canonicalCommand: string; subcommand: string } };
    assert.equal(envelope.ok, false);
    assert.equal(envelope.error.code, "inspect_not_found");
    assert.match(envelope.error.message, expectedMessage);
    assert.equal(envelope.meta.canonicalCommand, "inspect");
    assert.equal(envelope.meta.subcommand, subcommand);
  }
});

test("runCli exposes remote, sync, nodes, and gateway baseline commands", async () => {
  const remote = await runCliCapture(["remote", "conformance", "--json"], process.cwd());
  assert.equal(remote.code, CLI_EXIT_OK);
  const remotePayload = parseCliJson<{ status: string; requiredRoutes: Array<{ routeId: string; registered: boolean }>; decisions: Array<{ decisionId: string }> }>(remote.stdout).data;
  assert.equal(remotePayload.status, "baseline_registered");
  assert.equal(remotePayload.requiredRoutes.every((entry) => entry.registered), true);
  assert.equal(remotePayload.decisions.some((entry) => entry.decisionId === "remote_surface_parity"), true);

  const remotePending = await runCliCapture(["remote", "pending", "--now", "2026-05-17T10:13:00.000Z", "--json"], process.cwd());
  assert.equal(remotePending.code, CLI_EXIT_OK);
  const remotePendingPayload = parseCliJson<{ status: string; writes: boolean; requirements: Array<{ requirementId: string; decisionId: string; sourceReceipt: string; status: string; writes: boolean }> }>(remotePending.stdout).data;
  assert.equal(remotePendingPayload.status, "external_pending");
  assert.equal(remotePendingPayload.writes, false);
  assert.equal(remotePendingPayload.requirements.some((entry) => entry.requirementId === "physical_iroh_handshake" && entry.sourceReceipt === "RemoteTransportHandshakeReceipt"), true);
  assert.equal(remotePendingPayload.requirements.some((entry) => entry.requirementId === "provider_device_e2e" && entry.decisionId === "first_vertical_slice" && entry.sourceReceipt === "RemoteProviderDeviceE2EValidationPlan"), true);
  assert.equal(remotePendingPayload.requirements.every((entry) => entry.status === "external_pending" && entry.writes === false), true);
  const remotePendingRequirementIds = remotePendingPayload.requirements.map((entry) => entry.requirementId);

  const remoteValidationChecklist = await runCliCapture(["remote", "validation-checklist", "--now", "2026-05-17T10:13:15.000Z", "--json"], process.cwd());
  assert.equal(remoteValidationChecklist.code, CLI_EXIT_OK);
  const remoteValidationChecklistPayload = parseCliJson<{ status: string; writes: boolean; requirementIds: string[]; coverage: { requirementCount: number; coveredRequirementCount: number; missingRequirementIds: string[] }; items: Array<{ requirementId: string; requiredCommand: string; requiredArtifacts: string[]; approvedRunRequired: boolean; physicalEvidenceRequired: boolean; plaintextMaterialIncluded: boolean; writes: boolean }> }>(remoteValidationChecklist.stdout).data;
  assert.equal(remoteValidationChecklistPayload.status, "external_pending");
  assert.equal(remoteValidationChecklistPayload.writes, false);
  assert.equal(remoteValidationChecklistPayload.coverage.requirementCount, remotePendingPayload.requirements.length);
  assert.equal(remoteValidationChecklistPayload.coverage.coveredRequirementCount, remotePendingPayload.requirements.length);
  assert.deepEqual(remoteValidationChecklistPayload.coverage.missingRequirementIds, []);
  assert.deepEqual(remoteValidationChecklistPayload.requirementIds, remotePendingRequirementIds);
  assert.equal(remoteValidationChecklistPayload.items.some((entry) => entry.requirementId === "physical_iroh_handshake" && entry.requiredCommand.includes("claw nodes heartbeat")), true);
  assert.equal(remoteValidationChecklistPayload.items.filter((entry) => entry.requiredCommand.includes(" true")).every((entry) => entry.requiredCommand.includes("--approved-run-ref") && entry.requiredCommand.includes("--physical-evidence-ref")), true);
  assert.equal(remoteValidationChecklistPayload.items.some((entry) => entry.requirementId === "provider_device_e2e" && entry.requiredArtifacts.includes("RemoteProviderDeviceE2EValidationPlan")), true);
  assert.equal(remoteValidationChecklistPayload.items.every((entry) => entry.approvedRunRequired && entry.physicalEvidenceRequired && entry.plaintextMaterialIncluded === false && !entry.writes), true);

  const remoteValidationTemplate = await runCliCapture(["remote", "validation-template", "--now", "2026-05-17T10:13:17.000Z", "--json"], process.cwd());
  assert.equal(remoteValidationTemplate.code, CLI_EXIT_OK);
  const remoteValidationTemplatePayload = parseCliJson<{ status: string; writes: boolean; requirementCount: number; submissionCommand: string; checklistItems: Array<{ requirementId: string }>; evidence: Array<{ requirementId: string; approvedRun: boolean; artifactRefs: string[]; acceptedCriteria: string[]; plaintextMaterialIncluded: boolean; writes: boolean }> }>(remoteValidationTemplate.stdout).data;
  assert.equal(remoteValidationTemplatePayload.status, "external_pending");
  assert.equal(remoteValidationTemplatePayload.writes, false);
  assert.equal(remoteValidationTemplatePayload.requirementCount, remotePendingPayload.requirements.length);
  assert.equal(remoteValidationTemplatePayload.checklistItems.length, remotePendingPayload.requirements.length);
  assert.deepEqual(remoteValidationTemplatePayload.checklistItems.map((entry) => entry.requirementId), remotePendingRequirementIds);
  assert.deepEqual(remoteValidationTemplatePayload.evidence.map((entry) => entry.requirementId), remotePendingRequirementIds);
  assert.equal(remoteValidationTemplatePayload.evidence.some((entry) => entry.requirementId === "provider_device_e2e"), true);
  assert.equal(remoteValidationTemplatePayload.evidence.every((entry) => !entry.approvedRun && entry.artifactRefs.length === 0 && entry.acceptedCriteria.length === 0 && entry.plaintextMaterialIncluded === false && !entry.writes), true);
  assert.equal(remoteValidationTemplatePayload.submissionCommand.includes("claw remote validation-report"), true);

  const remoteValidationArtifact = await runCliCapture(["remote", "validation-artifact", "--now", "2026-05-17T10:13:17.000Z", "--json"], process.cwd());
  assert.equal(remoteValidationArtifact.code, CLI_EXIT_OK);
  const remoteValidationArtifactPayload = parseCliJson<{ status: string; writes: boolean; sourceConversationId: string; sourcePlanId: string; approvalRequestId: string; evidence: Array<{ requirementId: string; approvedRun: boolean; artifactRefs: string[]; acceptedCriteria: string[]; plaintextMaterialIncluded: boolean; writes: boolean }> }>(remoteValidationArtifact.stdout).data;
  assert.equal(remoteValidationArtifactPayload.status, "external_pending");
  assert.equal(remoteValidationArtifactPayload.writes, false);
  assert.equal(remoteValidationArtifactPayload.sourceConversationId, "source:remote-gateway-sync");
  assert.equal(remoteValidationArtifactPayload.sourcePlanId, "plan:remote-gateway-sync");
  assert.equal(remoteValidationArtifactPayload.approvalRequestId, "remote_external_validation_approval_request_request_2026_05_17t10_13_17_000z");
  assert.deepEqual(remoteValidationArtifactPayload.evidence.map((entry) => entry.requirementId), remotePendingRequirementIds);
  assert.equal(remoteValidationArtifactPayload.evidence.every((entry) => !entry.approvedRun && entry.artifactRefs.length === 0 && entry.acceptedCriteria.length === 0 && entry.plaintextMaterialIncluded === false && !entry.writes), true);

  const remoteValidationRunbook = await runCliCapture(["remote", "validation-runbook", "--now", "2026-05-17T10:13:19.000Z", "--json"], process.cwd());
  assert.equal(remoteValidationRunbook.code, CLI_EXIT_OK);
  const remoteValidationRunbookPayload = parseCliJson<{ status: string; writes: boolean; validationStepCount: number; externalRequirementCount: number; e2ePlan: { validationSteps: Array<{ domain: string }> }; evidenceArtifact: { evidence: Array<{ requirementId: string }> }; reportCommand: string; closureGateCommand: string; requiredCommands: string[] }>(remoteValidationRunbook.stdout).data;
  assert.equal(remoteValidationRunbookPayload.status, "external_pending");
  assert.equal(remoteValidationRunbookPayload.writes, false);
  assert.equal(remoteValidationRunbookPayload.validationStepCount, 5);
  assert.equal(remoteValidationRunbookPayload.externalRequirementCount, remotePendingPayload.requirements.length);
  assert.deepEqual(remoteValidationRunbookPayload.e2ePlan.validationSteps.map((entry) => entry.domain), ["chat", "search", "sync", "secret_refs", "hosted_agents"]);
  assert.deepEqual(remoteValidationRunbookPayload.evidenceArtifact.evidence.map((entry) => entry.requirementId), remotePendingRequirementIds);
  assert.equal(remoteValidationRunbookPayload.reportCommand.includes("validation-report"), true);
	  assert.equal(remoteValidationRunbookPayload.closureGateCommand.includes("closure-gate"), true);
	  assert.equal(remoteValidationRunbookPayload.requiredCommands.some((entry) => entry.includes("validation-artifact")), true);
	  assert.equal(remoteValidationRunbookPayload.requiredCommands.some((entry) => entry.includes("decision-review")), true);
	  assert.equal(remoteValidationRunbookPayload.requiredCommands.some((entry) => entry.includes("test:remote-sync-source-session")), true);

  const remoteValidationReadiness = await runCliCapture([
    "remote",
    "validation-readiness",
    "--now",
    "2026-05-18T11:50:00.000Z",
    "--source-qa-review-file",
    "docs/governance/remote-gateway-sync/source-review.json",
    "--external-validation-file",
    "docs/governance/remote-gateway-sync/external-validation-evidence.json",
    "--json",
  ], process.cwd());
  assert.equal(remoteValidationReadiness.code, CLI_EXIT_OK);
  const remoteValidationReadinessPayload = parseCliJson<{ status: string; writes: boolean; sourceQaReady: boolean; externalEvidenceReady: boolean; sourceQaReviewStatus: string; evidenceCount: number; requiredEvidenceCount: number; missingEvidenceRequirementIds: string[]; clearableExternalRequirementIds: string[]; blockedExternalRequirementIds: string[]; closureGateBlockers: string[]; requiredCommands: string[]; nextAction: string }>(remoteValidationReadiness.stdout).data;
  assert.equal(remoteValidationReadinessPayload.status, "ready_for_approved_run");
  assert.equal(remoteValidationReadinessPayload.writes, false);
  assert.equal(remoteValidationReadinessPayload.sourceQaReady, true);
  assert.equal(remoteValidationReadinessPayload.externalEvidenceReady, true);
  assert.equal(remoteValidationReadinessPayload.sourceQaReviewStatus, "complete");
  assert.equal(remoteValidationReadinessPayload.evidenceCount, remotePendingPayload.requirements.length);
  assert.equal(remoteValidationReadinessPayload.requiredEvidenceCount, remotePendingPayload.requirements.length);
  assert.deepEqual(remoteValidationReadinessPayload.missingEvidenceRequirementIds, []);
  assert.deepEqual(remoteValidationReadinessPayload.clearableExternalRequirementIds, []);
  assert.deepEqual(remoteValidationReadinessPayload.blockedExternalRequirementIds, remotePendingRequirementIds);
	  assert.deepEqual(remoteValidationReadinessPayload.closureGateBlockers, ["external_validation"]);
	  assert.equal(remoteValidationReadinessPayload.requiredCommands.some((entry) => entry.includes("decision-review")), true);
	  assert.equal(remoteValidationReadinessPayload.requiredCommands.some((entry) => entry.includes("test:remote-sync-source-session")), true);
	  assert.equal(remoteValidationReadinessPayload.nextAction.includes("approved physical/provider validation"), true);
	  const remoteValidationReadinessText = await runCliCapture([
	    "remote",
	    "validation-readiness",
	    "--source-qa-review-file",
	    "docs/governance/remote-gateway-sync/source-review.json",
	    "--external-validation-file",
	    "docs/governance/remote-gateway-sync/external-validation-evidence.json",
	  ], process.cwd());
	  assert.equal(remoteValidationReadinessText.code, CLI_EXIT_OK);
	  assert.equal(remoteValidationReadinessText.stdout.trim(), "ready_for_approved_run sourceQa=complete evidence=13/13 blockers=external_validation externalBlocked=13");

	  const remoteValidationApprovalRequest = await runCliCapture([
    "remote",
    "validation-approval-request",
    "--now",
    "2026-05-18T11:50:00.000Z",
    "--source-qa-review-file",
    "docs/governance/remote-gateway-sync/source-review.json",
    "--external-validation-file",
    "docs/governance/remote-gateway-sync/external-validation-evidence.json",
    "--json",
  ], process.cwd());
  assert.equal(remoteValidationApprovalRequest.code, CLI_EXIT_OK);
  const remoteValidationApprovalRequestPayload = parseCliJson<{ status: string; approvalRequired: boolean; approved: boolean; readinessStatus: string; requirementIds: string[]; validationDomains: string[]; validationTopologyTargets: string[]; validationRouteIds: string[]; requiredCommands: string[]; prohibitedActions: string[]; writes: boolean }>(remoteValidationApprovalRequest.stdout).data;
  assert.equal(remoteValidationApprovalRequestPayload.status, "approval_required");
  assert.equal(remoteValidationApprovalRequestPayload.approvalRequired, true);
  assert.equal(remoteValidationApprovalRequestPayload.approved, false);
  assert.equal(remoteValidationApprovalRequestPayload.readinessStatus, "ready_for_approved_run");
  assert.deepEqual(remoteValidationApprovalRequestPayload.requirementIds, remotePendingRequirementIds);
  assert.deepEqual(remoteValidationApprovalRequestPayload.validationDomains, ["chat", "search", "sync", "secret_refs", "hosted_agents"]);
  assert.deepEqual(remoteValidationApprovalRequestPayload.validationTopologyTargets, ["personal_mesh", "mac_host", "linux_host", "windows_host", "server_host", "headless_server", "vps_host", "mobile_client", "browser_client", "self_hosted_gateway", "hosted_gateway"]);
  assert.deepEqual(remoteValidationApprovalRequestPayload.validationRouteIds, remoteSyncRequiredRouteIds);
	  assert.equal(remoteValidationApprovalRequestPayload.requiredCommands.some((entry) => entry.includes("validation-readiness")), true);
	  assert.equal(remoteValidationApprovalRequestPayload.requiredCommands.some((entry) => entry.includes("decision-review")), true);
	  assert.equal(remoteValidationApprovalRequestPayload.requiredCommands.some((entry) => entry.includes("test:remote-sync-source-session")), true);
	  assert.equal(remoteValidationApprovalRequestPayload.prohibitedActions.some((entry) => entry.includes("plaintext secrets")), true);
	  assert.equal(remoteValidationApprovalRequestPayload.writes, false);
	  const remoteValidationApprovalRequestText = await runCliCapture([
	    "remote",
	    "validation-approval-request",
	    "--source-qa-review-file",
	    "docs/governance/remote-gateway-sync/source-review.json",
	    "--external-validation-file",
	    "docs/governance/remote-gateway-sync/external-validation-evidence.json",
	  ], process.cwd());
	  assert.equal(remoteValidationApprovalRequestText.code, CLI_EXIT_OK);
	  assert.equal(remoteValidationApprovalRequestText.stdout.trim(), "approval_required readiness=ready_for_approved_run approved=false requirements=13 blockers=external_validation");

  const remoteSourceQaTemplate = await runCliCapture(["remote", "source-qa-template", "--now", "2026-05-17T10:13:26.250Z", "--json"], process.cwd());
  assert.equal(remoteSourceQaTemplate.code, CLI_EXIT_OK);
  const remoteSourceQaTemplatePayload = parseCliJson<{ status: string; writes: boolean; sourceConversationId: string; sourcePlanId: string; requiredSourceQaIds: string[]; externalPendingRequiredSourceQaIds: string[]; reviewCount: number; submissionCommand: string; items: Array<{ qaId: string; decisionKey: string; requirementId: string; reviewed: boolean; disposition: null; evidenceRefs: string[]; reviewedAt: null; writes: boolean }> }>(remoteSourceQaTemplate.stdout).data;
  assert.equal(remoteSourceQaTemplatePayload.status, "incomplete");
  assert.equal(remoteSourceQaTemplatePayload.writes, false);
  assert.equal(remoteSourceQaTemplatePayload.sourceConversationId, "source:remote-gateway-sync");
  assert.equal(remoteSourceQaTemplatePayload.sourcePlanId, "plan:remote-gateway-sync");
  assert.equal(remoteSourceQaTemplatePayload.reviewCount, 23);
  assert.equal(remoteSourceQaTemplatePayload.requiredSourceQaIds.length, 23);
  assert.deepEqual(remoteSourceQaTemplatePayload.externalPendingRequiredSourceQaIds, ["QA-002", "QA-004", "QA-005", "QA-006", "QA-007", "QA-010", "QA-012", "QA-013", "QA-015", "QA-018", "QA-020", "QA-021"]);
  assert.equal(remoteSourceQaTemplatePayload.items.every((entry) => !entry.reviewed && entry.disposition === null && entry.evidenceRefs.length === 0 && entry.reviewedAt === null && !entry.writes), true);
  assert.equal(remoteSourceQaTemplatePayload.items.some((entry) => entry.qaId === "QA-023" && entry.decisionKey === "goal_closure_gate"), true);
  assert.equal(remoteSourceQaTemplatePayload.submissionCommand.includes("claw remote closure-gate"), true);

  const remoteDecisionReview = await runCliCapture([
    "remote",
    "decision-review",
    "--now",
    "2026-05-18T11:55:00.000Z",
    "--source-qa-review-file",
    "docs/governance/remote-gateway-sync/source-review.json",
    "--external-validation-file",
    "docs/governance/remote-gateway-sync/external-validation-evidence.json",
    "--json",
  ], process.cwd());
  assert.equal(remoteDecisionReview.code, CLI_EXIT_OK);
  const remoteDecisionReviewPayload = parseCliJson<{ status: string; writes: boolean; reviewedCount: number; requiredCount: number; implementedCount: number; externalPendingCount: number; missingSourceQaIds: string[]; invalidSourceQaIds: string[]; duplicateSourceQaIds: string[]; blockers: string[]; items: Array<{ qaId: string; decisionId: string; reviewStatus: string; disposition: string | null; conformanceStatus: string | null; externalPendingRequired: boolean; writes: boolean }> }>(remoteDecisionReview.stdout).data;
  assert.equal(remoteDecisionReviewPayload.status, "complete");
  assert.equal(remoteDecisionReviewPayload.writes, false);
  assert.equal(remoteDecisionReviewPayload.reviewedCount, 23);
  assert.equal(remoteDecisionReviewPayload.requiredCount, 23);
  assert.equal(remoteDecisionReviewPayload.implementedCount, 11);
  assert.equal(remoteDecisionReviewPayload.externalPendingCount, 12);
  assert.deepEqual(remoteDecisionReviewPayload.missingSourceQaIds, []);
  assert.deepEqual(remoteDecisionReviewPayload.invalidSourceQaIds, []);
  assert.deepEqual(remoteDecisionReviewPayload.duplicateSourceQaIds, []);
  assert.deepEqual(remoteDecisionReviewPayload.blockers, ["external_validation"]);
	  assert.equal(remoteDecisionReviewPayload.items.every((entry) => entry.reviewStatus === "reviewed" && entry.disposition !== null && !entry.writes), true);
	  assert.equal(remoteDecisionReviewPayload.items.some((entry) => entry.qaId === "QA-006" && entry.decisionId === "remote_secrets_model" && entry.disposition === "external_pending" && entry.externalPendingRequired), true);
	  assert.equal(remoteDecisionReviewPayload.items.some((entry) => entry.qaId === "QA-023" && entry.decisionId === "goal_closure_gate" && entry.disposition === "implemented" && entry.conformanceStatus === null), true);
	  const remoteDecisionReviewText = await runCliCapture([
	    "remote",
	    "decision-review",
	    "--source-qa-review-file",
	    "docs/governance/remote-gateway-sync/source-review.json",
	    "--external-validation-file",
	    "docs/governance/remote-gateway-sync/external-validation-evidence.json",
	  ], process.cwd());
	  assert.equal(remoteDecisionReviewText.code, CLI_EXIT_OK);
	  assert.equal(remoteDecisionReviewText.stdout.trim(), "complete reviewed=23/23 implemented=11 external=12 blockers=external_validation");

  const remoteValidationReport = await runCliCapture(["remote", "validation-report", "--now", "2026-05-17T10:13:20.000Z", "--json"], process.cwd());
  assert.equal(remoteValidationReport.code, CLI_EXIT_OK);
  const remoteValidationReportPayload = parseCliJson<{ status: string; writes: boolean; requirementCount: number; evidenceCount: number; clearableRequirementIds: string[]; blockedRequirementIds: string[]; items: Array<{ requirementId: string; missingArtifacts: string[]; clearable: boolean; status: string; writes: boolean }> }>(remoteValidationReport.stdout).data;
  assert.equal(remoteValidationReportPayload.status, "external_pending");
  assert.equal(remoteValidationReportPayload.writes, false);
  assert.equal(remoteValidationReportPayload.requirementCount, remotePendingPayload.requirements.length);
  assert.equal(remoteValidationReportPayload.evidenceCount, 0);
  assert.equal(remoteValidationReportPayload.clearableRequirementIds.length, 0);
  assert.deepEqual(remoteValidationReportPayload.blockedRequirementIds, remotePendingRequirementIds);
  assert.equal(remoteValidationReportPayload.items.some((entry) => entry.requirementId === "physical_iroh_handshake" && entry.missingArtifacts.includes("RemoteTransportHandshakeReceipt")), true);
  assert.equal(remoteValidationReportPayload.items.every((entry) => !entry.clearable && entry.status === "external_pending" && !entry.writes), true);

  const remoteValidationReportFromFile = await runCliCapture([
    "remote",
    "validation-report",
    "--now",
    "2026-05-18T11:40:00.000Z",
    "--evidence-file",
    "docs/governance/remote-gateway-sync/external-validation-evidence.json",
    "--json",
  ], process.cwd());
  assert.equal(remoteValidationReportFromFile.code, CLI_EXIT_OK);
  const remoteValidationReportFromFilePayload = parseCliJson<{ status: string; writes: boolean; evidenceCount: number; clearableRequirementIds: string[]; blockedRequirementIds: string[]; invalidEvidenceRequirementIds: string[]; duplicateEvidenceRequirementIds: string[] }>(remoteValidationReportFromFile.stdout).data;
  assert.equal(remoteValidationReportFromFilePayload.status, "external_pending");
  assert.equal(remoteValidationReportFromFilePayload.writes, false);
  assert.equal(remoteValidationReportFromFilePayload.evidenceCount, remotePendingPayload.requirements.length);
  assert.equal(remoteValidationReportFromFilePayload.clearableRequirementIds.length, 0);
  assert.deepEqual(remoteValidationReportFromFilePayload.blockedRequirementIds, remotePendingRequirementIds);
  assert.deepEqual(remoteValidationReportFromFilePayload.invalidEvidenceRequirementIds, []);
  assert.deepEqual(remoteValidationReportFromFilePayload.duplicateEvidenceRequirementIds, []);

  const remoteClosureGate = await runCliCapture(["remote", "closure-gate", "--now", "2026-05-17T10:13:26.000Z", "--json"], process.cwd());
  assert.equal(remoteClosureGate.code, CLI_EXIT_OK);
  const remoteClosureGatePayload = parseCliJson<{ status: string; writes: boolean; requiredSourceQaIds: string[]; reviewedSourceQaIds: string[]; missingSourceQaIds: string[]; externalPendingRequiredSourceQaIds: string[]; sourceQaReviewStatus: string; sourceQaReviewItems: unknown[]; blockedExternalRequirementIds: string[]; clearableExternalRequirementIds: string[]; blockers: string[]; finalSourceSessionRereadRequired: boolean; sourceSessionRereadCommand: string }>(remoteClosureGate.stdout).data;
  assert.equal(remoteClosureGatePayload.status, "blocked");
  assert.equal(remoteClosureGatePayload.writes, false);
  assert.equal(remoteClosureGatePayload.requiredSourceQaIds.length, 23);
  assert.equal(remoteClosureGatePayload.reviewedSourceQaIds.length, 0);
  assert.equal(remoteClosureGatePayload.missingSourceQaIds.length, 23);
  assert.deepEqual(remoteClosureGatePayload.externalPendingRequiredSourceQaIds, remoteSourceQaTemplatePayload.externalPendingRequiredSourceQaIds);
  assert.equal(remoteClosureGatePayload.sourceQaReviewStatus, "incomplete");
  assert.equal(remoteClosureGatePayload.sourceQaReviewItems.length, 0);
  assert.deepEqual(remoteClosureGatePayload.blockedExternalRequirementIds, remotePendingRequirementIds);
  assert.equal(remoteClosureGatePayload.clearableExternalRequirementIds.length, 0);
  assert.equal(remoteClosureGatePayload.blockers.includes("source_qa_review"), true);
  assert.equal(remoteClosureGatePayload.blockers.includes("external_validation"), true);
  assert.equal(remoteClosureGatePayload.finalSourceSessionRereadRequired, true);
  assert.equal(remoteClosureGatePayload.sourceSessionRereadCommand, "REMOTE_SYNC_SOURCE_SESSION=<local-source-session-jsonl> npm run test:remote-sync-source-session");
  const remoteClosureGateText = await runCliCapture(["remote", "closure-gate"], process.cwd());
  assert.equal(remoteClosureGateText.code, CLI_EXIT_OK);
  assert.equal(remoteClosureGateText.stdout.trim(), "blocked sourceQa=incomplete blockers=source_qa_review,external_validation externalBlocked=13 finalReread=required");

  const reviewedRemoteClosureGate = await runCliCapture([
    "remote",
    "closure-gate",
    "--now",
    "2026-05-17T10:13:26.500Z",
    "--source-qa-review-file",
    "docs/governance/remote-gateway-sync/source-review.json",
    "--external-validation-file",
    "docs/governance/remote-gateway-sync/external-validation-evidence.json",
    "--json",
  ], process.cwd());
  assert.equal(reviewedRemoteClosureGate.code, CLI_EXIT_OK);
  const reviewedRemoteClosureGatePayload = parseCliJson<{ status: string; reviewedSourceQaIds: string[]; missingSourceQaIds: string[]; invalidSourceQaIds: string[]; duplicateSourceQaIds: string[]; invalidExternalPendingDispositionQaIds: string[]; sourceQaReviewStatus: string; sourceQaReviewItems: Array<{ qaId: string; decisionKey: string }>; blockedExternalRequirementIds: string[]; clearableExternalRequirementIds: string[]; blockers: string[]; finalSourceSessionRereadRequired: boolean; sourceSessionRereadCommand: string }>(reviewedRemoteClosureGate.stdout).data;
  assert.equal(reviewedRemoteClosureGatePayload.status, "blocked");
  assert.equal(reviewedRemoteClosureGatePayload.reviewedSourceQaIds.length, 23);
  assert.equal(reviewedRemoteClosureGatePayload.missingSourceQaIds.length, 0);
  assert.equal(reviewedRemoteClosureGatePayload.invalidSourceQaIds.length, 0);
  assert.equal(reviewedRemoteClosureGatePayload.duplicateSourceQaIds.length, 0);
  assert.equal(reviewedRemoteClosureGatePayload.invalidExternalPendingDispositionQaIds.length, 0);
  assert.equal(reviewedRemoteClosureGatePayload.sourceQaReviewStatus, "complete");
  assert.equal(reviewedRemoteClosureGatePayload.sourceQaReviewItems.length, 23);
  assert.equal(reviewedRemoteClosureGatePayload.sourceQaReviewItems.some((entry) => entry.qaId === "QA-006" && entry.decisionKey === "remote_secrets_model"), true);
  assert.deepEqual(reviewedRemoteClosureGatePayload.blockedExternalRequirementIds, remotePendingRequirementIds);
  assert.equal(reviewedRemoteClosureGatePayload.clearableExternalRequirementIds.length, 0);
  assert.equal(reviewedRemoteClosureGatePayload.blockers.includes("source_qa_review"), false);
  assert.equal(reviewedRemoteClosureGatePayload.blockers.includes("external_validation"), true);
  assert.equal(reviewedRemoteClosureGatePayload.finalSourceSessionRereadRequired, true);
  assert.equal(reviewedRemoteClosureGatePayload.sourceSessionRereadCommand, "REMOTE_SYNC_SOURCE_SESSION=<local-source-session-jsonl> npm run test:remote-sync-source-session");
  const reviewedRemoteClosureGateText = await runCliCapture([
    "remote",
    "closure-gate",
    "--source-qa-review-file",
    "docs/governance/remote-gateway-sync/source-review.json",
    "--external-validation-file",
    "docs/governance/remote-gateway-sync/external-validation-evidence.json",
  ], process.cwd());
  assert.equal(reviewedRemoteClosureGateText.code, CLI_EXIT_OK);
  assert.equal(reviewedRemoteClosureGateText.stdout.trim(), "blocked sourceQa=complete blockers=external_validation externalBlocked=13 finalReread=required");

  const remoteE2EPlan = await runCliCapture(["remote", "e2e-plan", "--now", "2026-05-17T10:13:30.000Z", "--json"], process.cwd());
  assert.equal(remoteE2EPlan.code, CLI_EXIT_OK);
  const remoteE2EPlanPayload = parseCliJson<{ status: string; writes: boolean; requiredDomains: string[]; requiredTopologyTargets: string[]; requiredRouteIds: string[]; requiredExternalPendingIds: string[]; validationSteps: Array<{ domain: string; requiredRouteIds: string[]; requiredExternalPendingIds: string[]; requiredArtifacts: string[]; acceptanceCriteria: string[]; writes: boolean }>; plaintextMaterialIncluded: boolean; hostedSelfHostedParityRequired: boolean }>(remoteE2EPlan.stdout).data;
  assert.equal(remoteE2EPlanPayload.status, "external_pending");
  assert.equal(remoteE2EPlanPayload.writes, false);
  assert.deepEqual(remoteE2EPlanPayload.requiredDomains, ["chat", "search", "sync", "secret_refs", "hosted_agents"]);
  assert.deepEqual(remoteE2EPlanPayload.requiredTopologyTargets, ["personal_mesh", "mac_host", "linux_host", "windows_host", "server_host", "headless_server", "vps_host", "mobile_client", "browser_client", "self_hosted_gateway", "hosted_gateway"]);
  assert.deepEqual(remoteE2EPlanPayload.requiredRouteIds, remoteSyncRequiredRouteIds);
  assert.deepEqual(remoteE2EPlanPayload.validationSteps.map((entry) => entry.domain), remoteE2EPlanPayload.requiredDomains);
  assert.deepEqual(remoteE2EPlanPayload.validationSteps.map((entry) => entry.requiredRouteIds), [
    ["remote.chatGateway"],
    ["remote.searchGateway"],
    ["sync.skills", "sync.memoryUserModel", "sync.sessions", "sync.driveFiles", "sync.blobs", "sync.searchIndex", "sync.sqliteResources", "sync.sidecars", "sync.agentConfig", "sync.workspaceState", "mesh.resourceShare"],
    ["remote.secretBrokeredOperation"],
    ["gateway.headlessAgentHost", "gateway.multiTenantAgentService"],
  ]);
  assert.equal(remoteE2EPlanPayload.validationSteps.some((entry) => entry.domain === "hosted_agents" && entry.requiredRouteIds.includes("gateway.multiTenantAgentService") && entry.requiredExternalPendingIds.includes("billing_meter_persistence")), true);
  assert.equal(remoteE2EPlanPayload.validationSteps.every((entry) => entry.requiredArtifacts.length > 0 && entry.acceptanceCriteria.length > 0 && !entry.writes), true);
  assert.deepEqual(remoteE2EPlanPayload.requiredExternalPendingIds, remotePendingRequirementIds);
  assert.equal(remoteE2EPlanPayload.plaintextMaterialIncluded, false);
  assert.equal(remoteE2EPlanPayload.hostedSelfHostedParityRequired, true);

  const remoteContracts = await runCliCapture(["remote", "contracts", "--now", "2026-05-17T10:14:00.000Z", "--json"], process.cwd());
  assert.equal(remoteContracts.code, CLI_EXIT_OK);
  const remoteContractsPayload = parseCliJson<{ status: string; writes: boolean; missingRouteIds: string[]; contracts: Array<{ routeId: string; layer: string; localContractRefs: string[]; remoteEntryPoints: string[]; parityRequired: boolean; parallelApiAllowed: boolean; writes: boolean }> }>(remoteContracts.stdout).data;
  assert.equal(remoteContractsPayload.status, "complete");
  assert.equal(remoteContractsPayload.writes, false);
  assert.deepEqual(remoteContractsPayload.missingRouteIds, []);
  assert.deepEqual(remoteContractsPayload.contracts.map((entry) => entry.routeId), remoteSyncRequiredRouteIds);
  assert.deepEqual(remoteContractsPayload.contracts.map((entry) => entry.layer), [
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
  assert.equal(remoteContractsPayload.contracts.some((entry) => entry.routeId === "remote.searchGateway" && entry.localContractRefs.includes("claw search")), true);
  assert.equal(remoteContractsPayload.contracts.some((entry) => entry.routeId === "gateway.multiTenantAgentService" && entry.remoteEntryPoints.includes("POST /v1/gateway/agent-service/evaluate")), true);
  assert.equal(remoteContractsPayload.contracts.every((entry) => entry.parityRequired && !entry.parallelApiAllowed && entry.writes === false), true);

  const remoteOffline = await runCliCapture(["remote", "offline-command", "--route-id", "remote.searchGateway", "--reason", "node_unreachable", "--actor-kind", "human", "--actor-id", "user.local", "--json"], process.cwd());
  assert.equal(remoteOffline.code, CLI_EXIT_OK);
  const remoteOfflinePayload = parseCliJson<{ routeId: string; status: string; reason: string; enqueued: boolean; retryable: boolean; writes: boolean }>(remoteOffline.stdout).data;
  assert.equal(remoteOfflinePayload.routeId, "remote.searchGateway");
  assert.equal(remoteOfflinePayload.status, "failed_fast");
  assert.equal(remoteOfflinePayload.reason, "node_unreachable");
  assert.equal(remoteOfflinePayload.enqueued, false);
  assert.equal(remoteOfflinePayload.retryable, true);
  assert.equal(remoteOfflinePayload.writes, false);

  const syncDrivers = await runCliCapture(["sync", "drivers", "--now", "2026-05-17T10:14:30.000Z", "--json"], process.cwd());
  assert.equal(syncDrivers.code, CLI_EXIT_OK);
  const syncDriversPayload = parseCliJson<{ status: string; writes: boolean; driverCount: number; requiredDrivers: string[]; coveredDrivers: string[]; requiredRouteIds: string[]; missingDrivers: string[]; missingRouteIds: string[]; authorityModel: string; conflictDefault: string; physicalApplicationStatus: string; entries: Array<{ driver: string; routeId: string; lateralDomains: string[]; manifestBacked: boolean; changelogBacked: boolean; authorityScoped: boolean; partialResourceSupported: boolean; physicalDriverRequired: boolean; commands: string[]; writes: boolean }> }>(syncDrivers.stdout).data;
  assert.equal(syncDriversPayload.status, "complete");
  assert.equal(syncDriversPayload.writes, false);
  assert.equal(syncDriversPayload.driverCount, 11);
  assert.deepEqual(syncDriversPayload.requiredDrivers, expectedSyncDrivers);
  assert.deepEqual(syncDriversPayload.coveredDrivers, expectedSyncDrivers);
  assert.deepEqual(syncDriversPayload.requiredRouteIds, expectedSyncDriverRequiredRouteIds);
  assert.deepEqual(syncDriversPayload.missingDrivers, []);
  assert.deepEqual(syncDriversPayload.missingRouteIds, []);
  assert.equal(syncDriversPayload.authorityModel, "per_resource");
  assert.equal(syncDriversPayload.conflictDefault, "detect_and_elevate");
  assert.equal(syncDriversPayload.physicalApplicationStatus, "external_pending");
  assert.deepEqual(syncDriversPayload.entries.map((entry) => entry.driver), expectedSyncDrivers);
  assert.deepEqual(syncDriversPayload.entries.map((entry) => entry.routeId), expectedSyncDriverRouteIds);
  assert.deepEqual(syncDriversPayload.entries.map((entry) => entry.lateralDomains), expectedSyncDriverLateralDomains);
  assert.deepEqual(syncDriversPayload.entries.map((entry) => entry.commands), expectedSyncDriverCommands);
  assert.deepEqual(syncDriversPayload.entries.map((entry) => entry.partialResourceSupported), [false, false, false, false, false, false, true, false, false, false, false]);
  assert.equal(syncDriversPayload.entries.every((entry) => entry.manifestBacked && entry.changelogBacked && entry.authorityScoped && entry.physicalDriverRequired && !entry.writes), true);

  const sync = await runCliCapture(["sync", "manifest", "--resource-id", "skills:default", "--kind", "skills", "--driver", "skills", "--json"], process.cwd());
  assert.equal(sync.code, CLI_EXIT_OK);
  const syncPayload = parseCliJson<{ manifest: { driver: string; conflictPolicy: string; secretPolicy: string } }>(sync.stdout).data;
  assert.equal(syncPayload.manifest.driver, "skills");
  assert.equal(syncPayload.manifest.conflictPolicy, "detect_and_elevate");
  assert.equal(syncPayload.manifest.secretPolicy, "[REDACTED]");

  const plan = await runCliCapture(["sync", "plan", "--local-hash", "hash-a", "--peer-hash", "hash-b", "--json"], process.cwd());
  assert.equal(plan.code, CLI_EXIT_OK);
  const planPayload = parseCliJson<{
    mode: string;
    writes: boolean;
    actions: Array<{ action: string; reason: string }>;
    conflicts: Array<{ status: string; objectRef: string }>;
    nextCursor?: { cursor: string };
  }>(plan.stdout).data;
  assert.equal(planPayload.mode, "plan");
  assert.equal(planPayload.writes, false);
  assert.equal(planPayload.actions.some((action) => action.action === "conflict" && action.reason === "diverged_snapshots_detect_and_elevate"), true);
  assert.equal(planPayload.conflicts[0]?.status, "open");
  assert.equal(planPayload.conflicts[0]?.objectRef, "skill.review");
  assert.equal(planPayload.nextCursor?.cursor.includes("skill.review"), true);

  const matchingPlan = await runCliCapture(["sync", "plan", "--local-hash", "hash-a", "--peer-hash", "hash-a", "--json"], process.cwd());
  assert.equal(matchingPlan.code, CLI_EXIT_OK);
  const matchingPlanPayload = parseCliJson<{ actions: Array<{ action: string }>; conflicts: unknown[] }>(matchingPlan.stdout).data;
  assert.equal(matchingPlanPayload.actions[0]?.action, "noop");
  assert.equal(matchingPlanPayload.conflicts.length, 0);

  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-remote-sync-state-"));
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const coordinatorPrivateKeyFile = path.join(stateDir, "coordinator-private.pem");
  const coordinatorPublicKeyFile = path.join(stateDir, "coordinator-public.pem");
  fs.writeFileSync(coordinatorPrivateKeyFile, privateKey.export({ type: "pkcs8", format: "pem" }), "utf8");
  fs.writeFileSync(coordinatorPublicKeyFile, publicKey.export({ type: "spki", format: "pem" }), "utf8");
  const coordinatorSigningFlags = ["--coordinator-private-key-file", coordinatorPrivateKeyFile, "--coordinator-public-key-file", coordinatorPublicKeyFile, "--coordinator-key-id", "coordinator.test"];

  const recordedManifest = await runCliCapture(["sync", "manifest", "--resource-id", "skills:default", "--driver", "skills", "--state-dir", stateDir, "--record", "true", ...coordinatorSigningFlags, "--json"], process.cwd());
  assert.equal(recordedManifest.code, CLI_EXIT_OK);
  const recordedManifestPayload = parseCliJson<{ state: { durable: boolean; statePath: string; coordinatorSignature?: { verified: boolean } } }>(recordedManifest.stdout).data;
  assert.equal(recordedManifestPayload.state.durable, true);
  assert.equal(recordedManifestPayload.state.coordinatorSignature?.verified, true);
  assert.equal(fs.existsSync(recordedManifestPayload.state.statePath), true);

  const queuedSync = await runCliCapture(["sync", "run", "--resource-id", "skills:default", "--driver", "skills", "--peer-snapshot-json", "[]", "--state-dir", stateDir, "--queue", "true", ...coordinatorSigningFlags, "--json"], process.cwd());
  assert.equal(queuedSync.code, CLI_EXIT_OK);
  const queuedSyncPayload = parseCliJson<{ mode: string; state: { durable: boolean; coordinatorSignature?: { verified: boolean }; entries: Array<{ status: string; changeId: string; writes: boolean }> } }>(queuedSync.stdout).data;
  assert.equal(queuedSyncPayload.mode, "queued");
  assert.equal(queuedSyncPayload.state.durable, true);
  assert.equal(queuedSyncPayload.state.coordinatorSignature?.verified, true);
  assert.equal(queuedSyncPayload.state.entries[0]?.status, "queued");
  assert.equal(queuedSyncPayload.state.entries[0]?.writes, false);
  const queuedChangeId = queuedSyncPayload.state.entries[0]?.changeId;
  assert.ok(queuedChangeId);

  const appliedSync = await runCliCapture(["sync", "apply", "--resource-id", "skills:default", "--driver", "skills", "--state-dir", stateDir, "--record", "true", "--ack-change-ids", queuedChangeId, "--actor-id", "agent.sync", ...coordinatorSigningFlags, "--json"], process.cwd());
  assert.equal(appliedSync.code, CLI_EXIT_OK, appliedSync.stderr || appliedSync.stdout);
  const appliedSyncPayload = parseCliJson<{
    status: string;
    writes: boolean;
    reconciliation: { queue: Array<{ status: string }>; appliedChangeIds: string[] };
    receipt: { status: string; driver: string; physicalDriverApplied: boolean; externalPending: string[]; writes: boolean };
    state: { durable: boolean; coordinatorSignature?: { verified: boolean } };
  }>(appliedSync.stdout).data;
  assert.equal(appliedSyncPayload.status, "signed_pending_driver_application");
  assert.equal(appliedSyncPayload.writes, false);
  assert.equal(appliedSyncPayload.reconciliation.queue[0]?.status, "applied");
  assert.deepEqual(appliedSyncPayload.reconciliation.appliedChangeIds, [queuedChangeId]);
  assert.equal(appliedSyncPayload.receipt.driver, "skills");
  assert.equal(appliedSyncPayload.receipt.physicalDriverApplied, false);
  assert.equal(appliedSyncPayload.receipt.externalPending.includes("physical_sync_driver_application"), true);
  assert.equal(appliedSyncPayload.receipt.writes, false);
  assert.equal(appliedSyncPayload.state.durable, true);
  assert.equal(appliedSyncPayload.state.coordinatorSignature?.verified, true);

  const syncStatus = await runCliCapture(["sync", "status", "--state-dir", stateDir, "--json"], process.cwd());
  assert.equal(syncStatus.code, CLI_EXIT_OK);
  const syncStatusPayload = parseCliJson<{ state: { durable: boolean; manifests: number; queueEntries: number; applications: number; authorityHandoffs: number; auditEvents: number; coordinatorSignatures: number; verifiedCoordinatorSignatures: number; invalidCoordinatorSignatures: number } }>(syncStatus.stdout).data;
  assert.equal(syncStatusPayload.state.durable, true);
  assert.equal(syncStatusPayload.state.manifests >= 1, true);
  assert.equal(syncStatusPayload.state.queueEntries, 1);
  assert.equal(syncStatusPayload.state.applications, 1);
  assert.equal(syncStatusPayload.state.authorityHandoffs, 0);
  assert.equal(syncStatusPayload.state.auditEvents >= 4, true);
  assert.equal(syncStatusPayload.state.coordinatorSignatures, 4);
  assert.equal(syncStatusPayload.state.verifiedCoordinatorSignatures, 4);
  assert.equal(syncStatusPayload.state.invalidCoordinatorSignatures, 0);

  const authorityHandoff = await runCliCapture(["sync", "handoff", "--resource-id", "skills:default", "--driver", "skills", "--to-node", "node.server", "--requested-authority", "primary", "--state-dir", stateDir, "--record", "true", "--actor-id", "agent.sync", ...coordinatorSigningFlags, "--json"], process.cwd());
  assert.equal(authorityHandoff.code, CLI_EXIT_OK, authorityHandoff.stderr || authorityHandoff.stdout);
  const authorityHandoffPayload = parseCliJson<{
    status: string;
    writes: boolean;
    receipt: { status: string; fromNodeId: string; toNodeId: string; requestedAuthority: string; physicalAuthorityApplied: boolean; externalPending: string[]; writes: boolean };
    state: { durable: boolean; coordinatorSignature?: { verified: boolean } };
  }>(authorityHandoff.stdout).data;
  assert.equal(authorityHandoffPayload.status, "signed_authority_handoff_recorded");
  assert.equal(authorityHandoffPayload.writes, false);
  assert.equal(authorityHandoffPayload.receipt.status, "signed_pending_authority_handoff");
  assert.equal(authorityHandoffPayload.receipt.fromNodeId, "local");
  assert.equal(authorityHandoffPayload.receipt.toNodeId, "node.server");
  assert.equal(authorityHandoffPayload.receipt.requestedAuthority, "primary");
  assert.equal(authorityHandoffPayload.receipt.physicalAuthorityApplied, false);
  assert.equal(authorityHandoffPayload.receipt.externalPending.includes("physical_authority_handoff"), true);
  assert.equal(authorityHandoffPayload.receipt.writes, false);
  assert.equal(authorityHandoffPayload.state.durable, true);
  assert.equal(authorityHandoffPayload.state.coordinatorSignature?.verified, true);

  const remoteClassification = await runCliCapture([
    "remote",
    "classify",
    "--capability-id",
    "claw.gateway",
    "--classification",
    "remote-safe",
    "--route-id",
    "remote.chatGateway",
    "--policy-ref",
    "docs/adr/0022-remote-gateway-sync-redesign.md",
    "--test-refs",
    "packages/clawjs/src/inspect-cli.test.ts",
    "--state-dir",
    stateDir,
    "--record",
    "true",
    ...coordinatorSigningFlags,
    "--json",
  ], process.cwd());
  assert.equal(remoteClassification.code, CLI_EXIT_OK, remoteClassification.stderr || remoteClassification.stdout);
  const remoteClassificationPayload = parseCliJson<{
    status: string;
    writes: boolean;
    receipt: { capabilityId: string; classification: string; routeId: string; policyRef: string; testRefs: string[]; remoteSafeReady: boolean; missingEvidence: string[]; writes: boolean };
    state: { durable: boolean; coordinatorSignature?: { verified: boolean } };
  }>(remoteClassification.stdout).data;
  assert.equal(remoteClassificationPayload.status, "signed_remote_classification_recorded");
  assert.equal(remoteClassificationPayload.writes, false);
  assert.equal(remoteClassificationPayload.receipt.capabilityId, "claw.gateway");
  assert.equal(remoteClassificationPayload.receipt.classification, "remote-safe");
  assert.equal(remoteClassificationPayload.receipt.routeId, "remote.chatGateway");
  assert.equal(remoteClassificationPayload.receipt.policyRef, "docs/adr/0022-remote-gateway-sync-redesign.md");
  assert.deepEqual(remoteClassificationPayload.receipt.testRefs, ["packages/clawjs/src/inspect-cli.test.ts"]);
  assert.equal(remoteClassificationPayload.receipt.remoteSafeReady, true);
  assert.deepEqual(remoteClassificationPayload.receipt.missingEvidence, []);
  assert.equal(remoteClassificationPayload.receipt.writes, false);
  assert.equal(remoteClassificationPayload.state.durable, true);
  assert.equal(remoteClassificationPayload.state.coordinatorSignature?.verified, true);

  const secretLease = await runCliCapture(["gateway", "secret-lease", "--state-dir", stateDir, "--secret-ref", "vault://agents/support", "--resource-id", "skills:default", "--agent-id", "agent.support", "--assignment-id", "assignment.service", ...coordinatorSigningFlags, "--json"], process.cwd());
  assert.equal(secretLease.code, CLI_EXIT_OK);
  const secretLeasePayload = parseCliJson<{
    status: string;
    writes: boolean;
    lease: { secretRef: string; plaintextReturned: string | boolean; actor: { assignmentId?: string } };
    coordinatorSignature: { verified: boolean };
  }>(secretLease.stdout).data;
  assert.equal(secretLeasePayload.status, "signed_secret_lease_issued");
  assert.equal(secretLeasePayload.writes, false);
  assert.notEqual(secretLeasePayload.lease.secretRef, "vault://agents/support");
  assert.equal(secretLeasePayload.lease.secretRef.includes("vault://"), false);
  assert.notEqual(secretLeasePayload.lease.plaintextReturned, true);
  assert.equal(secretLeasePayload.lease.actor.assignmentId, "assignment.service");
  assert.equal(secretLeasePayload.coordinatorSignature.verified, true);

  const invalidSecretLeaseTtl = await runCliCapture(["gateway", "secret-lease", "--state-dir", stateDir, "--secret-ref", "vault://agents/support", "--resource-id", "skills:default", "--ttl-seconds", "-1", ...coordinatorSigningFlags, "--json"], process.cwd());
  assert.equal(invalidSecretLeaseTtl.code, CLI_EXIT_USAGE);
  const invalidSecretLeaseTtlPayload = JSON.parse(invalidSecretLeaseTtl.stdout) as {
    ok: boolean;
    error: { code: string; message: string; status: string };
  };
  assert.equal(invalidSecretLeaseTtlPayload.ok, false);
  assert.equal(invalidSecretLeaseTtlPayload.error.code, "invalid_positive_integer");
  assert.match(invalidSecretLeaseTtlPayload.error.message, /--ttl-seconds/);
  assert.equal(invalidSecretLeaseTtlPayload.error.status, "USAGE");

  const secretProvider = await runCliCapture(["gateway", "secret-provider", "--state-dir", stateDir, "--secret-ref", "vault://agents/support", "--resource-id", "skills:default", "--provider-id", "provider.1password", "--credential-binding-id", "credential.support", "--agent-id", "agent.support", "--assignment-id", "assignment.service", ...coordinatorSigningFlags, "--json"], process.cwd());
  assert.equal(secretProvider.code, CLI_EXIT_OK);
  const secretProviderPayload = parseCliJson<{
    status: string;
    writes: boolean;
    receipt: { providerId: string; credentialBindingId: string; providerAccessVerified: boolean; plaintextReturned: string | boolean; externalPending: string[]; writes: boolean };
    state: { providerReceipt: { coordinatorSignature?: { verified: boolean } } };
  }>(secretProvider.stdout).data;
  assert.equal(secretProviderPayload.status, "signed_secret_provider_receipt_recorded");
  assert.equal(secretProviderPayload.writes, false);
  assert.equal(secretProviderPayload.receipt.providerId, "provider.1password");
  assert.equal(secretProviderPayload.receipt.credentialBindingId, "credential.support");
  assert.equal(secretProviderPayload.receipt.providerAccessVerified, false);
  assert.notEqual(secretProviderPayload.receipt.plaintextReturned, true);
  assert.equal(secretProviderPayload.receipt.externalPending.includes("provider_secret_retrieval"), true);
  assert.equal(secretProviderPayload.receipt.writes, false);
  assert.equal(secretProviderPayload.state.providerReceipt.coordinatorSignature?.verified, true);

  const remoteCache = await runCliCapture(["sync", "cache", "--resource-id", "skills:default", "--driver", "skills", "--object-ref", "skill.review", "--client-id", "iphone.local", "--content-hash", "hash-cache", "--ttl-seconds", "600", "--physical-client", "true", "--state-dir", stateDir, "--record", "true", ...coordinatorSigningFlags, "--json"], process.cwd());
  assert.equal(remoteCache.code, CLI_EXIT_OK);
  const remoteCachePayload = parseCliJson<{
    status: string;
    writes: boolean;
    snapshot: { encrypted: boolean; ttlSeconds: number; storesSecrets: string | boolean; storesAuthoritativeState: boolean; plaintextIncluded: boolean; physicalClientStorageVerified: boolean; externalPending: string[]; writes: boolean };
    state: { durable: boolean; coordinatorSignature?: { verified: boolean } };
  }>(remoteCache.stdout).data;
  assert.equal(remoteCachePayload.status, "signed_cache_snapshot_recorded");
  assert.equal(remoteCachePayload.writes, false);
  assert.equal(remoteCachePayload.snapshot.encrypted, true);
  assert.equal(remoteCachePayload.snapshot.ttlSeconds, 600);
  assert.notEqual(remoteCachePayload.snapshot.storesSecrets, true);
  assert.equal(remoteCachePayload.snapshot.storesAuthoritativeState, false);
  assert.equal(remoteCachePayload.snapshot.plaintextIncluded, false);
  assert.equal(remoteCachePayload.snapshot.physicalClientStorageVerified, false);
  assert.equal(remoteCachePayload.snapshot.externalPending.includes("physical_client_storage"), true);
  assert.equal(remoteCachePayload.snapshot.writes, false);
  assert.equal(remoteCachePayload.state.durable, true);
  assert.equal(remoteCachePayload.state.coordinatorSignature?.verified, true);

  const verifiedRemoteCache = await runCliCapture(["sync", "cache", "--resource-id", "skills:default", "--driver", "skills", "--object-ref", "skill.review", "--client-id", "iphone.local", "--content-hash", "hash-cache", "--ttl-seconds", "600", "--physical-client", "true", "--approved-run-ref", "approval://cache", "--physical-evidence-ref", "evidence://cache", "--json"], process.cwd());
  assert.equal(verifiedRemoteCache.code, CLI_EXIT_OK);
  const verifiedRemoteCachePayload = parseCliJson<{
    snapshot: { physicalClientStorageVerified: boolean; externalPending: string[]; writes: boolean };
  }>(verifiedRemoteCache.stdout).data;
  assert.equal(verifiedRemoteCachePayload.snapshot.physicalClientStorageVerified, true);
  assert.deepEqual(verifiedRemoteCachePayload.snapshot.externalPending, []);
  assert.equal(verifiedRemoteCachePayload.snapshot.writes, false);

  const compatibility = await runCliCapture(["remote", "compat", "--legacy-surface", "relay.mobile.chat", "--canonical-route", "remote.chatGateway", "--client-kind", "ios", "--state-dir", stateDir, "--record", "true", ...coordinatorSigningFlags, "--json"], process.cwd());
  assert.equal(compatibility.code, CLI_EXIT_OK);
  const compatibilityPayload = parseCliJson<{
    status: string;
    writes: boolean;
    receipt: { legacySurface: string; canonicalRouteId: string; clientKind: string; mapsToCanonical: boolean; parallelApiIntroduced: boolean; migrationRequired: boolean; writes: boolean };
    state: { durable: boolean; coordinatorSignature?: { verified: boolean } };
  }>(compatibility.stdout).data;
  assert.equal(compatibilityPayload.status, "signed_compat_adapter_recorded");
  assert.equal(compatibilityPayload.writes, false);
  assert.equal(compatibilityPayload.receipt.legacySurface, "relay.mobile.chat");
  assert.equal(compatibilityPayload.receipt.canonicalRouteId, "remote.chatGateway");
  assert.equal(compatibilityPayload.receipt.clientKind, "ios");
  assert.equal(compatibilityPayload.receipt.mapsToCanonical, true);
  assert.equal(compatibilityPayload.receipt.parallelApiIntroduced, false);
  assert.equal(compatibilityPayload.receipt.migrationRequired, true);
  assert.equal(compatibilityPayload.receipt.writes, false);
  assert.equal(compatibilityPayload.state.durable, true);
  assert.equal(compatibilityPayload.state.coordinatorSignature?.verified, true);

  const conflicts = await runCliCapture(["sync", "conflicts", "--local-hash", "hash-a", "--peer-hash", "hash-b", "--json"], process.cwd());
  assert.equal(conflicts.code, CLI_EXIT_OK);
  const conflictsPayload = parseCliJson<{ conflicts: Array<{ status: string }>; silentOverwriteAllowed: boolean }>(conflicts.stdout).data;
  assert.equal(conflictsPayload.conflicts[0]?.status, "open");
  assert.equal(conflictsPayload.silentOverwriteAllowed, false);

  const nodes = await runCliCapture(["nodes", "list", "--json"], process.cwd());
  assert.equal(nodes.code, CLI_EXIT_OK);
  const nodesPayload = parseCliJson<{ nodes: Array<{ id: string }> }>(nodes.stdout).data;
  assert.equal(nodesPayload.nodes.some((node) => node.id === "claw.coordinator"), true);

  const invitation = await runCliCapture(["nodes", "invite", "--issuer-mesh", "mesh.home", "--recipient-mesh", "mesh.server", "--allowed-resources", "skills:default", "--actions", "read,sync", "--json"], process.cwd());
  assert.equal(invitation.code, CLI_EXIT_OK);
  const invitationPayload = parseCliJson<{ invitation: { status: string; writes: boolean; allowedResourceIds: string[] }; writes: boolean }>(invitation.stdout).data;
  assert.equal(invitationPayload.invitation.status, "pending");
  assert.equal(invitationPayload.invitation.allowedResourceIds[0], "skills:default");
  assert.equal(invitationPayload.writes, false);

  const recordedInvitation = await runCliCapture(["nodes", "invite", "--issuer-mesh", "mesh.home", "--recipient-mesh", "mesh.server", "--allowed-resources", "skills:default", "--actions", "read,sync", "--state-dir", stateDir, "--record", "true", "--json"], process.cwd());
  assert.equal(recordedInvitation.code, CLI_EXIT_OK);
  const recordedInvitationPayload = parseCliJson<{ status: string; state: { durable: boolean; invitation: { invitationId: string } } }>(recordedInvitation.stdout).data;
  assert.equal(recordedInvitationPayload.status, "recorded_proposal");
  assert.equal(recordedInvitationPayload.state.durable, true);

  const acceptedInvitation = await runCliCapture(["nodes", "accept", "--issuer-mesh", "mesh.home", "--recipient-mesh", "mesh.server", "--allowed-resources", "skills:default", "--actions", "read,sync", "--state-dir", stateDir, "--record", "true", ...coordinatorSigningFlags, "--json"], process.cwd());
  assert.equal(acceptedInvitation.code, CLI_EXIT_OK);
  const acceptedInvitationPayload = parseCliJson<{
    status: string;
    physicalPeerTrust: string;
    acceptance: { status: string; physicalPeerTrustVerified: boolean; externalPending: string[]; writes: boolean };
    state: { durable: boolean; coordinatorSignature?: { verified: boolean } };
  }>(acceptedInvitation.stdout).data;
  assert.equal(acceptedInvitationPayload.status, "signed_invitation_acceptance_recorded");
  assert.equal(acceptedInvitationPayload.physicalPeerTrust, "external_pending");
  assert.equal(acceptedInvitationPayload.acceptance.status, "signed_pending_peer_trust");
  assert.equal(acceptedInvitationPayload.acceptance.physicalPeerTrustVerified, false);
  assert.equal(acceptedInvitationPayload.acceptance.externalPending.includes("physical_peer_trust"), true);
  assert.equal(acceptedInvitationPayload.acceptance.externalPending.includes("device_trust_acceptance"), true);
  assert.equal(acceptedInvitationPayload.acceptance.writes, false);
  assert.equal(acceptedInvitationPayload.state.durable, true);
  assert.equal(acceptedInvitationPayload.state.coordinatorSignature?.verified, true);

  const heartbeat = await runCliCapture(["nodes", "heartbeat", "--state-dir", stateDir, "--record", "true", "--transport", "iroh", "--physical-verified", "true", "--owner-node", "mac.home", "--peer-node", "vps.server", "--coordinator-node", "coord.home", ...coordinatorSigningFlags, "--json"], process.cwd());
  assert.equal(heartbeat.code, CLI_EXIT_OK);
  const heartbeatPayload = parseCliJson<{
    status: string;
    physicalTransport: string;
    receipt: { adapter: string; contractVerified: boolean; physicalTransportVerified: boolean; externalPending: string[]; writes: boolean };
    state: { durable: boolean; coordinatorSignature?: { verified: boolean } };
  }>(heartbeat.stdout).data;
  assert.equal(heartbeatPayload.status, "signed_transport_handshake_recorded");
  assert.equal(heartbeatPayload.physicalTransport, "external_pending");
  assert.equal(heartbeatPayload.receipt.adapter, "iroh_v1");
  assert.equal(heartbeatPayload.receipt.contractVerified, true);
  assert.equal(heartbeatPayload.receipt.physicalTransportVerified, false);
  assert.equal(heartbeatPayload.receipt.externalPending.includes("physical_iroh_handshake"), true);
  assert.equal(heartbeatPayload.receipt.writes, false);
  assert.equal(heartbeatPayload.state.durable, true);
  assert.equal(heartbeatPayload.state.coordinatorSignature?.verified, true);

  const nodeTrust = await runCliCapture(["nodes", "trust", "--target-node", "vps.server", "--owner-node", "mac.home", "--coordinator-node", "coord.home", "--state-dir", stateDir, "--record", "true", "--transport", "iroh", ...coordinatorSigningFlags, "--json"], process.cwd());
  assert.equal(nodeTrust.code, CLI_EXIT_OK);
  const nodeTrustPayload = parseCliJson<{
    status: string;
    physicalAcceptance: string;
    decision: { status: string; effect: string; physicalAcceptanceVerified: boolean; externalPending: string[]; writes: boolean };
    state: { durable: boolean; coordinatorSignature?: { verified: boolean } };
  }>(nodeTrust.stdout).data;
  assert.equal(nodeTrustPayload.status, "signed_node_trust_recorded");
  assert.equal(nodeTrustPayload.physicalAcceptance, "external_pending");
  assert.equal(nodeTrustPayload.decision.status, "signed_pending_physical_acceptance");
  assert.equal(nodeTrustPayload.decision.effect, "allow");
  assert.equal(nodeTrustPayload.decision.physicalAcceptanceVerified, false);
  assert.equal(nodeTrustPayload.decision.externalPending.includes("device_trust_acceptance"), true);
  assert.equal(nodeTrustPayload.decision.writes, false);
  assert.equal(nodeTrustPayload.state.durable, true);
  assert.equal(nodeTrustPayload.state.coordinatorSignature?.verified, true);

  const share = await runCliCapture(["nodes", "share", "--issuer-mesh", "mesh.home", "--to-mesh", "mesh.server", "--resource-id", "skills:default", "--driver", "skills", "--actions", "read,sync", "--json"], process.cwd());
  assert.equal(share.code, CLI_EXIT_OK);
  const sharePayload = parseCliJson<{ share: { status: string; resourceId: string; plaintextSecrets: string; writes: boolean }; writes: boolean }>(share.stdout).data;
  assert.equal(sharePayload.share.status, "proposed");
  assert.equal(sharePayload.share.resourceId, "skills:default");
  assert.equal(sharePayload.share.plaintextSecrets, false);
  assert.equal(sharePayload.writes, false);

  const recordedShare = await runCliCapture(["nodes", "share", "--issuer-mesh", "mesh.home", "--to-mesh", "mesh.server", "--resource-id", "skills:default", "--driver", "skills", "--actions", "read,sync", "--state-dir", stateDir, "--record", "true", "--json"], process.cwd());
  assert.equal(recordedShare.code, CLI_EXIT_OK);
  const recordedSharePayload = parseCliJson<{ status: string; state: { durable: boolean; share: { shareId: string } } }>(recordedShare.stdout).data;
  assert.equal(recordedSharePayload.status, "recorded_proposal");
  assert.equal(recordedSharePayload.state.durable, true);

  const meshRevoke = await runCliCapture(["nodes", "revoke", "--target-type", "share", "--target-id", "mesh_share_1", "--json"], process.cwd());
  assert.equal(meshRevoke.code, CLI_EXIT_OK);
  const meshRevokePayload = parseCliJson<{ revocation: { targetType: string; cascadeSyncQueues: boolean; writes: boolean }; writes: boolean }>(meshRevoke.stdout).data;
  assert.equal(meshRevokePayload.revocation.targetType, "share");
  assert.equal(meshRevokePayload.revocation.cascadeSyncQueues, true);
  assert.equal(meshRevokePayload.writes, false);

  const recordedRevoke = await runCliCapture(["nodes", "revoke", "--target-type", "share", "--target-id", recordedSharePayload.state.share.shareId, "--state-dir", stateDir, "--record", "true", "--json"], process.cwd());
  assert.equal(recordedRevoke.code, CLI_EXIT_OK);
  const recordedRevokePayload = parseCliJson<{ status: string; state: { durable: boolean; revocation: { targetType: string }; cascadedQueueEntries: unknown[] } }>(recordedRevoke.stdout).data;
  assert.equal(recordedRevokePayload.status, "recorded_revocation");
  assert.equal(recordedRevokePayload.state.durable, true);
  assert.equal(recordedRevokePayload.state.revocation.targetType, "share");

  const gateway = await runCliCapture(["gateway", "conformance", "--json"], process.cwd());
  assert.equal(gateway.code, CLI_EXIT_OK);
  const gatewayPayload = parseCliJson<{ hostedSelfHostedParity: string }>(gateway.stdout).data;
  assert.equal(gatewayPayload.hostedSelfHostedParity, "required");

  const gatewayProject = await runCliCapture(["gateway", "project", "--state-dir", stateDir, "--record", "true", "--gateway-node", "gateway.hosted", "--coordinator-node", "coord.home", "--public-base-url", "https://gateway.example.test", ...coordinatorSigningFlags, "--json"], process.cwd());
  assert.equal(gatewayProject.code, CLI_EXIT_OK);
  const gatewayProjectPayload = parseCliJson<{
    status: string;
    operation: string;
    deployment: { deploymentKind: string; hostedSelfHostedParity: boolean; conformanceStatus: string; physicalDeploymentVerified: boolean; externalPending: string[]; writes: boolean };
    state: { durable: boolean; coordinatorSignature?: { verified: boolean } };
  }>(gatewayProject.stdout).data;
  assert.equal(gatewayProjectPayload.status, "signed_gateway_deployment_recorded");
  assert.equal(gatewayProjectPayload.operation, "project");
  assert.equal(gatewayProjectPayload.deployment.deploymentKind, "hosted");
  assert.equal(gatewayProjectPayload.deployment.hostedSelfHostedParity, true);
  assert.equal(gatewayProjectPayload.deployment.conformanceStatus, "external_pending");
  assert.equal(gatewayProjectPayload.deployment.physicalDeploymentVerified, false);
  assert.equal(gatewayProjectPayload.deployment.externalPending.includes("hosted_deployment"), true);
  assert.equal(gatewayProjectPayload.deployment.writes, false);
  assert.equal(gatewayProjectPayload.state.durable, true);
  assert.equal(gatewayProjectPayload.state.coordinatorSignature?.verified, true);

  const gatewayServe = await runCliCapture(["gateway", "serve", "--state-dir", stateDir, "--record", "true", "--gateway-node", "gateway.self", "--coordinator-node", "coord.home", "--bind-address", "127.0.0.1:24102", ...coordinatorSigningFlags, "--json"], process.cwd());
  assert.equal(gatewayServe.code, CLI_EXIT_OK);
  const gatewayServePayload = parseCliJson<{ deployment: { deploymentKind: string; externalPending: string[] }; state: { coordinatorSignature?: { verified: boolean } } }>(gatewayServe.stdout).data;
  assert.equal(gatewayServePayload.deployment.deploymentKind, "self_hosted");
  assert.equal(gatewayServePayload.deployment.externalPending.includes("self_hosted_deployment"), true);
  assert.equal(gatewayServePayload.state.coordinatorSignature?.verified, true);

  const agentService = await runCliCapture(["gateway", "agent-service", "--tenant-id", "tenant.acme", "--agent-id", "agent.support", "--assignment-id", "assignment.service", "--estimated-cost-cents", "300", "--json"], process.cwd());
  assert.equal(agentService.code, CLI_EXIT_OK);
  const agentServicePayload = parseCliJson<{
    allowed: boolean;
    billingAccountId: string;
    isolationKey: string;
    audit: { eventType: string; decision: string };
    writes: boolean;
  }>(agentService.stdout).data;
  assert.equal(agentServicePayload.allowed, true);
  assert.equal(agentServicePayload.billingAccountId, "billing.demo");
  assert.match(agentServicePayload.isolationKey, /^(?:\*+vice|ten\.\.\.ice)$/);
  assert.equal(agentServicePayload.audit.eventType, "remote.agent_service.evaluated");
  assert.equal(agentServicePayload.writes, false);

  const recordedAgentService = await runCliCapture(["gateway", "agent-service", "--tenant-id", "tenant.acme", "--agent-id", "agent.support", "--assignment-id", "assignment.service", "--estimated-cost-cents", "300", "--state-dir", stateDir, "--record", "true", ...coordinatorSigningFlags, "--json"], process.cwd());
  assert.equal(recordedAgentService.code, CLI_EXIT_OK);
  const recordedAgentServicePayload = parseCliJson<{
    status: string;
    writes: boolean;
    decision: { allowed: boolean; writes: boolean };
    receipt: { status: string; runtimeExecutionVerified: boolean; billingMeterPersisted: boolean; externalPending: string[]; writes: boolean };
    state: { durable: boolean; coordinatorSignature?: { verified: boolean } };
  }>(recordedAgentService.stdout).data;
  assert.equal(recordedAgentServicePayload.status, "signed_agent_service_receipt_recorded");
  assert.equal(recordedAgentServicePayload.writes, false);
  assert.equal(recordedAgentServicePayload.decision.allowed, true);
  assert.equal(recordedAgentServicePayload.decision.writes, false);
  assert.equal(recordedAgentServicePayload.receipt.status, "signed_pending_runtime");
  assert.equal(recordedAgentServicePayload.receipt.runtimeExecutionVerified, false);
  assert.equal(recordedAgentServicePayload.receipt.billingMeterPersisted, false);
  assert.equal(recordedAgentServicePayload.receipt.externalPending.includes("agent_runtime_execution"), true);
  assert.equal(recordedAgentServicePayload.receipt.externalPending.includes("billing_meter_persistence"), true);
  assert.equal(recordedAgentServicePayload.receipt.writes, false);
  assert.equal(recordedAgentServicePayload.state.durable, true);
  assert.equal(recordedAgentServicePayload.state.coordinatorSignature?.verified, true);

  const gatewayAudit = await runCliCapture(["gateway", "audit", "--route-id", "remote.chatGateway", "--resource-type", "session", "--resource-id", "session.demo", "--action", "read", "--actor-kind", "human", "--actor-id", "user.remote", "--state-dir", stateDir, "--record", "true", ...coordinatorSigningFlags, "--json"], process.cwd());
  assert.equal(gatewayAudit.code, CLI_EXIT_OK);
  const gatewayAuditPayload = parseCliJson<{
    status: string;
    writes: boolean;
    receipt: { routeId: string; hostAuditStore: string; signedHostAuditPersisted: boolean; externalPending: string[]; writes: boolean };
    state: { durable: boolean; coordinatorSignature?: { verified: boolean } };
  }>(gatewayAudit.stdout).data;
  assert.equal(gatewayAuditPayload.status, "signed_gateway_audit_receipt_recorded");
  assert.equal(gatewayAuditPayload.writes, false);
  assert.equal(gatewayAuditPayload.receipt.routeId, "remote.chatGateway");
  assert.equal(gatewayAuditPayload.receipt.hostAuditStore, "signed_host_audit");
  assert.equal(gatewayAuditPayload.receipt.signedHostAuditPersisted, false);
  assert.equal(gatewayAuditPayload.receipt.externalPending.includes("signed_host_audit_persistence"), true);
  assert.equal(gatewayAuditPayload.receipt.writes, false);
  assert.equal(gatewayAuditPayload.state.durable, true);
  assert.equal(gatewayAuditPayload.state.coordinatorSignature?.verified, true);
});
