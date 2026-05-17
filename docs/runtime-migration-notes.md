---
title: Runtime Migration Notes
description: Upgrade and migration notes for runtime adapter behavior and workspace contracts.
---

# Runtime Migration Notes

This repo keeps strict compatibility snapshot parsing for the current workspace
snapshot path. When adapter behavior changes, refresh snapshots through the
runtime probe instead of accepting ad hoc file rewrites.

## Snapshot canonicalization

Current compat snapshots live at:

- `.claw/state/observed/compat/runtime-snapshot.json`

`canonicalizeCompatSnapshotFile()` rewrites an already-valid v1 snapshot into
canonical JSON formatting after `repairWorkspace()` recreates the internal
workspace layout. It does not infer missing fields, unwrap alternate payloads,
or coerce old capability shapes; snapshots without a deliberate
`schemaVersion: 1` are treated as invalid and should be regenerated.

## When runtime compatibility breaks

The compatibility contract is no longer tied to a single CLI surface. It is based on:

- adapter identity
- runtime version
- boolean capability summary
- typed `capabilityMap`
- adapter diagnostics

If a runtime changes behavior:

1. Refresh the runtime output into the existing schemas.
2. Let `buildCompatDriftReport()` decide whether the stored snapshot is stale.
3. Only then update docs or caller code that depends on the new shape.

Examples of adapter-specific probe surfaces that may drift:

- `openclaw --version`
- `openclaw models status --json`
- `zeroclaw providers`
- `zeroclaw models refresh`
- `picoclaw model_list --json`
- `nanobot`, `nanoclaw`, `nullclaw`, `ironclaw`, `nemoclaw`, or `hermes` config and catalog commands

## Schema versions

The JSON records stored by ClawJS all carry a `schemaVersion`. That includes:

- workspace manifest
- compat snapshot
- capability report
- workspace state snapshots
- provider state snapshots
- scheduler, memory, skills, and channels snapshots
- template pack schema

If you introduce a breaking runtime-compatibility change, bump the relevant schema version, keep the current-path parser strict, and document:

- what changed
- which commands or APIs now require a fresh `compat --refresh` or `workspace repair`

## Practical recovery path

If a workspace is partially broken after an adapter upgrade, the usual recovery sequence is:

```bash
claw \
  --runtime zeroclaw \
  compat \
  --workspace /path/to/workspace \
  --refresh

claw \
  --runtime zeroclaw \
  doctor \
  --workspace /path/to/workspace

claw \
  --runtime zeroclaw \
  workspace repair \
  --workspace /path/to/workspace
```

That sequence refreshes the runtime snapshot, checks drift, and repairs the managed workspace layout without touching unrelated user files.
