# ADR 0015: Connector Control Plane V1

Status: accepted

Date: 2026-05-15

## Context

External integrations can read private data, mutate third-party systems, spend
money, depend on credentials, or require specific network posture. Claw needs a
single framework contract that agents and hosts can inspect before any
connector runtime executes.

The repository already separates secrets, host approvals, public CLI surfaces,
and integration runtimes. The missing layer is a deterministic control plane
that joins provider trust, operation support, credential bindings, policy,
budgets, network proof, approval grants, and audit declarations into one
decision.

## Decision

ClawJS exposes the connector control plane through `@clawjs/core` and registers
`claw connectors` as the strict public CLI surface. `integrations` remains a
legacy category alias for discovery, but new policy language uses connector.

V1 evaluates requests locally. It returns an allow/deny decision, stable reason
codes, the expected execution pipeline, and a redacted audit declaration. It
does not execute connector runtimes, call providers, lease credentials, spend
budget, deploy infrastructure, or request host permissions.

The pipeline is:

- capability request
- selection
- execution plan
- policy
- budget
- network
- approval grant
- credential broker lease
- runtime
- redaction
- audit
- lease release

Host-owned approvals, credential brokers, raw trace opt-in, and real connector
execution stay outside the core evaluator.

`@clawjs/integrations` consumes the evaluator at the runtime boundary. Real
operation and source execution fails closed unless the caller supplies a
matching control-plane decision context. The runner checks readiness before any
broker lease or runtime call: operation support, execution policy, audit
metadata, authenticated credential scope, and runtime evidence must be present.

MCP is a transport projection, not a separate trust boundary. MCP tool calls
must be represented as connector operations and pass the same policy, approval,
network, and audit checks before JSON-RPC invocation. External CLIs use
declarative command adapters with `runtimeKind: "cli"`; unsupported or
evidence-free adapters are not executable.

## Consequences

Connector execution has a stable preflight contract. Agents can explain why a
request is blocked or approval-gated without touching external systems.
Providers and operations can be added incrementally while preserving a common
decision shape for CLI, host, audit, and tests.
