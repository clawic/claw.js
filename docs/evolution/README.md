# Evolution Ledger

`docs/evolution/` is the public, reviewable ledger for stable surface evolution.
It is owned by ClawJS and mirrored by Clawix when host or UI behavior is
affected.

Use it when a change touches a public or durable surface: CLI commands and
flags, SDK exports, package exports, schemas, database tables and columns,
workspace/global files, app or bridge protocols, route graph nodes and edges,
agent instructions, skills, receipts, backups, imports, exports, indexes,
permissions, grants, approvals, audit, or host state.

The current code path must not branch through old versions. Put old-version
knowledge in migrators, adapters, receipts, repair tools, and fixtures.

## Required Workflow

1. Run `claw evolution diff --json` before changing a stable surface.
2. Add or update an evolution record for each logical change.
3. Use `breaking_requires_adr` for public breaking changes.
4. Add or update migrators/adapters when old public state must still work.
5. Run `claw evolution verify --json` and the relevant tests.
6. Keep receipts redacted and local unless the user approves sharing.

`npm run test:evolution` is the shared changed/release gate for this backbone.
It runs the governance check, self-test, and `claw evolution verify --json`.
`npm run test:changed`, `npm run test:fast`, and release lanes must keep this
gate in their path so stable surface drift fails before merge or publication.

## Files

- `schema.json`: machine-readable record schema.
- `baseline.json`: current public ledger metadata and records.
- `public-surface-baseline.json`: generated snapshot of registered public
  surfaces and CLI commands. `claw evolution diff --json` compares current
  registry state against this file and requires active evolution records for
  uncovered drift.
- `fixtures/v1-foundation.json`: synthetic foundation fixture for the first
  public migration lab. It covers DB/core, `.claw`, `~/.clawix`, protocol,
  CLI JSON, package exports, agent instructions, skills, routes, schemas,
  backup, search/index rebuild, permissions, audit, and rescue survival.
- `claw evolution plan|dry-run|repair|rollback|backup|receipt|report --json`:
  safe operator contracts for migration planning, backup classification, rescue
  preservation, and redacted receipts. `repair` and `report` also emit an
  agent-readable repair package with diagnostics, safe actions, approval-gated
  actions, a redacted suggested patch, and a local-only receipt. `backup` and
  `rollback` emit a restore-point contract with retention/size limits,
  `best_effort_forward_repair` reversibility, and
  `universalRollbackPromised: false`; the supported recovery path after
  rollback is `claw evolution repair --json`, and public data migrators stay
  forward-compatible instead of being retired. Mutating or externally submitted
  actions are approval-gated by default.

## Rescue Rule

When an update leaves state partially migrated, the product goal is not to stop
the user. The survival core is launch, chat, and agent-readable repair context.
Clawix should degrade non-critical areas before losing chat or rescue.
