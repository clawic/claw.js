import { test } from "vitest";
import assert from "node:assert/strict";
import { registeredDatabasePath, registeredSearchDatabasePath } from "../../../tests/helpers/stable-surface-test-builders.ts";
import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";

import { MAC_CARE_SIDECAR_FILENAME, clawStorageFiles, resolveClawGlobalDataStorageDir, resolveCodexHomeDir } from "@clawjs/core";

import { CLI_EXIT_OK, CLI_EXIT_USAGE, runCli } from "./index.ts";
import { resolveClawjsDataRoot, resolveClawjsFilesDir, resolveClawjsMainDbPath } from "./v1-data.ts";
import { ensureV1MainSchema, openMainDataStore, openSidecar, writeMcpServers } from "./v1-data-core.ts";
import { captureStream, runInternalV1Cli, useIsolatedClawDataRoot, withPatchedEnv } from "./index-test-utils.ts";

function parseCliJsonPayload<T>(output: string): T {
  const parsed = JSON.parse(output) as { ok?: boolean; data?: unknown; meta?: Record<string, unknown> };
  assert.equal(parsed.ok, true);
  assert.equal(typeof parsed.meta?.canonicalCommand, "string");
  assert.equal(parsed.meta?.schemaVersion, 1);
  return parsed.data as T;
}

test("V2 main data paths default to the Claw home data namespace", () => {
  const defaultDataRoot = resolveClawGlobalDataStorageDir({ homeDir: os.homedir() });
  assert.equal(resolveClawjsDataRoot({} as NodeJS.ProcessEnv), defaultDataRoot);
  assert.equal(resolveClawjsMainDbPath({} as NodeJS.ProcessEnv), path.join(defaultDataRoot, "core.sqlite"));
  assert.equal(resolveClawjsFilesDir({} as NodeJS.ProcessEnv), path.join(defaultDataRoot, "files"));
  const source = fs.readFileSync(new URL("./v1-data-core.ts", import.meta.url), "utf8");
  assert.match(source, /resolveClawGlobalDataStorageDir\(/);
  assert.equal(/resolveClawPersistentSurfacePath\(["']claw[.]global[.]data["']\)/.test(source), false);
  assert.equal(source.includes('resolveClawPersistentSurfacePath("claw.global")'), false);

  const explicit = path.join(os.tmpdir(), "clawjs-explicit-root");
  assert.equal(resolveClawjsDataRoot({ CLAW_DATA_DIR: explicit } as NodeJS.ProcessEnv), explicit);
  assert.equal(resolveClawjsMainDbPath({ CLAW_DATA_DIR: explicit } as NodeJS.ProcessEnv), path.join(explicit, "core.sqlite"));
  assert.equal(
    resolveClawjsDataRoot({
      CLAW_HOME: path.join(os.tmpdir(), "claw-home"),
      CLAW_DATA_DIR: explicit,
    } as NodeJS.ProcessEnv),
    explicit,
  );
  assert.equal(
    resolveClawjsDataRoot({ CLAW_HOME: path.join(os.tmpdir(), "claw-home") } as NodeJS.ProcessEnv),
    path.join(os.tmpdir(), "claw-home", "data"),
  );
  assert.equal(
    resolveClawjsMainDbPath({
      CLAW_DATA_DIR: explicit,
      CLAW_DB_PATH: path.join(os.tmpdir(), "custom-core.sqlite"),
    } as NodeJS.ProcessEnv),
    path.join(os.tmpdir(), "custom-core.sqlite"),
  );
});

test("openMainDataStore does not create sidecar databases until requested", () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-main-lazy-sidecars-"));
  const store = openMainDataStore({ CLAW_DATA_DIR: dataRoot } as NodeJS.ProcessEnv);
  store.close();

  assert.equal(fs.existsSync(registeredDatabasePath(dataRoot, "claw.database.core")), true);
  for (const filename of ["sessions.sqlite", "drive.sqlite", "runtime.sqlite", "search.sqlite", MAC_CARE_SIDECAR_FILENAME]) {
    assert.equal(fs.existsSync(path.join(dataRoot, filename)), false, filename);
  }
});

test("Mac Care sidecar is registered and creates only hermetic plan tables", () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-mac-care-sidecar-"));
  const sqlite = openSidecar(MAC_CARE_SIDECAR_FILENAME, { CLAW_DATA_DIR: dataRoot } as NodeJS.ProcessEnv);
  try {
    assert.equal(fs.existsSync(registeredDatabasePath(dataRoot, "claw.database.macCare")), true);
    const tables = new Set((sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((row) => row.name));
    for (const table of ["mac_care_scans", "mac_care_candidates", "mac_care_action_plans", "mac_care_ignore_rules"]) {
      assert.equal(tables.has(table), true, `missing ${table}`);
    }
    assert.equal(tables.has("mac_care_delete_queue"), false);
    assert.equal(tables.has("mac_care_trash_queue"), false);
  } finally {
    sqlite.close();
  }
});

test("Mac Care V1 storage uses the canonical sidecar filename", () => {
  const source = fs.readFileSync(new URL("./v1-data-core.ts", import.meta.url), "utf8");
  assert.match(source, /SIDECAR_FILENAMES = \[[^\]]*MAC_CARE_SIDECAR_FILENAME/s);
  assert.match(source, /filename === MAC_CARE_SIDECAR_FILENAME/);
  assert.match(source, /path\.join\(root, MAC_CARE_SIDECAR_FILENAME\)/);
  assert.equal(source.includes('filename === "mac_care.sqlite"'), false);
  assert.equal(source.includes('path.join(root, "mac_care.sqlite")'), false);
});

test("Mac Care V1 sidecar schema uses the canonical sidecar filename", () => {
  const source = fs.readFileSync(new URL("./v1-data-surface.ts", import.meta.url), "utf8");
  assert.match(source, /\[MAC_CARE_SIDECAR_FILENAME\]: String\.raw/);
  assert.equal(source.includes('"mac_care.sqlite": String.raw'), false);
});

test("mcp config writes refuse Codex-owned config paths", () => {
  const codexConfig = path.join(resolveCodexHomeDir(os.homedir()), `clawjs-test-${Date.now()}-${Math.random().toString(36).slice(2)}.toml`);
  assert.equal(fs.existsSync(codexConfig), false);
  assert.throws(
    () => writeMcpServers(codexConfig, [{ id: "browser", command: "npx" }]),
    /Refusing write operation inside ~\/\.codex/,
  );
  assert.equal(fs.existsSync(codexConfig), false);
});

test("Codex session roots use the shared storage boundary", () => {
  const source = fs.readFileSync(new URL("./v1-data-core.ts", import.meta.url), "utf8");
  assert.match(source, /resolveCodexSessionsDir\(os\.homedir\(\)\)/);
  assert.match(source, /resolveCodexArchivedSessionsDir\(os\.homedir\(\)\)/);
  assert.equal(source.includes('path.join(os.homedir(), ".codex", "sessions")'), false);
  assert.equal(source.includes('path.join(os.homedir(), ".codex", "archived_sessions")'), false);
});

test("runCli exposes Agents V1 safe surface projection gate", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-agent-surface-projection-"));
  await withPatchedEnv({
    CLAW_HOME: path.join(tempRoot, "home"),
    CLAW_DATA_DIR: tempRoot,
    CLAW_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    DATABASE_FILES_DIR: undefined,
  }, async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-agent-surface-projection-cwd-"));
    const schemaStdout = captureStream();
    assert.equal(await runCli(["agents", "schema", "--json"], {
      stdout: schemaStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const schema = parseCliJsonPayload(schemaStdout.getOutput()) as { gates: string[] };
    assert.equal(schema.gates.includes("surface-projection"), true);
    assert.equal(schema.gates.includes("delegation-check"), true);
    assert.equal(schema.gates.includes("budget-check"), true);
    assert.equal(schema.gates.includes("action-severity"), true);
    assert.equal(schema.gates.includes("autonomy-check"), true);
    assert.equal(schema.gates.includes("dispatch-plan"), true);
    assert.equal(schema.gates.includes("context-pack"), true);
    assert.equal(schema.gates.includes("tool-catalog"), true);
    assert.equal(schema.gates.includes("creation-review"), true);
    assert.equal(schema.gates.includes("storage-audit"), true);
    assert.equal(schema.gates.includes("audit-coverage"), true);
    assert.equal(schema.gates.includes("operational-snapshot"), true);
    assert.equal(schema.gates.includes("config-revision"), true);
    assert.equal(schema.gates.includes("incident"), true);
    assert.equal(schema.gates.includes("activity-feed"), true);
    assert.equal(schema.gates.includes("blueprint"), true);
    assert.equal(schema.gates.includes("evaluation"), true);
    assert.equal(schema.gates.includes("retirement-plan"), true);

    const actionSeverityStdout = captureStream();
    assert.equal(await runCli(["agents", "action-severity", "--record", JSON.stringify({
      action: "delete",
      resourceType: "file",
      nativeHostAccess: true,
      irreversible: true,
    }), "--json"], {
      stdout: actionSeverityStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const actionSeverity = parseCliJsonPayload(actionSeverityStdout.getOutput()) as {
      severity: string;
      approvalRequired: boolean;
      hostGateRequired: boolean;
    };
    assert.equal(actionSeverity.severity, "critical");
    assert.equal(actionSeverity.approvalRequired, true);
    assert.equal(actionSeverity.hostGateRequired, true);

    const autonomyStdout = captureStream();
    assert.equal(await runCli(["agents", "autonomy-check", "--record", JSON.stringify({
      profile: "suggest",
      action: { action: "update", resourceType: "collection" },
    }), "--json"], {
      stdout: autonomyStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const autonomy = parseCliJsonPayload(autonomyStdout.getOutput()) as {
      allowed: boolean;
      dispatchMode: string;
      requiredGates: string[];
    };
    assert.equal(autonomy.allowed, false);
    assert.equal(autonomy.dispatchMode, "suggest_only");
    assert.equal(autonomy.requiredGates.includes("human_approval"), true);

    const dispatchStdout = captureStream();
    assert.equal(await runCli(["agents", "dispatch-plan", "--record", JSON.stringify({
      agentId: "agent-ops",
      assignment: {
        id: "assignment.web",
        agentId: "agent-ops",
        kind: "external_web_chat",
        status: "active",
        channel: "chat",
        privacyPolicy: "hashed",
        externalDisclosure: "transparent_agent",
      },
      assignmentRequest: { kind: "external_web_chat", channel: "chat" },
      executionProfile: { id: "execution.async", executionMode: "async", status: "active", runtime: "service" },
      autonomy: { profile: "act_limited" },
      action: { action: "write", resourceType: "collection" },
      now: "2026-05-17T10:00:00.000Z",
    }), "--json"], {
      stdout: dispatchStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const dispatch = parseCliJsonPayload(dispatchStdout.getOutput()) as {
      planKind: string;
      allowed: boolean;
      disposition: string;
      runStatus: string;
      requiredGates: string[];
      audit: { kind: string; result: string };
    };
    assert.equal(dispatch.planKind, "claw_agent_dispatch_plan");
    assert.equal(dispatch.allowed, false);
    assert.equal(dispatch.disposition, "blocked");
    assert.equal(dispatch.runStatus, "blocked");
    assert.equal(dispatch.requiredGates.includes("external_act"), true);
    assert.equal(dispatch.audit.kind, "dispatch_plan");
    assert.equal(dispatch.audit.result, "blocked");

    const contextGrant = (id: string) => ({
      id,
      resourceType: "*",
      action: "read",
      scopeType: "customer",
      scopeId: "customer_1",
      effect: "allow",
    });
    const contextPackStdout = captureStream();
    assert.equal(await runCli(["agents", "context-pack", "--record", JSON.stringify({
      agentId: "agent-ops",
      assignmentId: "assignment.web",
      view: {
        id: "view.support.customer",
        allowedResourceTypes: ["contact"],
        allowedScopes: [{ scopeType: "customer", scopeId: "customer_1" }],
        includeContent: true,
      },
      requested: [{
        id: "ctx.contact",
        resourceType: "contact",
        resourceId: "contact_1",
        scopeType: "customer",
        scopeId: "customer_1",
        content: { apiToken: "raw", name: "Customer" },
        required: true,
      }, {
        id: "ctx.secret",
        resourceType: "secret",
        resourceId: "vault://agents/ops",
        scopeType: "customer",
        scopeId: "customer_1",
        required: true,
      }],
      agentGrants: [contextGrant("agent")],
      assignmentGrants: [contextGrant("assignment")],
      executionProfileGrants: [contextGrant("execution")],
      connectorGrants: [contextGrant("connector")],
      hostGrants: [contextGrant("host")],
      runScopeGrants: [contextGrant("run")],
      now: "2026-05-17T10:00:00.000Z",
    }), "--json"], {
      stdout: contextPackStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const contextPack = parseCliJsonPayload(contextPackStdout.getOutput()) as {
      packKind: string;
      items: Array<{ id: string; content?: Record<string, unknown> }>;
      denied: Array<{ id: string; reasons: string[] }>;
      gaps: string[];
      audit: { kind: string; result: string };
    };
    assert.equal(contextPack.packKind, "claw_agent_context_pack");
    assert.equal(contextPack.items[0]?.id, "ctx.contact");
    assert.equal(contextPack.items[0]?.content?.name, "Customer");
    assert.equal(contextPack.items[0]?.content?.apiToken === "raw", false);
    assert.equal(contextPack.denied[0]?.id, "ctx.secret");
    assert.equal(contextPack.denied[0]?.reasons.includes("context: resource type secret outside view"), true);
    assert.equal(contextPack.gaps.includes("required_context_denied"), true);
    assert.equal(contextPack.audit.kind, "context_pack");
    assert.equal(contextPack.audit.result, "blocked");

    const toolGrant = (id: string) => ({
      id,
      resourceType: "tool",
      action: "invoke",
      scopeType: "domain",
      scopeId: "support",
      effect: "allow",
    });
    const toolCatalogStdout = captureStream();
    assert.equal(await runCli(["agents", "tool-catalog", "--record", JSON.stringify({
      agentId: "agent-ops",
      assignmentId: "assignment.web",
      allowedDomains: ["support"],
      tools: [{
        id: "support.contacts.lookup",
        title: "Lookup contact",
        description: "Read contact context.",
        domain: "support",
        sourceFeature: "support",
        parameters: { type: "object" },
        riskLevel: "safe",
      }, {
        id: "support.ticket.refund",
        title: "Refund ticket",
        description: "Issue refund.",
        domain: "support",
        sourceFeature: "billing",
        parameters: { type: "object" },
        riskLevel: "sensitive",
        requiresApproval: true,
      }],
      agentGrants: [toolGrant("agent")],
      assignmentGrants: [toolGrant("assignment")],
      executionProfileGrants: [toolGrant("execution")],
      connectorGrants: [toolGrant("connector")],
      hostGrants: [toolGrant("host")],
      runScopeGrants: [toolGrant("run")],
      now: "2026-05-17T10:00:00.000Z",
    }), "--json"], {
      stdout: toolCatalogStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const toolCatalog = parseCliJsonPayload(toolCatalogStdout.getOutput()) as {
      catalogKind: string;
      tools: Array<{ id: string }>;
      blocked: Array<{ id: string; reasons: string[] }>;
      gaps: string[];
      audit: { kind: string };
    };
    assert.equal(toolCatalog.catalogKind, "claw_agent_tool_catalog");
    assert.deepEqual(toolCatalog.tools.map((tool) => tool.id), ["support.contacts.lookup"]);
    assert.equal(toolCatalog.blocked[0]?.id, "support.ticket.refund");
    assert.equal(toolCatalog.blocked[0]?.reasons.includes("tool: approval required"), true);
    assert.equal(toolCatalog.gaps.includes("tool_catalog_has_blocked_tools"), true);
    assert.equal(toolCatalog.audit.kind, "tool_catalog");

    const creationReviewStdout = captureStream();
    assert.equal(await runCli(["agents", "creation-review", "--record", JSON.stringify({
      reviewedAt: "2026-05-17T10:00:00.000Z",
      surface: "external_channel",
      agent: { id: "agent-ops", name: "Ops", role: "Support", secretAllowlist: ["vault://agents/ops"] },
      assignments: [{ id: "assignment.web", agentId: "agent-ops", kind: "external_web_chat", status: "draft", channel: "chat", privacyPolicy: "raw_with_retention" }],
      executionProfiles: [{ id: "execution.web", executionMode: "async", hostAccess: "native_host", networkPolicy: "open" }],
      resourceGrants: [{ id: "grant.secret", resourceType: "secret", resourceId: "vault://agents/ops", action: "lease_secret" }],
    }), "--json"], {
      stdout: creationReviewStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const creationReview = parseCliJsonPayload(creationReviewStdout.getOutput()) as {
      reviewKind: string;
      ready: boolean;
      requiredApprovals: string[];
      gaps: string[];
      audit: { kind: string; result: string };
    };
    assert.equal(creationReview.reviewKind, "claw_agent_creation_review");
    assert.equal(creationReview.ready, false);
    assert.equal(creationReview.requiredApprovals.includes("host"), true);
    assert.equal(creationReview.gaps.includes("active_assignment_missing"), true);
    assert.equal(creationReview.audit.kind, "creation_review");
    assert.equal(creationReview.audit.result, "blocked");

    const storageAuditStdout = captureStream();
    assert.equal(await runCli(["agents", "storage-audit", "--record", JSON.stringify({
      legacyCollections: ["company_agents"],
      observedTables: ["agents", "agent_assignments"],
      auditedAt: "2026-05-17T10:00:00.000Z",
    }), "--json"], {
      stdout: storageAuditStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const storageAudit = parseCliJsonPayload(storageAuditStdout.getOutput()) as {
      auditKind: string;
      ready: boolean;
      missingCollections: string[];
      legacyOverlaps: string[];
      gaps: string[];
      audit: { kind: string; result: string };
    };
    assert.equal(storageAudit.auditKind, "claw_agent_storage_audit");
    assert.equal(storageAudit.ready, false);
    assert.equal(storageAudit.missingCollections.includes("agent_execution_profiles"), true);
    assert.deepEqual(storageAudit.legacyOverlaps, ["company_agents"]);
    assert.equal(storageAudit.gaps.includes("legacy_overlap:company_agents"), true);
    assert.equal(storageAudit.audit.kind, "storage_audit");
    assert.equal(storageAudit.audit.result, "blocked");

    const auditCoverageStdout = captureStream();
    assert.equal(await runCli(["agents", "audit-coverage", "--record", JSON.stringify({
      expectedKinds: ["blueprint", "service_api"],
      events: [{
        id: "audit.blueprint",
        kind: "blueprint",
        agentId: "agent-ops",
        result: "recorded",
        redaction: "strict",
        createdAt: "2026-05-17T10:00:00.000Z",
        metadata: { kind: "blueprint" },
      }],
      auditedAt: "2026-05-17T10:00:00.000Z",
    }), "--json"], {
      stdout: auditCoverageStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const auditCoverage = parseCliJsonPayload(auditCoverageStdout.getOutput()) as {
      reportKind: string;
      ready: boolean;
      missingKinds: string[];
      gaps: string[];
      audit: { kind: string; result: string };
    };
    assert.equal(auditCoverage.reportKind, "claw_agent_audit_coverage");
    assert.equal(auditCoverage.ready, false);
    assert.deepEqual(auditCoverage.missingKinds, ["service_api"]);
    assert.equal(auditCoverage.gaps.includes("missing_audit_kind:service_api"), true);
    assert.equal(auditCoverage.audit.kind, "audit_coverage");
    assert.equal(auditCoverage.audit.result, "blocked");

    const operationalSnapshotStdout = captureStream();
    assert.equal(await runCli(["agents", "operational-snapshot", "--record", JSON.stringify({
      agentId: "agent-ops",
      capturedAt: "2026-05-17T11:00:00.000Z",
      assignments: [{ id: "assignment.web", agentId: "agent-ops", status: "active", updatedAt: "2026-05-17T10:00:00.000Z" }],
      runs: [{ id: "run.1", agentId: "agent-ops", status: "running", startedAt: "2026-05-17T10:30:00.000Z", outcomeJson: { rawTracePath: "/Users/example/run.log" } }],
      sessions: [{ id: "session.1", agentId: "agent-ops", status: "active", createdAt: "2026-05-17T10:20:00.000Z" }],
      audits: [{ id: "audit.run", kind: "dispatch_plan", agentId: "agent-ops", result: "recorded", redaction: "strict", createdAt: "2026-05-17T10:40:00.000Z", metadata: {} }],
    }), "--json"], {
      stdout: operationalSnapshotStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const operationalSnapshot = parseCliJsonPayload(operationalSnapshotStdout.getOutput()) as {
      snapshotKind: string;
      summary: { runs: Record<string, number>; audits: Record<string, number> };
      gaps: string[];
      audit: { kind: string; result: string };
      runs: Array<Record<string, unknown>>;
    };
    assert.equal(operationalSnapshot.snapshotKind, "claw_agent_operational_snapshot");
    assert.equal(operationalSnapshot.summary.runs.running, 1);
    assert.equal(operationalSnapshot.summary.audits.dispatch_plan, 1);
    assert.deepEqual(operationalSnapshot.gaps, []);
    assert.equal(JSON.stringify(operationalSnapshot.runs).includes("/Users/example"), false);
    assert.equal(operationalSnapshot.audit.kind, "operational_snapshot");
    assert.equal(operationalSnapshot.audit.result, "recorded");

    const controlPanelStdout = captureStream();
    assert.equal(await runCli(["agents", "control-panel", "--record", JSON.stringify({
      generatedAt: "2026-05-17T11:00:00.000Z",
      surface: "external_channel",
      agent: { id: "agent-ops", name: "Ops", autonomyProfile: "respond_only", secretAllowlist: ["vault://agents/ops"] },
      assignments: [{ id: "assignment.web", agentId: "agent-ops", kind: "external_web_chat", status: "active", channel: "chat", privacyPolicy: "hashed", externalDisclosure: "transparent_agent" }],
      executionProfiles: [{ id: "execution.web", agentId: "agent-ops", executionMode: "async", networkPolicy: "connector_only" }],
      resourceGrants: [{ id: "grant.support", agentId: "agent-ops", resourceType: "collection", resourceId: "support_conversations", action: "read", effect: "allow" }],
      memoryPolicies: [{ id: "memory.support", writePolicy: "private_only", crossUserBoundary: "explicit_grant_only" }],
      budgets: [{ id: "budget.support", exceededBehavior: "deny_action", limits: [{ dimension: "external_actions", limit: 5 }] }],
      runs: [{ id: "run.1", agentId: "agent-ops", status: "running", startedAt: "2026-05-17T10:30:00.000Z" }],
      sessions: [{ id: "session.1", agentId: "agent-ops", status: "active", createdAt: "2026-05-17T10:20:00.000Z" }],
      audits: [{ id: "audit.run", kind: "dispatch_plan", agentId: "agent-ops", result: "recorded", redaction: "strict", createdAt: "2026-05-17T10:40:00.000Z", metadata: {} }],
    }), "--json"], {
      stdout: controlPanelStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const controlPanel = parseCliJsonPayload(controlPanelStdout.getOutput()) as {
      panelKind: string;
      posture: { activeAssignments: number; externalAssignments: number; failClosed: boolean };
      permissions: { allowGrants: number };
      operationalSnapshot: { snapshotKind: string };
      audit: { kind: string; result: string };
    };
    assert.equal(controlPanel.panelKind, "claw_agent_control_panel");
    assert.equal(controlPanel.posture.activeAssignments, 1);
    assert.equal(controlPanel.posture.externalAssignments, 1);
    assert.equal(controlPanel.posture.failClosed, false);
    assert.equal(controlPanel.permissions.allowGrants, 1);
    assert.equal(controlPanel.operationalSnapshot.snapshotKind, "claw_agent_operational_snapshot");
    assert.equal(controlPanel.audit.kind, "control_panel");
    assert.equal(controlPanel.audit.result, "recorded");

    const privacyPlanStdout = captureStream();
    assert.equal(await runCli(["agents", "privacy-plan", "--record", JSON.stringify({
      operation: "delete",
      subject: { scopeType: "external_user", scopeId: "external_user_1" },
      requestedAt: "2026-05-17T11:00:00.000Z",
      agent: { id: "agent-ops", name: "Ops", secretAllowlist: ["vault://agents/ops"] },
      supportMessages: [{ id: "message.1", externalUserId: "external_user_1", body: "Need help" }],
      legalHoldRecordIds: ["message.1"],
    }), "--json"], {
      stdout: privacyPlanStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const privacyPlan = parseCliJsonPayload(privacyPlanStdout.getOutput()) as {
      planKind: string;
      actions: Array<{ disposition: string }>;
      gaps: string[];
      audit: { kind: string; result: string };
    };
    assert.equal(privacyPlan.planKind, "claw_agent_privacy_lifecycle_plan");
    assert.deepEqual(privacyPlan.actions.map((action) => action.disposition), ["retain"]);
    assert.equal(privacyPlan.gaps.includes("legal_hold_records_retained"), true);
    assert.equal(privacyPlan.audit.kind, "privacy_lifecycle");
    assert.equal(privacyPlan.audit.result, "blocked");

    const paperclipImportStdout = captureStream();
    assert.equal(await runCli(["agents", "paperclip-import", "--record", JSON.stringify({
      packageId: "paperclip.ops",
      importedAt: "2026-05-17T11:00:00.000Z",
      agentsMd: "# Ops Reviewer\nRole: reviewer\nSkills: skill.review@1\nInstructions: Review safely.",
      package: { skills: [{ ref: "skill.shared", version: "1" }] },
    }), "--json"], {
      stdout: paperclipImportStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const paperclipImport = parseCliJsonPayload(paperclipImportStdout.getOutput()) as {
      planKind: string;
      dependencyPolicy: string;
      blueprints: Array<{ agencyMode: string; skillRefs: string[] }>;
      audit: { kind: string; result: string };
    };
    assert.equal(paperclipImport.planKind, "claw_agent_paperclip_import_plan");
    assert.equal(paperclipImport.dependencyPolicy, "paperclip_not_required");
    assert.equal(paperclipImport.blueprints[0]?.agencyMode, "reviewer");
    assert.deepEqual(paperclipImport.blueprints[0]?.skillRefs, ["skill.review@1", "skill.shared@1"]);
    assert.equal(paperclipImport.audit.kind, "paperclip_import");
    assert.equal(paperclipImport.audit.result, "recorded");

    const surfaceProjectionStdout = captureStream();
    assert.equal(await runCli(["agents", "surface-projection", "--record", JSON.stringify({
      surface: "mcp_api",
      projectedAt: "2026-05-17T10:00:00.000Z",
      agent: {
        id: "agent-ops",
        name: "Ops",
        role: "Support",
        systemPrompt: "private",
        secretAllowlist: ["vault://agents/ops"],
        localPath: "/Users/example/private-agent",
      },
      assignments: [{
        id: "assignment.mcp",
        agentId: "agent-ops",
        kind: "mcp_api",
        status: "paused",
        channel: "mcp",
        endpointRef: "mcp://private",
        privacyPolicy: "raw_with_retention",
        externalDisclosure: "custom_agent_wording",
      }],
      resourceGrants: [{
        id: "grant.secret",
        resourceType: "secret",
        resourceId: "vault://agents/ops",
        action: "lease_secret",
        apiToken: "raw",
      }],
    }), "--json"], {
      stdout: surfaceProjectionStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const surfaceProjection = parseCliJsonPayload(surfaceProjectionStdout.getOutput()) as {
      projectionKind: string;
      surface: string;
      agent: Record<string, unknown>;
      assignments: Array<Record<string, unknown>>;
      resourceAccess: { brokeredLeaseAllowed: boolean; grants: Array<Record<string, unknown>> };
      risks: string[];
      gaps: string[];
    };
    assert.equal(surfaceProjection.projectionKind, "claw_agent_safe_surface");
    assert.equal(surfaceProjection.surface, "mcp_api");
    assert.equal(surfaceProjection.agent.name, "Ops");
    assert.equal("systemPrompt" in surfaceProjection.agent, false);
    assert.equal("secretAllowlist" in surfaceProjection.agent, false);
    assert.equal("localPath" in surfaceProjection.agent, false);
    assert.equal("endpointRef" in surfaceProjection.assignments[0], false);
    assert.equal("apiToken" in surfaceProjection.resourceAccess.grants[0], false);
    assert.equal(surfaceProjection.resourceAccess.brokeredLeaseAllowed, true);
    assert.deepEqual(surfaceProjection.gaps, [
      "active_assignment_missing",
      "raw_telemetry_retention_policy_missing",
      "budget_policy_missing",
    ]);
    assert.deepEqual(surfaceProjection.risks, [
      "secret_lease_requires_brokered_runtime_only",
      "raw_telemetry_retention_requires_policy_review",
      "external_disclosure_uses_custom_wording",
    ]);

    const serviceApiProjectionStdout = captureStream();
    assert.equal(await runCli(["agents", "surface-projection", "--record", JSON.stringify({
      surface: "service_api",
      projectedAt: "2026-05-17T10:00:00.000Z",
      agent: { id: "agent-ops", name: "Ops", localPath: "/Users/example/private-agent" },
      assignments: [{
        id: "assignment.internal",
        agentId: "agent-ops",
        kind: "internal_mac_chat",
        status: "active",
        channel: "mac",
        endpointRef: "clawix://workspace/main",
      }],
      budgets: [{
        id: "budget.api",
        exceededBehavior: "deny_action",
        limits: [{ dimension: "external_actions", limit: 5, used: 1 }],
      }],
    }), "--json"], {
      stdout: serviceApiProjectionStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const serviceApiProjection = parseCliJsonPayload(serviceApiProjectionStdout.getOutput()) as {
      surface: string;
      agent: Record<string, unknown>;
      assignments: Array<Record<string, unknown>>;
      gaps: string[];
    };
    assert.equal(serviceApiProjection.surface, "service_api");
    assert.equal("localPath" in serviceApiProjection.agent, false);
    assert.equal("endpointRef" in serviceApiProjection.assignments[0], false);
    assert.deepEqual(serviceApiProjection.gaps, ["surface_assignment_kind_missing"]);

    const revisionStdout = captureStream();
    assert.equal(await runCli(["agents", "config-revision", "--record", JSON.stringify({
      agentId: "agent-ops",
      revision: 2,
      actorId: "actor.owner",
      reason: "Tighten MCP assignment",
      configSnapshot: {
        name: "Ops",
        systemPrompt: "private",
        secretAllowlist: ["vault://agents/ops"],
        localPath: "/Users/example/private-agent",
      },
      changedFields: [{ field: "assignments.mcp", fromValue: "active", toValue: "paused", apiToken: "raw" }],
      createdAt: "2026-05-17T10:00:00.000Z",
    }), "--json"], {
      stdout: revisionStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const revision = parseCliJsonPayload(revisionStdout.getOutput()) as {
      id: string;
      revision: string;
      configSnapshot: Record<string, unknown>;
      changedFields: Array<Record<string, unknown>>;
      audit: { kind: string; resourceType?: string };
    };
    assert.match(revision.id, /^agent_config_revision_/);
    assert.equal(revision.revision, "2");
    assert.equal(String(revision.configSnapshot.secretAllowlist).includes("vault://"), false);
    assert.equal(revision.configSnapshot.localPath, "[REDACTED_LOCAL_PATH]");
    assert.equal(String(revision.changedFields[0]?.apiToken).includes("raw"), false);
    assert.equal(revision.audit.kind, "config_revision");
    assert.equal(revision.audit.resourceType, "agent_config_revision");

    const incidentStdout = captureStream();
    assert.equal(await runCli(["agents", "incident", "--record", JSON.stringify({
      agentId: "agent-ops",
      assignmentId: "assignment.mcp",
      runId: "run_1",
      sessionId: "session_1",
      actorId: "actor.monitor",
      severity: "high",
      summary: "Unsafe route blocked",
      scopeType: "customer",
      scopeId: "customer_1",
      detectedAt: "2026-05-17T10:00:00.000Z",
      metadata: {
        rawTracePath: "/Users/example/trace.log",
        authorization: "Bearer raw",
      },
    }), "--json"], {
      stdout: incidentStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const incident = parseCliJsonPayload(incidentStdout.getOutput()) as {
      id: string;
      status: string;
      severity: string;
      metadata: Record<string, unknown>;
      audit: { kind: string; result: string; resourceType?: string };
    };
    assert.match(incident.id, /^agent_incident_/);
    assert.equal(incident.status, "open");
    assert.equal(incident.severity, "high");
    assert.equal(String(incident.metadata.rawTracePath).includes("/Users/example"), false);
    assert.equal(String(incident.metadata.authorization).includes("Bearer raw"), false);
    assert.equal(incident.audit.kind, "incident");
    assert.equal(incident.audit.result, "blocked");
    assert.equal(incident.audit.resourceType, "agent_incident");

    const activityStdout = captureStream();
    assert.equal(await runCli(["agents", "activity-feed", "--record", JSON.stringify({
      agentId: "agent-ops",
      limit: 2,
      runs: [{
        id: "run_1",
        assignmentId: "assignment.mcp",
        status: "completed",
        startedAt: "2026-05-17T09:00:00.000Z",
        outcomeJson: { result: "blocked", rawTracePath: "/Users/example/run.log" },
      }],
      incidents: [{
        id: "incident_1",
        assignmentId: "assignment.mcp",
        severity: "high",
        status: "open",
        summary: "Unsafe route blocked",
        detectedAt: "2026-05-17T10:00:00.000Z",
        metadata: { authorization: "Bearer raw" },
      }],
      configRevisions: [{
        id: "revision_1",
        revision: 2,
        reason: "Tighten MCP assignment",
        createdAt: "2026-05-17T08:00:00.000Z",
        configSnapshot: { secretAllowlist: ["vault://agents/ops"] },
      }],
    }), "--json"], {
      stdout: activityStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const activity = parseCliJsonPayload(activityStdout.getOutput()) as {
      feedKind: string;
      items: Array<{ kind: string; title: string; metadata: Record<string, unknown> }>;
    };
    assert.equal(activity.feedKind, "claw_agent_activity_feed");
    assert.deepEqual(activity.items.map((item) => item.kind), ["incident", "run"]);
    assert.equal(activity.items[0]?.title, "Unsafe route blocked");
    assert.equal(String(activity.items[0]?.metadata.authorization).includes("Bearer"), false);
    assert.equal(JSON.stringify(activity.items[1]?.metadata).includes("/Users/example"), false);

    const blueprintStdout = captureStream();
    assert.equal(await runCli(["agents", "blueprint", "--record", JSON.stringify({
      name: "Support blueprint",
      agencyMode: "support",
      version: 1,
      skillRefs: ["skill.support@1"],
      skillBindings: [{
        ref: "skill.escalation",
        version: "2",
        requiredAssignmentKinds: ["support_inbox"],
        requiredResourceGrants: [{
          resourceType: "secret",
          resourceId: "vault://agents/ops/escalation",
          action: "lease_secret",
        }],
      }],
      template: {
        role: "Support",
        systemPrompt: "private",
        secretAllowlist: ["vault://agents/ops"],
        localPath: "/Users/example/blueprint",
      },
      requiredResourceGrants: [{
        id: "grant.support.read",
        resourceType: "collection",
        resourceId: "support_conversations",
        action: "read",
      }],
      createdAt: "2026-05-17T10:00:00.000Z",
    }), "--json"], {
      stdout: blueprintStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const blueprint = parseCliJsonPayload(blueprintStdout.getOutput()) as {
      id: string;
      template: Record<string, unknown>;
      skillRefs: string[];
      skillBindings: Array<{ ref: string; version?: string; requiredAssignmentKinds?: string[]; requiredResourceGrants?: Array<Record<string, unknown>> }>;
      safeExport: { packageKind: string; skillBindings: Array<Record<string, unknown>> };
      audit: { kind: string; resourceType?: string };
    };
    assert.match(blueprint.id, /^agent_blueprint_/);
    assert.equal(String(blueprint.template.secretAllowlist).includes("vault://"), false);
    assert.equal(JSON.stringify(blueprint.template).includes("/Users/example"), false);
    assert.deepEqual(blueprint.skillRefs, ["skill.support@1", "skill.escalation@2"]);
    assert.deepEqual(blueprint.skillBindings.map((binding) => binding.ref), ["skill.support", "skill.escalation"]);
    assert.equal(blueprint.skillBindings[1]?.requiredAssignmentKinds?.[0], "support_inbox");
    assert.equal(String(blueprint.skillBindings[1]?.requiredResourceGrants?.[0]?.resourceId).includes("vault://"), false);
    assert.equal(blueprint.safeExport.packageKind, "claw_agent_package");
    assert.equal(JSON.stringify(blueprint.safeExport.skillBindings).includes("vault://"), false);
    assert.equal(blueprint.audit.kind, "blueprint");
    assert.equal(blueprint.audit.resourceType, "agent_blueprint");

    const evaluationStdout = captureStream();
    assert.equal(await runCli(["agents", "evaluation", "--record", JSON.stringify({
      agentId: "agent-ops",
      assignmentId: "assignment.mcp",
      runId: "run_1",
      evaluatorId: "actor.evaluator",
      status: "failed",
      score: 0.25,
      criteria: { metric: "safety", rawTracePath: "/Users/example/eval.log" },
      result: { reason: "Unsafe disclosure", authorization: "Bearer raw" },
      evaluatedAt: "2026-05-17T10:00:00.000Z",
    }), "--json"], {
      stdout: evaluationStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const evaluation = parseCliJsonPayload(evaluationStdout.getOutput()) as {
      id: string;
      status: string;
      criteria: Record<string, unknown>;
      result: Record<string, unknown>;
      audit: { kind: string; result: string; resourceType?: string };
    };
    assert.match(evaluation.id, /^agent_evaluation_/);
    assert.equal(evaluation.status, "failed");
    assert.equal(String(evaluation.criteria.rawTracePath).includes("/Users/example"), false);
    assert.equal(String(evaluation.result.authorization).includes("Bearer raw"), false);
    assert.equal(evaluation.audit.kind, "evaluation");
    assert.equal(evaluation.audit.result, "blocked");
    assert.equal(evaluation.audit.resourceType, "agent_evaluation");

    const retirementStdout = captureStream();
    assert.equal(await runCli(["agents", "retirement-plan", "--record", JSON.stringify({
      agent: {
        id: "agent-ops",
        name: "Ops",
        secretAllowlist: ["vault://agents/ops"],
        localPath: "/Users/example/agent",
      },
      assignments: [{ id: "assignment.mcp", agentId: "agent-ops", status: "active" }],
      resourceGrants: [{ id: "grant.mcp", agentId: "agent-ops", resourceType: "collection", action: "read" }],
      actorId: "actor.owner",
      reason: "Rotate agent safely",
      retiredAt: "2026-05-17T10:00:00.000Z",
    }), "--json"], {
      stdout: retirementStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const retirement = parseCliJsonPayload(retirementStdout.getOutput()) as {
      planKind: string;
      recoverable: boolean;
      agentPatch: Record<string, unknown>;
      assignmentPatches: Array<Record<string, unknown>>;
      resourceGrantPatches: Array<Record<string, unknown>>;
      audit: { kind: string; resourceType?: string };
    };
    assert.equal(retirement.planKind, "claw_agent_retirement_plan");
    assert.equal(retirement.recoverable, true);
    assert.equal(retirement.agentPatch.status, "archived");
    assert.equal(retirement.assignmentPatches[0]?.status, "revoked");
    assert.equal(retirement.resourceGrantPatches[0]?.effect, "deny");
    assert.equal(JSON.stringify(retirement).includes("vault://"), false);
    assert.equal(JSON.stringify(retirement).includes("/Users/example"), false);
    assert.equal(retirement.audit.kind, "retirement");
    assert.equal(retirement.audit.resourceType, "agent");
  });
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("personalities reject invalid version before creating records", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-personality-invalid-version-"));
  await withPatchedEnv({
    CLAW_HOME: path.join(tempRoot, "home"),
    CLAW_DATA_DIR: tempRoot,
    CLAW_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    DATABASE_FILES_DIR: undefined,
  }, async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-personality-invalid-version-cwd-"));
    const stdout = captureStream();
    assert.equal(await runCli(["personalities", "upsert", "p.bad", "--name", "Bad", "--version", "nope", "--json"], {
      stdout: stdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_USAGE);

    const payload = JSON.parse(stdout.getOutput()) as { ok: boolean; error: { code: string; status: string } };
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, "usage");
    assert.equal(payload.error.status, "USAGE");

    const listStdout = captureStream();
    assert.equal(await runCli(["personalities", "list", "--json"], {
      stdout: listStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const listPayload = parseCliJsonPayload<{ items: Array<{ id: string }> }>(listStdout.getOutput());
    assert.equal(listPayload.items.some((item) => item.id === "p.bad"), false);
  });
});

test("app-state projects persist opaque resource ids alongside paths", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-app-state-resource-"));
  let restoreEnv: (() => void) | undefined;
  const dataRoot = useIsolatedClawDataRoot({ after: (fn) => { restoreEnv = fn; } }, workspaceRoot);
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-app-state-resource-cwd-"));
  const stdout = captureStream();
  assert.equal(await runInternalV1Cli(["app-state", "project", "upsert", "proj-local", "--resource-id", "res_projectxyz", "--name", "Project", "--path", cwd, "--json"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const project = parseCliJsonPayload(stdout.getOutput()) as { id: string; resourceId: string; path: string };
  assert.equal(project.resourceId, "res_projectxyz");
  const sqlitePath = path.join(dataRoot, clawStorageFiles.mainDatabase);
  const sqlite = new Database(sqlitePath);
  try {
    assert.deepEqual(sqlite.prepare("SELECT resource_id, path FROM app_projects WHERE id = ?").get("proj-local"), { resource_id: "res_projectxyz", path: cwd });
  } finally {
    sqlite.close();
    restoreEnv?.();
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test("app-state sidebar persists stable project ids alongside path locators", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-app-state-sidebar-project-id-"));
  let restoreEnv: (() => void) | undefined;
  const dataRoot = useIsolatedClawDataRoot({ after: (fn) => { restoreEnv = fn; } }, workspaceRoot);
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-app-state-sidebar-project-id-cwd-"));
  const projectPath = path.join(cwd, "project");
  const upsertStdout = captureStream();
  assert.equal(await runInternalV1Cli([
    "app-state", "sidebar", "upsert", "thread-1",
    "--chat-uuid", "chat-1",
    "--title", "Project chat",
    "--cwd", cwd,
    "--project-id", "proj-stable",
    "--project-path", projectPath,
    "--updated-at", "2026-05-18T10:00:00.000Z",
    "--json",
  ], {
    stdout: upsertStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const upserted = parseCliJsonPayload(upsertStdout.getOutput()) as { projectId: string; projectPath: string };
  assert.equal(upserted.projectId, "proj-stable");
  assert.equal(upserted.projectPath, projectPath);

  const replaceStdout = captureStream();
  assert.equal(await runInternalV1Cli([
    "app-state", "sidebar", "replace",
    "--items", JSON.stringify([{
      threadId: "thread-2",
      chatUuid: "chat-2",
      title: "Synced chat",
      cwd,
      projectId: "proj-synced",
      projectPath,
      updatedAt: "2026-05-18T10:01:00.000Z",
    }]),
    "--json",
  ], {
    stdout: replaceStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);

  const sqlitePath = path.join(dataRoot, clawStorageFiles.mainDatabase);
  const sqlite = new Database(sqlitePath);
  try {
    assert.deepEqual(sqlite.prepare("SELECT project_id, project_path FROM app_sidebar_snapshots WHERE thread_id = ?").get("thread-2"), {
      project_id: "proj-synced",
      project_path: projectPath,
    });
  } finally {
    sqlite.close();
    restoreEnv?.();
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test("host app-state applies typed transactions and records sync receipts", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-host-app-state-"));
  let restoreEnv: (() => void) | undefined;
  const dataRoot = useIsolatedClawDataRoot({ after: (fn) => { restoreEnv = fn; } }, workspaceRoot);
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-host-app-state-cwd-"));
  try {
    const applyStdout = captureStream();
    assert.equal(await runCli([
      "host", "app-state", "apply",
      "--operations", JSON.stringify([
        { kind: "project.upsert", id: "proj-contract", resourceId: "res_contract", name: "Contract", path: cwd, sortOrder: 1000 },
        { kind: "pin.upsert", threadId: "thread-contract", sortOrder: 1000 },
        { kind: "title.upsert", threadId: "thread-contract", title: "Contract thread", source: "test" },
      ]),
      "--request-id", "req-contract-1",
      "--host-id", "clawix-test",
      "--json",
    ], {
      stdout: applyStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const applied = parseCliJsonPayload(applyStdout.getOutput()) as {
      receipt: { requestId: string; hostId: string; status: string; operationCount: number };
      projection: { projects: Array<{ id: string; resourceId: string }>; receipts: Array<{ requestId: string }> };
    };
    assert.equal(applied.receipt.status, "applied");
    assert.equal(applied.receipt.operationCount, 3);
    assert.equal(applied.projection.projects[0]?.resourceId, "res_contract");
    assert.equal(applied.projection.receipts[0]?.requestId, "req-contract-1");

    const projectionStdout = captureStream();
    assert.equal(await runCli(["host", "app-state", "projection", "--json"], {
      stdout: projectionStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const projection = parseCliJsonPayload(projectionStdout.getOutput()) as { titles: Array<{ threadId: string; title: string }>; receipts: Array<{ hostId: string }> };
    assert.equal(projection.titles[0]?.title, "Contract thread");
    assert.equal(projection.receipts[0]?.hostId, "clawix-test");

    const mainDatabasePath = path.join(dataRoot, clawStorageFiles.mainDatabase);
    const sqlite = new Database(mainDatabasePath);
    try {
      assert.deepEqual(sqlite.prepare("SELECT request_id, status, operation_count FROM app_state_sync_receipts WHERE request_id = ?").get("req-contract-1"), {
        request_id: "req-contract-1",
        status: "applied",
        operation_count: 3,
      });
    } finally {
      sqlite.close();
    }
  } finally {
    restoreEnv?.();
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test("V2 main schema upgrades app project resource ids before indexing them", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-schema-upgrade-"));
  await withPatchedEnv({ CLAW_DATA_DIR: tempRoot }, async () => {
    const sqlite = new Database(":memory:");
    try {
      sqlite.exec(`
        CREATE TABLE app_state (
          profile_id TEXT NOT NULL DEFAULT 'local',
          key TEXT NOT NULL,
          value_json TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (profile_id, key)
        );
        INSERT INTO app_state (profile_id, key, value_json, updated_at)
        VALUES ('local', 'legacy.key', '{"ok":true}', '2026-05-20T00:00:00.000Z');
        CREATE TABLE app_state_projection_meta (
          profile_id TEXT PRIMARY KEY NOT NULL DEFAULT 'local',
          last_receipt_id TEXT,
          projected_at TEXT NOT NULL,
          metadata_json TEXT NOT NULL DEFAULT '{}'
        );
        INSERT INTO app_state_projection_meta (profile_id, last_receipt_id, projected_at, metadata_json)
        VALUES ('local', 'receipt.legacy', '2026-05-20T00:00:00.000Z', '{}');
        CREATE TABLE app_projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          path TEXT NOT NULL DEFAULT '',
          sort_order INTEGER,
          hidden INTEGER NOT NULL DEFAULT 0,
          metadata_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      ensureV1MainSchema(sqlite);
      const columns = sqlite.prepare("PRAGMA table_info(app_projects)").all() as Array<{ name: string }>;
      assert.equal(columns.some((column) => column.name === "resource_id"), true);
      const indexes = sqlite.prepare("PRAGMA index_list(app_projects)").all() as Array<{ name: string }>;
      assert.equal(indexes.some((index) => index.name === "app_projects_resource_id_idx"), true);
      const sidebarColumns = sqlite.prepare("PRAGMA table_info(app_sidebar_snapshots)").all() as Array<{ name: string }>;
      assert.equal(sidebarColumns.some((column) => column.name === "project_id"), true);
      const sidebarIndexes = sqlite.prepare("PRAGMA index_list(app_sidebar_snapshots)").all() as Array<{ name: string }>;
      assert.equal(sidebarIndexes.some((index) => index.name === "app_sidebar_snapshots_project_id_idx"), true);
      const receiptColumns = sqlite.prepare("PRAGMA table_info(app_state_sync_receipts)").all() as Array<{ name: string }>;
      assert.equal(receiptColumns.some((column) => column.name === "receipt_id"), true);
      const projectionMetaColumns = sqlite.prepare("PRAGMA table_info(app_state_projection_meta)").all() as Array<{ name: string }>;
      const appStateColumns = sqlite.prepare("PRAGMA table_info(app_state)").all() as Array<{ name: string }>;
      assert.equal(appStateColumns.some((column) => column.name === "state_scope_id"), true);
      assert.equal(appStateColumns.some((column) => column.name === "profile_id"), false);
      assert.equal(projectionMetaColumns.some((column) => column.name === "last_receipt_id"), true);
      assert.equal(projectionMetaColumns.some((column) => column.name === "state_scope_id"), true);
      assert.equal(projectionMetaColumns.some((column) => column.name === "profile_id"), false);
      assert.deepEqual(sqlite.prepare("SELECT state_scope_id, key, value_json FROM app_state WHERE key = 'legacy.key'").get(), {
        state_scope_id: "local",
        key: "legacy.key",
        value_json: '{"ok":true}',
      });
      const incidentColumns = sqlite.prepare("PRAGMA table_info(agent_incidents)").all() as Array<{ name: string; dflt_value: string | null; notnull: number }>;
      assert.equal(incidentColumns.some((column) => column.name === "run_id"), true);
      assert.equal(incidentColumns.some((column) => column.name === "session_id"), true);
      assert.equal(incidentColumns.some((column) => column.name === "actor_id"), true);
      assert.equal(incidentColumns.some((column) => column.name === "detected_at"), true);
      assert.equal(incidentColumns.find((column) => column.name === "severity")?.dflt_value, "'low'");
      assert.equal(incidentColumns.find((column) => column.name === "summary")?.notnull, 1);
      const sessionColumns = sqlite.prepare("PRAGMA table_info(agent_sessions)").all() as Array<{ name: string; dflt_value: string | null; notnull: number }>;
      assert.equal(sessionColumns.some((column) => column.name === "company_id"), true);
      assert.equal(sessionColumns.some((column) => column.name === "initiator_actor_id"), true);
      assert.equal(sessionColumns.some((column) => column.name === "linked_issue_id"), true);
      assert.equal(sessionColumns.some((column) => column.name === "linked_task_id"), true);
      assert.equal(sessionColumns.find((column) => column.name === "source_json")?.dflt_value, "'{}'");
      assert.equal(sessionColumns.find((column) => column.name === "links_json")?.dflt_value, "'{}'");
      const sessionIndexes = sqlite.prepare("PRAGMA index_list(agent_sessions)").all() as Array<{ name: string }>;
      assert.equal(sessionIndexes.some((index) => index.name === "agent_sessions_company_idx"), true);
      assert.equal(sessionIndexes.some((index) => index.name === "agent_sessions_status_idx"), true);
      const blueprintColumns = sqlite.prepare("PRAGMA table_info(agent_blueprints)").all() as Array<{ name: string; dflt_value: string | null }>;
      assert.equal(blueprintColumns.find((column) => column.name === "skill_refs_json")?.dflt_value, "'[]'");
      assert.equal(blueprintColumns.find((column) => column.name === "skill_bindings_json")?.dflt_value, "'[]'");
    } finally {
      sqlite.close();
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

test("V2 main schema migrates legacy agent incidents into Agents V1 shape", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-agent-incident-upgrade-"));
  await withPatchedEnv({ CLAW_DATA_DIR: tempRoot }, async () => {
    const sqlite = new Database(":memory:");
    try {
      sqlite.exec(`
        CREATE TABLE agent_incidents (
          id TEXT PRIMARY KEY,
          agent_id TEXT NOT NULL,
          assignment_id TEXT,
          status TEXT NOT NULL DEFAULT 'open',
          severity TEXT NOT NULL DEFAULT 'sev4',
          title TEXT NOT NULL,
          summary TEXT,
          customer_impact TEXT,
          redaction_json TEXT NOT NULL DEFAULT '{}',
          resolved_at TEXT,
          metadata_json TEXT NOT NULL DEFAULT '{}',
          archived_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        INSERT INTO agent_incidents (
          id, agent_id, assignment_id, status, severity, title, summary,
          customer_impact, redaction_json, metadata_json, created_at, updated_at
        ) VALUES (
          'incident.legacy', 'agent.support', 'assignment.web',
          'investigating', 'sev1', 'Legacy title', '',
          'Customer impact text', '{}', '{}',
          '2026-05-17T10:00:00.000Z', '2026-05-17T10:01:00.000Z'
        );
      `);
      ensureV1MainSchema(sqlite);
      const columns = sqlite.prepare("PRAGMA table_info(agent_incidents)").all() as Array<{ name: string; dflt_value: string | null; notnull: number }>;
      assert.equal(columns.some((column) => column.name === "title"), false);
      assert.equal(columns.some((column) => column.name === "customer_impact"), false);
      assert.equal(columns.some((column) => column.name === "run_id"), true);
      assert.equal(columns.find((column) => column.name === "summary")?.notnull, 1);
      const row = sqlite.prepare("SELECT status, severity, summary, description, detected_at FROM agent_incidents WHERE id = ?").get("incident.legacy") as {
        status: string;
        severity: string;
        summary: string;
        description: string;
        detected_at: string;
      };
      assert.deepEqual(row, {
        status: "mitigating",
        severity: "critical",
        summary: "Legacy title",
        description: "Customer impact text",
        detected_at: "2026-05-17T10:00:00.000Z",
      });
    } finally {
      sqlite.close();
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
