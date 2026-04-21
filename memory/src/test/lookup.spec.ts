import test from "node:test";
import assert from "node:assert/strict";
import { createTestWorkspace, runCli, runCliExpectFailure, seedStandardNotes, writeNote } from "./helpers";

test("lookup resolves by alias", () => {
  const workspace = createTestWorkspace();
  seedStandardNotes(workspace);
  runCli(["index"], workspace);

  const result = runCli(["lookup", "ana"], workspace);
  assert.equal(result.id, "person_ana");
});

test("lookup detects ambiguous references", () => {
  const workspace = createTestWorkspace();
  seedStandardNotes(workspace);

  writeNote(workspace, "entities", "technology_duplicate_title.md", `---
id: tech_duplicate_title
slug: flutter-engine
kind: entity
type: technology
title: Flutter SDK
schemaVersion: 2
createdAt: 2026-04-15
updatedAt: 2026-04-15
status: active
archived: false
technologyKind: platform
---

Another technology note with the same title.
`);

  runCli(["index"], workspace);
  assert.match(
    runCliExpectFailure(["lookup", "Flutter SDK"], workspace),
    /Ambiguous reference "Flutter SDK"/
  );
});

test("lookup requires index to exist", () => {
  const workspace = createTestWorkspace();
  seedStandardNotes(workspace);

  assert.match(
    runCliExpectFailure(["lookup", "ana"], workspace),
    /No index found/
  );
});
