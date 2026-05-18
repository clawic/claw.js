# Backbone Source Decision Audit

Source conversation: `019e3b2e-3f4a-7753-a2ce-c92fce7c4436`

Binding plan item: `019e3b8a-fab7-75e0-8a23-a49524afe727-plan`

Audit file: `docs/evolution/backbone-source-decision-audit.md`

This audit is the public decision register for the evolution, compatibility,
and rescue backbone. The private source session path is recorded in the active
Codex goal, not in this public repository.

This file is not a completion claim. It is a closure guard: before the active
goal can be marked complete, every decision below must be reviewed against the
current worktree and marked either `verified` with concrete evidence or
`blocked` with an explicit blocker. `partial` means the audit is not finished;
`blocked` means the audit is explicit but the active goal still cannot be
closed until the blocker is resolved or the user accepts that scope as external.

## Current Closure State

Status: `verified`

Reason: the backbone foundation, CLI, ledger, core API, rescue policy, repair
context, rollback contracts, migration lab, Clawix rescue route, and base
survival matrix have evidence. The migration lab now checks every registered
`v1` and `internalCrossVersion` surface against a stable evolution strategy,
enforces runtime-adapter-only retirement, and guards the changed/fast/release
test lanes. Signed-app launcher rescue validation has local evidence, and the
public versions manifest now forces every listed public version to have a
permanent fixture.

## Decision Review

| Decision id | Binding answer | Closure evidence required | Current status |
| --- | --- | --- | --- |
| `plan_scope` | Backbone completo | ADRs, ledger, CLI, core SDK, guards, skills, Clawix rescue, tests, and closure audit are implemented and machine-guarded for the current public-version set. | verified |
| `canon_owner` | ClawJS primero | ClawJS owns canon; Clawix only mirrors host/UI consequences. | verified |
| `compat_policy` | Pre-V1 limpio | Pre-V1 clean cut and post-V1 strict migration/adapters in constitution, ADR, and policy. | verified |
| `legacy_location` | Fronteras aisladas | Evolution policy sets `legacyLocation: boundary_migrators_adapters_receipts`; README forbids old-version branches in current code and confines old-version knowledge to migrators, adapters, receipts, repair tools, and fixtures; governance checks those anchors. | verified |
| `success_criteria` | Imposible romper silenciosamente | Stable surface drift fails via registry/baseline/evolution record gates. | verified |
| `gate_strictness` | Fail cerrado | Stable surface changes without evolution coverage fail the evolution gate. | verified |
| `first_delivery_shape` | Gates verificables | First implementation includes machine checks, not docs only. | verified |
| `v1_baseline_strategy` | Fixture fundacional | V1 foundation fixture exists and is permanently checked. | verified |
| `implementation_sequence` | Infra primero | ADR, schema, guard, dry-run/operator CLI precede real migrations. | verified |
| `cli_surface_name` | `claw evolution` | Public operator surface is `claw evolution`. | verified |
| `ledger_location` | `docs/evolution` | Public ledger lives under `docs/evolution/`. | verified |
| `breaking_approval` | ADR explicito | Breaking post-V1 changes require ADR/amendment plus migration/adapters. | verified |
| `repair_policy` | Planificar y reparar | Doctor/repair plan, safe actions, gated actions, patch, and receipt exist. | verified |
| `receipt_privacy` | Redactados por defecto | Receipts/reports redact prompts, secrets, and full local paths by default. | verified |
| `migration_backup_policy` | Structural backups need surface-aware refinement | Backup policy distinguishes DB, workspace, index, and external surfaces. | verified |
| `large_object_policy` | Asked for informed policy | Large blobs/caches/indexes are classified instead of blindly copied. | verified |
| `snapshot_scope_policy` | Snapshot touched data only, with caution for huge/external data | Workspace/host backups cover touched objects and metadata, not whole external trees. | verified |
| `atomicity_policy` | Plan verificable | Apply requires dry-run, invariants, backup/snapshot policy, and expected receipt. | verified |
| `backup_class_policy` | Clasificar por superficie | Backup classifier covers canonical DB/sidecar, touched workspace/host data, rebuildable indexes, external read-only. | verified |
| `size_threshold_policy` | Si, con override | Size/file thresholds block costly migration without approval override. | verified |
| `external_source_policy` | Nunca mutar externos | External/indexed sources are read-only; only metadata/indexes are migrated or rebuilt. | verified |
| `backup_retention` | 30 dias | Restore/backup contracts use 30 day retention. | verified |
| `backup_location` | Raiz duena | Backup/receipt contracts use the owning root rather than a single global root. | verified |
| `default_size_threshold` | 1 GB / 10k | Default thresholds are 1 GiB and 10,000 files. | verified |
| `clawix_phase1` | Mirror y guard | Clawix mirror docs and gate call sibling ClawJS evolution checks. | verified |
| `agent_skill_phase1` | Skill obligatoria | `compatibility-evolution-work` exists in ClawJS and is projected to Clawix. | verified |
| `phase1_contents` | Do all listed scope; order chosen by implementer | Scope was not narrowed; listed artifacts are implemented and guarded, including the public-version fixture manifest. | verified |
| `version_support_window` | Todas publicadas | Every public post-V1 version remains migratable forward. | verified |
| `migration_chain_policy` | Paso a paso | Public fixtures declare previous version and form an explicit forward chain. | verified |
| `adapter_retirement_policy` | Nunca datos publicos | `adapterRetirementChecks` and `adapter_retirement_policy` forbid `retired_runtime_adapter` on public data migrators and allow it only for runtime/protocol compatibility adapters. | verified |
| `startup_survival_policy` | Chat siempre | `RescueSurvivalMatrixTests` covers failed migration, partial storage, runtime/bridge degradation, CPU/startup hang protection, and keeps launch/chat/repair before non-critical UI. | verified |
| `repair_agent_role` | Plan + aplicar seguro | Repair agent context includes safe actions and approval-gated actions. | verified |
| `repair_surface_shape` | Sidebar + ventana rescue | Sidebar signal, dedicated rescue route, deep link path, signed canonical launcher `open-rescue`, preflight, `LaunchRouteKind=rescue`, and redacted `rescue-context.json` export have local validation evidence. | verified |
| `runtime_fallback_policy` | Runtime disponible | `RescueSurvivalMatrixTests` covers alternate-runtime fallback and no-runtime diagnostic-only rescue without blocking launch. | verified |
| `repair_tool_scope` | Diagnostico local | Offline/local diagnostic report can be generated without network/runtime. | verified |
| `minimum_chat_contract` | Nueva sesion efimera | If normal chat state is unavailable, an ephemeral local chat path remains. | verified |
| `health_detection_scope` | Migracion + crash + perf | Rescue detection covers migration, crash loop, bridge/runtime, startup, CPU, and RAM. | verified |
| `runaway_protection` | Circuit breaker | CPU/RAM/startup/crash circuit breaker degrades non-critical UI before chat dies. | verified |
| `user_notification_tone` | Discreto accionable | UI exposes a compact repair signal, not a blocking technical wall. | verified |
| `agent_fix_output` | Patch + receipt | Repair/report output includes redacted suggested patch and receipt. | verified |
| `report_submission_policy` | Aprobacion explicita | External report submission is approval-gated. | verified |
| `creator_report_policy` | Informe redactado | Creator/support reports are redacted local files by default. | verified |
| `survival_acceptance` | Chat con fallos simulados | `RescueSurvivalMatrixTests` and `RescueChatFallbackTests` prove chat/rescue survives simulated failure paths. | verified |
| `rescue_priority` | Pilar central | Rescue is constitutional and not secondary to migration success. | verified |
| `constitution_update_scope` | Constitucion + ADR | ClawJS and Clawix constitutions plus ADRs encode the rescue/evolution rule. | verified |
| `evolution_cli_commands` | Completo operator | `list/show/diff/plan/dry-run/apply/verify/doctor/repair/rollback/backup/receipt/report` exist. | verified |
| `evolution_record_granularity` | Por cambio logico | Ledger records are logical changes, not one file per touch. | verified |
| `evolution_diff_gate` | Registry diff | Public surface baseline diff detects uncovered stable surface changes. | verified |
| `change_classification_taxonomy` | 5 clases | Additive, compatible, migration_required, adapter_required, breaking_requires_adr are the classes. | verified |
| `evolution_record_status` | Draft->Active->Superseded | Status taxonomy includes draft, active, superseded, blocked, retired_runtime_adapter. | verified |
| `record_ownership_fields` | Owner + surfaces + tests | Records require owner, affected surfaces, and tests. | verified |
| `adapter_boundary_policy` | Frontera por surface | Compatibility adapters are checked per surface boundary. | verified |
| `rollback_policy` | Downgrade completo, refined by later answers | `createEvolutionRollbackReport` emits restore points, `best_effort_forward_repair`, `universalRollbackPromised: false`, approval-gated rollback, and mandatory `claw evolution repair --json`; core tests cover the contract. | verified |
| `migration_engine_scope` | Todo estable | `stableSurfaceCoverage` and `stable_surface_strategy_coverage` require every registered `v1`/`internalCrossVersion` surface to map to migration, adapter, backup, rebuild, external-readonly, or root policy. | verified |
| `external_rollback_policy` | Same as external read-only policy | Rollback restores framework metadata/indexes only; never mutates external files. | verified |
| `destructive_change_policy` | Asked for more informed design | Backup/rollback plans classify canonical snapshots, rebuildable indexes, and external read-only surfaces; mutation, snapshot, external access, restore point, and report submission are approval-gated. | verified |
| `rollback_refinement` | User experience first; avoid blocked app; agent can repair | Rollback is best-effort, never promises universal reversibility, preserves launch/chat/repair via operator steps, and requires forward repair when state diverges. | verified |
| `down_migration_requirement` | Do not force premature up/down commitment | Use forward migration plus restore points and safe inverse only when valid. | verified |
| `restore_point_policy` | Do not burden user with technical complexity | Restore points are emitted only by backup/rollback contracts, stay redacted/local, and are approval-gated for mutating actions rather than blocking normal verify/doctor use. | verified |
| `downgrade_user_goal` | Prefer previous version, maybe earlier versions if reasonable | Operator plans accept explicit `fromVersion`/`toVersion`, public fixtures form a forward chain, and rollback uses bounded restore point plus forward repair instead of exponential reverse migrators. | verified |
| `downgrade_product_principle` | Maximo esfuerzo sin friccion | Rollback/downgrade is best effort and not a normal-use barrier. | verified |
| `repair_visibility_default` | Resumen humano | User-facing repair state is simple with detail available to the agent/report. | verified |
| `offline_repair_policy` | Diagnostico local | Offline mode shows local diagnostics, logs, receipts, suggested commands, and export path. | verified |
| `repair_approval_threshold` | Riesgo alto | Safe actions can be applied; risky delete/move/send/external/secret/threshold actions need approval. | verified |
| `release_gate_policy` | Changed + release split | `scripts/test-lane.mjs` routes fast/changed through `test:evolution`, release through integration/fast plus broader validation, and `evolution-governance-check.mjs` now guards that wiring. | verified |
| `fixture_corpus_policy` | Por version publica | `public-versions.json` requires each public version to point to a permanent fixture; governance fails on missing/orphan fixtures and public-release fixtures without `previousPublicVersion`. | verified |
| `survival_test_matrix` | User asked for clearer wording | Refined by `survival_test_matrix_refined`. | verified |
| `survival_test_matrix_refined` | Base critica | `RescueSurvivalMatrixTests` covers failed migration, partial storage, bridge/runtime down with alternate runtime, startup/CPU hang protection, and no-runtime diagnostics. | verified |
| `log_redaction_policy` | Redaccion estricta | Logs/reports redact paths, prompts, secrets, payloads, and user data; keep hashes/counts/codes. | verified |
| `report_destination_policy` | Archivo local | Initial report destination is local file/package only. | verified |
| `public_private_boundary` | Todo generico publico | Generic canon is public; launchers, credentials, evidence, and private paths stay private. | verified |
| `clawix_visual_scope` | Funcional sin nuevo visual | Clawix rescue UI uses existing SettingsCard/PageHeader/ActionPillRow patterns and avoids new visual judgment. | verified |
| `implementation_phasing` | Dependencias primero | Canon/schema, core policy, CLI/guards, migrator/lab, Clawix rescue, release gates. | verified |
| `core_api_shape` | Si, core SDK | `@clawjs/core` exports policy, types, validators, and helpers. | verified |

## Superseded Prompts

The source session contains one interrupted `request_user_input` round whose
three prompts were not answered: `startup_migration_policy`,
`blocked_state_policy`, and `migration_user_surface`. They are not omitted
decisions. The user explicitly rejected the implied "read-only / does not
start" framing in the next free-form message and replaced that round with the
binding startup and rescue decisions audited above: `startup_survival_policy`,
`minimum_chat_contract`, `repair_surface_shape`, `runtime_fallback_policy`,
`offline_repair_policy`, `health_detection_scope`, `runaway_protection`, and
`user_notification_tone`.

## Closure Rule

The active goal must not be closed while any row is `partial` or `blocked`.

For final closure:

1. Re-read the private source session from the path in the active goal.
2. Re-run this audit against current worktree evidence, not memory.
3. Update every row to `verified` or `blocked` with an explicit blocker.
4. Run `npm run test:evolution` in ClawJS and the Clawix mirror gate.
5. Run the relevant Clawix rescue/chat validation for any host/UI rows.
6. Only then can the goal be considered for completion.
