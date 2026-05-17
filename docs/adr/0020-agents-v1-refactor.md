# ADR 0020: Agents V1 refactor

Status: Accepted

Date: 2026-05-17

## Context

The pre-V1 framework had several overlapping agent concepts: filesystem agent
profiles, productivity roster agents, company agents, sessions, skills,
runtime agents, and channel/runtime placements. That made it too easy to wire a
Telegram, web chat, Relay, MCP, or UI path as if it were an internal desktop
agent with broader data, secret, filesystem, or host access.

Agents must instead be a first-class framework domain. An agent is a durable
digital employee and resource composition. Where the agent acts is a separate
assignment with stricter scoped policy.

## Decision

`agents` is the canonical collection and framework domain. `company_agents`
and deployment-style language are legacy overlap and must not be introduced as
new public concepts.

Agents V1 uses three layers:

- `agent`: durable identity, role, owner, org graph, instructions, skills,
  model tiers, memory policy, grants, budgets, evaluations, incidents, and
  audit.
- `agent_run`: operational execution record with runtime, sandbox, liveness,
  cost, logs, and outcome.
- `agent_session`: conversational or workflow interaction record. External
  support/product records project into support/inbox records; sessions are not
  the only user-facing conversation store.

First-class subentities are normalized under the agent domain:
`agent_assignments`, `agent_execution_profiles`, `agent_resource_grants`,
`agent_memory_policies`, `agent_budgets`, `agent_config_revisions`,
`agent_evaluations`, `agent_incidents`, `agent_blueprints`, and `agent_runs`.

Assignments cover internal Mac chat, external web/Telegram/WhatsApp/email,
support inboxes, workflows, automations, subagent delegation, MCP/API, Relay,
and custom channels. External-facing defaults are respond-only, transparent as
an agent/AI, and GDPR-grade local-first with per-assignment visitor telemetry
policy.

Effective access is fail-closed and is the intersection of agent grants,
assignment grants, execution profile sandbox, connector control plane, host
policy, and current run scope. Secrets are never exposed as plaintext to
agents; agents may only request operation-scoped broker leases with audit and
expiry.

## Enforcement

The first implementation slice is model plus gates:

- built-in collection schemas and core.sqlite tables for Agents V1 entities
- `claw agents schema`, `claw agents evaluate-access`, `claw agents
  route-check`, `claw agents resolve-external-identity`, and `claw agents
  project-support-inbox`, `claw agents memory-check`, and `claw agents
  surface-projection`, `claw agents config-revision`, and `claw agents
  incident`
- `@clawjs/core` policy evaluators for effective access, grant expiry,
  assignment routing, external identity, support projection, flexible memory
  scopes, multidimensional budgets, redacted audit events, safe package export,
  safe surface projections for Relay/MCP/API/UI, redacted config revisions,
  first-class incidents, formal escalation requests, and delegation
  no-laundering
- route graph coverage for internal Mac assignments, external support
  assignments, MCP/API assignments, runtime runs, sessions, grants, memory
  policies, and support/inbox projection
- `claw inspect agent <id>` for the Agents V1 fiche: identity, owner, org
  graph, assignments, grants, memory policies, execution profiles, budgets,
  runs, sessions, routes, risks, gaps, tests, incidents, revisions, and recent
  audit

Validation must be hermetic unless the user explicitly approves real providers,
paid calls, raw secrets, production mutation, or physical/native permissions.
Unavailable live/provider/native prerequisites are `EXTERNAL PENDING`, not
implicit success.

## Consequences

Mac UI visibility is based on assignments and favorites, not every global
agent. External channels cannot route without an active assignment. Subagents
delegate through assignments and cannot launder authority, budgets, grants, or
memory. Future UI work should build a full agent control panel on top of these
contracts rather than creating a second app-local agent model.
