# Connector Governed Context Source Decision Audit

Source conversation: `019e3a54-4629-7c90-b85e-927bf34c4d1b`

Reference plan item: `019e3a65-edb8-7350-ba56-1c5d4e097677-plan`

This audit is the privacy-safe public enumeration of the source decisions for
ADR 0029. It intentionally records conversation and plan identifiers, not local
session paths or maintainer-private goal files. Goal completion requires a
fresh one-by-one review of these rows against the private source session before
the maintainer-local goal can be closed.

## Source Q/A Review Map

Reviewed from the source conversation on 2026-05-18. Source anchors below are
conversation event line numbers only; this public audit intentionally avoids
local session paths.

| QA ID | Source anchor | Decision keys | User decision captured |
| --- | --- | --- | --- |
| QA-001 | lines 110/112 | `scope_shape`, `provider_slice`, `identifier_sensitivity` | Broad connector operational context, not only Apple/app distribution; provider slice follows broad scope; operational identifiers are private/redacted by default. |
| QA-002 | lines 141/143 | `governance_level`, `completion_gate`, `cli_home` | Fix the rule in ADR plus Constitution; supported operations fail closed; CLI design must consider `connectors context`, `accounts`, and `resources` roles before narrowing. |
| QA-003 | lines 168/170 | `primary_concept`, `connector_universe`, `definition_of_done` | Operational context is central, but accounts and resource refs matter; every supported connector is in scope; done means operable without guessing. |
| QA-004 | lines 192/194 | `governed_object_model`, `usage_policy_granularity`, `instruction_strength` | Use a common governed object model; policy applies at object and field levels; combine enforceable policy with agent-facing guidance. |
| QA-005 | lines 198/200 | `governed_states`, `default_resolution`, `fallback_behavior` | States are active, paused, blocked, retired; defaults resolve by scope and priority; fallbacks are ordered and conditional. |
| QA-006 | lines 203/205 | `agent_visibility`, `approval_requirements`, `usage_audit` | Agents see redacted values plus guidance by default; approval depends on risk and policy; audit use, decision, and actor. |
| QA-007 | lines 209/211 | `cli_authority`, `accounts_role`, `resources_role` | Do not force one CLI concept prematurely; preserve connector association, make `accounts` human-useful, and keep `resources` cautious because it reads as file-like/generic. |
| QA-008 | lines 215/217 | `human_vocab`, `technical_surface`, `resource_decision` | `accounts` is the human entrypoint; `connectors context` is the technical authority; `resources` provides visible internal refs. |
| QA-009 | lines 221/223 | `context_hierarchy`, `base_object_kinds`, `provider_schema_contract` | Use a flexible typed provider tree; include broad common kinds; provider schemas declare fields, policy, and examples. |
| QA-010 | lines 226/228 | `sensitivity_levels`, `private_identifier_policy`, `notes_privacy` | Use public/private/secret_ref; private identifiers are redacted but usable by policy; notes/instructions are private/redacted by default. |
| QA-011 | lines 232/234 | `record_origin`, `external_drift`, `source_trust` | Support manual creation plus safe import; keep observed provider state separate from desired local state; track source and verification. |
| QA-012 | lines 238/240 | `existing_connectors_scope`, `gap_handling`, `supported_gate` | Complete all existing connector providers; do not close with unresolved context gaps; supported operations must fail closed completely. |
| QA-013 | lines 244/246 | `complete_all_meaning`, `provider_priority`, `context_completeness_depth` | Complete provider-level context, not every external operation; follow current catalog order; depth is daily-use objects plus risks. |
| QA-014 | lines 255/257 | `new_provider_scope`, `google_split`, `apple_scope` | Add Apple, Amazon Appstore, and RevenueCat; model Google Play as a Google subprofile; Apple includes Developer, App Store Connect, and signing. |
| QA-015 | lines 261/263 | `secrets_alignment`, `secret_guidance`, `cross_use_tracking` | Align Secrets through common policy vocabulary; add non-secret guidance for secret choices; audit context and secret use as one decision. |
| QA-016 | lines 267/269 | `policy_scopes`, `environment_model`, `agent_policy` | Use practical scopes: global, workspace, project, app, environment, provider, operation, agent, role; model environment explicitly; support allow/deny by agent or role. |
| QA-017 | lines 273/275 | `cli_v1_depth`, `explain_shape`, `blocked_action_response` | CLI can list, edit, validate, and explain; explanations are traced decisions; blocked actions fail closed with a remedy. |
| QA-018 | lines 279/281 | `storage_shape`, `export_policy`, `sync_policy` | Store governed structure in `core.sqlite` with secret refs; export redacted by default plus protected private envelope; future sync is policy-aware. |
| QA-019 | lines 285/287 | `v1_non_goal`, `live_import_approval`, `provider_mutation_future` | V1 does not mutate real providers; live read-only import requires explicit approval; future mutation uses the same control plane. |
| QA-020 | lines 291/293 | `constitution_change_shape`, `adr_depth`, `agent_instructions` | Add a short constitutional principle; ADR includes decisions and contracts; update integration and Secrets instructions/skills. |
| QA-021 | lines 297/299 | `apple_acceptance`, `revenuecat_acceptance`, `current_provider_acceptance` | Apple must choose correct Team ID/Bundle ID or fail closed; RevenueCat v2 default and v1 fallback must be tested; current providers need doctor with no context gaps. |
| QA-022 | lines 303/305 | `cli_aliases`, `technical_command_length`, `cli_examples_style` | Human aliases are `accounts` and `acct`; technical short alias is `connectors ctx`; CLI examples optimize for operational questions. |

## Requirement Audit

| ID | Decision key | Status | Evidence / remaining work |
| --- | --- | --- | --- |
| CGC-001 | `scope_shape` | implemented | ADR 0029 and `docs/connector-governed-context.md` define broad governed external accounts and connector context; `packages/clawjs-core/src/connector-governed-context.ts` covers provider objects, fields, policies, defaults, fallbacks, and `secret_ref` links beyond app distribution. |
| CGC-002 | `provider_slice` | implemented | The broader scope is reflected in `CONNECTOR_GOVERNED_CONTEXT_PROVIDER_SCHEMAS`, which covers the existing connector catalog plus Apple, Amazon Appstore, RevenueCat, and Google Play as a Google subprofile. |
| CGC-003 | `identifier_sensitivity` | validated | Store identifiers such as Team ID, Bundle ID, SKU, package name, signing identity, project/app/product ids, and public SDK-like identifiers are modeled as `private` in provider schemas and redacted in `redactConnectorContextRecord`; CLI/core tests assert redaction. |
| CGC-004 | `governance_level` | documented | `CONSTITUTION.md` adds the governed operational context principle; ADR 0029 records the durable architecture and validation gates. |
| CGC-005 | `completion_gate` | validated | `evaluateGovernedContext` fails closed for supported operations with context requirements; control-plane tests cover denied/missing governed context and propagated reason codes. |
| CGC-006 | `cli_home` | implemented | CLI surfaces exist for `accounts`, `acct`, `connectors context`, and `connectors ctx`; `resources` is kept as stable reference projection rather than primary UX. |
| CGC-007 | `primary_concept` | implemented | The core model treats operational context as first-class while records expose `resourceId` refs and human account surfaces; docs explicitly separate `accounts`, `connectors context`, and `resources`. |
| CGC-008 | `connector_universe` | validated | Provider schema tests assert catalog order and added store providers; the doctor test requires all builtin provider schemas to pass with no gaps. |
| CGC-009 | `definition_of_done` | documented | ADR 0029 and connector governed context docs define provider completeness as daily-use context, required fields, fixtures, and fail-closed explainability. |
| CGC-010 | `governed_object_model` | implemented | `ConnectorGovernedContextRecord` is the common record shape with state, policy, guidance, scopes, desired/observed, verification, source, and `resourceId`. |
| CGC-011 | `usage_policy_granularity` | validated | Object and field policies are represented in record/field types; tests cover object denial, field denial, and field approval requirements. |
| CGC-012 | `instruction_strength` | implemented | Provider, kind, field, and record guidance coexist with enforceable policy; RevenueCat and Apple schemas include operational guidance. |
| CGC-013 | `governed_states` | implemented | `CONNECTOR_GOVERNED_STATES` defines active, paused, blocked, and retired; CLI supports activate/pause/block/retire and tests persist state changes. |
| CGC-014 | `default_resolution` | validated | `resolveConnectorContextDefaultRefs` matches global/workspace/project/app/environment/provider/operation/agent/role scope and priority; core and CLI tests cover scoped defaults. |
| CGC-015 | `fallback_behavior` | validated | `ConnectorContextFallbackRule` captures ordered fallback intent; RevenueCat tests assert v2 default falls back to v1 only with traced fallback rule id. |
| CGC-016 | `agent_visibility` | validated | Redaction returns private values as `redacted` and secret material as null/`secret_ref`; CLI explain/export tests assert redacted output. |
| CGC-017 | `approval_requirements` | validated | Context policy supports `requires_approval`; control-plane tests require approval grants for risk/policy-sensitive flows and include approval grant ids in audit. |
| CGC-018 | `usage_audit` | validated | `ConnectorAuditDeclaration` and `connector_context_audit_events` record provider, operation, actor/request ids, context refs, field refs, secret refs, defaults, fallback rules, approval grants, decisions, and reason codes. |
| CGC-019 | `cli_authority` | implemented | The final CLI preserves both human and technical roles: `accounts` for human operations and `connectors context` for technical authority, with `resources` only as reference projection. |
| CGC-020 | `accounts_role` | implemented | `accounts list/show/explain/upsert/link-secret/defaults/export` exposes provider accounts, projects, apps, ids, products, and secret refs in operational terms. |
| CGC-021 | `resources_role` | implemented | `resources` remains generic; governed context creates opaque `res_*` projections and `accounts show res_*` resolves them without moving primary management to `resources`. |
| CGC-022 | `human_vocab` | implemented | `runConnectorContextCli` accepts `accounts` as the canonical human command and docs use `claw accounts ...` examples. |
| CGC-023 | `technical_surface` | implemented | `runConnectorContextCli` accepts `connectors context`; docs and ADR identify it as technical authority. |
| CGC-024 | `resource_decision` | validated | Store tests assert generated opaque `res_*` ids and resource projection/resolution for governed context records. |
| CGC-025 | `context_hierarchy` | implemented | Provider schemas use typed context kinds with parent-capable records and provider-specific trees such as account/team/app/product/key/signing identity. |
| CGC-026 | `base_object_kinds` | implemented | `CONNECTOR_CONTEXT_KINDS` includes account, organization, workspace, project, team, app, product, entitlement, key, webhook, endpoint, environment, and signing_identity. |
| CGC-027 | `provider_schema_contract` | validated | Provider schemas declare source docs, fields, sensitivities, context kinds, guidance, defaults/fallbacks, examples, and fixtures; doctor tests fail on missing examples/fallback refs. |
| CGC-028 | `sensitivity_levels` | implemented | `CONNECTOR_CONTEXT_SENSITIVITIES` is public/private/secret_ref and is enforced by doctor validation and redaction helpers. |
| CGC-029 | `private_identifier_policy` | validated | Private identifiers are not printed by default but remain available in internal records for policy-allowed operations; redaction tests and CLI explain tests cover this behavior. |
| CGC-030 | `notes_privacy` | documented | The public contract says agents receive allowed guidance summaries, while private notes/instructions remain redacted by default. V1 stores guidance, not plaintext private maintainer notes. |
| CGC-031 | `record_origin` | implemented + blocked external | Manual creation is implemented with `accounts upsert`; source values include manual/imported/provider_readonly/fixture. Live provider import remains `EXTERNAL PENDING` unless explicit approval, brokered credentials, and read-only audit are available. |
| CGC-032 | `external_drift` | validated | Records preserve separate `desired` and `observed` JSON; CLI tests assert edits do not erase desired/observed drift evidence. |
| CGC-033 | `source_trust` | validated | Records preserve `source` and `verification`; storage/export tests assert verification metadata survives edits. |
| CGC-034 | `existing_connectors_scope` | validated | The provider catalog includes all 12 existing providers in current catalog order and tests assert provider doctor has no structural gaps. |
| CGC-035 | `gap_handling` | validated | `buildConnectorContextDoctorReport` reports missing source docs, guidance, secret refs, examples, required fields, default refs, and fallback refs; tests assert no builtin gaps and detect manufactured gaps. |
| CGC-036 | `supported_gate` | validated | Control-plane tests cover missing context, denied context, missing credential binding, approval, and unsupported operations as fail-closed decisions. |
| CGC-037 | `complete_all_meaning` | documented | Docs and ADR define closure as provider-level context completeness; unsupported/external operations may remain non-executable with explicit status. |
| CGC-038 | `provider_priority` | validated | `CONNECTOR_GOVERNED_CONTEXT_PROVIDER_ORDER` uses the existing provider catalog order before Apple, Amazon Appstore, and RevenueCat; tests assert exact order. |
| CGC-039 | `context_completeness_depth` | validated | Provider schemas include daily-use context kinds, required fields, source docs, risks through policy/guidance, examples, defaults/fallbacks, and at least one `secret_ref`; doctor checks enforce the depth. |
| CGC-040 | `new_provider_scope` | implemented | Apple, Amazon Appstore, and RevenueCat provider profiles are in the schema catalog and are covered by tests. |
| CGC-041 | `google_split` | validated | Google Play is a `google` subprofile, not a separate provider; tests assert `google.subprofiles` contains `google_play`. |
| CGC-042 | `apple_scope` | implemented | Apple schema covers developer account, Team ID, Bundle ID, SKU, App Store Connect API key, issuer/key ids, products, entitlements, signing identity, and environment. |
| CGC-043 | `secrets_alignment` | documented | `docs/secrets.md`, `docs/secrets-security.md`, and ADR 0029 align Secrets with governed context policy vocabulary without moving credentials into `core.sqlite`. |
| CGC-044 | `secret_guidance` | implemented | `ConnectorContextGuidance` supports non-secret guidance for keys and providers; RevenueCat guidance encodes "prefer v2, v1 fallback only" without exposing secret values. |
| CGC-045 | `cross_use_tracking` | validated | Control-plane audit tests assert unified context+secret+default+fallback+approval metadata for RevenueCat execution. |
| CGC-046 | `policy_scopes` | validated | Default resolution covers global, workspace, project, app, environment, provider, operation, agent, and role scopes; policy applicability covers operations, agents, and roles. |
| CGC-047 | `environment_model` | validated | Environment is a first-class scope and field; wrong-environment decisions fail closed with remedy and tests cover environment mismatch. |
| CGC-048 | `agent_policy` | validated | Object and field policies support `appliesToAgents` and `appliesToRoles`; tests verify scoped policies affect only matching agents/roles. |
| CGC-049 | `cli_v1_depth` | validated | CLI implements list, show/schema/inspect, doctor/validate, explain, upsert/create/edit, link-secret, defaults set/list, audit, state verbs, and export; CLI tests cover core flows. |
| CGC-050 | `explain_shape` | validated | `explainConnectorContextChoice` returns selected/rejected records, reason codes/remedies, default refs, fallback rule ids, provider/operation/environment trace; CLI tests inspect traced decisions. |
| CGC-051 | `blocked_action_response` | validated | Blocked, paused, retired, wrong-environment, missing-field, missing-secret, denied, and approval-required cases produce fail-closed reasons with remedies in tests. |
| CGC-052 | `storage_shape` | validated | `core.sqlite` tables `connector_context_records`, `connector_context_defaults`, and `connector_context_audit_events` are declared and tested; secret values remain refs. |
| CGC-053 | `export_policy` | validated | `accounts export` defaults to redacted output and supports `--mode private-envelope`; tests assert no plaintext secret material and audit `context.export`. |
| CGC-054 | `sync_policy` | documented | Future sync requirements are documented as policy-aware, scope-preserving, redacted, and secret-ref-only. No physical sync implementation is required for V1 closure. |
| CGC-055 | `v1_non_goal` | documented | CLI docs and ADR state local context commands do not mutate real providers. |
| CGC-056 | `live_import_approval` | blocked external | Live read-only import requires explicit approval, brokered credentials, read-only policy, and audit; absent that environment it remains `EXTERNAL PENDING`, not an implementation defect. |
| CGC-057 | `provider_mutation_future` | documented | Future provider mutation must use governed context, Secrets broker, approvals, audit, and dry-run/plan before execution according to ADR 0029. |
| CGC-058 | `constitution_change_shape` | documented | `CONSTITUTION.md` adds a short governed operational context principle. |
| CGC-059 | `adr_depth` | documented | ADR 0029 includes context, decision, consequences, storage, CLI, policy, security, provider schemas, completion gates, and validation. |
| CGC-060 | `agent_instructions` | documented | `skills/secrets-boundary-review`, `skills/integration-qa-lab`, and `skills/public-hygiene-review` include governed context, defaults, policy, secret refs, guidance, audit, and public hygiene checks. |
| CGC-061 | `apple_acceptance` | validated | Core, control-plane, and CLI tests cover Apple signing/release context, including Team ID/Bundle ID/SKU requirements, blocked context, missing fields, redaction, and remedies. |
| CGC-062 | `revenuecat_acceptance` | validated | Core, control-plane, and CLI tests cover RevenueCat v2 default, v1 fallback, secret refs, fallback trace, approval grant, and audit metadata. |
| CGC-063 | `current_provider_acceptance` | validated | `buildConnectorContextDoctorReport()` returns ok for all builtin providers and tests assert zero gaps. |
| CGC-064 | `cli_aliases` | validated | CLI accepts `accounts` and `acct`; CLI tests cover both. |
| CGC-065 | `technical_command_length` | validated | CLI accepts `connectors context` and `connectors ctx`; CLI tests cover both. |
| CGC-066 | `cli_examples_style` | documented | Docs and usage examples emphasize operational questions such as explaining Apple upload/signing and RevenueCat project configuration choices. |

## Final Closure Gate

This audit does not close the goal. Final closure still requires re-reading the
private source session one row at a time, confirming the implementation and
validation evidence above is current, and recording any remaining physical
provider checks as `EXTERNAL PENDING` instead of implementation bugs.
