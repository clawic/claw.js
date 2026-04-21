---
id: dec-monorepo
slug: decision-separate-repos
kind: memory
type: decision_note
title: Decision to keep separate repositories
schemaVersion: 2
createdAt: 2026-04-16
updatedAt: 2026-04-16
status: active
archived: false
decisionStatus: accepted
subject: clawjs
about:
  - typescript
uses:
  - target: typescript
    confidence: 1.0
    context: shared language across repos
source:
  - meeting-q1-review
---

Despite considering a monorepo, the team decided to keep Memory, ClawJS, and ClawHub as separate repositories. Each project has different release cadences and deployment targets. TypeScript is the shared language to ensure type compatibility.
