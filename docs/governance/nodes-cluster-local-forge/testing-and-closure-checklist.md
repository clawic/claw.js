# Testing And Closure Checklist

## Required Local Validation

- [x] `npm run test:docs`. Evidence: final full rerun passed after package build refresh, persistent-surface fixture exceptions, evolution baseline refresh, codebase manifest refresh, source-size baseline review, and code-hygiene report refresh.
- [x] `node scripts/adr-operational-coverage-check.mjs`
- [x] `node scripts/discoverability-check.mjs`
- [x] `node scripts/source-decision-audit-check.mjs --self-test`
- [x] `node scripts/source-decision-audit-check.mjs`
- [x] `npm run privacy:check`. Evidence: rerun after local forge snapshot/preflight changes passed.

## Discovery Proof

- [x] `claw search "node cluster control plane" --json` returns ADR 0053.
- [x] `claw search "local forge worktree review" --json` returns ADR 0054.
- [x] `claw inspect why adr:nodes-cluster-control-plane --json` returns ADR 0053 or its registered route.
- [x] `claw inspect why adr:local-forge-worktree-review --json` returns ADR 0054 or its registered route.

## Focused Implementation Validation

- [x] CLI registry/router parity after any new command. Evidence: `node --import tsx scripts/verify-cli-registry-router-parity.mjs` passed with 177 commands after local forge project subcommand extensions; `node --import tsx scripts/generate-cli-router.mjs --check` also passed.
- [x] Surface registry and route graph checks after any stable route or resource. Evidence: final `test:docs` run passed route graph, surface evidence, surface narrative, and surface resource contract guards.
- [x] Storage boundary guard after any new path, DB, sidecar, or file-format surface. Evidence: local forge state is under configured `CLAW_DATA_DIR`/Claw data root, focused tests use isolated roots, and final `test:docs` passed storage-boundary checks.
- [x] Remote/sync/gateway tests after any multi-node or Gateway exposure. Evidence: no Gateway/Relay exposure was added; focused remote contract and CLI tests passed.
- [x] Governance tests after any new authority, grant, approval, workspace, project, or policy surface. Evidence: no new authority/grant/approval store was added; project preview tests passed.
- [x] No irreversible data loss tests after recovery, merge, delete, rollback, or destructive cleanup. Evidence: focused recovery test verifies metadata-only receipts with `noIrreversibleDataLoss`; merge/delete/rollback/destructive cleanup remain unavailable.
- [x] Privacy checks after local forge preflight or snapshot changes. Evidence: focused local forge test verifies blocked `.env` content is not persisted in snapshot/review state; `npm run privacy:check` passed after these edits.

## Durable Node Identity Scenarios

- [x] Same `nodeId` survives an IP or LAN locator change after a signed heartbeat or handshake. Evidence: hermetic contract test keeps one `nodeId` with changed observed locators and verified handshake; redacted isolated physical core validation passed on two approved remotes.
- [x] Same `nodeId` survives a Tailscale or VPN locator change after identity verification. Evidence: hermetic contract test records a Tailscale-style locator as non-authority on the same identity; redacted isolated physical core validation passed on two approved remotes.
- [x] Stale locators do not delete node identity or grant new trust by themselves. Evidence: locator schema marks `authority: false`; tests keep multiple locator observations; redacted isolated physical core validation passed on two approved remotes.
- [x] A known IP or locator with an unknown key is rejected and remote operations fail closed. Evidence: `evaluateRemoteTransportIdentity` mismatch test returns `failClosed: true`; redacted isolated physical core validation passed on two approved remotes.
- [x] A known key on a new locator is accepted only after proof of private-key possession. Evidence: `RemoteTransportHandshakeReceipt` requires `proofOfPossession` and sets `identityVerified` only when expected/responder fingerprints match; redacted isolated physical core validation passed on two approved remotes.
- [x] Key rotation requires an old-key signature or explicit human re-pairing evidence. Evidence: `nodeKeyRotationReceiptSchema`, `createNodeKeyRotationReceipt`, focused remote contract tests, and redacted isolated physical core validation reject unsigned rotation fail-closed and accept only signed old-key rotation or human re-pairing refs.
- [x] Reconnect after disconnect uses identity verification before marking remote work available. Evidence: `nodeReconnectReceiptSchema`, `createNodeReconnectReceipt`, and focused remote contract tests fail closed on mismatched identity and accept reconnect only after a verified handshake.
- [x] Discovery through Iroh, rendezvous, Relay, Tailscale, or LAN does not grant trust without a matching trusted identity. Evidence: `discoveryAuthority: false`, locator `authority: false`, trust decisions bind to `node_identity_fingerprint`, and redacted isolated physical core validation passed on two approved remotes.

## External Pending Policy

- [ ] EXTERNAL PENDING: Physical multi-node failover remains `EXTERNAL PENDING` until approved device evidence exists. Blocker: no approved isolated physical multi-node run was completed. Reentry: run on approved temporary roots only. Evidence required: redacted promotion/failover receipts.
- [ ] EXTERNAL PENDING: Physical sync driver execution remains `EXTERNAL PENDING` until signed-host/Coordinator evidence exists. Blocker: signed-host/Coordinator physical driver proof is unavailable. Reentry: approved physical run with redacted receipts.
- [ ] EXTERNAL PENDING: Provider interop remains `EXTERNAL PENDING` until explicit approval, brokered credentials, fixtures, and redacted evidence exist. Blocker: no explicit provider approval/brokered credentials in this thread. Reentry: approved provider fixture/live run.
- [x] Isolated physical local forge review/recovery evidence is redacted and public-safe. Evidence: `physical-validation-redacted.md` records temporary-root validation for two approved remotes without private hosts, IPs, aliases, paths, logs, transcripts, credentials, screenshots, or provider material.
- [x] Large-file backend behavior remains conservative until Git LFS/blob/provider policy is explicitly enabled. Evidence: ADR 0054 accepts V1 `block_by_default`; focused local forge tests prove files over 10 MiB are blocked from preflight, snapshots, and review diffs instead of stored.
- [x] Live external services, paid APIs, pushes, uploads, publishes, tags, and real secret reveals are prohibited without explicit approval in the current thread. Evidence: none were performed.

## Final Closure Gate

- [x] Temporary notes are absent from the worktree or replaced by this public-safe folder. Evidence: public-safe NCLF folder is registered; no transcript text was added.
- [x] ADR 0053 and ADR 0054 are accepted, reserved, discoverable, and covered by operational coverage. Evidence: baseline ADR/discoverability/source-audit checks passed.
- [x] `source-audit.md` has rows for every decision captured from the working notes. Evidence: `NCLF-001` through `NCLF-039`.
- [x] Every checklist item is checked, `EXTERNAL PENDING`, blocked with reentry, or superseded. Evidence: this checklist and sibling checklists now classify remaining local and external gaps explicitly.
- [x] Final validation has been rerun after the last edit. Evidence: final `npm run test:docs` passed; focused NCLF tests, typecheck, privacy, discoverability, source-audit, CLI parity, route graph, surface evidence, surface narrative, surface resource contract, dense-data, remote-sync, surface-route, connector, search, telemetry, SDK-first, regulated-domain, JSON contract, persistent-surface, evolution, source-size, codebase manifest, and code-hygiene checks passed.
- [x] No remaining framework decision from this program exists only in memory or a scratch document. Evidence: remaining merge/conflict, failover, rotation, signed-host, surface parity, and physical validation work is recorded as blocked or `EXTERNAL PENDING` in public checklists.
