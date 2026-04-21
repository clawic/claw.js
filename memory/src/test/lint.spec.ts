import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createTestWorkspace, runCli, seedStandardNotes, writeNote } from "./helpers";

test("lint detects and fixes frontmatter ordering", () => {
  const workspace = createTestWorkspace();
  seedStandardNotes(workspace);

  writeNote(workspace, "entities", "topic_ui.md", `---
title: UI
type: topic
kind: entity
id: topic_ui
slug: ui
schemaVersion: 2
updatedAt: 2026-04-15
createdAt: 2026-04-15
status: active
archived: false
domain: frontend
---

Interface design and implementation.
`);

  const preview = runCli(["lint"], workspace);
  assert.ok(preview.changed >= 1);
  assert.ok(preview.files.includes(".memory/notes/entities/topic_ui.md"));

  const fixed = runCli(["lint", "--fix"], workspace);
  assert.ok(fixed.fixed >= 1);

  const content = fs.readFileSync(
    path.join(workspace, ".memory", "notes", "entities", "topic_ui.md"),
    "utf8"
  );
  assert.match(content, /^---\nid: topic_ui\nslug: ui\nkind: entity\ntype: topic\ntitle: UI\nschemaVersion: 2/m);
});
