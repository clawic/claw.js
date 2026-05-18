# ADR 0026: Regulated domain safety and liability boundary

## Status

Accepted. Source conversation:
`019e3a44-1175-7930-b45c-252f342b5ec2`.

## Context

ClawJS now exposes dense professional domains such as health, mental health,
finance, banking, insurance, legal, HR, education, government, pharma, labs,
IoT, vehicles, identity, security, and billing. These domains are useful as
local records, evidence, search, summaries, drafts, and review preparation, but
they also carry regulated and high-liability failure modes.

Local-first storage does not remove the need for product limits. Agents,
connectors, CLI commands, MCP tools, Relay, search, exports, and app surfaces
must share the same boundary so future work cannot route around the policy.

## Decision

Claw structures, queries, relates, summarizes, labels, and prepares sensitive
data for human or professional review. It does not make final clinical, legal,
financial, insurance, employment, education, government, emergency, safety, or
other regulated decisions.

The machine-readable policy lives in
`packages/clawjs-core/src/regulated-domain-safety.ts`. It defines regulated
domains, sensitive data classes, decision effects, allowed uses, blocked uses,
prohibited practices, disclaimer policy, output label policy, professional
review requirements, and local audit policy.

Allowed default uses are local recordkeeping, search, extraction, factual
summary, questions to review, gaps and provenance, non-final drafts, and
preparation for human or professional review.

Blocked or prohibited uses include diagnosis or treatment, therapy or crisis
counseling, legal strategy as final advice, investment or credit decisions,
insurance coverage decisions, employment decisions, education/admission
decisions, government benefits or services decisions, emergency handling,
autonomous sensitive external actions, social scoring, harmful manipulation,
sensitive biometric/emotion inference, criminal-risk profiling, and autonomous
regulated filings or submissions.

## Implementation

Agents V1, Connector Control Plane, CLI guidance, Dense Data, Search, MCP,
Relay, exports, remote/sync, app surfaces, docs, examples, and release gates
must consume the shared policy instead of maintaining separate local versions.
Subagents, connectors, MCP, Relay, export/share, sync, remote providers, or
external actions must not weaken or bypass the boundary.

Sensitive outputs must carry persistent labels equivalent to draft, not
professional advice, human review required, sources and gaps required, regulated
domain, and decision effect. External sensitive actions, sensitive export/share,
remote/sync, support data, and provider use require explicit contextual review
or opt-in.

## Consequences

New sensitive domains, collections, routes, connectors, agents, or demos are
incomplete until they are classified against this policy and covered by tests.
Marketing and docs must avoid unqualified autonomy, professional advice, or
compliance claims. Public release gates must fail when legal docs, disclaimers,
classifications, labels, consent surfaces, or tests are missing.
