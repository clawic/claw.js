# AGENTS.md

Instructions for humans and coding agents working on ClawJS documentation.

## Scope

- The repository-root `AGENTS.md` remains authoritative. This file only adds rules for work under `docs/`.
- Treat `docs/` as the single Markdown source for product, reference, workflow, and website documentation.
- Keep these instructions durable and project-specific. Do not add personal maintainer preferences, temporary validation notes, or local machine details here.

## Documentation Goal

- Make the docs the fastest reliable path for humans and agents to build with, operate, integrate, and troubleshoot ClawJS.
- Prefer precise, current, task-oriented documentation over broad marketing copy.
- Explain public behavior, supported workflows, and known boundaries clearly enough that a reader can act without inspecting the source first.

## Required Workflow

- Read the relevant docs before editing, then verify claims against the current implementation.
- Inspect recent commits and local diffs when updating docs for code changes. Identify what behavior changed, then update the affected docs from that evidence.
- Check public SDK APIs against package exports, types, and implementation before documenting names, signatures, namespaces, or examples.
- Check CLI documentation against the CLI source and `surface-contract.registry.json` before documenting commands, flags, or examples.
- Keep public surface and interface docs aligned with `surface-contract.registry.json` and generated package declarations.
- When adding a public docs page, make it discoverable from `index.md` or the VitePress sidebar unless it is intentionally private or supporting material.
- For architecture, storage, host, validation, naming, privacy, release, or
  changeset decisions, start from `constitution-map.md` and `decision-map.md`,
  then update the canonical source they point to before editing the maps.

## Writing Rules

- Write public docs in English.
- Use real package names, command names, paths, and examples that match the repo.
- Do not document commands, APIs, adapters, support levels, or runtime behavior that do not exist in the current implementation.
- Do not use stale placeholders, repo-local invocation paths, or absolute local machine paths in public docs.
- Do not describe experimental or adapter-specific behavior as production-ready unless support metadata and the support docs say so.
- Keep examples minimal, copyable, and focused on the behavior being explained.

## Validation

- Run `npm run test:docs` after changing public surface, CLI, API, support, interface, or cross-reference documentation.
- Run `npm --prefix website run docs:build` after changing VitePress config, frontmatter, navigation, theme behavior, or docs that need rendered-site validation.
- Run broader repo gates only when the docs change depends on package builds, generated declarations, examples, templates, or behavior outside `docs/`.
- For instruction-only changes under `docs/`, a local Markdown sanity check is sufficient unless the rendered site or public docs surface is affected.
