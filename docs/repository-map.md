---
title: Repository Map
description: Folder ownership and public layout rules for the ClawJS Agent OS repository.
---

# Repository Map

ClawJS is organized so the repository root reads as a local-first Agent OS, not
as a catalogue of personal verticals. Root folders are reserved for horizontal
systems, public repo infrastructure, and surfaces that help builders understand
the platform quickly.

## Root-Level Systems

| Folder | Role |
| --- | --- |
| `agents/` | Agent-facing operating notes and wiki pages. |
| `apps/` | Human-facing apps and host surfaces. |
| `assets/` | Shared brand, icon, font, sponsor, and runtime image assets. |
| `audio/` | Audio service, transcript catalog, blob storage, and voice service. |
| `bridge/` | Local bridge service for host/runtime integration. |
| `browser/` | Browser host and shared browser primitives. |
| `content/` | Content authoring and publishing control plane. |
| `database/` | Namespace database service with schema, records, files, auth, and realtime. |
| `delegation/` | Durable async agent delegation control plane. |
| `docs/` | Canonical Markdown documentation, VitePress source, the [Decision Map](./decision-map.md), and the [Domain Surface Decision Matrix](./domain-surface-decision-matrix.md). |
| `drive/` | Local-first drive and file collaboration service. |
| `examples/` | Demos, mocks, fixtures, and starter showcases. |
| `execution/` | Agent-authored code execution, workers, runs, artifacts, and deployment flow. |
| `integrations/` | Provider and channel services such as Slack, Telegram, email, and webhooks. |
| `iot/` | Local-first IoT control plane. |
| `memory/` | Typed local memory CLI and service surface. |
| `mcp/` | MCP service surface. |
| `modules/` | Agent-facing domain manifests. Conceptual signal verticals contain `module.json`; only registry-approved runtime modules keep package/server/CLI code. |
| `monitor/` | Health, uptime, runtime, and lightweight monitoring surface. |
| `notify/` | Notification delivery service. |
| `packages/` | Published npm packages, scaffolds, and shared package tooling. |
| `publishing/` | Publication workflow service. |
| `relay/` | Public HTTPS relay and reverse connector layer. |
| `runtime/` | Runtime service loops and runtime-adjacent backend behavior. |
| `scripts/` | Repository automation, checks, and smoke helpers. |
| `secrets/` | Vault and secret broker. |
| `sessions/` | Session mirror, import, search, and service state. |
| `skills/` | Built-in design and generation skills. |
| `storage/` | Storage UI/runtime support. |
| `tests/` | Repository-level test suites, including E2E and type tests. |
| `time/` | Calendar, routines, reminders, deadlines, watches, and timelines. |
| `website/` | Docs-site runtime wrapper for preview and production builds. |
| `wiki/` | Local-first wiki service. |

## Grouping Rules

- Keep root-visible folders horizontal. A root folder should be useful across
  many agent apps or explain a major Agent OS subsystem.
- Put personal or domain-specific conceptual surfaces under `modules/` as
  manifest folders, including health, finance, career, dating, hydration, pets,
  habits, relationships, dreams, emotions, workouts, writing, and similar
  verticals. A conceptual module folder must not contain `package.json`,
  `src/bin`, or service tests unless the domain surface registry marks it as a
  runtime module.
- Treat `packages/`, service folders, and runtime modules as separate ownership
  layers from `modules/`. The database-to-CLI route is recorded in
  `packages/clawjs-core/src/domain-surface-registry.ts`, and guarded by
  `scripts/domain-surface-registry-guard.mjs`.
- Put provider and channel services under `integrations/`, including Slack,
  Discord, Telegram, WhatsApp, SMS, email, Teams, Matrix, Signal, iMessage, and
  webhooks.
- Put demos, mocks, fixtures, and starter showcases under `examples/`.
- Keep published npm packages and scaffold packages under `packages/`; package
  names and public import paths are not tied to root-folder names.

## Naming Rules

- Prefer short serious names at root: `execution/`, `delegation/`,
  `publishing/`, and `assets/`.
- Avoid codenames in root when a descriptive system name is clearer.
- Avoid exposing personal verticals in root even when they are maintained
  packages; they are capability packs, not the repository's first impression.

## Current Migration Notes

The current layout intentionally replaces older root names:

- `execution-plane/` became `execution/`.
- The old delegation plane area is retired; queue/runtime work uses `jobs`,
  and agent assignment remains `delegation`.
- The old social publishing workspace became `publishing/`.
- `public/` became `assets/`.
- `demo/` and `mock/` moved under `examples/`.

Historical docs may mention old names only when describing migration history.
New scripts, docs, tests, and examples should use the current layout.

For architecture, storage, validation, release, privacy, and naming decisions,
use the [Decision Map](./decision-map.md) to find the canonical document and
protecting check.

For the DB-to-CLI domain route, use
[ADR 0012](./adr/0012-domain-surface-registry-db-to-cli.md) and the
[Domain Surface Decision Matrix](./domain-surface-decision-matrix.md).
