# ADR 0034: Network Control Plane

## Status

Accepted.

## Context

Claw already has system telemetry, Mac Control roots for Wi-Fi/VPN/proxy/firewall,
and Gateway/remote route contracts. Those surfaces need one shared network
policy model instead of separate firewall, VPN, provider, and Gateway decisions.

## Decision

ClawJS owns a reusable Network Control Plane. The framework defines subjects,
endpoints, rules, events, profiles, manifests, adapters, evaluation, redaction,
and Gateway route enforcement semantics. Clawix and other hosts project that
model into native UI and signed-host adapters.

`claw network` is the canonical framework portal. Mac-adjacent roots such as
`claw wifi`, `claw vpn`, `claw proxy`, and `claw firewall` remain related host
surfaces and consume or explain the shared policy model where relevant.

Monitor remains the high-churn store for network events and rollups. Core
framework state such as rules, profiles, manifests, and adapter declarations
must not create a parallel time-series database.

Privacy defaults to aggregate redaction. Process and domain detail require an
explicit opt-in. Agents may propose rules, but human approval or an explicit
grant is required to apply them.

Native macOS content filter, DNS proxy, Endpoint Security, VPN, and system-wide
firewall enforcement are designed as adapters, but real execution is
`external_pending` until entitlements, signed-host validation, fixtures, receipts,
and evidence exist.

## Consequences

- Framework and Gateway traffic can be governed immediately with shared policy.
- Native host enforcement can be phased in without blocking the first product
  slice.
- Public docs and discoverability route network decisions through `claw network`.
- No packet payload inspection or TLS decryption is part of this ADR.
