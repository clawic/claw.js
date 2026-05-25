import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { SessionsServiceStore } from "./store.ts";

function tempRoot(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("deep message search accepts bounded result pages", () => {
  const rootDir = tempRoot("clawjs-search-pagination-");
  const store = new SessionsServiceStore(path.join(rootDir, "sessions.sqlite"));
  try {
    store.createSession({ id: "session-search", agent: "codex", title: "Search", createdAt: 1 });
    for (let index = 0; index < 6; index += 1) {
      store.appendMessage({
        id: `message-${index}`,
        sessionId: "session-search",
        role: "user",
        contentText: `needle page ${index}`,
        timestamp: index + 1,
      });
    }

    const firstPage = store.searchMessages({ query: "needle", limit: 2, offset: 0 });
    const secondPage = store.searchMessages({ query: "needle", limit: 2, offset: 2 });

    assert.equal(firstPage.length, 2);
    assert.equal(secondPage.length, 2);
    assert.equal(new Set(firstPage.map((hit) => hit.message.id)).size, 2);
    assert.equal(new Set(secondPage.map((hit) => hit.message.id)).size, 2);
    assert.deepEqual(
      firstPage.filter((hit) => secondPage.some((nextHit) => nextHit.message.id === hit.message.id)),
      [],
    );
  } finally {
    store.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("deep event search accepts bounded result pages", () => {
  const rootDir = tempRoot("clawjs-event-search-pagination-");
  const store = new SessionsServiceStore(path.join(rootDir, "sessions.sqlite"));
  try {
    store.createSession({ id: "session-events", agent: "codex", title: "Events", createdAt: 1 });
    for (let index = 0; index < 6; index += 1) {
      store.appendSessionEvent({
        sessionId: "session-events",
        turnId: "turn-search",
        eventKind: "tool_output",
        eventType: "response_item.function_call_output",
        timestamp: index + 1,
        sourceNativeId: `fixture-${index}`,
        sourceLine: index + 1,
        payloadJson: { index },
        renderedSummary: `needle event ${index}`,
        searchableText: `needle event ${index}`,
      });
    }

    const firstPage = store.searchSessionEvents({ query: "needle", limit: 2, offset: 0 });
    const secondPage = store.searchSessionEvents({ query: "needle", limit: 2, offset: 2 });

    assert.equal(firstPage.length, 2);
    assert.equal(secondPage.length, 2);
    assert.equal(new Set(firstPage.map((hit) => hit.event.id)).size, 2);
    assert.equal(new Set(secondPage.map((hit) => hit.event.id)).size, 2);
    assert.deepEqual(
      firstPage.filter((hit) => secondPage.some((nextHit) => nextHit.event.id === hit.event.id)),
      [],
    );
  } finally {
    store.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("structured event search uses redacted projection text", () => {
  const rootDir = tempRoot("clawjs-event-search-redaction-");
  const store = new SessionsServiceStore(path.join(rootDir, "sessions.sqlite"));
  try {
    store.createSession({ id: "session-redaction", agent: "codex", title: "Redaction", createdAt: 1 });
    const event = store.appendSessionEvent({
      sessionId: "session-redaction",
      turnId: "turn-redaction",
      eventKind: "tool_output",
      eventType: "response_item.function_call_output",
      timestamp: 2,
      sourceNativeId: "fixture-redaction",
      sourceLine: 1,
      payloadJson: { output: "token=eventsecret needle" },
      renderedSummary: "authorization: Bearer legacysecret needle",
      searchableText: "tool output token=eventsecret needle",
    });

    assert.equal(event.searchableText?.includes("eventsecret"), false);
    assert.equal(event.renderedSummary?.includes("legacysecret"), false);
    assert.equal(store.searchSessionEvents({ query: "eventsecret" }).length, 0);

    const hits = store.searchSessionEvents({ query: "needle" });
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.snippet.includes("eventsecret"), false);
    assert.equal(hits[0]?.event.searchableText?.includes("eventsecret"), false);
  } finally {
    store.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
