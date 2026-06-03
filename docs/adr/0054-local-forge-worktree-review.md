# ADR 0054: Local Forge Worktree Review

Status: Accepted

Date: 2026-06-02

Reservation: `docs/adr/reservations/0054.json`

## Context

Agents and humans need to work on large editable folders without losing work,
leaking secrets, or forcing humans to understand Git. Claw already treats
Workspace and Project identity separately from folder paths, and ADR 0053
classifies editable worktrees as resources that must not be blindly synced.
The missing decision is the framework-owned local review and recovery layer
for branches, snapshots, work claims, review records, merges, and rollback.

The local forge is not a public provider replacement. It is the local
framework layer that lets agents and humans review, recover, hand off, and
merge project changes even when no GitHub, GitLab, or external remote exists.

## Decision

Registering an existing folder as a project must not mutate it by default. If
the folder is already a Git repository, Claw detects and uses that fact without
changing user expectations. If the folder is not a Git repository, version
history is opt-in per project/folder or by explicit workspace policy. New
projects created by Claw may offer version history during creation, but it is
off by default unless policy enables it.

Human-facing copy should say `version history`, `save versions`, `review`,
`recover`, and `merge`; it should not require the user to understand Git.
When version history is enabled for multi-file editable work, Git or a
Git-compatible object model is the preferred substrate because it is efficient,
portable, auditable, and mature for snapshots, diffs, branches, merges, and
transfer.

Claw adds an agent-facing review layer above the substrate: deterministic
branch naming, preflight file scanning, content hashes, pre-change snapshots,
checkpoint commits, work claims, review records, merge plans, recovery
receipts, and release preparation. Work claims are coordination records by
default, not exclusive locks. Exclusive locks exist only as an explicit option
for high-risk refactors, human-requested freezes, or paths where parallel
edits are unsafe.

Agent-authored changes must be recoverable. Before risky edits, Claw records a
recoverable checkpoint. During long work, it records progress through
checkpoint commits, review records, or snapshots. If an agent or node
disappears mid-work, the claim must show what was attempted, where partial
state lives, what changed, and whether the work should be resumed, reviewed,
merged, recovered, or abandoned.

Large, generated, vendor, dependency, cache, build-output, host-private, and
secret-bearing files must be blocked or excluded by preflight policy unless an
explicit reviewed policy includes them. Git must never become a secret store.

## Threat Model Impact

The protected assets are project files, version history, diffs, review notes,
work claims, snapshots, branch metadata, local forge stores, and recovery
receipts. The main risks are plaintext secret capture, oversized repository
growth, accidental inclusion of generated/private files, malicious or confused
agent edits, stale claims, unsafe merges, and treating a local review service
as external provider authority.

Controls are opt-in version history for existing non-Git folders, preflight
file scanning, secret and private material exclusions, explicit work claims,
explicit locks, recoverable checkpoints, no silent destructive folder actions,
and audit evidence for merge/recovery operations. Secret handling remains
governed by the existing secrets and host-boundary contracts.

## Performance Impact

Editable worktrees can be large and expensive. The local forge must avoid
Dropbox-style blind sync, full-folder mirroring, unbounded status scans, and
automatic inclusion of dependencies or build products. Preflight and status
operations must be bounded or cancellable; large-file handling must block,
defer, or route to an explicit blob/LFS policy instead of silently creating
huge histories.

For V1 local forge activation, the accepted large-file backend policy is
`block_by_default`: files over the local forge threshold are not captured into
metadata snapshots, Git history, generated artifacts, fixtures, logs, or review
diffs. Git LFS, Claw blob storage, provider storage, or a hybrid backend require
a later explicit enablement decision and tests before they may store those
files.

Version history, snapshots, reviews, and merge plans add disk and CPU work
only when enabled for a project/folder or when an agent performs reviewed
work. Physical multi-node checkout, large-file storage, and performance
measurements for large generated projects remain `EXTERNAL PENDING` until
implemented and measured.

## Decision Tensions

- **Prioritized axes**: recoverability, reviewability, human simplicity,
  agent coordination, public hygiene, and no irreversible data loss.
- **Constrained axes**: implicit mutation of existing folders, blind sync,
  provider-like overreach, and forcing Git vocabulary into ordinary UI are
  constrained.
- **Tradeoffs accepted**: version history requires explicit enablement and
  preflight; this adds friction but prevents accidental repository creation,
  secret capture, and massive generated histories.
- **Debt or pending evidence**: physical multi-node checkout, future large-file
  storage backend enablement, and rich review UI remain blocked until checklist
  rows close.

## Adoption And Canonicity

This ADR makes no broad adoption, PMF, "any human", or stable product
promotion claim. It is a framework architecture decision for local forge,
worktree, and review/recovery behavior.

## Source Decision Audit

This ADR records conversation-derived architecture decisions from
`source:nodes-cluster-local-forge`. Public-safe rows live in
`docs/governance/nodes-cluster-local-forge/source-audit.md`, especially
`NCLF-016` through `NCLF-030`.

## Surface Parity

- **Human surface**: Clawix and docs should expose project version history,
  review, recover, merge, conflict, and attention-needed states without
  requiring Git knowledge.
- **Programmatic surface**: future `claw worktree`, `claw forge`,
  `claw project`, `claw get worktrees`, `claw where project`, and review APIs
  expose claims, snapshots, branches, reviews, merge plans, and recovery.
- **Persistence**: project records, worktree resource records, Git or
  Git-compatible history, review metadata, claims, snapshots, and recovery
  receipts persist through framework stores and the managed project folder
  model.
- **Gaps**: richer public command names, future large-file storage backend
  enablement, review-before-merge policy, and external Git provider interop are
  `blocked` until implementation checklists close.
- **Validation**: human-path validation is through project version-history and
  review/recovery workflows. Programmatic validation is through docs, ADR,
  source-audit, storage, privacy, route, and future CLI/core tests.

## Discovery Route

- **Canonical name**: `adr:local-forge-worktree-review`.
- **AGENTS/CLAUDE**: root `AGENTS.md` routes project, storage, code, sync,
  privacy, and governance work to `docs/decision-map.md`.
- **Skill**: use `decision-map-maintenance`, `docs-alignment-update`,
  `surface-route-work`, `cli-agent-surface-work`, and
  `public-hygiene-review` before changing this surface.
- **Docs router**: `docs/decision-map.md` and
  `docs/governance/nodes-cluster-local-forge/index.md`.
- **CLI**: `claw search "local forge worktree review" --json` and
  `claw inspect why adr:local-forge-worktree-review --json`.
- **Registry**: `docs/discoverability.registry.json`.
- **Operational coverage**: `docs/adr-operational-coverage.manifest.json`.

## Consequences

Local project edits gain a public recovery and review contract. Future
implementation must not silently initialize Git in existing folders, silently
sync huge worktrees, store plaintext secrets in history, treat claims as
exclusive locks by default, or count external Git/provider behavior as locally
validated.

Closure for the current architecture program is tracked in
`docs/governance/nodes-cluster-local-forge/`. Remaining physical/provider work
must be explicit `EXTERNAL PENDING`, not hidden in implementation notes.
