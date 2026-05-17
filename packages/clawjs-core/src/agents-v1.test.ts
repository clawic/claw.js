import { test } from "vitest";
import assert from "node:assert/strict";

import {
  evaluateAgentDelegationAccess,
  evaluateAgentEffectiveAccess,
  createAgentPermissionEscalationRequest,
  type AgentAccessRequest,
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
