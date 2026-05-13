# ClawJS, Claw.app, and Clawix ownership

This document defines the public ownership rule for the ClawJS/Clawix refactor.
The executable source of truth is `clawDomainOwnershipMatrixV1` in
`packages/clawjs-core/src/domain-ownership.ts`; this page explains the rule in
human terms.

## Roles

ClawJS is the framework. It owns public contracts, schemas, domain APIs,
storage resolution, CLI behavior, fixtures, and any capability that another app
could reasonably call through `claw`.

`claw` is the single public CLI. The legacy `clawjs` alias remains only as a
deprecated compatibility entrypoint and must warn users to switch to `claw`.

`Claw.app` is the standalone macOS host for the framework. It owns native
permission prompts, launch agents, Mach services, host audit logs, grants,
approvals, and native adapters when running under the Claw identity.

Clawix is an embedded host and human UI. It owns layout, sidebars, selections,
visual pins and filters, shortcuts, overlays, previews, WebView/terminal UI, and
interface settings. For migrated domains, Clawix must not keep a second
canonical store.

## Storage

Framework global data lives in:

```text
~/Library/Application Support/Claw
```

Workspace data lives in:

```text
.claw/
```

Host-local state lives in:

```text
~/Library/Application Support/<Host>
```

`.clawjs` is legacy-only. New canonical writes must use `.claw`.

## Host Boundary

Sensitive actions never request macOS permissions from Node. The active signed
host performs those actions:

- `Claw.app` when using the standalone framework host.
- Clawix when using the embedded Clawix host.

The transport contract is the v1 host command contract. XPC is the final macOS
transport. Unix socket and HTTP transports are allowed for development, tests,
and fallback behavior.

## Codex Source Safety

Codex is an external read-only source by default. `~/.codex` may be read,
mirrored, or indexed. It must not be deleted, moved, overwritten, recursively
chmodded, or used as a write target. `AGENTS.md` writes require an explicit,
brokered, reversible opt-in.

## Acceptance Per Domain

A domain is done only when all of these are true:

- It works through `claw` plus `Claw.app`.
- It works inside Clawix through embedded `ClawHostKit`.
- It uses the same v1 contracts and fixtures.
- Grants and audit logs are host-specific.
- Clawix has no duplicated canonical store for that domain.
- Any sensitive permission path has real signed-host validation; dry-run counts
  only as partial validation.
