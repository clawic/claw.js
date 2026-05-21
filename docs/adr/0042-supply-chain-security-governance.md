# ADR 0042: Supply-chain security governance

Status: Accepted

Date: 2026-05-21

## Context

ClawJS already separates official trust from compatibility, protects package
surfaces, and requires release dry-runs. That is not enough for a serious
supply-chain posture: official artifacts also need SBOM policy, dependency
provenance, lockfile rules, vulnerability triage, dependency review, artifact
attestations, signed checksums, and plugin/sub-app malware handling.

## Decision

- ClawJS owns the canonical supply-chain policy for framework packages,
  generated templates, sub-apps, plugins, marketplace packages, CLI, and
  release metadata. Clawix mirrors this policy for host/app artifacts.
- Existing debt may be inventoried in a baseline, but official release flows
  fail when release-critical surfaces are missing required supply-chain
  controls.
- Every package or release surface is registered in
  `docs/supply-chain-security.manifest.json` with lockfile, SBOM,
  provenance, vulnerability triage, dependency review, artifact integrity, and
  malware-review expectations.
- Official npm publishing uses trusted publishing/provenance where available.
  Official CI-built artifacts use build provenance attestations. Native app
  artifacts use signed checksums and platform signing.
- `claw verify` is the public verification surface for release manifests and
  plugin/sub-app packages. It verifies local metadata and fails closed for
  missing signatures, SBOM references, provenance references, checksums, or
  malware-review metadata.
- Security reports follow the SLA in `docs/supply-chain-security.md`.

## Performance Impact

Supply-chain checks add release and CI work such as SBOM generation, dependency review, vulnerability triage, provenance, checksums, and malware review. Those costs are intentionally placed in validation and publication lanes, not runtime hot paths. Package install size, generated artifacts, lockfile churn, and CI runtime should be monitored so security evidence remains bounded and does not make local development unnecessarily heavy.

## Decision Tensions

- **Prioritized axes**: official artifact integrity, dependency provenance, vulnerability response, malware containment, and user trust.
- **Constrained axes**: fast unreviewed dependency adoption and unofficial artifact claims are constrained for release-critical surfaces.
- **Tradeoffs accepted**: official publishing becomes slower and more evidence heavy; that is accepted because compromised dependencies or plugins can break the official trust model.
- **Debt or pending evidence**: baseline package coverage, attestations, SBOM completeness, and plugin/sub-app review evidence remain staged until the manifest and release lanes enforce them fully.

## Surface Parity

- **Human surface**: `docs/supply-chain-security.md`, `SECURITY.md`,
  `RELEASING.md`, PR templates, and the decision map explain the policy.
- **Programmatic surface**: `scripts/supply-chain-security-check.mjs` validates
  repo policy and release gates; `claw verify release|plugin --json` validates
  specific artifacts.
- **Persistence**: durable policy and baseline state live in
  `docs/supply-chain-security.manifest.json`; generated SBOMs and attestations
  are release artifacts, not committed source, except fixtures.
- **Validation**: `npm run test:docs`, `npm run test:release`,
  `npm run publish:dry-run`, `npm run release:publish`, and package
  `prepublishOnly` gates run the supply-chain guard.

## Consequences

Official trust is no longer a label backed only by release notes and package
metadata. Maintainers must keep dependency changes reviewable, generated
artifacts verifiable, and plugin/sub-app activation fail-closed when provenance
or malware-review evidence is missing. Source and community builds remain
allowed, but they must not imply upstream supply-chain attestation.

## Discovery Route

- **Canonical name**: `adr:supply-chain-security-governance`.
- **AGENTS/CLAUDE**: `AGENTS.md` -> `docs/decision-map.md`.
- **Skill**: `public-hygiene-review` and release validation lanes.
- **Search terms**: supply chain security, SBOM provenance, `claw verify`,
  malware review, trusted publishing, release evidence.
