import assert from "node:assert/strict";
import { test } from "vitest";

import {
  evaluateGovernanceAccess,
  evaluateGovernanceDelegation,
  summarizeGovernanceBindings,
  type GovernanceAuthorityEdge,
  type GovernanceGrant,
  type GovernanceRestriction,
} from "./governance.ts";

const readProjectGrant = (id: string, principalId = "user_1"): GovernanceGrant => ({
  id,
  subject: { kind: "principal", id: principalId },
  capabilities: ["read"],
  scope: { kind: "project", id: "project_1" },
  resource: { type: "memory", id: "project_memory" },
});

test("governance hierarchy and membership do not imply access without explicit grants", () => {
  const membership: GovernanceAuthorityEdge = {
    id: "edge.member",
    from: { kind: "principal", id: "user_1" },
    to: { kind: "entity", id: "org_1" },
    relation: "member",
    scope: { kind: "entity", id: "org_1" },
  };

  const result = evaluateGovernanceAccess({
    request: {
      principalId: "user_1",
      capability: "read",
      scope: { kind: "project", id: "project_1" },
      resource: { type: "memory", id: "project_memory" },
    },
    authorityEdges: [membership],
    scopeHierarchy: [{ parent: { kind: "entity", id: "org_1" }, child: { kind: "project", id: "project_1" } }],
  });

  assert.equal(result.allowed, false);
  assert.deepEqual(result.reasons, ["no_explicit_grant"]);
});

test("governance restrictions inherit down scope hierarchy and beat grants", () => {
  const restriction: GovernanceRestriction = {
    id: "restriction.org.memory",
    capabilities: ["read"],
    scope: { kind: "entity", id: "org_1" },
    resource: { type: "memory", id: "*" },
    inherited: true,
  };

  const result = evaluateGovernanceAccess({
    request: {
      principalId: "user_1",
      capability: "read",
      scope: { kind: "project", id: "project_1" },
      resource: { type: "memory", id: "project_memory" },
    },
    grants: [readProjectGrant("grant.project.memory")],
    restrictions: [restriction],
    scopeHierarchy: [{ parent: { kind: "entity", id: "org_1" }, child: { kind: "project", id: "project_1" } }],
  });

  assert.equal(result.allowed, false);
  assert.deepEqual(result.matchedRestrictionIds, ["restriction.org.memory"]);
});

test("governance entity grants require both membership and explicit capability", () => {
  const membership: GovernanceAuthorityEdge = {
    id: "edge.org.member",
    from: { kind: "principal", id: "user_1" },
    to: { kind: "entity", id: "org_1" },
    relation: "member",
    scope: { kind: "entity", id: "org_1" },
  };
  const entityGrant: GovernanceGrant = {
    id: "grant.org.project.read",
    subject: { kind: "entity", id: "org_1" },
    capabilities: ["read"],
    scope: { kind: "project", id: "project_1" },
    resource: { type: "memory", id: "project_memory" },
  };

  const allowed = evaluateGovernanceAccess({
    request: {
      principalId: "user_1",
      capability: "read",
      scope: { kind: "project", id: "project_1" },
      resource: { type: "memory", id: "project_memory" },
    },
    grants: [entityGrant],
    authorityEdges: [membership],
    scopeHierarchy: [{ parent: { kind: "entity", id: "org_1" }, child: { kind: "project", id: "project_1" } }],
  });
  const deniedWithoutMembership = evaluateGovernanceAccess({
    request: {
      principalId: "user_2",
      capability: "read",
      scope: { kind: "project", id: "project_1" },
      resource: { type: "memory", id: "project_memory" },
    },
    grants: [entityGrant],
    authorityEdges: [membership],
    scopeHierarchy: [{ parent: { kind: "entity", id: "org_1" }, child: { kind: "project", id: "project_1" } }],
  });

  assert.equal(allowed.allowed, true);
  assert.deepEqual(allowed.matchedGrantIds, ["grant.org.project.read"]);
  assert.equal(deniedWithoutMembership.allowed, false);
});

test("governance control does not imply read access", () => {
  const controlGrant: GovernanceGrant = {
    id: "grant.control",
    subject: { kind: "principal", id: "manager_1" },
    capabilities: ["control"],
    scope: { kind: "project", id: "project_1" },
  };

  const read = evaluateGovernanceAccess({
    request: {
      principalId: "manager_1",
      capability: "read",
      scope: { kind: "project", id: "project_1" },
      resource: { type: "memory", id: "project_memory" },
    },
    grants: [controlGrant],
  });
  const budget = evaluateGovernanceAccess({
    request: {
      principalId: "manager_1",
      capability: "budget_control",
      scope: { kind: "project", id: "project_1" },
      resource: { type: "policy" },
    },
    grants: [controlGrant],
  });

  assert.equal(read.allowed, false);
  assert.equal(budget.allowed, true);
  assert.deepEqual(budget.matchedGrantIds, ["grant.control"]);
});

test("governance delegation is strict intersection of delegator and delegatee", () => {
  const requested = {
    capability: "read" as const,
    scope: { kind: "project" as const, id: "project_1" },
    resource: { type: "memory", id: "project_memory" },
  };
  const denied = evaluateGovernanceDelegation({
    delegator: {
      request: { principalId: "parent_agent", ...requested },
      grants: [],
    },
    delegatee: {
      request: { principalId: "child_agent", ...requested },
      grants: [readProjectGrant("grant.child", "child_agent")],
    },
  });
  const allowed = evaluateGovernanceDelegation({
    delegator: {
      request: { principalId: "parent_agent", ...requested },
      grants: [readProjectGrant("grant.parent", "parent_agent")],
    },
    delegatee: {
      request: { principalId: "child_agent", ...requested },
      grants: [readProjectGrant("grant.child", "child_agent")],
    },
  });

  assert.equal(denied.allowed, false);
  assert.deepEqual(denied.reasons, ["delegator:no_explicit_grant"]);
  assert.equal(allowed.allowed, true);
  assert.deepEqual(allowed.matchedGrantIds, ["grant.parent", "grant.child"]);
});

test("governance local personal scope stays lightweight and binding summaries are precomputed", () => {
  const personal = evaluateGovernanceAccess({
    request: {
      principalId: "user_1",
      capability: "read",
      scope: { kind: "personal", id: "user_1" },
      resource: { type: "note", id: "note_1" },
    },
  });

  assert.equal(personal.allowed, true);
  assert.equal(personal.implicitLocal, true);
  assert.deepEqual(summarizeGovernanceBindings([
    { id: "binding.project", resource: { type: "project", id: "project_1" }, scope: { kind: "project", id: "project_1" }, steward: { kind: "principal", id: "user_1" }, dataClass: "private" },
    { id: "binding.global", resource: { type: "template", id: "template_1" }, scope: { kind: "global" }, dataClass: "internal" },
  ]), {
    resources: 2,
    scoped: 1,
    stewarded: 1,
    dataClasses: { private: 1, internal: 1 },
  });
});
