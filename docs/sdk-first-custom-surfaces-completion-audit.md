# SDK-first custom surfaces completion audit

Source conversation: `019e403c-3837-7f02-9b78-532c43cdd997`

Status: `active_goal_not_complete`

This public audit is the ClawJS-safe closure gate for the SDK-first custom
surfaces and nonblocking shell goal. The private source session path is
intentionally not published here. Before the private goal can close, every row
must be verified against the current ClawJS and Clawix trees, and any remaining
external or private-audit row must have either approved evidence or a later
explicit user decision accepting the blocker. When a sibling Clawix checkout is
available, `scripts/verify-sdk-first-custom-surfaces-goal.mjs` also inspects
the host bridge, protected-route, variant, Swift surface, and shell isolation
evidence in that checkout. A private source-session verifier has re-read the
source conversation and confirmed the 24 decision prompt ids, including the
three interrupted unanswered ids; the verifier and private path are not
published in this repo.

## Current Rows

| ID | Requirement | Current public evidence | Remaining closure gate | Status |
| --- | --- | --- | --- | --- |
| CLJ-SDK-001 | ADR, plan, decision-map, and discoverability routing for SDK-first custom surfaces. | ADR 0032, `docs/sdk-first-custom-surfaces-plan.md`, decision-map, discoverability registry, and this audit route the framework contract and `executionBoundary`. | Keep routing current with implementation changes. | VALIDATED LOCAL |
| CLJ-SDK-002 | Shared capability catalog and SDK facade expose custom-app capability metadata and risk. | `packages/clawjs-core/src/capability-catalog.ts`, `packages/clawjs-node/src/create-claw.test.ts`, and core tests expose capability IDs, risk maps, SDK source, high-risk classifications, and explicit gaps. The Network Control Plane now provides a typed executable route-family example with Zod schemas, Gateway route policy evaluation, aggregate redaction, Monitor-backed event audit, disabled-by-default rule suggestions, CLI coverage, and Clawix host projection evidence when the sibling checkout is present. The sibling Clawix checkout now mirrors ClawJS `system.telemetry.snapshot` and `system.telemetry.history` as low-risk local-wide reads in `AppCapabilityCatalog`, `window.clawix.system.telemetry`, `AppBridgeMessageHandler`, and `SystemTelemetryBridge.localStatusBridge`, with SDK-contract tests for snapshot/history payloads. It also exposes the shared `mac.action.plan` capability through `window.clawix.mac.planAction()` as an approval-gated, dry-run-only Mac Control plan projection. | Executable capability route families outside the current custom-app read projection, Network Control Plane, telemetry read projection, and Mac plan-only projection still need schema validation, policy, audit, and tests before being marked complete. | PARTIAL LOCAL |
| CLJ-SDK-003 | Custom-app SDK inspection exposes `executionBoundary` across CLI/API/MCP/Relay and declares those surfaces metadata-only. | `packages/clawjs-core/src/custom-app-sdk-inspection.ts`, inspect CLI tests, Runtime E2E tests, MCP tests, and Relay tests expose `metadata_only_contract_catalog`, `executesCapabilityCalls: false`, and `sdk_host_bridge`. | Keep new contract projections non-executable unless a later ADR explicitly changes the boundary. | VALIDATED LOCAL |
| CLJ-SDK-004 | Ordinary local reads/list/search/filter/composition use SDK/resource/search/DB contracts, not direct SQLite or schema creation. | Custom-app Search/DB/resource schemas validate read paths, collection IDs reject SQLite internals and path escapes, and Runtime POST execution to `contracts/custom-app-sdk` returns 404. | Any future custom collection/schema creation needs an explicit decision or approval model. | VALIDATED LOCAL |
| CLJ-SDK-005 | High-risk actions stay brokered: secrets, native permissions, physical/IoT, external/cost, destructive, and regulated actions do not gain plaintext or unapproved execution. | Capability catalog and custom-app contract schemas expose approval-required dispatch modes, no plaintext secret broker, Mac plan-only contracts, Clawix `window.clawix.mac.planAction()` plan-only host bridge coverage, and IoT external-pending dispatch metadata. | Signed-host native execution and live IoT/provider actions remain externally pending until approved receipts and same-machine evidence exist. | EXTERNAL PENDING |
| CLJ-SDK-006 | Service API, MCP, and Relay custom-app routes remain contract projections and do not execute Search/DB/action calls. | Runtime, MCP, and Relay tests cover `clawjs.custom_app_sdk`, `/v1/contracts/custom-app-sdk`, and `/v1/remote/custom-app-sdk` as read-only metadata projections. | Any future remote execution lane needs a separate contract, policy, audit, and tests. | VALIDATED LOCAL |
| CLJ-SDK-007 | Clawix consumes the shared framework contract through a host bridge rather than forking execution semantics. | The required sibling Clawix checkout is present for this closure gate, and `scripts/verify-sdk-first-custom-surfaces-goal.mjs --require-clawix` verifies `clawix.capabilities.contracts()`, `window.clawix`, host bridge execution, protected routes, variants, Swift surface isolation, shell isolation, Network Control Bridge projection evidence, and imported/marketplace app trust handling with host-local `app-package-trust-roots.json`, signature key/trust-source provenance, activation ficha, and audit tests. | Keep the `--require-clawix` verifier path current whenever Clawix integration evidence changes. | VALIDATED LOCAL |
| CLJ-SDK-008 | Shells and hosts remain modular and nonblocking when custom surfaces, Search, DB, connectors, providers, or Swift/Web app hosts fail or load. | Clawix has synthetic route supervisor and shell fast-path tests; the framework ADR requires isolated failure domains and bounded/cancelable work. The sibling Clawix checkout now records a redacted installed-app Time Profiler smoke that launched `/Applications/Clawix.app` under Instruments, attached Instruments to `/Applications/Clawix.app/Contents/MacOS/Clawix`, exercised Web and Swift custom-surface routes, sidebar scroll, and chat composer editing, and kept raw trace artifacts private because Instruments captures local environment details. | Complete real signed-app UI/Instruments captures for rescue, deliberately delayed heavy surfaces, and full stack-attributed analysis remain required. | EXTERNAL PENDING |
| CLJ-SDK-009 | Unanswered `data_access_lock`, `custom_collections`, and `cli_escape_hatch` prompts are not treated as approvals. | Framework schemas and routes reject direct SQL, DDL/schema creation, SQLite internals, path-like collections, and contract-route POST execution. | Any future loosening requires an explicit user decision and matching policy/tests. | VALIDATED LOCAL |
| CLJ-SDK-010 | Final decision-by-decision source-session audit before `update_goal`. | A private source-session verifier re-read the source JSONL, confirmed 24 prompt ids, 21 captured answers, 3 interrupted unanswered ids, and the final plan block; this public audit intentionally does not publish the private path. | Re-run the private verifier before any future closure attempt and keep every remaining public partial/external row blocked until resolved or explicitly accepted. | VALIDATED PRIVATE |

## Closure Rule

The goal is not complete while any of these are true:

- Any row above is `PARTIAL LOCAL` or `EXTERNAL PENDING`.
- Complete real signed-app UI/Instruments performance evidence is missing.
- Signed-host native execution, live IoT/provider, or marketplace trust
  validation lacks explicit approval, receipts, audit, and same-machine
  evidence.
- The private source-session verifier has not been re-run against the current
  tree before a future closure attempt.
- The ClawJS verifier or sibling Clawix validation referenced by this audit
  fails.

Do not call `update_goal` for this goal until every row is either
`VALIDATED LOCAL` with current evidence or explicitly accepted by a later user
decision.
