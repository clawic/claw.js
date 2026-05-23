# ADR 0025: Pre-V1 version governance

## Status

Accepted. Source conversation:
`source:pre-v1-version-governance`.

## Context

ClawJS and Clawix are still pre-public. Agents are iterating quickly on `main`,
but repeated `v2`, `v3`, package, schema, protocol, and changeset bumps create
future support obligations before a real V1 has been frozen.

The current `v1` and `schemaVersion: 1` labels are useful coordination labels,
but before release they must not be treated as irreversible public
compatibility promises.

## Decision

ClawJS is the canonical source of version governance. Clawix consumes and mirrors
host, bridge, UI, and storage consequences without owning a separate policy.

The active phase is `pre_v1_mutable` with branch policy `main_mutable`. The only
approved phase transition is an explicit user instruction such as `congela V1`
or `freeze V1`.

Until that freeze, owned public or persistent contract versions are frozen:

- no semver or package version bumps,
- no owned `schemaVersion` or `protocolVersion` bumps,
- no owned `/v2+` route prefixes,
- no owned `*.v2+` surface IDs,
- no owned file-format version bumps,
- no release tags or publish/version flows as ordinary work,
- no new changesets for ordinary public-surface work.

Existing `.changeset/*.md` files are consolidated into
`docs/pre-v1-release-ledger.json`. They are frozen pre-release input, not
approval to bump packages.

External, platform, and dependency versions remain allowed when explicitly
classified as external: third-party API versions, OS/SDK versions, dependency
lockfiles, upstream release tags, and provider model/version names.

## Implementation

The machine-readable policy is exported from
`packages/clawjs-core/src/version-governance.ts` and exposed through:

```bash
claw inspect version-governance --json
```

The policy is also registered as surface `claw.versionGovernance.preV1` so
`claw inspect why claw.versionGovernance.preV1 --json` can route agents to the
governance surface before they edit version-sensitive contracts.

The inspect surface is guarded by `packages/clawjs/src/inspect-cli.test.ts`,
which verifies the active policy, approval gate, frozen changeset ledger
reference, external allowlist, and `claw.versionGovernance.preV1` routing.

## Consequences

Agents may overwrite and normalize pre-public owned surfaces without creating
new versions until V1 is explicitly frozen. When V1 is frozen, this ADR must be
updated or superseded with the post-freeze compatibility and migration policy.
