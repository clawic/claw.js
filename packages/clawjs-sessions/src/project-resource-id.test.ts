import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { SessionsServiceStore, stableProjectIdFromPath } from "./store.ts";

test("projects can use opaque resource ids as stable identity while paths move", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-sessions-resource-id-"));
  const dbPath = path.join(rootDir, "sessions.sqlite");
  const store = new SessionsServiceStore(dbPath);
  const firstPath = path.join(rootDir, "Before");
  const secondPath = path.join(rootDir, "After");

  const created = store.createProject({
    resourceId: "res_projectabc123",
    displayName: "Before",
    path: firstPath,
  });
  assert.equal(created.id, "res_projectabc123");
  assert.equal(created.resourceId, "res_projectabc123");
  assert.notEqual(created.id, stableProjectIdFromPath(firstPath));

  const moved = store.updateProject(created.id, {
    displayName: "After",
    path: secondPath,
  });
  assert.equal(moved?.id, created.id);
  assert.equal(moved?.resourceId, "res_projectabc123");
  assert.equal(moved?.path, secondPath);
  assert.equal(store.getProjectByResourceId("res_projectabc123")?.path, secondPath);
  assert.equal(store.getProjectByPath(secondPath)?.id, created.id);

  store.close();
});
