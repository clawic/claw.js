# ADR 0035: Decision tension rubric

Status: Accepted

Date: 2026-05-20

## Context

ClawJS and Clawix already route durable decisions through the Constitution,
decision maps, ADRs, discoverability records, skills, and guardrails. That
system is mature enough to prevent many hidden decisions, but ADR authors can
still make a decision look complete without naming the tension it resolves.

The project needs a compact public rubric that pushes agents to weigh canon,
boundaries, sovereignty, discovery, reliability, simplicity, performance,
automation, public hygiene, and adaptability without turning every small change
into a bureaucratic checklist.

## Decision

ClawJS owns the canonical Decision Tension Rubric at
`docs/governance/decision-tension-rubric.md`. Clawix mirrors and routes to this
canon as the human app and embedded host.

Accepted ADRs that change durable architecture, governance, data, security,
agents, interfaces, routes, storage, public surfaces, or validation policy must
include a `Decision Tensions` section. Tiny editorial ADR updates do not need a
formal rubric entry.

The rubric uses fourteen axes:

1. Canon and semantic coherence.
2. Ownership and boundaries.
3. Sovereignty, security, and integrity.
4. Discoverability and traceability.
5. Surface parity.
6. Reliability and evidence.
7. Evolution and debt.
8. Simplicity and earned abstraction.
9. Composability and modularity.
10. Performance and nonblocking behavior.
11. Human and agent experience.
12. Controlled automation.
13. Public/private hygiene and official trust.
14. Strategic adaptability.

ADRs answer only the axes that matter to the decision. Broad decisions must say
why omitted axes are not material. The rubric treats aesthetic and interaction
quality as a human-facing product/UI concern only; agent and code quality are
evaluated through clarity, boundaries, traceability, reliability,
maintainability, and evidence.

## Decision Tensions

- **Prioritized axes**: canon and semantic coherence; discoverability and
  traceability; reliability and evidence; evolution and debt; human and agent
  experience.
- **Constrained axes**: simplicity and earned abstraction limits the rubric to
  a short ADR section instead of a universal checklist; controlled automation
  keeps this as ADR governance, not an automatic product/security decision
  maker.
- **Tradeoffs accepted**: accepted ADRs become slightly heavier to write, but
  future agents get a clearer record of what a decision intentionally
  prioritizes and what it does not attempt to solve.
- **Debt or pending evidence**: enforcement is limited to templates, routing,
  discoverability, and docs checks in this slice. Future guardrails may inspect
  accepted ADR bodies for missing `Decision Tensions` sections once existing
  historical ADR debt is classified.

## Surface Parity

- **Human surface**: `docs/governance/decision-tension-rubric.md`,
  `docs/adr/TEMPLATE.md`, `docs/decision-map.md`, and
  `docs/agent-rules/index.md` explain when and how humans and agents use the
  rubric.
- **Programmatic surface**: `scripts/discoverability-check.mjs`, docs alignment
  checks, and `claw search "decision tension rubric" --json` expose and verify
  the route.
- **Persistence**: the durable canon is this ADR, the governance rubric doc,
  the ADR template, decision-map routing, and discoverability registry records.
- **Gaps**: historical ADRs without a tension section are existing debt, not
  expanded by this ADR. Automated historical remediation is optional future
  work.
- **Validation**: `npm run test:docs`, `claw governance doctor --json`, and
  `claw search "decision tension rubric" --json` protect the local framework
  path. Clawix mirrors run their local docs and discoverability checks.

## Discovery Route

- **Canonical name**: `adr:decision-tension-rubric`.
- **AGENTS/CLAUDE**: `AGENTS.md` routes to `docs/decision-map.md`, which routes
  durable ADR and governance work to this ADR and rubric.
- **Skill**: `adr-to-guardrail`, `decision-map-maintenance`, and
  `docs-alignment-update` require the rubric for durable decisions.
- **Docs router**: `docs/decision-map.md`, `docs/constitution-map.md`,
  `docs/governance/README.md`, and `docs/agent-rules/index.md` point to the
  rubric.
- **CLI**: `claw search "decision tension rubric" --json` and
  `claw search governance --json` surface the rubric after discoverability
  regeneration.
- **Registry**: `docs/discoverability.registry.json` records this ADR and the
  rubric doc.

## Consequences

Durable decisions must explain their tradeoffs before acceptance. The rubric
helps agents avoid maximizing every virtue without judgment, while preserving
the Constitution as the highest authority and keeping small edits lightweight.
