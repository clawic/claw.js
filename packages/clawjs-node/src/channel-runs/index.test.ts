import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { SessionStore } from "../sessions/store.ts";
import { ChannelRunStore, resolveChannelRunKey } from "./index.ts";

function fixture() {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-channel-runs-"));
  const sessions = new SessionStore(workspaceDir);
  return {
    workspaceDir,
    sessions,
    runs: new ChannelRunStore(workspaceDir, sessions),
  };
}

test("ChannelRunStore resolves state, queues deterministically, and compacts sessions", () => {
  const { sessions, runs } = fixture();
  const session = sessions.createSession("Telegram test");
  const target = { provider: "telegram", accountId: "test-account", targetId: "test-chat-001" };
  const run = runs.resolveOrCreateChannelRun({ ...target, sessionId: session.sessionId });
  assert.equal(run.runKey, resolveChannelRunKey(target));
  assert.equal(run.status, "idle");

  runs.processChannelRun({ runKey: run.runKey, sessionId: session.sessionId, phase: "start", runId: "run-1" });
  runs.enqueueChannelMessage(run.runKey, { id: "m2", providerMessageId: "2", content: "second" });
  runs.enqueueChannelMessage(run.runKey, { id: "m2-again", providerMessageId: "2", content: "second duplicate" });
  runs.enqueueChannelMessage(run.runKey, { id: "m3", providerMessageId: "3", content: "third" });
  assert.equal(runs.getChannelRunStatus(run.runKey)?.queue.length, 2);
  assert.equal(runs.getChannelRunStatus(run.runKey)?.status, "running");

  const drained = runs.drainQueuedChannelMessages(run.runKey);
  assert.deepEqual(drained.map((message) => message.content), ["second", "third"]);
  runs.processChannelRun({ runKey: run.runKey, sessionId: session.sessionId, phase: "succeed", runId: "run-1" });
  assert.equal(runs.getChannelRunStatus(run.runKey)?.status, "idle");

  sessions.appendMessage(session.sessionId, { role: "user", content: "alpha" });
  sessions.appendMessage(session.sessionId, { role: "assistant", content: "beta" });
  sessions.appendMessage(session.sessionId, { role: "user", content: "gamma" });
  const compacted = runs.compactChannelSession({ runKey: run.runKey, sessionId: session.sessionId, maxRecentMessages: 1, force: true });
  assert.equal(compacted.compacted, true);
  assert.match(compacted.summary, /Earlier conversation summary/);
  assert.equal(runs.getChannelRunStatus(run.runKey)?.summary, compacted.summary);
  assert.equal(sessions.getSession(session.sessionId)?.messages.some((message) => message.metadata?.source === "channel-run-compaction"), true);
});

test("ChannelRunStore records stop requests and failed recovery state", () => {
  const { sessions, runs } = fixture();
  const session = sessions.createSession("Telegram stop");
  const run = runs.resolveOrCreateChannelRun({
    provider: "telegram",
    accountId: "test-account",
    targetId: "test-chat-002",
    sessionId: session.sessionId,
  });
  runs.processChannelRun({ runKey: run.runKey, sessionId: session.sessionId, phase: "start", runId: "run-stop" });
  const stopped = runs.requestChannelRunStop(run.runKey);
  assert.equal(stopped?.status, "stopping");
  assert.equal(stopped?.stopRequestedRunId, "run-stop");

  runs.processChannelRun({ runKey: run.runKey, sessionId: session.sessionId, phase: "fail", runId: "run-stop", error: "runtime failed" });
  const failed = runs.getChannelRunStatus(run.runKey);
  assert.equal(failed?.status, "failed");
  assert.equal(failed?.lastError, "runtime failed");
});
