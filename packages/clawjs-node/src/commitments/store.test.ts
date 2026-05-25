import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { createCommitmentStore } from "./store.ts";

function tempWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-commitments-store-"));
}

test("commitment store rejects corrupt persisted JSON instead of resetting state", () => {
  const workspaceDir = tempWorkspace();
  const store = createCommitmentStore({ workspaceDir });

  assert.deepEqual(store.readState().commitments, []);

  const first = store.add({
    claim: "I will follow up with the validation result.",
    kind: "follow_up",
    ownerAgentId: "agent-1",
    beneficiaryUserId: "user-1",
  });
  assert.equal(store.get(first.id)?.id, first.id);

  fs.writeFileSync(store.statePath, "{bad-json", "utf8");

  assert.throws(() => store.add({
    claim: "I will send a second status update.",
    kind: "delivery",
    ownerAgentId: "agent-1",
    beneficiaryUserId: "user-1",
  }), /Invalid commitment state JSON/);
  assert.equal(fs.readFileSync(store.statePath, "utf8"), "{bad-json");
});
