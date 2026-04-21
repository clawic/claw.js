---
id: extract-perf-thread
slug: extract-perf-slack
kind: memory
type: source_extract
title: Slack extract on SQLite covering indexes
schemaVersion: 2
createdAt: 2026-04-16
updatedAt: 2026-04-16
status: active
archived: false
quote: "Adding a covering index on (source_id, relation_name, target_id) dropped the BFS traversal from 340ms to 12ms for a 600-note workspace."
source:
  - slack-thread-perf
about:
  - sqlite
  - databases
  - memory
---

Performance finding from Carlos shared in the Slack thread about index optimization.
