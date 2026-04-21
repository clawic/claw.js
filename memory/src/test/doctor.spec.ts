import test from "node:test";
import assert from "node:assert/strict";
import { createTestWorkspace, runCli, runCliExpectFailure, seedStandardNotes, writeNote } from "./helpers";

test("doctor detects stale index after note edit", () => {
  const workspace = createTestWorkspace();
  seedStandardNotes(workspace);
  runCli(["index"], workspace);

  writeNote(workspace, "entities", "project_memory.md", `---
id: project_memory
slug: memory
kind: entity
type: project
title: Memory
schemaVersion: 2
createdAt: 2026-04-15
updatedAt: 2026-04-16
status: active
archived: false
uses:
  - target: tech_flutter
    confidence: 0.9
    since: 2026-04-15
---

Markdown-first memory system with index drift.
`);

  const result = runCli(["doctor"], workspace);
  assert.equal(result.health.indexStale, true);
  assert.ok(result.index.noteChanges >= 1);
});

test("exact query fails on stale index", () => {
  const workspace = createTestWorkspace();
  seedStandardNotes(workspace);
  runCli(["index"], workspace);

  writeNote(workspace, "entities", "project_memory.md", `---
id: project_memory
slug: memory
kind: entity
type: project
title: Memory
schemaVersion: 2
createdAt: 2026-04-15
updatedAt: 2026-04-16
status: active
archived: false
uses:
  - target: tech_flutter
    confidence: 0.9
    since: 2026-04-15
---

Updated content.
`);

  assert.match(
    runCliExpectFailure(["query", "--linked-to", "project_memory", "--exact"], workspace),
    /Index is stale/
  );
});

test("reindex after edit updates changed notes", () => {
  const workspace = createTestWorkspace();
  seedStandardNotes(workspace);
  runCli(["index"], workspace);

  writeNote(workspace, "entities", "project_memory.md", `---
id: project_memory
slug: memory
kind: entity
type: project
title: Memory
schemaVersion: 2
createdAt: 2026-04-15
updatedAt: 2026-04-16
status: active
archived: false
uses:
  - target: tech_flutter
    confidence: 0.9
    since: 2026-04-15
---

Reindexed content.
`);

  const result = runCli(["index"], workspace);
  assert.ok(result.changed >= 1, "at least the changed note is reindexed");
});
