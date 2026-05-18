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

## Files

- `schema.json`: machine-readable record schema.
- `baseline.json`: current public ledger metadata and records.
- `public-surface-baseline.json`: generated snapshot of registered public
  surfaces and CLI commands. `claw evolution diff --json` compares current
  registry state against this file and requires active evolution records for
  uncovered drift.
- `claw evolution plan|dry-run|repair|rollback|backup|receipt --json`: safe
  operator contracts for migration planning, backup classification, rescue
  preservation, and redacted receipts. Mutating actions are approval-gated by
  default.

## Rescue Rule

When an update leaves state partially migrated, the product goal is not to stop
the user. The survival core is launch, chat, and agent-readable repair context.
Clawix should degrade non-critical areas before losing chat or rescue.
