# Decision Tension Rubric

This rubric operationalizes `CONSTITUTION.md` for durable decisions. It is not a
second source of truth and does not replace constitutional red lines. It makes
agents and contributors state the healthy tensions a decision is navigating
before the decision becomes accepted canon.

Use this rubric for ADRs and governance changes that affect durable
architecture, data, security, agents, interfaces, routes, storage, public
surfaces, or validation policy. Tiny editorial updates do not need a formal
rubric entry.

Accepted durable ADRs answer the relevant axes in their `Decision Tensions`
section. Broad decisions should also say why omitted axes are not material.

## Priority Model

- **Red lines are not traded off.** Consent, no paywalls against user data,
  provider portability, and no irreversible data loss remain constitutional
  constraints.
- **Maximize** clarity, integrity, security, traceability, and user sovereignty.
- **Optimize** simplicity, modularity, performance, automation, and agent
  usefulness against real product pressure.
- **Limit** duplication, ambient authority, hidden coupling, magic,
  configuration, private/public leakage, and unowned debt.

## Axes

1. **Canon and semantic coherence**: one truth per concept, stable names, docs
   aligned with reality.
2. **Ownership and boundaries**: clear owner for each contract, datum, route,
   surface, permission, or action.
3. **Sovereignty, security, and integrity**: local-first, consent, least
   privilege, audit, no irreversible loss.
4. **Discoverability and traceability**: agents and humans can find what exists,
   why, and how to validate it.
5. **Surface parity**: important capabilities have human and programmatic
   surfaces, or classified gaps.
6. **Reliability and evidence**: hermetic tests, host validation where needed,
   clear failures.
7. **Evolution and debt**: migrations, compatibility, explicit debt, closure
   criteria.
8. **Simplicity and earned abstraction**: avoid duplication, magic,
   unnecessary layers, accidental configuration.
9. **Composability and modularity**: pieces combine without hidden coupling or
   broad rewrites.
10. **Performance and nonblocking behavior**: measure before optimizing; avoid
    UI/runtime blocking.
11. **Human and agent experience**: UX, DX, accessibility, user control, agent
    usefulness.
12. **Controlled automation**: automate repeatable validation/discovery, not
    sensitive product or security decisions.
13. **Public/private hygiene and official trust**: no private leaks;
    official/source/community/compatible stay distinct.
14. **Strategic adaptability**: low cost to experiment, retire pieces, and
    change direction.

`Aesthetic and interaction quality` applies to human-facing product and UI
surfaces. Agent and code quality are evaluated through clarity, boundaries,
traceability, reliability, maintainability, and evidence rather than visual
aesthetics.

## ADR Use

The ADR author should identify:

- **Prioritized axes**: which axes the decision intentionally advances.
- **Constrained axes**: which good qualities are intentionally limited to avoid
  over-engineering, rigidity, unsafe automation, or scope creep.
- **Tradeoffs accepted**: what the decision makes harder and why that is
  acceptable.
- **Debt or pending evidence**: what remains partial, blocked,
  external-pending, or scheduled for later validation.

This section should be specific enough that a later agent can review whether the
implementation still matches the decision pressure.
