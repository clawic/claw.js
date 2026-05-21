# No Irreversible Data Loss

This directory is the operational program for constitutional red line 4. The
Constitution remains the source of authority; this program makes the red line
checkable for destructive and data-moving work.

## Files

- `manifest.json`: recovery classes, policy coverage, required evidence, and
  monitored candidate files.
- `baseline.json`: expiring baseline for existing gaps. New debt must not be
  added casually; policy coverage is the normal path.
- `fixtures.json`: positive and negative examples used by the guard.

## Contract

Default deletion is recoverable trash or archive. Purge is separate, exact
human approval is required for irreversible operations, and agents cannot
perform irreversible purge. Migrations require snapshots and repair receipts.
Imports stage or merge by default. Exports stay comprehensive, versioned, and
readable without the framework. External hard deletes need exact approval,
provider receipts, and live validation remains `EXTERNAL PENDING` until proved.

Run:

```bash
node scripts/no-irreversible-data-loss-check.mjs
node scripts/no-irreversible-data-loss-check.mjs --self-test
```
