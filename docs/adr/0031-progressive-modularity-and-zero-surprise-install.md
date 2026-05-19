# ADR 0031: Progressive modularity and zero-surprise install

## Status

Accepted.

## Context

Claw is intentionally broad: it contains local data, host integration, runtime
surfaces, search, media, voice, connectors, sync, developer tooling, and many
domain catalogs. Breadth is useful only if a narrow user can still install and
use the framework for one small job without being surprised by unrelated
storage, permissions, background processes, downloads, apps, or niche domains.

The motivating baseline is a user who wants only to store tasks. That user
should not see ERP, medical, pharma, lab, legal, construction, audio,
transcription, host launchers, model downloads, external connectors, or native
permission prompts unless they ask for those capabilities.

## Decision

- The base `claw` CLI is a zero-surprise entrypoint. Installation and safe
  commands do not open apps, start hosts or daemons, request OS permissions,
  download models/browsers/assets, call network/provider APIs, or activate
  niche domains.
- Configuration has two independent axes:
  - **Capabilities**: technical/system capabilities such as local data,
    search, host, OS permissions, audio/voice, agents/runtime, integrations,
    sync/remote, and developer tools.
  - **Areas**: human/data domains such as tasks, notes, projects, people,
    habits, finance, documents, CRM, ERP, health, legal, labs/pharma,
    construction, and IoT.
- The supported intensity modes are `minimal`, `normal`, and `advanced`.
  `advanced` replaces the ambiguous idea of "complete": it enables more
  general system/API/diagnostic/developer/runtime surface on demand, but does
  not activate every domain.
- Setup presets are reviewable templates. Setup shows a preview before applying
  and lets the user adjust capabilities and areas.
- Modules have separate states instead of one boolean: `available`, `visible`,
  `enabled`, `configured`, `running`, and `permissioned`.
- `enable` means configuration, visibility, or command exposure. `install`
  means adding optional packages, assets, models, browsers, or other heavy
  materials.
- Niche domains ship only as lightweight discoverable catalog metadata in the
  base CLI. Implementation, heavy fixtures, deep commands, connectors, and
  optional dependencies belong in installable packs or explicitly loaded
  modules.
- Cheap schema/catalog definitions may exist without prompting the user.
  User-facing list/UI defaults show active, used, or enabled areas. Full
  catalogs are available only through explicit search, setup detail views, or
  `--available` style discovery.
- Compatible migrations for already active modules may run automatically.
  Risky migrations explain and stop until the user chooses an explicit
  migration flow.

## Consequences

- `@clawjs/cli` must remain thin. It must not use install lifecycle hooks and
  must not depend directly on heavy optional capabilities.
- Host, permissions, processes, launchers, audio/TTS/STT, browsers, models,
  network connectors, provider APIs, sync/remote, and other surprising
  capabilities are activated only by explicit user action.
- `claw setup` and `claw modules` are the canonical surfaces for mode and
  module configuration.
- `claw setup --interactive` provides the terminal configurator: it asks for a
  preset, module adjustments, and explicit confirmation before writing.
- `claw setup --details` exposes a reviewable detail menu split by capacidades
  and areas; `--enable` and `--disable` adjust the preview before confirmation.
- Deep niche domain commands are loaded on demand and are not part of the base
  CLI package path. If a domain is enabled but its optional pack is absent, the
  command stops with explicit install guidance instead of downloading or
  starting anything implicitly. The dense domain V1 pack is
  `@clawjs/domain-pack-dense-data`.
- CI and non-interactive invocations default to `minimal`.
- A safe direct command such as `claw tasks create` may run with minimal
  compatible defaults and suggest `claw setup` without blocking.
- Guardrails must prevent regressions in package hooks, base CLI dependencies,
  top-level heavy imports on safe command paths, and default visibility of
  niche domains.
