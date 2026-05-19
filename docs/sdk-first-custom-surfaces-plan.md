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
- Tests cover the baseline catalog and SDK facade.
- Clawix app manifests can declare capabilities and produce a risk map.
- Clawix bridge exposes capability inspection to hosted apps.
- Sidebar/custom surface failures do not break shell navigation or chat.
- Protected routes reject replacement attempts.
- Variant defaults preserve access to the original screen.
- CLI smoke paths remain available for framework capability validation.
- External/native/physical/provider requirements are recorded as
  `EXTERNAL PENDING` when not validated physically.
