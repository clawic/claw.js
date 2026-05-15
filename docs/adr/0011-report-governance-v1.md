# ADR 0011: Report Governance V1

## Status

Accepted.

## Context

Agents running Claw locally need a standard way to help users report defects,
feature requests, translation problems, and security findings without leaking
secrets, local paths, host names, or low-quality noise into public GitHub
surfaces. The workflow must support high volume: dedupe before creation, route
ideas and feedback to Discussions, keep concrete defects in Issues, and block
publication when evidence is too weak.

## Decision

Claw exposes `claw report` as the canonical local workflow for agent-originated
GitHub reports. V1 stores sanitized drafts in `.claw/reports`, uses local salted
fingerprints for dedupe, renders a preview for human approval, and produces a
submission plan for the Claw GitHub connector. Public security reports are
blocked; security findings route to private security advisory handling through
`github.action.create-security-advisory-report`.

The user owns the GitHub identity used for publication. Agents may draft,
classify, redact, dedupe, preview, recommend labels, and propose PR intent, but
they may not publish without an explicit human confirmation. Attachments are
not included by default: each attachment requires explicit opt-in and full local
paths are never persisted.

Low-evidence reports are blocked with `NOT_ENOUGH_INFO`. Safe targeted
validation is allowed when it is local, dry-run, fixture-backed, or otherwise
does not touch production data or paid APIs. Missing real integrations are
reported as `EXTERNAL PENDING`, separate from reproducible failures.

Non-destructive automation lives behind `claw report triage`: it may recommend
labels, canonical duplicate comments, evidence tasks, and queue state. It may
not close, lock, delete, or publish in V1.

## Consequences

Agents have one stable reporting contract instead of ad hoc GitHub prompts.
Maintainers receive structured reports with privacy review, quality gates,
dedupe candidates, closed-label taxonomy, and clear routing. Real GitHub
publication remains connector-owned and approval-gated by the active host.
