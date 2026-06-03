# Security And Privacy Checklist

## Public Hygiene

- [x] Temporary working notes are removed from the governance index.
- [x] Source audit rows use public-safe IDs instead of transcript text.
- [x] Run `npm run privacy:check` after final edits.
- [x] Verify no private absolute home path, raw session path, credential, signing identity, private runtime id, local launcher, screenshot, log, cache, or maintainer-private note appears in new artifacts.
- [x] Keep any approved physical/provider evidence in redacted artifact form only. Evidence: approved isolated physical core identity validation is summarized in `physical-validation-redacted.md` without private hosts, IPs, aliases, credentials, transcripts, logs, screenshots, or raw paths.

## Secrets And Sensitive State

- [x] ADR 0053 and ADR 0054 forbid plaintext secret replication and history capture.
- [x] Add preflight rules for secret-looking files and host-private material before local forge activation. Evidence: `runLocalForgePreflight` blocks secret-looking files and excludes `.git`, `.claw`, IDE folders, dependencies, caches, and build output by default.
- [x] Add tests that rejected files do not appear in snapshots, review diffs, generated artifacts, fixtures, or logs. Evidence: focused local forge test verifies `.env` content is absent from the local forge state and appears only as blocked path metadata.
- [x] Secret access through Gateway/forge/sync uses refs and brokered leases only. Evidence: no forge secret access was added; existing Gateway/sync secret routes use secret refs and brokered leases.

## No Blind Sync Or Mutation

- [x] ADR 0053 blocks blind database, session, sidecar, secret, blob, log, index, and worktree replication.
- [x] ADR 0054 blocks mutating existing folders by default.
- [x] Add dry-run previews before project attach, version-history enablement, checkout, recovery, merge, authority handoff, or destructive cleanup. Evidence: project attach/worktree/claim/snapshot/review/recover all preview unless `--accept`; merge/authority handoff/destructive cleanup remain unavailable rather than silently mutating.
- [x] Add explicit approval requirements for destructive folder actions, real provider mutations, publishing, pushing, uploads, or live external calls. Evidence: repo red lines and existing CLI export/provider gates remain; this batch added no destructive/provider/push/upload/publish/live path.

## Audit And Recovery

- [x] Authority handoffs create audit receipts. Evidence: `SyncAuthorityHandoffReceipt` includes `auditEventId`, `status`, `fromNodeId`, `toNodeId`, residency fields, `externalPending` for physical application, and `writes: false`; focused remote contract tests validate the signed-pending handoff receipt. Coordinator/standby promotion remains blocked separately.
- [x] Work claims, snapshots, review records, merge plans, and recovery receipts are inspectable. Evidence: `claw project forge-status --json` lists local forge worktrees, claims, snapshots, reviews, merge plans, and recovery receipts.
- [x] Abandoned work recovery preserves enough evidence for a human or agent to resume or abandon safely. Evidence: `claw project recover --action resume|review|merge|recover|abandon` records metadata-only receipts and updates claim status for review/recover/abandon.
- [x] No irreversible data loss classifications cover delete, purge, rollback, merge, conflict resolution, and recovery operations. Evidence: current recovery operations are explicitly `metadata_only` with `noIrreversibleDataLoss: true`; delete, purge, rollback, merge cleanup, and conflict resolution are not enabled.
