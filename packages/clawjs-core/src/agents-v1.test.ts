import { test } from "vitest";
import assert from "node:assert/strict";

import {
  createAgentAuditEvent,
  createAgentActivityFeed,
  createAgentAuditCoverageReport,
  createAgentConfigRevision,
  createAgentContextPack,
  createAgentControlPanel,
  createAgentCreationReview,
  createAgentDispatchPlan,
  createAgentToolCatalogProjection,
  createAgentBlueprint,
  createAgentEvaluation,
  createAgentIncident,
  createAgentOperationalSnapshot,
  createAgentPaperclipImportPlan,
  createAgentPrivacyLifecyclePlan,
  createAgentSafePackageExport,
  createAgentSafeSurfaceProjection,
  createAgentServiceApiResponse,
  createAgentServiceApiHttpResponse,
  createAgentSupportInboxProjection,
  createAgentRetirementPlan,
  evaluateAgentBudget,
  createAgentStorageAudit,
  evaluateAgentDelegationAccess,
  evaluateAgentEffectiveAccess,
  evaluateAgentAssignmentRoute,
  evaluateAgentActionSeverity,
  evaluateAgentAutonomyPolicy,
  evaluateAgentMemoryAccess,
  createAgentPermissionEscalationRequest,
  evaluateAgentSupervisorAuthority,
  redactAgentBoundaryValue,
  resolveAgentExternalIdentity,
  type AgentAccessRequest,
  type AgentAssignmentRoute,
  type AgentResourceGrant,
} from "./agents-v1.ts";
import { AGENTS, AGENT_INCIDENTS } from "./builtins/agents/agent_v1_collections.ts";
import { AGENT_SESSIONS } from "./builtins/agents/agent_sessions.ts";

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

test("Agents V1 regulated safety blocks final decisions even when grants allow access", () => {
  const result = evaluateAgentEffectiveAccess({
    requested: {
      ...request,
      regulatedSafety: {
        regulatedDomains: ["finance"],
        sensitiveRecordClasses: ["financial_record"],
        decisionEffect: "final_decision",
        outputLabelsRequired: true,
      },
    },
    agentGrants: [allow("agent")],
    assignmentGrants: [allow("assignment")],
    executionProfileGrants: [allow("execution")],
    connectorGrants: [allow("connector")],
    hostGrants: [allow("host")],
    runScopeGrants: [allow("run")],
    now: "2026-05-17T10:00:00.000Z",
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reasons.includes("regulated_safety:finance:final_decision_blocked"), true);
  assert.deepEqual(result.matchedGrantIds, ["agent", "assignment", "execution", "connector", "host", "run"]);
});

test("Agents V1 regulated safety allows labeled summaries through existing control planes", () => {
  const result = evaluateAgentEffectiveAccess({
    requested: {
      ...request,
      regulatedSafety: {
        regulatedDomains: ["health"],
        sensitiveRecordClasses: ["health_record"],
        decisionEffect: "summary",
        professionalReviewRequired: true,
        outputLabelsRequired: true,
      },
    },
    agentGrants: [allow("agent")],
    assignmentGrants: [allow("assignment")],
    executionProfileGrants: [allow("execution")],
    connectorGrants: [allow("connector")],
    hostGrants: [allow("host")],
    runScopeGrants: [allow("run")],
    now: "2026-05-17T10:00:00.000Z",
  });

  assert.equal(result.allowed, true);
  assert.deepEqual(result.reasons, []);
});

test("Agents V1 regulated safety requires review for connector, remote, and export paths", () => {
  const result = evaluateAgentEffectiveAccess({
    requested: {
      ...request,
      regulatedSafety: {
        regulatedDomains: ["legal"],
        sensitiveRecordClasses: ["legal_record"],
        decisionEffect: "external_action",
        externalAction: true,
        sensitiveExport: true,
        remoteOrProviderUse: true,
        outputLabelsRequired: true,
      },
    },
    agentGrants: [allow("agent")],
    assignmentGrants: [allow("assignment")],
    executionProfileGrants: [allow("execution")],
    connectorGrants: [allow("connector")],
    hostGrants: [allow("host")],
    runScopeGrants: [allow("run")],
    now: "2026-05-17T10:00:00.000Z",
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reasons.includes("regulated_safety:legal:external_review_required"), true);
  assert.equal(result.reasons.includes("regulated_safety:legal:sensitive_export_review_required"), true);
  assert.equal(result.reasons.includes("regulated_safety:legal:remote_or_provider_opt_in_required"), true);
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

test("Agents V1 grants with invalid expiry fail closed", () => {
  const invalidExpiry = { ...allow("invalid-expiry"), expiresAt: "not-a-date" };
  const result = evaluateAgentEffectiveAccess({
    requested: request,
    agentGrants: [invalidExpiry],
    assignmentGrants: [allow("assignment")],
    executionProfileGrants: [allow("execution")],
    connectorGrants: [allow("connector")],
    hostGrants: [allow("host")],
    runScopeGrants: [allow("run")],
    now: "2026-05-17T10:00:00.000Z",
  });
  assert.equal(result.allowed, false);
  assert.deepEqual(result.reasons, ["agent: no active allow grant"]);
  assert.deepEqual(result.matchedGrantIds, ["assignment", "execution", "connector", "host", "run"]);
});

test("Agents V1 secrets require brokered lease action instead of direct reads", () => {
  const secretRequest: AgentAccessRequest = {
    resourceType: "secret",
    resourceId: "vault://agents/support/api-key",
    action: "read",
    scopeType: "assignment",
    scopeId: "assignment.web",
  };
  const secretGrant = (plane: string): AgentResourceGrant => ({
    id: `${plane}.secret`,
    resourceType: "secret",
    resourceId: "vault://agents/support/api-key",
    action: "read",
    scopeType: "assignment",
    scopeId: "assignment.web",
    effect: "allow",
  });
  const result = evaluateAgentEffectiveAccess({
    requested: secretRequest,
    agentGrants: [secretGrant("agent")],
    assignmentGrants: [secretGrant("assignment")],
    executionProfileGrants: [secretGrant("execution")],
    connectorGrants: [secretGrant("connector")],
    hostGrants: [secretGrant("host")],
    runScopeGrants: [secretGrant("run")],
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reasons[0], "secret: direct access denied; use lease_secret broker flow");

  const leaseRequest: AgentAccessRequest = { ...secretRequest, action: "lease_secret" };
  const leaseGrant = (plane: string): AgentResourceGrant => ({
    ...secretGrant(plane),
    id: `${plane}.lease`,
    action: "lease_secret",
  });
  const lease = evaluateAgentEffectiveAccess({
    requested: leaseRequest,
    agentGrants: [leaseGrant("agent")],
    assignmentGrants: [leaseGrant("assignment")],
    executionProfileGrants: [leaseGrant("execution")],
    connectorGrants: [leaseGrant("connector")],
    hostGrants: [leaseGrant("host")],
    runScopeGrants: [leaseGrant("run")],
  });
  assert.equal(lease.allowed, true);
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

test("Agents V1 supervisor authority is limited by org relation, action, risk, and scope", () => {
  const allowed = evaluateAgentSupervisorAuthority({
    supervisor: {
      id: "agent.manager",
      authorityLevel: "approve_medium_risk",
      scopeType: "team",
      scopeId: "support",
    },
    targetAgent: {
      id: "agent.support",
      managerAgentId: "agent.manager",
      teamId: "support",
    },
    request: {
      action: "edit_config",
      risk: "medium",
      scopeType: "team",
      scopeId: "support",
    },
  });
  assert.equal(allowed.allowed, true);
  assert.deepEqual(allowed.reasons, []);
  assert.equal(allowed.maxRisk, "medium");

  const blocked = evaluateAgentSupervisorAuthority({
    supervisor: {
      id: "agent.manager",
      authorityLevel: "approve_low_risk",
      scopeType: "team",
      scopeId: "support",
    },
    targetAgent: {
      id: "agent.support",
      managerAgentId: "agent.other",
      teamId: "sales",
    },
    request: {
      action: "retire_agent",
      risk: "critical",
      scopeType: "team",
      scopeId: "sales",
    },
  });
  assert.equal(blocked.allowed, false);
  assert.deepEqual(blocked.reasons, [
    "supervisor: target agent does not report to supervisor",
    "supervisor: action retire_agent is not delegated",
    "supervisor: risk critical exceeds low",
    "supervisor: critical risk requires owner or host approval",
    "supervisor: scope sales is outside support",
  ]);
});

test("Agents V1 retirement archives the agent and revokes assignments and grants with a recoverable snapshot", () => {
  const plan = createAgentRetirementPlan({
    agent: {
      id: "agent.support",
      name: "Support",
      secretAllowlist: ["vault://agents/support"],
      localPath: "/Users/example/agent",
    },
    assignments: [{
      id: "assignment.web",
      agentId: "agent.support",
      status: "active",
      endpointRef: "web://support",
    }],
    resourceGrants: [{
      id: "grant.support",
      agentId: "agent.support",
      resourceType: "collection",
      resourceId: "support_conversations",
      action: "read",
    }],
    actorId: "actor.owner",
    reason: "Role replaced by new support agent",
    retiredAt: "2026-05-17T10:00:00.000Z",
  });
  assert.equal(plan.planKind, "claw_agent_retirement_plan");
  assert.equal(plan.recoverable, true);
  assert.match(plan.snapshotRef, /^agent_retirement_snapshot_/);
  assert.deepEqual(plan.agentPatch, {
    id: "agent.support",
    status: "archived",
    retiredAt: "2026-05-17T10:00:00.000Z",
    archivedAt: "2026-05-17T10:00:00.000Z",
    retirementSnapshotRef: plan.snapshotRef,
  });
  assert.equal(plan.assignmentPatches[0]?.status, "revoked");
  assert.equal(plan.resourceGrantPatches[0]?.effect, "deny");
  assert.equal(plan.resourceGrantPatches[0]?.expiresAt, "2026-05-17T10:00:00.000Z");
  assert.equal(plan.audit.kind, "retirement");
  assert.equal(plan.audit.resourceType, "agent");
  assert.equal(JSON.stringify(plan).includes("vault://"), false);
  assert.equal(JSON.stringify(plan).includes("/Users/example"), false);
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

test("Agents V1 raw visitor telemetry requires explicit retention on assignments", () => {
  const assignment: AgentAssignmentRoute = {
    id: "assignment.web",
    agentId: "agent.support",
    kind: "external_web_chat",
    status: "active",
    channel: "chat",
    endpointRef: "web:support",
    privacyPolicy: "raw_with_retention",
    externalDisclosure: "transparent_agent",
  };
  const result = evaluateAgentAssignmentRoute({
    assignment,
    kind: "external_web_chat",
    channel: "chat",
    endpointRef: "web:support",
  });
  assert.equal(result.allowed, false);
  assert.deepEqual(result.reasons, ["assignment: raw telemetry retention requires telemetryRetentionDays"]);

  const allowed = evaluateAgentAssignmentRoute({
    assignment: { ...assignment, telemetryRetentionDays: 30 },
    kind: "external_web_chat",
    channel: "chat",
    endpointRef: "web:support",
  });
  assert.equal(allowed.allowed, true);
  assert.deepEqual(allowed.reasons, []);
});

test("Agents V1 assignment routing fails closed on invalid route timestamps", () => {
  const assignment: AgentAssignmentRoute = {
    id: "assignment.web",
    agentId: "agent.support",
    kind: "external_web_chat",
    status: "active",
    channel: "chat",
    endpointRef: "web:support",
    externalDisclosure: "transparent_agent",
    startsAt: "not-a-date",
    expiresAt: "also-not-a-date",
  };
  const result = evaluateAgentAssignmentRoute({
    assignment,
    kind: "external_web_chat",
    channel: "chat",
    endpointRef: "web:support",
    now: "still-not-a-date",
  });
  assert.equal(result.allowed, false);
  assert.deepEqual(result.reasons, [
    "route: invalid now",
    "assignment: invalid startsAt",
    "assignment: invalid expiresAt",
  ]);
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

test("Agents V1 action severity taxonomy classifies risky actions before dispatch", () => {
  const read = evaluateAgentActionSeverity({
    action: "read",
    resourceType: "collection",
  });
  assert.equal(read.severity, "low");
  assert.equal(read.approvalRequired, false);
  assert.equal(read.connectorGateRequired, false);

  const externalPaid = evaluateAgentActionSeverity({
    action: "invoke",
    resourceType: "connector",
    externalSideEffect: true,
    paidAction: true,
    rawPii: true,
  });
  assert.equal(externalPaid.severity, "high");
  assert.equal(externalPaid.approvalRequired, true);
  assert.equal(externalPaid.connectorGateRequired, true);
  assert.equal(externalPaid.budgetRequired, true);
  assert.equal(externalPaid.reasons.includes("raw PII requires privacy review"), true);

  const nativeDelete = evaluateAgentActionSeverity({
    action: "delete",
    resourceType: "file",
    nativeHostAccess: true,
    irreversible: true,
  });
  assert.equal(nativeDelete.severity, "critical");
  assert.equal(nativeDelete.hostGateRequired, true);
  assert.equal(nativeDelete.approvalRequired, true);
});

test("Agents V1 autonomy policy gates dispatch by profile, severity, and required gates", () => {
  const respondOnly = evaluateAgentAutonomyPolicy({
    profile: "respond_only",
    action: { action: "write", resourceType: "collection" },
  });
  assert.equal(respondOnly.allowed, false);
  assert.equal(respondOnly.dispatchMode, "respond_only");
  assert.deepEqual(respondOnly.reasons, [
    "autonomy: respond_only cannot dispatch write",
    "autonomy: medium exceeds respond_only limit low",
  ]);

  const suggest = evaluateAgentAutonomyPolicy({
    profile: "suggest",
    action: { action: "update", resourceType: "collection" },
  });
  assert.equal(suggest.allowed, false);
  assert.equal(suggest.dispatchMode, "suggest_only");
  assert.equal(suggest.requiredGates.includes("human_approval"), true);

  const limitedExternal = evaluateAgentAutonomyPolicy({
    profile: "act_limited",
    action: { action: "invoke", resourceType: "connector", externalSideEffect: true, paidAction: true },
    connectorGateAllowed: true,
    budgetAllowed: true,
  });
  assert.equal(limitedExternal.allowed, false);
  assert.deepEqual(limitedExternal.reasons, [
    "autonomy: high exceeds act_limited limit medium",
    "autonomy: approval required",
  ]);

  const fullWithGates = evaluateAgentAutonomyPolicy({
    profile: "act_full",
    action: { action: "invoke", resourceType: "connector", externalSideEffect: true, paidAction: true },
    approvalGranted: true,
    connectorGateAllowed: true,
    budgetAllowed: true,
  });
  assert.equal(fullWithGates.allowed, true);
  assert.deepEqual(fullWithGates.reasons, []);
  assert.equal(fullWithGates.dispatchMode, "act");
});

test("Agents V1 dispatch plans fail closed and map execution modes to run status", () => {
  const assignment: AgentAssignmentRoute = {
    id: "assignment.web",
    agentId: "agent.support",
    kind: "external_web_chat",
    status: "active",
    channel: "chat",
    privacyPolicy: "hashed",
    externalDisclosure: "transparent_agent",
  };

  const externalWrite = createAgentDispatchPlan({
    agentId: "agent.support",
    assignment,
    assignmentRequest: { kind: "external_web_chat", channel: "chat" },
    executionProfile: { id: "execution.async", executionMode: "async", status: "active", runtime: "service" },
    autonomy: { profile: "act_limited" },
    action: { action: "write", resourceType: "collection" },
    now: "2026-05-17T10:00:00.000Z",
  });
  assert.equal(externalWrite.allowed, false);
  assert.equal(externalWrite.disposition, "blocked");
  assert.equal(externalWrite.runStatus, "blocked");
  assert.equal(externalWrite.requiredGates.includes("external_act"), true);
  assert.equal(externalWrite.reasons.includes("dispatch: external assignment defaults to respond_only"), true);

  const asyncWrite = createAgentDispatchPlan({
    agentId: "agent.support",
    assignment: { ...assignment, respondOnlyDefault: false },
    assignmentRequest: { kind: "external_web_chat", channel: "chat" },
    executionProfile: { id: "execution.async", executionMode: "async", status: "active", runtime: "service" },
    autonomy: { profile: "act_limited" },
    action: { action: "write", resourceType: "collection" },
    externalActAllowed: true,
    now: "2026-05-17T10:00:00.000Z",
  });
  assert.equal(asyncWrite.allowed, true);
  assert.equal(asyncWrite.disposition, "queue_async");
  assert.equal(asyncWrite.runStatus, "queued");
  assert.equal(asyncWrite.audit.kind, "dispatch_plan");
  assert.equal(asyncWrite.audit.result, "allowed");

  const scheduled = createAgentDispatchPlan({
    agentId: "agent.support",
    assignment: { ...assignment, respondOnlyDefault: false },
    assignmentRequest: { kind: "external_web_chat", channel: "chat" },
    executionProfile: { id: "execution.scheduled", executionMode: "scheduled", status: "active", runtime: "service" },
    autonomy: { profile: "act_limited" },
    action: { action: "write", resourceType: "collection" },
    externalActAllowed: true,
    now: "2026-05-17T10:00:00.000Z",
  });
  assert.equal(scheduled.allowed, false);
  assert.equal(scheduled.reasons.includes("execution: scheduled mode requires scheduledAt"), true);
  assert.equal(scheduled.requiredGates.includes("schedule"), true);

  const readResponse = createAgentDispatchPlan({
    agentId: "agent.support",
    assignment,
    assignmentRequest: { kind: "external_web_chat", channel: "chat" },
    executionProfile: { id: "execution.sync", executionMode: "sync", status: "active", runtime: "service" },
    autonomy: { profile: "respond_only" },
    action: { action: "read", resourceType: "collection" },
    now: "2026-05-17T10:00:00.000Z",
  });
  assert.equal(readResponse.allowed, true);
  assert.equal(readResponse.disposition, "respond");
  assert.equal(readResponse.runStatus, "ready");
});

test("Agents V1 context packs project only view-allowed and grant-authorized records", () => {
  const contextGrant = (id: string): AgentResourceGrant => ({
    id,
    resourceType: "*",
    action: "read",
    scopeType: "customer",
    scopeId: "customer_1",
    effect: "allow",
  });
  const pack = createAgentContextPack({
    agentId: "agent.support",
    assignmentId: "assignment.web",
    view: {
      id: "view.support.customer",
      name: "Support Customer Context",
      allowedResourceTypes: ["contact", "note"],
      allowedScopes: [{ scopeType: "customer", scopeId: "customer_1" }],
      includeContent: true,
      maxItems: 1,
    },
    requested: [
      {
        id: "ctx.contact",
        resourceType: "contact",
        resourceId: "contact_1",
        scopeType: "customer",
        scopeId: "customer_1",
        title: "Primary contact",
        content: { email: "customer@example.com", apiToken: "raw" },
        metadata: { localPath: "/Users/example/context.json" },
        required: true,
      },
      {
        id: "ctx.note.extra",
        resourceType: "note",
        resourceId: "note_1",
        scopeType: "customer",
        scopeId: "customer_1",
        title: "Extra note",
      },
      {
        id: "ctx.note.other",
        resourceType: "note",
        resourceId: "note_2",
        scopeType: "customer",
        scopeId: "customer_2",
        required: true,
      },
      {
        id: "ctx.file",
        resourceType: "file",
        resourceId: "file_1",
        scopeType: "customer",
        scopeId: "customer_1",
      },
    ],
    agentGrants: [contextGrant("agent")],
    assignmentGrants: [contextGrant("assignment")],
    executionProfileGrants: [contextGrant("execution")],
    connectorGrants: [contextGrant("connector")],
    hostGrants: [contextGrant("host")],
    runScopeGrants: [contextGrant("run")],
    now: "2026-05-17T10:00:00.000Z",
  });

  assert.equal(pack.packKind, "claw_agent_context_pack");
  assert.equal(pack.items.length, 1);
  assert.equal(pack.items[0]?.id, "ctx.contact");
  assert.deepEqual(pack.items[0]?.matchedGrantIds, ["agent", "assignment", "execution", "connector", "host", "run"]);
  assert.deepEqual(pack.items[0]?.content, { email: "customer@example.com", apiToken: "[REDACTED]" });
  assert.deepEqual(pack.items[0]?.metadata, { localPath: "[REDACTED_LOCAL_PATH]" });
  assert.equal(pack.denied.length, 2);
  assert.deepEqual(pack.denied.map((entry) => entry.id), ["ctx.note.other", "ctx.file"]);
  assert.deepEqual(pack.gaps, ["context_item_limit_applied", "required_context_denied"]);
  assert.equal(pack.audit.kind, "context_pack");
  assert.equal(pack.audit.result, "blocked");
});

test("Agents V1 tool catalogs expose only grant-authorized tools for an assignment", () => {
  const toolGrant = (id: string): AgentResourceGrant => ({
    id,
    resourceType: "tool",
    action: "invoke",
    scopeType: "domain",
    scopeId: "support",
    effect: "allow",
  });
  const catalog = createAgentToolCatalogProjection({
    agentId: "agent.support",
    assignmentId: "assignment.web",
    allowedDomains: ["support"],
    tools: [{
      id: "support.contacts.lookup",
      title: "Lookup contact",
      description: "Read contact context for the active support case.",
      domain: "support",
      sourceFeature: "support",
      parameters: { type: "object", properties: { contactId: { type: "string" } }, required: ["contactId"] },
      riskLevel: "safe",
    }, {
      id: "support.ticket.refund",
      title: "Refund ticket",
      description: "Issue a customer refund.",
      domain: "support",
      sourceFeature: "billing",
      parameters: { type: "object", properties: { ticketId: { type: "string" } } },
      riskLevel: "sensitive",
      requiresApproval: true,
    }, {
      id: "ops.host.erase",
      title: "Erase host",
      description: "Erase host data.",
      domain: "ops",
      sourceFeature: "host",
      parameters: { type: "object" },
      riskLevel: "catastrophic",
    }],
    agentGrants: [toolGrant("agent")],
    assignmentGrants: [toolGrant("assignment")],
    executionProfileGrants: [toolGrant("execution")],
    connectorGrants: [toolGrant("connector")],
    hostGrants: [toolGrant("host")],
    runScopeGrants: [toolGrant("run")],
    now: "2026-05-17T10:00:00.000Z",
  });

  assert.equal(catalog.catalogKind, "claw_agent_tool_catalog");
  assert.deepEqual(catalog.tools.map((tool) => tool.id), ["support.contacts.lookup"]);
  assert.deepEqual(catalog.tools[0]?.matchedGrantIds, ["agent", "assignment", "execution", "connector", "host", "run"]);
  assert.deepEqual(catalog.blocked.map((tool) => tool.id), ["support.ticket.refund", "ops.host.erase"]);
  assert.equal(catalog.blocked[0]?.reasons.includes("tool: approval required"), true);
  assert.equal(catalog.blocked[1]?.reasons.includes("tool: domain ops outside allowed domains"), true);
  assert.equal(catalog.blocked[1]?.reasons.includes("tool: catastrophic risk requires host approval flow"), true);
  assert.deepEqual(catalog.gaps, ["tool_catalog_has_blocked_tools"]);
  assert.equal(catalog.audit.kind, "tool_catalog");
});

test("Agents V1 creation reviews package a proposed agent and block risky missing setup", () => {
  const review = createAgentCreationReview({
    reviewedAt: "2026-05-17T10:00:00.000Z",
    actorId: "actor.owner",
    surface: "external_channel",
    agent: {
      id: "agent.support",
      name: "Support",
      role: "Support",
      secretAllowlist: ["vault://agents/support"],
    },
    assignments: [{
      id: "assignment.web",
      agentId: "agent.support",
      kind: "external_web_chat",
      status: "draft",
      channel: "chat",
      privacyPolicy: "raw_with_retention",
    }],
    executionProfiles: [{
      id: "execution.web",
      agentId: "agent.support",
      executionMode: "async",
      hostAccess: "native_host",
      networkPolicy: "open",
    }],
    resourceGrants: [{
      id: "grant.secret",
      resourceType: "secret",
      resourceId: "vault://agents/support",
      action: "lease_secret",
    }],
  });

  assert.equal(review.reviewKind, "claw_agent_creation_review");
  assert.equal(review.ready, false);
  assert.equal(review.requiredApprovals.includes("resource_owner"), true);
  assert.equal(review.requiredApprovals.includes("host"), true);
  assert.equal(review.requiredApprovals.includes("network"), true);
  assert.equal(review.gaps.includes("active_assignment_missing"), true);
  assert.equal(review.gaps.includes("budget_policy_missing"), true);
  assert.equal(review.risks.includes("native_host_access"), true);
  assert.equal(review.risks.includes("open_network_policy"), true);
  assert.equal(String(review.safePackage.agent.secretAllowlist).includes("vault://"), false);
  assert.equal(review.audit.kind, "creation_review");
  assert.equal(review.audit.result, "blocked");
});

test("Agents V1 storage audit verifies canonical subentities, JSON policy, and legacy overlap", () => {
  const ready = createAgentStorageAudit({ auditedAt: "2026-05-17T10:00:00.000Z" });
  assert.equal(ready.auditKind, "claw_agent_storage_audit");
  assert.equal(ready.ready, true);
  assert.equal(ready.canonicalCollections.includes("agents"), true);
  assert.equal(ready.canonicalCollections.includes("agent_sessions"), true);
  assert.equal(AGENTS.fields.some((field) => field.name === "stewardId"), true);
  assert.equal(AGENTS.fields.some((field) => field.name === "scopeType"), true);
  assert.equal(AGENTS.fields.some((field) => field.name === ["owner", "Id"].join("")), false);
  assert.equal(AGENTS.indexes.some((index) => index.name === "agents_steward_idx"), true);
  assert.equal(AGENT_SESSIONS.fields.some((field) => field.name === "workspaceId"), true);
  assert.equal(AGENT_SESSIONS.fields.some((field) => field.name === "projectId"), true);
  assert.equal(AGENT_SESSIONS.indexes.some((index) => index.name === "agent_sess_scope_idx"), true);
  assert.deepEqual(ready.missingCollections, []);
  assert.deepEqual(ready.unexpectedJsonFields, []);
  assert.equal(ready.audit.kind, "storage_audit");
  assert.equal(ready.audit.result, "allowed");

  const blocked = createAgentStorageAudit({
    auditedAt: "2026-05-17T10:00:00.000Z",
    observedTables: ready.canonicalCollections.filter((name) => name !== "agent_budgets"),
    legacyCollections: ["company_agents"],
    allowedJsonFields: ["source", "links", "metadata"],
  });
  assert.equal(blocked.ready, false);
  assert.equal(blocked.missingCollections.includes("agent_budgets"), true);
  assert.deepEqual(blocked.legacyOverlaps, ["company_agents"]);
  assert.equal(blocked.unexpectedJsonFields.some((field) => field.collection === "agents" && field.field === "schedule"), true);
  assert.equal(blocked.gaps.includes("legacy_overlap:company_agents"), true);
  assert.equal(blocked.audit.result, "blocked");
});

test("Agents V1 audit coverage reports missing, invalid, and sensitive audit events", () => {
  const eventFor = (kind: Parameters<typeof createAgentAuditEvent>[0]["kind"]) => createAgentAuditEvent({
    id: `audit.${kind}`,
    kind,
    agentId: "agent.support",
    result: "recorded",
    reason: `covered ${kind}`,
    redaction: "strict",
    createdAt: "2026-05-17T10:00:00.000Z",
    metadata: { kind },
  });
  const covered = createAgentAuditCoverageReport({
    auditedAt: "2026-05-17T10:00:00.000Z",
    events: [
      "blueprint",
      "evaluation",
      "config_revision",
      "retirement",
      "service_api",
      "safe_export",
      "incident",
      "context_pack",
      "tool_catalog",
      "dispatch_plan",
      "creation_review",
      "storage_audit",
      "control_panel",
      "privacy_lifecycle",
      "paperclip_import",
      "permission_escalation",
    ].map((kind) => eventFor(kind as Parameters<typeof createAgentAuditEvent>[0]["kind"])),
  });
  assert.equal(covered.reportKind, "claw_agent_audit_coverage");
  assert.equal(covered.ready, true);
  assert.deepEqual(covered.missingKinds, []);
  assert.deepEqual(covered.invalidEvents, []);
  assert.deepEqual(covered.sensitiveFindings, []);
  assert.equal(covered.audit.kind, "audit_coverage");
  assert.equal(covered.audit.result, "allowed");

  const blocked = createAgentAuditCoverageReport({
    expectedKinds: ["blueprint", "service_api"],
    events: [{
      id: "audit.blueprint",
      kind: "blueprint",
      agentId: "agent.support",
      result: "recorded",
      redaction: "strict",
      createdAt: "2026-05-17T10:00:00.000Z",
      metadata: { raw: "vault://agents/support/api-key" },
    }],
    auditedAt: "2026-05-17T10:00:00.000Z",
  });
  assert.equal(blocked.ready, false);
  assert.deepEqual(blocked.missingKinds, ["service_api"]);
  assert.equal(blocked.sensitiveFindings.includes("audit.blueprint:raw_vault_ref"), true);
  assert.equal(blocked.gaps.includes("missing_audit_kind:service_api"), true);
  assert.equal(blocked.audit.result, "blocked");
});

test("Agents V1 operational snapshots query redacted runs, sessions, incidents, and audits", () => {
  const snapshot = createAgentOperationalSnapshot({
    agentId: "agent.support",
    capturedAt: "2026-05-17T11:00:00.000Z",
    statuses: ["active", "running", "open", "recorded"],
    since: "2026-05-17T09:00:00.000Z",
    assignments: [{
      id: "assignment.web",
      agentId: "agent.support",
      status: "active",
      endpointRef: "web://support",
      updatedAt: "2026-05-17T10:00:00.000Z",
    }],
    runs: [{
      id: "run.1",
      agentId: "agent.support",
      status: "running",
      startedAt: "2026-05-17T10:30:00.000Z",
      outcomeJson: { rawTracePath: "/Users/example/run.log" },
    }],
    sessions: [{
      id: "session.1",
      agentId: "agent.support",
      status: "active",
      createdAt: "2026-05-17T10:20:00.000Z",
    }],
    incidents: [{
      id: "incident.1",
      agentId: "agent.support",
      status: "open",
      severity: "high",
      detectedAt: "2026-05-17T10:40:00.000Z",
    }],
    audits: [createAgentAuditEvent({
      id: "audit.snapshot",
      kind: "incident",
      agentId: "agent.support",
      result: "recorded",
      redaction: "strict",
      createdAt: "2026-05-17T10:45:00.000Z",
      metadata: { tracePath: "/Users/example/audit.log" },
    })],
  });
  assert.equal(snapshot.snapshotKind, "claw_agent_operational_snapshot");
  assert.equal(snapshot.summary.assignments.active, 1);
  assert.equal(snapshot.summary.runs.running, 1);
  assert.equal(snapshot.summary.incidents.open, 1);
  assert.equal(snapshot.summary.audits.incident, 1);
  assert.deepEqual(snapshot.gaps, []);
  assert.equal(JSON.stringify(snapshot).includes("/Users/example"), false);
  assert.equal(snapshot.audit.kind, "operational_snapshot");
  assert.equal(snapshot.audit.result, "recorded");

  const blocked = createAgentOperationalSnapshot({
    agentId: "agent.support",
    capturedAt: "2026-05-17T11:00:00.000Z",
    assignments: [],
    runs: [],
    sessions: [],
    audits: [],
  });
  assert.equal(blocked.gaps.includes("assignments_missing"), true);
  assert.equal(blocked.gaps.includes("audits_missing"), true);
  assert.equal(blocked.audit.result, "blocked");
});

test("Agents V1 control panels compose identity, permissions, posture, and operations for human review", () => {
  const panel = createAgentControlPanel({
    generatedAt: "2026-05-17T11:00:00.000Z",
    surface: "external_channel",
    agent: {
      id: "agent.support",
      name: "Support",
      autonomyProfile: "respond_only",
      status: "active",
      secretAllowlist: ["vault://agents/support"],
    },
    assignments: [{
      id: "assignment.web",
      agentId: "agent.support",
      kind: "external_web_chat",
      status: "active",
      channel: "chat",
      privacyPolicy: "hashed",
      externalDisclosure: "transparent_agent",
    }],
    executionProfiles: [{ id: "execution.web", agentId: "agent.support", executionMode: "async", networkPolicy: "connector_only" }],
    resourceGrants: [{
      id: "grant.support",
      agentId: "agent.support",
      resourceType: "collection",
      resourceId: "support_conversations",
      action: "read",
      effect: "allow",
    }],
    memoryPolicies: [{ id: "memory.support", writePolicy: "private_only", crossUserBoundary: "explicit_grant_only" }],
    budgets: [{ id: "budget.support", exceededBehavior: "deny_action", limits: [{ dimension: "external_actions", limit: 5 }] }],
    runs: [{ id: "run.support", agentId: "agent.support", status: "running", startedAt: "2026-05-17T10:30:00.000Z" }],
    sessions: [{ id: "session.support", agentId: "agent.support", status: "active", createdAt: "2026-05-17T10:20:00.000Z" }],
    audits: [createAgentAuditEvent({
      id: "audit.support.dispatch",
      kind: "dispatch_plan",
      agentId: "agent.support",
      result: "recorded",
      redaction: "strict",
      createdAt: "2026-05-17T10:25:00.000Z",
      metadata: {},
    })],
  });
  assert.equal(panel.panelKind, "claw_agent_control_panel");
  assert.equal(panel.posture.activeAssignments, 1);
  assert.equal(panel.posture.externalAssignments, 1);
  assert.equal(panel.posture.failClosed, false);
  assert.equal(panel.uiVisibility.surfaces.includes("external_channel"), true);
  assert.equal(panel.permissions.allowGrants, 1);
  assert.equal(panel.memory.writePolicies[0], "private_only");
  assert.equal(panel.operationalSnapshot.summary.runs.running, 1);
  assert.equal(panel.creationReview.ready, true);
  assert.equal(JSON.stringify(panel).includes("vault://"), false);
  assert.equal(panel.audit.kind, "control_panel");
  assert.equal(panel.audit.result, "recorded");
});

test("Agents V1 privacy lifecycle plans export, delete, anonymize, and respect legal holds", () => {
  const exported = createAgentPrivacyLifecyclePlan({
    operation: "export",
    subject: { scopeType: "external_user", scopeId: "external_user_1" },
    requestedAt: "2026-05-17T11:00:00.000Z",
    agent: { id: "agent.support", name: "Support", secretAllowlist: ["vault://agents/support"] },
    sessions: [{ id: "session.1", agentId: "agent.support", externalUserId: "external_user_1", status: "active" }],
    supportConversations: [{ id: "conversation.1", externalUserId: "external_user_1", metadata: { rawPath: "/Users/example/customer.json" } }],
    supportMessages: [{ id: "message.1", externalUserId: "external_user_1", body: "Need help" }],
    audits: [createAgentAuditEvent({
      id: "audit.privacy",
      kind: "service_api",
      agentId: "agent.support",
      result: "recorded",
      redaction: "strict",
      createdAt: "2026-05-17T10:00:00.000Z",
      metadata: { externalUserId: "external_user_1" },
    })],
  });
  assert.equal(exported.planKind, "claw_agent_privacy_lifecycle_plan");
  assert.equal(exported.actions.every((action) => action.disposition === "include_export"), true);
  assert.equal(exported.exportRecords.some((entry) => entry.collection === "support_messages"), true);
  assert.equal(JSON.stringify(exported).includes("/Users/example"), false);
  assert.equal(exported.exportPackage?.agent.secretAllowlist, "[REDACTED]");
  assert.equal(exported.audit.kind, "privacy_lifecycle");
  assert.equal(exported.audit.result, "recorded");

  const deletion = createAgentPrivacyLifecyclePlan({
    operation: "delete",
    subject: { scopeType: "external_user", scopeId: "external_user_1" },
    requestedAt: "2026-05-17T11:00:00.000Z",
    agent: { id: "agent.support", name: "Support" },
    supportMessages: [{ id: "message.1", externalUserId: "external_user_1", body: "Need help" }],
    legalHoldRecordIds: ["message.1"],
  });
  assert.deepEqual(deletion.actions.map((action) => action.disposition), ["retain"]);
  assert.equal(deletion.gaps.includes("legal_hold_records_retained"), true);
  assert.equal(deletion.audit.result, "blocked");

  const anonymized = createAgentPrivacyLifecyclePlan({
    operation: "anonymize",
    subject: { scopeType: "customer", scopeId: "customer_1" },
    agent: { id: "agent.support", name: "Support" },
    supportConversations: [{ id: "conversation.2", customerId: "customer_1" }],
  });
  assert.equal(anonymized.actions[0]?.disposition, "anonymize");
  assert.equal(anonymized.actions[0]?.patch?.subjectId, "[REDACTED_SUBJECT]");
});

test("Agents V1 imports Paperclip-style agent packages as Claw blueprints without dependency", () => {
  const plan = createAgentPaperclipImportPlan({
    packageId: "paperclip.support",
    importedAt: "2026-05-17T11:00:00.000Z",
    defaultStewardId: "company_1",
    agentsMd: [
      "# Support Lead",
      "Role: support",
      "Model: balanced",
      "Skills: skill.support@1, skill.escalate@2",
      "Grants: collection:support_conversations:read",
      "Instructions: Help customers safely.",
    ].join("\n"),
    package: {
      name: "Support package",
      skills: [{ ref: "skill.shared", version: "1" }],
      metadata: {
        localPath: "/Users/example/paperclip",
        apiToken: "raw",
      },
    },
  });
  assert.equal(plan.planKind, "claw_agent_paperclip_import_plan");
  assert.equal(plan.dependencyPolicy, "paperclip_not_required");
  assert.equal(plan.source, "mixed");
  assert.equal(plan.blueprints.length, 1);
  assert.equal(plan.blueprints[0]?.agencyMode, "support");
  assert.equal(plan.blueprints[0]?.modelTier, "balanced");
  assert.deepEqual(plan.blueprints[0]?.skillRefs, ["skill.support@1", "skill.escalate@2", "skill.shared@1"]);
  assert.equal(plan.blueprints[0]?.requiredResourceGrants[0]?.resourceId, "support_conversations");
  assert.equal(JSON.stringify(plan).includes("/Users/example"), false);
  assert.equal(JSON.stringify(plan).includes("raw"), false);
  assert.equal(plan.audit.kind, "paperclip_import");
  assert.equal(plan.audit.result, "recorded");

  const blocked = createAgentPaperclipImportPlan({
    importedAt: "2026-05-17T11:00:00.000Z",
  });
  assert.equal(blocked.gaps.includes("paperclip_source_missing"), true);
  assert.equal(blocked.gaps.includes("paperclip_agents_missing"), true);
  assert.equal(blocked.audit.result, "blocked");
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
    skillBindings: [{
      ref: "skill.support",
      version: "1",
      requiredResourceGrants: [{
        resourceType: "secret",
        resourceId: "vault://agents/support",
        action: "lease_secret",
      }],
      metadata: {
        localPath: "/Users/example/skills/support",
        apiToken: "raw",
      },
    }],
  });
  assert.equal(exported.schemaVersion, 1);
  assert.equal(exported.packageKind, "claw_agent_package");
  assert.equal(exported.agent.secretAllowlist, "[REDACTED]");
  assert.equal(exported.agent.localPath, "[REDACTED_LOCAL_PATH]");
  assert.equal(exported.skillBindings[0]?.ref, "skill.support");
  assert.equal(exported.skillBindings[0]?.version, "1");
  assert.equal(exported.skillBindings[0]?.requiredResourceGrants?.[0]?.resourceId, "[REDACTED_SECRET_REF]");
  assert.deepEqual(exported.skillBindings[0]?.metadata, {
    localPath: "[REDACTED_LOCAL_PATH]",
    apiToken: "[REDACTED]",
  });
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

test("Agents V1 incident collection matches core incident vocabulary", () => {
  const status = AGENT_INCIDENTS.fields.find((field) => field.name === "status");
  const severity = AGENT_INCIDENTS.fields.find((field) => field.name === "severity");
  const summary = AGENT_INCIDENTS.fields.find((field) => field.name === "summary");
  assert.deepEqual(status?.options, ["open", "mitigating", "resolved", "archived"]);
  assert.deepEqual(severity?.options, ["info", "low", "medium", "high", "critical"]);
  assert.equal(summary?.required, true);
  assert.equal(AGENT_INCIDENTS.fields.some((field) => field.name === "runId"), true);
  assert.equal(AGENT_INCIDENTS.fields.some((field) => field.name === "sessionId"), true);
  assert.equal(AGENT_INCIDENTS.fields.some((field) => field.name === "detectedAt"), true);
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

test("Agents V1 activity feed materializes only limited recent items", () => {
  const oldRecords = Array.from({ length: 100 }, (_value, index) => {
    const record: Record<string, unknown> = {
      id: `run_old_${index}`,
      status: "completed",
      startedAt: "2026-05-17T08:00:00.000Z",
    };
    Object.defineProperty(record, "metadata", {
      enumerable: true,
      get() {
        throw new Error("old metadata should not be materialized");
      },
    });
    return record;
  });
  const feed = createAgentActivityFeed({
    agentId: "agent.support",
    limit: 1,
    runs: oldRecords,
    incidents: [{
      id: "incident_recent",
      severity: "high",
      status: "open",
      summary: "Recent incident",
      detectedAt: "2026-05-17T10:00:00.000Z",
    }],
  });

  assert.equal(feed.items.length, 1);
  assert.equal(feed.items[0]?.sourceId, "incident_recent");
  assert.equal(feed.items[0]?.title, "Recent incident");
});

test("Agents V1 blueprints produce redacted portable templates", () => {
  const blueprint = createAgentBlueprint({
    name: "Support blueprint",
    agencyMode: "support",
    version: 3,
    modelTier: "balanced",
    skillRefs: ["skill.support@1"],
    skillBindings: [{
      ref: "skill.escalation",
      version: "2",
      requiredAssignmentKinds: ["support_inbox"],
      requiredResourceGrants: [{
        id: "grant.escalate.secret",
        resourceType: "secret",
        resourceId: "vault://agents/support/escalation",
        action: "lease_secret",
      }],
    }],
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
  assert.deepEqual(blueprint.skillRefs, ["skill.support@1", "skill.escalation@2"]);
  assert.deepEqual(blueprint.skillBindings.map((binding) => binding.ref), ["skill.support", "skill.escalation"]);
  assert.equal(blueprint.skillBindings[1]?.requiredResourceGrants?.[0]?.resourceId, "[REDACTED_SECRET_REF]");
  assert.equal(blueprint.safeExport.skillBindings[1]?.requiredAssignmentKinds?.[0], "support_inbox");
  assert.equal(JSON.stringify(blueprint.safeExport).includes("vault://"), false);
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
  assert.deepEqual(projection.gaps, [
    "active_assignment_missing",
    "raw_telemetry_retention_policy_missing",
    "budget_policy_missing",
  ]);
  assert.deepEqual(projection.risks, [
    "raw_telemetry_retention_requires_policy_review",
    "external_disclosure_uses_custom_wording",
    "memory_cross_user_boundary_not_explicit_grant_only",
  ]);
});

test("Agents V1 service API projection requires API-compatible assignments", () => {
  const projection = createAgentSafeSurfaceProjection({
    surface: "service_api",
    projectedAt: "2026-05-17T10:00:00.000Z",
    agent: { id: "agent.support", name: "Support" },
    assignments: [{
      id: "assignment.mac",
      agentId: "agent.support",
      kind: "internal_mac_chat",
      status: "active",
      channel: "mac",
      endpointRef: "clawix://workspace/main",
      privacyPolicy: "hashed",
      externalDisclosure: "transparent_agent",
    }],
    budgets: [{
      id: "budget.api",
      exceededBehavior: "deny_action",
      limits: [{ dimension: "external_actions", limit: 5, used: 1 }],
    }],
  });
  assert.equal(projection.surface, "service_api");
  assert.equal("endpointRef" in projection.assignments[0], false);
  assert.deepEqual(projection.gaps, ["surface_assignment_kind_missing"]);

  const allowed = createAgentSafeSurfaceProjection({
    surface: "service_api",
    projectedAt: "2026-05-17T10:00:00.000Z",
    agent: { id: "agent.support", name: "Support" },
    assignments: [{ ...projection.assignments[0], kind: "mcp_api", status: "active" }],
    budgets: [{
      id: "budget.api",
      exceededBehavior: "deny_action",
      limits: [{ dimension: "external_actions", limit: 5, used: 1 }],
    }],
  });
  assert.deepEqual(allowed.gaps, []);
});

test("Agents V1 service API response exposes only the safe service projection", () => {
  const blocked = createAgentServiceApiResponse({
    requestId: "request.service.blocked",
    operation: "describe_agent",
    requestedAt: "2026-05-17T10:00:00.000Z",
    agent: {
      id: "agent.support",
      name: "Support",
      secretAllowlist: ["vault://agents/support"],
      localPath: "/Users/example/agent",
    },
    assignments: [{
      id: "assignment.mac",
      agentId: "agent.support",
      kind: "internal_mac_chat",
      status: "active",
      endpointRef: "clawix://workspace/main",
    }],
    budgets: [{
      id: "budget.service",
      exceededBehavior: "deny_action",
      limits: [{ dimension: "external_actions", limit: 5, used: 1 }],
    }],
  });
  assert.equal(blocked.apiKind, "claw_agent_service_api");
  assert.equal(blocked.allowed, false);
  assert.deepEqual(blocked.errors, ["service_api:surface_assignment_kind_missing"]);
  assert.equal(blocked.projection.surface, "service_api");
  assert.equal("secretAllowlist" in blocked.projection.agent, false);
  assert.equal("localPath" in blocked.projection.agent, false);
  assert.equal("endpointRef" in blocked.projection.assignments[0], false);
  assert.equal(blocked.audit.kind, "service_api");
  assert.equal(blocked.audit.result, "blocked");

  const allowed = createAgentServiceApiResponse({
    requestId: "request.service.allowed",
    operation: "surface_projection",
    requestedAt: "2026-05-17T10:00:00.000Z",
    agent: { id: "agent.support", name: "Support" },
    assignments: [{
      id: "assignment.api",
      agentId: "agent.support",
      kind: "mcp_api",
      status: "active",
      channel: "api",
      privacyPolicy: "hashed",
    }],
    budgets: [{
      id: "budget.service",
      exceededBehavior: "deny_action",
      limits: [{ dimension: "external_actions", limit: 5, used: 1 }],
    }],
  });
  assert.equal(allowed.allowed, true);
  assert.deepEqual(allowed.errors, []);
  assert.equal(allowed.audit.result, "allowed");
});

test("Agents V1 service API HTTP binding is hermetic and fail-closed", () => {
  const accepted = createAgentServiceApiHttpResponse({
    method: "POST",
    path: "/v1/agents/service-api",
    receivedAt: "2026-05-17T10:00:00.000Z",
    body: JSON.stringify({
      requestId: "request.http.allowed",
      operation: "describe_agent",
      agent: { id: "agent.support", name: "Support", localPath: "/Users/example/agent" },
      assignments: [{ id: "assignment.api", agentId: "agent.support", kind: "mcp_api", status: "active", channel: "api" }],
      budgets: [{ id: "budget.api", exceededBehavior: "deny_action", limits: [{ dimension: "external_actions", limit: 5 }] }],
    }),
  });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.headers["x-claw-agents-api"], "v1");
  assert.equal((accepted.body as ReturnType<typeof createAgentServiceApiResponse>).allowed, true);
  assert.equal(JSON.stringify(accepted.body).includes("/Users/example"), false);

  const blocked = createAgentServiceApiHttpResponse({
    method: "POST",
    path: "/v1/agents/service-api",
    body: {
      operation: "describe_agent",
      agent: { id: "agent.support", name: "Support" },
      assignments: [{ id: "assignment.mac", agentId: "agent.support", kind: "internal_mac_chat", status: "active" }],
    },
  });
  assert.equal(blocked.status, 422);
  assert.equal((blocked.body as ReturnType<typeof createAgentServiceApiResponse>).allowed, false);

  const wrongMethod = createAgentServiceApiHttpResponse({
    method: "GET",
    path: "/v1/agents/service-api",
  });
  assert.equal(wrongMethod.status, 405);
  assert.equal((wrongMethod.body as { error: string }).error, "method_not_allowed");
});

test("Agents V1 hermetic route acceptance covers internal Mac, external support, and subagent delegation", () => {
  const internalAssignment: AgentAssignmentRoute = {
    id: "assignment.mac",
    agentId: "agent.operator",
    kind: "internal_mac_chat",
    status: "active",
    channel: "mac",
    endpointRef: "clawix://workspace/main",
    scopeType: "workspace",
    scopeId: "workspace_1",
  };
  const internalRoute = evaluateAgentAssignmentRoute({
    assignment: internalAssignment,
    kind: "internal_mac_chat",
    channel: "mac",
    endpointRef: "clawix://workspace/main",
    now: "2026-05-17T10:00:00.000Z",
  });
  assert.equal(internalRoute.allowed, true);
  assert.deepEqual(internalRoute.reasons, []);

  const externalAssignment: AgentAssignmentRoute = {
    id: "assignment.web",
    agentId: "agent.support",
    kind: "external_web_chat",
    status: "active",
    channel: "chat",
    endpointRef: "web://support-widget",
    privacyPolicy: "hashed",
    externalDisclosure: "transparent_agent",
  };
  const externalRoute = evaluateAgentAssignmentRoute({
    assignment: externalAssignment,
    kind: "external_web_chat",
    channel: "chat",
    endpointRef: "web://support-widget",
    now: "2026-05-17T10:00:00.000Z",
  });
  assert.equal(externalRoute.allowed, true);

  const identity = resolveAgentExternalIdentity({
    provider: "web",
    externalId: "visitor_42",
    email: "customer@example.com",
    customerId: "customer_1",
    ip: "203.0.113.42",
  });
  const supportProjection = createAgentSupportInboxProjection({
    sessionId: "session.support.1",
    assignment: externalAssignment,
    identity,
    initialMessage: "Need help with billing",
    now: "2026-05-17T10:00:00.000Z",
  });
  assert.equal(identity.boundary.scopeType, "customer");
  assert.equal(supportProjection.conversation.customerId, "customer_1");
  assert.equal(supportProjection.conversation.metadata.boundaryScopeId, "customer_1");
  assert.equal("ip" in identity.telemetry, false);

  const customerMemory = evaluateAgentMemoryAccess({
    readScopes: [{ layer: "customer", scopeId: "customer_1", access: "read" }],
    writeScopes: [{ layer: "session", scopeId: "session.support.1", access: "write" }],
    writePolicy: "private_only",
    crossUserBoundary: "explicit_grant_only",
  }, {
    operation: "read",
    layer: "customer",
    scopeId: "customer_1",
    boundary: identity.boundary,
  });
  assert.equal(customerMemory.allowed, true);

  const subagentAssignment: AgentAssignmentRoute = {
    id: "assignment.subagent",
    agentId: "agent.researcher",
    kind: "subagent_delegation",
    status: "active",
    channel: "runtime",
    endpointRef: "agent://researcher",
    scopeType: "project",
    scopeId: "project_1",
  };
  const subagentRoute = evaluateAgentAssignmentRoute({
    assignment: subagentAssignment,
    kind: "subagent_delegation",
    channel: "runtime",
    endpointRef: "agent://researcher",
    now: "2026-05-17T10:00:00.000Z",
  });
  assert.equal(subagentRoute.allowed, true);

  const projectRequest: AgentAccessRequest = {
    resourceType: "collection",
    resourceId: "project_notes",
    action: "read",
    scopeType: "project",
    scopeId: "project_1",
  };
  const allowProject = (id: string): AgentResourceGrant => ({
    id,
    resourceType: "collection",
    resourceId: "project_notes",
    action: "read",
    scopeType: "project",
    scopeId: "project_1",
    effect: "allow",
  });
  const delegation = evaluateAgentDelegationAccess({
    parent: {
      requested: projectRequest,
      agentGrants: [allowProject("parent-agent")],
      assignmentGrants: [allowProject("parent-assignment")],
      executionProfileGrants: [allowProject("parent-execution")],
      connectorGrants: [allowProject("parent-connector")],
      hostGrants: [allowProject("parent-host")],
      runScopeGrants: [allowProject("parent-run")],
    },
    child: {
      requested: projectRequest,
      agentGrants: [allowProject("child-agent")],
      assignmentGrants: [allowProject("child-assignment")],
      executionProfileGrants: [allowProject("child-execution")],
      connectorGrants: [allowProject("child-connector")],
      hostGrants: [allowProject("child-host")],
      runScopeGrants: [allowProject("child-run")],
    },
  });
  assert.equal(delegation.allowed, true);
  assert.deepEqual(delegation.reasons, []);
  assert.equal(delegation.matchedGrantIds.includes("parent-agent"), true);
  assert.equal(delegation.matchedGrantIds.includes("child-agent"), true);
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
