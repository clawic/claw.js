# Governance, Workspace, And Project Source Decision Audit

Source conversation: `019e3a47-6485-7430-a5a9-97d32166f255`

This audit is the public-safe source decision map for the governance,
workspace/project, and project-folder handoff reset. It records conversation
and decision identifiers only, not maintainer-local session paths or private
goal files. Final goal closure still requires a fresh private source-session
review against every `GQ-001` through `GQ-084` row.

## Evidence Groups

| Group | Current evidence |
| --- | --- |
| GOV | ADR 0027, `packages/clawjs-core/src/governance.ts`, governance tests, `claw inspect governance`, `scripts/governance-scope-guard.mjs`, `docs/governance-vocabulary-baseline.json`, naming/data-storage docs. |
| AGENT | ADR 0020, Agents V1 schemas/tests/inspect output, `steward` plus `scope` projection, assignment/grant/memory policy records, legacy owner fields limited to compatibility projection. |
| WORKSPACE | ADR 0028, `docs/workspace.md`, project/resource-id first identity, mutable path locator policy, Clawix projected docs and storage/interface guards. |
| SHARE | ADR 0027 and ADR 0028 define multi-scope bindings, single-source resources, detach/fork behavior, layered memory, and brokered secrets; runtime-specific sharing UX remains future implementation unless backed by an explicit local surface. |
| HANDOFF | ADR 0028, `packages/clawjs-core/src/project-manifest.ts`, `claw project inspect/attach/detach/export/sync-handoff`, manifest tests, CLI tests, Clawix handoff client and project-folder state tests. |
| PACKAGE | ADR 0027, ADR 0028, decision maps, workspace docs, AGENTS routing, governance guard, and the completion audit/verifier keep future rollout scoped to canon plus real refactor. |

## Source Q/A Review Map

| QA ID | Decision key | User decision captured | Evidence group |
| --- | --- | --- | --- |
| GQ-001 | `root_isolation_term` | Use principal/org vocabulary; keep `tenant` out of public authority language. | GOV |
| GQ-002 | `authority_inheritance` | Hierarchy does not grant authority; explicit grants are required. | GOV |
| GQ-003 | `first_scope` | Do the complete refactor, not only canon documentation. | PACKAGE |
| GQ-004 | `root_model` | Use Principal plus Entities as the canonical model. | GOV |
| GQ-005 | `tenant_policy` | `tenant` means technical isolation only. | GOV |
| GQ-006 | `owner_policy` | Prohibit generic `owner` as an authority field. | GOV |
| GQ-007 | `company_anchor` | Prefer `organizationId`; keep company terms as business/domain aliases. | GOV |
| GQ-008 | `agent_owner_refactor` | Replace agent owner authority with `steward` plus `scope`. | AGENT |
| GQ-009 | `scope_model` | Use typed scopes. | GOV |
| GQ-010 | `profile_policy` | Prohibit bare `profile`; require precise profile vocabulary. | GOV |
| GQ-011 | `enforcement_level` | Use fail-hard guardrails. | GOV |
| GQ-012 | `migration_strategy` | Treat this as clean V1; no legacy migration burden. | PACKAGE |
| GQ-013 | `managed_authority_model` | Model authority with explicit authority edges. | GOV |
| GQ-014 | `record_governance_anchor` | Use inherited envelopes/bindings rather than repeating authority fields everywhere. | GOV |
| GQ-015 | `data_class_policy` | Data class is required by collection, with explicit overrides. | GOV |
| GQ-016 | `governance_hot_path` | Keep individual/local default implicit. | GOV |
| GQ-017 | `authority_resolution_perf` | Use effective access caches/projections for shared scopes. | GOV |
| GQ-018 | `data_class_perf` | Data class defaults live per collection with per-record override. | GOV |
| GQ-019 | `namespace_semantics` | `namespace` is technical partitioning only. | GOV |
| GQ-020 | `governance_projection` | Materialize only exceptions and advanced governance. | GOV |
| GQ-021 | `managed_authority_boundary` | Superior control does not imply data read. | GOV |
| GQ-022 | `workspace_role` | Workspace is isolated context. | WORKSPACE |
| GQ-023 | `project_role` | Project is collaborable work scope. | WORKSPACE |
| GQ-024 | `sharing_default` | Allow direct Project/Workspace sharing. | SHARE |
| GQ-025 | `sidebar_entry_name` | Keep exploring names, with Project remaining the likely user-facing term. | WORKSPACE |
| GQ-026 | `human_project_shape` | Project is flexible but always has a primary folder, auto-created when needed, with optional refs. | WORKSPACE |
| GQ-027 | `workspace_switch_scope` | Workspace switch changes all active context. | WORKSPACE |
| GQ-028 | `project_primary_folder_location` | Auto-created Project folders live inside the Workspace. | WORKSPACE |
| GQ-029 | `project_folder_model` | Use one primary folder plus referenced folders. | WORKSPACE |
| GQ-030 | `project_folder_move` | Preserve Project identity across folder moves. | WORKSPACE |
| GQ-031 | `project_as_scope` | Project is a real scope. | WORKSPACE |
| GQ-032 | `project_default_contents` | Project default context includes the full active context. | WORKSPACE |
| GQ-033 | `project_entity_links` | Link Projects to entities with typed relationships. | GOV |
| GQ-034 | `workspace_default_model` | Default to a personal Workspace. | WORKSPACE |
| GQ-035 | `workspace_sharing` | Support advanced Workspace sharing. | SHARE |
| GQ-036 | `cross_workspace_resources` | Resources can be associated with multiple Workspaces/Projects to appear shared. | SHARE |
| GQ-037 | `share_binding_model` | Use multi-scope bindings. | SHARE |
| GQ-038 | `shared_resource_mutation` | Use a single source of truth plus detach/fork behavior. | SHARE |
| GQ-039 | `shareable_surface_policy` | Declare every shareable surface. | SHARE |
| GQ-040 | `resource_creation_default_scope` | New resources default to the current scope only. | SHARE |
| GQ-041 | `shared_memory_shape` | Shared memory is a distinct layer. | SHARE |
| GQ-042 | `shared_secret_policy` | Secrets are brokered references, not copied material. | SHARE |
| GQ-043 | `entity_principal_split` | Entities may optionally map to principals; they are not the same concept. | GOV |
| GQ-044 | `organization_entity_types` | Use entity types and roles for organizations/families/departments/etc. | GOV |
| GQ-045 | `entity_scope_capability` | Only declared entity types can become scopes. | GOV |
| GQ-046 | `membership_authority_semantics` | Membership alone is not enough for access. | GOV |
| GQ-047 | `authority_inheritance` | Authority edges can grant with explicit limits. | GOV |
| GQ-048 | `orgless_collaboration` | Direct Project grants are valid without an Organization. | GOV |
| GQ-049 | `agent_identity_model` | Agents are reusable resources. | AGENT |
| GQ-050 | `agent_assignment_scope` | Assignment plus grants defines where an agent acts. | AGENT |
| GQ-051 | `agent_memory_layers` | Agent memory is layered by scope. | AGENT |
| GQ-052 | `session_scope_default` | Session defaults to Project when present, otherwise Workspace. | AGENT |
| GQ-053 | `pin_archive_visibility` | Pins/archive are personal by default. | WORKSPACE |
| GQ-054 | `resource_attachment_default` | Resource attachments bind to scope. | SHARE |
| GQ-055 | `project_primary_folder_contents` | Primary folder carries runtime minimum plus docs. | HANDOFF |
| GQ-056 | `folder_reference_permissions` | Referenced folders require explicit read permission; write needs more. | HANDOFF |
| GQ-057 | `project_folder_sync_default` | Sync/share uses an explicit manifest. | HANDOFF |
| GQ-058 | `claw_folder_model` | No structured answer; superseded by later decisions reserving full `.claw/` for Workspace roots. | HANDOFF |
| GQ-059 | `project_folder_marker` | No structured answer; superseded by `claw.project.json` plus managed adapter shims. | HANDOFF |
| GQ-060 | `workspace_portability_promise` | No structured answer; superseded by Workspace `.claw/`, Project manifest, and explicit export/import decisions. | HANDOFF |
| GQ-061 | `project_folder_footprint` | Use `claw.project.json`, managed `AGENTS.md`, and `CLAUDE.md` shim. | HANDOFF |
| GQ-062 | `project_handoff_context` | Handoff exposes a safe snapshot. | HANDOFF |
| GQ-063 | `existing_project_write_policy` | Existing folders require preview plus acceptance before writes. | HANDOFF |
| GQ-064 | `project_manifest_strategy` | Use a universal v1 manifest, not legacy/v2 compatibility. | HANDOFF |
| GQ-065 | `raw_copy_semantics` | Raw Finder copy is usable but incomplete. | HANDOFF |
| GQ-066 | `referenced_folders_handoff` | Only the primary folder gets handoff by default. | HANDOFF |
| GQ-067 | `copied_project_identity` | Preserve copied Project identity but detach it. | HANDOFF |
| GQ-068 | `manifest_workspace_binding` | Manifest binds by workspace ID, without absolute workspace paths. | HANDOFF |
| GQ-069 | `external_agent_without_claw` | External agents work from the safe snapshot. | HANDOFF |
| GQ-070 | `project_folder_authority` | Being inside a Project folder grants no extra authority. | GOV |
| GQ-071 | `handoff_snapshot_refresh` | Refresh/sync handoff in a controlled way. | HANDOFF |
| GQ-072 | `handoff_snapshot_sensitivity` | Snapshot contains only safe summaries. | HANDOFF |
| GQ-073 | `duplicate_project_manifest` | One active copy plus detached duplicate. | HANDOFF |
| GQ-074 | `project_delete_files_policy` | Deleting a Project never deletes files by default. | HANDOFF |
| GQ-075 | `project_rename_folder_policy` | Renaming a Project does not rename its folder by default. | HANDOFF |
| GQ-076 | `governance_storage_shape` | Use central governance bindings. | GOV |
| GQ-077 | `individual_governance_default` | Individual governance is implicit. | GOV |
| GQ-078 | `domain_company_owner_terms` | Domain `company`/`owner` terms are semantically quarantined. | GOV |
| GQ-079 | `authority_inheritance_model` | Restrictions inherit; permissions require explicit edges. | GOV |
| GQ-080 | `agent_delegation_effective_access` | Delegation uses strict intersection. | AGENT |
| GQ-081 | `managed_control_without_read` | Control does not imply read access. | GOV |
| GQ-082 | `adr_packaging` | Package decisions as separate ADRs. | PACKAGE |
| GQ-083 | `naming_governance_checks` | Naming and governance checks fail hard. | GOV |
| GQ-084 | `implementation_rollout_scope` | Ship canon plus real ClawJS/Clawix refactor. | PACKAGE |

## Final Closure Gate

This audit does not close the goal. Final closure requires re-reading the
private source session row by row, confirming every row is still implemented,
validated, documented, or explicitly recorded as `EXTERNAL PENDING`, and then
updating the completion audit with current validation evidence.
