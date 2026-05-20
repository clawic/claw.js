# SDK-first custom surfaces and nonblocking shell plan

This scope document is the implementation companion to
[ADR 0032](./adr/0032-sdk-first-custom-surfaces-and-nonblocking-shell.md).
It covers framework, SDK, CLI, host bridge, and Clawix integration work needed
for user-authored custom UIs that do not block the main app shell.

## Binding Principles

- Custom surfaces are real code plus a manifest, not a visual builder.
- V1 supports Web app surfaces and Swift custom surfaces.
- The SDK is the normal implementation surface for rich UIs.
- The CLI remains the inspection, validation, automation, and fallback surface.
- Ordinary local reads/list/search/filter/composition are broad and do not
  require micro-prompts for local user-authored apps.
- High-risk operations are brokered and approval-gated.
- Direct SQLite is not a custom-app surface.
- The original built-in screen remains available when a user forks or defaults
  a variant.
- Protected surfaces cannot be replaced: secrets, native permissions, rescue,
  approvals, and chat core.
- App shell, sidebar, chat, rescue, and each custom surface are independent
  failure domains.

## Framework Work

1. Maintain a shared capability catalog in `@clawjs/core` with IDs, risk,
   timeout, async/cancel/stream metadata, and surface bindings.
2. Expose the catalog through `@clawjs/claw` as `claw.capabilities`.
3. Add SDK namespaces for search, DB query DSL, resources, actions, secrets
   broker, Mac action planning, and IoT action invocation as capabilities
   graduate from catalog-only to full implementation.
4. Keep CLI validation paths for the same capabilities.
5. Make missing SDK, CLI, API, MCP, Relay, or host bridge coverage explicit as
   `pending`, `blocked`, `notApplicable`, or `EXTERNAL PENDING`.
6. Keep high-risk actions brokered through policy, approvals, receipts, audit,
   and host-specific execution.
7. Expose `executionBoundary` in the shared custom-app SDK inspection payload
   so CLI inspect, service API, MCP, and Relay remain metadata-only contract
   projections while executable rich UI flows use SDK host bridges.
8. Use the Network Control Plane as the current executable route-family
   baseline for schema validation, Gateway route policy, redacted event audit,
   suggestion gating, CLI coverage, and host projection evidence. Future
   executors must meet the same standard before they count as complete.

## Clawix Work

1. Extend app manifests with declared capabilities, origin class, surface kind,
   protected-route policy, and variant metadata.
2. Render the capability/risk map in the app detail/ficha before activation for
   imported apps and in settings/detail for local apps.
3. Keep sidebar route loading independent from heavy app/model/database/search
   work.
4. Wrap each sidebar/custom surface in an isolated error/loading/cancel
   boundary.
5. Add original-screen fallback for variants.
6. Prevent replacement of protected routes.
7. Route Web custom surfaces through the bridge with SDK-like methods instead
   of raw SQLite or unrestricted native access.
8. Route Swift custom surfaces through an out-of-process constrained bridge
   that emits declarative UI/state/events.

## Acceptance Checklist

- ADR and decision maps exist in both ClawJS and Clawix.
- `@clawjs/core` exports the capability catalog.
- `@clawjs/claw` exposes `claw.capabilities.list|get|riskMap|source`.
- Custom-app SDK inspection exposes `executionBoundary` across CLI/API/MCP/
  Relay and declares those routes metadata-only.
- Sibling Clawix mirrors the ClawJS capability facade shape for
  `capabilities.list`, `capabilities.get`, `capabilities.riskMap`, and
  `capabilities.source`, while `capabilities.contracts` carries host-specific
  boundary metadata.
- Network Control Plane schemas, Gateway route policy, redacted event audit,
  CLI tests, and Clawix host projection evidence are part of the executable
  route-family gate; unrelated future executors remain blocked until they have
  equivalent policy/audit/test coverage.
- Sibling Clawix mirrors `system.telemetry.snapshot` and
  `system.telemetry.history` as low-risk local-wide reads through the capability
  catalog, `window.clawix.system.telemetry`, and host bridge contract tests.
- ClawJS and sibling Clawix expose `resources.list` and `resources.read` as
  separate local-wide registered-resource capabilities with shared schema refs
  and Web/Swift host bridge tests.
- ClawJS and sibling Clawix expose `jobs.list` and `jobs.get` through
  `window.clawix.jobs.{list,get}()` as local-wide jobs/run listing and detail
  contracts with shared redaction policy and no start/cancel mutation.
- Sibling Clawix exposes `mac.action.plan` through
  `window.clawix.mac.planAction()` as an approval-gated, dry-run-only host
  bridge call; signed-host native execution remains out of scope until approved
  external evidence exists.
- Sibling Clawix exposes `iot.device.action.invoke` through
  `window.clawix.iot.invokeAction()` as an approval-gated host bridge call with
  declared capability checks, dispatcher policy, and high-risk audit receipts;
  live provider or physical-device validation remains external pending until
  explicitly approved.
- Sibling Clawix exposes `actions.invoke` and `secrets.broker` through
  `window.clawix.actions.invoke()` and `window.clawix.secrets.broker()` as
  approval-gated host bridge calls that fail closed with explicit no-runner and
  no-plaintext-broker dispatch reasons until safe runners exist.
- Sibling Clawix validates imported/marketplace packages through host-local
  `app-package-trust-roots.json`, records signature key/trust-source
  provenance, and still requires the activation ficha before running them.
- Tests cover the baseline catalog and SDK facade.
- Clawix app manifests can declare capabilities and produce a risk map.
- Clawix bridge exposes capability inspection to hosted apps.
- Sidebar/custom surface failures do not break shell navigation or chat.
- Sibling Clawix installed-app Time Profiler smoke verifies the signed app
  launch and attach capture paths for Web and Swift custom-surface routing,
  sidebar scroll, and chat composer editing; rescue, delayed-heavy-surface, and
  full stack-attributed Instruments analysis remain closure blockers.
- Protected routes reject replacement attempts.
- Variant defaults preserve access to the original screen.
- CLI smoke paths remain available for framework capability validation.
- External/native/physical/provider requirements are recorded as
  `EXTERNAL PENDING` when not validated physically.
