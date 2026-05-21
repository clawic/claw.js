---
title: Global Threat Model
description: Canonical cross-layer threat model for ClawJS, Clawix hosts, agents, plugins, Relay, mesh, supply chain, prompt/tool exfiltration, and update channels.
---

# Global Threat Model

This document is the canonical cross-layer threat model for ClawJS and the
Clawix host projection. It turns Constitution IV.1 into an operational model:
security is a positive guarantee that must be stated, validated, routed, and
kept discoverable.

Specialized security documents still own their detailed controls. This model is
the global map that makes sure the layers are all covered and that new durable
work cannot skip threat analysis.

## Baseline Assumptions

- The local machine may contain hostile or buggy processes running as the same
  user.
- Agents, plugins, connectors, sub-apps, runtimes, MCP servers, external CLIs,
  Relay clients, and marketplace packages are not trusted with plaintext
  secrets or unbounded authority.
- Network peers, remote clients, hosted gateways, provider APIs, package
  registries, update channels, and release artifacts can be hostile,
  compromised, stale, or impersonated.
- Prompt content, tool outputs, retrieved documents, plugin metadata, provider
  responses, and marketplace records can try to exfiltrate data or manipulate
  tool selection.
- Filesystem permissions, localhost binding, package provenance, and user
  approval dialogs are useful layers, not complete boundaries by themselves.
- Missing principal identity, grant, context, route classification, capability
  maturity, approval state, secret broker lease, signed host proof, or audit
  context fails closed.

## Required Coverage

`docs/security-threat-model.coverage.json` is the executable coverage contract.
The required layers are:

- agents and delegation
- sub-apps and custom SDK surfaces
- plugins and marketplace
- Relay, Gateway, Connector, Sync, and mesh
- secrets and native permissions
- connector and external API execution
- storage, search, cache, and export
- supply chain and packages
- update and release channels
- prompt and tool exfiltration
- hostile local processes
- hostile network peers
- approval and social-engineering flows
- audit and log privacy

Each coverage row records assets, adversaries, trust boundary, threat
categories, controls, validation evidence, status, steward, review date, and
the relevant ADR/surface/route references.

## Threat Categories

Rows use STRIDE-style categories:

- `spoofing`: fake actor, host, node, package, plugin, provider, or user.
- `tampering`: unauthorized mutation of data, state, code, config, routes, or
  audit.
- `repudiation`: missing or ambiguous authority, actor, decision, or audit
  chain.
- `information_disclosure`: leakage of secrets, private state, prompts, logs,
  provider data, or local context.
- `denial_of_service`: resource exhaustion, startup blocking, unavailable
  agents, remote route wedging, or update lockout.
- `elevation_of_privilege`: expanded agent, plugin, host, connector, native, or
  remote authority without an explicit grant.

## Canonical Controls

- Secrets are references plus brokered operations. Plaintext reveal is a signed
  host human UI operation, not an agent/plugin/CLI/API surface.
- Agents act through assignments, grants, execution profiles, budgets,
  delegation checks, connector gates, and route policies. Delegation cannot
  launder authority.
- Custom apps and sub-apps declare capabilities and risk maps. Protected
  surfaces remain reachable and high-risk operations require brokered approval.
- Plugins and marketplace packages are untrusted by default. External plugin
  loading is unsafe unless explicitly development-scoped; marketplace activation
  needs ficha/risk review and declared capabilities.
- Connector execution uses the connector control plane before runtime calls,
  provider access, credential leases, external CLIs, MCP tools, paid actions, or
  mutations.
- Remote access projects registered local contracts through Coordinator,
  Gateway, Connector, and Sync. `remote-safe` requires route, owner/steward,
  policy, and tests. Relay compatibility adapters must not create parallel
  business APIs.
- Mesh, sync, node trust, shares, revocations, cache, and authority handoffs are
  signed, audited, and no-write until physical/host evidence proves execution.
- Storage/search/cache/export surfaces preserve data boundaries: no plaintext
  secrets in `core.sqlite`, logs, fixtures, generated docs, screenshots, or
  public artifacts.
- Package and update trust separates official/source/community/compatible
  status, keeps release/publish/version actions explicit, and reserves artifact
  verification as a future public `claw verify` surface.
- Approvals show the actor, action, resource, route, risk, duration, budget,
  and consequence. Approval copy must not become a social-engineering bypass.
- Audit and logs record enough authority context to inspect actions while
  redacting private values and avoiding telemetry by default.

## Change Rule

Any durable change that touches a required layer must either:

1. add or update a row in `docs/security-threat-model.coverage.json`, or
2. cite an existing coverage row in the ADR/template threat impact section.

If the work needs real providers, signed hosts, native permissions, package
signing, physical mesh, paid APIs, or production systems, the validation status
is `EXTERNAL PENDING` until approved evidence exists. Fixture-only validation
does not count as physical proof.

## Validation

Run:

```bash
node scripts/security-threat-model-check.mjs
node scripts/security-threat-model-check.mjs --self-test
npm run test:docs
```

Discovery must return this model for:

```bash
claw search threat --json
claw search "prompt exfiltration" --json
claw search "hostile local process" --json
claw search "supply chain update channel" --json
```
