# Regulated Domain Safety

ClawJS supports sensitive domains as local-first records and review
workspaces. It does not replace doctors, therapists, lawyers, financial
advisers, banks, insurers, employers, schools, public authorities, emergency
services, or other regulated professionals.

The executable policy is in
`packages/clawjs-core/src/regulated-domain-safety.ts` and is accepted by
[ADR 0026](./adr/0026-regulated-domain-safety-liability-boundary.md). Sensitive,
external, export/share, remote/sync, connector, agent, CLI, and release
surfaces must build a classified action context and evaluate it through this
shared policy instead of adding command-local legal checks.

## Default allowed use

The default safe envelope is:

- local recordkeeping
- search
- extraction
- factual summary
- questions to review
- gaps and provenance
- non-final drafts
- preparation for human or professional review

Sensitive outputs must be labeled as drafts, not professional advice, requiring
human review, and requiring sources and gaps.

## Default blocked use

Claw must not make final regulated decisions. The policy blocks or prohibits
diagnosis, treatment, therapy or crisis counseling, final legal advice,
investment or credit decisions, insurance coverage decisions, employment
decisions, education/admission decisions, government benefits decisions,
emergency handling, social scoring, harmful manipulation, sensitive biometric or
emotion inference, criminal-risk profiling, and autonomous regulated filings or
submissions.

## Required gates

`evaluateRegulatedAction(...)` returns a compact policy decision:

- `allow`: the action can continue with the returned labels, disclaimer, and
  audit requirements.
- `confirm`: the action is not blocked, but requires explicit review, consent,
  destination authorization, labels, or opt-in before execution.
- `block`: the action is outside the allowed product boundary.
- `log-only`: the action is safe to continue and only needs configured local
  audit handling.

External sensitive actions, sensitive export/share, remote/sync, support data,
third-party provider use, and professional contexts require explicit review or
opt-in through the policy config. Minors require a strong guard and the official
product is 18+ by default.

Every new sensitive collection, connector, agent, CLI route, MCP tool, Relay
route, app surface, demo, or docs claim must be classified against the shared
policy before it can be treated as complete.
