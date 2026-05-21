import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { SessionsServiceStore } from "./store.ts";

test("sessions store keeps final text searchable while preserving compact stream trace metadata", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-sessions-stream-trace-"));
  const store = new SessionsServiceStore(path.join(rootDir, "sessions.sqlite"));
  try {
    const session = store.createSession({
      id: "session-stream-trace",
      agent: "codex",
      title: "Streaming trace",
    });
    const message = store.appendMessage({
      sessionId: session.id,
      role: "assistant",
      contentText: "",
      streamingState: "streaming",
      timeline: [{ kind: "turn.started", at: 1 }],
    });
    const trace = {
      kind: "assistant_stream_trace",
      schemaVersion: 1,
      coalesceMs: 16,
      finalLength: "final streamed answer".length,
      deltas: [
        { offset: 0, length: 6, text: "final ", at: 2 },
        { offset: 6, length: 15, text: "streamed answer", at: 3 },
      ],
    };

    const updated = store.updateMessage(message.id, {
      contentText: "final streamed answer",
      streamingState: "complete",
      timeline: [...(message.timeline ?? []), trace, { kind: "turn.finished", at: 4 }],
    });

    assert.equal(updated?.contentText, "final streamed answer");
    assert.equal(updated?.streamingState, "complete");
    assert.deepEqual((updated?.timeline?.[1] as { deltas?: Array<{ text: string }> }).deltas?.map((delta) => delta.text), ["final ", "streamed answer"]);

    const hits = store.searchMessages({ query: "streamed" });
    assert.equal(hits[0]?.message.id, message.id);
    assert.equal(hits[0]?.message.contentText, "final streamed answer");
  } finally {
    store.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
