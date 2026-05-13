# AGENTS.md

Instructions for humans and coding agents working in this repository.

## Constitution (read this first)

This project is governed by `CONSTITUTION.md` at the repository root. It defines mission, principles, red lines, and canonical vocabulary for ClawJS and the sister Clawix interface. When this file and the constitution disagree, the constitution wins. Any contributor or agent making non-trivial decisions about architecture, data, agents, UX, or integrations must have read it and apply it. The constitution file is identical to the one in the Clawix repository; keep them in sync when updating.

`STYLE.md` is the companion visual-language source for Clawix and ClawJS UI decisions. Read it before changing user-facing screens, chrome, visual components, or design tokens, and keep it aligned with the sister Clawix repository when updating shared product style.

## Purpose

- Treat this file as the operational entrypoint for the repo.
- Treat `AGENTS.md` as the canonical repository instruction file. If a tool such as Claude Code looks for `CLAUDE.md`, that file must redirect back here and remain aligned with this file.
- Treat `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `RELEASING.md`, `docs/git-workflow.md`, `docs/host-ownership.md`, `docs/data-storage-boundary.md`, `docs/naming-style-guide.md`, `docs/adr/0001-claw-framework-host-boundary.md`, `docs/adr/0001-naming-and-stability-surfaces.md`, and `tests/e2e/README.md` as source-of-truth references for deeper detail.
- Before changing framework, host, storage, CLI, Clawix integration, permissions, grants, approvals, audit, data placement, naming style, public packages, routes, ports, domains, protocols, or domain ownership, read `docs/host-ownership.md`, `docs/data-storage-boundary.md`, `docs/naming-style-guide.md`, and the ADRs.
- For agent-specific operational knowledge, review `agents/wiki/README.md` and the relevant pages under `agents/wiki/` before changing behavior or debugging repeated issues.
- For host-dependent OpenClaw work, read `agents/wiki/openclaw.md` before changing runtime detection, installation, auth, or onboarding flows.
- If a change affects public behavior, docs, examples, templates, or package surface, update the relevant docs and tests in the same patch.

## Repository Shape

This is a Node.js monorepo for ClawJS, a local-first Agent OS with an SDK,
CLI, runtime adapters, workspace tooling, horizontal services, capability
modules, examples, and a docs website.

Important top-level areas:

- `packages/`: published packages and scaffolding tools.
- `runtime/`, `relay/`, `database/`, `bridge/`, `browser/`, `storage/`,
  `sessions/`, `memory/`, `secrets/`, `audio/`, `time/`, `notify/`, `drive/`,
  `content/`, `iot/`, `wiki/`, `execution/`, `delegation/`, `publishing/`,
  `mcp/`, and `monitor/`: horizontal Agent OS systems.
- `modules/`: optional domain capability packs. Do not put personal or
  domain-specific verticals back in the repository root.
- `integrations/`: provider and channel services such as Slack, Telegram,
  email, Teams, WhatsApp, SMS, and webhooks.
- `examples/demo/`: Next.js demo app used by the browser E2E suite.
- `examples/mock/`: local mock helpers for demo workflows.
- `assets/`: shared brand assets and shared UI fonts for internal dashboards
  and operational web UIs.
- `website/`: docs-site runtime wrapper for local preview and production builds.
- `docs/`: the single Markdown source for product, reference, and workflow documentation.
- `tests/e2e/`: canonical Playwright end-to-end suite.
- `scripts/`: repo automation such as docs and packaging checks.

Key published packages:

- `@clawjs/claw`: official SDK.
- `@clawjs/cli`: official CLI.
- `@clawjs/core`: shared contracts and schemas.
- `@clawjs/workspace`: local-first workspace layer.
- `@clawjs/node`: compatibility wrapper.
- `@clawjs/openclaw-plugin` and `@clawjs/openclaw-context-engine`: OpenClaw runtime packages.
- `create-claw-app`, `create-claw-agent`, `create-claw-server`, `create-claw-plugin`: scaffolding packages.
- `eslint-config-claw`: shared ESLint preset.

## Environment And Setup

- Use Node.js `20` or `22`. The root `package.json` requires Node `>=20`.
- Use the root workspace as the command entrypoint unless a task clearly belongs inside `examples/demo/` or `website/`.
- The repo is validated locally with `npm`. Do not add GitHub Actions workflows or other automatic GitHub checks unless the maintainer explicitly reverses that policy.

Bootstrap the full repository:

```bash
npm ci
npm --prefix examples/demo ci
npm --prefix website ci
npx playwright install --with-deps chromium
```

Useful root commands:

```bash
npm test
npm run test:types
npm run test:ts
npm run build
npm run test:docs
npm run test:pack
npm run test:e2e
npm run test:e2e:ci
npm run ci
```

Useful focused commands:

```bash
npm run demo
npm run demo:mock
npm --prefix examples/demo run test
npm --prefix website run build
```

## Testing And Quality Gates

- Do not merge changes that leave `npm test`, `npm run test:types`, `npm run test:ts`, `npm run build`, `npm run test:docs`, `npm run test:pack`, or `npm run test:e2e:ci` failing.
- `npm run ci` is the release gate. If you are preparing a release or changing packaging, run it.
- Treat docs, templates, examples, and website output as product surface. Regressions there count as real regressions.
- Prefer additive, well-scoped patches. Expand existing tests instead of creating parallel ad hoc validation paths.

For E2E work:

- The canonical browser suite lives in `tests/e2e/` and uses Playwright.
- The blocking suite is hermetic and runs the demo against `next start`, not `next dev`.
- If a change touches visible UI in the demo, add or update Playwright coverage and follow the artifact guidance in `tests/e2e/README.md`.
- Reuse `tests/e2e/fixtures.ts` so console errors, page errors, failed requests, and unexpected `4xx` or `5xx` responses stay gated.
- If a scenario depends on runtime or external services, add or extend hermetic fixture logic in `examples/demo/src/lib/e2e.ts` and the relevant test-only API routes.

Validation fidelity rules:

- Hermetic Playwright coverage is required, but it is not sufficient for host-dependent bugs.
- Host-dependent bugs include installation or uninstall flows, OAuth and login flows, PATH or binary resolution, filesystem state under the user home, local process management, SDK or CLI detection, and polling or UI state driven by the local runtime.
- If the user reports a bug on a specific localhost mode such as `localhost:4300`, the fix must also be validated in that same mode before closing the task.
- Do not claim a host-dependent bug is fixed if only the hermetic E2E passed. Treat that as partial validation until the real localhost or host-equivalent validation also passes.
- If fixtures, interceptors, or `CLAWJS_E2E` short-circuit the real runtime behavior, that only validates the UI flow. It does not prove the real bug is fixed.
- Final screenshots for host-dependent fixes must come from the same mode that was actually validated, not only from the hermetic test server.

Never run real smoke coverage automatically:

- `npm run test:e2e:smoke-real` is manual and opt-in only.
- Do not point smoke tests at production by default.
- Do not touch paid APIs, real user data, or production services without explicit user approval in the current thread.

Prompt-based test safety:

- When a test evaluates an AI prompt or asks a model to do something, keep the prompt non-operative by default. Ask for bounded informational or text-only output, not host actions.
- Do not use prompts that imply inspecting the local machine, reading workspace files, executing commands, editing configuration, deleting data, or exploring the environment unless the test is explicitly about that capability and runs inside an isolated, approved harness.

## Branches, Commits, And Pull Requests

Long-lived branches:

- `main`: always releasable. Normal source for releases.
- `next`: integration branch for work ready for broader validation.
- `release/0.x`: stabilization or hotfix branch for the supported `0.x` line.

Create short-lived branches from the branch you intend to merge into:

- `feat/<scope>`
- `fix/<scope>`
- `docs/<scope>`
- `chore/<scope>`
- `refactor/<scope>`

Commit message format is mandatory:

```text
type(scope): description
```

Examples:

- `feat(cli): add workspace inspect output`
- `fix(e2e): stabilize demo settings reset flow`
- `docs(repo): document release branch policy`

Pull request rules:

- Keep PRs scoped and reviewable.
- Target `main` for releasable work, `next` for queued integration work, and `release/*` only for stabilization or hotfixes.
- Prefer squash merges.
- Treat `main`, `next`, and `release/*` as protected branches.
- Run the relevant local validation before merge. GitHub must not run automatic CI or release checks for this repo.
- If a PR changes a published package, generated template output, or public package surface, add a `.changeset/*.md` entry unless the change is docs-only, test-only, or internal-only.
- Commit related changesets with the behavior they document. Do not split a `.changeset/*.md` file into a standalone commit merely because it is a changeset; split it only when it documents a distinct independently reviewable change, or when the related code/docs commit was already created by another process and the changeset is the only remaining pending artifact.
- If a PR changes onboarding, installation, imports, CLI usage, support tiers, docs, or templates, update the related documentation in the same PR.
- Keep release-prep changes explicit: changelog, docs, versioning, packaging, and validation should land together.

## Release Notes

- Published npm packages are versioned with Changesets in one shared lockstep version.
- Do not hand-edit versions in published package manifests outside the release workflow.
- Release PRs are generated from `.changeset/*.md` entries and must be merged into `main` before publishing `latest`.
- Use prereleases from `next` with the npm dist-tag `next` only when you intentionally want a preview channel.
- Do not publish if `npm run ci` fails.
- Before release, run `npm run publish:dry-run`.
- Create release tags as `v<semver>`.
- Tag normal releases from `main`.
- Tag patch-only emergency releases from `release/0.x` when you must avoid pulling in all queued `next` work.

## Security And Secret Handling

- Never commit plaintext credentials, API keys, or `.env` files with real secrets.
- Prefer provider login flows, environment injection, or external secret stores over hardcoded credentials.
- For any real secret access, use secure secret storage and avoid reading or printing raw secret values.
- Do not log or print raw credentials. ClawJS masks some common secret fields, but callers still must avoid exposing secrets.
- Do not open public issues for vulnerabilities that could expose credentials, workspace contents, or remote execution paths. Report them privately to maintainers first.
- New framework workspace audit logs live under `.claw/audit/`; `.clawjs/audit/` is legacy compatibility only. If you change audit or logging behavior, review redaction and retention expectations.

## Product And API Expectations

- `@clawjs/claw` is the official SDK package.
- `@clawjs/node` is a compatibility wrapper, not the primary surface.
- `@clawjs/cli` is the official CLI package.
- `claw` is the single public CLI surface. Do not introduce new public `clawjs`, `clawix`, or `commander` command surfaces; legacy commands must be labelled compatibility-only.
- Framework global data belongs under `~/.claw/`, canonical workspace data under `.claw/`, and Clawix host-operational state under `~/.clawix/`. Host GUI-only state may use platform-native app data when it is not framework state.
- User-facing structured framework records belong in `~/.claw/data/core.sqlite`. Do not introduce new canonical workspace databases like `productivity.sqlite`; use documented sidecars only for runtime, sessions, audio, drive/blob, search, notify, monitor, feed, and encrypted vault state.
- Public and persistent naming must follow `docs/naming-style-guide.md` and `docs/adr/0001-naming-and-stability-surfaces.md`: JSON/API fields use `camelCase`, CLI flags use `kebab-case`, SQL and collections use `snake_case`, event names use `domain.action`, public package names use `@clawjs/<name>`, and accidental legacy names are removed cleanly before public adoption.
- Sensitive native work must be executed by the active signed host (`Claw.app` or an embedded `ClawHostKit` host), not by Node permission prompts.
- `~/.codex` is an external read-only source. Mirror or index it only; do not delete, move, overwrite, chmod broadly, or write into it without explicit reversible opt-in.
- Adapter support level is part of the public contract. Do not document experimental adapters as production-ready unless support metadata and docs are updated together.
- Capability maps must preserve the invariant: `supported=false` implies `status="unsupported"`, and `status="unsupported"` implies `supported=false`.

## Agent Working Rules

- Read before changing: inspect the affected package, tests, and docs before editing.
- Prefer small, surgical patches over broad refactors unless the task explicitly asks for structural change.
- Do not overwrite unrelated user changes in a dirty worktree.
- Shared brand assets and shared UI fonts live in the repo-root `assets/` directory for internal dashboards and operational web UIs; treat `assets/logo.png`, `assets/favicon.ico`, `assets/fonts/source-sans-3/*`, and `assets/fonts/ubuntu-mono/*` as the source of truth there, but keep `website/` and chat/mobile clients on their own visual systems.
- For every change, review the relevant docs, README files, examples, templates, and website content to confirm they still match the current behavior, APIs, and workflows; update them in the same patch whenever they are stale.
- When you touch a package, verify whether corresponding docs, templates, smoke coverage, and repository surface checks also need updates.
- When you add or rename public packages, commands, or scaffolding behavior, update docs and package-surface coverage.
- If unsure about release or merge target, check `docs/git-workflow.md` and document any assumption you make.

## Design System (Styles, Templates, References)

ClawJS exposes a generalised design system surface used by any agent that needs to produce visual artifacts (presentations, cards, posters, social posts, one-pagers, CVs, invoices, certificates, menus, flyers, emails, business cards, web landings, brochures, reports).

Three first-class resources live under `<workspace>/.claw/` for new canonical writes. Legacy `<workspace>/.clawjs/` resources may be read only inside explicit compatibility or migration paths.

- `styles/<id>/STYLE.md` · a Style is the recipe (tokens for color, typography, spacing, radius, shadow, motion + brand voice + imagery rules + per-format overrides). 10 builtins ship out of the box (`editorial`, `studio`, `midnight`, `signal`, `paper`, `executive`, `product`, `mono`, `warm`, `claw`). Install them with `claw style install-builtins`.
- `templates/<id>/TEMPLATE.md` · a Template is a parametrised skeleton (category + aspect + typed slots + variants + supported output formats). 30 builtins ship across 13 categories. Install with `claw template install-builtins`.
- `references/<id>/REFERENCE.md` · a Reference is an inspiration or evidence item (web, pdf, image, video, screenshot, snippet). N:M against Styles. Link with `claw ref link <refId> --style <styleId>`.

CLI surface:

```
claw style list|get|create|delete|export|import|install-builtins|builtins
claw template list|get|create|delete|render|install-builtins|builtins
claw ref list|get|add|delete|link
```

The canonical renderer is HTML (`packages/clawjs/src/templates/render/html.ts`). PDF and PNG are produced via Playwright; PPTX is produced via a minimal OpenXML packer; SVG wraps the HTML in `<foreignObject>`. A Node-only fallback PDF is used when Playwright is unavailable.

Skills that consume this surface live under `skills/`: `style-extract`, `style-apply`, `template-render`, `brand-guidelines`, `theme-factory`, `canvas-design`. Each skill is a `SKILL.md` with frontmatter (`name`, `description`, `keywords`) plus imperative Markdown.

The legacy `claw slides` command continues to work and remains the recommended path for multi-slide decks today. The new `claw template render --category presentation` renders single-slide pieces and shares the renderer pipeline. A future change will unify them; until then both coexist.

## First Files To Read For Common Tasks

- New contributor or new agent: `README.md`
- Local workflow and merge expectations: `CONTRIBUTING.md`
- Branch policy: `docs/git-workflow.md`
- Release work: `RELEASING.md`
- Security-sensitive work: `SECURITY.md`
- E2E or demo changes: `tests/e2e/README.md`
- Runtime and workspace behavior: `docs/setup.md`, `docs/support-matrix.md`, `docs/runtime-migration-notes.md`
- Agent operational wiki: `agents/wiki/README.md`
- OpenClaw host-dependent debugging: `agents/wiki/openclaw.md`
