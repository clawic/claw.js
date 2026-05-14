# ADR 0010: CLI just-in-time guidance, actor assertions, and resource registry

## Status

Accepted.

## Context

The CLI is the default surface agents use to inspect and operate the framework.
That makes it the right place to provide compact, contextual instructions when
the command attempt itself proves that extra guidance applies. Without a CLI
level mechanism, agents either carry too many instructions in context or miss
important local constraints attached to servers, secrets, projects, files, or
workspaces.

The same design needs stable references for paths and resources. Full
filesystem paths are noisy, leak-prone, and brittle when folders move. Project
identity based on paths also breaks sidebar and session continuity after
renames.

## Decision

Create a framework `guidance` domain separate from `rules`, grants, approvals,
and policies. `guidance` stores compact records that match command attempts by
command, flags, arguments, cwd, domain, service, hostname/URL, secret
reference, resource id, project, workspace, agent, actor kind, risk class, and
severity. CLI JSON may include `meta.guidance` hints containing only `id`,
`severity`, `capsule`, `reason`, `resourceIds`, and expansion commands.

Create a framework `resources` registry with opaque stable ids using the
`res_*` namespace. Resource ids are not path-derived and v1 does not introduce
human aliases. The registry records the current locator, type, scope, status,
fingerprints/bookmarks/file identity when available, and safe references.
Resources are registered explicitly; the framework must not scan the whole
filesystem to discover them.

Add actor assertions as identity evidence for CLI/runtime calls. A verified
assertion may classify the caller as `human`, `agent`, or `automation`, with
session/run/host metadata, expiry, scope, trust source, and local signature
verification by authorized host/runtime keys. Missing or invalid assertions
produce `unknown`. Flags and environment hints are test fixtures only and are
classified as `untrusted`.

## Rules

- Guidance is context selection, not permission. Sensitive, destructive,
  cost-bearing, native-permission, and secret-bearing actions still require the
  signed host broker, approval/grant policy, and audit.
- Compact guidance must not include long documents, plaintext secrets, or
  private full paths unless the caller explicitly asks for an expanded record.
- Human CLI output is minimal by default. Agent and automation JSON output may
  receive compact hints by default.
- Resource registry writes are explicit. Rename/move handling updates mutable
  locators for registered resources; it does not create a global index of the
  user's filesystem.
- Clawix must use resource-backed project identity so sidebar, sort order,
  snapshots, and instructions survive path changes.

## Consequences

The CLI becomes both the action surface and the compact instruction discovery
surface. Agents can learn that relevant instructions exist without loading
them into context. Humans can keep using the CLI without noisy guidance by
default. Resource ids become the stable bridge between framework, CLI, and
Clawix project state.
