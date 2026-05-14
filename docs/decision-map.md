---
title: Decision Map
description: Canonical architecture, naming, storage, validation, and release decisions with their protecting checks.
---

# Decision Map

This map tells contributors and agents where durable ClawJS/Clawix decisions
live and which check or review step protects them. It is an index, not a second
source of truth: update the canonical document first, then update this map.
The contract format is decision -> document -> validation.

## Architecture and ownership

| Decision | Canonical document | Guardrail or validation |
| --- | --- | --- |
| ClawJS/Claw owns framework contracts, v1 schemas, fixtures, storage resolution, domain APIs, command routing, and the public `claw` CLI. | [Host Ownership](./host-ownership.md), [ADR 0001: framework and host boundary](./adr/0001-claw-framework-host-boundary.md), `packages/clawjs-core/src/domain-ownership.ts` | `npm run test:docs` runs `scripts/docs-alignment-check.mjs`; `scripts/naming-surface-guard.mjs` blocks stale public CLI and storage surfaces. |
| `claw` is the only public CLI; public `clawjs`, `clawix`, and legacy command names are not new framework surfaces. | [Naming Style Guide](./naming-style-guide.md), [ADR 0001: naming and stability surfaces](./adr/0001-naming-and-stability-surfaces.md), [CLI](./cli.md) | `scripts/naming-surface-guard.mjs` verifies `packages/clawjs/package.json` exposes exactly the `claw` bin and blocks retired names. |
| `Claw.app` is the standalone signed macOS host; Clawix is a human interface and embedded signed host through `ClawHostKit`. | [Host Ownership](./host-ownership.md), [ADR 0001: framework and host boundary](./adr/0001-claw-framework-host-boundary.md) | `scripts/docs-alignment-check.mjs` requires `Claw.app`, `ClawHostKit`, and ownership language in the canonical docs. |
| Sensitive native permissions, approvals, destructive grants, cost-bearing decisions, native secrets, and host audit logs belong to the active signed host, not Node. | [Host Ownership](./host-ownership.md), [ADR 0001: framework and host boundary](./adr/0001-claw-framework-host-boundary.md) | Review sensitive paths with signed-host validation. Dry-run validation counts only as partial validation for native permission behavior. |
| Secrets use a hostile-local-process threat model: humans reveal through the signed host, while agents, connectors, plugins, automation, SDKs, and CLI use references and brokered actions without plaintext values. | [Secrets Security Model](./secrets-security.md), [Secrets](./secrets.md), [Host Ownership](./host-ownership.md) | Review secret-related changes against the checklist in `docs/secrets-security.md`. Future guardrails must block generic reveal, missing-context allow, and direct connector plaintext resolution. |

## Storage and data placement

| Decision | Canonical document | Guardrail or validation |
| --- | --- | --- |
| Framework global data, framework databases, workspace files, host state, and GUI-only app state have separate roots. | [Data Storage Boundary](./data-storage-boundary.md), [Host Ownership](./host-ownership.md), `packages/clawjs-core/src/storage.ts` | `scripts/docs-alignment-check.mjs` and `scripts/naming-surface-guard.mjs` require current roots and block stale pre-refactor roots. |
| Durable paths, databases, sidecars, host operational paths, legacy read-only paths, external read-only sources, and future preference/table/field surfaces are registered through typed builders and inspected through `claw inspect`. | [ADR 0004: persistent surface registry and inspection](./adr/0004-persistent-surface-registry-and-inspection.md), [Persistent Surface](./persistent-surface.md), `packages/clawjs-core/src/surface-registry.ts` | Core tests cover registry lookup/tree behavior; CLI tests cover `claw inspect tree`, `show`, and generated Markdown/Mermaid output. Future strict enforcement must block unregistered durable names. |
| New workspace-local framework writes use `.claw/`; `.clawjs/` is retired pre-public compatibility. | [Workspace](./workspace.md), [Data Storage Boundary](./data-storage-boundary.md), [Naming Style Guide](./naming-style-guide.md) | `scripts/naming-surface-guard.mjs` blocks retired `.clawjs` workspace paths in docs and selected canonical sources. |
| User-facing structured records belong in `core.sqlite`; high-churn runtime/search/blob state uses sidecars; plaintext secrets never live in the main database. | [Data Storage Boundary](./data-storage-boundary.md), [Database](./database.md), [Secrets](./secrets.md), [Secrets Security Model](./secrets-security.md) | `scripts/docs-alignment-check.mjs` requires `core.sqlite`, sidecar names, and plaintext secret language. Service tests cover storage behavior for individual packages. |
| Codex data under `~/.codex` is an external read-only source by default. | [Host Ownership](./host-ownership.md), [ADR 0001: framework and host boundary](./adr/0001-claw-framework-host-boundary.md) | Review integrations for read/mirror/index behavior only. Writes into Codex-owned sources require an explicit reversible opt-in outside ordinary framework code. |

## Runtime, bridge, and validation

| Decision | Canonical document | Guardrail or validation |
| --- | --- | --- |
| Runtime, host, and bridge contracts are framework-owned and consumed by hosts rather than duplicated in UI clients. | [Runtime](./runtime.md), [Execution](./execution.md), [Host Ownership](./host-ownership.md), [Interface Matrix](./interface-matrix.md) | `npm run test:docs` checks public surface docs against `surface-contract.json`; package tests cover contract fixtures and exports. |
| Host-dependent bugs require host-equivalent validation when feasible, not only hermetic tests. | Root `AGENTS.md`, [Diagnostics](./diagnostics.md), root `tests/e2e/README.md` | Final reports must distinguish real host validation from hermetic fixture validation. `CLAW_E2E` fixture paths are not proof of host behavior by themselves. |
| Tests and examples must not send operative prompts, mutate production data, touch real services, or consume paid APIs unless explicitly approved. | Root `CLAUDE.md`, root `AGENTS.md`, [Getting Started](./getting-started.md), [Content](./content.md) | Use fixtures, mocks, local services, and dry-run paths. Mark unavailable real integrations as external validation pending. |
| Public API, SDK, CLI, and Relay surfaces stay aligned. | [Interface Matrix](./interface-matrix.md), [Public Surface](./surface.md), `docs/surface-contract.json` | `npm run test:docs` runs `scripts/docs-surface-check.mjs` and `scripts/docs-alignment-check.mjs`. |

## Source file boundaries

| Decision | Canonical document | Guardrail or validation |
| --- | --- | --- |
| Hand-authored source files stay responsibility-scoped; new 1200+ line files require a split plan or baseline exception, and 2000+ line files must not grow except for extraction or explicit architecture approval. | [ADR 0003: source file boundaries](./adr/0003-source-file-boundaries.md), `docs/source-size-baseline.json` | `npm run test:docs` runs `scripts/source-size-check.mjs`; it warns at 800 lines, fails unbaselined 1200+ line files, and blocks growth above the recorded baseline. |

## Naming, release, privacy, and commits

| Decision | Canonical document | Guardrail or validation |
| --- | --- | --- |
| Public and persistent names follow the naming ADR: contract fields use `camelCase`, CLI flags use `kebab-case`, SQL and collections use `snake_case`, and events use `domain.action`. | [Naming Style Guide](./naming-style-guide.md), [ADR 0001: naming and stability surfaces](./adr/0001-naming-and-stability-surfaces.md) | `scripts/naming-surface-guard.mjs` freezes required snippets, blocked names, CLI bin exposure, package scope, schema IDs, ports, and storage names. |
| Public repositories contain only safe placeholders and no secrets, signing identities, private paths, release credentials, or maintainer-specific configuration. | Root `AGENTS.md`, root `SECURITY.md`, [Host Ownership](./host-ownership.md) | `npm run privacy:check` and package smoke tests are part of `npm run ci`. Review generated artifacts before publishing or packing. |
| Changesets are release metadata for public package behavior, not standalone work units. | Root `AGENTS.md`, [Git Workflow](./git-workflow.md), root `RELEASING.md` | PR review requires changesets with public package behavior changes and keeps them with the functional change they document. |
| Publishing, release tags, uploads, and real package publication are explicit release actions, never ordinary validation side effects. | Root `RELEASING.md`, [Git Workflow](./git-workflow.md), root `package.json` | `npm run publish:dry-run` is the pre-publish check. Real `release:publish`, tags, and uploads require explicit release approval. |

## Known pending guardrails

- PENDING GUARDRAIL: extend source scanning beyond selected canonical files to
  catch new `.clawjs/` writes anywhere in implementation code.
- PENDING GUARDRAIL: add a host-contract check that proves sensitive native
  permission requests cannot be executed directly from Node-only code.
- PENDING GUARDRAIL: add an automated docs link check for this map and the ADRs
  in the rendered website build.
