import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { buildSessionsApp } from "./app.ts";
import { SessionsServiceStore } from "./store.ts";

function tempRoot(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("hydrateSession returns a bounded recent window, visible turn summaries, and events only on demand", () => {
  const rootDir = tempRoot("clawjs-session-hydrate-");
  const store = new SessionsServiceStore(path.join(rootDir, "sessions.sqlite"));
  store.createSession({ id: "session-1", agent: "codex", title: "Hydrate" });
  for (let index = 0; index < 5; index += 1) {
    store.appendMessage({
      id: `message-${index}`,
      sessionId: "session-1",
      role: index % 2 === 0 ? "user" : "assistant",
      contentText: `message ${index}`,
      timestamp: index + 1,
    });
  }
  store.appendSessionEvent({
    sessionId: "session-1",
    turnId: "turn-visible",
    itemId: "message-3",
    eventKind: "message",
    eventType: "response_item.message",
    role: "assistant",
    timestamp: 10,
    sourceNativeId: "rollout::line:10",
    payloadJson: { type: "message", role: "assistant" },
    searchableText: "assistant visible",
    renderedSummary: "assistant visible",
  });
  store.appendSessionEvent({
    sessionId: "session-1",
    turnId: "turn-visible",
    eventKind: "tool_output",
    eventType: "response_item.function_call_output",
    timestamp: 11,
    sourceNativeId: "rollout::line:11",
    payloadJson: { output: "ok" },
    searchableText: "ok",
    renderedSummary: "ok",
  });
  store.rebuildSessionProjection("session-1");
  store.replaceSessionDynamicTools("session-1", [
    {
      position: 0,
      name: "read_thread_terminal",
      namespace: "computer-use",
      description: "Read terminal output",
      inputSchemaJson: { type: "object", properties: { maxLines: { type: "number" } } },
      deferLoading: false,
      source: "fixture",
    },
    {
      position: 1,
      name: "automation_update",
      namespace: "codex-cli",
      description: "Update automation",
      inputSchemaJson: { type: "object", properties: { prompt: { type: "string" } } },
      deferLoading: true,
      source: "fixture",
    },
  ]);

  const initial = store.hydrateSession({ sessionId: "session-1", messageLimit: 2 });
  assert.ok(initial);
  assert.deepEqual(initial.messages.map((message) => message.id), ["message-3", "message-4"]);
  assert.equal(initial.messageOffset, 3);
  assert.equal(initial.hasOlderMessages, true);
  assert.equal(initial.hasNewerMessages, false);
  assert.equal(initial.turnSummaries.length, 1);
  assert.equal(initial.turnSummaries[0]?.turnId, "turn-visible");
  assert.equal(initial.events, null);
  assert.equal(initial.eventsLoaded, false);
  assert.deepEqual(initial.dynamicTools.map((tool) => [tool.position, tool.name, tool.namespace, tool.deferLoading]), [
    [0, "read_thread_terminal", "computer-use", false],
    [1, "automation_update", "codex-cli", true],
  ]);
  assert.deepEqual(initial.dynamicTools[0]?.inputSchemaJson, { type: "object", properties: { maxLines: { type: "number" } } });
  assert.equal(initial.dynamicTools[1]?.inputSchemaJson, null);
  assert.equal(initial.fallbackRequired, false);

  const fullTools = store.listSessionDynamicTools("session-1", { includeDeferredSchemas: true });
  assert.deepEqual(fullTools[1]?.inputSchemaJson, { type: "object", properties: { prompt: { type: "string" } } });
  assert.equal(fullTools[0]?.schemaHash.length, 64);

  const expanded = store.hydrateSession({
    sessionId: "session-1",
    messageLimit: 2,
    includeEvents: true,
    eventTurnId: "turn-visible",
    eventLimit: 1,
  });
  assert.ok(expanded);
  assert.equal(expanded.eventsLoaded, true);
  assert.equal(expanded.events?.length, 1);
  assert.equal(expanded.events?.[0]?.turnId, "turn-visible");
  store.close();
});

test("sessions hydrate endpoint opens chat from sessions.sqlite with a bounded message window", async () => {
  const rootDir = tempRoot("clawjs-session-hydrate-api-");
  const { app } = buildSessionsApp({
    config: {
      sharedSecret: "test-secret",
      dataDir: path.join(rootDir, "data"),
      dbPath: path.join(rootDir, "sessions.sqlite"),
    },
  });
  try {
    const sessionResponse = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      headers: { authorization: "Bearer test-secret" },
      payload: { id: "session-api", agent: "codex", title: "API" },
    });
    assert.equal(sessionResponse.statusCode, 200);
    for (let index = 0; index < 4; index += 1) {
      const messageResponse = await app.inject({
        method: "POST",
        url: "/v1/sessions/session-api/messages",
        headers: { authorization: "Bearer test-secret" },
        payload: { role: "user", contentText: `api message ${index}`, timestamp: index + 1 },
      });
      assert.equal(messageResponse.statusCode, 200);
    }

    const hydrateResponse = await app.inject({
      method: "GET",
      url: "/v1/sessions/session-api/hydrate?messageLimit=2",
      headers: { authorization: "Bearer test-secret" },
    });
    assert.equal(hydrateResponse.statusCode, 200);
    const body = hydrateResponse.json() as {
      messages: Array<{ contentText: string }>;
      messageOffset: number;
      hasOlderMessages: boolean;
      events: unknown[] | null;
      fallbackRequired: boolean;
    };
    assert.deepEqual(body.messages.map((message) => message.contentText), ["api message 2", "api message 3"]);
    assert.equal(body.messageOffset, 2);
    assert.equal(body.hasOlderMessages, true);
    assert.equal(body.events, null);
    assert.equal(body.fallbackRequired, true);
  } finally {
    await app.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("sessions dynamic tools endpoint expands deferred schemas on demand", async () => {
  const rootDir = tempRoot("clawjs-session-dynamic-tools-api-");
  const dbPath = path.join(rootDir, "sessions.sqlite");
  const seed = new SessionsServiceStore(dbPath);
  try {
    seed.createSession({ id: "session-tools-api", agent: "codex", title: "Tools" });
    seed.replaceSessionDynamicTools("session-tools-api", [
      {
        position: 0,
        name: "automation_update",
        namespace: "codex-cli",
        description: "Update automation",
        inputSchemaJson: { type: "object", properties: { prompt: { type: "string" } } },
        deferLoading: true,
        source: "fixture",
      },
    ]);
  } finally {
    seed.close();
  }
  const { app } = buildSessionsApp({
    config: {
      sharedSecret: "test-secret",
      dataDir: path.join(rootDir, "data"),
      dbPath,
    },
  });
  try {
    const deferredResponse = await app.inject({
      method: "GET",
      url: "/v1/sessions/session-tools-api/dynamic-tools",
      headers: { authorization: "Bearer test-secret" },
    });
    assert.equal(deferredResponse.statusCode, 200);
    const deferredBody = JSON.parse(deferredResponse.body) as { items: Array<{ inputSchemaJson: unknown; schemaHash: string }> };
    assert.equal(deferredBody.items[0]?.inputSchemaJson, null);
    assert.equal(deferredBody.items[0]?.schemaHash.length, 64);

    const expandedResponse = await app.inject({
      method: "GET",
      url: "/v1/sessions/session-tools-api/dynamic-tools?includeDeferredSchemas=true",
      headers: { authorization: "Bearer test-secret" },
    });
    assert.equal(expandedResponse.statusCode, 200);
    const expandedBody = JSON.parse(expandedResponse.body) as { items: Array<{ inputSchemaJson: unknown }> };
    assert.deepEqual(expandedBody.items[0]?.inputSchemaJson, { type: "object", properties: { prompt: { type: "string" } } });
  } finally {
    await app.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("sessions projection rebuild endpoint rebuilds project-scoped windows with budgets", async () => {
  const rootDir = tempRoot("clawjs-session-projection-rebuild-api-");
  const dbPath = path.join(rootDir, "sessions.sqlite");
  const projectPath = path.join(rootDir, "project-a");
  const seed = new SessionsServiceStore(dbPath);
  try {
    seed.createProject({ id: "project-api", path: projectPath, displayName: "Project API" });
    for (const id of ["session-api-a", "session-api-b", "session-api-other"]) {
      seed.createSession({
        id,
        agent: "codex",
        title: id,
        projectId: id === "session-api-other" ? undefined : "project-api",
        projectPath: id === "session-api-other" ? undefined : projectPath,
      });
      seed.appendSessionEvent({
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
    seed.close();
  }

  const { app } = buildSessionsApp({
    config: {
      sharedSecret: "test-secret",
      dataDir: path.join(rootDir, "data"),
      dbPath,
    },
  });
  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/sessions/projection/rebuild",
      headers: { authorization: "Bearer test-secret" },
      payload: { projectId: "project-api", maxSessions: 1, batchSize: 1 },
    });
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body) as {
      sessionsProcessed: number;
      totalMatched: number;
      stopReason: string;
      nextOffset: number | null;
      sessionIds: string[];
    };
    assert.equal(body.sessionsProcessed, 1);
    assert.equal(body.totalMatched, 2);
    assert.equal(body.stopReason, "max_sessions");
    assert.equal(body.nextOffset, 1);

    const reopened = new SessionsServiceStore(dbPath);
    try {
      assert.equal(body.sessionIds.every((id) => reopened.getProjectionMeta(id)?.projectionStatus === "current"), true);
      assert.equal(reopened.getProjectionMeta("session-api-other"), null);
    } finally {
      reopened.close();
    }
  } finally {
    await app.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
