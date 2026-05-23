import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { buildRuntimeApp } from "./app.ts";
import { RuntimeApiClient } from "./client.ts";
import { RuntimeServiceStore } from "./store.ts";

function tempRoot(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("RuntimeServiceStore records redacted queryable logs by session process subsystem level and time", () => {
  const rootDir = tempRoot("clawjs-runtime-logs-");
  const store = new RuntimeServiceStore(path.join(rootDir, "runtime.sqlite"));
  try {
    const oldLog = store.recordRuntimeLog({
      sessionId: "session-a",
      processId: 42,
      subsystem: "runtime.worker",
      level: "info",
      message: "started worker",
      recordedAt: 100,
    });
    const secretLog = store.recordRuntimeLog({
      sessionId: "session-a",
      processId: 42,
      subsystem: "runtime.worker",
      level: "error",
      message: "failed authorization=Bearer rawtoken api_key=sk-testsecret123456",
      recordedAt: 200,
      metadata: {
        token: "visible-secret",
        nested: { authorization: "Bearer raw" },
      },
    });
    store.recordRuntimeLog({
      sessionId: "session-b",
      processId: "99",
      subsystem: "runtime.other",
      level: "warning",
      message: "other session",
      recordedAt: 300,
    });

    assert.equal(secretLog.redacted, true);
    assert.equal(secretLog.message.includes("rawtoken"), false);
    assert.equal(secretLog.message.includes("sk-testsecret123456"), false);
    assert.deepEqual(secretLog.metadata, {
      token: "[REDACTED]",
      nested: { authorization: "[REDACTED]" },
    });

    assert.deepEqual(
      store.listRuntimeLogs({ sessionId: "session-a" }).map((log) => log.id),
      [secretLog.id, oldLog.id],
    );
    assert.deepEqual(
      store.listRuntimeLogs({ processId: 42, level: "error" }).map((log) => log.id),
      [secretLog.id],
    );
    assert.deepEqual(
      store.listRuntimeLogs({ subsystem: "runtime.worker", fromRecordedAt: 150, toRecordedAt: 250 }).map((log) => log.id),
      [secretLog.id],
    );

    const retention = store.pruneRuntimeLogs({ olderThan: 150 });
    assert.equal(retention.deleted, 1);
    assert.deepEqual(store.listRuntimeLogs({ sessionId: "session-a" }).map((log) => log.id), [secretLog.id]);
  } finally {
    store.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("runtime job events are mirrored into session-scoped runtime logs", () => {
  const rootDir = tempRoot("clawjs-runtime-job-logs-");
  const store = new RuntimeServiceStore(path.join(rootDir, "runtime.sqlite"));
  try {
    const job = store.createJob("distill", { sessionId: "session-job", token: "secret-token" });
    store.finishJob(job.id, false, "failed with password=hunter2");

    const logs = store.listRuntimeLogs({ sessionId: "session-job", jobId: job.id });
    assert.deepEqual(logs.map((log) => log.subsystem), ["runtime.jobs", "runtime.jobs"]);
    assert.deepEqual(logs.map((log) => log.level), ["error", "info"]);
    assert.equal(logs[0]?.message, "Failed distill job");
    assert.equal(JSON.stringify(logs).includes("hunter2"), false);
    assert.equal(JSON.stringify(logs).includes("secret-token"), false);
  } finally {
    store.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("runtime log API records lists and prunes bounded redacted log windows", async () => {
  const rootDir = tempRoot("clawjs-runtime-log-api-");
  const built = buildRuntimeApp({
    config: {
      dataDir: rootDir,
      dbPath: path.join(rootDir, "runtime.sqlite"),
      sharedSecret: "test-secret",
    },
  });
  try {
    await built.app.listen({ host: "127.0.0.1", port: 0 });
    const address = built.app.server.address();
    assert.equal(typeof address, "object");
    assert.ok(address);
    const client = new RuntimeApiClient({
      baseUrl: `http://127.0.0.1:${address.port}`,
      token: "test-secret",
    });

    const recorded = await client.recordRuntimeLog({
      sessionId: "session-api",
      processId: "proc-api",
      subsystem: "runtime.api",
      level: "warning",
      message: "diagnostic token=visible-secret",
      recordedAt: 500,
    });
    assert.equal(recorded.redacted, true);

    const listed = await client.listRuntimeLogs({
      sessionId: "session-api",
      subsystem: "runtime.api",
      fromRecordedAt: 400,
      limit: 10,
    });
    assert.equal(listed.source, "runtime.logs.query");
    assert.equal(listed.items.length, 1);
    assert.equal(listed.items[0]?.message.includes("visible-secret"), false);

    const pruned = await client.pruneRuntimeLogs({ olderThan: 600, subsystem: "runtime.api" });
    assert.equal(pruned.deleted, 1);
    assert.equal((await client.listRuntimeLogs({ sessionId: "session-api" })).items.length, 0);
  } finally {
    await built.app.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
