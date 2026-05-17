import { test } from "vitest";
import assert from "node:assert/strict";

import {
  createAgentAuditEvent,
  createAgentActivityFeed,
  createAgentConfigRevision,
  createAgentBlueprint,
  createAgentEvaluation,
  createAgentIncident,
  createAgentSafePackageExport,
  createAgentSafeSurfaceProjection,
  createAgentSupportInboxProjection,
  evaluateAgentBudget,
  evaluateAgentDelegationAccess,
  evaluateAgentEffectiveAccess,
  evaluateAgentAssignmentRoute,
  evaluateAgentMemoryAccess,
  createAgentPermissionEscalationRequest,
  redactAgentBoundaryValue,
  resolveAgentExternalIdentity,
  type AgentAccessRequest,
  type AgentAssignmentRoute,
  type AgentResourceGrant,
} from "./agents-v1.ts";

const request: AgentAccessRequest = {
  resourceType: "contact",
  resourceId: "contact_1",
  action: "read",
  scopeType: "customer",
  scopeId: "customer_1",
};

const allow = (id: string): AgentResourceGrant => ({
  id,
  resourceType: "contact",
  action: "read",
  scopeType: "customer",
  scopeId: "customer_1",
  effect: "allow",
});

test("Agents V1 effective access is an intersection of every control plane", () => {
  const result = evaluateAgentEffectiveAccess({
    requested: request,
    agentGrants: [allow("agent")],
    assignmentGrants: [allow("assignment")],
    executionProfileGrants: [allow("execution")],
    connectorGrants: [allow("connector")],
    hostGrants: [allow("host")],
    runScopeGrants: [allow("run")],
    now: "2026-05-17T10:00:00.000Z",
  });
  assert.equal(result.allowed, true);
  assert.deepEqual(result.matchedGrantIds, ["agent", "assignment", "execution", "connector", "host", "run"]);
});

test("Agents V1 defaults to an empty sandbox when any plane lacks an allow", () => {
  const result = evaluateAgentEffectiveAccess({
    requested: request,
    agentGrants: [allow("agent")],
    assignmentGrants: [allow("assignment")],
    executionProfileGrants: [],
    connectorGrants: [allow("connector")],
    hostGrants: [allow("host")],
    runScopeGrants: [allow("run")],
  });
  assert.equal(result.allowed, false);
  assert.deepEqual(result.reasons, ["execution_profile: no active allow grant"]);
});

test("Agents V1 grant expiry and denies fail closed", () => {
  const expired = { ...allow("expired"), expiresAt: "2026-05-17T09:00:00.000Z" };
  const denied = { ...allow("deny"), effect: "deny" as const };
  const result = evaluateAgentEffectiveAccess({
    requested: request,
    agentGrants: [expired],
    assignmentGrants: [allow("assignment")],
    executionProfileGrants: [allow("execution")],
    connectorGrants: [denied],
    hostGrants: [allow("host")],
    runScopeGrants: [allow("run")],
    now: "2026-05-17T10:00:00.000Z",
  });
  assert.equal(result.allowed, false);
  assert.deepEqual(result.reasons, ["agent: no active allow grant", "connector: denied by deny"]);
});

test("Agents V1 delegation cannot launder authority through a child agent", () => {
  const base = {
    requested: request,
    assignmentGrants: [allow("assignment")],
    executionProfileGrants: [allow("execution")],
    connectorGrants: [allow("connector")],
    hostGrants: [allow("host")],
    runScopeGrants: [allow("run")],
  };
  const result = evaluateAgentDelegationAccess({
    parent: { ...base, agentGrants: [] },
    child: { ...base, agentGrants: [allow("child-agent")] },
  });
  assert.equal(result.allowed, false);
  assert.deepEqual(result.reasons, ["parent agent: no active allow grant"]);
});

test("Agents V1 permission escalation requests include auditable scope", () => {
  const request = createAgentPermissionEscalationRequest({
    agentId: "agent.support",
    assignmentId: "assignment.telegram",
    resourceType: "contact",
    action: "read",
    scopeType: "customer",
    scopeId: "customer_1",
    duration: "PT1H",
    risk: "medium",
    reason: "Resolve active support ticket",
    approverId: "actor.owner",
  });
  assert.match(request.id, /^agent_escalation_/);
  assert.equal(request.action, "read");
  assert.equal(request.scopeId, "customer_1");
});

test("Agents V1 external routes fail closed without an active matching assignment", () => {
  const assignment: AgentAssignmentRoute = {
    id: "assignment.telegram",
    agentId: "agent.support",
    kind: "external_telegram",
    status: "paused",
    channel: "telegram",
    endpointRef: "telegram:support",
    externalDisclosure: "transparent_agent",
  };
  const result = evaluateAgentAssignmentRoute({
    assignment,
    kind: "external_telegram",
    channel: "telegram",
    endpointRef: "telegram:support",
  });
  assert.equal(result.allowed, false);
  assert.deepEqual(result.reasons, ["assignment: status paused"]);
  assert.equal(result.disclosureRequired, true);
});

test("Agents V1 external identity projects strong identifiers to contacts and hashes telemetry by default", () => {
  const identity = resolveAgentExternalIdentity({
    provider: "telegram",
    externalId: "tg_42",
    email: "customer@example.com",
    displayName: "Customer",
    customerId: "customer_1",
    ip: "203.0.113.9",
    userAgent: "Browser",
  });
  assert.equal(identity.contactProjection, "create_or_update");
  assert.equal(identity.boundary.scopeType, "customer");
  assert.equal(identity.boundary.scopeId, "customer_1");
  assert.equal(identity.customerId, "customer_1");
  assert.equal("ip" in identity.telemetry, false);
  assert.equal(typeof identity.telemetry.ipHash, "string");
});

test("Agents V1 anonymous identity stays external-user scoped and can suppress telemetry", () => {
  const identity = resolveAgentExternalIdentity({
    provider: "web",
    visitorId: "visitor_1",
    ip: "203.0.113.10",
  }, "off");
  assert.equal(identity.contactProjection, "none");
  assert.equal(identity.boundary.scopeType, "external_user");
  assert.equal(identity.boundary.scopeId, identity.externalUserId);
  assert.deepEqual(identity.telemetry, {});
});

test("Agents V1 support projection preserves customer boundary and session linkage", () => {
  const assignment: AgentAssignmentRoute = {
    id: "assignment.web",
    agentId: "agent.support",
    kind: "external_web_chat",
    status: "active",
    channel: "chat",
    privacyPolicy: "hashed",
    externalDisclosure: "transparent_agent",
  };
  const identity = resolveAgentExternalIdentity({
    provider: "web",
    externalId: "user_1",
    customerId: "customer_1",
  });
  const projection = createAgentSupportInboxProjection({
    sessionId: "session_1",
    assignment,
    identity,
    initialMessage: "I need help",
    now: "2026-05-17T10:00:00.000Z",
  });
  assert.equal(projection.conversation.externalUserId, identity.externalUserId);
  assert.equal(projection.conversation.customerId, "customer_1");
  assert.equal(projection.conversation.metadata.sessionId, "session_1");
  assert.equal(projection.conversation.metadata.boundaryScopeId, "customer_1");
  assert.equal(projection.message.direction, "inbound");
  assert.equal(projection.message.channel, "chat");
});

test("Agents V1 memory policy supports read-only global memory plus private writes", () => {
  const globalRead = evaluateAgentMemoryAccess({
    readScopes: [{ layer: "global", access: "read" }],
    writeScopes: [{ layer: "agent_private", access: "write" }],
    writePolicy: "private_only",
  }, {
    operation: "read",
    layer: "global",
  });
  assert.equal(globalRead.allowed, true);

  const globalWrite = evaluateAgentMemoryAccess({
    readScopes: [{ layer: "global", access: "read" }],
    writeScopes: [{ layer: "agent_private", access: "write" }],
    writePolicy: "private_only",
  }, {
    operation: "write",
    layer: "global",
  });
  assert.equal(globalWrite.allowed, false);
  assert.deepEqual(globalWrite.reasons, ["memory: no write scope", "memory: write policy private_only blocks global"]);

  const privateWrite = evaluateAgentMemoryAccess({
    readScopes: [{ layer: "global", access: "read" }],
    writeScopes: [{ layer: "agent_private", access: "write" }],
    writePolicy: "private_only",
  }, {
    operation: "write",
    layer: "agent_private",
  });
  assert.equal(privateWrite.allowed, true);
});

test("Agents V1 memory policy blocks cross-customer reads without explicit grant", () => {
  const policy = {
    readScopes: [{ layer: "customer" as const, scopeId: "customer_2", access: "read" as const }],
    writeScopes: [],
    writePolicy: "none" as const,
    crossUserBoundary: "explicit_grant_only" as const,
  };
  const denied = evaluateAgentMemoryAccess(policy, {
    operation: "read",
    layer: "customer",
    scopeId: "customer_2",
    boundary: { scopeType: "customer", scopeId: "customer_1" },
  });
  assert.equal(denied.allowed, false);
  assert.deepEqual(denied.reasons, ["memory: cross-boundary access requires explicit grant"]);

  const allowed = evaluateAgentMemoryAccess(policy, {
    operation: "read",
    layer: "customer",
    scopeId: "customer_2",
    boundary: { scopeType: "customer", scopeId: "customer_1" },
    explicitGrant: true,
  });
  assert.equal(allowed.allowed, true);
});

test("Agents V1 budget evaluation pauses only affected scope when a scoped limit is exceeded", () => {
  const result = evaluateAgentBudget({
    exceededBehavior: "pause_affected_scope",
    limits: [{ dimension: "money", limit: 100, used: 95, scopeType: "assignment", scopeId: "assignment.web" }],
  }, {
    dimension: "money",
    cost: 10,
    scopeType: "assignment",
    scopeId: "assignment.web",
  });
  assert.equal(result.allowed, false);
  assert.equal(result.exceededBehavior, "pause_affected_scope");
  assert.deepEqual(result.reasons, ["budget: money limit exceeded"]);
});

test("Agents V1 external paid actions require both budget and connector gate", () => {
  const blocked = evaluateAgentBudget({
    exceededBehavior: "deny_action",
    limits: [{ dimension: "external_actions", limit: 5, used: 1 }],
  }, {
    dimension: "external_actions",
    cost: 1,
    externalPaidAction: true,
    connectorGateAllowed: false,
  });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reasons.includes("budget: external paid action requires connector gate"), true);

  const allowed = evaluateAgentBudget({
    exceededBehavior: "deny_action",
    limits: [{ dimension: "external_actions", limit: 5, used: 1 }],
  }, {
    dimension: "external_actions",
    cost: 1,
    externalPaidAction: true,
    connectorGateAllowed: true,
  });
  assert.equal(allowed.allowed, true);
});

test("Agents V1 redaction removes raw secrets and private local paths at boundaries", () => {
  const redacted = redactAgentBoundaryValue({
    name: "Support",
    secretAllowlist: ["vault://agents/support"],
    configPath: "/Users/example/private/config.json",
    nested: { apiToken: "raw-token" },
  }) as Record<string, unknown>;
  assert.equal(redacted.name, "Support");
  assert.equal(redacted.secretAllowlist, "[REDACTED]");
  assert.equal(redacted.configPath, "[REDACTED_LOCAL_PATH]");
  assert.deepEqual(redacted.nested, { apiToken: "[REDACTED]" });
});

test("Agents V1 safe package export omits secrets and records audit metadata", () => {
  const exported = createAgentSafePackageExport({
    exportedAt: "2026-05-17T10:00:00.000Z",
    agent: {
      id: "agent.support",
      name: "Support",
      secretAllowlist: ["vault://agents/support"],
      localPath: "/Users/example/agent",
    },
    assignments: [{ id: "assignment.web", endpointRef: "web:support" }],
    resourceGrants: [{ id: "grant", resourceType: "collection", action: "read" }],
  });
  assert.equal(exported.schemaVersion, 1);
  assert.equal(exported.packageKind, "claw_agent_package");
  assert.equal(exported.agent.secretAllowlist, "[REDACTED]");
  assert.equal(exported.agent.localPath, "[REDACTED_LOCAL_PATH]");
  assert.equal(exported.audit.kind, "safe_export");
  assert.equal(exported.audit.agentId, "agent.support");
});

test("Agents V1 config revisions redact snapshots and record audit", () => {
  const revision = createAgentConfigRevision({
    agentId: "agent.support",
    revision: 7,
    actorId: "actor.owner",
    reason: "Restrict support assignment",
    summary: "Reduced channel scope",
    previousRevisionId: "agent_config_revision_previous",
    createdAt: "2026-05-17T10:00:00.000Z",
    configSnapshot: {
      name: "Support",
      systemPrompt: "private instruction",
      secretAllowlist: ["vault://agents/support"],
      localPath: "/Users/example/agent",
    },
    changedFields: [{ field: "assignments.telegram", fromValue: "active", toValue: "paused", apiToken: "raw" }],
  });
  assert.match(revision.id, /^agent_config_revision_/);
  assert.equal(revision.revision, "7");
  assert.equal(revision.status, "active");
  assert.equal(revision.configSnapshot.name, "Support");
  assert.equal(revision.configSnapshot.secretAllowlist, "[REDACTED]");
  assert.equal(revision.configSnapshot.localPath, "[REDACTED_LOCAL_PATH]");
  assert.deepEqual(revision.changedFields[0], { field: "assignments.telegram", fromValue: "active", toValue: "paused", apiToken: "[REDACTED]" });
  assert.equal(revision.audit.kind, "config_revision");
  assert.equal(revision.audit.resourceType, "agent_config_revision");
  assert.equal(revision.audit.metadata.previousRevisionId, "agent_config_revision_previous");
});

test("Agents V1 incidents are first-class redacted audit records", () => {
  const incident = createAgentIncident({
    agentId: "agent.support",
    assignmentId: "assignment.web",
    runId: "run_1",
    sessionId: "session_1",
    actorId: "actor.monitor",
    severity: "critical",
    summary: "Cross-customer memory read blocked",
    description: "Policy denied access before response.",
    scopeType: "customer",
    scopeId: "customer_1",
    detectedAt: "2026-05-17T10:00:00.000Z",
    metadata: {
      attemptedCustomerId: "customer_2",
      rawTracePath: "/Users/example/traces/run.log",
      authorization: "Bearer raw",
    },
  });
  assert.match(incident.id, /^agent_incident_/);
  assert.equal(incident.status, "open");
  assert.equal(incident.severity, "critical");
  assert.deepEqual(incident.metadata, {
    attemptedCustomerId: "customer_2",
    rawTracePath: "[REDACTED]",
    authorization: "[REDACTED]",
  });
  assert.equal(incident.audit.kind, "incident");
  assert.equal(incident.audit.result, "blocked");
  assert.equal(incident.audit.resourceType, "agent_incident");
  assert.equal((incident.audit.metadata.metadata as Record<string, unknown>).authorization, "[REDACTED]");
});

test("Agents V1 activity feed projects human-readable redacted timeline", () => {
  const feed = createAgentActivityFeed({
    agentId: "agent.support",
    limit: 3,
    runs: [{
      id: "run_1",
      assignmentId: "assignment.web",
      status: "completed",
      startedAt: "2026-05-17T09:00:00.000Z",
      outcomeJson: { result: "resolved", rawTracePath: "/Users/example/run.log" },
      metadata: { promptToken: "raw" },
    }],
    incidents: [{
      id: "incident_1",
      assignmentId: "assignment.web",
      severity: "critical",
      status: "open",
      summary: "Unsafe route blocked",
      detectedAt: "2026-05-17T10:00:00.000Z",
      metadata: { authorization: "Bearer raw" },
    }],
    configRevisions: [{
      id: "revision_1",
      revision: 3,
      reason: "Reduced support scope",
      createdAt: "2026-05-17T08:00:00.000Z",
      configSnapshot: { secretAllowlist: ["vault://agents/support"] },
    }],
    sessions: [{
      id: "session_1",
      status: "active",
      summary: "Customer asked for help",
      createdAt: "2026-05-17T09:30:00.000Z",
    }],
  });
  assert.equal(feed.feedKind, "claw_agent_activity_feed");
  assert.equal(feed.items.length, 3);
  assert.deepEqual(feed.items.map((item) => item.kind), ["incident", "session", "run"]);
  assert.equal(feed.items[0]?.title, "Unsafe route blocked");
  assert.equal(feed.items[0]?.severity, "critical");
  assert.equal((feed.items[0]?.metadata as Record<string, unknown>).authorization, "[REDACTED]");
  assert.equal((feed.items[2]?.metadata.outcome as Record<string, unknown>).rawTracePath, "[REDACTED]");
});

test("Agents V1 blueprints produce redacted portable templates", () => {
  const blueprint = createAgentBlueprint({
    name: "Support blueprint",
    agencyMode: "support",
    version: 3,
    modelTier: "balanced",
    skillRefs: ["skill.support@1"],
    createdAt: "2026-05-17T10:00:00.000Z",
    template: {
      role: "Support",
      systemPrompt: "private",
      secretAllowlist: ["vault://agents/support"],
      localPath: "/Users/example/blueprint",
    },
    requiredResourceGrants: [{
      id: "grant.support.read",
      resourceType: "collection",
      resourceId: "support_conversations",
      action: "read",
      scopeType: "customer",
      scopeId: "*",
    }],
  });
  assert.match(blueprint.id, /^agent_blueprint_/);
  assert.equal(blueprint.version, "3");
  assert.equal(blueprint.template.secretAllowlist, "[REDACTED]");
  assert.equal(blueprint.template.localPath, "[REDACTED_LOCAL_PATH]");
  assert.equal(blueprint.requiredResourceGrants[0]?.resourceType, "collection");
  assert.equal(blueprint.safeExport.packageKind, "claw_agent_package");
  assert.equal(blueprint.audit.kind, "blueprint");
  assert.equal(blueprint.audit.resourceType, "agent_blueprint");
});

test("Agents V1 evaluations are redacted audit records", () => {
  const evaluation = createAgentEvaluation({
    agentId: "agent.support",
    assignmentId: "assignment.web",
    runId: "run_1",
    evaluatorId: "actor.evaluator",
    status: "failed",
    score: 0.42,
    evaluatedAt: "2026-05-17T10:00:00.000Z",
    criteria: {
      metric: "support_safety",
      rawTracePath: "/Users/example/eval.log",
    },
    result: {
      reason: "Unsafe disclosure",
      authorization: "Bearer raw",
    },
  });
  assert.match(evaluation.id, /^agent_evaluation_/);
  assert.equal(evaluation.status, "failed");
  assert.equal(evaluation.audit.kind, "evaluation");
  assert.equal(evaluation.audit.result, "blocked");
  assert.equal(evaluation.audit.resourceType, "agent_evaluation");
  assert.equal(evaluation.criteria.rawTracePath, "[REDACTED]");
  assert.equal(evaluation.result.authorization, "[REDACTED]");
});

test("Agents V1 safe surface projection exposes only bounded Relay/MCP/API fields", () => {
  const projection = createAgentSafeSurfaceProjection({
    surface: "relay",
    projectedAt: "2026-05-17T10:00:00.000Z",
    agent: {
      id: "agent.support",
      name: "Support",
      role: "Support lead",
      systemPrompt: "private",
      secretAllowlist: ["vault://agents/support"],
      localPath: "/Users/example/agent",
    },
    assignments: [{
      id: "assignment.relay",
      agentId: "agent.support",
      kind: "relay",
      status: "active",
      channel: "relay",
      endpointRef: "relay://private-endpoint",
      privacyPolicy: "hashed",
      externalDisclosure: "transparent_agent",
    }],
    executionProfiles: [{
      id: "profile.relay",
      runtimeKind: "api",
      sandboxProfile: "network-limited",
      env: { OPENAI_API_KEY: "raw" },
    }],
    resourceGrants: [{
      id: "grant.secret",
      resourceType: "secret",
      resourceId: "vault://agents/support",
      action: "lease_secret",
      secretToken: "raw-token",
    }],
    memoryPolicies: [{
      id: "memory.relay",
      readScopes: [{ layer: "customer", access: "read" }],
      writePolicy: "private_only",
      rawTracePath: "/Users/example/memory.log",
    }],
    budgets: [{
      id: "budget.relay",
      exceededBehavior: "deny_action",
      limits: [{ dimension: "external_actions", limit: 5, used: 1 }],
      billingToken: "raw",
    }],
  });
  assert.equal(projection.projectionKind, "claw_agent_safe_surface");
  assert.equal(projection.surface, "relay");
  assert.deepEqual(projection.agent, { id: "agent.support", name: "Support", role: "Support lead" });
  assert.equal("endpointRef" in projection.assignments[0], false);
  assert.equal("systemPrompt" in projection.agent, false);
  assert.equal("env" in projection.executionProfiles[0], false);
  assert.equal("secretToken" in projection.resourceAccess.grants[0], false);
  assert.equal("rawTracePath" in projection.memory.policies[0], false);
  assert.equal("billingToken" in projection.budgets[0], false);
  assert.equal(projection.resourceAccess.brokeredLeaseAllowed, true);
  assert.deepEqual(projection.risks, ["secret_lease_requires_brokered_runtime_only"]);
  assert.deepEqual(projection.gaps, []);
  assert.equal(projection.audit.reason, "safe surface projection");
});

test("Agents V1 safe surface projection reports external route gaps fail-closed", () => {
  const projection = createAgentSafeSurfaceProjection({
    surface: "mcp_api",
    projectedAt: "2026-05-17T10:00:00.000Z",
    agent: { id: "agent.support", name: "Support" },
    assignments: [{
      id: "assignment.mcp",
      agentId: "agent.support",
      kind: "mcp_api",
      status: "paused",
      channel: "mcp",
      privacyPolicy: "raw_with_retention",
      externalDisclosure: "custom_agent_wording",
    }],
    memoryPolicies: [{
      id: "memory.mcp",
      crossUserBoundary: "tenant_context",
      writePolicy: "shared_with_review",
    }],
  });
  assert.deepEqual(projection.gaps, ["active_assignment_missing", "budget_policy_missing"]);
  assert.deepEqual(projection.risks, [
    "raw_telemetry_retention_requires_policy_review",
    "external_disclosure_uses_custom_wording",
    "memory_cross_user_boundary_not_explicit_grant_only",
  ]);
});

test("Agents V1 audit events redact metadata before recording", () => {
  const audit = createAgentAuditEvent({
    kind: "budget_evaluation",
    agentId: "agent.support",
    assignmentId: "assignment.web",
    result: "denied",
    reason: "budget exceeded",
    createdAt: "2026-05-17T10:00:00.000Z",
    metadata: { token: "raw", path: "/Users/example/file" },
  });
  assert.match(audit.id, /^agent_audit_/);
  assert.deepEqual(audit.metadata, { token: "[REDACTED]", path: "[REDACTED_LOCAL_PATH]" });
});
