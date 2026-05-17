---
title: "ADR 0022: Remote Gateway and Sync Redesign"
description: "Coordinator, Gateway, Connector, Sync, Iroh adapter, remote parity, headless hosts, and multi-node synchronization."
---

# ADR 0022: Remote Gateway and Sync Redesign

Status: Accepted

Date: 2026-05-17

Source conversation: `019e36a3-c2e6-73b3-a3fe-f3e7340e42c8`

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
- Assign sync authority per resource.
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

Every stable capability must expose remote classification metadata. A
`remote-safe` capability must have a route, owner, policy, and test. A
`local-only`, `blocked`, or `pending` capability must explain why. `pending` is
active closure work, not a hidden omission.

Sync resources use `SyncResourceManifest` with a driver, authority class,
owner node, residency, conflict policy, cache policy, allowed peers, routes,
and secret policy. Supported driver classes include skills, memory/user-model,
sessions, drive/files, blobs, SQLite full or partial resources, sidecars,
search indexes, agent config, and workspace state.

Secrets never synchronize as plaintext. Remote and sync flows may carry secret
references and may request broker leases for a specific actor, action,
resource, route, and expiry. The audit event records the lease; the payload
does not return plaintext to the caller.

Remote access is fail-closed. A governed Gateway request is allowed only when
the requested capability is `remote-safe`, actor transport and trust mode match
the request, agent actors include an assignment, and every control plane has an
active allow grant: agent, assignment, execution profile, connector, host, run
scope, remote classification, and transport trust. Secret references add a
required broker-lease grant. Plaintext secret access is always denied, even
when other grants match. Every evaluation emits an audit decision with actor,
node, route, resource, action, trust mode, classification, and allow/deny
outcome.

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
- `sync.driveFiles`
- `sync.sqliteResources`
- `gateway.headlessAgentHost`
- `gateway.multiTenantAgentService`
- `mesh.resourceShare`

The public CLI exposes read-only and dry-run entrypoints:

- `claw remote classify|check|routes|conformance`
- `claw sync manifest|status|plan|run|conflicts`
- `claw nodes list|pair|trust|revoke|heartbeat`
- `claw gateway serve|project|conformance`

Mutation commands such as node pairing, trust changes, gateway serving, and
real sync execution must remain dry-run or signed-host/Coordinator-gated until
their implementation can prove policy, audit, and rollback.

## Consequences

Relay is no longer the architectural bucket for every network concern. It is
kept as a compatibility deployment and transport-facing service while the
canonical architecture moves to Coordinator, Gateway, Connector, and Sync.

Hosted service deployments and self-hosted deployments are peers. A hosted
deployment cannot expose capabilities that are absent from self-hosted
conformance unless the gap is explicitly blocked and documented.

Goal completion for the source conversation requires a decision-by-decision
review against the source session before the goal can be marked complete.
