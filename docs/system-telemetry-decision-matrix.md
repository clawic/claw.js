# System Telemetry Decision Matrix

Source conversation: `019e359b-c0ab-7dc1-ba94-11a49d11dc76`

Plan item: `019e3b6c-3dd8-76d2-bf1e-f50a23db7b07-plan`

Status: `active_goal_not_complete`

This matrix is the public, privacy-safe review ledger for the system telemetry,
context widgets, Monitor retention, and menu-bar indicator goal. The private
source session path is intentionally not published here. Before the private goal
can close, every row must be verified against the current tree and any remaining
external rows must have either real approved evidence or an explicit later user
decision accepting the blocker.

## Decisions

| ID | Binding decision | Current state | Public evidence | Remaining closure gate |
| --- | --- | --- | --- | --- |
| D01 | Provide a first-class framework plane so CLI and agents can read computer state without depending on a separate monitoring app. | Implemented locally. | `claw system snapshot`, `metrics list`, `history`, `watch`, `rules`, `widgets`, `providers`, `controls`; MCP/API routes; SDK/custom-app read contracts `system.telemetry.snapshot` and `system.telemetry.history`; inspect/search routes. | Keep external lanes separate for live providers, physical sensors, and dangerous controls. |
| D02 | Cover computer hardware with a Mac-first portable contract and native macOS routes where safe. | Implemented for safe reads and plan-first controls. | `SystemTelemetry` catalog, signed host snapshot, native CPU/GPU/memory/disk/network/power/process/display/audio/Bluetooth-peripheral/focus/notification paths, and experimental read-only sensor path. | Physical sensor/fan proof stays `SYS-TEL-EXT-002` until compatible hardware, grant, receipt, audit, and same-machine evidence exist. |
| D03 | Keep weather/time as useful context, separated from hardware and modeled through providers. | Implemented contractually. | Provider catalog, mock/offline/live weather context, local fixture samples, `context.weather.temperature`, provider plans, MCP/API provider routes. | Live provider connection stays `SYS-TEL-EXT-001` until approved credential, location grant, network run, provider receipt, audit, and Monitor sample exist. |
| D04 | Support multiple independent menu-bar indicators, not only one combined item. | Validated locally through Clawix. | `clawix.menuBar.systemIndicators`, `clawix.menuBarSystemIndicators`, Clawix external ledger `CLX-SYS-TEL-EXT-001`, and native accessibility smoke. | No framework-local blocker; future regressions must be caught by Clawix verifier. |
| D05 | Support a combined menu-bar widget/panel in addition to independent indicators. | Validated locally through Clawix. | Combined route and widget placement contracts plus Clawix native accessibility smoke over the combined menu. | No framework-local blocker; graph and Clawix verifier must remain green. |
| D06 | Allow broad indicator variability for system state, local context, build status, services, agents, reminders, calendar, notifications, and custom metrics. | Implemented locally. | Widget catalog and provider catalog include system, weather, build, service, agent, reminder, calendar, notification, and custom context metrics. | External provider-backed variants remain in `SYS-TEL-EXT-001` when they need live accounts or grants. |
| D07 | Prepare host and app surfaces for real-time display of important information. | Implemented locally. | `claw system watch`, signed-host snapshot recording, Monitor history, menu-bar route graph, and Clawix live recorder smoke. | Physical/live-provider data can only replace fixture or unavailable states through the external lanes. |
| D08 | Reuse and centralize retention, charts, rules, and events in Monitor rather than creating a parallel time-series store. | Implemented locally. | `metric_sources`, `metric_samples`, `metric_rollups`, `metric_incidents`, operational `health_check` event coexistence, metric purge fallback to rollups, rules, `history`, chart payloads, and ASCII render. | Ongoing guard: no new system telemetry store may bypass Monitor. |
| D09 | Do not mention third-party monitoring product names in public docs, code, comments, commands, fixtures, tests, or goal materials. | Enforced. | Public verifier scans docs, ClawJS sources, MCP, host, and goal verifier with boundary-aware matching. | Repeat the scan before any completion claim. |
| D10 | Pin the goal to the conversation id, plan id, source review, and one-by-one decision audit. | Implemented as a closure gate. | This matrix, `docs/system-telemetry-completion-audit.md`, `docs/system-telemetry-source-qa-review.json`, `docs/system-telemetry-external-pending-validation.md`, `docs/system-telemetry-external-validation-runbook.md`, `docs/system-telemetry-external-evidence.schema.json`, synthetic fixture templates in `docs/system-telemetry-external-evidence.fixtures.json`, evidence validator `scripts/validate-system-telemetry-external-evidence.mjs`, `docs/system-telemetry-external-validation.manifest.json`, and `scripts/verify-system-telemetry-goal.mjs`. | Re-read the private source session before completion, refresh the source Q/A review, completion audit, external validation runbook, evidence schema, fixture templates, evidence validator, and this matrix if any decision changed. |
| D11 | Do not close the goal until everything is implemented, validated, documented, or explicitly blocked by a later user decision. | Active. | `active_goal_not_complete`, completion audit, source Q/A review, external-pending ledger, external validation manifest, external validation runbook, external evidence schema, decision matrix, and verifier. | Do not call completion while `SYS-TEL-EXT-001`, `SYS-TEL-EXT-002`, or `SYS-TEL-EXT-003` remain without approved evidence or a later explicit acceptance decision. |

## Closure Rule

The goal is not complete while any of these are true:

- `SYS-TEL-EXT-001`, `SYS-TEL-EXT-002`, or `SYS-TEL-EXT-003` remain
  `EXTERNAL PENDING` in the ledger or structured external-validation manifest.
- The private source session has not been re-read for the final completion
  audit and reflected in `docs/system-telemetry-source-qa-review.json`.
- Any D01-D11 row lacks current public evidence.
- The forbidden-name scan has not been repeated against the final tree.
