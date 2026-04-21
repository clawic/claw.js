import test from "node:test";
import assert from "node:assert/strict";
import { createTestWorkspace, runCli, runCliExpectFailure, seedStandardNotes } from "./helpers";

test("query filters by type and where", () => {
  const workspace = createTestWorkspace();
  seedStandardNotes(workspace);
  runCli(["index"], workspace);

  const frameworks = runCli(
    ["query", "--type", "technology", "--where", "technologyKind=framework"],
    workspace
  );
  assert.equal(frameworks.count, 2);
});

test("query filters by has relation", () => {
  const workspace = createTestWorkspace();
  seedStandardNotes(workspace);
  runCli(["index"], workspace);

  const result = runCli(
    ["query", "--note-kind", "memory", "--kind", "preference", "--has", "prefers=tech_flutter"],
    workspace
  );
  assert.equal(result.count, 1);
  assert.equal(result.notes[0].id, "mem_ana_flutter_preference");
});

test("query neighbors mode finds linked notes", () => {
  const workspace = createTestWorkspace();
  seedStandardNotes(workspace);
  runCli(["index"], workspace);

  const result = runCli(
    ["query", "--mode", "neighbors", "--linked-to", "project_memory", "--path-depth", "1"],
    workspace
  );
  assert.ok(result.notes.some((n: { id: string }) => n.id === "person_ana"));
  assert.ok(result.notes.some((n: { id: string }) => n.id === "mem_source_extract"));
});

test("query --exact fails on stale index", () => {
  const workspace = createTestWorkspace();
  seedStandardNotes(workspace);
  runCli(["index"], workspace);

  const exactQuery = runCli(
    ["query", "--mode", "neighbors", "--linked-to", "tech_flutter", "--exact"],
    workspace
  );
  assert.equal(exactQuery.index.stale, false);
});

test("query requires index to exist", () => {
  const workspace = createTestWorkspace();
  seedStandardNotes(workspace);

  assert.match(
    runCliExpectFailure(["query", "--type", "technology"], workspace),
    /No index found/
  );
});
