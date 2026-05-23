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
budgets, network proof, scoped connector grant records tied to approval evidence, and audit declarations into one
decision.

## Decision

ClawJS exposes the connector control plane through `@clawjs/core` and registers
`claw connectors` as the strict public CLI surface. `integrations` remains a
discovery alias, but new policy language uses connector.

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
- scoped connector grant check
- credential broker lease
- runtime
- redaction
- audit
- lease release

Host-owned approvals, credential brokers, raw trace opt-in, and real connector
execution stay outside the core evaluator.

Durable catalog and policy state live in the `connectors` logical domain in
`core.sqlite`: providers, external principals, credential bindings, capabilities,
operations, policies, budgets, network policy declarations, and redacted audit
events. The catalog stores secret references only. Raw trace opt-in stores only
encrypted payload references in `vault.sqlite`, with the main audit event
holding a `raw_trace_ref`.

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

## Performance Impact

V1 is explicitly local and non-executing, so policy evaluation should be cheap: metadata lookup, request classification, and redacted audit declaration only. The control plane prevents expensive or dangerous connector runtimes from starting before provider, budget, network, approval, and credential conditions are satisfied. Future runtime execution must separately budget network fan-out, credential leases, retries, audit volume, and provider latency.

## Decision Tensions

- **Prioritized axes**: security, least privilege, connector authority, auditability, budget control, and fail-closed behavior.
- **Constrained axes**: convenience execution and automatic provider mutation are constrained until policy, approval, credentials, and context are explicit.
- **Tradeoffs accepted**: connector calls require more planning and explanation before execution; that is accepted because integrations can spend money, mutate external systems, or expose private data.
- **Debt or pending evidence**: live execution, provider-specific runtime enforcement, and full approval receipts remain follow-on work beyond the V1 local decision surface.

## Consequences

Connector execution has a stable preflight contract. Agents can explain why a
request is blocked or approval-gated without touching external systems.
Providers and operations can be added incrementally while preserving a common
decision shape for CLI, host, audit, and tests.
