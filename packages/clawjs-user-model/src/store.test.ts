import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "vitest";

import { UserModelServiceStore } from "./store.ts";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("forget removes matching user model items from historical snapshots", () => {
  const store = openTempStore();
  try {
    const sensitive = store.upsertItem({
      id: "pref-sensitive",
      section: "preference",
      contentText: "User prefers private invoice routing",
      topic: "billing",
    });
    const retained = store.upsertItem({
      id: "pref-retained",
      section: "preference",
      contentText: "User prefers concise summaries",
      topic: "summary",
    });

    store.commitSnapshot({ reason: "before_forget" });

    const result = store.forget({ ids: [sensitive.id] });

    assert.deepEqual(result, { forgottenCount: 1, forgottenIds: [sensitive.id] });
    const history = store.listHistory(1);
    assert.equal(history.length, 1);
    assert.deepEqual(
      history[0]?.snapshot.items.map((item) => item.id).sort(),
      [retained.id],
    );
  } finally {
    store.close();
  }
});

function openTempStore(): UserModelServiceStore {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-user-model-store-"));
  tempRoots.push(root);
  return new UserModelServiceStore(path.join(root, "core.sqlite"));
}
