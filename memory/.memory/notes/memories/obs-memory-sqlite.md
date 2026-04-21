---
id: obs-memory-sqlite
slug: memory-uses-sqlite
kind: memory
type: observation
title: Memory chose SQLite for indexing
schemaVersion: 2
createdAt: 2026-04-16
updatedAt: 2026-04-16
status: active
archived: false
category: architecture
about:
  - memory
  - sqlite
source:
  - design-doc-v2
---

Memory uses SQLite with WAL mode for its local index database. The decision was driven by the need for zero-configuration embedded storage that works well for single-writer scenarios.
