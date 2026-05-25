import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "vitest";

import Database from "better-sqlite3";

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

test("forget tolerates corrupt user model history snapshots", () => {
  const { store, dbPath } = openTempStoreWithPath();
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

    store.commitSnapshot({ reason: "before_corruption" });

    const db = new Database(dbPath);
    try {
      db.prepare(
        "INSERT INTO user_profile_history (snapshot_json, snapshot_at, reason) VALUES (?, ?, ?)",
      ).run("{interrupted-json", Date.now() + 1, "interrupted_write");
    } finally {
      db.close();
    }

    const result = store.forget({ ids: [sensitive.id] });

    assert.deepEqual(result, { forgottenCount: 1, forgottenIds: [sensitive.id] });
    assert.equal(countHistoryRows(dbPath), 1);
    const history = store.listHistory(10);
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
  return openTempStoreWithPath().store;
}

function openTempStoreWithPath(): { store: UserModelServiceStore; dbPath: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-user-model-store-"));
  tempRoots.push(root);
  const dbPath = path.join(root, "core.sqlite");
  return { store: new UserModelServiceStore(dbPath), dbPath };
}

function countHistoryRows(dbPath: string): number {
  const db = new Database(dbPath);
  try {
    const row = db.prepare("SELECT COUNT(*) AS count FROM user_profile_history").get() as { count: number };
    return row.count;
  } finally {
    db.close();
  }
}
