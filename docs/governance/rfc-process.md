---
title: RFC Process
description: Public proposal, review, sign-off, and registry process for canonical types, canonical user-profile attributes, standards, and constitutional amendments.
---

# RFC Process

The RFC process is the public operating system for changes that the
Constitution requires to be proposed, reviewed, and signed off before they
become canon. It applies to:

- canonical data type promotion under VI.4;
- canonical user-profile attribute standardization under VI.9;
- published standards under III.2 when they define reusable public contracts;
- constitutional expansion and structural amendments.

ClawJS owns this process because ClawJS owns framework standards, schemas,
catalog definitions, user-model contracts, and the public `claw` discovery
surface. Clawix and other hosts consume or mirror the process; they do not
define competing RFC rules.

## Public Review

An RFC starts from `docs/rfcs/TEMPLATE.md` and receives a stable id in
`docs/rfcs/registry.json` such as `RFC-0001`. The registry row is created when
the proposal is ready for public review, not when an idea is first discussed
privately.

Public review must happen in a public GitHub Discussion, issue, or pull
request. The public GitHub Discussion, issue, or pull request is the review
anchor unless the maintainer records a specific public-safe reason why the
review venue is unavailable. Private sessions, local files, unpublished
approval roots, and maintainer-only notes are not valid public review links.
The registry stores public links and public-safe decision references only.

## States

| State | Meaning |
| --- | --- |
| `draft` | The proposal exists but is not yet under public review. |
| `review` | The proposal has a public review link and is open for feedback. |
| `accepted` | The maintainer signed off after public review and required evidence is recorded. |
| `rejected` | The proposal was considered and declined with public-safe rationale. |
| `withdrawn` | The author or maintainer closed the proposal before acceptance. |
| `superseded` | A later RFC or accepted decision replaced this proposal. |

Rejected, withdrawn, and superseded RFCs remain in the registry. They are part
of the public decision record and prevent future agents from reopening the same
question without reading prior rationale.

## Required Registry Fields

Every registry row must include:

- `id`: stable id matching `RFC-0001` style.
- `title`: short public title.
- `status`: one of the states above.
- `proposalKind`: `canonical_type`, `user_profile_attribute`, `standard`, or
  `constitutional_amendment`.
- `discussionUrl`: public Discussion, issue, or PR URL, or `null` while draft.
- `maintainerSignoff`: `null` until acceptance; accepted rows require
  `signedBy`, `signedAt`, and `decisionUrl`.
- `constitutionalPrinciples`: principles or amendment lanes affected.
- `affectedSurfaces`: public surfaces affected by the change.
- `decisionRefs`: public docs, ADRs, PRs, commits, or registry refs that carry
  the accepted outcome.

Accepted RFCs must also have enough proposal-specific evidence for the change
they approve.

## Canonical Type RFCs

A canonical type RFC must prove at least one VI.4 criterion:

- `universal`: most humans across locale and culture have or do it.
- `digital_workflow`: durable digital workflows or market use validate it.
- `multi_surface_reuse`: three or more skills, sub-apps, integrations, or
  domains need it.
- `human_recognizable`: a non-technical human recognizes it instantly.

The proposal must also include:

- the canonical name and aliases;
- schema and field-shape notes;
- relationship semantics;
- migration and evolution notes;
- canonical visual representation notes for card, list, and detail surfaces;
- why a custom database or linked note is insufficient.

Acceptance does not require every implementation detail to be final, but it
must define the standard shape well enough that implementation is not arbitrary.

## User-Profile Attribute RFCs

A canonical user-profile attribute RFC must show that the attribute improves
agents' ability to serve the user across surfaces and runtimes. It must include:

- the standardized attribute name and meaning;
- agent benefit;
- portability behavior;
- privacy and sensitivity classification;
- fallback behavior for unstandardizable values;
- a statement that the attribute is not designed for advertising, market segmentation, or third-party benefit.

An attribute that primarily benefits third parties is out of scope even if it is
easy to store.

## Standard RFCs

A standard RFC defines an open, versioned public contract that third parties can
implement. It must include the data shape, operations or protocol, compatibility
expectations, conformance evidence, and how the standard is discovered through
docs and `claw`.

## Constitutional Amendment RFCs

Constitutional expansion and structural amendments use the amendment process in
`CONSTITUTION.md`.

Expansion RFCs require public review and maintainer sign-off. Structural RFCs
require at least thirty days of public discussion before sign-off. Editorial
changes do not require an RFC, but if an editorial change uses one, the registry
must identify the amendment tier.

Both ClawJS and Clawix constitution copies must be updated together before a
constitutional amendment is complete.

## Acceptance

The maintainer signs off only after public review has happened and the RFC
contains the evidence required for its proposal kind. Sign-off records the
public decision URL and the accepted implementation or documentation references.

An accepted RFC is not complete by prose alone. The accepted outcome must route
through the relevant decision map, discoverability registry, guardrail or test,
and public docs. If implementation is intentionally deferred, the RFC records
the remaining work as explicit public debt or `EXTERNAL PENDING`.

## Validation

`scripts/rfc-process-check.mjs` protects this process. It validates the process
doc, template, registry shape, constitutional VI.4 and VI.9 routing,
discoverability, and accepted RFC sign-off evidence.
