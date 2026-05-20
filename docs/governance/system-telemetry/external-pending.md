# System Telemetry External Pending Validation

Source conversation: `019e359b-c0ab-7dc1-ba94-11a49d11dc76`

Plan item: `019e3b6c-3dd8-76d2-bf1e-f50a23db7b07-plan`

Status: `active_goal_not_complete`

This ledger separates reproducible framework evidence for system telemetry,
context widgets, menu-bar indicator contracts, Monitor retention, and signed
host planning from validation that requires a real provider account, physical
hardware, native approval, or current app inspection. Rows marked
`EXTERNAL PENDING` are not passes and must not be used to close the goal.

Machine-readable closure gates live in
`docs/governance/system-telemetry/external-validation.manifest.json` and
`docs/governance/system-telemetry/source-review.json`, with requirement-by-requirement
status in `docs/governance/system-telemetry/completion.md` and external run steps in
`docs/governance/system-telemetry/external-validation-runbook.md`. Accepted external
approval must conform to
`docs/governance/system-telemetry/external-approval.schema.json` before execution, and
accepted external evidence must conform to
`docs/governance/system-telemetry/external-evidence.schema.json`.
The external manifest must conform to
`docs/governance/system-telemetry/external-validation.manifest.schema.json`.
Synthetic manifest fixtures at
`docs/governance/system-telemetry/external-validation.manifest.fixtures.json` prove that
accidental completion or lane-clear mutations fail validation.
Evidence packets must pass
`node scripts/validate-system-telemetry-external-evidence.mjs <packet.json>`
before any row is updated.
Synthetic approval templates at
`docs/governance/system-telemetry/external-approval.fixtures.json` prove exact-run
approval validation only and are not real approval.
Approval packets must pass
`node scripts/validate-system-telemetry-external-approval.mjs <packet.json>`
before any external execution starts.
Synthetic closure bundles at
`docs/governance/system-telemetry/external-closure.fixtures.json` prove the same-lane approval and evidence bundle
behavior only and are not real closure evidence.
They are the same-lane approval and evidence bundle gate for closure attempts.
The bundle also binds evidence `runAuthorization.approvalId` to the exact
approval packet.
Evidence timestamps must stay inside the exact approval window.
Closure bundles must pass
`node scripts/validate-system-telemetry-external-closure.mjs <bundle.json>`
before any external row is replaced.
The verifier treats the
manifest as the structured contract for remaining external lanes, exact-run
approval, accepted evidence, and the rule that external pending blocks goal
completion. The source Q/A review binds the private decision audit to
public-safe rows, the completion audit binds each goal requirement to
validated-local, active-closure-gate, or external-pending status, and the
runbook binds each remaining external lane to preflight, approval, evidence,
update target, fail-rule, and evidence-packet checks before any closure attempt.

## Current Rows

| ID | Requirement | Local evidence | Missing prerequisite | Status |
| --- | --- | --- | --- | --- |
| SYS-TEL-EXT-001 | Live weather/context provider connection | `claw system providers list`, `claw system providers plan context.weather.live --json`, MCP `system.provider_plan`, and `/v1/system/providers/plan` expose safe plan-first metadata, visible `metrics`, required grants, blocked connection steps, `provided_redacted` credential projection, and no network call. Local CLI plans append redacted JSONL evidence to `.claw/data/system-telemetry-audit.jsonl`; the signed host records its own redacted JSONL audit evidence for blocked provider plans, including provider id, redacted credential-ref state, required grants, blocked outcome, and host id. | Explicit approval for live provider access, approved account or credential lease, location grant, network access for the exact run, and recorded provider execution receipt. | EXTERNAL PENDING |
| SYS-TEL-EXT-002 | Physical hardware sensor and fan telemetry | The metric catalog includes `system.sensor.temperature` and `system.sensor.fan_speed`; `claw system providers plan system.sensors.signed --json` exposes the signed sensor provider as fail-closed with required `system.sensor.read` grant and visible `metrics`. Local CLI plans append redacted JSONL evidence; the macOS host contains a read-only experimental AppleSMC path for aggregate temperature/fan samples, fail-softs to unavailable metrics when the compatible service or keys are absent, and records redacted JSONL audit evidence for blocked signed-sensor provider plans. | Compatible host/hardware path, signed host bridge able to read the physical sensors, native grant approval, and evidence from the exact machine. | EXTERNAL PENDING |
| SYS-TEL-EXT-003 | Dangerous hardware or system controls | `claw system controls list --json` exposes fan, power, process, network, display, and audio controls without mutation; `claw system controls plan system.fan.set_speed ... --json` returns `willExecute=false`, broker `failClosed=true`, required grants, blocked native action, no execution receipt, and local redacted JSONL plan audit. The signed host records redacted JSONL audit evidence for unsupported/high-risk blocked controls, including required grants and blocked outcome, without calling the native runner. | Explicit approval for the exact action, signed-host broker, native confirmation, execution receipt, rollback or continuity evidence where applicable, and physical validation that the action occurred. | EXTERNAL PENDING |
| SYS-TEL-EXT-004 | Signed-host live recording loop | `claw system snapshot --record true --json` records local samples, rollups, and incidents into the Monitor store; Clawix app code can request `system snapshot --source host --record true --json` through its recorder. On 2026-05-20, the canonical signed Clawix app passed `scripts/verify-system-telemetry-goal.mjs --preflight --live-recorder-smoke`: the app-selected signed `claw-host` was bundled under `Contents/MacOS/claw-host`, the menu refresh lane executed, and Monitor rows advanced in the app store. | None for safe host telemetry recording through the current app path. Physical sensors, privileged controls, and provider-backed context remain covered by separate rows. | VALIDATED LOCAL |
| SYS-TEL-EXT-005 | Strict native menu-bar visual and interaction validation | Framework registry exposes `clawix.menuBar.systemIndicators` and route `clawix.menuBarSystemIndicators`; Clawix code and tests cover multiple independent indicators, combined panel, provider rows, toggles, and refresh behavior. On 2026-05-20, Clawix `scripts/verify-system-telemetry-goal.mjs --preflight --accessibility-smoke --seed-local-history` passed against the canonical signed app and verified independent indicators, the combined dropdown, provider rows, widget toggle rows, refresh behavior, and seeded history graph menu content through native accessibility. | None for accessibility-backed native menu-bar interaction inspection. Native graph rendering remains tracked separately by `SYS-TEL-EXT-006`. | VALIDATED LOCAL |
| SYS-TEL-EXT-006 | Native time-series graph UI over retained telemetry | Monitor persistence is covered by `metric_sources`, `metric_samples`, `metric_rollups`, and `metric_incidents`; `claw system history <metric> --json` proves retained samples, rollups, rule incidents, chart-ready points, and a portable ASCII `render` sparkline. On 2026-05-20, Clawix `--accessibility-smoke --seed-local-history` passed against the canonical signed app and exposed seeded `history graph` menu content; `swift test --package-path macos --scratch-path /tmp/clawix-system-telemetry-goal-build --filter SystemTelemetryBridgeTests/testHistoryGraphViewRendersNativeBitmap` passed and pixel-checked a native bitmap render of the graph view. | None for retained-history native graph rendering. Physical sensors and live external providers remain separate rows. | VALIDATED LOCAL |

## Rules

- `EXTERNAL PENDING` means blocked by unavailable external prerequisites, not
  validated and not complete.
- A live provider, signed-host, permission, native UI, or physical-control
  failure after the prerequisite is available is a real defect and must not be downgraded to `EXTERNAL PENDING`.
- No row authorizes a provider call, paid API call, native permission request,
  sensor access, fan or power mutation, process kill, network change, app
  control action, production-data access, or release action.
- When a prerequisite becomes available, rerun the matching lane with explicit
  approval and replace the row with actual evidence, receipt IDs, and result.

## External Validation Lanes

These lanes are the only accepted way to replace the remaining
`EXTERNAL PENDING` rows. They require explicit approval for the exact run. The
operational checklist for each lane is the
[System Telemetry External Validation Runbook](./external-validation-runbook.md),
and the accepted evidence packet schema is
[`docs/governance/system-telemetry/external-evidence.schema.json`](./external-evidence.schema.json).
The required approval packet schema is
[`docs/governance/system-telemetry/external-approval.schema.json`](./external-approval.schema.json).
Synthetic packet fixtures live at
[`docs/governance/system-telemetry/external-evidence.fixtures.json`](./external-evidence.fixtures.json)
and are explicitly not accepted evidence.
Synthetic approval fixtures live at
[`docs/governance/system-telemetry/external-approval.fixtures.json`](./external-approval.fixtures.json)
and are explicitly not approval.
Approval packets are checked with
`node scripts/validate-system-telemetry-external-approval.mjs <packet.json>`.
Approval plus evidence closure bundles are checked with
`node scripts/validate-system-telemetry-external-closure.mjs <bundle.json>`.

| Row | Lane | Required approval | Required evidence |
| --- | --- | --- | --- |
| SYS-TEL-EXT-001 | Live context provider lane: `claw system providers plan context.weather.live --json` must first return a safe plan; signed-host blocked plans may write redacted audit evidence, but that audit is not a provider execution receipt. Only after that may an approved provider credential, location grant, and network run be used to connect and record a live context sample. | Approved credential reference or account lease, location grant, network access, and approval for the exact live provider call. | Provider execution receipt, redacted audit event, Monitor sample IDs for `context.weather.temperature`, and downstream app/menu evidence without leaking precise location. |
| SYS-TEL-EXT-002 | Signed sensor provider lane: `claw system providers plan system.sensors.signed --json` must first return a safe plan; signed-host blocked plans may write redacted audit evidence, but that audit is not a physical sensor receipt. Only then may the signed host read compatible physical sensors through the native grant. The current host read path is aggregate-only and read-only; missing AppleSMC service or missing compatible keys remains a valid external blocker, not a fake zero sample. | Native `system.sensor.read` grant, compatible hardware/provider path, signed host selection, and approval for that exact physical read. | Provider plan with `externalPending=false` or equivalent execution receipt, Monitor sample IDs for `system.sensor.temperature` or `system.sensor.fan_speed`, audit event, and same-machine evidence. |
| SYS-TEL-EXT-003 | Dangerous-control lane: `claw system controls plan <control> --json` must remain plan-first and fail-closed until exact action approval, signed-host broker execution, native confirmation, grants, continuity or rollback policy, and audit are present. Blocked unsupported/high-risk attempts may write redacted audit evidence, but that audit is not an execution receipt and does not prove physical control. | Approval for the exact action, target, value, risk tier, grants, native confirmation, and rollback or continuity plan. | Pre-execution plan with `willExecute=true` only after approval, signed-host execution receipt, audit event, and physical validation that the intended action occurred and rollback/continuity conditions held. |

Rows must stay `EXTERNAL PENDING` if any approval, hardware/provider path,
receipt, audit event, or physical validation is missing.
