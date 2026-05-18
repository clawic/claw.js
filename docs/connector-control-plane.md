# Connector Control Plane

The connector control plane is the framework contract for deciding whether an
external connector operation may run. It is local and deterministic: it checks
provider state, operation support, credential bindings, policy rules, budgets,
network proof, approval grants, and audit requirements before any runtime is
called.

Use `connectors` for the strict control plane. Integration packages provide
runtime adapters, but public policy language and durable catalog records use
connector terminology.

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

Connector operations may also declare governed context requirements. When they
do, the control plane requires a successful context decision before execution.
This covers provider-specific operational identifiers such as Apple Team IDs,
Bundle IDs, SKUs and signing identities, Google Play package names and signing
certificates, Amazon Appstore package/listing identifiers, RevenueCat project
and app ids, products, entitlements, API key versions, endpoints, and webhooks.
See [Connector Governed Context](./connector-governed-context.md) and
[ADR 0029](./adr/0029-connector-governed-context-v1.md).

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

## Storage

The durable control-plane catalog lives in `core.sqlite` under the `connectors`
logical domain:

- `connector_providers`
- `connector_external_principals`
- `connector_credential_bindings`
- `connector_capabilities`
- `connector_operations`
- `connector_policies`
- `connector_budgets`
- `connector_network_policies`
- `connector_context_records`
- `connector_context_defaults`
- `connector_context_audit_events`
- `connector_audit_events`

Credential material is never stored in these tables. Credential bindings store
only `secret_ref` pointers for the broker. Raw request/response traces are
redacted by default; if a host explicitly enables raw trace capture, the main
audit event stores only `raw_trace_ref`, and `vault.sqlite` stores
`connector_raw_trace_refs` entries with encrypted payload references, key
references, expiry, and metadata.

## Decisions

`evaluateConnectorControlPlaneRequest` returns a decision with:

- `allowed`: whether the request may proceed;
- `pipeline`: the full ordered pipeline;
- `reasons`: stable reason codes for blocks or approval requirements;
- `audit`: redacted audit declaration.

Supported block reasons include missing context, disabled providers,
unsupported operations, credential scope mismatch, policy denial, missing or
exceeded budgets, unknown-cost blocking, approval requirements, network proof
requirements, disallowed hosts, and governed-context failures such as blocked
records, missing fields, missing secret bindings, wrong environment, or
authorization-required context.

See [ADR 0015](./adr/0015-connector-control-plane-v1.md) for the accepted
architecture.
