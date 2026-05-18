# Mac Control Plane Closure Audit

Source conversation: `019e366f-8e14-7e51-8817-9820d2914dc4`

Closure state: `active_goal_not_complete`

This audit is the final gate for the Mac Control Plane goal. The goal must not
be marked complete while any binding row below is `partial` or `blocked`.
Rows may close only when the implementation, public docs, tests, legacy
disposition, and signed-host validation evidence exist, or when the row is
explicitly moved to an accepted `EXTERNAL PENDING` state.

The source session contains 83 `request_user_input` prompts. They were reviewed
as structured planning scaffolding, but they were not answered through selected
UI choices and are not counted as user-selected answers. The binding decisions
are the free-form user corrections recorded in
`docs/mac-control-plane-source-decision-audit.md` as `MCQ-001` through
`MCQ-018`.

## Requirement Status

| ID | Closure status | Required evidence before close |
| --- | --- | --- |
| MCQ-001 | partial | The local Mac is represented as a first-class governed Claw surface in ADR 0023, `docs/mac-control-plane.md`, the route graph, CLI roots, MCP/API programmatic surfaces, `Clawix embedded`, and `Claw.app`. Remaining blocker: standalone signed `Claw.app` validation is not complete. |
| MCQ-002 | implemented | The atlas, command roots, coverage states, and macOS 14+ drift matrix index the known V1 surface. Evidence: `MAC_CAPABILITY_ATLAS`, `docs/mac-control-plane-version-drift-audit.md`, source URLs for Apple release notes/protected resources/CoreWLAN/AX/Shortcuts, and verifier coverage requiring every atlas capability in the drift audit. |
| MCQ-003 | implemented | Wrapper-friendly actions use stable broker strategies where macOS already provides reliable commands, including `networksetup` for Wi-Fi and `/usr/bin/shortcuts` for Shortcuts. Evidence: ADR 0023, atlas backend strategies, CLI/core tests, and host broker tests. |
| MCQ-004 | implemented | Stable IDs, schemas, routes, model-facing CLI semantics, and major-version drift evidence exist. Evidence: strict schemas, route graph contracts, verb audit, version drift audit, and verifier checks for every atlas capability id, backend strategy, and canonical CLI shape. |
| MCQ-005 | partial | Governance and audit paths exist through `mac.directCliAction`, `claw.mac.actionBroker`, receipts, host bridge tests, and the Clawix local timeline. Remaining blocker: final signed standalone host audit validation remains blocked. |
| MCQ-006 | implemented | Roles, packs, allow/block grants, risk tiers, Clawix policy panel state, pending approvals, and `global inbox` projection exist. End-to-end signed-host policy editing is persisted in `mac-control-policy-grants.json` with host bridge `list`/`upsert`/`revoke` actions for `role`, `user`, `agent`, `assignment`, `run`, `mcp_client`, and `automation` subjects; block grants override approvals under the most-restrictive-wins rule. Evidence: `MacControlPolicyGrantStore`, host bridge policy tests, and `MacControlTests.testPolicyGrantStoreMatchesEveryActorScope`. |
| MCQ-007 | implemented | Critical Wi-Fi actions have `critical` risk, approval gates, 120-second rollback metadata, signed-host continuity snapshots, and a broker-owned revert executor. Evidence: `MacControlContinuityStore`, `mac-control-continuity.json`, `beforeRef` on receipts, host bridge revert `confirmation_required`, and `MacControlTests.testHostBridgeCapturesContinuitySnapshotAndExecutesConfirmedWifiRevert`. Final real-device signed validation remains covered by `SIGNED-001` and `VALIDATION-001`, not by this row. |
| MCQ-008 | implemented | Commander is treated as prototype/private legacy, not public compatibility. Evidence: ADR 0023, `docs/mac-native-legacy-audit.md`, signed-host bridge, and MNL dispositions. |
| MCQ-009 | implemented | Planning process is captured: no non-material question gates may block implementation, and the 83 prompt groups are treated as non-binding unless reflected in MCQ rows. |
| MCQ-010 | partial | Direct intuitive roots such as `claw wifi ...`, `claw window ...`, `claw shortcut ...`, and `claw permissions ...` exist and are tested. Remaining blocker: signed-host direct execution parity is not fully validated through standalone `Claw.app`. |
| MCQ-011 | implemented | First-slice and atlas-only verbs map to stable internal capability IDs, direct CLI roots, and documented model-facing semantics. Evidence: `docs/mac-control-plane-verb-audit.md`, `MAC_CAPABILITY_ATLAS`, core atlas coverage tests, and the Mac goal verifier requiring every atlas capability id and canonical CLI usage in the verb audit. |
| MCQ-012 | partial | Mac permissions are centralized in `claw.mac.permissionBroker`, ADR 0024, catalog schemas, CLI roots, and Clawix UI state. Remaining blocker: real native prompt orchestration and signed-host validation are not complete. |
| MCQ-013 | partial | Just-in-time permission planning exists in dry-run and broker contracts. Remaining blocker: real macOS prompt timing is not validated with a valid signed standalone host. |
| MCQ-014 | implemented | Permission state schemas, catalog entries, CLI plans, and the signed-host lifecycle store capture status, requestability, `requestedBefore`, `lastRequestedAt`, `lastCheckedAt`, request results, and revocation detection in `mac-permission-lifecycle.json`. Evidence: `MacControlPermissionLifecycleStore`, host bridge permission response fields, and `MacControlTests.testPermissionLifecycleStorePersistsRequestsAndDetectsRevocation`. |
| MCQ-015 | partial | Static guardrails, route graph nodes, legacy audit, and allowlist constrain native bypasses. Remaining blocker: final closure must re-run the source-session reread and native usage checks after all remaining implementation work. |
| MCQ-016 | implemented | The execution rule is recorded: ask only material forks and otherwise proceed with the recommended implementation path. |
| MCQ-017 | implemented | Related surfaces are shown in normal help for the agreed Mac-adjacent collision set: `app`/`apps`, `audio`, `notification`/`notify`, `calendar`, `contacts`, `reminders`, `files`, `location`, `microphone`, `speech`, `stt`, `tts`, and `voice-notes`. Evidence: registry contracts, CLI help tests, `docs/cli.md`, and `docs/mac-control-plane.md`. |
| MCQ-018 | blocked | The goal is active and cannot close until all rows above are implemented, verified, or explicitly accepted as `EXTERNAL PENDING`. |

## Hard Blockers

| ID | Status | Evidence | Required next action |
| --- | --- | --- | --- |
| SIGNED-001 | blocked | Standalone packaged validation for `Claw.app` failed because the local Apple Development identity is revoked: `CSSMERR_TP_CERT_REVOKED`. | Install or select a valid Apple Development signing identity, then rerun the signed packaged host validation without `--skip-sign`. |
| AUDIT-001 | blocked | This audit still contains partial and blocked rows. | Close each MCQ row one by one, or explicitly mark unavoidable physical/provider work as `EXTERNAL PENDING` with evidence. |
| VALIDATION-001 | partial | Fixture, core, CLI, MCP, and embedded Clawix paths have coverage, but not every real UI/API/MCP path has been validated against a signed standalone host. | Re-run final smoke checks against both `Clawix embedded` and standalone `Claw.app` signed-host modes. |

## Required Validation Map

The following commands are the current acceptance spine and must pass before
closure, except for commands explicitly marked `EXTERNAL PENDING`.

| Area | Command or check |
| --- | --- |
| Goal verifier | `node scripts/verify-mac-control-plane-goal.mjs` |
| Docs alignment | `node scripts/docs-alignment-check.mjs` |
| Native permission broker guard | `node scripts/native_permission_broker_check.mjs` |
| Storage boundary | `node scripts/storage_boundary_guard.mjs` |
| Public docs alignment | `bash scripts/doc_alignment_check.sh` |
| ClawJS whitespace | `git diff --check` |
| Clawix Mac Control state | `swift test --package-path macos --filter MacControlCenterTests` |
| Signed standalone host | `swift test --package-path apps/host --filter CommanderE2ETests.testPackagedAppCanLaunchPermissionRequestsFromBundleProcess` after replacing the revoked signing identity |

## Closure Rule

The goal may be closed only after a final pass confirms:

1. Every `MCQ-001` through `MCQ-018` row is implemented, verified, or explicitly
   accepted as `EXTERNAL PENDING`.
2. `SIGNED-001` is either resolved with a valid signed `Claw.app` validation or
   accepted as a physical signing environment blocker.
3. The `Structured Prompt Review` in
   `docs/mac-control-plane-source-decision-audit.md` is re-read against the
   source session and no selected UI answer is missed.
4. The global approval path, including `MacControlGlobalInboxProjector`, is
   verified as either working or explicitly blocked.
5. The final answer to the user states that the active goal is complete only if
   all of the above are true.
