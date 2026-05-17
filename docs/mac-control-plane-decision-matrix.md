# Mac Control Plane Decision Matrix

This matrix summarizes implementation status for the binding Mac Control Plane
decisions. It complements the source decision audit and is checked by
`scripts/verify-mac-control-plane-goal.mjs`.

| ID | Binding area | Current decision | Evidence | Verification | Remaining work |
| --- | --- | --- | --- | --- | --- |
| MC-001 | Product promise | Local macOS control is a first-class governed Claw capability, not an ad hoc script bag. | ADR 0023, `docs/mac-control-plane.md`, decision map. | Mac docs and route graph guards. | Add constitutional text and Clawix public UX. |
| MC-002 | Exhaustive atlas | V1 requires broad capability inventory with explicit coverage states; not every entry must execute. | `MAC_CAPABILITY_ATLAS`, command roots, coverage schema. | `mac-control-plane.test.ts`, verifier. | Complete full macOS 14+ source audit and version matrix. |
| MC-003 | Direct CLI semantics | Everyday actions use direct roots; `claw mac` is a portal. | `wifi`, `window`, `shortcut`, `permissions`, `mac` roots. | CLI registry/router parity, CLI Mac tests. | Expand golden help for all atlas-only families. |
| MC-004 | Conflict help | Colliding terms expose related surfaces in normal help. | Related surfaces in Mac command roots and help renderer. | CLI Mac tests. | Broaden to every collision found in full CLI audit. |
| MC-005 | Mac Permission Broker | macOS permission state and grants are centralized and feature-independent. | ADR 0024, `claw.mac.permissionBroker`, permission schemas. | Route graph guard, Mac schema tests. | Persist per-host state and wire Clawix permission UI. |
| MC-006 | Mac Action Broker | Sensitive native actions execute only through a signed-host broker with receipts/audit. | `claw.mac.actionBroker`, action schemas, host guard. | Route graph guard, host permission contract guard. | Implement signed-host execution slice and allowlist migration. |
| MC-007 | Governance defaults | More restrictive policy wins; agents/MCP/automations default to safe read-only. | Policy defaults, grant schema, role schema. | Mac registry tests. | Persist/edit policies and connect approvals inbox. |
| MC-008 | Risk/revert | Critical reversible actions need snapshot/rollback timer; connectivity changes need continuity checks. | Risk tiers, rollback defaults, Wi-Fi critical entries. | Mac schema tests. | Real continuity breaker and revert executor. |
| MC-009 | First executable slice | V1 executable scope is Wi-Fi, windows, Shortcuts, and permissions. | V1 atlas entries and CLI dry-run commands. | Mac CLI/core tests. | Real signed-host validation in Clawix and Claw.app. |
| MC-010 | Legacy reset | Commander is not a compatibility constraint; direct native uses must migrate or be registered. | ADR 0023, host permission guard. | Static guard self-test. | Audit Clawix/native code and retire Commander surfaces. |
| MC-011 | Decision closure | Final goal closure requires one-by-one source Q/A review. | Source decision audit and active goal. | Verifier checks row ids and source references. | Re-read full source session at final close. |

