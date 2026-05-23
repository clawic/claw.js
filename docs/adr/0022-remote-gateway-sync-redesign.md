---
title: "ADR 0022: Remote Gateway and Sync Redesign"
description: "Coordinator, Gateway, Connector, Sync, Iroh adapter, remote parity, headless hosts, and multi-node synchronization."
---

# ADR 0022: Remote Gateway and Sync Redesign

Status: Accepted

Date: 2026-05-17

Source conversation: `source:remote-gateway-sync`

Private goal reference: the maintainer-local goal file for the same source
conversation. Public docs must not publish machine-local paths.

## Context

The existing Relay proved the need for remote access, pairing, connector
routing, and mobile/browser clients, but the product boundary was too narrow.
ClawJS must run as a complete host on any terminal-capable computer, including
Mac, Linux, Windows, Raspberry-class devices, and headless servers. The same
framework can be used as a personal mesh, as a remote server, or as a governed
multi-tenant agent service.

Remote access is therefore not a side API. It is the network projection of the
same framework capabilities, policies, grants, approvals, secrets boundary,
assignments, budgets, audit, route graph, and storage contracts used locally.
Synchronization is also not a Relay appendage: skills, memory, user-model
state, drive/files/blobs, sessions, database resources, sidecars, search
indexes, agent config, and workspace state need one resource-authority model
with pluggable physical drivers.

The binding decisions from the source conversation are:

- Split the old Relay concept into `Coordinator`, `Gateway`, `Connector`, and
  `Sync`.
- Support two trust modes: sovereign E2E/tunnel-only and governed Gateway.
- Classify every stable local capability as `remote-safe`, `local-only`,
  `blocked`, or `pending`.
- Cover personal devices and servers with the same architecture.
- Assign explicit authority metadata for each synced resource.
- Replicate secret references only; operations use brokered leases and audit.
- Keep the remote contract transport-agnostic; Iroh is the recommended v1
  adapter.
- Project the same registered SDK/service/CLI contracts remotely instead of
  inventing a mobile-only or Relay-only business API.
- Separate interactive command failure from queued sync reconciliation.
- Use one actor/action/resource/policy/audit model for humans, devices,
  agents, services, and organizations.
- Treat headless ClawJS as a complete host.
- Do not narrow the implementation to one vertical slice; chat, sync, search,
  secret references, and server-hosted agents must all close.
- Use manifests and changelogs as the governance plane without limiting the
  physical sync driver.
- Detect and elevate conflicts by default; never silently overwrite.
- Use minimal encrypted client cache with TTL and no secret or authoritative
  state.
- Fail closed after the baseline: stable capabilities need classification,
  route, owner, policy, and tests.
- Keep current Relay/mobile routes as compatibility adapters while clients
  migrate.
- Keep hosted and self-hosted on the exact same contract and conformance
  suite.
- Provide invitation, scoped share, and revocation primitives between meshes.
- Support governed multi-tenant agent service with assignments, budgets,
  isolation, and audit.

## Decision

Remote framework access has four canonical layers:

- `Coordinator`: node/device identity, pairing, preauth, magic links,
  heartbeat, peer discovery, rendezvous, signaling, and transport metadata.
- `Gateway`: remote projection of registered local SDK/service/CLI contracts.
  It enforces policy and conformance, and does not own domain business logic.
- `Connector`: host-side bridge into runtime, storage, services, policy, and
  audit. Current Relay connector routes become compatibility adapters for this
  layer.
- `Sync`: framework synchronization layer with resource manifests,
  changelogs, cursors, conflict elevation, drivers, cache policy, and audit.

Iroh is the preferred v1 transport adapter for P2P, rendezvous, and relay
fallback, but the stable contract is transport-agnostic. A central relay can
exist only as a transport or governed Gateway deployment; it cannot become a
privileged source of truth.
`RemoteTransportHandshakeReceipt` records the local, signed Coordinator proof
for the transport-adapter contract. For Iroh it defaults to `adapter:
iroh_v1`; unless a real multi-device run proves the network handshake, the
receipt keeps `physical_iroh_handshake` and `device_trust_acceptance` as
external pending work.
`NodeTrustDecision` records signed trust intent separately from physical trust
acceptance. A local `allow` decision stays `signed_pending_physical_acceptance`
until the target node proves device acceptance; deny and revoke decisions are
still signed, audited no-write records.

Every stable capability must expose remote classification metadata. A
`remote-safe` capability must have a route, owner, policy, and test. A
`local-only`, `blocked`, or `pending` capability must explain why. `pending` is
active closure work, not a hidden omission.

Sync resources use `SyncResourceManifest` with a driver, authority class,
owner node, residency, conflict policy, cache policy, allowed peers, routes,
and secret policy. Supported driver classes include skills, memory/user-model,
sessions, drive/files, blobs, SQLite full or partial resources, sidecars,
search indexes, agent config, and workspace state.
Client cache material is represented by `RemoteClientCacheSnapshot`: a signed,
encrypted, TTL-bound metadata record that stores content hashes only. It cannot
carry plaintext, secrets, or authoritative state.

Offline behavior is split by intent. Interactive remote commands fail fast
with `failed_fast`, `enqueued: false`, and `writes: false` when the Connector,
node, or transport is unavailable. Sync work may create no-write queue entries
from a plan: push/pull changes are `queued`, conflicts are `blocked`, and
reconciliation advances cursors only after acknowledged changes or explicitly
resolved conflicts.

Inter-mesh collaboration uses four explicit primitives: `MeshInvitation`,
`MeshInvitationAcceptance`, `MeshResourceShare`, and `MeshRevocation`.
Invitations scope allowed resources and actions before any share is created.
Acceptance records signed intent for the invited mesh but remains
`signed_pending_peer_trust` until physical peer trust is proven. Shares bind
one invitation to a Sync manifest and remain no-write/proposed until signed
Coordinator execution. Revocations cascade to Sync queue access and audit;
they do not silently leave old shares usable.

The governed multi-tenant agent service is also a Gateway contract, not a
hosted-only shortcut. `evaluateRemoteAgentServiceAccess` admits a service
request only when tenant, agent, assignment, route, budget, billing account,
isolation key, and audit requirement all match. Budget overruns, tenant
mismatch, inactive assignments, missing billing meters, or route drift deny the
request with `writes: false`.
`RemoteAgentServiceExecutionReceipt` is the signed local projection for
runtime and billing: it records the allowed decision, budget, billing meter,
isolation key, audit id, and explicit `agent_runtime_execution` /
`billing_meter_persistence` pending flags until a real signed-host run proves
execution and meter persistence.

Secrets never synchronize as plaintext. Remote and sync flows may carry secret
references and may request broker leases for a specific actor, action,
resource, route, and expiry. The audit event records the lease; the payload
does not return plaintext to the caller.
Provider-backed retrieval is a separate signed receipt. `RemoteSecretProviderReceipt`
binds the lease to a provider id, credential binding, operation id, actor, and
resource while keeping `plaintextReturned: false`. Without an approved live
provider run it remains `provider_secret_retrieval` external pending.

Remote access is fail-closed. A governed Gateway request is allowed only when
the requested capability is `remote-safe`, actor transport and trust mode match
the request, agent actors include an assignment, and every control plane has an
active allow grant: agent, assignment, execution profile, connector, host, run
scope, remote classification, and transport trust. Secret references add a
required broker-lease grant. Plaintext secret access is always denied, even
when other grants match. Every evaluation emits an audit decision with actor,
node, route, resource, action, trust mode, classification, and allow/deny
outcome.
`RemoteGatewayAuditReceipt` is the signed local host-audit bridge for those
decisions and Gateway runtime events. The receipt binds actor, route, resource,
action, allow/deny decision, and `hostAuditStore: signed_host_audit`. It remains
no-write and marks `signed_host_audit_persistence` as external pending until a
signed host audit store physically persists the event.

## Performance Impact

Remote gateway and sync work can consume network, disk, battery, CPU, retry queues, and long-running background resources. The redesign must therefore use explicit coordinators, gateway contracts, cache/authority manifests, backoff, secret-reference leases, and sync handoff receipts rather than implicit always-on mesh behavior. Live network and multi-device evidence are required before claiming production performance or reliability.

## Decision Tensions

- **Prioritized axes**: remote authority, sync integrity, provider portability, secret safety, and observable handoff.
- **Constrained axes**: peer-to-peer convenience and automatic background sync are constrained until authority, leases, and conflict behavior are explicit.
- **Tradeoffs accepted**: remote flows need more manifests, receipts, and conformance checks; this is accepted because silent remote drift can corrupt data or leak authority.
- **Debt or pending evidence**: live remote mesh, provider, device, and gateway conformance evidence remains external-pending where physical prerequisites are unavailable.

## Enforcement

The surface route graph must register:

- `claw.coordinator`
- `claw.gateway`
- `claw.connector`
- `claw.sync`
- `claw.transport.iroh`
- `claw.headlessHost`
- `claw.remoteCache`

The required routes are:

- `remote.chatGateway`
- `remote.searchGateway`
- `remote.secretBrokeredOperation`
- `sync.skills`
- `sync.memoryUserModel`
- `sync.sessions`
- `sync.driveFiles`
- `sync.blobs`
- `sync.searchIndex`
- `sync.sqliteResources`
- `sync.sidecars`
- `sync.agentConfig`
- `sync.workspaceState`
- `gateway.headlessAgentHost`
- `gateway.multiTenantAgentService`
- `mesh.resourceShare`

The public CLI exposes read-only, dry-run, and opt-in local durable ledger
entrypoints:

- `claw remote classify|check|routes|conformance`
- `claw remote compat`
- `claw sync manifest|status|plan|run|reconcile|apply|conflicts`
- `claw nodes list|pair|trust|revoke|invite|share|heartbeat`
- `claw gateway serve|project|conformance|audit`

Mutation commands such as node pairing, trust changes, gateway serving, and
real sync execution must remain dry-run or signed-host/Coordinator-gated until
their implementation can prove policy, audit, and rollback. `claw sync` and
`claw nodes` may persist local `--state-dir` ledger records for manifests,
no-write queue entries, acknowledgements, mesh proposals, and revocations; this
ledger is durable reconciliation state, not a trust mutation authority. When
Coordinator key files are supplied, the ledger stores Ed25519 signatures and
verification status for those records; unsigned records remain proposals only.
`claw remote classify --capability-id ... --record true` records signed
`RemoteSurfaceClassificationReceipt` evidence for each exposed capability. A
`remote-safe` state requires a route id, policy reference, and test evidence;
without all three, classification fails closed and no wider external surface is
accepted.
`RemoteExternalPendingRegister`, exposed by `claw remote pending` and
`/v1/remote/external-pending`, is the consolidated no-write audit register for
the remaining physical/provider/deployment checks. It keeps those dependencies
visible as `external_pending` instead of treating them as implementation bugs or
silently counting them as complete.
External validation is artifact-only clearable. `claw remote validation-report`
and `/v1/remote/external-validation-report` may count raw evidence rows for
reporting, but those rows remain non-clearable unless they are submitted inside
a source-bound and approval-request-bound
`RemoteExternalValidationEvidenceArtifact` with `approvedRunRef`, physical
evidence, accepted criteria, required artifacts, and no plaintext material.
The remote route contracts catalog, exposed by `claw remote contracts` and
`/v1/remote/route-contracts`, binds every required remote route to canonical
local contract references and remote entrypoints. Every row requires parity and
keeps `parallelApiAllowed: false`, so the Gateway projects local capabilities
instead of becoming a separate mobile/server API.
`SyncDriverApplicationReceipt` connects reconciliation to a concrete manifest
driver without making the driver implementation physical by default:
`claw sync apply --record true` records applied change ids, blocked conflicts,
actor, route, and driver, while `physical_sync_driver_application` remains
external pending until a signed host driver run proves the write.
`SyncAuthorityHandoffReceipt` connects resource authority and residency changes
to the same signed ledger: `claw sync handoff --record true` and
`/v1/sync/authority-handoffs` record source node, target node, requested
authority, requested residency, actor, and route ids while
`physical_authority_handoff` remains external pending until the physical
Coordinator/driver handoff is proven.
`claw gateway secret-lease` is the local broker operation for secret references:
it requires a signed Coordinator ledger, stores only the reference/actor/action
lease metadata, sets `plaintextReturned: false`, and refuses plaintext-return
flags.

## Consequences

Relay is no longer the architectural bucket for every network concern. It is
kept as a compatibility deployment and transport-facing service while the
canonical architecture moves to Coordinator, Gateway, Connector, and Sync.
`RemoteCompatibilityAdapterReceipt` is the signed local projection for that
migration: each Relay/mobile legacy surface maps to one canonical route, keeps
`parallelApiIntroduced: false`, and remains a no-write audited adapter record
rather than a new business API.

Hosted service deployments and self-hosted deployments are peers. A hosted
deployment cannot expose capabilities that are absent from self-hosted
conformance unless the gap is explicitly blocked and documented.
`GatewayDeploymentManifest` is the signed local projection for those
deployments. `claw gateway serve --record true` and `claw gateway project
--record true` record the same contract route set and `hostedSelfHostedParity:
true`; they remain `external_pending` until a real self-hosted process or
hosted rollout is physically validated.

The provider/device E2E topology target list is intentionally broader than
platform names: it includes `personal_mesh` and `server_host` alongside
Mac/Linux/Windows hosts, headless server, VPS, mobile/browser clients,
self-hosted Gateway, and hosted Gateway so the personal-device and server
requirements cannot collapse back into a single desktop-plus-mobile lane.

Goal completion for the source conversation requires a decision-by-decision
review against the source session before the goal can be marked complete.
