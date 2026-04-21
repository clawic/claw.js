---
id: pref-carlos-types
slug: carlos-prefers-strict-typing
kind: memory
type: preference_note
title: Carlos prefers strict type systems
schemaVersion: 2
createdAt: 2026-04-16
updatedAt: 2026-04-16
status: active
archived: false
stability: high
subject: carlos
about:
  - typescript
prefers:
  - target: rust
    confidence: 0.95
    context: for backend systems
  - target: zod
    confidence: 0.8
    context: for runtime validation
source:
  - conv-onboarding
---

Carlos is a strong advocate for strict type systems. He pushes for Zod validation at boundaries and Rust for anything performance-critical.
