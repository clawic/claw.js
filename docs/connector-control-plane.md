# Connector Control Plane

The connector control plane is the framework contract for deciding whether an
external connector operation may run. It is local and deterministic: it checks
provider state, operation support, credential bindings, policy rules, budgets,
network proof, approval grants, and audit requirements before any runtime is
called.

Use `connectors` for the strict control plane. `integrations` remains a legacy
category alias that routes to connector concepts.

## Pipeline

Connector execution follows these stages:

1. capability request
2. selection
3. execution plan
4. policy
5. budget
6. network
7. approval grant
8. credential broker lease
9. runtime
10. redaction
11. audit
12. lease release

The V1 contract only evaluates whether a request is allowed. It does not call
providers, spend budget, lease credentials, mutate external data, or bypass the
host-owned approval path.

`@clawjs/integrations` enforces the decision at the runner boundary.
`runConnectorOperation` and `runConnectorSource` require `controlPlane` options
for real execution (`dryRun: false`) before they create or call a runtime
executor and before they ask the broker for a credential lease. The runner also
blocks operations that are not `supported`, lack execution policy, lack audit
metadata, lack credential scope for authenticated operations, or lack runtime
evidence.

MCP tools are projected as connector operations with `runtimeKind: "mcp"`.
`@clawjs/mcp` rejects `mcp/tools/call` unless the request carries a matching
control-plane approval, and disabled servers or tools without schema evidence
block before the JSON-RPC tool call.

External CLIs are projected as command adapters with `runtimeKind: "cli"`.
Adapters are declarative plans: provider id, command, arguments, capabilities,
risk, credential requirement, support state, and local evidence. Unsupported or
evidence-free adapters cannot be planned, and execution requires the same
control-plane decision used by API/SDK runtimes.

## Decisions

`evaluateConnectorControlPlaneRequest` returns a decision with:

- `allowed`: whether the request may proceed;
- `pipeline`: the full ordered pipeline;
- `reasons`: stable reason codes for blocks or approval requirements;
- `audit`: redacted audit declaration.

Supported block reasons include missing context, disabled providers,
unsupported operations, credential scope mismatch, policy denial, missing or
exceeded budgets, unknown-cost blocking, approval requirements, network proof
requirements, and disallowed hosts.

See [ADR 0015](./adr/0015-connector-control-plane-v1.md) for the accepted
architecture.
