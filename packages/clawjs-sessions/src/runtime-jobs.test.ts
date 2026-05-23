import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { SessionsRuntimeJobStore, runSessionsRuntimeJobs } from "./runtime-jobs.ts";
import { SessionsServiceStore } from "./store.ts";

const THREAD_ID = ["019e2b9c", "runtime", "4555", "9666", "777777777777"].join("-");

function tempRoot(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeRollout(rootDir: string, threadId: string, message: string): string {
  const dir = path.join(rootDir, "2026", "05", "23");
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `rollout-2026-05-23T10-00-00-${threadId}.jsonl`);
  fs.writeFileSync(filePath, [
    JSON.stringify({
      timestamp: "2026-05-23T10:00:00.000Z",
      type: "session_meta",
      payload: {
        id: threadId,
        timestamp: "2026-05-23T10:00:00.000Z",
        cwd: rootDir,
        originator: "codex-cli",
      },
    }),
    JSON.stringify({
      timestamp: "2026-05-23T10:00:01.000Z",
      type: "event_msg",
      payload: {
        type: "user_message",
        message,
        turn_id: "turn-1",
      },
    }),
    "",
  ].join("\n"));
  return filePath;
}

test("SessionsRuntimeJobStore claims jobs with leases and retries expired leases", () => {
  const rootDir = tempRoot("clawjs-sessions-runtime-jobs-");
  const store = new SessionsRuntimeJobStore(path.join(rootDir, "runtime.sqlite"));
  try {
    store.enqueueJob({
      id: "job-import",
      kind: "sessions.import_codex",
      title: "Import",
      priority: 10,
      payload: { dir: path.join(rootDir, "codex") },
      scheduledAt: "2026-05-23T10:00:00.000Z",
    });

    const firstClaim = store.claimJobs({ now: "2026-05-23T10:00:01.000Z", leaseMs: 5_000, owner: "worker-a" });
    assert.equal(firstClaim.length, 1);
    assert.equal(firstClaim[0]?.status, "leased");
    assert.equal(firstClaim[0]?.attempts, 1);
    assert.equal(firstClaim[0]?.claimOwner, "worker-a");

    assert.equal(store.claimJobs({ now: "2026-05-23T10:00:02.000Z", owner: "worker-b" }).length, 0);
    const expiredClaim = store.claimJobs({ now: "2026-05-23T10:00:06.000Z", leaseMs: 5_000, owner: "worker-b" });
    assert.equal(expiredClaim.length, 1);
    assert.equal(expiredClaim[0]?.attempts, 2);
    assert.equal(expiredClaim[0]?.claimOwner, "worker-b");

    const failed = store.failJob("job-import", {
      error: "temporary",
      retry: true,
      scheduledAt: "2026-05-23T10:01:00.000Z",
      updatedAt: "2026-05-23T10:00:07.000Z",
    });
    assert.equal(failed?.status, "queued");
    assert.equal(failed?.error, "temporary");
    assert.equal(store.claimJobs({ now: "2026-05-23T10:00:30.000Z" }).length, 0);
    assert.equal(store.claimJobs({ now: "2026-05-23T10:01:01.000Z" }).length, 1);
  } finally {
    store.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("runSessionsRuntimeJobs processes import and projection jobs with budgets", async () => {
  const rootDir = tempRoot("clawjs-sessions-runtime-runner-");
  const runtimeDbPath = path.join(rootDir, "runtime.sqlite");
  const sessionsDbPath = path.join(rootDir, "sessions.sqlite");
  const codexDir = path.join(rootDir, "codex-sessions");
  writeRollout(codexDir, THREAD_ID, "runtime job import needle");
  const jobs = new SessionsRuntimeJobStore(runtimeDbPath);
  try {
    jobs.enqueueJob({
      id: "job-import",
      kind: "sessions.import_codex",
      title: "Import Codex",
      priority: 20,
      payload: { dir: codexDir, maxFiles: 1 },
      scheduledAt: "2026-05-23T10:00:00.000Z",
    });
    jobs.enqueueJob({
      id: "job-project",
      kind: "sessions.rebuild_projection",
      title: "Rebuild projection",
      resourceId: THREAD_ID,
      priority: 10,
      scheduledAt: "2026-05-23T10:00:00.000Z",
    });
  } finally {
    jobs.close();
  }

  const firstRun = await runSessionsRuntimeJobs({
    runtimeDbPath,
    sessionsDbPath,
    maxJobs: 1,
    now: "2026-05-23T10:00:01.000Z",
  });
  assert.equal(firstRun.claimed, 1);
  assert.equal(firstRun.completed, 1);
  assert.equal(firstRun.stopReason, "max_jobs");
  assert.equal(firstRun.items[0]?.id, "job-import");

  const secondRun = await runSessionsRuntimeJobs({
    runtimeDbPath,
    sessionsDbPath,
    maxJobs: 5,
    now: "2026-05-23T10:00:02.000Z",
  });
  assert.equal(secondRun.claimed, 1);
  assert.equal(secondRun.completed, 1);
  assert.equal(secondRun.stopReason, "drained");
  assert.equal(secondRun.items[0]?.id, "job-project");

  const sessions = new SessionsServiceStore(sessionsDbPath);
  try {
    assert.equal(sessions.getSessionWithMessages(THREAD_ID)?.messages[0]?.contentText, "runtime job import needle");
    assert.equal(sessions.getProjectionMeta(THREAD_ID)?.projectionStatus, "current");
    assert.equal(sessions.listTurnSummaries(THREAD_ID)[0]?.turnId, "turn-1");
  } finally {
    sessions.close();
  }

  const finalJobs = new SessionsRuntimeJobStore(runtimeDbPath);
  try {
    assert.deepEqual(finalJobs.listJobs({ status: "done" }).map((job) => job.id), ["job-import", "job-project"]);
  } finally {
    finalJobs.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
