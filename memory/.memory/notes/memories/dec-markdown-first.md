---
id: dec-markdown-first
slug: decision-markdown-first
kind: memory
type: decision_note
title: Decision to use markdown-first architecture
schemaVersion: 2
createdAt: 2026-04-16
updatedAt: 2026-04-16
status: active
archived: false
decisionStatus: accepted
subject: memory
about:
  - ivan
  - knowledge-graphs
uses:
  - target: sqlite
    confidence: 1.0
    context: derived index only
source:
  - design-doc-v2
---

The team decided that Memory v2 would adopt a markdown-first architecture where YAML frontmatter is the canonical data format. SQLite is only used as a query index, never as the source of truth. This ensures human readability and git-friendliness.
