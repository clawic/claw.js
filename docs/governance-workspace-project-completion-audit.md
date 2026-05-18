# Governance, Workspace, And Project Completion Audit

Source conversation: `019e3a47-6485-7430-a5a9-97d32166f255`

Closure state: `ready_for_close_with_external_pending`

This is the public completion gate for the governance, Workspace/Project, and
Project folder handoff reset. It is intentionally stricter than ADR acceptance:
the goal can close only when every source decision row in
[Governance, Workspace, And Project Source Decision Audit](./governance-workspace-project-source-decision-audit.md)
has current implementation, documentation, validation, or explicit
`EXTERNAL PENDING` evidence.

Private source-session paths, local goal files, machine-local workspace paths,
credentials, signing details, and private maintainer notes are intentionally
excluded from this public file.

## Requirement Status

| ID | Acceptance requirement | Current status | Evidence | Remaining blocker before final close |
| --- | --- | --- | --- | --- |
| GWA-001 | Every source Q/A row is enumerated and the three blank structured answers are resolved. | validated | Source audit rows `GQ-001` through `GQ-084`; the final source-session re-read confirmed `GQ-058` through `GQ-060` are superseded by later `.claw/`, manifest, footprint, and portability decisions. | None for local closure. |
| GWA-002 | Canonical vocabulary separates principal, entity, scope, steward, grants, restrictions, tenant, namespace, owner, profile, and company terms. | validated | ADR 0027, naming style guide, data-storage boundary, governance guard, baseline file, `evaluateGovernanceAccess`, and governance tests. | Current vocabulary debt is baselined; future closure must confirm no unreviewed growth. |
| GWA-003 | Governance access obeys explicit grants, inherited restrictions, control-without-read, strict delegation, and lightweight local defaults. | validated | `packages/clawjs-core/src/governance.ts`, `governance.test.ts`, `claw inspect governance`, and `scripts/governance-scope-guard.mjs`. | Future persistence-backed effective-grant caches must keep the same semantics. |
| GWA-004 | Agents use stewardship and scope rather than owner authority. | validated | ADR 0020, Agents V1 code/tests, `inspect agent` projection, session scope fields, and legacy owner compatibility kept out of canonical authority. | Remove or reclassify remaining compatibility vocabulary when no longer needed. |
| GWA-005 | Workspace is the isolated context and Project is a collaborable scope with stable identity and mutable path locator. | validated | ADR 0028, `docs/workspace.md`, Clawix sidebar/session project-id migration, ClawJS app-state `project_id`, and Clawix storage/interface guards. | Additional folder move/repair UI can build on the same identity model. |
| GWA-006 | Project primary folder is mandatory, auto-created when omitted, and may reference extra folders. | validated | Clawix `ProjectFolderPathResolver`, `AppState.createProject`, `ProjectEditorSheet`, `ProjectFolderStateTests`, and `clawProjectFolderRefSchema` cover default Workspace-contained folders, unique names, and explicit read/write/sync policy defaults for referenced folders. | Rich UI for referenced folder permissions remains future surface work. |
| GWA-007 | Project folder handoff uses universal v1 `claw.project.json`, managed `AGENTS.md`, and `CLAUDE.md`, without copying full `.claw/`. | validated | ADR 0028, `project-manifest.ts`, referenced-folder access/sync manifest tests, `claw project attach/inspect/detach/export/import/sync-handoff`, CLI project tests, and Clawix handoff client tests. | Safe snapshot contents should expand only through reviewed fields. |
| GWA-008 | Finder copies, duplicates, detach/replace, and workspace binding are safe and portable. | validated | Manifest schema rejects absolute handoff paths and `.claw` state; CLI duplicate attach stays detached until `--replace`; `claw project import` restores safe handoff with preview/accept; Clawix shows missing/detached/duplicate folder states. | None for local closure; richer fork UI can build on the validated detach/fork model. |
| GWA-009 | Deleting or renaming Project records does not mutate physical folders by default. | implemented | ADR 0028 documents the rule; Clawix delete removes the Project record and does not delete the folder; Project update changes display/path state without folder rename. | Dedicated destructive folder actions still need separate approval if added. |
| GWA-010 | Shareable resources, memory, and secrets use scoped bindings, layered memory, and brokered secret references. | validated foundation | ADR 0027/0028, `GovernanceBinding`, `GovernanceResourceScopeBinding`, share summaries, detach/fork helpers, data-storage boundary, Secrets docs, connector governed context, and Agents V1 memory/grant records define the model. | Live/provider-backed sharing is `EXTERNAL PENDING`; local model and guardrails are validated. |
| GWA-011 | Docs and routing point future agents to the canonical model. | validated | AGENTS, decision maps, ADR 0027, ADR 0028, `docs/workspace.md`, data-storage boundary, naming guide, and discoverability rows. | Keep Clawix projections aligned with ClawJS docs. |
| GWA-012 | Guardrails fail hard on ambiguous vocabulary and missing governance docs. | validated | `scripts/governance-scope-guard.mjs`, `docs/governance-vocabulary-baseline.json`, `npm run test:governance`, and this goal verifier. | Baseline updates require rationale and review. |
| GWA-013 | Clawix implementation uses Project ID before path and surfaces folder state. | validated | Clawix `Project.folderState`, sidebar/picker labels, sidebar snapshot `project_id`, path fallback recovery, handoff client, and focused Swift tests. | More cross-window visual/repair workflows can extend the state model. |
| GWA-014 | Final validation proves the goal requirement-by-requirement. | validated | This audit, the final source-session re-read, the source decision audit, goal verifier, full ClawJS docs guard, ClawJS TS/tests/guards, Clawix Swift tests, and Clawix storage/interface/doc alignment checks form the current evidence spine. | None for local closure; external/live sharing surfaces stay explicitly `EXTERNAL PENDING`. |

## Required Validation Map

| Area | Command or check |
| --- | --- |
| Goal verifier | `npm run test:governance-workspace-project-goal` |
| Governance guard | `npm run test:governance` |
| ClawJS focused tests | `npx vitest run --config vitest.config.ts packages/clawjs-core/src/governance.test.ts packages/clawjs-core/src/project-manifest.test.ts packages/clawjs/src/cli-project-command.test.ts` |
| ClawJS TypeScript | `npm run test:ts` |
| CLI registry parity | `node --import tsx ./scripts/verify-cli-registry-router-parity.mjs` |
| Clawix project folder state | `swift test --package-path macos --filter ProjectFolderStateTests` |
| Clawix handoff client | `swift test --package-path macos --filter ClawJSProjectHandoffClientTests` |
| Clawix surface/storage guards | `node scripts/storage_boundary_guard.mjs`, `node scripts/interface_surface_guard.mjs`, `bash scripts/doc_alignment_check.sh` |
| External/live sharing surfaces | `EXTERNAL PENDING` unless explicitly approved and validated through brokered, audited flows. |

## Closure Rule

The goal may close only while all of the following remain true:

1. `GQ-001` through `GQ-084` and `GWA-001` through `GWA-014` are present and
   current.
2. The private source session is re-read one row at a time and no later
   correction or answer changes the audit.
3. Guardrails pass after the final edit in both ClawJS and Clawix.
4. Any unimplemented physical/provider/live sharing work is explicitly marked
   `EXTERNAL PENDING`, not silently counted as local validation.
