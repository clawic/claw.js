---
title: Adoption And Canonicity Governance
description: Evidence standard for canonical, stable, broadly understandable, and PMF/adoption claims.
---

# Adoption And Canonicity Governance

This standard operationalizes Constitution I.1 and I.4. Clawix/ClawJS can
experiment freely, but a surface, capability, standard, or experience cannot be
promoted to `stable`, `canonical`, or "for any human" without an adoption and
comprehension packet.

The policy is privacy-first hybrid evidence. Telemetry remains disabled by default.
Valid evidence may come from manual user research, maintainer
dogfooding, explicit user feedback, public community signals, support reports,
and opt-in metric packets. Private artifacts stay outside public repositories; public
manifests may store only aliases, hashes, dates, summaries, and approval
metadata.

## Stages

| Stage | Meaning |
| --- | --- |
| `unproven` | No meaningful adoption or comprehension evidence is recorded. |
| `exploratory` | Early evidence exists, but the claim is not ready for stable or canonical promotion. |
| `understandable` | A target human audience can understand the experience with documented evidence and a feedback loop. |
| `adopted` | Repeated use, community demand, or workflow evidence shows durable adoption. |
| `canonical` | The experience has adoption and a standard others can implement; this is the I.1 canonicity bar. |

`stable` capability promotion requires at least `understandable`. A PMF or
adoption claim requires at least `adopted`. A full canonicity claim requires
`canonical`.

## Promotion Packet

Promotion packets live in
[`docs/governance/adoption-canonicity.manifest.json`](./adoption-canonicity.manifest.json).
Each packet records:

- target audience and target surface/capability/standard;
- claim type and current stage;
- public-safe evidence references or private aliases;
- feedback loop mechanism and cadence;
- privacy mode and telemetry default;
- promotion decision, reviewer, review cadence, and expiry date.

Packets expire through review dates rather than silently remaining true. A stale
packet blocks new promotion claims until it is renewed, superseded, or the
target is downgraded.

## Privacy Rule

No packet may depend on silent telemetry. Metric evidence is valid only when it
is explicitly opt-in, aggregated or redacted, and tied to a consent mechanism.
Manual research and private review artifacts use aliases such as
`external-research-evidence:<relative-ref>` instead of local paths.

## Guardrail

`scripts/adoption-canonicity-check.mjs` validates the manifest, negative
fixtures, private-reference hygiene, feedback-loop presence, telemetry policy,
and capability maturity promotion packet coverage. `claw inspect canonicity
--json` exposes the same public packet inventory for agents.
