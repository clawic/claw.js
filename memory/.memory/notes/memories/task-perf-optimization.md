---
id: task-perf-optimization
slug: task-perf-sqlite-optimization
kind: memory
type: task_context_note
title: Optimize SQLite query performance
schemaVersion: 2
createdAt: 2026-04-16
updatedAt: 2026-04-16
status: active
archived: false
taskState: active
subject:
  - carlos
  - memory
about:
  - sqlite
  - databases
source:
  - slack-thread-perf
---

Carlos is investigating SQLite query performance bottlenecks in Memory's index. The relation traversal queries are slow for workspaces with 500+ notes. Exploring covering indexes and query plan optimization.
