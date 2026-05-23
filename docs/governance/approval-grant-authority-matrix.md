# Approval And Grant Authority Matrix

This matrix is an inventory, not a new store. Each row points to the canonical
domain steward that already decides the domain. New approval or grant work must
extend that domain instead of creating a parallel registry.

| Domain | Canonical steward | Grant or approval type | Inspection route | Audit path | Fail-closed behavior |
| --- | --- | --- | --- | --- | --- |
| Connector execution | Connector Control Plane | Scoped connector approval grant for provider, operation, capability, risk, unknown cost, or network bypass | `claw connectors` and `evaluateConnectorControlPlaneRequest` | `connector_audit_events`; raw traces stay encrypted behind `connector_raw_trace_refs` | Missing, expired, or out-of-scope grant blocks execution before runtime. |
| Connector network access | Network Control Plane | Network policy evaluation proof consumed by connector projection | `claw network` and connector `networkPolicyId` proof | Network event/evaluation audit plus connector decision reason | Connector egress, VPN, proxy, or host metadata cannot authorize without a compatible `NetworkPolicyEvaluation`. |
| Secret use | Secrets broker and signed host | Secret lease, grant for agents, reveal approval, backup/import approval | `claw secrets`, host Secrets UI, brokered execution APIs | Secrets audit chain and host assertion evidence | Invalid wire, missing signed-host proof, expired grant, or unknown capability denies access without exposing plaintext. |
| Native/OS permissions | Mac Control Plane and signed host | OS permission request or native capability grant | `claw permissions`, `claw mac`, host permission UI | Host permission audit and signed-host validation evidence | Agents cannot self-escalate; unavailable entitlement or unvalidated signed-host state remains blocked or external pending. |
| Agents V1 resources | Agents V1 governance | Agent resource grant, assignment, policy gate | `claw agents` and `agent_resource_grants` | Agent run/session/policy-gate audit | Missing grant or inactive assignment prevents resource use. |
| Remote mesh and gateway | Remote coordinator/gateway governance | Pairing, trust, remote access, external validation approval | `claw remote`, `claw gateway`, route contracts | Gateway audit receipts and source/approval-bound external evidence | Physical/provider runs stay `approval_required` or `EXTERNAL PENDING` until the exact approved run evidence exists. |
| Storage and shares | Storage service | Scoped storage token, share approval, export/import approval | Storage APIs, `claw inspect storage`, share records | Storage object/share audit, scoped token records | Missing scoped token or expired share denies read/write/export. |
| Publishing and irreversible actions | Domain steward plus No Irreversible Data Loss governance | Publication approval, destructive action approval, rollback evidence | Domain CLI/API and no-irreversible-data-loss checks | Domain audit plus recovery/rollback evidence | Hard delete or external mutation blocks unless classified, recoverable, and explicitly approved. |
| Report/publication workflows | Report governance and connector control plane | Human publication approval and brokered credential lease | Report governance docs and connector decision | Report artifact metadata plus connector audit | Preview-only until host approval and connector-scoped credential lease are present. |
| Capability/risk catalog | Capability catalog mirror guard | Capability/risk binding and dispatch mode classification | `verify-sdk-first-custom-surfaces-goal` and catalog checks | Guard output and surface binding evidence | Unknown capability or drift between TS/Swift mirrors fails the guard; it does not create a runtime grant store. |

## Rules

- A grant is valid only inside its stewarded domain and scope.
- A projection can cache or display a decision, but it must not become a second
  authority.
- Audit must be owned by the same domain that makes the decision, or by the
  broker that enforces the boundary.
- Unknown, missing, expired, malformed, or unvalidated authority fails closed.
- New domains must add one row here only after the steward, inspection route,
  audit path, and fail-closed behavior already exist or are explicitly blocked.
