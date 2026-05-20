# ADR 0032: SDK-first custom surfaces and nonblocking shell

## Status

Accepted.

## Context

Claw is a framework, not only a bundled app or a CLI. Users and agents should be
able to build custom Mac or Web interfaces that read, filter, inspect, and act
on framework data without waiting for Clawix to ship every possible screen.
Those custom interfaces must not make the main app brittle: a slow model load,
search query, database query, app bundle, custom view, connector, or native
operation must not block chat, the sidebar, recovery, or unrelated surfaces.

The existing dual-surface policy says important capabilities need human and
programmatic surfaces. This ADR tightens that policy for application building:
the SDK is the primary build-on-top contract, and Clawix is one reference host
that consumes the same contracts as third-party or user-authored apps.

## Decision

- The `@clawjs/claw` SDK is a first-class constitutional surface. Stable
  framework capabilities are complete only when they have SDK coverage or an
  explicit documented gap.
- The public `claw` CLI remains essential for shell use, inspection,
  validation, debugging, automation, smoke tests, and fallbacks. Rich custom
  UIs must not depend on shelling out to CLI commands as their normal data
  path.
- Service APIs, MCP, Relay, host bridges, and Clawix adapters derive from the
  same capability contracts. They may adapt transport, auth, streaming,
  cancellation, and redaction, but must not fork business logic.
- Custom surfaces are real code plus a manifest, not a UI builder. V1 supports
  Web app surfaces and native Swift custom surfaces.
- Every custom surface declares requested capabilities. The framework exposes a
  visible capability/risk map so hosts can show what a surface can read, write,
  invoke, or request approval for.
- Local user-authored apps receive broad ordinary local authority for reads,
  listing, search, filtering, and composition through SDK/resource/search/DB
  contracts. They are not micro-prompted for ordinary reads.
- High-risk operations require an interruptive approval or brokered policy
  decision: secrets and credentials, paid or external side effects,
  destructive or irreversible changes, sensitive native host permissions,
  physical/IoT effects, regulated/safety-sensitive operations, and plaintext
  secret exposure.
- Imported or marketplace apps require ficha/risk review before activation.
  Local user-authored apps still expose their declared capabilities and risk
  map in the host.
- Direct SQLite access is not a normal custom-app action surface. Custom apps
  use SDK/resource/search/DB query contracts so validation, policy, events,
  redaction, migrations, and audit can run.
- Long-running work must be async, cancelable where possible, bounded by
  default timeouts, and able to stream partial progress or partial results.
- Shells and hosts must isolate surfaces. Chat, sidebar navigation, rescue,
  core settings, approvals, and original built-in screens remain available
  when a custom surface, model load, connector, search, or database query
  fails.
- Built-in protected surfaces such as secrets, native permissions, rescue, and
  chat core cannot be replaced. A host may allow variants around them only when
  policy permits, and the original remains reachable.
- User modifications to built-in screens are forks/variants. A variant may
  become the default for a user or workspace, but the original implementation
  and recovery path remain available.
- Native Swift custom surfaces run outside the main app process where possible
  and emit a declarative UI tree/events through a constrained host bridge.

## Capability Catalog

ClawJS owns the shared capability catalog in
`packages/clawjs-core/src/capability-catalog.ts`. The catalog records capability
IDs, operation type, async/stream/cancel semantics, default timeout, SDK/CLI/API
surface coverage, and custom-app authority class:

- `localWide`: ordinary local reads/list/search/filter/composition.
- `declared`: allowed only when declared by the custom app manifest.
- `approvalRequired`: high-risk operations that need brokered approval.
- `blocked`: not available to custom apps.

Hosts use `buildCustomAppCapabilityRiskMap` to present ordinary access,
approval-required operations, blocked operations, and high-risk actions before
or during activation.

## Surface Parity

Every new stable capability must answer:

- What is the SDK namespace or why is it absent?
- What is the CLI inspection/validation/fallback path?
- What service API/MCP/Relay/host bridge applies, if any?
- Is the capability local-only, remote-safe, blocked, or external pending?
- Can it be async, cancelable, streamable, and timeout-bounded?
- What risk class applies to custom apps?

Gaps must be explicit in the ADR, source catalog, or surface registry. Silent
gaps are regressions.

The shared custom-app SDK inspection payload includes an `executionBoundary`
declaring that CLI inspect, service API contracts, MCP `clawjs.custom_app_sdk`,
and Relay `/v1/remote/custom-app-sdk` are metadata-only contract projections.
They expose schemas, dispatch availability, risk, redaction, and gaps; they do
not execute `search.query`, `db.query`, or other SDK capability calls. Rich UI
dispatch for ordinary local reads runs through the SDK host bridge, such as
Clawix `window.clawix`, where the host can apply validation, cancellation,
redaction, audit, and high-risk approval.

## Clawix Shell Contract

Clawix must treat the sidebar, chat, rescue, approvals, and custom surfaces as
separate failure domains. A surface load failure renders an isolated error view
for that surface. It must not freeze the app shell, block sidebar navigation,
break chat, or prevent the user from opening the original built-in screen.

The Mac app may host both Web and Swift surfaces, but both enter through the
same manifest/capability/risk contract. The host bridge mediates native actions,
approval flows, and high-risk operations instead of giving custom code
unbounded native access.

## Enforcement

- SDK tests verify `createClaw().capabilities` exposes the capability catalog
  and risk map.
- Core tests verify catalog coverage, SDK/CLI declarations, high-risk approval
  classification, defensive copies, and no direct SQLite or plaintext-secret
  custom app surface.
- Clawix tests must verify app manifest parsing, capability/risk display,
  isolated surface failure, protected-route fallback, and nonblocking sidebar
  navigation.
- CLI/inspect/search/docs checks must keep this ADR discoverable and maintain
  a shell validation path for capability changes.
- Where physical devices, provider APIs, native permissions, or paid services
  are needed, validation reports `EXTERNAL PENDING` instead of faking success.

## Consequences

The framework must invest in SDK parity before considering a capability done.
Clawix custom app work starts from manifests, risk maps, host isolation,
timeouts, cancellation, and recovery rather than from a visual builder. CLI
parity remains mandatory for inspection and validation, but custom apps use
SDK/service contracts as their ordinary runtime path.
