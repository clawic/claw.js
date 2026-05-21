import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { AsyncSessionsServiceStore } from "./async-store.ts";
import { buildSessionsApp } from "./app.ts";

function tempRoot(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("AsyncSessionsServiceStore serializes worker calls, reports errors, and closes", async () => {
  const rootDir = tempRoot("clawjs-sessions-worker-");
  const store = new AsyncSessionsServiceStore(path.join(rootDir, "sessions.sqlite"));
  try {
    const session = await store.createSession({ id: "session-1", agent: "codex", title: "Initial" });
    assert.equal(session.title, "Initial");

    await Promise.all([
      store.updateSessionTitle(session.id, "one"),
      store.updateSessionTitle(session.id, "two"),
    ]);
    assert.equal((await store.getSession(session.id))?.title, "two");

    await assert.rejects(
      () => store.createProject({ path: "" }),
      /project path cannot be empty/,
    );
    const metrics = store.snapshotMetrics();
    assert.equal(metrics.operations.createSession.count, 1);
    assert.equal(metrics.operations.updateSessionTitle.count, 2);
    assert.equal(metrics.operations.createProject.errors, 1);
  } finally {
    await store.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }

  await assert.rejects(
    () => store.getSession("session-1"),
    /closed/,
  );
});

test("sessions HTTP export is bounded and storage metrics stay available", async () => {
  const rootDir = tempRoot("clawjs-sessions-export-");
  const { app } = buildSessionsApp({
    config: {
      sharedSecret: "test-secret",
      dataDir: path.join(rootDir, "data"),
      dbPath: path.join(rootDir, "sessions.sqlite"),
    },
  });

  try {
    for (let index = 0; index < 3; index += 1) {
      const sessionResponse = await app.inject({
        method: "POST",
        url: "/v1/sessions",
        headers: { authorization: "Bearer test-secret" },
        payload: { id: `session-${index}`, agent: "codex", title: `Session ${index}`, createdAt: index + 1 },
      });
      assert.equal(sessionResponse.statusCode, 200);
      for (let message = 0; message < 3; message += 1) {
        const messageResponse = await app.inject({
          method: "POST",
          url: `/v1/sessions/session-${index}/messages`,
          headers: { authorization: "Bearer test-secret" },
          payload: { role: "user", contentText: `message ${message}`, timestamp: message + 1 },
        });
        assert.equal(messageResponse.statusCode, 200);
      }
    }

    const exportResponse = await app.inject({
      method: "GET",
      url: "/v1/sessions/export?limit=2&messageLimit=1",
      headers: { authorization: "Bearer test-secret" },
    });
    assert.equal(exportResponse.statusCode, 200);
    const exportBody = exportResponse.json() as { items: Array<{ messages: unknown[] }> };
    assert.equal(exportBody.items.length, 2);
    assert.equal(exportBody.items[0]?.messages.length, 1);

    const messagesResponse = await app.inject({
      method: "GET",
      url: "/v1/sessions/session-0/messages?limit=5000",
      headers: { authorization: "Bearer test-secret" },
    });
    assert.equal(messagesResponse.statusCode, 200);
    assert.equal((messagesResponse.json() as { items: unknown[] }).items.length, 3);

    const metricsResponse = await app.inject({
      method: "GET",
      url: "/v1/storage/metrics",
      headers: { authorization: "Bearer test-secret" },
    });
    assert.equal(metricsResponse.statusCode, 200);
    const metrics = metricsResponse.json() as { storage: { operations: Record<string, { count: number }> } };
    assert.ok(metrics.storage.operations.exportTrajectories.count >= 1);
  } finally {
    await app.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
