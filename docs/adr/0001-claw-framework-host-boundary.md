# ADR 0001: Claw framework and host boundary

Status: Accepted

Date: 2026-05-13

## Context

Clawix started with application-local logic that now belongs in the reusable
framework. The target architecture is a framework that other applications can
call through a stable CLI, plus signed hosts that own native permissions and
human approvals. macOS permission prompts must come from the signed host
identity, never from Node.

## Decision

- ClawJS/Claw is the framework and owns contracts, schemas, fixtures, storage
  resolution, domain APIs, and the public command surface.
- `claw` is the single public CLI.
- `Claw.app` is the standalone signed macOS host.
- `ClawHostKit` is the embeddable host runtime used by Clawix and future hosts.
- Clawix embeds `ClawHostKit` and remains the human UI plus Clawix-signed host.
- A per-user host registry records available hosts and the active host.
- Framework global data lives in `~/.claw`.
- The framework main database is `~/.claw/data/core.sqlite`.
- Canonical workspace data lives in `.claw/`.
- Host-local data lives in `~/Library/Application Support/<Host>`.
- `.clawjs` is a retired pre-public path.
- User-facing structured records converge into the main database instead of
  per-domain files such as `productivity.sqlite`; service sidecars are reserved
  for runtime, sessions, audio, drive/blob, search, notification, monitor,
  infra, ops, feed, and encrypted vault state.
- Plaintext secrets never live in the main database; records use opaque secret
  references.
- Sensitive permissions, approvals, grants, audit logs, LaunchAgents, Mach
  services, and native execution belong to the active signed host.
- Node code must not request macOS permissions directly.
- Codex data under `~/.codex` is an external read-only source. Mirroring and
  indexing are allowed; destructive migration, moves, rewrites, or broad chmods
  are not.
- `AGENTS.md` writes into Codex-owned sources require explicit, reversible,
  brokered opt-in.

## Performance Impact

This boundary keeps runtime cost bounded by preventing each host from growing a separate framework implementation, store, permission path, or native execution layer. It does add host-registry and bridge coordination work, but the expected steady-state cost is small metadata reads plus explicit host activation rather than always-on duplicate services. Performance evidence remains tied to the launcher, bridge, storage, and signed-host lanes that implement this boundary.

## Decision Tensions

- **Prioritized axes**: ownership and boundaries, sovereignty/security, data placement, public/private hygiene, and long-term semantic coherence.
- **Constrained axes**: short-term implementation speed and app-local convenience are limited so framework contracts and signed-host authority do not fork.
- **Tradeoffs accepted**: migrations and host integration become more explicit, and simple app features may need framework work first; that is acceptable to avoid duplicated stores, permission prompts, and incompatible APIs.
- **Debt or pending evidence**: existing app-local behavior must continue to be migrated through registered framework/host surfaces and validated with signed-host evidence where native permissions are involved.

## Consequences

Every migrated domain must work through both `claw` + `Claw.app` and Clawix +
embedded `ClawHostKit`. Clawix must remove duplicated canonical stores for
migrated domains and keep only UI projections, visual state, and host-specific
approvals. Public docs and templates must describe `Claw.app`, `ClawHostKit`,
and `claw`; legacy `commander`, `clawix`, or `.clawjs` references must be
clearly marked as retired pre-public content unless a later ADR grants a
bounded compatibility exception.
