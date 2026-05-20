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
4. Confirm [TERMS.md](TERMS.md), [PRIVACY.md](PRIVACY.md), [DISCLAIMER.md](DISCLAIMER.md), [SAFETY.md](SAFETY.md), [REGULATED_DOMAINS.md](REGULATED_DOMAINS.md), [EULA.md](EULA.md), and `docs/regulated-domain-safety.md` are current.
5. Confirm public README, package docs, CLI help, examples, demos, and website copy do not make unqualified autonomy, professional-advice, or compliance-ready claims.
6. Classify every new sensitive collection, connector, agent, CLI route, MCP tool, Relay route, app surface, demo, or docs claim against `docs/regulated-domain-safety.md` before treating the release candidate as complete.
7. Confirm official/source/community/compatible wording remains aligned with
   [ADR 0033](docs/adr/0033-open-standard-official-trust.md) and
   [official trust and compatibility](docs/official-trust-and-compatibility.md).
8. Run `npm run publish:dry-run`.
9. Verify adapter support/stability metadata and docs support matrix are current.
10. Review the pending release PR created from changesets.
11. Update [CHANGELOG.md](CHANGELOG.md) in that release PR if the top-level note needs curation.
12. Merge the release PR into `main`.
13. Publish packages manually only after confirming the dry run and authentication state.
14. Tag the release as `v<semver>` manually after publishing.
15. Copy the changelog entry into the GitHub release notes if you want a manually curated GitHub release body.

## Channel-Specific Release Checklists

These checklists do not approve release actions. Every npm publish, GitHub tag,
GitHub release, website deployment, app upload, or binary distribution requires
fresh maintainer approval for that exact action.
Unavailable provider, signed-host, store, registry, website, app, or binary
validation must be recorded in `docs/governance/legal/external-pending.md` as
`EXTERNAL PENDING`; do not treat it as passed.

### npm Package Channel Checklist

1. Run `node --import tsx ./scripts/verify-regulated-domain-safety-goal.mjs`.
2. Run `npm run publish:dry-run` after the release PR/version bump targets an
   unpublished package version, then review the package file lists. If the
   current version already exists in npm, record the lane as `EXTERNAL PENDING`
   rather than treating it as passed.
3. Confirm every public package ships `README.md` with regulated-domain
   disclaimers and links to Terms, Privacy, Disclaimer, Safety, Regulated
   Domains, and EULA where applicable.
4. Publish with `npm run publish:packages` or `npm run release:publish` only
   after explicit approval for that exact npm action.

### GitHub Release Channel Checklist

1. Run the release checklist and npm package dry run if release assets mention
   packages or CLI install commands.
2. Confirm release notes do not expose private paths, credentials, logs,
   production user data, signing details, or unpublished store metadata.
3. Link current legal docs and regulated-domain policy from the GitHub release
   notes when package, CLI, app, or binary artifacts are attached.
4. Link current official trust and compatibility docs when artifacts could be
   confused with source or community builds.
5. Create tags or GitHub releases only after explicit approval for that exact
   GitHub action.

### Website Channel Checklist

1. Run `node --import tsx ./scripts/verify-regulated-domain-safety-goal.mjs`.
2. Build the website from the release candidate and confirm public copy remains
   conservative: no professional-advice, final-decision, compliance-ready,
   emergency-service, or autonomous-filing claims.
3. Confirm demos and examples remain synthetic and consent-safe.
4. Deploy or publish the website only after explicit approval for that exact web
   action.

### App And Binary Channel Checklist

1. Run `node --import tsx ./scripts/verify-regulated-domain-safety-goal.mjs`.
2. Confirm downstream Clawix or host app release candidates expose current EULA,
   legal consent, 18+ confirmation, regulated-domain labels, export/share
   review, support opt-in, and remote/provider opt-ins.
3. Treat signing, notarization, TestFlight, App Store, installer, package
   manager, and hosted binary uploads as separate exact actions requiring
   separate approval.

## Package map

- `@clawjs/core`: scoped public low-level contracts package
- `@clawjs/search`: scoped search index and query package
- `@clawjs/search-mcp`: scoped search MCP server package
- `@clawjs/marketplace`: scoped marketplace contracts and registry package
- `@clawjs/profile`: scoped profile and consent metadata package
- `@clawjs/index`: scoped local index service package
- `@clawjs/claw`: scoped public SDK package and primary entrypoint
- `@clawjs/workspace`: scoped local-first workspace layer
- `@clawjs/node`: scoped compatibility wrapper that reexports the SDK
- `@clawjs/database`: scoped database/storage package
- `@clawjs/agents`: scoped agent contracts package
- `@clawjs/integrations`: scoped integration contracts package
- `@clawjs/marketplace-agent-policy`: scoped marketplace agent policy package
- `@clawjs/marketplace-dating`: scoped marketplace dating vertical package
- `@clawjs/marketplace-real-estate`: scoped marketplace real-estate vertical package
- `@clawjs/marketplace-vehicle`: scoped marketplace vehicle vertical package
- `@clawjs/audio`: scoped audio package
- `@clawjs/sessions`: scoped sessions package
- `@clawjs/user-model`: scoped user model package
- `@clawjs/runtime`: scoped runtime package
- `@clawjs/sandbox`: scoped sandbox package
- `@clawjs/mcp`: scoped MCP package
- `@clawjs/voice`: scoped voice package
- `@clawjs/channel-base`: scoped channel base package
- `@clawjs/mesh`: scoped mesh package
- `@clawjs/signals-core`: scoped signals core package
- `@clawjs/signals`: scoped signals package
- `@clawjs/ssh-client`: scoped SSH client package
- `@clawjs/cli`: scoped CLI package that exposes the `clawjs` binary
- `@clawjs/openclaw-plugin`: scoped plugin package for the OpenClaw runtime
- `@clawjs/openclaw-context-engine`: scoped context engine package for the OpenClaw runtime
- `create-claw-app`: unscoped scaffolder for app bootstrapping
- `create-claw-agent`: unscoped scaffolder for agent-first repository bootstrapping
- `create-claw-server`: unscoped scaffolder for headless server bootstrapping
- `create-claw-plugin`: unscoped scaffolder for broader plugin package bootstrapping
- `eslint-config-claw`: public shared ESLint preset

The release order matters because marketplace/profile packages feed the index
and vertical packages, `@clawjs/claw` depends on `@clawjs/core`,
`@clawjs/workspace` depends on the SDK, the compatibility wrapper depends on
`@clawjs/claw`, `@clawjs/signals` depends on `@clawjs/signals-core`, the CLI
depends on `@clawjs/claw`, and the scaffolder templates depend on the published
runtime packages.

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
CLAW_ALLOW_PRE_V1_RELEASE=1 CLAW_RELEASE_APPROVED_FOR=release-version npm run release:version
```

## Publish commands

Dry run the full release from the workspace root:

```bash
npm run publish:dry-run
```

Publish for real from the workspace root after authentication:

```bash
CLAW_ALLOW_PRE_V1_RELEASE=1 CLAW_RELEASE_APPROVED_FOR=release-publish npm run release:publish
```

Direct package publish, only for the same approved npm release action:

```bash
CLAW_ALLOW_PRE_V1_RELEASE=1 CLAW_RELEASE_APPROVED_FOR=publish-packages npm run publish:packages
```

Direct publish from inside an individual public package is intentionally a
separate approval target:

```bash
CLAW_ALLOW_PRE_V1_RELEASE=1 CLAW_RELEASE_APPROVED_FOR=direct-package-publish npm publish
```
