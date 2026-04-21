---
id: pref-ivan-markdown
slug: ivan-prefers-markdown-first
kind: memory
type: preference_note
title: Ivan prefers markdown-first architecture
schemaVersion: 2
createdAt: 2026-04-16
updatedAt: 2026-04-16
status: active
archived: false
stability: high
subject: ivan
about:
  - memory
prefers:
  - target: sqlite
    confidence: 0.9
    context: for indexing only, not as source of truth
source:
  - design-doc-v2
---

Ivan strongly believes that markdown files should be the source of truth, with SQLite serving only as a derived index. This drives the entire Memory architecture.
