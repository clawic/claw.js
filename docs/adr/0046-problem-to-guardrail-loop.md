# ADR 0046: Problem-to-Guardrail loop

Status: Accepted

Date: 2026-05-21

## Context

Fixing the exact defect found in review is not enough for a system maintained
by agents. Repeated reviews must improve future protection rather than only
repairing the current instance.

## Decision

Every problem detected by an agent or review closes with one of three durable
outputs:

- `guard/test añadido`
- `ADR/regla añadida`
- `deuda explícita con expiry`

Closure records the puntual problem, the general class, the existing rule that
should have caught it, and the selected durable output. If the existing canon
already covered the class, add or fix a guard/test. If no rule existed, add the
ADR/rule. If automation is not feasible now, record explicit debt with owner,
reason, expiry, and reentry condition.
For English closure templates, `punctual problem` means the same concrete
problem instance.

Anti-loop limit: if an agent adds `2 ciclos seguidos` of ADRs, ledgers,
manifests, guards, or baselines `sin reducir blockers reales`, it must stop.
`2 ciclos seguidos` means two consecutive closures in the same agent/task based
on governance documents or checks. `sin reducir blockers reales` means the work
did not resolve, narrow with evidence, or move a concrete blocker to external
pending. The closure must classify the remaining state as `blocker directo`,
`deuda lateral`, or `pendiente externo`; `pendiente externo` is equivalent to
`EXTERNAL PENDING` when closure depends on a provider, permission, hardware,
credential, physical evidence, or external approval. No más gobernanza para
arreglar exceso de gobernanza.

## Threat Model Impact

This decision does not add a runtime trust boundary. It strengthens safety by
making review findings accumulate into tests, ADRs, or expiring debt instead of
implicit memory.

## Performance Impact

The loop is static governance. It adds no runtime cost. Its resource value is
preventing repeated unbounded, eager, uncancellable, or high-churn behavior from
being fixed only locally.

## Decision Tensions

- **Prioritized axes**: cumulative learning, repeatable review, and durable
  guardrails.
- **Constrained axes**: quick one-off repairs are constrained when the defect
  class would recur, but governance work is also constrained when it does not
  reduce real blockers.
- **Tradeoffs accepted**: closure work can be slightly larger because it must
  leave protection.
- **Debt or pending evidence**: manual closure notes are allowed only with
  explicit expiry when automation is not practical.

## Adoption And Canonicity

This ADR makes no adoption or canonicity promotion claim.

## Source Decision Audit

Conversation-derived 2026-05-21 organizational P0. The public record is this
ADR, the `adr-to-guardrail` and review skill updates, decision-map routing, and
`scripts/problem-to-guardrail-check.mjs`.

## Surface Parity

- **Human surface**: `docs/decision-map.md`, `docs/agent-rules/index.md`, and
  review/ADR skills.
- **Programmatic surface**: `scripts/problem-to-guardrail-check.mjs`,
  `scripts/adr-operational-coverage-check.mjs`, and docs alignment checks.
- **Persistence**: accepted ADRs, skills, decision map, and expiring baselines.
- **Gaps**: per-review structured ledgers can be added later if needed.
- **Validation**: the Problem-to-Guardrail check verifies the rule is routed
  through canon, skills, and test lanes.

## Discovery Route

- **Canonical name**: `adr:problem-to-guardrail-loop`.
- **AGENTS/CLAUDE**: `AGENTS.md` -> `docs/decision-map.md`.
- **Skill**: `adr-to-guardrail` and `code-review-risk`.
- **Docs router**: `docs/decision-map.md`.
- **CLI**: `claw search "problem guardrail" --json`.
- **Registry**: `docs/discoverability.registry.json`.
- **Operational coverage**: `docs/adr-operational-coverage.manifest.json`.

## Consequences

Review closure now has a durable shape. “Fixed” alone is incomplete for defects
that reveal a missing class-level protection.
Governance closure is also incomplete when it only adds more governance after
two consecutive governance cycles without reducing a concrete blocker.
