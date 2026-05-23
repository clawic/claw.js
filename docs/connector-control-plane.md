# Connector Control Plane

The connector control plane is the framework contract for deciding whether an
external connector operation may run. It is local and deterministic: it checks
provider state, operation support, credential bindings, policy rules, budgets,
network proof, approval-bound grant records, and audit requirements before any runtime is
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
7. approval-bound grant check
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

Control-plane operation records can be maintained locally with:

```bash
claw connectors operation upsert openai.images.edit --provider openai --runtime-kind api --support supported --json
claw connectors operation delete openai.images.edit --json
```

These writes schedule hot `connectors.catalog` Search jobs for the changed
operation id. The Search projection still excludes credential bindings, secret
refs, and raw traces.

## Decisions

`evaluateConnectorControlPlaneRequest` returns a decision with:

- `allowed`: whether the request may proceed;
- `pipeline`: the full ordered pipeline;
- `reasons`: stable reason codes for blocks or approval requirements;
- `audit`: redacted audit declaration with provider, operation, actor/request
  ids when available, selected governed context refs, selected field refs,
  secret refs, default context refs, applied fallback rule ids, approval-bound grant
  id, and redacted reason codes.

Supported block reasons include missing context, disabled providers,
unsupported operations, credential scope mismatch, policy denial, missing or
exceeded budgets, unknown-cost blocking, approval requirements, network proof
requirements, disallowed hosts, and governed-context failures such as blocked
records, missing fields, missing secret bindings, wrong environment, or
authorization-required context.

Network decisions are owned by the [Network Control Plane](./network-control-plane.md).
Connector network records are projections of that decision surface, not a
second policy engine. A connector request that declares `networkPolicyId` must
present a `ConnectorNetworkProof` containing a compatible
`NetworkPolicyEvaluation`; legacy egress, VPN, proxy, or allowed-host fields in
`connector_network_policies` are retained only as catalog metadata and cannot
authorize execution by themselves. If the proof omits the network evaluation,
the connector control plane fails closed with `network_proof_mismatch`.

Destructive provider operations also inherit the
[No Irreversible Data Loss](./governance/no-irreversible-data-loss/README.md)
contract. A provider trash, archive, restore, cancel, or unarchive path is
classified as `external_recoverable`. A provider hard delete is classified as
`irreversible_external_requires_exact_human_approval`: it requires exact human
approval, a provider receipt, local pre-action snapshot or export evidence where
possible, redacted audit, and `EXTERNAL PENDING` live evidence until a real
provider run is approved and recorded.

See [ADR 0015](./adr/0015-connector-control-plane-v1.md) for the accepted
architecture.
