import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createTestWorkspace, runCli, runCliExpectFailure, seedStandardNotes } from "./helpers";

test("archive sets archived flag on a note", () => {
  const workspace = createTestWorkspace();
  seedStandardNotes(workspace);
  runCli(["index"], workspace);

  const result = runCli(["archive", "topic_ui"], workspace);
  assert.equal(result.archived, true);

  const content = fs.readFileSync(
    path.join(workspace, ".memory", "notes", "entities", "topic_ui.md"),
    "utf8"
  );
  assert.match(content, /archived: true/);
});

test("delete removes a note file", () => {
  const workspace = createTestWorkspace();
  seedStandardNotes(workspace);
  runCli(["index"], workspace);

  const result = runCli(["delete", "topic_ui", "--confirm"], workspace);
  assert.equal(result.deleted, true);
  assert.ok(!fs.existsSync(path.join(workspace, ".memory", "notes", "entities", "topic_ui.md")));
});

test("delete without --confirm fails", () => {
  const workspace = createTestWorkspace();
  seedStandardNotes(workspace);
  runCli(["index"], workspace);

  const output = runCliExpectFailure(["delete", "topic_ui"], workspace);
  assert.ok(output.length > 0);
});
