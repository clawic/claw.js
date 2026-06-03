# Local Forge Worktree Review Checklist

Use this checklist for implementation work under ADR 0054.

## Project Registration And Version History

- [x] ADR 0054 states existing folder registration must not mutate the folder by default.
- [x] ADR 0054 states existing Git repos are detected and used without changing user expectations.
- [x] ADR 0054 states non-Git version history is opt-in per project/folder or workspace policy.
- [x] Add project attach/create preview that shows whether version history will be enabled. Evidence: `ClawProjectAttachPreview.versionHistory` in `packages/clawjs/src/project.ts`.
- [x] Add tests that attach an existing non-Git folder without creating `.git` or forge metadata. Evidence: `packages/clawjs/src/cli-project-command.test.ts` asserts preview does not create `claw.project.json` or `.git`.
- [x] Add tests that detect existing Git without rewriting remotes, branches, or ignore files. Evidence: `packages/clawjs/src/cli-project-command.test.ts` preserves `.git/config` and `.git/HEAD` during preview.

## Worktree Resource Model

- [x] Define worktree resource identity and local checkout locator. Evidence: `LocalForgeWorktreeRecord` in `packages/clawjs/src/project.ts`, `claw project worktree --accept`, focused CLI tests, and redacted isolated physical local forge validation.
- [x] Index which node has a local checkout and which authority service owns change history. Evidence: `nodeCheckout` and `authorityService` fields are persisted and `claw where project <id> --json` reports them from the local forge store; redacted isolated physical validation recorded two checkout locators for one project.
- [x] Detect nested projects/worktrees and require explicit selection. Evidence: `nestedProjectWarnings` is recorded on worktree previews/records; richer selection UI remains future work.
- [x] Implement `claw get worktrees` and `claw where project <id>` or equivalent routed views. Evidence: commands return persisted local forge worktree records when present and stable `blocked` envelopes when no backend record exists.
- [x] Keep project identity stable when folder paths move or are copied. Evidence: existing project copy/import tests in `packages/clawjs/src/cli-project-command.test.ts` keep project id and detach copied projects until explicit replacement.

## Work Claims And Locks

- [x] Define work claim record: project, worktree, branch, subpath, task, intent, actor, agent id, node, start time, heartbeat, expected output, recovery policy, and status. Evidence: `LocalForgeWorkClaimRecord` and `claw project claim`.
- [x] Claims are non-exclusive coordination records by default. Evidence: focused CLI test records two compatible active claims; redacted isolated physical validation recorded claim metadata under a temporary data root.
- [x] Define explicit exclusive lock option for high-risk refactors, unsafe path edits, and human freezes. Evidence: `--exclusive` claim path denies when active compatible claims exist and reports `local_forge_claim_lock_conflict`.
- [x] Define stale timeout and recovery flow before implementation closes. Evidence: `evaluateLocalForgeStaleClaims` uses an 8-hour default or explicit `--stale-after-minutes`, `claw project forge-status --mark-stale --accept` marks only stale metadata, and focused CLI tests cover preview and accepted stale transitions.
- [x] Add tests for concurrent compatible claims and explicit lock denial. Evidence: `packages/clawjs/src/cli-project-command.test.ts`.

## Snapshots, Branches, Review, And Recovery

- [x] Create pre-change snapshot/checkpoint before risky agent edits. Evidence: `claw project snapshot --accept` records a hash-only snapshot after preflight; focused tests and redacted isolated physical validation verify private files are excluded.
- [x] Create checkpoint commits or snapshots at useful milestones. Evidence: metadata-only checkpoint snapshots are implemented; actual Git commit creation remains opt-in future work and must not occur silently.
- [x] Store review records with diff, explanation, tests run, risks, merge status, merge plans, and recovery receipts. Evidence: `LocalForgeReviewRecord`, `LocalForgeMergePlanRecord`, `LocalForgeRecoveryReceipt`, `claw project review`, `claw project merge-plan`, `claw project recover`, and focused tests.
- [x] Implement recovery flow for abandoned work: resume, review, merge, recover, or abandon. Evidence: recovery receipts support all five actions and update accepted claim status for review/recover/abandon without mutating project files; redacted isolated physical validation verified metadata-only recovery.
- [x] Add merge/conflict handling with detect-and-elevate default. Evidence: `LocalForgeMergePlanRecord` and `claw project merge-plan` compare recorded snapshots, use `conflictPolicy: detect_and_elevate`, do not mutate project files, and focused tests elevate same-path hash conflicts to `human_review_required`.
- [x] Add no irreversible data loss validation for destructive recovery paths. Evidence: current recovery receipts are `metadata_only`, declare `noIrreversibleDataLoss: true`, and perform no delete, rollback, merge cleanup, push, or publish.

## Preflight And Large Files

- [x] Block or exclude dependencies, generated files, build output, caches, host-private state, and known secret files by default. Evidence: `runLocalForgePreflight` classifies dependency/build/cache/private folders as excluded and secret-looking files as blocked; focused tests cover `.env` and `node_modules`.
- [x] Define large-file threshold and user-facing explanation. Evidence: local forge preflight blocks files over 10 MiB with an explicit blob/LFS policy explanation.
- [x] Decide Git LFS, Claw blob store, provider storage, or hybrid for large files before stable activation. Evidence: ADR 0054 accepts V1 `block_by_default`; focused preflight/snapshot/review tests prove a file over 10 MiB is blocked rather than captured. Future Git LFS, blob, provider, or hybrid storage remains a separate explicit enablement decision.
- [x] Add privacy checks proving plaintext secrets do not enter history, fixtures, logs, or docs. Evidence: focused snapshot/review test and redacted isolated physical validation verify `.env` content is absent from local forge state; `npm run privacy:check` remains required after final edits.
- [x] Add tests using Node, Python, Xcode/Flutter-style generated folders where practical. Evidence: Node dependency fixture is covered; Python/Xcode/Flutter folder names are in scanner defaults but deeper physical fixtures remain future expansion.

## Provider Interop

- [x] Existing external remotes remain external providers, not local forge authority. Evidence: existing Git detection reads `.git` state for preview only and does not rewrite remotes or treat a remote as authority.
- [ ] EXTERNAL PENDING: Define import/export or bridge behavior for GitHub/GitLab only after provider fixtures exist. Blocker: provider fixtures and approved brokered credentials are not available. Reentry: explicit provider-fixture approval and redacted evidence. Evidence required: provider interop fixtures and brokered credential receipt.
- [ ] EXTERNAL PENDING: Keep provider mutation `EXTERNAL PENDING` without explicit approval and brokered credentials. Blocker: no explicit approval in this thread for real provider mutation. Reentry: approved live-provider run with brokered credentials and redacted evidence.
