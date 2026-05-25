import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { test } from "vitest";

import { RuntimeServiceStore } from "./store.ts";

function tempRoot(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("runtime jobs tolerate malformed persisted payload JSON", () => {
  const rootDir = tempRoot("clawjs-runtime-jobs-");
  const dbPath = path.join(rootDir, "runtime.sqlite");
  const store = new RuntimeServiceStore(dbPath);
  const job = store.createJob("distill", { sessionId: "session-corrupt" });
  store.close();

  const db = new Database(dbPath);
  try {
    db.prepare("UPDATE runtime_jobs SET payload_json = ? WHERE id = ?").run("{interrupted-json", job.id);
  } finally {
    db.close();
  }

  const reopened = new RuntimeServiceStore(dbPath);
  try {
    const listed = reopened.listJobs();
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.id, job.id);
    assert.equal(listed[0]?.payload, null);

    assert.equal(reopened.getJob(job.id)?.payload, null);
    assert.equal(reopened.finishJob(job.id, true)?.status, "completed");
    assert.deepEqual(
      reopened.listJobEvents({ jobId: job.id }).map((event) => event.kind),
      ["job.started", "job.completed"],
    );
  } finally {
    reopened.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
