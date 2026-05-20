# Connector Governed Context Completion Audit

Source conversation: `019e3a54-4629-7c90-b85e-927bf34c4d1b`

Reference plan item: `019e3a65-edb8-7350-ba56-1c5d4e097677-plan`

Closure state: `complete_with_external_pending`

This audit is the public close gate for Connector Governed Context V1. It is
stricter than the source decision audit: a row may close only with current
implementation, documentation, validation, or explicitly accepted
`EXTERNAL PENDING` evidence.

Private source-session paths, maintainer-local goal files, provider account
values, Team IDs, Bundle IDs, SKUs, signing identities, and credentials are
intentionally excluded from this public file. Final private closure work
re-read the source session and confirmed every `CGC-001` through `CGC-066` row in
[Connector Governed Context Source Decision Audit](./source-audit.md)
against current implementation evidence.

## Requirement Status

| ID | Acceptance requirement | Current status | Evidence | Remaining blocker before final close |
| --- | --- | --- | --- | --- |
| CGA-001 | Every source Q/A and all 66 decision keys are reviewed one by one. | validated | The source decision audit enumerates `QA-001` through `QA-022` and `CGC-001` through `CGC-066`, with implementation, documentation, validation, and external-pending evidence. The private source-session re-read found 22 answered decision groups, 66 decision ids, no missing answers, and no later scope correction after the structured questions. `scripts/verify-connector-governed-context-goal.mjs` guards the row counts and decision keys. | Future source-session edits or additional decision turns must update the source audit and verifier before any later close claim. |
| CGA-002 | Governance, ADR, decision-map, and connector docs preserve governed operational context as framework architecture. | implemented | `CONSTITUTION.md` includes principle I.9; ADR 0029, `docs/connector-governed-context.md`, `docs/connector-control-plane.md`, and `docs/decision-map.md` route the concepts, CLI surfaces, storage, policy, audit, Secrets alignment, and completion gates. | Future connector governance changes must update these docs and the verifier together. |
| CGA-003 | Core governed object model covers sensitivities, states, kinds, provider schemas, defaults, fallbacks, policy, guidance, redaction, and doctor checks. | validated | `packages/clawjs-core/src/connector-governed-context.ts` exports the shared model, provider catalog, default/fallback resolution, redaction helpers, and doctor report; focused core tests cover schema, policy, redaction, Apple, RevenueCat, defaults, and fallbacks. | No current local blocker. |
| CGA-004 | All current providers plus Apple, Amazon Appstore, RevenueCat, and Google Play as a Google subprofile have daily-use schemas with no structural doctor gaps. | validated | The provider order is Discord, GitLab, GitHub, Google, Airtable, Salesforce, HubSpot, Stripe, Notion, Slack, Telegram Bot API, WhatsApp, Apple, Amazon Appstore, and RevenueCat. `buildConnectorContextDoctorReport()` is guarded by tests and by the goal verifier. | Live provider import remains separate from provider schema completion. |
| CGA-005 | Apple signing/release context chooses the correct Team ID/Bundle ID/SKU/signing identity context or fails closed with remedy. | validated | Apple schema fields are private by default, Apple context kinds include team, app, product, entitlement, key, signing identity, and environment, and core/control-plane/CLI tests cover missing fields, blocked context, redaction, and remedies. | Real App Store Connect or signing-console import is not part of local V1 validation without explicit approval. |
| CGA-006 | RevenueCat API v2 is the preferred default, v1 is fallback-only, and context plus secret plus fallback plus approval is audited. | validated | RevenueCat examples include `revenuecat_api_v2` and `revenuecat_api_v1`; schema defaults and fallback rules are tested; control-plane audit tests assert selected context refs, secret refs, default refs, fallback rule ids, approval grant, and reason codes. | Live RevenueCat API reads remain explicit-approval work. |
| CGA-007 | CLI V1 exposes human and technical surfaces with required aliases and operational `doctor`/`explain` behavior. | validated | `accounts`, `acct`, `connectors context`, and `connectors ctx` implement list, show/schema, doctor/validate, explain, upsert/edit, link-secret, defaults, audit, export, and state verbs. CLI tests cover aliases, doctor, defaults, explain traces, and redaction. | No current local blocker. |
| CGA-008 | Storage, exports, desired/observed drift, verification metadata, audit events, and `res_*` resource references use `core.sqlite` and never store plaintext secrets. | validated | Storage creates `connector_context_records`, `connector_context_defaults`, and `connector_context_audit_events`; tests cover desired/observed/verification preservation, `secret_material_rejected`, resource projection, redacted export, private envelope export, and export audit. | Future sync remains documented as policy-aware and is not required for V1 local closure. |
| CGA-009 | Secrets alignment uses common policy vocabulary while secret material stays vault-only. | validated | Secrets docs and skills name governed context, `secret_ref`, default/fallback guidance, approval, and audit; control-plane audit metadata joins context refs and secret refs without private values or credentials. | No current local blocker. |
| CGA-010 | Supported connector operations fail closed when context, policy, secret binding, environment, approval, audit fixture, or provider support is missing. | validated | `evaluateGovernedContext` and control-plane tests cover missing context, unsupported operations, denied object/field policy, wrong environment, missing secret binding, approval required, and audited RevenueCat context. | Live provider execution remains outside V1 without explicit approval. |
| CGA-011 | Skills, public hygiene, discoverability, and docs guardrails route future agents to the governed context requirements. | validated | `skills/secrets-boundary-review`, `skills/integration-qa-lab`, and `skills/public-hygiene-review` include governed connector context requirements; discoverability registers the goal verifier; `test:docs` runs the goal verifier. | No current local blocker. |
| CGA-012 | Public fixtures, docs, tests, and generated artifacts stay privacy-safe. | validated | Public audits avoid private session paths; examples use placeholders; redaction/export tests prevent private values and plaintext secret material. `npm run privacy:check` is part of the validation spine. | Re-run privacy checks before any final close if more files change. |
| CGA-013 | Live read-only import and real provider mutation are not silently claimed. | external_pending | ADR 0029 and connector docs state V1 does not mutate real providers; live read-only import requires explicit approval, brokered credentials, read-only policy, and audit. | Any live provider import remains `EXTERNAL PENDING` until the user explicitly approves that exact provider action. |
| CGA-014 | Final validation proves the goal requirement-by-requirement, not only by broad green tests. | validated | The goal verifier, source decision audit, this completion audit, focused core/control-plane/CLI/storage tests, docs checks, skills check, discoverability checks, privacy check, and whitespace diff check form the current evidence spine. | Future connector governed context edits must rerun the required validation map and reconcile any unrelated dirty-work failures without weakening this gate. |

## Required Validation Map

These checks are the acceptance spine used for this close. They must pass for
future changes too, except for live/provider checks explicitly marked
`EXTERNAL PENDING`.

| Area | Command or check |
| --- | --- |
| Goal verifier | `npm run test:connector-governed-context-goal` |
| Connector core/control-plane/CLI/storage | `npx vitest run --config vitest.config.ts packages/clawjs-core/src/connector-governed-context.test.ts packages/clawjs-core/src/connector-control-plane.test.ts packages/clawjs/src/cli-connector-context.test.ts packages/clawjs/src/v1-connector-control-plane-storage.test.ts` |
| Full docs lane | `npm run test:docs` |
| Discoverability | `node ./scripts/discoverability-check.mjs generate --check --no-cli`, `node ./scripts/discoverability-check.mjs audit --no-cli`, and `node ./scripts/discoverability-check.mjs --no-cli` |
| Docs | `node ./scripts/docs-surface-check.mjs`, `node ./scripts/docs-alignment-check.mjs`, and `node ./scripts/docs-rendered-link-check.mjs` |
| Skills | `node ./scripts/skills-check.mjs` |
| Privacy | `npm run privacy:check` |
| Live provider import | `EXTERNAL PENDING` unless explicitly approved with brokered credentials and audit |

## Closure Rule

The goal may stay closed only while the following remain true:

1. `CGA-001` through `CGA-014` are implemented, validated, or explicitly
   accepted as `EXTERNAL PENDING`.
2. The private source session is re-read against `CGC-001` through `CGC-066`
   and no decision-bearing answer, correction, or closure requirement is
   missing.
3. Provider schema doctor checks report no structural gaps for all 15 provider
   profiles.
4. Apple, RevenueCat, CLI, storage, control-plane, Secrets, discoverability,
   docs, skills, and privacy checks pass after the last edit.
5. Live provider import and mutation remain explicit-approval work and are not
   represented as locally validated behavior.
