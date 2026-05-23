# System Telemetry Completion Audit

Source conversation: `source:system-telemetry`

Plan item: `plan:system-telemetry`

Status: `active_goal_not_complete`

This public-safe audit tracks the full system telemetry goal requirement by
requirement. It is not a completion claim. Rows marked `validated-local` are
covered by reproducible local evidence; rows marked `external-pending` require
approved live provider, physical hardware, native grant, execution receipt,
audit event, or same-machine evidence before they can be cleared.

## Status Summary

- `validated-local`: 14 rows.
- `active-closure-gate`: 1 row.
- `external-pending`: 3 rows, `STA-016`, `STA-017`, and `STA-018`.

## Requirement Status

| ID | Requirement | Status | Evidence | Remaining gate |
| --- | --- | --- | --- | --- |
| STA-001 | Promote `claw system` to the canonical read-only portal while preserving `claw system capabilities ...`. | validated-local | CLI docs, router tests, capability alias checks, and `scripts/verify-system-telemetry-goal.mjs`. | Keep CLI registry parity green. |
| STA-002 | Expose `snapshot`, `metrics list`, `history`, `watch`, `rules`, and `widgets` surfaces. | validated-local | `packages/clawjs/src/cli-system-command.ts`, CLI tests, Monitor history assertions, and verifier command checks. | None local. |
| STA-003 | Model CPU, GPU, memory, disks, network, power, processes, displays, audio, Bluetooth/peripherals, focus, notifications, calendar/time, and weather/context metrics. | validated-local | `packages/clawjs-core/src/system-telemetry.ts`, metric catalog tests, CLI/API docs, and verifier catalog checks. | Physical sensor/fan values remain external until `SYS-TEL-EXT-002` clears. |
| STA-004 | Centralize samples, rollups, incidents, rules, charts, and retention in Monitor. | validated-local | `metric_sources`, `metric_samples`, `metric_rollups`, `metric_incidents`, `history`, chart payloads, purge fallback to rollups, and verifier retention checks. | Ongoing guard: no parallel telemetry store. |
| STA-005 | Provide Mac-first native adapter coverage with fail-soft/fail-closed experimental sensor metadata. | validated-local | Signed-host snapshot code, read-only experimental AppleSMC path, unavailable metric fallback, and verifier native sensor coverage. | Real sensor/fan proof remains `SYS-TEL-EXT-002`. |
| STA-006 | Keep mutating or risky hardware/system actions behind a plan-first signed-host broker. | validated-local | Control catalog, control plan JSON, `auditPlan`, redacted local plan audit, signed-host blocked control audit, and verifier broker checks. | Real execution remains `SYS-TEL-EXT-003`. |
| STA-007 | Provide modular context providers with mock/offline support and real-provider plugin contract. | validated-local | Provider catalog, fixture/offline context samples, live-provider plan, `provided_redacted`, `adapterContract`, API/MCP provider routes, and verifier provider checks. | Real provider connection remains `SYS-TEL-EXT-001`. |
| STA-008 | Expose API and MCP read-only agent context for system telemetry. | validated-local | `/v1/system/*` docs/routes, MCP tool coverage, SDK/custom-app read contracts, and verifier API/MCP checks. | None local. |
| STA-009 | Register inspect/search/discoverability routes for the telemetry plane. | validated-local | `docs/decision-map.md`, `docs/discoverability.registry.json`, `docs/discoverability.md`, `claw inspect route`, `claw search`, and verifier search checks. | None local. |
| STA-010 | Support menu-bar indicator contracts, including multiple independent items and one combined item. | validated-local | Surface registry routes, Clawix verifier references, native accessibility validation rows `SYS-TEL-EXT-005` and `CLX-SYS-TEL-EXT-001`. | Keep Clawix verifier green. |
| STA-011 | Reuse retained Monitor history for graph/chart output. | validated-local | `claw system history`, chart-ready history payloads, ASCII render, Clawix graph evidence, and `SYS-TEL-EXT-006`. | None local. |
| STA-012 | Keep portable widget definitions in ClawJS and host-specific configuration in Clawix. | validated-local | Widget catalog, upsert/delete tests, Clawix status item config evidence, and decision matrix rows D04-D07. | None local. |
| STA-013 | Separate local validation from live provider, physical sensor/fan, and dangerous-control proof. | validated-local | External pending ledger, external validation manifest, source Q/A review, and decision matrix D11. | External rows block goal completion until cleared or explicitly accepted later by the user. |
| STA-014 | Re-read source decisions one by one before any completion claim. | active-closure-gate | `docs/governance/system-telemetry/source-review.json`, private audit alias, external manifest `sourceQaReview`, and verifier checks. | Final source reread must be repeated before `update_goal complete`. |
| STA-015 | Keep public materials free of disallowed third-party product names. | validated-local | Boundary-aware forbidden-name scans in the verifier and final private scan record. | Repeat scan before completion. |
| STA-016 | Live weather/context provider execution with approved credential/location/network access. | external-pending | Plan-first provider metadata and redacted audit plan exist. | `SYS-TEL-EXT-001` requires provider receipt, redacted audit event, Monitor sample IDs, and downstream app/menu evidence. |
| STA-017 | Physical sensor/fan evidence from compatible hardware and native grant. | external-pending | Metric catalog, signed sensor plan, fail-soft unavailable metrics, and read-only experimental host path exist. | `SYS-TEL-EXT-002` requires compatible path, grant, receipt/audit, Monitor sample IDs, and same-machine evidence. |
| STA-018 | Dangerous control execution with exact approval and rollback/continuity evidence. | external-pending | Plan-first control catalog and blocked signed-host audit evidence exist. | `SYS-TEL-EXT-003` requires exact approval, native confirmation, signed-host execution receipt, physical validation, and rollback/continuity evidence. |

## Closure Rule

The goal cannot be marked complete while any `external-pending` row remains
without accepted evidence, or while the final source reread and forbidden-name
scan have not been repeated in the current completion attempt.
