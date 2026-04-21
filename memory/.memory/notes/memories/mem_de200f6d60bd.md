---
id: mem_de200f6d60bd
slug: claw-cli-memory-agent-evaluation
kind: memory
type: semantic_note
title: Claw CLI memory agent evaluation
schemaVersion: 2
createdAt: 2026-04-21
updatedAt: 2026-04-21
status: active
archived: false
observedAt: 2026-04-21T09:33:28.760Z
validFrom: 2026-04-21T09:33:28.760Z
confidence: 0.95
trustScore: 0.9
quarantined: false
provenance: conclusion
lastSeen: 2026-04-21T09:33:28.760Z
---

External agents tested Claw CLI memory through the local clo alias. clo now points to the local Claw CLI. The OpenClaw memory bridge needed agent flags after the search subcommand; memory search now executes against the installed OpenClaw CLI and empty results exit successfully. Remaining gaps: memory group is mostly read-only, writes are hidden under db memory, inspect/list/status are effectively aliases, help does not teach --query, JSON error output is inconsistent, search results lack scores/snippets, document search no-result exit codes are inconsistent, and runtime status/compat probes may hang in the default OpenClaw environment.
