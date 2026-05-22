import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import Database from "better-sqlite3";
import { test } from "vitest";
import assert from "node:assert/strict";
import { registeredDatabasePath, registeredPrivateApiRouteTemplate, registeredSearchDatabasePath } from "../../../tests/helpers/stable-surface-test-builders.ts";
import { clawEventsPath, remoteSyncRequiredRouteIds } from "@clawjs/core";

import { CLI_EXIT_OK, CLI_EXIT_USAGE } from "./cli-errors.ts";
import { resolveInspectAgentHome } from "./inspect-cli.ts";
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

test("inspect agent audit resolves its default home through the shared storage helper", () => {
  assert.equal(resolveInspectAgentHome({}, {}, "/Users/demo"), "/Users/demo/.claw");
  assert.equal(resolveInspectAgentHome({ "claw-home": "~/inspect-claw" }, {}, "/Users/demo"), "/Users/demo/inspect-claw");
  assert.equal(resolveInspectAgentHome({ home: "~/inspect-home" }, { CLAW_HOME: "~/env-claw" }, "/Users/demo"), "/Users/demo/inspect-home");
  assert.equal(resolveInspectAgentHome({}, { CLAW_HOME: "~/env-claw" }, "/Users/demo"), "/Users/demo/env-claw");
});

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

test("runCli exposes an agent inspection fiche", async () => {
  const previousHome = process.env.CLAW_HOME;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-inspect-agent-"));
  process.env.CLAW_HOME = home;
  try {
    const upsert = await runCliCapture(["agents", "upsert", "agent.inspect", "--name", "Inspect Agent", "--json"], process.cwd());
    assert.equal(upsert.code, CLI_EXIT_OK);

    const result = await runCliCapture(["inspect", "agent", "agent.inspect", "--json"], process.cwd());
    assert.equal(result.code, CLI_EXIT_OK);
    const payload = parseCliJson<{
      agent: { id: string; name: string; runtime: string };
      owner: { source: string };
      risks: string[];
      gaps: string[];
      controlPanel: { panelKind: string; posture: { failClosed: boolean }; audit: { kind: string } };
      privacyLifecycle: { planKind: string; operation: string; audit: { kind: string } };
      tests: string[];
    }>(result.stdout).data;
    assert.equal(payload.agent.id, "agent.inspect");
    assert.equal(payload.agent.name, "Inspect Agent");
    assert.equal(payload.owner.source, "agents_v1_projection");
    assert.equal(payload.controlPanel.panelKind, "claw_agent_control_panel");
    assert.equal(payload.controlPanel.posture.failClosed, true);
    assert.equal(payload.privacyLifecycle.planKind, "claw_agent_privacy_lifecycle_plan");
    assert.equal(payload.privacyLifecycle.operation, "export");
    assert.equal(payload.risks.includes("empty_grants_fail_closed"), true);
    assert.equal(payload.gaps.includes("no_resource_grants"), true);
    assert.equal(payload.tests.includes("packages/clawjs/src/inspect-cli.test.ts"), true);
  } finally {
    if (previousHome === undefined) delete process.env.CLAW_HOME;
    else process.env.CLAW_HOME = previousHome;
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("runCli renders an Agents V1 inspect fiche with grants, routes, memory, and gaps", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-inspect-agent-"));
  const dataRoot = path.join(tempRoot, "data");
  const homeRoot = path.join(tempRoot, "home");
  await withPatchedEnv({ CLAW_DATA_DIR: dataRoot, CLAW_HOME: homeRoot }, async () => {
    const upsert = await runCliCapture(["agents", "upsert", "agent.support", "--name", "Support", "--role", "Support agent", "--secret-ref", "vault://agents/support", "--json"], process.cwd());
    assert.equal(upsert.code, CLI_EXIT_OK);

    const sqlite = new Database(registeredDatabasePath(dataRoot, "claw.database.core"));
    try {
      ensureV1MainSchema(sqlite);
      const now = "2026-05-17T10:00:00.000Z";
      sqlite.prepare(`
        INSERT INTO agent_assignments (id, agent_id, kind, status, label, channel, endpoint_ref, privacy_policy, external_disclosure, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run("assignment.web", "agent.support", "external_web_chat", "active", "Website chat", "chat", "web:support", "hashed", "transparent_agent", now, now);
      sqlite.prepare(`
        INSERT INTO agent_execution_profiles (id, agent_id, name, runtime, model, execution_mode, host_access, network_policy, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run("profile.safe", "agent.support", "Safe profile", "codex", "gpt-5.1", "async", "none", "connector_only", now, now);
      sqlite.prepare(`
        INSERT INTO agent_resource_grants (id, agent_id, assignment_id, execution_profile_id, effect, resource_type, resource_id, action, scope_type, scope_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run("grant.support.read", "agent.support", "assignment.web", "profile.safe", "allow", "collection", "support_conversations", "read", "customer", "customer_1", now, now);
      sqlite.prepare(`
        INSERT INTO agent_memory_policies (id, agent_id, name, read_scopes_json, write_scopes_json, write_policy, cross_user_boundary, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run("memory.support", "agent.support", "Support memory", JSON.stringify([{ layer: "customer", access: "read" }]), JSON.stringify([{ layer: "agent_private", access: "write" }]), "private_only", "explicit_grant_only", now, now);
      sqlite.prepare(`
        INSERT INTO agent_budgets (id, agent_id, assignment_id, name, currency, limit_json, usage_json, exceeded_behavior, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run("budget.support", "agent.support", "assignment.web", "Support budget", "USD", JSON.stringify({ monthlyUsd: 25 }), "{}", "pause_affected_scope", now, now);
    } finally {
      sqlite.close();
    }

    const inspect = await runCliCapture(["inspect", "agent", "agent.support", "--json"], process.cwd());
    assert.equal(inspect.code, CLI_EXIT_OK);
    const fiche = parseCliJson<{
      agent: { id: string; name: string };
      assignments: Array<{ id: string; kind: string; status: string }>;
      resourceGrants: Array<{ id: string; resourceId: string }>;
      memoryPolicies: Array<{ id: string; writePolicy: string }>;
      executionProfiles: Array<{ id: string; networkPolicy: string }>;
      budgets: Array<{ id: string }>;
      routes: Array<{ id: string }>;
      risks: string[];
      gaps: string[];
      controlPanel: { permissions: { allowGrants: number }; operationalSnapshot: { snapshotKind: string } };
      privacyLifecycle: { actions: Array<{ disposition: string }> };
      tests: string[];
    }>(inspect.stdout).data;
    assert.equal(fiche.agent.id, "agent.support");
    assert.equal(fiche.assignments.some((entry) => entry.id === "assignment.web" && entry.status === "active"), true);
    assert.equal(fiche.resourceGrants.some((entry) => entry.resourceId === "support_conversations"), true);
    assert.equal(fiche.memoryPolicies.some((entry) => entry.writePolicy === "private_only"), true);
    assert.equal(fiche.executionProfiles.some((entry) => entry.networkPolicy === "connector_only"), true);
    assert.equal(fiche.budgets.some((entry) => entry.id === "budget.support"), true);
    assert.equal(fiche.controlPanel.permissions.allowGrants, 1);
    assert.equal(fiche.controlPanel.operationalSnapshot.snapshotKind, "claw_agent_operational_snapshot");
    assert.equal(fiche.privacyLifecycle.actions.some((action) => action.disposition === "include_export"), true);
    assert.equal(fiche.routes.some((entry) => entry.id === "agents.externalSupportAssignment"), true);
    assert.equal(fiche.risks.includes("secret_refs_require_brokered_leases"), true);
    assert.equal(fiche.gaps.includes("no_resource_grants"), false);
    assert.equal(fiche.tests.includes("packages/clawjs/src/inspect-cli.test.ts"), true);
  });
});

test("runCli filters stable contract surface categories", async () => {
  const apis = await runCliCapture(["inspect", "apis", "--json"], process.cwd());
  assert.equal(apis.code, CLI_EXIT_OK);
  const apiPayload = parseCliJson<Array<{ id: string; method?: string; route?: string }>>(apis.stdout).data;
  assert.equal(apiPayload.some((node) => node.id === "claw.api.events" && node.route === clawEventsPath), true);
  assert.deepEqual(
    apiPayload
      .filter((node) => typeof node.route === "string" && /^\/v1\/(remote|gateway|sync|nodes|mesh)\b/.test(node.route))
      .map((node) => `${node.method} ${node.route}`),
    expectedRemoteApiMethodRoutes,
  );

  const privateApis = await runCliCapture(["inspect", "private-apis", "--json"], process.cwd());
  assert.equal(privateApis.code, CLI_EXIT_OK);
  assert.equal(parseCliJson<Array<{ id: string; kind: string; route?: string }>>(privateApis.stdout).data.some((node) => node.kind === "privateApiRoute" && node.route === registeredPrivateApiRouteTemplate("claw.privateApi.appsAppIdDashboard")), true);

  const env = await runCliCapture(["inspect", "env", "--json"], process.cwd());
  assert.equal(env.code, CLI_EXIT_OK);
  assert.equal(parseCliJson<Array<{ id: string; value?: string }>>(env.stdout).data.some((node) => node.id === "claw.env.home" && node.value === "CLAW_HOME"), true);
  assert.equal(parseCliJson<Array<{ id: string; value?: string }>>(env.stdout).data.some((node) => node.id === "claw.env.hostDisableSocketFallback" && node.value === "CLAW_HOST_DISABLE_SOCKET_FALLBACK"), true);
  assert.equal(parseCliJson<Array<{ id: string; value?: string }>>(env.stdout).data.some((node) => node.id === "claw.env.hostDisableLegacySocketFallback"), false);

  const packages = await runCliCapture(["inspect", "packages", "--json"], process.cwd());
  assert.equal(packages.code, CLI_EXIT_OK);
  assert.equal(parseCliJson<Array<{ id: string; kind: string; value?: string }>>(packages.stdout).data.some((node) => node.kind === "packageName" && node.value === "@clawjs/core"), true);
  assert.equal(parseCliJson<Array<{ id: string; kind: string; value?: string }>>(packages.stdout).data.some((node) => node.kind === "packageBin" && node.value === "claw"), true);

  const native = await runCliCapture(["inspect", "native", "--json"], process.cwd());
  assert.equal(native.code, CLI_EXIT_OK);
  assert.equal(parseCliJson<Array<{ id: string; kind: string; value?: string }>>(native.stdout).data.some((node) => node.kind === "nativeIdentity" && node.id === "clawix.native.bridge.service" && node.value === "clawix-bridge"), true);

  const formats = await runCliCapture(["inspect", "formats", "--json"], process.cwd());
  assert.equal(formats.code, CLI_EXIT_OK);
  assert.equal(parseCliJson<Array<{ id: string; kind: string; value?: string }>>(formats.stdout).data.some((node) => node.kind === "fileFormat" && node.value === ".clawbackup"), true);

  const protocols = await runCliCapture(["inspect", "protocols", "--json"], process.cwd());
  assert.equal(protocols.code, CLI_EXIT_OK);
  assert.equal(parseCliJson<Array<{ id: string; kind: string }>>(protocols.stdout).data.some((node) => node.id === "claw.protocol.hostCommand.v1" && node.kind === "protocol"), true);

  const ids = await runCliCapture(["inspect", "ids", "--json"], process.cwd());
  assert.equal(ids.code, CLI_EXIT_OK);
  assert.equal(parseCliJson<Array<{ id: string; value?: string }>>(ids.stdout).data.some((node) => node.id === "claw.id.session" && node.value === "sessionId"), true);

  const cli = await runCliCapture(["inspect", "cli", "--json"], process.cwd());
  assert.equal(cli.code, CLI_EXIT_OK);
  assert.equal(parseCliJson<Array<{ id: string; value?: string }>>(cli.stdout).data.some((node) => node.id === "claw.cli.command.inspect" && node.value === "inspect"), true);

  const surfaces = await runCliCapture(["inspect", "surfaces", "--json"], process.cwd());
  assert.equal(surfaces.code, CLI_EXIT_OK);
  assert.equal(parseCliJson<Array<{ id: string; humanSurfaces?: string[]; programmaticSurfaces?: string[] }>>(surfaces.stdout).data.some((node) => node.id === "claw.contracts" && node.humanSurfaces?.includes("humanUi") && node.programmaticSurfaces?.includes("cli")), true);
});

test("runCli exposes CLI aliases and decision sources through inspect", async () => {
  const commands = await runCliCapture(["inspect", "commands", "--json"], process.cwd());
  assert.equal(commands.code, CLI_EXIT_OK);
  const commandPayload = parseCliJson<Array<{ id: string; value?: string }>>(commands.stdout).data;
  assert.equal(commandPayload.some((entry) => entry.id === "claw.cli.command.host" && entry.value === "host"), true);
  assert.equal(commandPayload.some((entry) => entry.id === "claw.cli.command.system" && entry.value === "system"), true);
  assert.equal(commandPayload.some((entry) => entry.id === "claw.cli.command.images" && entry.value === "images"), true);

  const advancedCommands = await runCliCapture(["inspect", "commands", "--all=true", "--json"], process.cwd());
  assert.equal(advancedCommands.code, CLI_EXIT_OK);
  const advancedCommandPayload = parseCliJson<Array<{ id: string; value?: string }>>(advancedCommands.stdout).data;
  assert.equal(advancedCommandPayload.some((entry) => entry.id === "claw.cli.command.iot" && entry.value === "iot"), true);

  const aliases = await runCliCapture(["inspect", "aliases", "--json"], process.cwd());
  assert.equal(aliases.code, CLI_EXIT_OK);
  const aliasPayload = parseCliJson<{ aliases: Array<{ alias: string; canonicalName: string; source: string; shadowedByCommand?: string }> }>(aliases.stdout).data;
  assert.equal(aliasPayload.aliases.some((entry) => entry.alias === "db" && entry.canonicalName === "database"), true);
  assert.equal(aliasPayload.aliases.some((entry) => entry.alias === "contacts" && entry.canonicalName === "database" && entry.source === "command"), true);
  assert.equal(aliasPayload.aliases.some((entry) => entry.alias === "life" && entry.canonicalName === "signals" && entry.source === "command"), true);
  assert.equal(aliasPayload.aliases.some((entry) => entry.alias === "image" && entry.canonicalName === "images"), true);
  assert.equal(aliasPayload.aliases.some((entry) => entry.alias === "lead" && entry.canonicalName === "leads" && entry.source === "collection"), true);
  assert.equal(aliasPayload.aliases.some((entry) => entry.alias === "sessions" && entry.canonicalName === "agent_sessions" && entry.shadowedByCommand === "sessions"), true);

  const commandIntents = await runCliCapture(["inspect", "command-intents", "--json"], process.cwd());
  assert.equal(commandIntents.code, CLI_EXIT_OK);
  const commandIntentPayload = parseCliJson<{ routeId: string; ledgerSurfaceId: string; registryIntents: Array<{ id: string; status: string }> }>(commandIntents.stdout).data;
  assert.equal(commandIntentPayload.routeId, "cli.commandIntentResolution");
  assert.equal(commandIntentPayload.ledgerSurfaceId, "claw.workspace.command_intents.ledger");
  assert.equal(commandIntentPayload.registryIntents.some((entry) => entry.id === "cmd_intent_house_buy" && entry.status === "future"), true);

  const professionalRecords = await runCliCapture(["inspect", "dense-data", "--json"], process.cwd());
  assert.equal(professionalRecords.code, CLI_EXIT_OK);
  const professionalRecordsPayload = parseCliJson<{ registry: { foundationCollections: Record<string, string>; systems: Array<{ id: string }>; externalPendingRequirements: Array<{ systemId: string; status: string }>; existingSurfaceIntegrations: Array<{ id: string; disposition: string; canonicalOwner: string }> }; gapCount: number; intentCount: number; semanticViewCount: number }>(professionalRecords.stdout).data;
  assert.equal(professionalRecordsPayload.registry.foundationCollections.quality_gaps, "quality_gaps");
  assert.equal(professionalRecordsPayload.registry.systems.some((entry) => entry.id === "health"), true);
  assert.equal(professionalRecordsPayload.registry.externalPendingRequirements.some((entry) => entry.systemId === "labs" && entry.status === "external_pending"), true);
  assert.equal(professionalRecordsPayload.registry.existingSurfaceIntegrations.some((entry) => entry.id === "knowledge_graph_relations" && entry.canonicalOwner.includes("entity_relations")), true);
  assert.equal(professionalRecordsPayload.registry.existingSurfaceIntegrations.some((entry) => entry.id === "infra_observability_monitor_ops" && entry.disposition === "split"), true);
  assert.ok(professionalRecordsPayload.gapCount > 0);
  assert.ok(professionalRecordsPayload.intentCount > 0);
  assert.ok(professionalRecordsPayload.semanticViewCount > 0);

  const denseGaps = await runCliCapture(["inspect", "dense-gaps", "--json"], process.cwd());
  assert.equal(denseGaps.code, CLI_EXIT_OK);
  const denseGapPayload = parseCliJson<{ gaps: Array<{ id: string; source: string; status: string; phrase?: string; requirementId?: string; command?: string }> }>(denseGaps.stdout).data;
  assert.equal(denseGapPayload.gaps.some((entry) => entry.source === "intent" && entry.status === "workflow_gap" && entry.phrase === "claw utility-account list"), true);
  assert.equal(denseGapPayload.gaps.some((entry) => entry.source === "external_pending" && entry.status === "external_pending" && entry.requirementId === "external_pending_health_ehr_export"), true);
  assert.equal(denseGapPayload.gaps.some((entry) => entry.source === "policy" && entry.status === "blocked" && entry.command === "purge"), true);

  const denseIntents = await runCliCapture(["inspect", "dense-intents", "--json"], process.cwd());
  assert.equal(denseIntents.code, CLI_EXIT_OK);
  const denseIntentPayload = parseCliJson<{ intents: Array<{ phrase: string; status: string; collectionName?: string }> }>(denseIntents.stdout).data;
  assert.equal(denseIntentPayload.intents.some((entry) => entry.phrase === "claw patient list" && entry.status === "covered" && entry.collectionName === "patients"), true);
  assert.equal(denseIntentPayload.intents.some((entry) => entry.phrase === "claw encounter list" && entry.status === "covered" && entry.collectionName === "encounters"), true);

  const denseViews = await runCliCapture(["inspect", "dense-views", "--json"], process.cwd());
  assert.equal(denseViews.code, CLI_EXIT_OK);
  const denseViewsPayload = parseCliJson<{ semanticViews: Array<{ id: string; systemId: string; commandPattern: string }> }>(denseViews.stdout).data;
  assert.equal(denseViewsPayload.semanticViews.some((entry) => entry.id === "patient.timeline" && entry.systemId === "health" && entry.commandPattern === "claw patient <id> timeline"), true);

  const denseFixtures = await runCliCapture(["inspect", "dense-fixtures", "--json"], process.cwd());
  assert.equal(denseFixtures.code, CLI_EXIT_OK);
  const denseFixturesPayload = parseCliJson<{ fixtureSetId: string; records: Array<{ id: string; collectionName: string; covers: string[] }> }>(denseFixtures.stdout).data;
  assert.equal(denseFixturesPayload.fixtureSetId, "dense-data-acceptance-v1");
  assert.equal(denseFixturesPayload.records.some((entry) => entry.collectionName === "patients" && entry.covers.includes("patient")), true);
  assert.equal(denseFixturesPayload.records.some((entry) => entry.collectionName === "quality_gaps" && entry.covers.includes("partial_data_gap")), true);

  const why = await runCliCapture(["inspect", "why", "host", "--json"], process.cwd());
  assert.equal(why.code, CLI_EXIT_OK);
  const whyEnvelope = parseCliJson<{ name: string; adrs: string[]; docs: string[]; tests: string[]; source: { file: string } }>(why.stdout);
  assert.equal(whyEnvelope.meta.subcommand, "why");
  const whyPayload = whyEnvelope.data;
  assert.equal(whyPayload.name, "host");
  assert.equal(whyPayload.adrs.includes("docs/adr/0007-cli-agent-interface.md"), true);
  assert.equal(whyPayload.docs.includes("docs/cli.md"), true);
  assert.equal(whyPayload.tests.includes("packages/clawjs/src/index.test.ts"), true);
  assert.equal(whyPayload.source.file, "packages/clawjs/src/cli-host-command.ts");
});

test("runCli exposes the generated codebase manifest through inspect", async () => {
  const codebase = await runCliCapture(["inspect", "codebase", "--json"], process.cwd());
  assert.equal(codebase.code, CLI_EXIT_OK);
  const payload = parseCliJson<{
    schemaVersion: number;
    astCoverage: { typescript: string; javascript: string; swift: string };
    summary: { files: number; languages: { typescript: number; javascript: number; swift: number } };
    files: Array<{ path: string; declarations: Array<{ name: string }> }>;
  }>(codebase.stdout).data;
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.astCoverage.typescript, "typescript-compiler-api");
  assert.equal(payload.astCoverage.javascript, "typescript-compiler-api");
  assert.equal(payload.summary.files > 0, true);
  assert.equal(payload.summary.languages.typescript > 0, true);
  assert.equal(payload.files.some((file) => file.path === "packages/clawjs/src/inspect-cli.ts" && file.declarations.some((entry) => entry.name === "runInspectCli")), true);
});

test("runCli can summarize and filter the codebase manifest through inspect", async () => {
  const summary = await runCliCapture(["inspect", "codebase", "--summary", "--json"], process.cwd());
  assert.equal(summary.code, CLI_EXIT_OK);
  const summaryPayload = parseCliJson<{
    summary: { files: number };
    files?: unknown[];
  }>(summary.stdout).data;
  assert.equal(summaryPayload.summary.files > 0, true);
  assert.equal("files" in summaryPayload, false);

  const filtered = await runCliCapture([
    "inspect",
    "codebase",
    "--path-prefix",
    "packages/clawjs/src/",
    "--symbol",
    "runInspectCli",
    "--language",
    "typescript",
    "--tests",
    "false",
    "--limit",
    "5",
    "--json",
  ], process.cwd());
  assert.equal(filtered.code, CLI_EXIT_OK);
  const filteredPayload = parseCliJson<{
    filter: { pathPrefix: string; symbol: string; language: string; tests: boolean; limit: number; totalMatched: number; returned: number };
    files: Array<{ path: string; language: string; test: boolean; declarations: Array<{ name: string }> }>;
  }>(filtered.stdout).data;
  assert.equal(filteredPayload.filter.pathPrefix, "packages/clawjs/src/");
  assert.equal(filteredPayload.filter.symbol, "runInspectCli");
  assert.equal(filteredPayload.filter.language, "typescript");
  assert.equal(filteredPayload.filter.tests, false);
  assert.equal(filteredPayload.filter.limit, 5);
  assert.equal(filteredPayload.files.length <= 5, true);
  assert.equal(filteredPayload.files.some((file) => file.path === "packages/clawjs/src/inspect-cli.ts" && file.declarations.some((entry) => entry.name === "runInspectCli")), true);
  assert.equal(filteredPayload.files.every((file) => file.path.startsWith("packages/clawjs/src/") && file.language === "typescript" && file.test === false), true);
});

test("runCli fuses multiple codebase manifests through inspect", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-inspect-codebase-"));
  const frameworkManifestPath = path.join(tempRoot, "clawjs-codebase.json");
  const hostManifestPath = path.join(tempRoot, "clawix-codebase.json");
  fs.writeFileSync(frameworkManifestPath, JSON.stringify({
    schemaVersion: 1,
    repository: "ClawJS",
    root: ".",
    scope: "repository",
    astCoverage: { typescript: "typescript-compiler-api" },
    summary: {
      files: 1,
      tests: 0,
      entrypoints: 1,
      languages: { typescript: 1, javascript: 0, swift: 0 },
    },
    files: [{
      path: "packages/clawjs/src/inspect-cli.ts",
      language: "typescript",
      declarations: [{ kind: "function", name: "runInspectCli", exported: true }],
    }],
  }), "utf8");
  fs.writeFileSync(hostManifestPath, JSON.stringify({
    schemaVersion: 1,
    repository: "Clawix",
    root: ".",
    scope: "repository",
    astCoverage: { swift: "structural-regex" },
    summary: {
      files: 1,
      tests: 1,
      entrypoints: 0,
      languages: { typescript: 0, javascript: 0, swift: 1 },
    },
    files: [{
      path: "macos/Sources/Clawix/AppState.swift",
      language: "swift",
      declarations: [{ kind: "class", name: "AppState", exported: false }],
    }],
  }), "utf8");

  const codebase = await runCliCapture(["inspect", "codebase", "--codebase-manifest", `${frameworkManifestPath},${hostManifestPath}`, "--json"], process.cwd());
  assert.equal(codebase.code, CLI_EXIT_OK);
  const payload = parseCliJson<{
    scope: string;
    summary: { files: number; tests: number; entrypoints: number; languages: { typescript: number; swift: number } };
    manifests: Array<{ repository: string; manifestPath: string }>;
    files: Array<{ repository: string; manifestPath: string; path: string }>;
  }>(codebase.stdout).data;
  assert.equal(payload.scope, "workspace");
  assert.deepEqual(payload.summary, {
    files: 2,
    tests: 1,
    entrypoints: 1,
    languages: { typescript: 1, javascript: 0, swift: 1 },
  });
  assert.equal(payload.manifests.some((entry) => entry.repository === "Clawix" && entry.manifestPath === hostManifestPath), true);
  assert.equal(payload.files.some((file) => file.repository === "Clawix" && file.path === "macos/Sources/Clawix/AppState.swift"), true);
});

test("runCli exposes connector catalog support and external schema coverage through inspect", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-inspect-connectors-"));
  const catalogPath = path.join(tempRoot, "connectors.json");
  fs.writeFileSync(catalogPath, JSON.stringify({
    version: 1,
    apps: [{
      id: "chat_service",
      name: "Chat Service",
      authFieldNames: ["token"],
      operations: [{
        id: "chat_service.action.send-message",
        kind: "action",
        name: "Send Message",
        authFieldNames: ["token"],
        support: {
          state: "supported",
          reason: "Covered by offline fixtures.",
        },
        externalSchema: {
          status: "complete",
          source: "https://api.example.invalid/openapi.json",
          providerVersion: "2026-05-14",
          evidence: ["packages/clawjs/src/inspect-cli.test.ts"],
          inputSchema: { type: "object" },
          outputSchema: { type: "object" },
        },
        executionPolicy: {
          readOnly: false,
          requiresAuth: true,
          requiresHostApproval: false,
          destructive: false,
          costRisk: false,
          dryRunSupported: true,
          auditRequired: true,
        },
        runtime: {
          hasRun: true,
          hasHooks: false,
          hasAdditionalProps: false,
          hasMethods: false,
        },
      }],
    }],
  }), "utf8");

  const connectors = await runCliCapture(["inspect", "connectors", "--connector-catalog", catalogPath, "--json"], process.cwd());
  assert.equal(connectors.code, CLI_EXIT_OK);
  const payload = parseCliJson<{
    controlPlane: { publicSurface: string; discoveryAlias: string; pipeline: string[]; blockByDefault: boolean };
    summary: { apps: number; operations: number; supportedOperations: number; completeExternalSchemas: number; authRequiredOperations: number; controlPlaneReadyOperations: number };
    apps: Array<{ id: string; operations: Array<{ id: string; externalSchema: { status: string; hasInputSchema: boolean; hasOutputSchema: boolean }; controlPlane: { state: string; issues: string[] } }> }>;
  }>(connectors.stdout).data;
  assert.deepEqual(payload.summary, {
    apps: 1,
    operations: 1,
    supportedOperations: 1,
    completeExternalSchemas: 1,
    authRequiredOperations: 1,
    hostRequiredOperations: 0,
    costRiskOperations: 0,
    controlPlaneReadyOperations: 1,
    controlPlaneBlockedOperations: 0,
    operationsMissingAuditPolicy: 0,
    operationsMissingCredentialScope: 0,
    operationsMissingRuntimeEvidence: 0,
  });
  assert.equal(payload.controlPlane.publicSurface, "connectors");
  assert.equal(payload.controlPlane.discoveryAlias, "integrations");
  assert.equal(payload.controlPlane.blockByDefault, true);
  assert.equal(payload.controlPlane.pipeline.includes("credential_broker_lease"), true);
  assert.equal(payload.apps[0]?.operations[0]?.externalSchema.status, "complete");
  assert.equal(payload.apps[0]?.operations[0]?.externalSchema.hasInputSchema, true);
  assert.equal(payload.apps[0]?.operations[0]?.externalSchema.hasOutputSchema, true);
  assert.equal(payload.apps[0]?.operations[0]?.controlPlane.state, "ready");
});

test("runCli fuses static inspect manifests from other language builders", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-inspect-manifest-"));
  const manifestPath = path.join(tempRoot, "clawix-persistent-surface.json");
  fs.writeFileSync(manifestPath, JSON.stringify({
    version: 1,
    nodes: [
      {
        id: "clawix.database.local",
        kind: "database",
        steward: "clawix",
        repo: "Clawix",
        project: "macos",
        language: "swift",
        name: "Clawix local database",
        path: "~/Library/Application Support/Clawix/clawix.sqlite",
        storageClass: "nativeAppData",
        canonicality: "hostOnly",
        privacy: "userData",
        lifecycle: "durable",
      },
      {
        id: "clawix.database.local.table.projects",
        kind: "table",
        steward: "clawix",
        repo: "Clawix",
        project: "macos",
        language: "swift",
        name: "projects",
        databaseId: "clawix.database.local",
        parentId: "clawix.database.local",
        storageClass: "nativeAppData",
        canonicality: "hostOnly",
        privacy: "userData",
        lifecycle: "durable",
      },
      {
        id: "clawix.protocol.bridge.v1",
        kind: "protocol",
        steward: "clawix",
        repo: "Clawix",
        project: "core",
        language: "swift",
        name: "Clawix bridge protocol",
        value: "clawix-bridge-v1",
        storageClass: "external",
        canonicality: "hostOnly",
        privacy: "public",
        lifecycle: "durable",
        surfaceClass: "protocol",
        stability: "v1",
      },
    ],
  }, null, 2));

  const show = await runCliCapture(["inspect", "show", "clawix.database.local", "--manifest", manifestPath, "--json"], process.cwd());
  assert.equal(show.code, CLI_EXIT_OK);
  const payload = parseCliJson<{ language?: string; path?: string }>(show.stdout).data;
  assert.equal(payload.language, "swift");
  assert.equal(payload.path, "~/Library/Application Support/Clawix/clawix.sqlite");

  const listed = await runCliCapture(["inspect", "list", "clawix.database.local", "--manifest", manifestPath, "--json"], process.cwd());
  assert.equal(listed.code, CLI_EXIT_OK);
  assert.equal(parseCliJson<Array<{ id: string }>>(listed.stdout).data[0].id, "clawix.database.local.table.projects");

  const protocols = await runCliCapture(["inspect", "protocols", "--manifest", manifestPath, "--json"], process.cwd());
  assert.equal(protocols.code, CLI_EXIT_OK);
  assert.equal(parseCliJson<Array<{ id: string }>>(protocols.stdout).data.some((node) => node.id === "clawix.protocol.bridge.v1"), true);
});

test("runCli returns inspect JSON errors in the common envelope", async () => {
  const result = await runCliCapture(["inspect", "show", "missing.surface", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_USAGE);
  const payload = JSON.parse(result.stdout) as { ok: boolean; error: { code: string }; meta: { canonicalCommand: string; subcommand: string } };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "inspect_not_found");
  assert.equal(payload.meta.canonicalCommand, "inspect");
  assert.equal(payload.meta.subcommand, "show");
});
