import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { SessionStore } from "../sessions/store.ts";
import { resolveClawWorkspaceSurfacePath } from "../surface-paths.ts";
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

test("ChannelRunStore fails closed for corrupt or invalid persisted state", () => {
  const { workspaceDir, sessions, runs } = fixture();
  const statePath = resolveClawWorkspaceSurfacePath("claw.workspace.channel_runs_state", workspaceDir);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const session = sessions.createSession("Telegram corrupt state");
  const target = {
    provider: "telegram",
    accountId: "test-account",
    targetId: "test-chat-corrupt",
    sessionId: session.sessionId,
  };

  const invalidShape = `${JSON.stringify({ schemaVersion: 1, runs: [] }, null, 2)}\n`;
  fs.writeFileSync(statePath, invalidShape);
  assert.throws(
    () => runs.resolveOrCreateChannelRun(target),
    /Invalid channel run state/,
  );
  assert.equal(fs.readFileSync(statePath, "utf8"), invalidShape);

  const corruptJson = "{\"schemaVersion\":1,";
  fs.writeFileSync(statePath, corruptJson);
  assert.throws(() => runs.resolveOrCreateChannelRun(target), SyntaxError);
  assert.equal(fs.readFileSync(statePath, "utf8"), corruptJson);
});

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

test("ChannelRunStore normalizes non-finite numeric options", () => {
  const { sessions, runs } = fixture();
  const session = sessions.createSession("Telegram numeric options");
  const run = runs.resolveOrCreateChannelRun({
    provider: "telegram",
    accountId: "test-account",
    targetId: "test-chat-003",
    sessionId: session.sessionId,
    options: {
      coalescingWindowMs: Number.NaN,
      compactionThresholdChars: Number.POSITIVE_INFINITY,
      maxRecentMessages: 2.9,
    },
  });

  assert.equal(run.coalescingWindowMs, 1_500);
  assert.equal(run.compactionThresholdChars, 32_000);
  assert.equal(run.maxRecentMessages, 2);

  sessions.appendMessage(session.sessionId, { role: "user", content: "alpha" });
  sessions.appendMessage(session.sessionId, { role: "assistant", content: "beta" });
  sessions.appendMessage(session.sessionId, { role: "user", content: "gamma" });
  const compacted = runs.compactChannelSession({
    runKey: run.runKey,
    sessionId: session.sessionId,
    maxRecentMessages: Number.NaN,
    maxSummaryChars: Number.POSITIVE_INFINITY,
    force: true,
  });

  assert.equal(compacted.compacted, true);
  assert.match(compacted.summary, /Earlier conversation summary/);
});
