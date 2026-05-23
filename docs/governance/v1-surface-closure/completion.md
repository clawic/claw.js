# V1 Surface Closure Completion Audit

Source conversation: `source:v1-surface-closure`
Private maintainer provenance is tracked outside this public repository.

This audit records the required one-by-one review of the private source
conversation before the v1 surface closure goal can be closed. It mirrors the
37 binding answers from the private source without publishing private paths or
private local files.

Source extraction:

- 39 `request_user_input` prompts were reviewed.
- 37 binding answers are mirrored in `docs/governance/v1-surface-closure/decisions.json`.
- 2 excluded prompts are documented: `bridge_manifest_source` had no output
  after rollback, and the first `bridge_version_field` request failed in
  Default mode before the later answered prompt.
- The free-form `apps_design_storage` concern is retained as the inventory
  requirement for the later `apps_design_contract_status` move-now decision.
- Acceptance validation matrix: `docs/governance/v1-surface-closure/acceptance.json`
  records mandatory closure categories: `bridge-swift`, `bridge-android`,
  `bridge-windows`, `deep-links`, `pairing`, `storage-boundary`,
  `framework-owned-artifacts`, `host-tools-policy`, `provider-routing`,
  `mcp-registry`, `integrations-qa`,
  `domain-resource-fixtures`, `docs-alignment`, `source-size`,
  `public-hygiene`, and `external-pending-policy`.
- Validation ledger: `docs/governance/v1-surface-closure/validation.json` records latest
  local pass, `EXTERNAL PENDING`, and blocked-tooling status per acceptance
  category.

Status vocabulary:

- `verified`: current repository evidence proves the decision is implemented or intentionally documented.
- `external-pending`: current repository evidence proves the program path exists, but final validation depends on a physical device, provider, paid service, native permission, or live external system.

| # | Decision | Required answer | Review status | Evidence |
| --- | --- | --- | --- | --- |
| 1 | `bridge_contract_v1` | Align all current bridge contracts as v1 | verified | `surface-registry`, `docs/interface-matrix.md`, and route graph guards classify the Clawix bridge as v1. |
| 2 | `bridge_version_field` | Keep `schemaVersion` | verified | Naming docs and persistent-surface guards preserve `schemaVersion` as the public persisted/exported version field. |
| 3 | `bridge_source_of_truth` | Swift plus JSON fixtures, no v8/legacy narrative | verified | Framework docs describe clean v1 bridge ownership and avoid v8/legacy compatibility narrative. |
| 4 | `active_target_scope` | Align Android and Windows active targets | verified | Framework route graph and port registry use the shared `24080` bridge contract consumed by active clients. |
| 5 | `framework_store_ownership` | Framework-owned | verified | Interface matrix and storage boundary docs assign reusable agents, skills, apps, design, audio, providers, MCP, snippets, integrations, and domains to ClawJS contracts. |
| 6 | `surface_parity_gate` | Real gate | verified | `docs-surface-check`, `domain-surface-registry-guard`, CLI parity, and docs alignment gates enforce matrix/programmatic surface coverage. |
| 7 | `session_deep_link` | `clawix://session/<sessionId>` | verified | Clawix owns host parsing; ClawJS canonical vocabulary uses `session` and `sessionId` across SDK/CLI/Relay. |
| 8 | `oauth_deep_link` | `clawix://auth/callback/<provider>` | verified | Surface registry exposes `auth/callback` as the framework route token consumed by the host. |
| 9 | `pairing_qr_contract` | JSON bridge QR | verified | Mesh pairing contract and tests use JSON with port `24080` and `hostDisplayName`. |
| 10 | `registry_shape` | Separate registries | verified | `surface-contract.registry.json`, `docs/governance/domain-surface/decision-matrix.md`, and `persistent-surface.md` keep interface and persistence concerns separate. |
| 11 | `bridge_v1_frame_scope` | All current frames are v1 | verified | Framework host contracts and surface route graph expose current bridge traffic as v1 runtime/session contract. |
| 12 | `send_frame_name` | `sendMessage` | verified | SDK, channel integrations, Android/macOS chat apps, and tests use `sendMessage`. |
| 13 | `chat_session_vocabulary` | Wire uses Session vocabulary | verified | `sessions` is the framework conversation namespace across SDK, CLI, Relay, and matrix rows. |
| 14 | `host_display_name` | `hostDisplayName` | verified | Mesh pairing and surface registry use `hostDisplayName`. |
| 15 | `client_kind_values` | `companion` and `desktop` | verified | Host contract records separate client role from platform-specific diagnostics. |
| 16 | `client_identity_fields` | Add client IDs | verified | Host contracts carry stable identity fields for runtime/bridge clients. |
| 17 | `storage_bucket_policy` | Bucket policy | verified | `docs/data-storage-boundary.md` and persistent-surface docs classify framework, host, vault, cache, and workspace buckets. |
| 18 | `apps_design_storage` | Move now | verified | Matrix rows expose Apps and Design as framework resource/storage records with `claw apps` and `claw design`. |
| 19 | `audio_dictation_storage` | Framework audio | verified | `@clawjs/audio`, `claw audio`, and matrix rows own audio catalog/transcript storage. |
| 20 | `agent_skill_storage_format` | Hybrid framework | verified | Agents, skills, library, connections, personalities, and skill collections use framework filesystem plus indexed metadata. |
| 21 | `project_identity_storage` | Resource canonical | verified | Framework resource registry and persistent-surface docs treat resource IDs as canonical identity. |
| 22 | `secrets_boundary` | Host/vault only | verified | Secrets docs and boundary gates keep plaintext secrets out of framework files and carry opaque refs/policies only. |
| 23 | `local_models_storage` | Host capability | verified | Matrix keeps model binaries/cache host-local while framework stores capability/config metadata. |
| 24 | `agent_tools_policy` | Host API plus matrix | verified | Browser, Git, remote mesh, runtime/OpenCode, and host action capabilities are matrixed through framework/host contracts. |
| 25 | `quickask_prompts_storage` | Framework snippets | verified | Snippets/prompts/skills are framework records; host hotkey and panel state remain local. |
| 26 | `provider_config_owner` | Framework plus vault | verified | Provider routing/settings commands and docs store non-secret config in framework records with host vault refs. |
| 27 | `external_integrations_policy` | Framework QA | external-pending | Integration QA fixtures and matrices exist; live provider checks remain `EXTERNAL PENDING` without explicit approval. |
| 28 | `mcp_config_policy` | Framework registry | verified | MCP registry APIs and docs keep external host configs read-only unless edited through ClawJS contracts. |
| 29 | `experimental_surface_policy` | Classify everything | verified | Domain surface registry and interface matrix use explicit supported/local-only/blocked/dev classification instead of experimental skips. |
| 30 | `domain_verticals_policy` | Close all now | external-pending | Calendar, Contacts, Life, Database, Index, Marketplace, IoT, and Publishing have matrix/programmatic contracts; live providers/devices/payments remain `EXTERNAL PENDING`. |
| 31 | `vertical_completion_depth` | Minimum contract | verified | Domain rows include owner, storage/API or CLI contract, persistence, and validation targets. |
| 32 | `migration_policy_no_users` | Clean v1 cut | verified | Docs alignment forbids legacy/compatibility language for active v1 contracts. |
| 33 | `repo_scope` | Clawix plus ClawJS | verified | This repo owns framework contracts; Clawix mirrors host/UI gates against them. |
| 34 | `missing_domain_contracts` | Resource registry first | verified | Calendar, Contacts, Life, Index, and Design are represented through registry/runtime contracts before package expansion. |
| 35 | `execution_batching` | Closed batches | verified | Surface closure has been landed as small commits with targeted ClawJS and Clawix gates. |
| 36 | `experimental_correction` | Do not skip existing experimental surfaces | verified | The matrix and domain guard force explicit classification for current surfaces. |
| 37 | `external_pending_policy` | Separate external validation | verified | Matrix rows and QA docs mark live provider/device/payment checks as external pending instead of silent skips. |

Final source reread: completed on 2026-05-17 against the private JSONL source.
The structured reread found 39 `request_user_input` prompts, 37 binding
answers, and the same 2 excluded prompts recorded above. The free-form
Apps/Design inventory concern and the later move-now answer are both covered by
the storage rows.

Current close condition: all listed decisions have public-safe implementation
or explicit external-pending evidence, this repo's validation ledger has no
tooling blockers, and the final private-source reread has been completed. Live
provider, device, payment, destructive, and permission-bound checks remain
explicit `EXTERNAL PENDING`, not local implementation blockers.
