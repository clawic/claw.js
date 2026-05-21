# Supply-chain security

This policy governs ClawJS official packages, CLI releases, generated
templates, sub-apps, plugins, marketplace packages, and release metadata.
Clawix mirrors it for host and native app artifacts.

## Required controls

- **SBOM**: every official package or app artifact has a CycloneDX JSON SBOM
  generated during the release process. SBOMs are attached to release evidence;
  they are not committed unless they are fixtures.
- **Provenance**: npm packages use trusted publishing/provenance where
  available. CI-built artifacts use GitHub artifact attestations or equivalent
  SLSA provenance. Native bundles use signed checksums plus platform signing.
- **Lockfiles**: installable apps, services, and native package roots commit
  their package-manager lockfile or resolved dependency file. Templates may
  omit lockfiles only through an explicit manifest exception.
- **Dependency review**: new runtime dependencies require a review note that
  covers maintainer/source, license, install scripts, native code, transitive
  risk, OpenSSF or registry health where available, and why the dependency is
  needed.
- **Vulnerability triage**: exploitable critical issues require mitigation or a
  release plan within 24 hours and fix/disablement within 72 hours. High issues
  target 7 days, medium 30 days, and low 90 days. Non-exploitable findings use
  VEX-style triage notes.
- **Plugin and sub-app malware handling**: import or activation must inspect
  manifests, lifecycle scripts, native binaries, capability deltas,
  obfuscation/minification, network/native permissions, signatures, and
  provenance before activation. Unsafe or unknown packages fail closed or enter
  explicit review/quarantine.

## Release evidence

Official release evidence must include:

- artifact name, version, and source revision;
- SHA-256 checksum for every package, tarball, bundle, or installer;
- SBOM reference for every artifact;
- provenance or attestation reference for every artifact;
- signature or signed-checksum reference for official binary artifacts;
- vulnerability triage summary and dependency-review status.

`scripts/supply-chain-security-check.mjs --release` is the release gate for
the repository policy. `claw verify release --manifest <file> --json` verifies
a concrete release evidence manifest. `claw verify plugin <dir|tgz> --json`
verifies plugin or sub-app package metadata before activation.

## External anchors

The policy aligns with CISA SBOM guidance, SLSA build provenance levels,
CycloneDX SBOM/VEX, npm trusted publishing/provenance, GitHub artifact
attestations, and Sigstore/cosign-style signed artifact verification.
