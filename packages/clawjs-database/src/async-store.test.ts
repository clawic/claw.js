import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import WebSocket from "ws";

import { AsyncDatabaseServiceStore } from "./async-store.ts";
import { buildDatabaseApp } from "./app.ts";

function tempRoot(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function adminToken(app: ReturnType<typeof buildDatabaseApp>["app"]): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/admin/bootstrap",
    payload: { email: "admin@test.local", password: "secret" },
  });
  assert.equal(response.statusCode, 200);
  return (response.json() as { accessToken: string }).accessToken;
}

test("AsyncDatabaseServiceStore serializes worker calls, reports errors, and closes", async () => {
  const rootDir = tempRoot("clawjs-database-worker-");
  const store = new AsyncDatabaseServiceStore(path.join(rootDir, "core.sqlite"), path.join(rootDir, "files"));
  try {
    await Promise.all([
      store.ensureNamespace({ id: "worker", displayName: "Worker" }),
      store.ensureNamespace({ id: "worker-two", displayName: "Worker Two" }),
    ]);
    assert.equal((await store.listNamespaces()).some((item) => item.id === "worker"), true);

    await assert.rejects(
      () => store.createCollection("missing", { name: "items", fields: [] }),
      /Namespace missing does not exist/,
    );
    const metrics = store.snapshotMetrics();
    assert.ok(metrics.operations.ensureNamespace.count >= 2);
    assert.equal(metrics.operations.createCollection.errors, 1);
  } finally {
    await store.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }

  await assert.rejects(
    () => store.listNamespaces(),
    /closed/,
  );
});

test("database HTTP listRecords is SQL-paged, rejects unsupported filters, and exposes metrics", async () => {
  const rootDir = tempRoot("clawjs-database-http-");
  const built = buildDatabaseApp({
    config: {
      dataDir: path.join(rootDir, "data"),
      dbPath: path.join(rootDir, "core.sqlite"),
      filesDir: path.join(rootDir, "files"),
      jwtSecret: "test-secret",
    },
  });
  const { app } = built;

  try {
    const token = await adminToken(app);
    const auth = { authorization: `Bearer ${token}` };
    const collectionResponse = await app.inject({
      method: "POST",
      url: "/v1/namespaces/main/collections",
      headers: auth,
      payload: {
        name: "worker_records",
        displayName: "Worker Records",
        fields: [
          { name: "status", type: "text" },
          { name: "rank", type: "number" },
        ],
      },
    });
    assert.equal(collectionResponse.statusCode, 201);

    for (let index = 0; index < 6; index += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/v1/namespaces/main/collections/worker_records/records",
        headers: auth,
        payload: { status: index % 2 === 0 ? "open" : "closed", rank: index },
      });
      assert.equal(response.statusCode, 201);
    }

    const filtered = await app.inject({
      method: "GET",
      url: `/v1/namespaces/main/collections/worker_records/records?filter=${encodeURIComponent(JSON.stringify({ status: "open" }))}&sort=rank&limit=2`,
      headers: auth,
    });
    assert.equal(filtered.statusCode, 200);
    const filteredBody = filtered.json() as { total: number; items: Array<{ status: string; rank: number }> };
    assert.equal(filteredBody.total, 3);
    assert.deepEqual(filteredBody.items.map((item) => item.rank), [0, 2]);

    const unsupported = await app.inject({
      method: "GET",
      url: `/v1/namespaces/main/collections/worker_records/records?filter=${encodeURIComponent(JSON.stringify({ status: ["open"] }))}`,
      headers: auth,
    });
    assert.equal(unsupported.statusCode, 400);

    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    assert.equal(typeof address, "object");
    assert.ok(address);
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/v1/realtime?token=${encodeURIComponent(token)}`);
    await new Promise<void>((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });
    const listPromise = app.inject({
      method: "GET",
      url: "/v1/namespaces/main/collections/worker_records/records?limit=500",
      headers: auth,
    });
    assert.equal(socket.readyState, WebSocket.OPEN);
    assert.equal((await listPromise).statusCode, 200);
    socket.close();

    const metrics = await app.inject({
      method: "GET",
      url: "/v1/storage/metrics",
      headers: auth,
    });
    assert.equal(metrics.statusCode, 200);
    assert.ok((metrics.json() as { storage: { operations: Record<string, { count: number }> } }).storage.operations.listRecords.count >= 2);
  } finally {
    await app.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
