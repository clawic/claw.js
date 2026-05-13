# Migration: legacy `iot.sqlite` goals → `@clawjs/goals`

The IoT mini-app at `iot/` shipped a `goals` collection (one table in
`iot.sqlite`) consumed by Clawix Mac through `SidebarRoute.databaseCollection("goals")`.
The new `@clawjs/goals` vertical replaces that collection with a
first-class signals module under the Life surface.

## Why migrate

- The IoT collection is unstructured: a single `text` column with no
  notion of category, target date, progress percentage, or status.
- The new module exposes typed observations: `goals.statement`,
  `goals.category`, `goals.target_date`, `goals.progress`,
  `goals.status`, `goals.reflection`. Each goal becomes a `Session`
  whose child observations capture progress over time.
- The Life surface (sidebar section + 3-pane explorer) gives goals the
  same query, chart and search affordances every other vertical gets.

## What stays

The legacy collection stays readable. The migration is one-way (legacy
→ signals), the legacy `goals` collection is **not** deleted, so a
user who downgrades their Clawix Mac to a version without
`@clawjs/goals` can still see their old data.

## Plan

1. **Daemon-side script** at `clawjs/scripts/migrate-iot-goals.mjs`
   reads from `iot.sqlite::goals` and writes to the goals signals
   service:

   ```bash
   node scripts/migrate-iot-goals.mjs \
    --source ~/.claw/data/iot.sqlite \
     --target http://127.0.0.1:4762 \
     --token "$GOALS_SHARED_SECRET" \
     --dry-run
   ```

   Each row becomes one session of type `legacy_iot_goal` plus a child
   observation under `goals.statement`. Drop `--dry-run` to apply.

2. **Mac sidebar**: drop the `("goals" → .databaseCollection("goals"))`
   entry from `SidebarToolsCatalog.entries`. The new `goals` vertical
   shows up in the Life sidebar section.

3. **Mac in-app banner** (one launch): when the user opens the Life
   `goals` vertical for the first time after the upgrade, show a
   `MigrationBanner` offering to run the migration. If the user opts
   out, the banner remains dismissible from `LifeSettingsView`.

4. **Catalog freeze**: `goals` graduates from `alpha` to `stable` when:
   (a) the migration script has been smoke-tested against real data,
   (b) the Mac banner has shipped, (c) at least one release cycle has
   passed with no rollback request.

## Rollback

Until `goals.status` reaches `stable`, the migration is reversible:
the legacy collection is untouched, so removing the new signals SQLite
restores the old behavior. After `stable`, the legacy collection is
declared read-only and the IoT mini-app stops surfacing it in its UI.

## Open questions (not blocking Phase 1)

- Should we extend the legacy schema in-place instead of moving? No
  — the legacy schema cannot represent observations over time without
  schema changes, and we want to consolidate every signals domain into
  the unified Life family.
- Should we mirror writes for one release cycle to make rollback
  trivial? Optional; current plan keeps writes one-way (new module
  only) to avoid double-source-of-truth bugs.
