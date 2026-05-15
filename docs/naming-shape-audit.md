# Naming shape audit

Status: initial report

Date: 2026-05-15

This is the living audit report for ADR 0013. The machine-readable source is
`node scripts/naming-shape-check.mjs --json`; source-shape signals come from
`node scripts/source-size-check.mjs --json`.

## Current gate status

- Critical naming failures: 0.
- Naming warnings: 227.
- Source-size warnings: 114.
- Source-structure signals: 320.

The current gate is intentionally critical-only. Warnings are cleanup inventory
for staged rename/split work and must not be hidden by compressing code.

## Largest current files

- `packages/clawjs/src/index.ts` - 2002 lines.
- `examples/showcase/src/app/settings/page.tsx` - 1996 lines.
- `packages/clawjs-node/src/create-claw.test.ts` - 1994 lines.
- `relay/src/server/db.ts` - 1982 lines.
- `packages/clawjs-workspace/src/index.ts` - 1977 lines.
- `packages/clawjs-node/src/create-claw.ts` - 1964 lines.
- `examples/showcase/src/lib/e2e.ts` - 1953 lines.
- `modules/erp/src/server/db.ts` - 1950 lines.
- `memory/src/service.ts` - 1886 lines.
- `examples/showcase/src/app/page.tsx` - 1876 lines.

## Cleanup families

- Skills v2 scopes: initial cleanup completed for framework scope vocabulary.
  `chat` scope and `chatId` were renamed to `session` and `sessionId` across
  core schemas/types, Node store resolution, CLI parsing, and built-in skill
  metadata.
- Notify context vocabulary: initial cleanup completed for notification
  context fields. Internal `threadId` was renamed to `sessionId` across shared
  server types, API parsing, and the app-facing dashboard type.
- User module graph vocabulary: initial cleanup completed for the user explorer
  graph contract. Generic `GraphData`/`buildGraph` names were renamed to
  `UserRelationshipGraph`/`buildUserGraph`.
- CLI/router and command handlers: keep `packages/clawjs/src/index.ts` from
  growing by extracting command families before adding behavior.
- Showcase UI/API: split settings, tasks, onboarding, locale, and route files
  by tabs, adapters, fixtures, and server operations.
- Runtime/workspace/session vocabulary: audit `threadId`, `chatId`, and
  `sessionId` by contract boundary before renaming.
- Integration/provider vocabulary: keep provider-native `chat` names only
  where they mirror external APIs or fixtures.
- Large database/server modules: split SQL builders, repositories, route
  handlers, serializers, and fixtures by domain.
- Broad symbols: review `Manager`, `Helper`, `Utils`, `Data`, and `Info` only
  when a clearer domain + role name exists.
- Naming check scope: generated output and local variable-only broad terms are
  excluded so warnings stay focused on source files, types, functions, exported
  values, owned docs data roles, and unresolved context-vocabulary inventory.

## Validation snapshot

- `npm run test:docs` passed after adding the new checks.
- `node scripts/naming-shape-check.mjs` passed with warnings only.
- `node scripts/source-size-check.mjs` passed with warnings/signals only.
- `npm --prefix packages/clawjs-core run build` passed before skills v2 runtime
  validation.
- `npx vitest run --config vitest.config.ts packages/clawjs-node/src/skills-v2/store.test.ts`
  passed.
- `npm run test:types` passed.

This report is not final completion evidence for the full goal. It is the
baseline for the later broad cleanup and rename phases.
