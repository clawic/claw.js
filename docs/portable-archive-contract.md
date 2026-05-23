# Portable Archive Contract

ClawJS owns the portable archive contract. Clawix owns the signed human surface
that asks for reauthentication and approval before secrets backup/import or
restore.

Canonical decision: [ADR 0038: Portable Archive Contract](./adr/0038-portable-archive-contract.md).

## Formats

`.clawbackup` is the full user-state archive. It contains a root
`manifest.json`, deterministic inventories, content hashes, schema versions,
source versions, counts, restore graph, compatibility range, external source
provenance, and redacted receipts.

`.clawexport` is for scoped handoff exports. `.clawsecrets` is a nested
encrypted secrets envelope with an independent backup passphrase. It is the only
secrets backup form allowed inside `.clawbackup`.

## Scope

The archive includes canonical user state according to storage class:

- `core.sqlite` plus portable JSONL representations for canonical records.
- Non-rebuildable sidecars.
- Workspace `.claw/` state and project manifests.
- Skills, instructions, memories, sessions, files/blobs, audit metadata,
  policies, grants, and redacted receipts.
- Encrypted `.clawsecrets` envelopes when the signed host has approved secrets
  backup.

Rebuildable caches and search indexes are excluded and recorded as
`rebuildable_no_canonical_backup`.

External read-only sources are referenced with provenance and sync metadata.
They are not copied wholesale unless the data is already a justified local
mirror with a declared policy.

## Manifest

`manifest.json` uses `PortableArchiveManifestV1`
(`claw.portableArchive.manifest.v1`) and includes:

- Archive identity: `.clawbackup`, schema version, command, source version, and
  compatibility range.
- Inventory entries with deterministic IDs, storage class, portable path,
  canonical flag, restore strategy, byte/record counts, and SHA-256 hashes for
  canonical material.
- Restore graph ordering.
- External source references.
- Secrets policy with `encrypted_clawsecrets`, independent passphrase, and
  signed-host requirement.
- Redacted receipts only.

## Secrets

The archive must not contain raw Secret Keys, platform wraps, Keychain material,
active bearer tokens, grant tokens, or plaintext secret values.

Secrets backup signed host flows use the `secrets backup signed host` gate:
export/import/restore require Clawix or another signed host to
reauthenticate the human and produce signed-host proof. Framework CLI paths
return `requires_signed_host` when that proof is missing.

## Restore

Restore is two-phase:

1. Import preview validates the manifest, hashes, compatibility, external
   references, cache exclusions, and secrets envelope requirements.
2. Restore applies only after successful verification, explicit approval, and
   exact target confirmation.

The restore report uses `claw.portableArchive.restoreReport.v1` and records
status, target root, approval state, restored counts, blocked reasons, and
completion time when applied.

## UX States

The signed human surface must show these states without introducing new visual
language: ready, verification failed, secrets require reauth, external source
referenced, cache will rebuild, restore blocked, and restore complete.

## CLI and API

The CLI surface is:

```bash
claw archive plan|export|verify|inspect|import|restore|doctor --json
```

`export --output PATH.clawbackup` writes a local readable archive directory with
root `manifest.json` and contract paths. It refuses to overwrite an existing
archive path. `verify`, `inspect`, `import`, and `restore` accept
`--archive PATH.clawbackup` and fail closed for missing manifests, invalid JSON,
missing files, hash mismatches, plaintext secret findings, and copied external
read-only sources. `restore --approve` remains a dry run unless
`--confirm-restore` exactly matches the target root.

The API contracts are:

- `POST /v1/archives/plans`
- `POST /v1/archives/exports`
- `POST /v1/archives/verifications`
- `POST /v1/archives/import-previews`
- `POST /v1/archives/restores`

`export`, `import`, and `restore` are dry-run/preview unless the signed host
supplies the required proof and the user approves the mutating operation.
