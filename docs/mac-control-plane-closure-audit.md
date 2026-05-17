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
| MCQ-002 | partial | The atlas, command roots, and coverage states index the known V1 surface. Remaining blocker: a full macOS 14+ source audit and version drift matrix are not yet proven complete. |
| MCQ-003 | implemented | Wrapper-friendly actions use stable broker strategies where macOS already provides reliable commands, including `networksetup` for Wi-Fi and `/usr/bin/shortcuts` for Shortcuts. Evidence: ADR 0023, atlas backend strategies, CLI/core tests, and host broker tests. |
| MCQ-004 | partial | Stable IDs, schemas, routes, and model-facing CLI semantics exist. Remaining blocker: full major-version drift evidence is not complete. |
| MCQ-005 | partial | Governance and audit paths exist through `mac.directCliAction`, `claw.mac.actionBroker`, receipts, host bridge tests, and the Clawix local timeline. Remaining blocker: final signed standalone host audit validation remains blocked. |
| MCQ-006 | partial | Roles, packs, grants, risk tiers, Clawix policy panel state, pending approvals, and `global inbox` projection exist. Remaining blocker: end-to-end persisted policy editing is not fully closed for every agreed actor/scope. |
| MCQ-007 | partial | Critical risk tiers, rollback defaults, continuity notes, and guarded approval flows exist. Remaining blocker: real continuity breaker and revert executor validation are not complete. |
| MCQ-008 | implemented | Commander is treated as prototype/private legacy, not public compatibility. Evidence: ADR 0023, `docs/mac-native-legacy-audit.md`, signed-host bridge, and MNL dispositions. |
| MCQ-009 | implemented | Planning process is captured: no non-material question gates may block implementation, and the 83 prompt groups are treated as non-binding unless reflected in MCQ rows. |
| MCQ-010 | partial | Direct intuitive roots such as `claw wifi ...`, `claw window ...`, `claw shortcut ...`, and `claw permissions ...` exist and are tested. Remaining blocker: signed-host direct execution parity is not fully validated through standalone `Claw.app`. |
| MCQ-011 | partial | First-slice verbs map to stable internal capability IDs. Remaining blocker: full-family verb review across atlas-only capabilities is not complete. |
| MCQ-012 | partial | Mac permissions are centralized in `claw.mac.permissionBroker`, ADR 0024, catalog schemas, CLI roots, and Clawix UI state. Remaining blocker: real native prompt orchestration and signed-host validation are not complete. |
| MCQ-013 | partial | Just-in-time permission planning exists in dry-run and broker contracts. Remaining blocker: real macOS prompt timing is not validated with a valid signed standalone host. |
| MCQ-014 | partial | Permission state schemas and catalog entries capture status, requestability, and owner metadata. Remaining blocker: full durable requested-before/revocation lifecycle evidence is not closed. |
| MCQ-015 | partial | Static guardrails, route graph nodes, legacy audit, and allowlist constrain native bypasses. Remaining blocker: final closure must re-run the source-session reread and native usage checks after all remaining implementation work. |
| MCQ-016 | implemented | The execution rule is recorded: ask only material forks and otherwise proceed with the recommended implementation path. |
| MCQ-017 | partial | Related surfaces are shown for the first Mac command collisions and are covered by CLI tests. Remaining blocker: full golden help coverage for every collision discovered by the broader CLI audit is not complete. |
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
