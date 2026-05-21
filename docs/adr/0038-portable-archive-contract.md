# ADR 0038: Portable archive contract

- Status: Accepted
- Date: 2026-05-21
- Owner: ClawJS
- Protectors: `scripts/portable-archive-governance-check.mjs`, `packages/clawjs-core/src/portable-archive.test.ts`, `packages/clawjs/src/index.test.ts`

## Context

The Constitution treats backup and export as a user right, but the pre-existing
surface only exposed scattered naming and CLI references. That left no complete
contract for what a portable full backup contains, how it is verified, how
secrets are represented, how restore is tested, or how Clawix should ask for
signed-host approval.

## Decision

ClawJS owns the portable archive contract and Clawix consumes it as the signed
human host surface.

`.clawbackup` is the full user-state archive. It is a standard readable archive
with a root `manifest.json`, deterministic inventories, content hashes, schema
versions, source versions, counts, restore graph, compatibility range, external
source provenance, and redacted receipts.

`.clawexport` remains the scoped handoff export format. `.clawsecrets` is the
only allowed secrets backup envelope and is always nested encrypted material
created with an independent backup passphrase. `.clawbackup` must never contain
raw Secret Keys, platform wraps, Keychain material, active bearer tokens, grant
tokens, or plaintext secret values.

Canonical data is exported as portable JSONL, Markdown, and ordinary files
where possible. SQLite snapshots are included for faithful restore but are not
the only readable representation. Rebuildable caches and search indexes are
excluded and recorded as `rebuildable_no_canonical_backup`.

Restore is two-phase. Import preview validates the archive and maps it into a
new or selected target. Restore applies only after verification and explicit
approval; restore involving encrypted secrets requires signed-host proof.

## Operational Surface

The public framework surface is:

- `@clawjs/core` schemas: `PortableArchiveManifestV1`,
  `PortableArchivePlan`, `PortableArchiveVerificationReport`,
  `PortableArchiveImportPreview`, and `PortableArchiveRestoreReport`.
- CLI: `claw archive plan|export|verify|inspect|import|restore|doctor --json`.
- API contracts: `/v1/archives/plans`, `/v1/archives/exports`,
  `/v1/archives/verifications`, `/v1/archives/import-previews`, and
  `/v1/archives/restores`.
- Stable formats: `.clawbackup`, `.clawexport`, `.clawsecrets`, and root
  `manifest.json`.
- Human host mirror: Clawix Settings/Data export backup, verify archive, import
  preview, restore, and restore report flow.

## Validation

This ADR is incomplete unless the governance check proves:

- The ADR and contract doc are discoverable through `claw search`.
- Stable file formats, archive schemas, CLI command, API routes, JSON fields,
  events, and restore reports are registered.
- Restore fixtures cover empty, normal, multi-workspace, sidecar, file/blob,
  skill/instruction, session, audit, policy, grant, and secrets-envelope cases.
- Negative fixtures reject missing manifest, tampered hash, unsupported future
  schema, stale path, plaintext secrets, cache-only data without canonical
  source, and copied external read-only sources.
- Clawix mirror docs and UI states stay aligned with this ADR.

## Consequences

Backup/export/import/restore can no longer be treated as naming-only surfaces.
Any future weakening of encrypted secrets backup must update this ADR and the
Secrets Security Model in the same change.
