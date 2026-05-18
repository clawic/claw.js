# Releasing Claw

## Release policy

- Until the user explicitly freezes V1, follow
  [ADR 0025: Pre-V1 version governance](docs/adr/0025-pre-v1-version-governance.md):
  `v1` labels are provisional, package/schema/protocol/API/file-format/surface
  version bumps are blocked, existing changesets are frozen in
  `docs/pre-v1-release-ledger.json`, and `release:version`, `release:publish`,
  and direct package publish flows require the release approval gate.
- Follow semver, but treat all `0.x` releases as potentially fast-moving.
- Published npm packages move in lockstep under one shared version managed by Changesets.
- Every PR that changes a published package, generated template output, or public package surface must include a `.changeset/*.md` entry unless it is docs-only, test-only, or internal-only.
- Update [CHANGELOG.md](CHANGELOG.md) in the release PR before merge so the top-level repository changelog stays curated.
- Do not publish if `npm run ci` fails.
- Treat `main` as the normal tag source. Use `release/0.x` only when patching the current public line without merging all queued work from `next`.
- Keep the Git workflow in sync with [docs/git-workflow.md](docs/git-workflow.md).
- Keep release, changeset, publishing, and privacy decisions aligned with
  [docs/decision-map.md](docs/decision-map.md).

## Versioning workflow

1. Add a changeset in the feature PR with `npm run changeset`.
2. Merge feature PRs into `main` or `next` as usual.
3. Create or update the release PR manually from pending changesets.
4. Review the generated version bump, update the root changelog entry if needed, and merge the release PR into `main`.
5. Publish and tag manually after running the local release gate; GitHub must not publish packages or create tags automatically.

For preview builds from `next`, run prereleases with the npm dist-tag `next` instead of publishing to `latest`.

## Release checklist

1. Run `npm ci`, `npm --prefix examples/demo ci`, and `npm --prefix website ci`.
2. Run `npx playwright install --with-deps chromium`.
3. Run `npm run ci`.
4. Run `npm run publish:dry-run`.
5. Verify adapter support/stability metadata and docs support matrix are current.
6. Review the pending release PR created from changesets.
7. Update [CHANGELOG.md](CHANGELOG.md) in that release PR if the top-level note needs curation.
8. Merge the release PR into `main`.
9. Publish packages manually only after confirming the dry run and authentication state.
10. Tag the release as `v<semver>` manually after publishing.
11. Copy the changelog entry into the GitHub release notes if you want a manually curated GitHub release body.

## Package map

- `@clawjs/claw`: scoped public SDK package and primary entrypoint
- `@clawjs/workspace`: scoped local-first workspace layer
- `@clawjs/node`: scoped compatibility wrapper that reexports the SDK
- `@clawjs/cli`: scoped CLI package that exposes the `clawjs` binary
- `@clawjs/openclaw-plugin`: scoped plugin package for the OpenClaw runtime
- `@clawjs/openclaw-context-engine`: scoped context engine package for the OpenClaw runtime
- `create-claw-app`: unscoped scaffolder for app bootstrapping
- `create-claw-agent`: unscoped scaffolder for agent-first repository bootstrapping
- `create-claw-server`: unscoped scaffolder for headless server bootstrapping
- `create-claw-plugin`: unscoped scaffolder for broader plugin package bootstrapping
- `eslint-config-claw`: public shared ESLint preset
- `@clawjs/core`: scoped public low-level contracts package

The release order matters because `@clawjs/claw` depends on `@clawjs/core`, `@clawjs/workspace` depends on the SDK, the compatibility wrapper depends on `@clawjs/claw`, the CLI depends on `@clawjs/claw`, and the scaffolder templates depend on the published runtime packages.

## Changeset commands

Create a changeset:

```bash
npm run changeset
```

Inspect the pending release plan:

```bash
npm run release:status
```

Apply version bumps locally:

```bash
CLAW_ALLOW_PRE_V1_RELEASE=1 npm run release:version
```

## Publish commands

Dry run the full release from the workspace root:

```bash
npm run publish:dry-run
```

Publish for real from the workspace root after authentication:

```bash
CLAW_ALLOW_PRE_V1_RELEASE=1 npm run release:publish
```
