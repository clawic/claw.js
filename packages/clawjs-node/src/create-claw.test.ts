import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { Claw, createClaw } from "./create-claw.ts";
import { resolveClawWorkspaceSurfacePath } from "./surface-paths.ts";
import { buildTimeApp } from "../../../time/src/server/app.ts";

import { createExplicitOpenClawToolchain, createFakeGenerationCommand, createFakeOpenClawChannelsToolchain, createFakeOpenClawImageSkillEnv, createFakeOpenClawMemoryToolchain, createFakeOpenClawPluginToolchain, createFakeSecretsProxy, createFakeSkillSourceToolchain, createOpenClawAuthReadyToolchain, withPatchedEnv } from "./create-claw-test-utils.ts";

test("Claw is an alias for the primary async factory", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-instance-alias-"));
  const direct = await Claw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });
  const viaCreate = await Claw.create({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  assert.equal(typeof direct.workspace.init, "function");
  assert.equal(viaCreate.runtime.context()?.agentId, "demo-main");
  assert.equal(Claw.create, createClaw);
});

test("createClaw exposes Agents V1 policy gates through claw.agents", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-agents-v1-"));
  const claw = await createClaw({
    runtime: { adapter: "demo" },
    workspace: {
      appId: "demo",
      workspaceId: "agents-v1-sdk",
      agentId: "agent.sdk",
      rootDir: workspaceDir,
    },
  });

  const route = claw.agents.routeCheck({
    assignment: {
      id: "assignment.web",
      agentId: "agent.sdk",
      kind: "external_web_chat",
      status: "active",
      channel: "chat",
      endpointRef: "web://support",
      externalDisclosure: "transparent_agent",
    },
    kind: "external_web_chat",
    channel: "chat",
    endpointRef: "web://support",
    now: "2026-05-17T10:00:00.000Z",
  });
  assert.equal(route.allowed, true);

  const identity = claw.agents.resolveExternalIdentity({
    provider: "web",
    externalId: "visitor_1",
    email: "customer@example.com",
    customerId: "customer_1",
    ip: "203.0.113.42",
  });
  assert.equal(identity.contactProjection, "create_or_update");
  assert.equal(identity.boundary.scopeId, "customer_1");
  assert.equal("ip" in identity.telemetry, false);

  const budget = claw.agents.budgetCheck({
    exceededBehavior: "deny_action",
    limits: [{ dimension: "external_actions", limit: 1, used: 1 }],
  }, {
    dimension: "external_actions",
    cost: 1,
    externalPaidAction: true,
    connectorGateAllowed: true,
  });
  assert.equal(budget.allowed, false);
  assert.deepEqual(budget.reasons, ["budget: external_actions limit exceeded"]);

  const supervisor = claw.agents.supervisorCheck({
    supervisor: {
      id: "agent.manager",
      authorityLevel: "approve_low_risk",
      scopeType: "team",
      scopeId: "support",
    },
    targetAgent: {
      id: "agent.sdk",
      managerAgentId: "agent.manager",
      teamId: "support",
    },
    request: {
      action: "pause_assignment",
      risk: "low",
      scopeType: "team",
      scopeId: "support",
    },
  });
  assert.equal(supervisor.allowed, true);

  const severity = claw.agents.actionSeverity({
    action: "invoke",
    resourceType: "connector",
    paidAction: true,
    externalSideEffect: true,
  });
  assert.equal(severity.severity, "high");
  assert.equal(severity.connectorGateRequired, true);
  assert.equal(severity.budgetRequired, true);

  const autonomy = claw.agents.autonomyCheck({
    profile: "act_full",
    action: { action: "invoke", resourceType: "connector", paidAction: true, externalSideEffect: true },
    approvalGranted: true,
    connectorGateAllowed: true,
    budgetAllowed: true,
  });
  assert.equal(autonomy.allowed, true);
  assert.equal(autonomy.dispatchMode, "act");

  const dispatch = claw.agents.dispatchPlan({
    agentId: "agent.sdk",
    assignment: {
      id: "assignment.api",
      agentId: "agent.sdk",
      kind: "mcp_api",
      status: "active",
      channel: "api",
      privacyPolicy: "hashed",
      externalDisclosure: "transparent_agent",
    },
    assignmentRequest: { kind: "mcp_api", channel: "api" },
    executionProfile: { id: "execution.sync", executionMode: "sync", status: "active", runtime: "service" },
    autonomy: { profile: "act_limited" },
    action: { action: "write", resourceType: "collection" },
    now: "2026-05-17T10:00:00.000Z",
  });
  assert.equal(dispatch.allowed, true);
  assert.equal(dispatch.disposition, "invoke_sync");
  assert.equal(dispatch.runStatus, "running");

  const contextGrant = (id: string) => ({
    id,
    resourceType: "*",
    action: "read" as const,
    scopeType: "customer",
    scopeId: "customer_1",
    effect: "allow" as const,
  });
  const contextPack = claw.agents.contextPack({
    agentId: "agent.sdk",
    assignmentId: "assignment.api",
    view: {
      id: "view.sdk.customer",
      allowedResourceTypes: ["contact"],
      allowedScopes: [{ scopeType: "customer", scopeId: "customer_1" }],
      includeContent: false,
    },
    requested: [{
      id: "ctx.sdk.contact",
      resourceType: "contact",
      resourceId: "contact_1",
      scopeType: "customer",
      scopeId: "customer_1",
      content: { name: "Customer" },
    }],
    agentGrants: [contextGrant("agent")],
    assignmentGrants: [contextGrant("assignment")],
    executionProfileGrants: [contextGrant("execution")],
    connectorGrants: [contextGrant("connector")],
    hostGrants: [contextGrant("host")],
    runScopeGrants: [contextGrant("run")],
    now: "2026-05-17T10:00:00.000Z",
  });
  assert.equal(contextPack.packKind, "claw_agent_context_pack");
  assert.equal(contextPack.items[0]?.id, "ctx.sdk.contact");
  assert.equal("content" in (contextPack.items[0] ?? {}), false);
  assert.equal(contextPack.audit.kind, "context_pack");

  const toolCatalog = claw.agents.toolCatalog({
    agentId: "agent.sdk",
    assignmentId: "assignment.api",
    allowedDomains: ["support"],
    tools: [{
      id: "support.contacts.lookup",
      title: "Lookup contact",
      description: "Read contact context.",
      domain: "support",
      sourceFeature: "support",
      parameters: { type: "object" },
      riskLevel: "safe",
    }],
    agentGrants: [{ ...contextGrant("agent"), resourceType: "tool", action: "invoke", scopeType: "domain", scopeId: "support" }],
    assignmentGrants: [{ ...contextGrant("assignment"), resourceType: "tool", action: "invoke", scopeType: "domain", scopeId: "support" }],
    executionProfileGrants: [{ ...contextGrant("execution"), resourceType: "tool", action: "invoke", scopeType: "domain", scopeId: "support" }],
    connectorGrants: [{ ...contextGrant("connector"), resourceType: "tool", action: "invoke", scopeType: "domain", scopeId: "support" }],
    hostGrants: [{ ...contextGrant("host"), resourceType: "tool", action: "invoke", scopeType: "domain", scopeId: "support" }],
    runScopeGrants: [{ ...contextGrant("run"), resourceType: "tool", action: "invoke", scopeType: "domain", scopeId: "support" }],
    now: "2026-05-17T10:00:00.000Z",
  });
  assert.equal(toolCatalog.catalogKind, "claw_agent_tool_catalog");
  assert.equal(toolCatalog.tools[0]?.id, "support.contacts.lookup");
  assert.equal(toolCatalog.audit.kind, "tool_catalog");

  const creationReview = claw.agents.creationReview({
    reviewedAt: "2026-05-17T10:00:00.000Z",
    surface: "service_api",
    agent: { id: "agent.sdk", name: "SDK Agent", role: "Support" },
    assignments: [{ id: "assignment.api", agentId: "agent.sdk", kind: "mcp_api", status: "active", channel: "api" }],
    executionProfiles: [{ id: "execution.sync", executionMode: "sync", hostAccess: "none", networkPolicy: "connector_only" }],
    budgets: [{ id: "budget.api", exceededBehavior: "deny_action", limits: [{ dimension: "external_actions", limit: 3 }] }],
  });
  assert.equal(creationReview.reviewKind, "claw_agent_creation_review");
  assert.equal(creationReview.ready, true);
  assert.equal(creationReview.audit.kind, "creation_review");

  const storageAudit = claw.agents.storageAudit({
    legacyCollections: [],
    auditedAt: "2026-05-17T10:00:00.000Z",
  });
  assert.equal(storageAudit.auditKind, "claw_agent_storage_audit");
  assert.equal(storageAudit.ready, true);
  assert.equal(storageAudit.canonicalCollections.includes("agent_sessions"), true);

  const auditCoverage = claw.agents.auditCoverage({
    expectedKinds: ["blueprint"],
    events: [claw.agents.auditEvent({
      id: "audit.sdk.blueprint",
      kind: "blueprint",
      agentId: "agent.sdk",
      result: "recorded",
      createdAt: "2026-05-17T10:00:00.000Z",
      redaction: "strict",
      metadata: { source: "sdk" },
    })],
    auditedAt: "2026-05-17T10:00:00.000Z",
  });
  assert.equal(auditCoverage.reportKind, "claw_agent_audit_coverage");
  assert.equal(auditCoverage.ready, true);

  const operationalSnapshot = claw.agents.operationalSnapshot({
    agentId: "agent.sdk",
    assignments: [{ id: "assignment.api", agentId: "agent.sdk", status: "active", updatedAt: "2026-05-17T10:00:00.000Z" }],
    runs: [{ id: "run.sdk", agentId: "agent.sdk", status: "running", startedAt: "2026-05-17T10:00:00.000Z" }],
    sessions: [{ id: "session.sdk", agentId: "agent.sdk", status: "active", createdAt: "2026-05-17T10:00:00.000Z" }],
    audits: [claw.agents.auditEvent({
      id: "audit.sdk.run",
      kind: "dispatch_plan",
      agentId: "agent.sdk",
      result: "recorded",
      redaction: "strict",
      createdAt: "2026-05-17T10:00:00.000Z",
      metadata: {},
    })],
    capturedAt: "2026-05-17T11:00:00.000Z",
  });
  assert.equal(operationalSnapshot.snapshotKind, "claw_agent_operational_snapshot");
  assert.equal(operationalSnapshot.summary.runs.running, 1);
  assert.deepEqual(operationalSnapshot.gaps, []);

  const controlPanel = claw.agents.controlPanel({
    generatedAt: "2026-05-17T11:00:00.000Z",
    surface: "service_api",
    agent: { id: "agent.sdk", name: "SDK Agent", autonomyProfile: "act_limited" },
    assignments: [{ id: "assignment.api", agentId: "agent.sdk", kind: "mcp_api", status: "active", channel: "api", privacyPolicy: "hashed" }],
    executionProfiles: [{ id: "execution.sync", executionMode: "sync", networkPolicy: "connector_only" }],
    resourceGrants: [{ id: "grant.api", agentId: "agent.sdk", resourceType: "collection", resourceId: "support_conversations", action: "read", effect: "allow" }],
    memoryPolicies: [{ id: "memory.sdk", writePolicy: "private_only", crossUserBoundary: "explicit_grant_only" }],
    budgets: [{ id: "budget.api", exceededBehavior: "deny_action", limits: [{ dimension: "external_actions", limit: 3 }] }],
    runs: [{ id: "run.sdk", agentId: "agent.sdk", status: "running", startedAt: "2026-05-17T10:00:00.000Z" }],
    sessions: [{ id: "session.sdk", agentId: "agent.sdk", status: "active", createdAt: "2026-05-17T10:00:00.000Z" }],
    audits: [claw.agents.auditEvent({
      id: "audit.sdk.panel",
      kind: "dispatch_plan",
      agentId: "agent.sdk",
      result: "recorded",
      redaction: "strict",
      createdAt: "2026-05-17T10:00:00.000Z",
      metadata: {},
    })],
  });
  assert.equal(controlPanel.panelKind, "claw_agent_control_panel");
  assert.equal(controlPanel.permissions.allowGrants, 1);
  assert.equal(controlPanel.audit.kind, "control_panel");

  const privacyPlan = claw.agents.privacyPlan({
    operation: "export",
    subject: { scopeType: "external_user", scopeId: "external_user_1" },
    requestedAt: "2026-05-17T11:00:00.000Z",
    agent: { id: "agent.sdk", name: "SDK Agent", secretAllowlist: ["vault://agents/sdk"] },
    supportMessages: [{ id: "message.sdk", externalUserId: "external_user_1", body: "Need help" }],
  });
  assert.equal(privacyPlan.planKind, "claw_agent_privacy_lifecycle_plan");
  assert.equal(privacyPlan.actions[0]?.disposition, "include_export");
  assert.equal(privacyPlan.exportPackage?.agent.secretAllowlist, "[REDACTED]");

  const paperclipImport = claw.agents.paperclipImport({
    packageId: "paperclip.sdk",
    importedAt: "2026-05-17T11:00:00.000Z",
    agentsMd: "# SDK Reviewer\nRole: reviewer\nSkills: skill.review@1\nInstructions: Review SDK changes.",
  });
  assert.equal(paperclipImport.planKind, "claw_agent_paperclip_import_plan");
  assert.equal(paperclipImport.dependencyPolicy, "paperclip_not_required");
  assert.equal(paperclipImport.blueprints[0]?.agencyMode, "reviewer");

  const service = claw.agents.serviceApi({
    requestId: "request.sdk.service",
    operation: "describe_agent",
    requestedAt: "2026-05-17T10:00:00.000Z",
    agent: {
      id: "agent.sdk",
      name: "SDK Agent",
      secretAllowlist: ["vault://agents/sdk"],
      localPath: "/Users/example/agent",
    },
    assignments: [{
      id: "assignment.api",
      agentId: "agent.sdk",
      kind: "mcp_api",
      status: "active",
      channel: "api",
      privacyPolicy: "hashed",
    }],
    budgets: [{
      id: "budget.api",
      exceededBehavior: "deny_action",
      limits: [{ dimension: "external_actions", limit: 3, used: 0 }],
    }],
  });
  assert.equal(service.allowed, true);
  assert.equal(service.projection.surface, "service_api");
  assert.equal("secretAllowlist" in service.projection.agent, false);
  assert.equal("localPath" in service.projection.agent, false);

  const serviceHttp = claw.agents.serviceApiHttp({
    method: "POST",
    path: "/v1/agents/service-api",
    receivedAt: "2026-05-17T10:00:00.000Z",
    body: {
      requestId: "request.sdk.http",
      operation: "describe_agent",
      agent: { id: "agent.sdk", name: "SDK Agent" },
      assignments: [{ id: "assignment.api", agentId: "agent.sdk", kind: "mcp_api", status: "active", channel: "api" }],
      budgets: [{ id: "budget.api", exceededBehavior: "deny_action", limits: [{ dimension: "external_actions", limit: 3 }] }],
    },
  });
  assert.equal(serviceHttp.status, 200);
  assert.equal(serviceHttp.headers["x-claw-agents-api"], "v1");

  const retirement = claw.agents.retirementPlan({
    agent: { id: "agent.sdk", name: "SDK Agent" },
    assignments: [{ id: "assignment.api", agentId: "agent.sdk", status: "active" }],
    resourceGrants: [{ id: "grant.api", agentId: "agent.sdk", resourceType: "collection", action: "read" }],
    reason: "Rotate SDK test agent",
    retiredAt: "2026-05-17T10:00:00.000Z",
  });
  assert.equal(retirement.recoverable, true);
  assert.equal(retirement.agentPatch.status, "archived");
  assert.equal(retirement.assignmentPatches[0]?.status, "revoked");
});

test("createClaw initializes and inspects a workspace", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-"));
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  await claw.workspace.init();
  const inspected = await claw.workspace.inspect();
  assert.equal(!!inspected.manifest, true);
  assert.equal(fs.existsSync(inspected.manifestPath), true);
  assert.equal(fs.existsSync(inspected.workspaceStatePath), true);
});

test("createClaw exposes runtime context and workspace data helpers", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-context-"));
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-state-"));
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      gateway: {
        configPath: path.join(stateDir, "openclaw.json"),
      },
    },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  const context = claw.runtime.context();
  claw.data.document("settings").write({ locale: "es" });

  assert.equal(context?.agentId, "demo-main");
  assert.equal(context?.workspaceDir, workspaceDir);
  assert.deepEqual(claw.data.document("settings").read(), { locale: "es" });
});

test("createClaw exposes SDK-first capability catalog for custom surfaces", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-capabilities-"));
  const dataRoot = path.join(workspaceDir, "claw-data");
  await withPatchedEnv({ CLAW_DATA_DIR: dataRoot }, async () => {
    const claw = await createClaw({
      runtime: { adapter: "openclaw" },
      workspace: {
        appId: "demo",
        workspaceId: "demo-main",
        agentId: "demo-main",
        rootDir: workspaceDir,
      },
    });

    const ids = claw.capabilities.list().map((capability) => capability.id);
    const riskMap = claw.capabilities.riskMap();

    assert.ok(ids.includes("search.query"));
    assert.ok(ids.includes("db.query"));
    assert.ok(riskMap.ordinaryAccess.includes("search.query"));
    assert.ok(riskMap.approvalRequired.includes("secrets.broker"));
    assert.equal(claw.capabilities.get("iot.device.action.invoke")?.risk.touchesPhysicalWorld, true);
    assert.match(claw.capabilities.source(), /sdk-first-custom-surfaces/);
  });
});

test("createClaw exposes TTS playback helpers through the SDK facade", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-tts-"));
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  assert.equal(claw.tts.stripMarkdown("## Hello\n\n**world**"), "Hello. world");
  assert.deepEqual(
    claw.tts.segmentText("Sentence one. Sentence two is a bit longer.", { maxSegmentLength: 16 }),
    ["Sentence one.", "Sentence two is", "a bit longer."],
  );
  assert.deepEqual(
    claw.tts.createPlaybackPlan({
      text: "Alpha.\n\nBeta with `code`.",
    }).segments.map((segment) => segment.text),
    ["Alpha.", "Beta with code."],
  );
});

test("createClaw persists normalized speech intent through the TTS facade", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-tts-intent-"));
  const claw = await createClaw({
    runtime: { adapter: "demo" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-tts",
      agentId: "demo-tts",
      rootDir: workspaceDir,
    },
  });

  const configured = claw.tts.setConfig({
    provider: "openai",
    enabled: true,
    autoRead: true,
    voice: "nova",
    model: "tts-1",
    speed: 1.25,
  });
  const stored = claw.tts.config();
  const diffBeforeApply = await claw.intent.diff({ domains: ["speech"] });
  await claw.intent.apply({ domains: ["speech"] });
  const diffAfterApply = await claw.intent.diff({ domains: ["speech"] });

  assert.equal(configured.provider, "openai");
  assert.equal(stored.voice, "nova");
  assert.equal(stored.autoRead, true);
  assert.equal(diffBeforeApply.drifted, false);
  assert.equal(diffAfterApply.drifted, false);
  assert.deepEqual((claw.intent.get("speech") as { tts?: { provider?: string } }).tts?.provider, "openai");
});

test("createClaw exposes a workspace-backed generations subsystem", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-generations-"));
  const commandPath = createFakeGenerationCommand();
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  const backend = claw.generations.registerCommandBackend({
    id: "fake-image",
    label: "Fake Image",
    supportedKinds: ["image"],
    command: commandPath,
    args: ["--out", "{outputPath}"],
    outputExtension: "png",
    mimeType: "image/png",
  });
  const record = await claw.generations.create({
    kind: "image",
    prompt: "orange horizon",
    backendId: backend.id,
  });

  assert.equal(record.output?.exists, true);
  assert.equal(claw.generations.list({ kind: "image" }).length, 1);
  assert.equal(claw.generations.get(record.id)?.backendId, "fake-image");
  assert.equal(claw.image.list().length, 1);
  assert.equal(claw.image.get(record.id)?.backendId, "fake-image");
});

test("createClaw generations can auto-select an OpenClaw bundled image skill", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-openclaw-image-"));
  const { skillsDir, binDir } = createFakeOpenClawImageSkillEnv();

  await withPatchedEnv({
    OPENCLAW_SKILLS_DIR: skillsDir,
    OPENAI_API_KEY: "test-key",
    PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
  }, async () => {
    const claw = await createClaw({
      runtime: { adapter: "openclaw" },
      workspace: {
        appId: "demo",
        workspaceId: "demo-main",
        agentId: "demo-main",
        rootDir: workspaceDir,
      },
    });

    const record = await claw.generations.create({
      kind: "image",
      prompt: "studio portrait of a lobster",
    });

    assert.equal(record.backendId, "openclaw-skill:openai-image-gen");
    assert.equal(record.output?.exists, true);
    assert.equal((await claw.image.generate({
      prompt: "second lobster portrait",
    })).backendId, "openclaw-skill:openai-image-gen");
  });
});

test("createClaw exposes app discovery, managed block preservation, and secret reference helpers", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-platform-"));
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-platform-state-"));
  const configPath = path.join(stateDir, "openclaw.json");
  const { proxyPath, statePath } = createFakeSecretsProxy();

  fs.writeFileSync(configPath, JSON.stringify({
    agents: {
      list: [{
        id: "demo-main",
        workspace: workspaceDir,
      }],
    },
  }, null, 2));

  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      gateway: { configPath },
      env: {
        ...process.env,
        CLAW_SECRETS_PROXY_PATH: proxyPath,
        FAKE_TELEGRAM_PROXY_STATE: statePath,
      },
    },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  const discovered = claw.runtime.discoverContext({
    agentIds: ["demo-alias", "demo-main"],
  });
  const ensureResult = await claw.telegram.provisionSecretReference({
    secretName: "telegram_support_bot_token",
  });

  claw.files.writeWorkspaceFile("USER.md", [
    "# Profile",
    "",
    "<!-- CLAW:profile:START -->",
    "managed-profile",
    "<!-- CLAW:profile:END -->",
    "",
    "Visible text",
    "",
  ].join("\n"));

  claw.files.writeWorkspaceFilePreservingManagedBlocks("USER.md", [
    "# Profile",
    "",
    "<!-- CLAW:profile:START -->",
    "user-overwrite-attempt",
    "<!-- CLAW:profile:END -->",
    "",
    "Edited text",
    "",
  ].join("\n"));

  const preserved = claw.files.readWorkspaceFile("USER.md");
  const detached = await claw.runtime.detachWorkspace();

  assert.equal(discovered?.matchedAgentId, "demo-main");
  assert.equal(ensureResult.status, "missing");
  assert.match(ensureResult.instructions.summary, /does not exist/i);
  assert.match(preserved ?? "", /managed-profile/);
  assert.doesNotMatch(preserved ?? "", /user-overwrite-attempt/);
  assert.deepEqual(detached?.removedAgentIds, ["demo-main"]);
});

test("createClaw exposes the time namespace when configured", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-time-sdk-workspace-"));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-time-sdk-data-"));
  const built = buildTimeApp({
    config: {
      host: "127.0.0.1",
      port: 0,
      dataDir,
      dbPath: path.join(dataDir, "core.sqlite"),
      defaultTimeZone: "Europe/Madrid",
      schedulerIntervalMs: 60_000,
    },
  });
  const address = await built.app.listen({ host: "127.0.0.1", port: 0 });

  try {
    const claw = await createClaw({
      runtime: { adapter: "demo" },
      workspace: {
        appId: "demo",
        workspaceId: "workspace-time-sdk",
        agentId: "agent-time-sdk",
        rootDir: workspaceDir,
      },
      time: { baseUrl: address },
    });

    assert.equal(claw.time.configured, true);
    assert.equal(claw.calendar.configured, true);
    assert.equal(claw.routines.configured, true);
    assert.equal(claw.watch.configured, true);

    const routine = await claw.routines.every({
      title: "Review pull requests",
      workspaceId: "workspace-time-sdk",
      agentId: "agent-time-sdk",
      expression: "3h",
      timezone: "Europe/Madrid",
      heartbeat: {
        when: ["workspace.tasks:new"],
        context: "diff",
        limit: 20,
        prompt: "Work on ready tasks",
        stopWhen: ["workspace.tasks:none"],
        target: "main",
        cooldownMs: 30_000,
        maxWakesPerWindow: { count: 2, windowMs: 300_000 },
      },
    });
    assert.equal(routine.item.kind, "routine");
    assert.deepEqual(routine.item.heartbeat?.when, ["workspace.tasks:new"]);
    assert.equal(routine.item.heartbeat?.target, "main");
    assert.equal(routine.item.heartbeat?.cooldownMs, 30_000);

    const event = await claw.calendar.at({
      title: "Release sync",
      workspaceId: "workspace-time-sdk",
      agentId: "agent-time-sdk",
      expression: "monday 9am",
      timezone: "Europe/Madrid",
    });
    assert.equal(event.item.kind, "event");

    const reminder = await claw.reminders.after({
      title: "Check build",
      workspaceId: "workspace-time-sdk",
      agentId: "agent-time-sdk",
      after: "30m",
      timezone: "Europe/Madrid",
    });
    assert.equal(reminder.item.kind, "reminder");

    const watch = await claw.watch.create({
      target: "thread:thread-1",
      workspaceId: "workspace-time-sdk",
      agentId: "agent-time-sdk",
      ifNo: "reply",
      after: "24h",
      then: { kind: "remind", title: "Nudge owner" },
      timezone: "Europe/Madrid",
    });
    assert.equal(watch.item.kind, "follow_up");
    assert.equal(watch.item.anchorType, "thread");

    const listed = await claw.time.list({ workspaceId: "workspace-time-sdk" });
    assert.equal(listed.items.some((item) => item.id === routine.item.id), true);
    assert.equal((await claw.routines.list({ workspaceId: "workspace-time-sdk" })).items.some((item) => item.id === routine.item.id), true);
  } finally {
    await built.app.close();
  }
});

test("createClaw embeds the time engine by default", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-time-sdk-embedded-"));
  const dataRoot = path.join(workspaceDir, "clawjs-data");
  await withPatchedEnv({
    CLAW_DATA_DIR: dataRoot,
  }, async () => {
    const claw = await createClaw({
      runtime: { adapter: "demo" },
      workspace: {
        appId: "demo",
        workspaceId: "workspace-time-embedded",
        agentId: "agent-time-embedded",
        rootDir: workspaceDir,
      },
    });

    assert.equal(claw.time.configured, true);
    const created = await claw.time.create({
      kind: "reminder",
      title: "Check release",
      startsAt: "2026-04-15T09:00:00.000Z",
      schedule: { mode: "one_off", timezone: "UTC", startsAt: "2026-04-15T09:00:00.000Z" },
      anchorType: "task",
      anchorId: "task-123",
    });
    assert.equal(created.item.anchorType, "task");
    assert.equal(created.item.nextRunAt, "2026-04-15T09:00:00.000Z");

    const signalled = await claw.time.signalAnchor({ anchorId: "task-123", signal: "task_completed" });
    assert.equal(signalled.items[0]?.id, created.item.id);
    assert.equal(signalled.items[0]?.status, "cancelled");

    assert.equal(fs.existsSync(path.join(dataRoot, "core.sqlite")), true);
  });
});

test("createClaw can diff and sync binding output", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-binding-"));
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  const binding = {
    id: "tone",
    targetFile: "SOUL.md",
    mode: "managed_block" as const,
    blockId: "tone",
    settingsPath: "tone",
  };

  const diff = claw.files.diffBinding(binding, { tone: "direct" }, (settings) => `tone=${settings.tone}`);
  assert.equal(diff.changed, true);
  assert.equal(fs.existsSync(path.join(workspaceDir, "SOUL.md")), false);

  const synced = claw.files.syncBinding(binding, { tone: "direct" }, (settings) => `tone=${settings.tone}`);
  assert.equal(synced.changed, true);
  assert.equal(fs.existsSync(path.join(workspaceDir, "SOUL.md")), true);
});

test("createClaw exposes a workspace-backed session store", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-sessions-"));
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  const session = claw.sessions.createSession("Hello");
  claw.sessions.appendMessage(session.sessionId, {
    role: "user",
    content: "first",
  });

  assert.equal(claw.sessions.listSessions().length, 1);
  assert.equal(claw.sessions.getSession(session.sessionId)?.messageCount, 1);
});

test("createClaw can search sessions locally", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-search-local-"));
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-search-local",
      agentId: "demo-search-local",
      rootDir: workspaceDir,
    },
  });

  const session = claw.sessions.createSession("Budget review");
  claw.sessions.appendMessage(session.sessionId, {
    role: "user",
    content: "Need to review the quarterly budget with finance",
  });

  const results = await claw.sessions.searchSessions({
    query: "quarterly budget",
    strategy: "local",
  });

  assert.equal(results.length, 1);
  assert.equal(results[0]?.sessionId, session.sessionId);
  assert.equal(results[0]?.strategy, "local");
  assert.equal(results[0]?.matchedFields.includes("message"), true);
});

test("createClaw can search sessions through OpenClaw memory search", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-search-memory-"));
  const { binDir, openclawLog } = createFakeOpenClawMemoryToolchain();
  const memoryFixturePath = path.join(workspaceDir, "memory-search.json");
  const runtimeEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    FAKE_OPENCLAW_MEMORY_SEARCH_FILE: memoryFixturePath,
  };
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      env: runtimeEnv,
    },
    workspace: {
      appId: "demo",
      workspaceId: "demo-search-memory",
      agentId: "demo-search-memory",
      rootDir: workspaceDir,
    },
  });

  const session = claw.sessions.createSession("Budget review");
  claw.sessions.appendMessage(session.sessionId, {
    role: "user",
    content: "Need to review the quarterly budget with finance",
  });

  try {
    fs.writeFileSync(memoryFixturePath, JSON.stringify({
      results: [{
        text: "Need to review the quarterly budget with finance",
        path: `/tmp/agents/demo-search-memory/sessions/${session.sessionId}.jsonl`,
        startLine: 12,
        endLine: 16,
        score: 0.91,
      }],
    }));
    const results = await claw.sessions.searchSessions({
      query: "budget finance",
      strategy: "openclaw-memory",
      fallbackToLocal: false,
    });

    assert.equal(results.length, 1);
    assert.equal(results[0]?.sessionId, session.sessionId);
    assert.equal(results[0]?.strategy, "openclaw-memory");
    assert.equal(results[0]?.sourcePath?.includes(`/sessions/${session.sessionId}.jsonl`), true);
    assert.match(fs.readFileSync(openclawLog, "utf8"), /memory search --agent demo-search-memory --query budget finance --json/);
  } finally {
    delete runtimeEnv.FAKE_OPENCLAW_MEMORY_SEARCH_FILE;
  }
});

test("createClaw auto search falls back to local sessions when OpenClaw memory search is empty", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-search-auto-"));
  const { binDir } = createFakeOpenClawMemoryToolchain();
  const runtimeEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    FAKE_OPENCLAW_MEMORY_SEARCH: JSON.stringify({ results: [] }),
  };
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      env: runtimeEnv,
    },
    workspace: {
      appId: "demo",
      workspaceId: "demo-search-auto",
      agentId: "demo-search-auto",
      rootDir: workspaceDir,
    },
  });

  const session = claw.sessions.createSession("Hiring");
  claw.sessions.appendMessage(session.sessionId, {
    role: "user",
    content: "Prepare the interview loop for backend candidates",
  });

  try {
    const results = await claw.sessions.searchSessions({
      query: "interview loop",
      strategy: "auto",
    });

    assert.equal(results.length, 1);
    assert.equal(results[0]?.sessionId, session.sessionId);
    assert.equal(results[0]?.strategy, "local");
  } finally {
    delete runtimeEnv.FAKE_OPENCLAW_MEMORY_SEARCH;
  }
});

test("createClaw exposes OpenClaw channels through the public channels API", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-openclaw-channels-"));
  const { binDir, configPath } = createFakeOpenClawChannelsToolchain();
  const runtimeEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
    FAKE_OPENCLAW_CHANNELS_STATUS: JSON.stringify({
      channels: {
        whatsapp: {
          configured: true,
          connected: true,
          running: true,
        },
      },
      channelAccounts: {
        whatsapp: [{
          linked: true,
          connected: true,
        }],
      },
    }),
  };
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      configPath,
      env: runtimeEnv,
    },
    workspace: {
      appId: "demo",
      workspaceId: "demo-openclaw-channels",
      agentId: "demo-openclaw-channels",
      rootDir: workspaceDir,
    },
  });

  const status = await claw.runtime.status();
  const channels = await claw.channels.list();
  const inspected = await claw.workspace.inspect();

  assert.equal(status.capabilityMap.channels.supported, true);
  assert.equal(status.capabilityMap.channels.status, "ready");
  assert.deepEqual(channels.find((channel) => channel.id === "whatsapp"), {
    id: "whatsapp",
    label: "WhatsApp",
    kind: "chat",
    status: "connected",
    provider: "whatsapp",
    lastError: null,
    metadata: {
      pluginEnabled: true,
      linked: true,
      connected: true,
      configured: true,
      running: true,
      accountCount: 1,
    },
  });
  assert.equal(inspected.channelsState?.channels.some((channel) => channel.id === "whatsapp" && channel.status === "connected"), true);
});

test("createClaw can use runtime.binaryPath when OpenClaw is outside PATH", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-openclaw-explicit-"));
  const { binaryPath, openclawLog } = createExplicitOpenClawToolchain();
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      binaryPath,
      env: {
        ...process.env,
        PATH: process.env.PATH || "",
      },
    },
    workspace: {
      appId: "demo",
      workspaceId: "demo-openclaw-explicit",
      agentId: "demo-openclaw-explicit",
      rootDir: workspaceDir,
    },
  });

  const status = await claw.runtime.status();
  await claw.runtime.setupWorkspace();

  assert.equal(status.cliAvailable, true);
  assert.equal(status.version, "3.2.1");
  assert.match(fs.readFileSync(openclawLog, "utf8"), /agents add demo-openclaw-explicit/);
});

test("createClaw exposes external skill sources and search results", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-skill-sources-"));
  const { binDir } = createFakeSkillSourceToolchain();
  const runtimeEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    FAKE_CLAWHUB_SEARCH_JSON: JSON.stringify([
      {
        slug: "support-triage",
        label: "Support Triage",
        summary: "Prioritize incoming support work.",
      },
    ]),
  };
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      env: runtimeEnv,
    },
    workspace: {
      appId: "demo",
      workspaceId: "demo-skill-sources",
      agentId: "demo-skill-sources",
      rootDir: workspaceDir,
    },
  });

  const sources = await claw.skills.sources();
  const result = await claw.skills.search("support", { limit: 3 });

  assert.equal(sources.some((entry) => entry.id === "workspace" && entry.status === "ready"), true);
  assert.equal(sources.some((entry) => entry.id === "clawhub" && entry.status === "ready"), true);
  assert.equal(sources.some((entry) => entry.id === "skills.sh" && entry.status === "ready"), true);
  assert.ok(result.entries.length >= 1, "should have at least one search result");
  assert.equal(result.entries.some((entry) => entry.source === "clawhub"), true);
  assert.equal(result.entries.some((entry) => entry.source === "workspace"), true);
  assert.equal(result.omittedSources?.some((entry) => entry.source === "skills.sh"), true);
});

test("createClaw can resolve exact skills.sh refs when the source is explicit", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-skill-search-exact-"));
  const { binDir } = createFakeSkillSourceToolchain();
  const runtimeEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
  };
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      env: runtimeEnv,
    },
    workspace: {
      appId: "demo",
      workspaceId: "demo-skill-search-exact",
      agentId: "demo-skill-search-exact",
      rootDir: workspaceDir,
    },
  });

  const result = await claw.skills.search("vercel-labs/agent-skills", { source: "skills.sh" });

  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0]?.source, "skills.sh");
  assert.equal(result.entries[0]?.installRef, "vercel-labs/agent-skills");
});

test("createClaw installs clawhub skills and refreshes runtime inventory", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-skill-install-runtime-"));
  const { binDir, clawhubLog } = createFakeSkillSourceToolchain();
  const runtimeEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
  };
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      env: runtimeEnv,
    },
    workspace: {
      appId: "demo",
      workspaceId: "demo-skill-install-runtime",
      agentId: "demo-skill-install-runtime",
      rootDir: workspaceDir,
    },
  });

  const result = await claw.skills.install("support-triage", { source: "clawhub" });
  const skills = await claw.skills.list();

  assert.equal(result.runtimeVisibility, "runtime");
  assert.equal(result.syncedSkills?.some((entry) => entry.id === "support-triage"), true);
  assert.equal(skills.some((entry) => entry.id === "support-triage"), true);
  assert.equal(fs.existsSync(path.join(workspaceDir, "skills", "support-triage", "SKILL.md")), true);
  assert.match(fs.readFileSync(clawhubLog, "utf8"), /install support-triage/);
});

test("createClaw installs skills.sh skills as external when runtime inventory does not change", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-skill-install-external-"));
  const { binDir, npxLog } = createFakeSkillSourceToolchain();
  const runtimeEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
  };
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      env: runtimeEnv,
    },
    workspace: {
      appId: "demo",
      workspaceId: "demo-skill-install-external",
      agentId: "demo-skill-install-external",
      rootDir: workspaceDir,
    },
  });

  const result = await claw.skills.install("vercel-labs/agent-skills", { source: "skills.sh" });

  assert.equal(result.runtimeVisibility, "external");
  assert.equal(result.syncedSkills, undefined);
  assert.match(fs.readFileSync(npxLog, "utf8"), /--yes skills add vercel-labs\/agent-skills/);
});

test("createClaw library resolves and syncs local skills and instruction blocks", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-library-sync-workspace-"));
  const libraryDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-library-sync-library-"));
  const skillSourceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-library-skill-source-"));
  fs.writeFileSync(path.join(skillSourceDir, "skill.json"), JSON.stringify({
    id: "namecheap",
    name: "Namecheap",
    version: "0.1.0",
    description: "Manage domain operations through safe references.",
  }, null, 2));

  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    library: { rootDir: libraryDir },
    workspace: {
      appId: "demo",
      workspaceId: "demo-library-sync",
      agentId: "ada",
      rootDir: workspaceDir,
    },
  });

  claw.library.importSkill("namecheap", {
    id: "namecheap",
    title: "Namecheap",
    path: skillSourceDir,
    tags: ["domains"],
  });
  claw.library.createInstruction({
    id: "ceo-soul",
    title: "CEO Soul",
    projection: { target: "agents" },
    content: "Operate like a pragmatic CEO.",
  });
  claw.library.assign({ assetId: "namecheap", scope: "agent", targetId: "ada" });
  claw.library.assign({ assetId: "ceo-soul", scope: "agent", targetId: "ada" });

  const synced = await claw.library.sync();

  assert.equal(synced.resolved.assets.length, 2);
  assert.equal(synced.syncedSkills.some((entry) => entry.id === "namecheap"), true);
  assert.equal(fs.existsSync(path.join(workspaceDir, "skills", "namecheap", "skill.json")), true);
  assert.match(fs.readFileSync(path.join(workspaceDir, "AGENTS.md"), "utf8"), /Operate like a pragmatic CEO/);
});

test("createClaw library sync blocks missing secret references unless explicitly allowed", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-library-secret-workspace-"));
  const libraryDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-library-secret-library-"));
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    library: { rootDir: libraryDir },
    workspace: {
      appId: "demo",
      workspaceId: "demo-library-secret",
      agentId: "ops",
      rootDir: workspaceDir,
    },
  });

  claw.library.create({
    id: "namecheap",
    kind: "skill",
    title: "Namecheap",
    requiredSecrets: [{ name: "namecheap_api_token", label: "Namecheap API token" }],
    source: { source: "workspace", installRef: "namecheap" },
  });
  claw.library.assign({ assetId: "namecheap", scope: "agent", targetId: "ops" });

  await assert.rejects(() => claw.library.sync(), /Missing required library secrets: namecheap:namecheap_api_token/);
  const resolved = claw.library.resolve();
  assert.equal(JSON.stringify(resolved).includes("secret-value"), false);
  assert.equal(resolved.missingSecrets[0]?.name, "namecheap_api_token");
});

test("createClaw instances keep separate workspaces and sessions isolated", async () => {
  const workspaceA = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-a-"));
  const workspaceB = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-b-"));

  const clawA = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-a",
      agentId: "demo-a",
      rootDir: workspaceA,
    },
  });
  const clawB = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-b",
      agentId: "demo-b",
      rootDir: workspaceB,
    },
  });

  await Promise.all([clawA.workspace.init(), clawB.workspace.init()]);

  const sessionA = clawA.sessions.createSession("Alpha");
  clawA.sessions.appendMessage(sessionA.sessionId, { role: "user", content: "only-a" });
  const sessionB = clawB.sessions.createSession("Beta");
  clawB.sessions.appendMessage(sessionB.sessionId, { role: "user", content: "only-b" });

  clawA.files.writeWorkspaceFile("notes.md", "workspace-a\n");
  clawB.files.writeWorkspaceFile("notes.md", "workspace-b\n");

  assert.equal(clawA.sessions.listSessions().length, 1);
  assert.equal(clawB.sessions.listSessions().length, 1);
  assert.equal(clawA.sessions.getSession(sessionB.sessionId), null);
  assert.equal(clawB.sessions.getSession(sessionA.sessionId), null);
  assert.equal(clawA.files.readWorkspaceFile("notes.md"), "workspace-a\n");
  assert.equal(clawB.files.readWorkspaceFile("notes.md"), "workspace-b\n");
  assert.equal(fs.existsSync(resolveClawWorkspaceSurfacePath("claw.workspace.sessions", workspaceA, `${sessionB.sessionId}.jsonl`)), false);
  assert.equal(fs.existsSync(resolveClawWorkspaceSurfacePath("claw.workspace.sessions", workspaceB, `${sessionA.sessionId}.jsonl`)), false);
});

test("createClaw instances can share a workspace and initialize it in parallel", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-shared-"));

  const clawA = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-shared",
      agentId: "demo-shared",
      rootDir: workspaceDir,
    },
  });
  const clawB = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-shared",
      agentId: "demo-shared",
      rootDir: workspaceDir,
    },
  });

  await Promise.all([clawA.workspace.init(), clawB.workspace.init()]);

  const [sessionA, sessionB] = await Promise.all([
    Promise.resolve().then(() => clawA.sessions.createSession("Alpha")),
    Promise.resolve().then(() => clawB.sessions.createSession("Beta")),
  ]);

  await Promise.all([
    Promise.resolve().then(() => clawA.sessions.appendMessage(sessionA.sessionId, { role: "user", content: "only-a" })),
    Promise.resolve().then(() => clawB.sessions.appendMessage(sessionB.sessionId, { role: "user", content: "only-b" })),
    Promise.resolve().then(() => clawA.files.writeWorkspaceFile("notes-a.md", "workspace-a\n")),
    Promise.resolve().then(() => clawB.files.writeWorkspaceFile("notes-b.md", "workspace-b\n")),
  ]);

  assert.equal(clawA.sessions.listSessions().length, 2);
  assert.equal(clawB.sessions.listSessions().length, 2);
  assert.equal(clawA.sessions.getSession(sessionB.sessionId)?.messageCount, 1);
  assert.equal(clawB.sessions.getSession(sessionA.sessionId)?.messageCount, 1);
  assert.equal(clawA.files.readWorkspaceFile("notes-a.md"), "workspace-a\n");
  assert.equal(clawA.files.readWorkspaceFile("notes-b.md"), "workspace-b\n");
  assert.equal(clawB.files.readWorkspaceFile("notes-a.md"), "workspace-a\n");
  assert.equal(clawB.files.readWorkspaceFile("notes-b.md"), "workspace-b\n");
  assert.equal(fs.existsSync(resolveClawWorkspaceSurfacePath("claw.workspace.sessions", workspaceDir, `${sessionA.sessionId}.jsonl`)), true);
  assert.equal(fs.existsSync(resolveClawWorkspaceSurfacePath("claw.workspace.sessions", workspaceDir, `${sessionB.sessionId}.jsonl`)), true);
});

test("createClaw exposes workspace validation and binding persistence", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-workspace-"));
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  await claw.workspace.init();
  const validation = await claw.workspace.validate();
  assert.equal(validation.ok, true);

  claw.files.writeBindingStore([{
    id: "tone",
    targetFile: "SOUL.md",
    mode: "managed_block",
    blockId: "tone",
    settingsPath: "tone",
  }]);
  claw.files.writeSettingsSchema({
    tone: { type: "string" },
  });

  assert.equal(claw.files.readBindingStore().bindings.length, 1);
  assert.equal((claw.files.readSettingsSchema().settingsSchema.tone as { type: string }).type, "string");
});

test("createClaw exposes intent, observed, and feature APIs for declarative model sync", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-intent-api-"));
  const claw = await createClaw({
    runtime: { adapter: "demo" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-intent",
      agentId: "demo-intent",
      rootDir: workspaceDir,
    },
  });

  await claw.workspace.init();
  const features = claw.features.describe();
  const initialIntent = claw.intent.get("models") as { defaultModel?: string | null };

  assert.equal(features.some((feature) => feature.featureId === "models" && feature.ownership === "sdk-owned"), true);
  assert.equal(initialIntent.defaultModel ?? null, null);

  const modelId = await claw.models.setDefault("openai/gpt-5.4");
  const modelsIntent = claw.intent.get("models") as { defaultModel?: string | null };
  const observedModels = claw.observed.read("models") as {
    defaultModel?: {
      modelId?: string | null;
    } | null;
  } | null;
  const diff = await claw.intent.diff({ domains: ["models"] });
  const inspected = await claw.workspace.inspect();

  assert.equal(modelId, "openai/gpt-5.4");
  assert.equal(modelsIntent.defaultModel, "openai/gpt-5.4");
  assert.equal(observedModels?.defaultModel?.modelId, "openai/gpt-5.4");
  assert.equal(diff.drifted, false);
  assert.equal(fs.existsSync(inspected.intentPaths.models), true);
  assert.equal(fs.existsSync(inspected.observedPaths.models), true);
});

test("createClaw can repair workspace layout and canonicalize compat snapshots", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-repair-"));
  fs.mkdirSync(resolveClawWorkspaceSurfacePath("claw.workspace.compat", workspaceDir), { recursive: true });
  fs.writeFileSync(resolveClawWorkspaceSurfacePath("claw.workspace.compat", workspaceDir, "runtime-snapshot.json"), JSON.stringify({
    schemaVersion: 1,
    runtimeAdapter: "openclaw",
    runtimeVersion: "1.2.3",
    probedAt: "2026-03-20T00:00:00.000Z",
    capabilities: {
      version: true,
      modelsStatus: true,
      agentsList: true,
      gatewayCall: false,
    },
  }, null, 2));

  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  const repaired = await claw.workspace.repair();
  assert.equal(repaired.compatSnapshotCanonicalized, true);
  assert.equal((await claw.workspace.validate()).ok, true);
});

test("createClaw exposes workspace reset preview and result", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-reset-"));
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  await claw.workspace.init();
  claw.files.writeWorkspaceFile("notes.md", "keep\n");
  const preview = await claw.workspace.previewReset({ removeRuntimeFiles: true });
  assert.equal(preview.targets.some((target) => target.path.endsWith("SOUL.md") && target.exists), true);

  const result = await claw.workspace.reset({ removeRuntimeFiles: true });
  assert.equal(result.removedPaths.some((entry) => entry.endsWith("SOUL.md")), true);
  assert.equal(claw.files.readWorkspaceFile("notes.md"), "keep\n");
});

test("createClaw emits domain events and supports auth key storage", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-events-"));
  const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-agent-"));
  const claw = await createClaw({
    runtime: { adapter: "openclaw", agentDir },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  const seen: string[] = [];
  const stop = claw.watch.events("*", (event) => {
    seen.push(event.type);
  });

  await claw.workspace.init();
  const session = claw.sessions.createSession("Hello");
  claw.sessions.appendMessage(session.sessionId, {
    role: "user",
    content: "first",
  });
  const authSummary = claw.auth.setApiKey("anthropic", "sk-ant-secret-12345678");
  const diagnostics = claw.auth.diagnostics("anthropic");
  stop();

  assert.equal(authSummary.profileId, "anthropic:manual");
  assert.ok(diagnostics.profiles);
  assert.equal(diagnostics.profiles[0]?.maskedCredential, "******************5678");
  assert.deepEqual(seen, [
    "workspace.initialized",
    "sessions.session_created",
    "sessions.message_appended",
    "auth.progress",
    "auth.api_key_saved",
    "auth.progress",
  ]);

  const auditLog = fs.readFileSync(resolveClawWorkspaceSurfacePath("claw.workspace.audit", workspaceDir, "audit.jsonl"), "utf8");
  assert.equal(auditLog.includes("sk-ant-secret-12345678"), false);
});

test("createClaw provider intents reconcile auth state and disabled providers", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-provider-intent-"));
  const claw = await createClaw({
    runtime: { adapter: "demo" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-provider-intent",
      agentId: "demo-provider-intent",
      rootDir: workspaceDir,
    },
  });

  claw.auth.setApiKey("openai", "sk-demo-12345678");
  await claw.auth.status();
  const providersIntentAfterSave = claw.intent.get("providers") as {
    providers?: Record<string, {
      enabled?: boolean;
      preferredAuthMode?: string | null;
      profileId?: string | null;
    }>;
  };
  const diffAfterSave = await claw.intent.diff({ domains: ["providers"] });

  assert.equal(providersIntentAfterSave.providers?.openai?.enabled, true);
  assert.equal(providersIntentAfterSave.providers?.openai?.preferredAuthMode, "api_key");
  assert.equal(diffAfterSave.drifted, false);

  await claw.auth.setProviderEnabled("openai", false, {
    preferredAuthMode: "api_key",
  });

  const authState = await claw.auth.status();
  const diffAfterDisable = await claw.intent.diff({ domains: ["providers"] });

  assert.equal(authState.openai?.hasAuth, false);
  assert.equal(diffAfterDisable.drifted, false);
});

test("createClaw auth.prepareLogin and auth.login report reused OpenClaw auth with alias resolution", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-openclaw-login-plan-"));
  const agentDir = path.join(workspaceDir, ".runtime-agent");
  fs.mkdirSync(agentDir, { recursive: true });
  fs.writeFileSync(path.join(agentDir, "auth-profiles.json"), JSON.stringify({
    version: 1,
    profiles: {
      "openai-codex:default": {
        type: "oauth",
        provider: "openai-codex",
        maskedCredential: "••••oauth",
      },
    },
  }, null, 2));
  const { binaryPath } = createOpenClawAuthReadyToolchain({});
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      binaryPath,
      agentDir,
    },
    workspace: {
      appId: "demo",
      workspaceId: "demo-openclaw-login-plan",
      agentId: "demo-openclaw-login-plan",
      rootDir: workspaceDir,
    },
  });

  const seen: string[] = [];
  const plan = await claw.auth.prepareLogin("openai");
  const result = await claw.auth.login("openai", {
    onProgress: (event) => {
      seen.push(`${event.status}:${event.step ?? "none"}:${event.result ?? "none"}`);
    },
  });

  assert.equal(plan.provider, "openai-codex");
  assert.equal(plan.status, "reused");
  assert.equal(plan.launchMode, "none");
  assert.equal(result.provider, "openai-codex");
  assert.equal(result.requestedProvider, "openai");
  assert.equal(result.status, "reused");
  assert.equal(result.launchMode, "none");
  assert.deepEqual(seen, [
    "start:checking_existing_auth:none",
    "complete:reused_existing_auth:reused",
  ]);
});

test("createClaw auth.login reports launched flows through the SDK callback", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-login-progress-"));
  const claw = await createClaw({
    runtime: { adapter: "demo" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-login-progress",
      agentId: "demo-login-progress",
      rootDir: workspaceDir,
    },
  });

  const seen: string[] = [];
  const plan = await claw.auth.prepareLogin("openai");
  const result = await claw.auth.login("openai", {
    onProgress: (event) => {
      seen.push(`${event.status}:${event.step ?? "none"}:${event.result ?? "none"}:${event.launchMode ?? "none"}`);
    },
  });

  assert.equal(plan.status, "launch_required");
  assert.equal(result.status, "launched");
  assert.equal(result.launchMode, "browser");
  assert.equal(typeof result.command, "string");
  assert.deepEqual(seen, [
    "start:checking_existing_auth:none:none",
    "complete:launching_interactive_flow:launched:browser",
  ]);
});

test("createClaw doctor report includes workspace diagnostics", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-doctor-"));
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  const report = await claw.doctor.run();
  assert.ok("workspace" in report);
  assert.equal(Array.isArray(report.suggestedRepairs), true);
  assert.equal(report.workspace.ok, false);
});

test("createClaw doctor report surfaces compat snapshot drift", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-doctor-drift-"));
  fs.mkdirSync(resolveClawWorkspaceSurfacePath("claw.workspace.compat", workspaceDir), { recursive: true });
  fs.writeFileSync(resolveClawWorkspaceSurfacePath("claw.workspace.compat", workspaceDir, "runtime-snapshot.json"), JSON.stringify({
    schemaVersion: 1,
    runtimeAdapter: "openclaw",
    runtimeVersion: "0.9.0",
    probedAt: "2026-03-20T00:00:00.000Z",
    capabilities: {
      version: true,
      modelsStatus: true,
      agentsList: true,
      gatewayCall: true,
    },
    diagnostics: {
      versionFamily: "0.9",
      capabilitySignature: "agentsList=1|gatewayCall=1|modelsStatus=1|version=1",
    },
  }, null, 2));

  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  const report = await claw.doctor.run();
  assert.equal(report.compatSnapshot?.runtimeVersion, "0.9.0");
  assert.equal(report.compatDrift.drifted, true);
  assert.match(report.suggestedRepairs.join(" "), /Refresh the compat snapshot/);
});

test("createClaw doctor report surfaces malformed managed blocks", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-doctor-blocks-"));
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  await claw.workspace.init();
  claw.files.writeWorkspaceFile("SOUL.md", [
    "<!-- CLAW:tone:START -->",
    "kind",
    "<!-- CLAW:tone:START -->",
  ].join("\n"));

  const report = await claw.doctor.run();
  assert.equal(report.managedBlockProblems?.length ? report.managedBlockProblems.length > 0 : false, true);
  assert.match(report.issues.map((issue) => issue.message).join(" "), /Managed block tone/);
});

test("createClaw exposes runtime command builders", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-runtime-"));
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  assert.equal(path.basename(claw.runtime.installCommand("pnpm").command), "pnpm");
  assert.deepEqual(claw.runtime.installCommand("pnpm").args, ["add", "-g", "openclaw"]);
  assert.equal(path.basename(claw.runtime.uninstallCommand("pnpm").command), "pnpm");
  assert.deepEqual(claw.runtime.uninstallCommand("pnpm").args, ["remove", "-g", "openclaw"]);
  assert.deepEqual(claw.runtime.setupWorkspaceCommand(), {
    command: "openclaw",
    args: ["agents", "add", "demo-main", "--non-interactive", "--workspace", workspaceDir, "--json"],
    env: claw.runtime.setupWorkspaceCommand().env,
  });
  assert.deepEqual(claw.runtime.repairCommand(), {
    command: "openclaw",
    args: ["gateway", "install"],
    env: claw.runtime.repairCommand().env,
  });
  assert.deepEqual(
    claw.runtime.installPlan("pnpm").steps.map((step) => step.phase),
    ["runtime.install.prepare", "runtime.install.execute", "runtime.install.finalize"],
  );
  assert.deepEqual(
    claw.runtime.uninstallPlan("pnpm").steps.map((step) => step.phase),
    ["runtime.uninstall.prepare", "runtime.uninstall.execute", "runtime.uninstall.finalize"],
  );
});

test("createClaw exposes richer workspace file helpers", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-files-"));
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  await claw.workspace.init();
  const preview = claw.files.previewWorkspaceFile("SOUL.md", "hello\n");
  assert.equal(preview.exists, true);
  assert.equal(preview.changed, true);

  claw.files.writeWorkspaceFile("SOUL.md", "before\n\n<!-- CLAW:tone:START -->\nkind\n<!-- CLAW:tone:END -->\n");
  assert.equal(claw.files.readWorkspaceFile("SOUL.md"), "before\n\n<!-- CLAW:tone:START -->\nkind\n<!-- CLAW:tone:END -->\n");
  assert.equal(claw.files.inspectWorkspaceFile("SOUL.md").managedBlocks.length, 1);
  assert.equal(claw.files.inspectManagedBlock("SOUL.md", "tone").innerContent, "kind");
});

test("createClaw compat refresh persists capability and provider state artifacts", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-compat-state-"));
  const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-compat-agent-"));
  const claw = await createClaw({
    runtime: { adapter: "openclaw", agentDir },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  await claw.workspace.init();
  await claw.compat.refresh();
  await claw.auth.status();
  const inspected = await claw.workspace.inspect();

  assert.equal(fs.existsSync(inspected.capabilityReportPath), true);
  assert.equal(fs.existsSync(inspected.workspaceStatePath), true);
  assert.equal(fs.existsSync(inspected.providerStatePath), true);
  assert.equal(inspected.capabilityReport?.schemaVersion, 1);
  assert.equal(inspected.workspaceState?.workspaceId, "demo-main");
  assert.ok(inspected.providerState?.providers);
});

test("createClaw can stream and persist an assistant reply through gateway config", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-stream-"));
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      gateway: {
        url: "http://127.0.0.1:18789",
      },
    },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  const originalFetch = globalThis.fetch;
  const encoder = new TextEncoder();
  let gatewayBody = "";
  globalThis.fetch = (async (_url, init) => {
    gatewayBody = typeof init?.body === "string" ? init.body : "";
    return new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('event: response.output_text.delta\ndata: {"delta":"hello"}\n\n'));
      controller.enqueue(encoder.encode('event: response.output_text.delta\ndata: {"delta":" world"}\n\n'));
      controller.close();
    },
  }), { status: 200 });
  }) as typeof fetch;

  try {
    claw.rules.upsertScope({ id: "global", kind: "user", name: "global" });
    claw.rules.propose({
      id: "reply-style",
      title: "Reply style",
      kind: "directive",
      status: "active",
      scopeId: "global",
      content: "Keep streamed replies direct.",
    });
    const session = claw.sessions.createSession("Hello");
    claw.sessions.appendMessage(session.sessionId, {
      role: "user",
      content: "say hi",
    });

    const seen: string[] = [];
    for await (const chunk of claw.sessions.streamAssistantReply({
      sessionId: session.sessionId,
      systemPrompt: "Be concise.",
      contextBlocks: [{ title: "Mode", content: "Friendly." }],
      transport: "gateway",
      coalesceMs: 0,
    })) {
      if (!chunk.done) seen.push(chunk.delta);
    }

    assert.deepEqual(seen, ["hello", " world"]);
    assert.equal(
      claw.sessions.getSession(session.sessionId)?.messages.at(-1)?.content,
      "hello world",
    );
    assert.match(gatewayBody, /Applicable Rules/);
    assert.match(gatewayBody, /Keep streamed replies direct/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createClaw sends persisted documents through OpenClaw responses transport", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-stream-docs-"));
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      gateway: {
        url: "http://127.0.0.1:18789",
      },
    },
    workspace: {
      appId: "demo",
      workspaceId: "demo-docs",
      agentId: "demo-docs",
      rootDir: workspaceDir,
    },
  });

  let requestBody: Record<string, unknown> | null = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url, init) => {
    requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('event: response.output_text.delta\ndata: {"delta":"reviewed"}\n\n'));
        controller.close();
      },
    }), { status: 200 });
  }) as typeof fetch;

  try {
    const session = claw.sessions.createSession("Budget");
    const document = await claw.documents.upload({
      name: "budget.pdf",
      mimeType: "application/pdf",
      data: Buffer.from("budget alpha").toString("base64"),
      sessionId: session.sessionId,
    });
    claw.sessions.appendMessage(session.sessionId, {
      role: "user",
      content: "Review the attached budget",
      documents: [{
        documentId: document.documentId,
        name: document.name,
        mimeType: document.mimeType,
        sizeBytes: document.sizeBytes,
      }],
    });

    const seen: string[] = [];
    for await (const chunk of claw.sessions.streamAssistantReply({
      sessionId: session.sessionId,
      transport: "gateway",
      coalesceMs: 0,
    })) {
      if (!chunk.done) seen.push(chunk.delta);
    }

    assert.deepEqual(seen, ["reviewed"]);
    assert.match(JSON.stringify(requestBody), /input_file/);
    assert.match(JSON.stringify(requestBody), /budget\.pdf/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createClaw can generate and persist a session title", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-title-"));
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      gateway: {
        url: "http://127.0.0.1:18789",
      },
    },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    choices: [{ message: { content: "Work anxiety" } }],
  }), { status: 200 })) as typeof fetch;

  try {
    const session = claw.sessions.createSession("Hello");
    claw.sessions.appendMessage(session.sessionId, {
      role: "user",
      content: "I want to talk about anxiety at work",
    });

    const title = await claw.sessions.generateTitle({
      sessionId: session.sessionId,
      transport: "gateway",
    });

    assert.equal(title, "Work anxiety");
    assert.equal(claw.sessions.getSession(session.sessionId)?.title, "Work anxiety");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createClaw surfaces runtime progress and session events", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-progress-"));
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  const runtimeEvents: string[] = [];
  await claw.runtime.repair((event) => {
    runtimeEvents.push(`${event.phase}:${event.status}`);
  }).catch(() => {});
  assert.ok(runtimeEvents.length >= 2);

  const originalFetch = globalThis.fetch;
  const encoder = new TextEncoder();
  globalThis.fetch = (async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('event: response.output_text.delta\ndata: {"delta":"Plan"}\n\n'));
      controller.enqueue(encoder.encode('event: response.output_text.delta\ndata: {"delta":" a launch checklist"}\n\n'));
      controller.close();
    },
  }), { status: 200 })) as typeof fetch;

  try {
    const streamingClaw = await createClaw({
      runtime: {
        adapter: "openclaw",
        gateway: { url: "http://127.0.0.1:18789" },
      },
      workspace: {
        appId: "demo",
        workspaceId: "demo-events",
        agentId: "demo-events",
        rootDir: fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-events-stream-")),
      },
    });
    const session = streamingClaw.sessions.createSession("Hello");
    streamingClaw.sessions.appendMessage(session.sessionId, {
      role: "user",
      content: "Plan a launch checklist",
    });

    const events: string[] = [];
    for await (const event of streamingClaw.sessions.streamAssistantReplyEvents({
      sessionId: session.sessionId,
      transport: "gateway",
      coalesceMs: 0,
    })) {
      events.push(event.type === "transport" ? `${event.type}:${event.transport}` : event.type);
    }

    assert.deepEqual(events, ["transport:gateway", "chunk", "chunk", "done", "title"]);
    assert.equal(streamingClaw.sessions.getSession(session.sessionId)?.title, "Plan a launch checklist");
    const assistant = streamingClaw.sessions.getSession(session.sessionId)?.messages.at(-1);
    assert.equal(assistant?.content, "Plan a launch checklist");
    assert.deepEqual((assistant?.metadata?.streamTrace as { deltas?: Array<{ text: string }> } | undefined)?.deltas?.map((delta) => delta.text), ["Plan", " a launch checklist"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createClaw exposes native OpenClaw session and chat gateway wrappers", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-native-openclaw-"));
  const { binDir, configPath, statePath } = createFakeOpenClawPluginToolchain();

  await withPatchedEnv({
    PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
  }, async () => {
    const claw = await createClaw({
      runtime: {
        adapter: "openclaw",
        configPath,
      },
      workspace: {
        appId: "demo",
        workspaceId: "demo-native-openclaw",
        agentId: "demo-native-openclaw",
        rootDir: workspaceDir,
      },
    });

    const list = await claw.runtime.openclaw.sessions.list({ limit: 5 }) as { sessions: Array<{ sessionKey: string }> };
    const preview = await claw.runtime.openclaw.sessions.preview({ sessionKey: "alpha" }) as { sessionKey: string; title: string };
    const history = await claw.runtime.openclaw.chat.history({ sessionKey: "alpha" }) as { sessionKey: string; messages: Array<{ role: string; content: string }> };
    const sent = await claw.runtime.openclaw.chat.send({ sessionKey: "alpha", message: "hello" }) as { accepted: boolean; sessionKey: string };

    assert.equal(list.sessions[0]?.sessionKey, "alpha");
    assert.equal(preview.title, "Native Alpha");
    assert.equal(history.messages[0]?.content, "hello from native");
    assert.equal(sent.accepted, true);
    assert.equal(sent.sessionKey, "alpha");

    const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
      gatewayCalls: Array<{ method: string }>;
    };
    assert.deepEqual(
      state.gatewayCalls.map((entry) => entry.method).slice(-4),
      ["sessions.list", "sessions.preview", "chat.history", "chat.send"],
    );
  });
});

test("createClaw does not persist partial assistant text when stream aborts", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-abort-"));
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      gateway: { url: "http://127.0.0.1:18789" },
    },
    workspace: {
      appId: "demo",
      workspaceId: "demo-abort",
      agentId: "demo-abort",
      rootDir: workspaceDir,
    },
  });

  const session = claw.sessions.createSession("Hello");
  claw.sessions.appendMessage(session.sessionId, {
    role: "user",
    content: "Plan a launch checklist",
  });

  const abortController = new AbortController();
  abortController.abort("user_cancelled");

  const events: string[] = [];
  for await (const event of claw.sessions.streamAssistantReplyEvents({
    sessionId: session.sessionId,
    transport: "gateway",
    signal: abortController.signal,
  })) {
    events.push(event.type);
  }

  assert.deepEqual(events, ["aborted"]);
  assert.equal(claw.sessions.getSession(session.sessionId)?.messageCount, 1);
});

test("createClaw exposes runtime/provider watchers and async event iteration", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-watchers-"));
  const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-watchers-agent-"));
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      agentDir,
    },
    workspace: {
      appId: "demo",
      workspaceId: "demo-watchers",
      agentId: "demo-watchers",
      rootDir: workspaceDir,
    },
  });

  const runtimeSnapshots: boolean[] = [];
  const stopRuntime = claw.watch.runtimeStatus((status) => {
    runtimeSnapshots.push(status.cliAvailable);
  }, { intervalMs: 20 });

  const providerSnapshots: boolean[] = [];
  const stopProviders = claw.watch.providerStatus((providers) => {
    providerSnapshots.push(Object.values(providers).some((provider) => provider.hasAuth));
  }, { intervalMs: 20 });

  const iterator = claw.watch.eventsIterator("auth.api_key_saved")[Symbol.asyncIterator]();
  claw.auth.setApiKey("anthropic", "sk-12345678");
  const nextEvent = await iterator.next();
  await iterator.return?.();

  const abortController = new AbortController();
  abortController.abort();
  const abortedIterator = claw.watch.eventsIterator("*", { signal: abortController.signal })[Symbol.asyncIterator]();
  const abortedEvent = await Promise.race([
    abortedIterator.next(),
    new Promise<IteratorResult<unknown>>((_, reject) => {
      setTimeout(() => reject(new Error("timed out waiting for aborted event iterator")), 1_000);
    }),
  ]);

  await new Promise((resolve) => setTimeout(resolve, 80));
  stopRuntime();
  stopProviders();

  assert.equal(nextEvent.done, false);
  assert.equal(nextEvent.value?.type, "auth.api_key_saved");
  assert.equal(abortedEvent.done, true);
  assert.equal(runtimeSnapshots.every((value) => typeof value === "boolean"), true);
  assert.equal(providerSnapshots.every((value) => typeof value === "boolean"), true);
});

test("createClaw saveApiKey supports runtime command mode and auth progress events", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-auth-runtime-"));
  const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-auth-runtime-agent-"));
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      agentDir,
    },
    workspace: {
      appId: "demo",
      workspaceId: "demo-auth-runtime",
      agentId: "demo-auth-runtime",
      rootDir: workspaceDir,
    },
  });

  const progress: string[] = [];
  const stop = claw.watch.events("auth.progress", (event) => {
    const payload = event.payload as { phase: string; status: string };
    progress.push(`${payload.phase}:${payload.status}`);
  });

  const persisted = await claw.auth.saveApiKey("openai", "sk-live-12345678", {
    runtimeCommand: {
      command: "/bin/sh",
      args: ["-lc", "exit 0"],
    },
  });
  stop();

  assert.equal(persisted.mode, "runtime");
  assert.equal(persisted.summary.maskedCredential, "************5678");
  assert.deepEqual(progress, [
    "auth.api_key.save:start",
    "auth.api_key.save:complete",
  ]);
  const authFile = fs.readFileSync(path.join(agentDir, "auth-profiles.json"), "utf8");
  assert.equal(authFile.includes("sk-live-12345678"), false);
});

test("createClaw initializes runtime-specific workspace layouts for zeroclaw and picoclaw", async () => {
  const scenarios = [
    {
      adapter: "zeroclaw" as const,
      expectedFile: "MEMORY.md",
      unexpectedFile: "TOOLS.md",
    },
    {
      adapter: "picoclaw" as const,
      expectedFile: path.join("memory", "MEMORY.md"),
      unexpectedFile: "TOOLS.md",
    },
  ];

  for (const scenario of scenarios) {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), `clawjs-instance-${scenario.adapter}-`));
    const claw = await createClaw({
      runtime: { adapter: scenario.adapter },
      workspace: {
        appId: "demo",
        workspaceId: `${scenario.adapter}-main`,
        agentId: `${scenario.adapter}-main`,
        rootDir: workspaceDir,
      },
    });

    await claw.workspace.init();
    const validation = await claw.workspace.validate();
    const canonicalPaths = claw.workspace.canonicalPaths();

    assert.equal(validation.ok, true);
    assert.equal(fs.existsSync(path.join(workspaceDir, scenario.expectedFile)), true);
    assert.equal(fs.existsSync(path.join(workspaceDir, scenario.unexpectedFile)), false);
    assert.equal(Object.values(canonicalPaths).some((entry) => entry.endsWith(scenario.expectedFile)), true);
  }
});

test("createClaw reports detect-only OpenClaw plugin bridge state without mutating runtime", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-plugin-detect-"));
  const { binDir, configPath, statePath, openclawLog } = createFakeOpenClawPluginToolchain();

  await withPatchedEnv({
    PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
  }, async () => {
    const claw = await createClaw({
      runtime: {
        adapter: "openclaw",
        configPath,
        pluginBridge: {
          mode: "detect-only",
        },
      },
      workspace: {
        appId: "demo",
        workspaceId: "demo-plugin-detect",
        agentId: "demo-plugin-detect",
        rootDir: workspaceDir,
      },
    });

    const bridge = await claw.runtime.plugins.status() as unknown as {
      supported: boolean;
      mode: string;
      basePlugin: { installed: boolean };
    };
    const list = await claw.runtime.plugins.list();
    const runtimeStatus = await claw.runtime.status();
    const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
      plugins: Record<string, unknown>;
    };
    const log = fs.readFileSync(openclawLog, "utf8");

    assert.equal(bridge.supported, true);
    assert.equal(bridge.mode, "detect-only");
    assert.equal(bridge.basePlugin.installed, false);
    assert.equal(list.plugins.length, 0);
    assert.equal(runtimeStatus.capabilityMap.plugins.status, "degraded");
    assert.equal((runtimeStatus.capabilityMap.plugins.diagnostics as { mode?: string }).mode, "detect-only");
    assert.deepEqual(Object.keys(state.plugins), []);
    assert.equal(log.includes("plugins install @clawjs/openclaw-plugin"), false);
  });
});

test("createClaw managed OpenClaw plugin bridge auto-installs and exposes ClawJS RPC wrappers", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-plugin-managed-"));
  const { binDir, configPath, statePath, openclawLog } = createFakeOpenClawPluginToolchain();

  await withPatchedEnv({
    PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
  }, async () => {
    const claw = await createClaw({
      runtime: {
        adapter: "openclaw",
        configPath,
        pluginBridge: {
          mode: "managed",
          enableContextEngine: true,
        },
      },
      workspace: {
        appId: "demo",
        workspaceId: "demo-plugin-managed",
        agentId: "demo-plugin-managed",
        rootDir: workspaceDir,
      },
    });

    const bridgeStatus = await claw.runtime.plugins.status() as unknown as {
      basePlugin: { installed: boolean; enabled: boolean; loaded: boolean };
      contextPlugin: { installed: boolean; enabled: boolean; selected: boolean; selectedEngineId: string | null };
    };
    const status = await claw.runtime.plugins.claw.status() as {
      pluginId: string;
      features: { observability: boolean };
    };
    const events = await claw.runtime.plugins.claw.events.list({ kind: "tool", limit: 3 }) as {
      items: Array<{ kind: string }>;
    };
    const inspect = await claw.runtime.plugins.claw.sessions.inspect({ sessionKey: "alpha" }) as {
      found: boolean;
      session: { sessionKey: string };
    };
    const run = await claw.runtime.plugins.claw.subagent.run({ sessionKey: "alpha", message: "hello" }) as {
      runId: string;
    };
    const wait = await claw.runtime.plugins.claw.subagent.wait({ runId: run.runId, timeoutMs: 500 }) as {
      status: string;
    };
    const messages = await claw.runtime.plugins.claw.subagent.messages({ sessionKey: "alpha", limit: 5 }) as {
      messages: Array<{ role: string; content: string }>;
    };
    const hooks = await claw.runtime.plugins.claw.hooks.list() as {
      hooks: Array<{ name: string }>;
    };
    const hookStatus = await claw.runtime.plugins.claw.hooks.status() as {
      allowPromptInjection: boolean;
    };
    const context = await claw.runtime.plugins.claw.context.status() as {
      installed: boolean;
      selected: boolean;
    };
    const doctor = await claw.runtime.plugins.claw.doctor() as {
      ok: boolean;
    };
    const runtimeStatus = await claw.runtime.status();
    const runtimeDoctor = await claw.runtime.plugins.doctor();
    const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      plugins?: { slots?: { contextEngine?: string } };
    };
    const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
      plugins: Record<string, { enabled?: boolean; status?: string }>;
      gatewayRestarts: number;
    };
    const log = fs.readFileSync(openclawLog, "utf8");

    assert.equal(bridgeStatus.basePlugin.installed, false);
    assert.equal(status.pluginId, "clawjs");
    assert.equal(status.features.observability, true);
    assert.equal(events.items[0]?.kind, "tool");
    assert.equal(inspect.found, true);
    assert.equal(inspect.session.sessionKey, "alpha");
    assert.equal(run.runId, "run:alpha");
    assert.equal(wait.status, "completed");
    assert.deepEqual(messages.messages, [{ role: "assistant", content: "bridge:alpha" }]);
    assert.equal(hooks.hooks[0]?.name, "session_start");
    assert.equal(hookStatus.allowPromptInjection, false);
    assert.equal(context.installed, true);
    assert.equal(context.selected, true);
    assert.equal(doctor.ok, true);
    assert.equal(runtimeDoctor.ok, true);
    assert.equal(runtimeStatus.capabilityMap.plugins.status, "ready");
    assert.equal(config.plugins?.slots?.contextEngine, "clawjs-context");
    assert.equal(state.plugins.clawjs?.enabled, true);
    assert.equal(state.plugins["clawjs-context"]?.enabled, true);
    assert.equal(state.gatewayRestarts >= 1, true);
    assert.match(log, /plugins install @clawjs\/openclaw-plugin/);
    assert.match(log, /plugins enable clawjs/);
    assert.match(log, /plugins install @clawjs\/openclaw-context-engine/);
    assert.match(log, /plugins enable clawjs-context/);
    assert.match(log, /gateway restart/);
    assert.match(log, /gateway call --json --timeout 10000 --params \{\} --token plugin-test-token --url ws:\/\/127\.0\.0\.1:18789 clawjs\.status/);

    const ensuredBridge = await claw.runtime.plugins.status() as unknown as {
      basePlugin: { enabled: boolean; loaded: boolean };
      contextPlugin: { selected: boolean; selectedEngineId: string | null };
    };
    assert.equal(ensuredBridge.basePlugin.enabled, true);
    assert.equal(ensuredBridge.basePlugin.loaded, true);
    assert.equal(ensuredBridge.contextPlugin.selected, true);
    assert.equal(ensuredBridge.contextPlugin.selectedEngineId, "clawjs-context");
  });
});
