# Agents V1 Decision Matrix

Status: completion tracker

Date: 2026-05-17

Source conversation: `source:agents-v1`

This matrix tracks the 86 binding Agents V1 decisions against public ClawJS
evidence. The private source session was reviewed one decision at a time before
completion, with each row proved implemented, documented, explicitly
`EXTERNAL PENDING`, or superseded by a later user decision.

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
| 3 | `default_posture` | implemented | `createAgentDispatchPlan`, SDK `agents.dispatchPlan`, and `claw agents dispatch-plan` fail closed without an active assignment/profile and keep external assignments respond-only unless `externalActAllowed` is explicitly granted. |
| 4 | `v1_depth` | implemented | The first slice includes contracts plus enforcement: schemas, core gates, CLI, SDK, inspect, route graph, service API envelope, hermetic POST handler, MCP/Relay-safe projections, and focused hermetic tests. Native host/UI validation is tracked separately as `EXTERNAL PENDING`. |
| 5 | `deployment_granularity` | superseded | ADR 0020 models Agent plus assignment/endpoints instead of root deployments. |
| 6 | `context_scope` | implemented | `createAgentContextPack`, SDK `agents.contextPack`, and `claw agents context-pack` project explicit view-scoped context packs from requested records, enforce grants across every control plane, redact boundary values, and audit denied/required context. |
| 7 | `identity_storage` | implemented | `AgentAssignmentPrivacyPolicy` supports `off`, `hashed`, and `raw_with_retention`; raw retention now requires `telemetryRetentionDays`. |
| 8 | `crm_projection` | implemented | `resolveAgentExternalIdentity` projects strong identifiers to `contactProjection: "create_or_update"`. |
| 9 | `ambition_level` | implemented | ADR 0020, schemas, gates, CLI/SDK/API/inspect, control panel, privacy, storage/audit, Paperclip import, and migration work define the broad standard rather than a narrow internal fix. |
| 10 | `canonical_name` | superseded | Public docs use Agents V1 and assignment terminology; deployment is not the root concept. |
| 11 | `domain_boundary` | implemented | `agents` is the canonical collection and CLI group; subentities are under the agents domain. |
| 12 | `agent_core_model` | implemented | Agent records include identity, skills, grants, memory, budgets, evaluations, incidents, audit surfaces, `createAgentControlPanel`, SDK `agents.controlPanel`, `claw agents control-panel`, and inspect fiche projection for employee-like operation. |
| 13 | `agent_vs_placement` | implemented | ADR 0020 and route checks distinguish durable agent definition from assignments. |
| 14 | `agent_instance_model` | implemented | ADR 0020 and schemas distinguish `agent`, `agent_runs`, and `agent_sessions`. |
| 15 | `agent_modes` | implemented | `AGENCY_MODES` is an extensible registry with assistant, worker, support, receptionist, operator, automation, workflow agent, subagent, reviewer, and manager. |
| 16 | `isolation_default` | implemented | Effective access fails closed when any plane lacks an allow grant. |
| 17 | `resource_inheritance` | implemented | `evaluateAgentEffectiveAccess` requires intersection across agent, assignment, execution profile, connector, host, and run scope grants. |
| 18 | `resource_model` | implemented | `AgentResourceGrant` is the unified resource grant model. |
| 19 | `permission_shape` | implemented | Grants and requests use resource type/id, action, scope type/id, effect, and expiry. |
| 20 | `secret_access_model` | implemented | Secret/vault read, write, and execute requests are denied; only `lease_secret` can enter brokered flow. |
| 21 | `agent_identity` | implemented | `agents` schema and projections cover name, role, title, description, logoRef/avatar, owner/workspace/project/team/manager graph, schedule JSON, favorite/Mac visibility signal, and control-panel identity output. Paperclip-specific UX remains tracked separately as interop. |
| 22 | `memory_scoping` | implemented | `AgentMemoryPolicy` supports flexible read/write scopes and memory layers. |
| 23 | `data_access_scope` | implemented | Named context view policies (`allowedResourceTypes`, `allowedScopes`, `maxItems`, `includeContent`) now constrain data projected into an agent run through context packs, with denied items and gaps exposed for review. |
| 24 | `employee_model_depth` | implemented | Agent as digital employee is canonical and now has a shared control-panel projection combining identity, posture, permissions, memory, budgets, creation review, operational snapshot, activity feed, risks, and gaps. |
| 25 | `org_model` | implemented | Agent records and inspect fiche support owner, manager, team, reports, workspace, and project projections. |
| 26 | `agent_retirement` | implemented | `createAgentRetirementPlan` and `claw agents retirement-plan` produce archive, assignment revoke, grant expiry/deny, recoverable snapshot, redaction, and audit output. |
| 27 | `runtime_binding` | implemented | `agent_execution_profiles` and run records bind runtime/sandbox/model profile. |
| 28 | `intelligence_levels` | implemented | Blueprints and execution profiles expose declarative model/speed/tier fields. |
| 29 | `execution_modes` | implemented | Dispatch plans map `sync`, `async`, `streaming`, and `scheduled` execution profiles to `invoke_sync`, `queue_async`, `stream`, or `schedule` dispositions, with scheduled runs requiring `scheduledAt`. |
| 30 | `sandbox_model` | implemented | Execution profiles and runs carry sandbox/network/host policy fields. |
| 31 | `permission_escalation` | implemented | `createAgentPermissionEscalationRequest` records reason, resource, action, scope, duration, risk, and approver. |
| 32 | `grant_duration` | implemented | Grants support `expiresAt` and duration/expiry is tested. |
| 33 | `memory_layers` | implemented | Memory layers cover agent private, team, global, customer, project, session, and custom. |
| 34 | `memory_write_policy` | implemented | Memory access checks enforce explicit write policy. |
| 35 | `cross_user_memory` | implemented | Memory checks enforce tenant/customer boundaries and explicit-grant-only cross-user behavior. |
| 36 | `assignment_kinds` | implemented | Assignment kind registry covers internal, external, automation, workflow, subagent, MCP/API, Relay, and custom placements. |
| 37 | `mac_ui_visibility` | external_pending | Framework evidence exists through `internal_mac_chat`, `favorite`, route graph, and control-panel visibility; native Clawix UI rendering/validation is host-app work and cannot be treated as complete here without explicit native validation approval. |
| 38 | `external_channel_model` | implemented | External web, Telegram, WhatsApp, email, support inbox, and custom channels are assignment kinds with route checks. |
| 39 | `external_identity_policy` | implemented | External identity resolves external user, actor, telemetry, contact projection, customer, and boundary. |
| 40 | `conversation_canonical_store` | implemented | `createAgentSupportInboxProjection` creates support conversation/message records separate from runtime sessions. |
| 41 | `visitor_pii_default` | implemented | Visitor telemetry is per assignment and defaults to hashed/minimized behavior. |
| 42 | `tool_model` | implemented | `createAgentToolCatalogProjection`, SDK `agents.toolCatalog`, and `claw agents tool-catalog` expose a grant-authorized tool catalog per assignment/domain, block unapproved or catastrophic tools, and audit catalog gaps. |
| 43 | `action_severity` | implemented | `evaluateAgentActionSeverity`, SDK `agents.actionSeverity`, and `claw agents action-severity` classify actions into `info`/`low`/`medium`/`high`/`critical` and return approval, connector, budget, and host gates. |
| 44 | `connector_integration` | implemented | MCP/control-plane tests require connector approval plus Agents V1 MCP assignment/access policy. |
| 45 | `autonomy_axis` | implemented | `evaluateAgentAutonomyPolicy`, SDK `agents.autonomyCheck`, and `claw agents autonomy-check` enforce `respond_only`, `suggest`, `act_limited`, and `act_full` profiles against action severity and required gates. |
| 46 | `supervision_model` | implemented | `evaluateAgentSupervisorAuthority`, SDK `agents.supervisorCheck`, and `claw agents supervisor-check` limit supervisors by manager relationship, delegated action, risk ceiling, and scope. |
| 47 | `agent_evaluation` | implemented | `agent_evaluations`, `createAgentEvaluation`, CLI, SDK facade, and tests exist. |
| 48 | `agent_config_versioning` | implemented | `agent_config_revisions`, redacted revision helper, CLI, and tests exist. |
| 49 | `agent_templates` | implemented | `agent_blueprints` and `createAgentBlueprint` are separate from live agents. |
| 50 | `agent_export` | implemented | `createAgentSafePackageExport` redacts secrets and private local paths. |
| 51 | `agent_ui_scope` | external_pending | Framework UI contract exists through `createAgentControlPanel`, SDK/CLI/inspect projections, activity feed, permissions, costs, incidents, evaluations, and gaps; native Clawix UI implementation remains outside this ClawJS slice. |
| 52 | `permission_ui_model` | implemented | `createAgentControlPanel`, SDK `agents.controlPanel`, CLI `claw agents control-panel`, and `claw inspect agent <id>` expose human-readable permission counts, required approvals, risks, gaps, posture, and redacted operational context for UI consumption. |
| 53 | `agent_creation_flow` | implemented | `createAgentCreationReview`, SDK `agents.creationReview`, and `claw agents creation-review` review proposed agents before activation, producing a safe package, surface projection, gaps, risks, and required approvals. |
| 54 | `agent_storage` | implemented | `createAgentStorageAudit`, SDK `agents.storageAudit`, and `claw agents storage-audit` verify canonical subentity collections/tables, detect legacy overlaps such as `company_agents`, and flag secret-policy gaps. |
| 55 | `agent_public_surfaces` | implemented | CLI, SDK, MCP gate, Relay-safe projections, fail-closed service API envelope plus hermetic POST `/v1/agents/service-api` handler, persistence, inspect fiche, control panel, and privacy plan are public/tested surfaces. |
| 56 | `host_boundary_agents` | external_pending | ADR and gates assign native execution, approvals, leases, and host audit to host; validating real native host behavior requires host-dependent permission flows not approved in this session. |
| 57 | `refactor_scope` | implemented | Repo audit found `company_agents` as the live legacy overlap; board creation writes canonical `agents`, legacy is read-only fallback/cleanup only, and `updateAgent` migrates legacy-only rows into canonical `agents` instead of writing `company_agents`. |
| 58 | `existing_agents_migration` | implemented | Existing board agents list/read legacy only as fallback, new writes go to `agents`, legacy-only update migrates to `agents` with `legacySourceCollection`/`legacySourceId`, and storage audit flags remaining legacy collections for cleanup. |
| 59 | `agent_architecture_record` | implemented | ADR 0020, this public matrix, and the private one-by-one source-session audit now record the architecture decisions and their closure evidence without publishing local session paths. |
| 60 | `canonical_agent_collection` | implemented | Built-in catalog and CLI schema identify `agents` as canonical. |
| 61 | `agent_owner_scope` | implemented | Agent records and schemas support owner kind/id, company, workspace, project, team, manager, and reports. |
| 62 | `agent_json_policy` | implemented | `createAgentStorageAudit` defines the allowlist for intentional JSON fields (`source`, `links`, `metadata`, scoped policy/config blobs) and reports unexpected JSON fields as audit gaps. |
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
| 74 | `paperclip_interop` | implemented | Paperclip remains inspiration only; `createAgentPaperclipImportPlan`, SDK `agents.paperclipImport`, and `claw agents paperclip-import` optionally map AGENTS.md/package-style descriptions into draft Claw blueprints and safe packages without making Paperclip a dependency or source of truth. |
| 75 | `audit_depth` | implemented | `createAgentAuditCoverageReport`, SDK `agents.auditCoverage`, and `claw agents audit-coverage` verify required audit event kinds, event shape, valid results/redaction, and sensitive metadata leaks. |
| 76 | `redaction_model` | implemented | Boundary redaction applies to exports, projections, revisions, incidents, evaluations, activity feeds, and skill bindings. |
| 77 | `incident_model` | implemented | `agent_incidents`, helper, CLI, schema migration, and tests exist. |
| 78 | `query_surfaces` | implemented | `createAgentOperationalSnapshot`, SDK `agents.operationalSnapshot`, and `claw agents operational-snapshot` provide a redacted operational query surface across assignments, runs, sessions, evaluations, incidents, config revisions, and audits. |
| 79 | `agent_inspect_depth` | implemented | `claw inspect agent <id>` renders identity, owner, org graph, assignments, execution profiles, grants, memory, budgets, runs, sessions, evaluations, incidents, revisions, routes, risks, gaps, tests, recent audit, control panel, and privacy lifecycle projection. |
| 80 | `human_consumption` | implemented | `createAgentActivityFeed` and CLI produce a redacted timeline for human consumption. |
| 81 | `placement_term` | implemented | Canonical term is `assignment` in ADR, CLI, schema, and tests. |
| 82 | `execution_profile_term` | implemented | Canonical term is `execution_profile` in tables, CLI schema, and route graph. |
| 83 | `grant_term` | implemented | Canonical term is `resource_grant` in tables, types, and CLI schema. |
| 84 | `implementation_slice` | implemented | Model, gates, schemas, CLI, SDK, inspect, service API handler, MCP/Relay-safe projections, control panel, privacy plan, storage/audit, Paperclip import, route fixtures, and legacy board migration are implemented and hermetically tested. |
| 85 | `privacy_regime` | implemented | Local-first hashing, redaction, raw-retention opt-in, support projection, `createAgentPrivacyLifecyclePlan`, SDK `agents.privacyPlan`, and `claw agents privacy-plan` cover subject export, delete, anonymization, legal holds, and redacted export records. |
| 86 | `acceptance_gate` | implemented | Acceptance evidence is complete for this ClawJS slice: all 86 source decisions were audited one by one, no matrix rows remain partial, registry/policy gates are implemented, broad hermetic Agents V1 tests pass, type/build checks pass, docs surface passes, legacy `company_agents` has no new write path, and native/provider-only gaps are separated as `external_pending`. |
