import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { SearchStore, createBuiltinSearchSourceManifests } from "../../clawjs-search/src/index.ts";

import { indexSessionsForSearch } from "./search-indexer.ts";
import { SessionsServiceStore } from "./store.ts";

function tempRoot(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("indexSessionsForSearch indexes messages and structured events with session facets", () => {
  const rootDir = tempRoot("clawjs-session-search-index-");
  const sessionsStore = new SessionsServiceStore(path.join(rootDir, "sessions.sqlite"));
  const searchStore = new SearchStore(path.join(rootDir, "search.sqlite"));
  try {
    for (const manifest of createBuiltinSearchSourceManifests()) searchStore.registerSource(manifest);
    sessionsStore.createProject({ id: "project-1", path: path.join(rootDir, "project"), displayName: "Project" });
    sessionsStore.createSession({
      id: "session-1",
      agent: "codex",
      runtime: "codex-cli",
      projectId: "project-1",
      title: "Searchable session",
    });
    sessionsStore.appendMessage({
      id: "message-1",
      sessionId: "session-1",
      role: "user",
      contentText: "visible transcript needle authorization=Bearer searchsecret token=hidden-token",
      timestamp: 10,
    });
    sessionsStore.appendMessage({
      id: "message-2",
      sessionId: "session-1",
      role: "assistant",
      contentText: "visible transcript needle later",
      timestamp: 30,
    });
    sessionsStore.appendSessionEvent({
      sessionId: "session-1",
      turnId: "turn-1",
      callId: "call-1",
      eventKind: "tool_output",
      eventType: "response_item.function_call_output",
      timestamp: 20,
      sourceNativeId: "rollout::line:20",
      payloadJson: { name: "exec_command", status: "failed", output: "diagnostic boom" },
      renderedSummary: "diagnostic boom",
      searchableText: "diagnostic boom exit code 1",
    });
    sessionsStore.appendSessionEvent({
      sessionId: "session-1",
      turnId: "turn-1",
      eventKind: "patch",
      eventType: "event_msg.patch_apply_end",
      timestamp: 21,
      sourceNativeId: "rollout::line:21",
      payloadJson: { status: "success" },
      renderedSummary: "patched file",
      searchableText: "patched file",
    });

    const result = indexSessionsForSearch({ sessionsStore, searchStore, batchSize: 2 });

    assert.deepEqual(result, {
      sessionsIndexed: 1,
      messagesIndexed: 2,
      eventsIndexed: 2,
      documentsIndexed: 4,
    });

    const chatSearch = searchStore.query({
      query: "needle",
      sources: ["sessions.chats"],
      filters: { sessionId: "session-1", role: "user" },
    });
    assert.equal(chatSearch.results.length, 1);
    assert.equal(chatSearch.results[0]?.source, "sessions.chats");
    assert.equal(JSON.stringify(chatSearch.results[0]).includes("searchsecret"), false);
    assert.equal(JSON.stringify(chatSearch.results[0]).includes("hidden-token"), false);
    assert.equal(chatSearch.results[0]?.permissions?.redacted, true);

    const secretSearch = searchStore.query({
      query: "searchsecret",
      sources: ["sessions.chats"],
    });
    assert.equal(secretSearch.results.length, 0);

    const dateRangeSearch = searchStore.query({
      query: "needle",
      sources: ["sessions.chats"],
      filters: { dateRange: { from: new Date(20).toISOString() } },
    });
    assert.deepEqual(dateRangeSearch.results.map((result) => result.id), ["sessions.chats:message-2"]);

    const failedToolSearch = searchStore.query({
      query: "boom",
      sources: ["sessions.events"],
      filters: { eventKind: "tool_output", hasFailedTool: true },
    });
    assert.equal(failedToolSearch.results.length, 1);
    assert.equal(failedToolSearch.results[0]?.metadata?.eventKind, "tool_output");
    assert.equal(failedToolSearch.results[0]?.metadata?.hasFailedTool, true);

    const patchSearch = searchStore.query({
      query: "patched",
      sources: ["sessions.events"],
      filters: { hasDiff: true, eventType: "event_msg.patch_apply_end" },
    });
    assert.equal(patchSearch.results.length, 1);

    const facets = searchStore.query({ query: "boom", sources: ["sessions.events"] }).facets ?? [];
    assert.equal(facets.some((facet) => facet.id === "eventKind"), true);
  } finally {
    sessionsStore.close();
    searchStore.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
