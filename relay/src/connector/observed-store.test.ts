import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { WorkspaceObservedStore } from "./observed-store.ts";

test("WorkspaceObservedStore writes relay fallback data under observed workspace state", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-observed-workspace-"));
  const store = new WorkspaceObservedStore(workspaceDir);

  store.writeCollection("personas", [{ id: "assistant" }]);

  const expectedPath = path.join(workspaceDir, ".claw", "observed", "relay", "personas.json");
  assert.equal(fs.existsSync(expectedPath), true);
  assert.deepEqual(store.readCollection("personas"), [{ id: "assistant" }]);
});
