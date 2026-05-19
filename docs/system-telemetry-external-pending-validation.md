# System Telemetry External Pending Validation

Source conversation: `019e359b-c0ab-7dc1-ba94-11a49d11dc76`

Plan item: `019e3b6c-3dd8-76d2-bf1e-f50a23db7b07-plan`

Status: `active_goal_not_complete`

This ledger separates reproducible framework evidence for system telemetry,
context widgets, menu-bar indicator contracts, Monitor retention, and signed
host planning from validation that requires a real provider account, physical
hardware, native approval, or current app inspection. Rows marked
`EXTERNAL PENDING` are not passes and must not be used to close the goal.

## Current Rows

| ID | Requirement | Local evidence | Missing prerequisite | Status |
| --- | --- | --- | --- | --- |
| SYS-TEL-EXT-001 | Live weather/context provider connection | `claw system providers list`, `claw system providers plan context.weather.live --json`, MCP `system.provider_plan`, and `/v1/system/providers/plan` expose safe plan-first metadata, visible `metrics`, required grants, blocked connection steps, redacted credential references, and no network call. | Explicit approval for live provider access, approved account or credential lease, location grant, network access for the exact run, and recorded provider receipt. | EXTERNAL PENDING |
| SYS-TEL-EXT-002 | Physical hardware sensor and fan telemetry | The metric catalog includes `system.sensor.temperature` and `system.sensor.fan_speed`; `claw system providers plan system.sensors.signed --json` exposes the signed sensor provider as fail-closed with required `system.sensor.read` grant and visible `metrics`. | Compatible host/hardware path, signed host bridge able to read the physical sensors, native grant approval, and evidence from the exact machine. | EXTERNAL PENDING |
| SYS-TEL-EXT-003 | Dangerous hardware or system controls | `claw system controls list --json` exposes fan, power, process, network, display, and audio controls without mutation; `claw system controls plan system.fan.set_speed ... --json` returns `willExecute=false`, broker `failClosed=true`, required grants, blocked native action, and no receipt. | Explicit approval for the exact action, signed-host broker, native confirmation, audit receipt, rollback or continuity evidence where applicable, and physical validation that the action occurred. | EXTERNAL PENDING |
| SYS-TEL-EXT-004 | Signed-host live recording loop | `claw system snapshot --record true --json` records local samples, rollups, and incidents into the Monitor store; Clawix app code can request `system snapshot --source host --record true --json` through its recorder. | Current signed host selected by the app, approved native permissions for host telemetry, and live app run evidence that host samples were recorded through the broker. | EXTERNAL PENDING |
| SYS-TEL-EXT-005 | Strict native menu-bar visual and interaction validation | Framework registry exposes `clawix.menuBar.systemIndicators` and route `clawix.menuBarSystemIndicators`; Clawix code and tests cover multiple independent indicators, combined panel, provider rows, toggles, and refresh behavior. | Current signed app inspection through the native UI automation lane with screenshot or accessibility evidence for every menu-bar indicator and dropdown interaction. | EXTERNAL PENDING |
| SYS-TEL-EXT-006 | Native time-series graph UI over retained telemetry | Monitor persistence is covered by `metric_sources`, `metric_samples`, `metric_rollups`, and `metric_incidents`; `claw system history <metric> --json` proves retained samples, rollups, rule incidents, chart-ready points, and a portable ASCII `render` sparkline. | Real native graph surface wired to the retained Monitor rows and inspected in the current app or host UI with representative telemetry history. | EXTERNAL PENDING |

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
