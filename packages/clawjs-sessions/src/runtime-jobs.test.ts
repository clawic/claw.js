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

test("SessionsRuntimeJobStore redacts runtime events/logs and applies bounded retention", () => {
  const rootDir = tempRoot("clawjs-sessions-runtime-retention-");
  const store = new SessionsRuntimeJobStore(path.join(rootDir, "runtime.sqlite"));
  try {
    store.enqueueJob({
      id: "job-secret",
      kind: "sessions.import_codex",
      title: "Import",
      payload: { token: "secret-token-value", dir: "/tmp/codex" },
      scheduledAt: "2026-05-20T10:00:00.000Z",
    });
    assert.equal((store.getJob("job-secret")?.payloadJson as { token?: string }).token, "[REDACTED]");

    const [job] = store.claimJobs({ now: "2026-05-20T10:00:01.000Z", owner: "worker-a" });
    assert.ok(job);
    const failed = store.failJob("job-secret", {
      error: "request failed authorization=Bearer abc123secret",
      retry: false,
      updatedAt: "2026-05-20T10:00:02.000Z",
    });
    assert.equal(failed?.error?.includes("abc123secret"), false);

    store.recordEvent({
      kind: "runtime.audit",
      sessionId: "session-retention",
      target: "sessions",
      subsystem: "import",
      message: "called with token=visible-secret",
      metadata: { apiKey: "metadata-secret", nested: { password: "pw-secret" } },
      createdAt: "2026-05-20T10:00:03.000Z",
    });
    store.recordEvent({
      kind: "runtime.pinned",
      sessionId: "session-retention",
      target: "sessions",
      subsystem: "import",
      message: "keep old pinned",
      createdAt: "2026-05-20T10:00:04.000Z",
      pinned: true,
    });
    store.recordLog({
      sessionId: "session-retention",
      target: "sessions",
      subsystem: "diagnostic",
      message: "Bearer log-secret",
      metadata: { secret: "log-metadata-secret" },
      createdAt: "2026-05-20T10:00:05.000Z",
    });
    store.recordLog({
      sessionId: "session-retention",
      target: "sessions",
      subsystem: "diagnostic",
      message: "keep new",
      createdAt: "2026-05-23T10:00:00.000Z",
    });

    const serializedEvents = JSON.stringify(store.listEvents({ sessionId: "session-retention", limit: 10 }));
    assert.equal(serializedEvents.includes("visible-secret"), false);
    assert.equal(serializedEvents.includes("metadata-secret"), false);
    assert.equal(serializedEvents.includes("pw-secret"), false);
    assert.equal(store.listEvents({ sessionId: "session-retention", limit: 10 }).some((event) => event.redacted), true);

    const serializedLogs = JSON.stringify(store.listLogs({ sessionId: "session-retention", limit: 10 }));
    assert.equal(serializedLogs.includes("log-secret"), false);
    assert.equal(serializedLogs.includes("log-metadata-secret"), false);

    const dryRun = store.applyRetention({ now: "2026-05-23T10:00:00.000Z", maxAgeDays: 1, dryRun: true });
    assert.equal(dryRun.deleted.logs, 1);
    assert.equal(dryRun.deleted.jobs, 1);
    assert.equal(store.listLogs({ sessionId: "session-retention", limit: 10 }).length, 2);

    const retention = store.applyRetention({ now: "2026-05-23T10:00:00.000Z", maxAgeDays: 1 });
    assert.equal(retention.deleted.logs, 1);
    assert.equal(retention.deleted.jobs, 1);
    assert.equal(store.getJob("job-secret"), null);
    assert.deepEqual(store.listLogs({ sessionId: "session-retention", limit: 10 }).map((log) => log.message), ["keep new"]);
    assert.equal(store.listEvents({ sessionId: "session-retention", pinned: true }).length, 1);
    assert.equal(store.listEvents({ sessionId: "session-retention", pinned: false }).every((event) => event.createdAt >= "2026-05-22T10:00:00.000Z"), true);
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

test("runSessionsRuntimeJobs rebuilds projections by project with session budgets", async () => {
  const rootDir = tempRoot("clawjs-sessions-runtime-rebuild-all-");
  const runtimeDbPath = path.join(rootDir, "runtime.sqlite");
  const sessionsDbPath = path.join(rootDir, "sessions.sqlite");
  const projectPath = path.join(rootDir, "project-a");
  const sessions = new SessionsServiceStore(sessionsDbPath);
  try {
    sessions.createProject({ id: "project-a", path: projectPath, displayName: "Project A" });
    for (const id of ["session-a", "session-b", "session-other"]) {
      sessions.createSession({
        id,
        agent: "codex",
        title: id,
        projectId: id === "session-other" ? undefined : "project-a",
        projectPath: id === "session-other" ? undefined : projectPath,
      });
      sessions.appendSessionEvent({
        sessionId: id,
        turnId: `turn-${id}`,
        eventKind: "message",
        eventType: "event_msg.user_message",
        role: "user",
        timestamp: 10,
        sourceNativeId: `${id}:line:1`,
        payloadJson: { message: id },
        renderedSummary: id,
        searchableText: id,
      });
    }
  } finally {
    sessions.close();
  }
  const jobs = new SessionsRuntimeJobStore(runtimeDbPath);
  try {
    jobs.enqueueJob({
      id: "job-rebuild-project",
      kind: "sessions.rebuild_projections",
      resourceId: "project-a",
      payload: { projectId: "project-a", maxSessions: 1, batchSize: 1 },
      scheduledAt: "2026-05-23T10:00:00.000Z",
    });
  } finally {
    jobs.close();
  }

  const changed: string[] = [];
  const run = await runSessionsRuntimeJobs({
    runtimeDbPath,
    sessionsDbPath,
    maxJobs: 1,
    now: "2026-05-23T10:00:01.000Z",
    onSessionChanged: (event) => {
      changed.push(event.sessionId);
    },
  });
  assert.equal(run.completed, 1);
  assert.equal(run.items[0]?.kind, "sessions.rebuild_projections");
  const result = run.items[0]?.result as { sessionsProcessed: number; sessionIds: string[]; totalMatched: number; stopReason: string; nextOffset: number | null };
  assert.equal(result.sessionsProcessed, 1);
  assert.equal(result.totalMatched, 2);
  assert.equal(result.stopReason, "max_sessions");
  assert.equal(result.nextOffset, 1);
  assert.deepEqual(changed, result.sessionIds);

  const projected = new SessionsServiceStore(sessionsDbPath);
  try {
    assert.equal(result.sessionIds.every((id) => projected.getProjectionMeta(id)?.projectionStatus === "current"), true);
    assert.equal(projected.getProjectionMeta("session-other"), null);
  } finally {
    projected.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
