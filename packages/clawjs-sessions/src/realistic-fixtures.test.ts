import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { buildRealisticSessionsFixtureCorpus, seedRealisticSessionsFixture } from "./realistic-fixtures.ts";
import { SessionsServiceStore } from "./store.ts";

function tempRoot(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("realistic sessions fixture covers long chats, attachments, markdown, provider errors, and recoverable corruptions", () => {
  const rootDir = tempRoot("clawjs-realistic-sessions-");
  const store = new SessionsServiceStore(path.join(rootDir, "sessions.sqlite"));
  try {
    const result = seedRealisticSessionsFixture(store, {
      profile: "smoke",
      projectCount: 4,
      sessionCount: 12,
      longSessionMessageCount: 42,
      workspaceRoot: path.join(rootDir, "workspace"),
    });

    assert.equal(result.fixtureSetId, "realistic-sessions-v1");
    assert.equal(result.projectsSeeded, 4);
    assert.equal(result.sessionsSeeded, 12);
    assert.ok(result.messagesSeeded >= 120);
    assert.ok(result.coverage.longChats > 0);
    assert.ok(result.coverage.conversationsWithAttachments > 0);
    assert.ok(result.coverage.markdownHeavyMessages > 0);
    assert.ok(result.coverage.toolEvents > 0);
    assert.ok(result.coverage.providerErrors > 0);
    assert.ok(result.coverage.recoverableCorruptions > 0);

    const sidebar = store.sidebarBootstrap({ recentLimit: 20 });
    assert.equal(sidebar.projects.length, 4);
    assert.ok(sidebar.recent.length > 0);
    assert.ok(sidebar.totalActiveVisible >= 12);

    const longSession = store.getSessionWithMessages("fixture_session_0008", 100);
    assert.ok(longSession);
    assert.equal(longSession.session.messageCount, 42);
    assert.equal(longSession.messages.some((message) => message.streamingState === "interrupted"), true);

    const attachmentHit = store.searchMessages({ query: "attached screenshot", limit: 10 });
    assert.ok(attachmentHit.some((hit) => (hit.message.attachments?.length ?? 0) >= 3));

    const markdownHit = store.searchMessages({ query: "Regression Packet", limit: 10 });
    assert.ok(markdownHit.some((hit) => hit.message.contentText.includes("| Surface | Expected | Evidence |")));

    const providerErrors = store.searchSessionEvents({ query: "mock provider error", eventKind: "tool_output", limit: 20 });
    assert.ok(providerErrors.length > 0);
    assert.ok(providerErrors.some((hit) => hit.event.payloadJson && typeof hit.event.payloadJson === "object"));

    const staleId = result.staleProjectionSessionIds[0];
    assert.ok(staleId);
    const staleMeta = store.getProjectionMeta(staleId);
    assert.equal(staleMeta?.projectionStatus, "stale");
    assert.match(staleMeta?.staleReason ?? "", /recoverable fixture corruption/);
  } finally {
    store.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("realistic sessions fixture generation is deterministic enough for screenshots and regressions", () => {
  const first = buildRealisticSessionsFixtureCorpus({ profile: "smoke", projectCount: 2, sessionCount: 3, longSessionMessageCount: 24 });
  const second = buildRealisticSessionsFixtureCorpus({ profile: "smoke", projectCount: 2, sessionCount: 3, longSessionMessageCount: 24 });

  assert.deepEqual(first.projects, second.projects);
  assert.deepEqual(first.sessions, second.sessions);
  assert.deepEqual(first.messages.slice(0, 12), second.messages.slice(0, 12));
  assert.deepEqual(first.events.slice(0, 12), second.events.slice(0, 12));
});

test("large realistic sessions fixture represents thousands of synthetic conversations", () => {
  const corpus = buildRealisticSessionsFixtureCorpus({ profile: "large" });

  assert.equal(corpus.fixtureSetId, "realistic-sessions-v1");
  assert.equal(corpus.sessions.length, 2_000);
  assert.ok(corpus.messages.length > 20_000);
  assert.ok(corpus.events.length > corpus.messages.length);
  assert.ok(corpus.coverage.longChats > 100);
  assert.ok(corpus.coverage.conversationsWithAttachments > 100);
  assert.ok(corpus.coverage.markdownHeavyMessages > 1_000);
  assert.ok(corpus.coverage.toolEvents > 1_000);
  assert.ok(corpus.coverage.providerErrors > 100);
  assert.ok(corpus.coverage.recoverableCorruptions > 100);
});
