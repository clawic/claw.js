# Redacted Physical Validation Evidence

This artifact records public-safe evidence from isolated physical validation for
the Nodes, Cluster, And Local Forge program. It intentionally excludes raw
hostnames, IP addresses, SSH aliases, user paths, transcripts, logs,
screenshots, credentials, private keys, and provider details.

## NCLF Physical Core Identity Validation

- Evidence id: `nclf-physical-core-identity-2026-06-02`.
- Scope: compiled `@clawjs/core` identity/locator/handshake/rotation
  contracts executed on two approved isolated macOS remotes.
- Isolation: each remote used a newly created temporary test root; the run did
  not read or write real framework roots, keychains, LaunchAgents, provider
  credentials, live services, pushes, publishes, uploads, tags, or paid APIs.
- Copied inputs: compiled `packages/clawjs-core/dist`, package metadata, and
  the runtime dependency needed to import the compiled module.
- Output retained in this repository: this redacted summary only.
- Cleanup: temporary remote test roots created for this validation were removed
  after the run.

| Check | Result | Evidence |
| --- | --- | --- |
| Same `nodeId` survives locator changes. | passed on both approved isolated remotes | Core identity contract kept one `nodeId` and one fingerprint while replacing locator observations. |
| Stale or changed locators do not become authority. | passed on both approved isolated remotes | Locator observations kept `authority: false`. |
| Known key on a new locator requires a signed handshake receipt. | passed on both approved isolated remotes | Handshake receipt required proof of possession and matching expected fingerprint before `identityVerified`. |
| Known locator with unknown key fails closed. | passed on both approved isolated remotes | Mismatched responder fingerprint returned `accepted: false` and `failClosed: true`. |
| Key rotation requires old-key signature or human re-pairing. | passed on both approved isolated remotes | Unsigned rotation was rejected fail-closed; signed old-key rotation and human re-pairing receipts were accepted. |
| Discovery and transport are not authority. | passed on both approved isolated remotes | Handshake and locator contracts kept discovery/locator authority false. |

## Limits

This was not a live multi-node transport run. It did not prove real Iroh,
Tailscale, LAN, Relay, rendezvous, Coordinator standby promotion, physical Sync
driver execution, or provider interop. Those rows remain `EXTERNAL PENDING`
until approved isolated evidence exists for the actual physical path.

## NCLF Physical Local Forge Validation

- Evidence id: `nclf-physical-local-forge-2026-06-02`.
- Scope: compiled local forge project functions executed on two approved
  isolated macOS remotes.
- Isolation: each remote used a newly created temporary test root and a
  temporary framework data root; the run did not read or write real framework
  roots, existing projects, keychains, LaunchAgents, provider credentials, live
  services, pushes, publishes, uploads, tags, or paid APIs.
- Copied inputs: generated local forge bundle from repository source,
  compiled `packages/clawjs-core/dist`, package metadata, and the runtime
  dependency needed to import the compiled module.
- Output retained in this repository: this redacted summary only.
- Cleanup: temporary remote test roots created for this validation were removed
  after the run.

| Check | Result | Evidence |
| --- | --- | --- |
| Preview does not write forge state. | passed on both approved isolated remotes | Worktree preview returned without creating local forge state. |
| Two worktrees can be indexed for one project. | passed on both approved isolated remotes | Local forge inventory recorded two checkout locators for one project id under the temporary data root. |
| Claim, snapshot, review, and recovery are recorded. | passed on both approved isolated remotes | Local forge state contained one claim, one snapshot, one review, and one recovery receipt. |
| Private and dependency files are excluded or blocked. | passed on both approved isolated remotes | Secret-looking `.env` content was absent from local forge state; dependency folders were excluded by metadata. |
| Existing folders are not silently converted to Git or workspace roots. | passed on both approved isolated remotes | No `.git` or workspace `.claw` directory was created by local forge preview or accepted metadata operations. |
| Recovery remains metadata-only. | passed on both approved isolated remotes | Recovery receipt reported no irreversible data loss and metadata-only mutation policy. |
