# Mac Control Plane Source Decision Audit

Source conversation: `019e366f-8e14-7e51-8817-9820d2914dc4`

Private source session and goal references live in the maintainer's local
Codex goal state. Public docs record only the conversation id and redacted
decision rows.

This audit is binding for final goal closure. Before the goal can be marked
complete, each row must be re-read against the source session and marked
implemented, documented, tested, or explicitly blocked with evidence.

The source session contains 83 `request_user_input` prompts. They were not
completed as selected UI answers: the user interrupted the question flow,
continued with free-form corrections, later said to continue asking, and then
explicitly corrected the process to ask only material forks. Those prompt ids
are reviewed below as proposed decision branches, but they are not counted as
user-selected answers. The binding choices are the free-form user corrections
and the explicit goal instruction rows in the main audit table.

## Structured Prompt Review

These `request_user_input` prompt groups existed in the source session and must
be re-checked at final close. Because no selected-answer payload exists for
them, each group is either represented by a free-form binding row below or kept
as non-binding proposed scope.

| Lines | Prompt ids | Final disposition |
| --- | --- | --- |
| 164-188 | `scope_model`, `coverage_meaning`, `cli_naming`, `api_source_policy`, `permission_principal`, `risk_model`, `action_shape`, `rollback_policy`, `audit_detail`, `v1_closure`, `first_slice`, `commander_policy`, `atlas_source`, `cli_shape`, `approval_flow` | Not answered via UI; superseded by MCQ-001..MCQ-008 and later CLI semantics corrections. |
| 213-243 | `namespace_strategy`, `noun_style`, `verb_style`, `target_resolution`, `wifi_semantics`, `window_close_semantics`, `wifi_v1_verbs`, `window_v1_verbs`, `shortcut_v1_verbs`, `direct_roots_policy`, `command_spelling`, `human_cli_policy`, `unimplemented_roots_behavior`, `mac_portal_role`, `capability_status_taxonomy`, `capability_id_namespace`, `execution_flags`, `portable_mapping` | Not answered via UI; binding decisions are MCQ-010, MCQ-011, MCQ-017, and the goal summary. |
| 275-396 | `wifi_password_policy`, `shortcuts_io_policy`, `window_permission_policy`, `mac_permissions_node`, `permission_scope`, `permission_enforcement`, `permission_request_timing`, `permission_preflight_behavior`, `permission_history`, `mac_permission_taxonomy`, `permission_states`, `permissions_ui`, `mac_command_broker`, `native_call_allowlist`, `permission_action_routes`, `permission_catalog_coverage`, `manual_permission_policy`, `usage_description_policy`, `permission_prompt_copy`, `permission_revocation`, `permission_host_identity`, `permissions_cli_shape`, `permission_request_command_behavior`, `permissions_audit_surface`, `permissions_cli_commands`, `permission_policy_editing`, `permission_guard_scope`, `permission_policy_granularity`, `permission_packs`, `permission_defaults`, `permission_registry_location`, `plist_generation`, `existing_permission_migration`, `mac_control_package`, `permission_state_storage`, `mac_audit_storage`, `policy_write_authority`, `agent_permission_escalation`, `grant_duration_defaults`, `network_breaker_policy`, `critical_revert_timer`, `remote_mac_actions`, `remote_breaker_override`, `local_presence_signal`, `revert_failure_policy` | Not answered via UI; binding decisions are MCQ-005..MCQ-007 and MCQ-012..MCQ-015 plus the goal summary. |
| 401-758 | Remaining implementation, governance, API, UI, validation, collision, role, schema, delivery, and final-plan prompt ids | Not answered via UI; used only as planning scaffolding. Binding decisions are represented in MCQ-001..MCQ-018 and must be verified against implementation evidence before closure. |

| ID | Source user turn | Decision or correction | Evidence now | Status before final close |
| --- | --- | --- | --- | --- |
| MCQ-001 | Initial Mac control prompt | The framework and CLI must treat the local Mac as an operable surface; agents should be able to control Mac things through Claw. | `docs/mac-control-plane.md`, ADR 0023, Mac atlas, CLI command roots, MCP/API surfaces, Clawix Mac Control settings. | Partial: governed Mac surface exists; standalone signed `Claw.app` validation remains blocked. |
| MCQ-002 | Initial Mac control prompt | Coverage goal is exhaustive inventory: "todo" means every controllable Mac capability is indexed, even when initially atlas-only. | `MAC_CONTROL_COMMAND_ROOTS`, `MAC_CAPABILITY_ATLAS`, coverage states. | In progress: broad first atlas exists; final close requires full major-release audit and gap review. |
| MCQ-003 | Initial Mac control prompt | Simple wrappers are acceptable where macOS already provides stable commands; do not overcomplicate wrapper-only families. | ADR 0023, backend strategies such as `networksetup` and `/usr/bin/shortcuts`. | Implemented: wrapper-backed V1 broker strategies exist and are covered by CLI/core and host tests. |
| MCQ-004 | Initial Mac control prompt | Value is not just rewrapping commands; value is standardization for models and future macOS drift. | ADR 0023, typed capability ids, schemas, route graph contracts. | In progress: stable ids/schemas exist; versioned macOS support audit remains. |
| MCQ-005 | Initial Mac control prompt | Governance and audit are core reasons agents must use the framework instead of direct Mac commands. | Host ownership docs, Mac action receipt schema, `mac.directCliAction` route, host audit edge, Clawix timeline. | Partial: governance/audit implementation exists for tested paths; standalone signed-host validation remains blocked. |
| MCQ-006 | Initial Mac control prompt | The system must support granular allow/block configuration with usable grouped defaults. | Permission packs, policy grant schema, roles, risk tiers, Clawix policy state, pending approvals, global inbox projection. | Partial: grouped governance state exists; end-to-end policy editing coverage for every actor/scope remains. |
| MCQ-007 | Initial Mac control prompt | Connectivity-changing actions are risky because they can break the agent itself; they need blockers/rollback/continuity governance. | Risk tier `critical`, rollback defaults, Wi-Fi power-off critical atlas entry. | Partial: plans model risk; real continuity breaker and revert executor validation remain. |
| MCQ-008 | Commander correction | Commander is prototype-only; do not let current Commander shape constrain the redesign. | ADR 0023 context/consequences; `docs/mac-native-legacy-audit.md` marks remaining `Commander*` paths as private implementation debt, not public compatibility. | Implemented: new Mac Control Plane exists and programmatic signed-host handoff is wired; `MNL-*` rows have explicit broker-covered or retained dispositions and must not be used as executable V1 evidence. |
| MCQ-009 | Plan-mode correction | Planning must be iterative and aligned, but later questions should be material forks, not obvious defaults. | Goal reference, this audit, and `docs/mac-control-plane-closure-audit.md`. | Implemented as a process gate: final closure must avoid inventing non-material blockers. |
| MCQ-010 | CLI semantics correction | Everyday commands must be intuitive direct roots like `claw wifi connect` and `claw window close`; users should not need a `mac` prefix for ordinary local actions. | `MAC_CONTROL_COMMAND_ROOTS`, CLI registry, `mac.directCliAction`, CLI tests. | Partial: roots and dry-run/direct routing exist; standalone signed execution parity remains blocked. |
| MCQ-011 | CLI semantics correction | Verb choices are not fixed by examples; choose the most intuitive semantics per action and map them to stable internal ids. | Atlas capability ids and canonical CLI usages. | In progress: first V1 verbs exist; full family verb audit remains. |
| MCQ-012 | Mac permissions correction | Mac permissions must be a central subsystem and its own node, not owned by voice-to-text or any feature service. | ADR 0024, `claw.mac.permissionBroker`, `mac.permissionLifecycle`, `MacControlPermissionBroker` coverage for microphone, accessibility, automation, screen recording, full disk access, camera, location, notifications, media library, photos, calendar, contacts, and reminders. | Partial: central broker coverage, V1 privacy domains, and Clawix UX state exist; signed-host prompt orchestration remains. |
| MCQ-013 | Mac permissions correction | Permissions should be requested just-in-time when capabilities are enabled or used, not all at install. | ADR 0024, permission request dry-run plan. | Partial: dry-run plan exists; real signed-host prompt timing remains blocked. |
| MCQ-014 | Mac permissions correction | The system must know whether permissions exist, were requested, and when to request/check them. | `macPermissionStateSchema`, permission catalog, permission CLI commands. | Partial: schema exists; full durable requested-before and revocation lifecycle evidence remains. |
| MCQ-015 | Mac permissions correction | Code must not bypass central permission/native command paths, similar to secrets/database ownership rules. | `scripts/verify-host-permission-contract.mjs`, route graph broker nodes, `docs/mac-native-usage-allowlist.json`, and `docs/mac-native-legacy-audit.md`. | Partial: guard covers Node-side sensitive patterns and legacy Swift/native debt is dispositioned; final close requires rerunning checks after all remaining work. |
| MCQ-016 | Question acceleration correction | Ask only questions where the user could reasonably choose differently than the recommendation. | Goal closure checklist and closure audit. | Implemented as a process rule: keep implementation moving unless a real material fork appears. |
| MCQ-017 | Help/collision correction | CLI help and ADRs must show related/alternative surfaces when command words collide or could mean another surface. | `Related surfaces` CLI help support, Mac root related surfaces, CLI tests. | Partial: first conflicts covered; full help golden coverage remains. |
| MCQ-018 | Goal instruction | Establish this as a persistent active goal and do not close it until implementation, docs, tests, legacy migration, real validation, and one-by-one decision review are complete. | Active private goal state, this public redacted audit, and `docs/mac-control-plane-closure-audit.md`. | Blocked: goal active; final closure is explicitly blocked until all rows are complete or explicitly accepted as `EXTERNAL PENDING`. |
