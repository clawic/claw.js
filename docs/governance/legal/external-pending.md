# Legal External Pending Validation

Source conversation: `019e3a44-1175-7930-b45c-252f342b5ec2`

Status: `active_goal_not_complete`

This ledger separates reproducible ClawJS legal closure evidence from
validation that requires a real provider, physical device, signed host, package
registry, app store, website deployment target, notarization service, or exact
release-channel approval. Rows marked `EXTERNAL PENDING` are not passes and
must not be used to approve a release.

## Current Rows

| ID | Requirement | Local evidence | Missing prerequisite | Status |
| --- | --- | --- | --- | --- |
| LEGAL-EXT-001 | npm package publication path | Local package readiness is covered by `build:packages`, `test:pack`, package file checks, README checks, exact approval gates, and regulated-domain verifier. `publish:dry-run`/`publish:packages` now enumerate all 36 publishable packages, including `@clawjs/index`, `@clawjs/mesh`, `@clawjs/signals-core`, `@clawjs/signals`, and marketplace verticals. The npm lane remains blocked because the current `0.1.2` package version already exists. | Release PR/version bump for an unpublished version, fresh explicit approval, and registry credentials for the exact npm action. | EXTERNAL PENDING |
| LEGAL-EXT-002 | GitHub release or tag path | Release checklist requires legal docs, conservative claims, and exact-action approval. | Fresh explicit approval and GitHub release/tag action for the exact channel. | EXTERNAL PENDING |
| LEGAL-EXT-003 | Website deployment path | Website/demo claim scans and release checklist cover local copy and fixture safety. | Fresh explicit approval and the exact website deployment target. | EXTERNAL PENDING |
| LEGAL-EXT-004 | App/binary distribution path | EULA, release checklist, and Clawix app-side gates cover app/binary legal requirements. | Signed candidate, installer/upload target, or store lane for the exact binary channel. | EXTERNAL PENDING |
| LEGAL-EXT-005 | Real provider, connector, MCP, or remote action | Agents, Connector Control Plane, MCP, Search, Relay, Remote/Sync, and Dense Data tests cover local refusal/review contracts. | Approved live account, brokered credential lease, physical device, paid API, or real remote topology. | EXTERNAL PENDING |
| LEGAL-EXT-006 | Signed-host/native permission behavior | Host-dependent lanes document signed-host requirements and fail closed without them. | Current signed host and approved native permission scenario. | EXTERNAL PENDING |

## Rules

- `EXTERNAL PENDING` means blocked by unavailable external prerequisites, not
  validated.
- Any `FAIL` in a live provider, signed-host, registry, store, deployment, or
  package lane is a real defect and must not be downgraded to `EXTERNAL PENDING`.
- No row authorizes a push, tag, publish, upload, notarization, TestFlight,
  App Store submission, website deployment, paid API call, real prompt, real
  provider mutation, or production-data access.
- When a prerequisite becomes available, rerun the matching lane with explicit
  approval and replace the row with the actual result and evidence.
