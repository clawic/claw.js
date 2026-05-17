# Agents V1 Decision Matrix

Status: partial implementation tracker

Date: 2026-05-17

Source conversation: `019e35ac-fd5a-77f2-9e21-4564e319110c`

This matrix tracks the 86 binding Agents V1 decisions against public ClawJS
evidence. It is not a completion certificate. The goal may only close after
the private source session is reviewed one decision at a time and every row is
proved implemented, documented, explicitly `EXTERNAL PENDING`, or superseded by
a later user decision.

## Status Legend

- `implemented`: current public code, docs, and tests provide direct evidence.
- `partial`: the canonical direction exists, but some surface, migration,
  runtime, UI, E2E, or audit evidence is still incomplete.
- `superseded`: an earlier answer was replaced by a later user decision.
- `external_pending`: completion needs a real provider, native permission,
  paid call, production mutation, or host-dependent validation that is not
  allowed without explicit approval.

## Decisions

| # | Decision | Status | Evidence / remaining work |
|---|---|---|---|
| 1 | `surface_model` | superseded | ADR 0020 makes `agents` the root and keeps placements as `agent_assignments`; deployment-root wording is retired. |
| 2 | `v1_target` | implemented | `AGENT_ASSIGNMENT_KINDS` covers Mac, web, Telegram, WhatsApp, email, support inbox, workflow, automation, subagent, MCP/API, Relay, and custom channels. |
| 3 | `default_posture` | partial | External routing and budget gates are respond-only by default; remaining work is broader runtime dispatch enforcement outside the policy helpers. |
| 4 | `v1_depth` | partial | Contracts, core gates, and a service API envelope exist in `packages/clawjs-core/src/agents-v1.ts`; full network service binding and E2E closure remain. |
| 5 | `deployment_granularity` | superseded | ADR 0020 models Agent plus assignment/endpoints instead of root deployments. |
| 6 | `context_scope` | partial | Context is represented through grants, memory policies, safe projections, and package bindings; explicit context pack/view entities still need fuller query and import surfaces. |
| 7 | `identity_storage` | implemented | `AgentAssignmentPrivacyPolicy` supports `off`, `hashed`, and `raw_with_retention`; raw retention now requires `telemetryRetentionDays`. |
| 8 | `crm_projection` | implemented | `resolveAgentExternalIdentity` projects strong identifiers to `contactProjection: "create_or_update"`. |
| 9 | `ambition_level` | partial | ADR 0020 and broad schema/gates reflect the complete standard; remaining rows track unfinished public/API/E2E/UI closure. |
| 10 | `canonical_name` | superseded | Public docs use Agents V1 and assignment terminology; deployment is not the root concept. |
| 11 | `domain_boundary` | implemented | `agents` is the canonical collection and CLI group; subentities are under the agents domain. |
| 12 | `agent_core_model` | partial | Agent records include identity, skills, grants, memory, budgets, evaluations, incidents, and audit surfaces; employee-like UI/control-panel depth remains future work. |
| 13 | `agent_vs_placement` | implemented | ADR 0020 and route checks distinguish durable agent definition from assignments. |
| 14 | `agent_instance_model` | implemented | ADR 0020 and schemas distinguish `agent`, `agent_runs`, and `agent_sessions`. |
| 15 | `agent_modes` | implemented | `AGENCY_MODES` is an extensible registry with assistant, worker, support, receptionist, operator, automation, workflow agent, subagent, reviewer, and manager. |
| 16 | `isolation_default` | implemented | Effective access fails closed when any plane lacks an allow grant. |
| 17 | `resource_inheritance` | implemented | `evaluateAgentEffectiveAccess` requires intersection across agent, assignment, execution profile, connector, host, and run scope grants. |
| 18 | `resource_model` | implemented | `AgentResourceGrant` is the unified resource grant model. |
| 19 | `permission_shape` | implemented | Grants and requests use resource type/id, action, scope type/id, effect, and expiry. |
| 20 | `secret_access_model` | implemented | Secret/vault read, write, and execute requests are denied; only `lease_secret` can enter brokered flow. |
| 21 | `agent_identity` | partial | Agent identity fields and org graph support owner/team/role/logo concepts; schedule and full Paperclip-style management UX remain incomplete. |
| 22 | `memory_scoping` | implemented | `AgentMemoryPolicy` supports flexible read/write scopes and memory layers. |
| 23 | `data_access_scope` | partial | Structured access is grant and context-policy driven; explicit named context pack/view UX remains incomplete. |
| 24 | `employee_model_depth` | partial | Agent as digital employee is canonical; full employee-management panel is not complete. |
| 25 | `org_model` | implemented | Agent records and inspect fiche support owner, manager, team, reports, workspace, and project projections. |
| 26 | `agent_retirement` | partial | Schema has archive/retired snapshot fields; complete revoke plus recoverable snapshot workflow still needs operational tests. |
| 27 | `runtime_binding` | implemented | `agent_execution_profiles` and run records bind runtime/sandbox/model profile. |
| 28 | `intelligence_levels` | implemented | Blueprints and execution profiles expose declarative model/speed/tier fields. |
| 29 | `execution_modes` | partial | Schema includes execution mode; runtime dispatch coverage for sync/async remains incomplete. |
| 30 | `sandbox_model` | implemented | Execution profiles and runs carry sandbox/network/host policy fields. |
| 31 | `permission_escalation` | implemented | `createAgentPermissionEscalationRequest` records reason, resource, action, scope, duration, risk, and approver. |
| 32 | `grant_duration` | implemented | Grants support `expiresAt` and duration/expiry is tested. |
| 33 | `memory_layers` | implemented | Memory layers cover agent private, team, global, customer, project, session, and custom. |
| 34 | `memory_write_policy` | implemented | Memory access checks enforce explicit write policy. |
| 35 | `cross_user_memory` | implemented | Memory checks enforce tenant/customer boundaries and explicit-grant-only cross-user behavior. |
| 36 | `assignment_kinds` | implemented | Assignment kind registry covers internal, external, automation, workflow, subagent, MCP/API, Relay, and custom placements. |
| 37 | `mac_ui_visibility` | partial | ADR states Mac visibility is assignment/favorites based; native Clawix UI implementation remains outside this first framework slice. |
| 38 | `external_channel_model` | implemented | External web, Telegram, WhatsApp, email, support inbox, and custom channels are assignment kinds with route checks. |
| 39 | `external_identity_policy` | implemented | External identity resolves external user, actor, telemetry, contact projection, customer, and boundary. |
| 40 | `conversation_canonical_store` | implemented | `createAgentSupportInboxProjection` creates support conversation/message records separate from runtime sessions. |
| 41 | `visitor_pii_default` | implemented | Visitor telemetry is per assignment and defaults to hashed/minimized behavior. |
| 42 | `tool_model` | partial | Tools are represented through grants and connector control plane; a fuller public tool catalog binding remains incomplete. |
| 43 | `action_severity` | partial | Incidents/evaluations model severity/status; complete action severity taxonomy remains to be formalized. |
| 44 | `connector_integration` | implemented | MCP/control-plane tests require connector approval plus Agents V1 MCP assignment/access policy. |
| 45 | `autonomy_axis` | partial | Agent records expose autonomy policy fields; full policy-profile registry and UI are incomplete. |
| 46 | `supervision_model` | partial | Org graph supports managers/supervisors; limited-authority supervisor enforcement needs more policy tests. |
| 47 | `agent_evaluation` | implemented | `agent_evaluations`, `createAgentEvaluation`, CLI, SDK facade, and tests exist. |
| 48 | `agent_config_versioning` | implemented | `agent_config_revisions`, redacted revision helper, CLI, and tests exist. |
| 49 | `agent_templates` | implemented | `agent_blueprints` and `createAgentBlueprint` are separate from live agents. |
| 50 | `agent_export` | implemented | `createAgentSafePackageExport` redacts secrets and private local paths. |
| 51 | `agent_ui_scope` | partial | ADR defines the full future UI scope; implementation is not part of the first framework slice. |
| 52 | `permission_ui_model` | partial | Inspect fiche exposes grants/gaps/risks; full human permission UI remains future work. |
| 53 | `agent_creation_flow` | partial | Blueprint/package helpers support assisted creation primitives; full assisted flow plus review UI remains incomplete. |
| 54 | `agent_storage` | partial | Canonical DB tables and sidecar projections exist; full storage/secret-vault integration audit remains pending. |
| 55 | `agent_public_surfaces` | partial | CLI, SDK, MCP gate, Relay-safe projections, service API envelope, persistence, and inspect exist; full HTTP/process service binding remains incomplete. |
| 56 | `host_boundary_agents` | partial | ADR assigns native execution, approvals, leases, and host audit to host; host-dependent validation is external pending. |
| 57 | `refactor_scope` | partial | `company_agents` overlap is reconciled in board storage; broader legacy audit remains before completion. |
| 58 | `existing_agents_migration` | partial | Board roster writes canonical `agents`; remaining legacy public overlap must be audited and retired. |
| 59 | `agent_architecture_record` | partial | ADR 0020 exists and this matrix exists; final private Q/A audit is still required before goal closure. |
| 60 | `canonical_agent_collection` | implemented | Built-in catalog and CLI schema identify `agents` as canonical. |
| 61 | `agent_owner_scope` | implemented | Agent records and schemas support owner kind/id, company, workspace, project, team, manager, and reports. |
| 62 | `agent_json_policy` | partial | Critical subentities are normalized; some extensible metadata remains JSON by design and needs final schema audit. |
| 63 | `agent_subentities` | implemented | Required subentity tables/schemas exist for assignments, execution profiles, grants, memory policies, budgets, revisions, evaluations, incidents, blueprints, runs, and sessions. |
| 64 | `agent_run_store` | implemented | `agent_runs` and `agent_sessions` are separate persistent tables and inspect inputs. |
| 65 | `assignment_status` | implemented | Assignment lifecycle enum covers draft, pending approval, active, paused, expired, revoked, archived, and error. |
| 66 | `budget_dimensions` | implemented | Budget policy supports multidimensional limits and scoped usage. |
| 67 | `budget_exceeded_behavior` | implemented | Budget result returns exceeded behavior, including affected-scope policies. |
| 68 | `external_cost_policy` | implemented | `evaluateAgentBudget` requires connector gate for external paid actions. |
| 69 | `agent_disclosure` | implemented | External disclosure defaults to transparent agent wording; custom wording is risk-flagged. |
| 70 | `internal_agent_chat` | implemented | Internal Mac chat is an `internal_mac_chat` assignment and route. |
| 71 | `agent_to_agent` | implemented | Subagent communication is modeled as `subagent_delegation` and checked through delegation access. |
| 72 | `agent_package_format` | implemented | `claw_agent_package` safe export is the portable package format. |
| 73 | `skill_binding_model` | implemented | `AgentSkillBinding` supports refs, versions, required assignment kinds, and redacted required grants; `skillRefs` normalizes to bindings. |
| 74 | `paperclip_interop` | partial | ADR states Paperclip is inspiration only; optional importer compatibility is not implemented. |
| 75 | `audit_depth` | partial | Governable helpers emit audit events; final audit coverage across every write/query path remains incomplete. |
| 76 | `redaction_model` | implemented | Boundary redaction applies to exports, projections, revisions, incidents, evaluations, activity feeds, and skill bindings. |
| 77 | `incident_model` | implemented | `agent_incidents`, helper, CLI, schema migration, and tests exist. |
| 78 | `query_surfaces` | partial | CLI/inspect/activity feed and SDK service API envelope exist; complete operational query API remains incomplete. |
| 79 | `agent_inspect_depth` | partial | `claw inspect agent <id>` renders identity, routes, grants, memory, budgets, incidents, revisions, risks, and gaps; final fiche depth audit remains. |
| 80 | `human_consumption` | implemented | `createAgentActivityFeed` and CLI produce a redacted timeline for human consumption. |
| 81 | `placement_term` | implemented | Canonical term is `assignment` in ADR, CLI, schema, and tests. |
| 82 | `execution_profile_term` | implemented | Canonical term is `execution_profile` in tables, CLI schema, and route graph. |
| 83 | `grant_term` | implemented | Canonical term is `resource_grant` in tables, types, and CLI schema. |
| 84 | `implementation_slice` | partial | Model plus gates and service API envelope are underway and tested; E2E and legacy closure remain. |
| 85 | `privacy_regime` | partial | Local-first hashing, redaction, raw-retention opt-in, and support projection exist; export/delete lifecycle still needs complete public workflow. |
| 86 | `acceptance_gate` | partial | Registry, policy tests, and focused hermetic tests exist; full E2E and one-by-one private decision audit remain before completion. |
