import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createTestWorkspace, runCli, runCliExpectFailure, seedStandardNotes, writeNote } from "./helpers";

test("validate passes for well-formed notes", () => {
  const workspace = createTestWorkspace();
  seedStandardNotes(workspace);
  const result = runCli(["validate"], workspace);
  assert.equal(result.valid, true);
  assert.equal(result.requiresMigration, false);
  assert.equal(result.notes, 8);
});

test("validate rejects invalid cardinality", () => {
  const workspace = createTestWorkspace();
  seedStandardNotes(workspace);

  writeNote(workspace, "memories", "mem_invalid_cardinality.md", `---
id: mem_invalid_cardinality
slug: invalid-cardinality
kind: memory
type: preference_note
title: Invalid cardinality
schemaVersion: 2
createdAt: 2026-04-15
updatedAt: 2026-04-15
status: active
archived: false
subject:
  - person_ana
  - person_ana
prefers:
  - tech_flutter
---

Broken cardinality.
`);

  assert.match(
    runCliExpectFailure(["validate"], workspace),
    /mem_invalid_cardinality: Relation "subject" must contain exactly one target/
  );
});

test("validate detects schema migration requirements", () => {
  const workspace = createTestWorkspace();
  seedStandardNotes(workspace);

  fs.writeFileSync(
    path.join(workspace, ".memory", "schema", "custom.json"),
    `${JSON.stringify({
      version: 3,
      entityKinds: [{ id: "reference", description: "Reference material." }],
      memoryKinds: [],
      entityTypes: [{
        id: "book",
        kindId: "reference",
        description: "A book reference.",
        attributes: { author: { type: "string", required: true } },
        relations: { related_topics: { targets: ["topic"], cardinality: "many", inverse: "related_references" } }
      }],
      memoryTypes: []
    }, null, 2)}\n`,
    "utf8"
  );

  writeNote(workspace, "entities", "book_ddia.md", `---
id: book_ddia
slug: ddia
kind: entity
type: book
title: Designing Data-Intensive Applications
schemaVersion: 3
createdAt: 2026-04-15
updatedAt: 2026-04-15
status: active
archived: false
author: Martin Kleppmann
---

Classic systems design book.
`);

  const result = runCli(["validate"], workspace);
  assert.equal(result.valid, true);
  assert.equal(result.requiresMigration, true);
  assert.ok(result.warnings.some((w: string) => w.includes("person_ana")));
});
