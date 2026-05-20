# System Telemetry External Validation Runbook

Source conversation: `019e359b-c0ab-7dc1-ba94-11a49d11dc76`

Plan item: `019e3b6c-3dd8-76d2-bf1e-f50a23db7b07-plan`

Status: `active_goal_not_complete`

This runbook defines the only accepted way to replace the remaining system
telemetry `EXTERNAL PENDING` rows. It does not authorize provider calls,
hardware access, native permission requests, dangerous controls, production
data access, paid APIs, release actions, or network runs. Each lane requires
explicit approval for the exact run before execution.

Before any execution, the approval must be represented by an exact-run packet
conforming to `docs/system-telemetry-external-approval.schema.json`. Synthetic
approval templates live in `docs/system-telemetry-external-approval.fixtures.json`;
they only prove schema behavior and are not real approval.
Any accepted run must produce a redacted evidence packet conforming to
`docs/system-telemetry-external-evidence.schema.json`. A transcript, screenshot,
or receipt that is not represented by that packet is supporting material, not a
lane-closing record.
The structured manifest must continue to validate against
`docs/system-telemetry-external-validation.manifest.schema.json` after any
lane status update.
Synthetic manifest fixtures live in
`docs/system-telemetry-external-validation.manifest.fixtures.json`; they are
schema validation templates only and must not be cited as real external
evidence.
Validate the packet with
`node scripts/validate-system-telemetry-external-evidence.mjs <packet.json>`
before updating any ledger, manifest, completion audit, or source Q/A review.
Synthetic examples live in
`docs/system-telemetry-external-evidence.fixtures.json`; they are templates for
schema validation only and must not be cited as real external evidence.

## Lanes

| Row | Safe preflight | Approval packet | Execution evidence | Update target | Fail rule |
| --- | --- | --- | --- | --- | --- |
| SYS-TEL-EXT-001 | `claw system providers plan context.weather.live --json` must return fail-closed plan metadata with no network call. | Approved credential/account lease, location grant, network access, and exact live provider call approval. | Provider execution receipt, redacted audit event, Monitor sample IDs for `context.weather.temperature`, and downstream app/menu evidence without precise location leakage. | Replace `SYS-TEL-EXT-001` in the ledger, manifest, completion audit, and source Q/A review only after evidence is present. | Missing credential, grant, receipt, audit, sample, or downstream evidence stays `EXTERNAL PENDING`; a failed approved run is a defect, not a pending row. |
| SYS-TEL-EXT-002 | `claw system providers plan system.sensors.signed --json` must return fail-closed signed sensor metadata. | Native `system.sensor.read` grant, compatible hardware/provider path, signed host selection, and approval for that exact physical read. | Execution receipt or `externalPending=false` plan, Monitor sample IDs for `system.sensor.temperature` or `system.sensor.fan_speed`, redacted audit event, and same-machine evidence. | Replace `SYS-TEL-EXT-002` in the ledger, manifest, completion audit, and source Q/A review only after evidence is present. | Missing compatible path, grant, receipt, audit, sample, or same-machine evidence stays `EXTERNAL PENDING`; fake zero samples are defects. |
| SYS-TEL-EXT-003 | `claw system controls plan <control-id> --json` must stay plan-first and fail-closed until approval. | Exact action, target, value, risk tier, grants, native confirmation, signed-host broker, and rollback/continuity plan. | Pre-execution plan with `willExecute=true` only after approval, signed-host execution receipt, redacted audit event, physical validation, and rollback/continuity evidence. | Replace `SYS-TEL-EXT-003` in the ledger, manifest, completion audit, and source Q/A review only after evidence is present. | Missing exact approval, native confirmation, receipt, audit, physical validation, or rollback/continuity evidence stays `EXTERNAL PENDING`; failed approved execution is a defect. |

## Closure Rule

Do not mark the goal complete until every lane above is either replaced with
accepted evidence or explicitly accepted by a later user decision, and the final
source reread, completion audit, approval schema check, evidence schema check,
and forbidden-name scan have been repeated.
