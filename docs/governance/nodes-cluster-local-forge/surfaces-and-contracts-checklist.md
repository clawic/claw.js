# Surfaces And Contracts Checklist

## CLI And Inspect

- [x] Register every new public CLI command in the canonical `claw` registry. Evidence: `get`, `describe`, `where`, and `risk` entries in `packages/clawjs-core/src/cli-command-registry.ts`.
- [x] Do not introduce public `clawjs`, `clawix`, or standalone commander surfaces. Evidence: only `claw` registry/router entries were added.
- [x] `claw get` routes to existing domain commands and stores rather than duplicating business logic. Evidence: `claw get nodes|resources|worktrees --json` reads registered local contracts; worktrees read the local forge store when records exist and return `blocked` only when no local checkout record exists.
- [x] `claw describe`, `claw where`, and `claw risk` return stable JSON envelopes. Evidence: focused CLI tests in `packages/clawjs/src/cli-remote-sync-command.test.ts`.
- [x] Worktree/forge commands expose dry-run or preview paths before writes. Evidence: `project attach`, `project worktree`, `project claim`, `project snapshot`, `project review`, and `project recover` preview by default and require `--accept` before writing local forge metadata.
- [x] `claw inspect commands --json` and `claw inspect why ... --json` discover the new surfaces. Evidence: generated CLI router and registry parity passed with 176 commands; ADR discoverability for 0053/0054 passed in baseline.

## SDK, API, MCP, And Relay

- [x] SDK/API/MCP/Relay exposure is added only after local contracts exist. Evidence: `clawCapabilityCatalog` registers NCLF capabilities `nodes.inventory`, `resources.location`, `localForge.inventory`, and `cluster.controlPlane.inspect` with SDK, CLI, service API, MCP, Relay, and host bridge bindings; `custom-app-sdk-contracts.ts` registers their SDK schemas; focused capability catalog tests verify complete resolved surfaces and no pending refs.
- [x] Remote access is classified as `remote-safe`, `local-only`, `blocked`, or `pending`. Evidence: existing remote classification surfaces remain unchanged; new inventory commands are local-read CLI only.
- [x] Gateway projections reuse registered local contracts and do not create parallel APIs. Evidence: no Gateway/Relay API was added in this batch.
- [x] Mutation-shaped remote routes stay dry-run or signed-host/Coordinator gated until physical evidence exists. Evidence: `nodes heartbeat/trust` remain dry-run unless existing `--record` Coordinator flags are supplied; physical transport remains `external_pending`.
- [x] Secret-related routes use secret refs and brokered leases only. Evidence: no new secret plaintext route was added; existing Gateway secret routes remain ref/broker based.

## Persistence

- [x] Add storage builders/registrations for new durable paths, ids, schemas, tables, queues, events, or protocol frames. Evidence: local forge writes `local-forge/local-forge-state.json` under the configured Claw data root and stores worktree, claim, snapshot, review, recovery, and audit records; focused tests use isolated `CLAW_DATA_DIR`.
- [x] Add `surfaceNarrative` for new stable user-facing or agent-facing surfaces. Evidence: `get`, `describe`, `where`, and `risk` narratives in `packages/clawjs-core/src/surface-registry-contracts.ts`.
- [x] Add `resourceContract` for new runtime, storage, queue, stream, daemon, worker, or long-running-agent behavior. Evidence: `get`, `describe`, `where`, and `risk` resource contracts in `packages/clawjs-core/src/surface-registry-contracts.ts`.
- [x] Keep project folders to managed manifest/shim footprint; do not copy full workspace `.claw/` state into project folders. Evidence: existing project tests assert no `.claw` directory is created.
- [x] Keep local forge metadata public-safe and portable. Evidence: local forge state stores paths, hashes, statuses, findings, and receipts, but not file contents or plaintext secrets; focused tests verify secret content is not persisted.

## Documentation And Discovery

- [x] ADR 0053 and ADR 0054 are reserved and accepted.
- [x] This governance folder replaces temporary working notes.
- [x] `docs/decision-map.md` routes both ADRs and this folder.
- [x] `docs/discoverability.registry.json` includes both ADRs and the governance folder.
- [x] `docs/adr-operational-coverage.manifest.json` covers both ADRs.
- [x] `docs/governance/source-decision-audits.registry.json` covers the source audit.
