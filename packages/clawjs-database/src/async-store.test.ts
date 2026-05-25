import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import WebSocket from "ws";

import type { AuthPrincipal } from "./auth.ts";
import { AsyncDatabaseServiceStore } from "./async-store.ts";
import { buildDatabaseApp } from "./app.ts";
import { loadDatabaseConfig } from "./config.ts";
import { RealtimeHub } from "./realtime.ts";
import { DatabaseServiceStore } from "./store.ts";
import { StorageMetrics } from "./storage-metrics.ts";
import type { RecordChangeEvent } from "./types.ts";

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

class StalledStoreWorker {
  readonly messages: unknown[] = [];
  terminated = false;

  postMessage(message: unknown): void {
    this.messages.push(message);
  }

  async terminate(): Promise<number> {
    this.terminated = true;
    return 0;
  }
}

function asyncStoreWithWorker(worker: StalledStoreWorker): AsyncDatabaseServiceStore {
  return Object.assign(Object.create(AsyncDatabaseServiceStore.prototype), {
    worker,
    pending: new Map(),
    metrics: new StorageMetrics(),
    nextId: 1,
    queueDepth: 0,
    closed: false,
    serial: Promise.resolve(),
  }) as AsyncDatabaseServiceStore;
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

test("AsyncDatabaseServiceStore rejects in-flight and queued calls when closed", async () => {
  const worker = new StalledStoreWorker();
  const store = asyncStoreWithWorker(worker);
  const callStore = store as unknown as {
    call<T>(operation: string, ...args: unknown[]): Promise<T>;
  };

  const inFlight = callStore.call("createRecord", "main", "items", { title: "queued" });
  const queued = callStore.call("updateRecord", "main", "items", "record-1", { title: "after-close" });
  const inFlightSettled = inFlight.then(
    () => "fulfilled",
    (error: Error) => error,
  );
  const queuedSettled = queued.then(
    () => "fulfilled",
    (error: Error) => error,
  );

  await Promise.resolve();
  assert.equal(worker.messages.length, 1);

  await store.close();

  const inFlightResult = await inFlightSettled;
  const queuedResult = await queuedSettled;
  assert.match(String(inFlightResult), /database store worker is closed/);
  assert.match(String(queuedResult), /database store worker is closed/);
  assert.equal(worker.terminated, true);
  assert.equal(worker.messages.length, 1);
  assert.equal(store.snapshotMetrics().queueDepth, 0);
});

test("AsyncDatabaseServiceStore saves file uploads from managed temp paths", async () => {
  const rootDir = tempRoot("clawjs-database-worker-file-");
  const filesDir = path.join(rootDir, "files");
  const store = new AsyncDatabaseServiceStore(path.join(rootDir, "core.sqlite"), filesDir);
  const tempDir = path.join(filesDir, ".tmp", "uploads");
  const tempPath = path.join(tempDir, "worker-upload.tmp");
  try {
    await store.ensureNamespace({ id: "worker-files", displayName: "Worker Files" });
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(tempPath, "worker file");

    const asset = await store.saveFileFromPath({
      namespaceId: "worker-files",
      filename: "worker.txt",
      contentType: "text/plain",
      tempPath,
      sizeBytes: Buffer.byteLength("worker file"),
    });

    assert.equal(asset.sizeBytes, Buffer.byteLength("worker file"));
    assert.equal(fs.existsSync(tempPath), false);
    const saved = await store.getFile(asset.id);
    assert.ok(saved);
    assert.equal(fs.readFileSync(saved.storagePath, "utf8"), "worker file");
  } finally {
    await store.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("DatabaseApiClient uploadFile keeps file paths off readFileSync", () => {
  const source = fs.readFileSync(new URL("./client.ts", import.meta.url), "utf8");
  assert.equal(source.includes("fs.readFileSync(input.filePath)"), false);
  assert.match(source, /fs\.createReadStream\(input\.filePath\)/);
});

test("loadDatabaseConfig reads realtime backpressure limits from env", () => {
  const previousMaxClients = process.env.CLAW_DATABASE_REALTIME_MAX_CLIENTS;
  const previousMaxSubscriptions = process.env.CLAW_DATABASE_REALTIME_MAX_SUBSCRIPTIONS;
  const previousQueueLimit = process.env.CLAW_DATABASE_REALTIME_QUEUE_LIMIT;
  const previousMaxBuffered = process.env.CLAW_DATABASE_REALTIME_MAX_BUFFERED_BYTES;
  try {
    process.env.CLAW_DATABASE_REALTIME_MAX_CLIENTS = "7";
    process.env.CLAW_DATABASE_REALTIME_MAX_SUBSCRIPTIONS = "11";
    process.env.CLAW_DATABASE_REALTIME_QUEUE_LIMIT = "13";
    process.env.CLAW_DATABASE_REALTIME_MAX_BUFFERED_BYTES = "2048";
    const config = loadDatabaseConfig();
    assert.equal(config.realtimeMaxClients, 7);
    assert.equal(config.realtimeMaxSubscriptionsPerClient, 11);
    assert.equal(config.realtimeMaxQueuedMessagesPerClient, 13);
    assert.equal(config.realtimeMaxBufferedBytesPerClient, 2048);
  } finally {
    if (previousMaxClients === undefined) delete process.env.CLAW_DATABASE_REALTIME_MAX_CLIENTS;
    else process.env.CLAW_DATABASE_REALTIME_MAX_CLIENTS = previousMaxClients;
    if (previousMaxSubscriptions === undefined) delete process.env.CLAW_DATABASE_REALTIME_MAX_SUBSCRIPTIONS;
    else process.env.CLAW_DATABASE_REALTIME_MAX_SUBSCRIPTIONS = previousMaxSubscriptions;
    if (previousQueueLimit === undefined) delete process.env.CLAW_DATABASE_REALTIME_QUEUE_LIMIT;
    else process.env.CLAW_DATABASE_REALTIME_QUEUE_LIMIT = previousQueueLimit;
    if (previousMaxBuffered === undefined) delete process.env.CLAW_DATABASE_REALTIME_MAX_BUFFERED_BYTES;
    else process.env.CLAW_DATABASE_REALTIME_MAX_BUFFERED_BYTES = previousMaxBuffered;
  }
});

test("DatabaseServiceStore materializes record indexes for list filters and unique constraints", () => {
  const rootDir = tempRoot("clawjs-database-record-indexes-");
  const store = new DatabaseServiceStore(path.join(rootDir, "core.sqlite"), path.join(rootDir, "files"));
  try {
    store.createCollection("main", {
      name: "indexed_records",
      displayName: "Indexed Records",
      fields: [
        { name: "status", type: "text" },
        { name: "rank", type: "number" },
      ],
      indexes: [
        { name: "indexed_records_status_rank_idx", fields: ["status", "rank"] },
        { name: "indexed_records_rank_unique_idx", fields: ["rank"], unique: true },
      ],
    });

    const indexRows = store.sqlite.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'index' AND tbl_name = 'records' AND name LIKE 'claw_records_%indexed_records%'
      ORDER BY name ASC
    `).all() as Array<{ name: string }>;
    assert.equal(indexRows.some((row) => row.name.includes("indexed_records_status_rank_idx")), true);
    assert.equal(indexRows.some((row) => row.name.includes("indexed_records_rank_unique_idx")), true);

    for (let index = 0; index < 6; index += 1) {
      store.createRecord("main", "indexed_records", {
        status: index % 2 === 0 ? "open" : "closed",
        rank: index,
      });
    }

    const filtered = store.listRecords("main", "indexed_records", {
      filter: { status: "open" },
      sort: "rank",
      limit: 2,
    });
    assert.equal(filtered.total, 3);
    assert.deepEqual(filtered.items.map((item) => item.rank), [0, 2]);

    const queryPlan = store.sqlite.prepare(`
      EXPLAIN QUERY PLAN
      SELECT id, data_json
      FROM records
      WHERE namespace_id = @namespaceId
        AND collection_name = @collectionName
        AND json_extract(data_json, '$.status') = @status
      ORDER BY json_extract(data_json, '$.rank') ASC, id ASC
      LIMIT 2
    `).all({
      namespaceId: "main",
      collectionName: "indexed_records",
      status: "open",
    }) as Array<{ detail: string }>;
    assert.equal(queryPlan.some((row) => row.detail.includes("indexed_records_status_rank_idx")), true);

    assert.throws(
      () => store.createRecord("main", "indexed_records", { status: "open", rank: 0 }),
      /UNIQUE constraint failed/,
    );

    store.createCollection("main", {
      name: "unique_later_records",
      displayName: "Unique Later Records",
      fields: [{ name: "code", type: "text" }],
    });
    store.createRecord("main", "unique_later_records", { code: "dup" });
    store.createRecord("main", "unique_later_records", { code: "dup" });
    assert.throws(
      () => store.updateCollection("main", "unique_later_records", {
        indexes: [{ name: "unique_later_code_unique_idx", fields: ["code"], unique: true }],
      }),
      /UNIQUE constraint failed/,
    );
    assert.deepEqual(store.getCollection("main", "unique_later_records")?.indexes, []);
  } finally {
    store.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("DatabaseServiceStore syncs record indexes with one sqlite_master scan", () => {
  const rootDir = tempRoot("clawjs-database-record-index-sync-");
  const store = new DatabaseServiceStore(path.join(rootDir, "core.sqlite"), path.join(rootDir, "files"));
  try {
    for (let index = 0; index < 8; index += 1) {
      store.createCollection("main", {
        name: `indexed_records_${index}`,
        displayName: `Indexed Records ${index}`,
        fields: [
          { name: "status", type: "text" },
          { name: "rank", type: "number" },
        ],
        indexes: [
          { name: "status_rank_idx", fields: ["status", "rank"] },
          { name: "rank_idx", fields: ["rank"] },
        ],
      });
    }

    const originalPrepare = store.sqlite.prepare.bind(store.sqlite);
    let sqliteMasterIndexScans = 0;
    store.sqlite.prepare = ((source: string) => {
      if (
        source.includes("FROM sqlite_master")
        && source.includes("tbl_name = 'records'")
        && source.includes("name LIKE ?")
      ) {
        sqliteMasterIndexScans += 1;
      }
      return originalPrepare(source);
    }) as typeof store.sqlite.prepare;

    (store as unknown as { syncAllRecordIndexes(): void }).syncAllRecordIndexes();

    assert.equal(sqliteMasterIndexScans, 1);
  } finally {
    store.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("DatabaseServiceStore rolls back record note side effects when record insert fails", () => {
  const rootDir = tempRoot("clawjs-database-record-atomicity-");
  const store = new DatabaseServiceStore(path.join(rootDir, "core.sqlite"), path.join(rootDir, "files"));
  try {
    store.createCollection("main", {
      name: "atomic_records",
      displayName: "Atomic Records",
      fields: [{ name: "title", type: "text", required: true }],
      indexes: [{ name: "atomic_records_title_unique_idx", fields: ["title"], unique: true }],
    });

    store.createRecord("main", "atomic_records", {
      title: "unique",
      notes: "first record note",
      pageId: "atomic-kept-page",
    });

    assert.equal(
      (store.sqlite.prepare("SELECT COUNT(*) AS n FROM pages WHERE id = ?").get("atomic-kept-page") as { n: number }).n,
      1,
    );

    assert.throws(
      () => store.createRecord("main", "atomic_records", {
        title: "unique",
        notes: "must not leak",
        pageId: "atomic-leak-page",
      }),
      /UNIQUE constraint failed/,
    );

    assert.equal(
      (store.sqlite.prepare("SELECT COUNT(*) AS n FROM pages WHERE id = ?").get("atomic-leak-page") as { n: number }).n,
      0,
    );
    assert.equal(
      (store.sqlite.prepare("SELECT COUNT(*) AS n FROM page_blocks WHERE page_id = ?").get("atomic-leak-page") as { n: number }).n,
      0,
    );
    assert.equal(
      (store.sqlite.prepare("SELECT COUNT(*) AS n FROM notes_fts WHERE page_id = ?").get("atomic-leak-page") as { n: number }).n,
      0,
    );
  } finally {
    store.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
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
    await new Promise<void>((resolve) => {
      socket.once("close", resolve);
      socket.close();
    });

    const metrics = await app.inject({
      method: "GET",
      url: "/v1/storage/metrics",
      headers: auth,
    });
    assert.equal(metrics.statusCode, 200);
    const metricsBody = metrics.json() as {
      storage: { operations: Record<string, { count: number }> };
      realtime: { clients: number };
    };
    assert.ok(metricsBody.storage.operations.listRecords.count >= 2);
    assert.equal(typeof metricsBody.realtime.clients, "number");
  } finally {
    await app.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

class FakeRealtimeSocket extends EventEmitter {
  readyState = WebSocket.OPEN;
  bufferedAmount = 0;
  sent: string[] = [];
  closeCode: number | null = null;
  terminated = false;
  autoCompleteSends = true;
  private readonly callbacks: Array<(error?: Error) => void> = [];

  send(payload: string, callback?: (error?: Error) => void): void {
    this.sent.push(payload);
    if (!callback) return;
    if (this.autoCompleteSends) callback();
    else this.callbacks.push(callback);
  }

  close(code?: number): void {
    this.closeCode = code ?? null;
    this.readyState = WebSocket.CLOSED;
    this.emit("close");
  }

  terminate(): void {
    this.terminated = true;
    this.close();
  }

  ping(): void {}

  receive(payload: unknown): void {
    this.emit("message", Buffer.from(JSON.stringify(payload), "utf8"));
  }
}

const adminPrincipal: AuthPrincipal = {
  kind: "admin",
  adminId: "admin",
  email: "admin@test.local",
};

function recordEvent(recordId = "record-1"): RecordChangeEvent {
  return {
    type: "record.updated",
    namespaceId: "main",
    collectionName: "items",
    recordId,
    at: new Date().toISOString(),
  };
}

function decoded(socket: FakeRealtimeSocket): Array<Record<string, unknown>> {
  return socket.sent.map((payload) => JSON.parse(payload) as Record<string, unknown>);
}

test("RealtimeHub broadcasts only to authorized matching subscriptions", () => {
  const hub = new RealtimeHub();
  const socket = new FakeRealtimeSocket();
  hub.attach(socket as unknown as WebSocket, adminPrincipal);

  socket.receive({ type: "subscribe", namespaceId: "main", collectionName: "items" });
  hub.broadcast(recordEvent());

  assert.deepEqual(decoded(socket).map((item) => item.type), ["hello", "subscribed", "event"]);
  assert.equal(hub.snapshotMetrics().subscriptions, 1);
  socket.close();
});

test("RealtimeHub rejects excess clients with a bounded close code", () => {
  const hub = new RealtimeHub({ maxClients: 1 });
  const first = new FakeRealtimeSocket();
  const second = new FakeRealtimeSocket();

  hub.attach(first as unknown as WebSocket, adminPrincipal);
  hub.attach(second as unknown as WebSocket, adminPrincipal);

  assert.equal(first.closeCode, null);
  assert.equal(second.closeCode, 4429);
  assert.equal(hub.snapshotMetrics().clients, 1);
  assert.equal(hub.snapshotMetrics().rejectedClients, 1);
  first.close();
});

test("RealtimeHub rejects excess subscriptions without removing existing subscriptions", () => {
  const hub = new RealtimeHub({ maxSubscriptionsPerClient: 1 });
  const socket = new FakeRealtimeSocket();
  hub.attach(socket as unknown as WebSocket, adminPrincipal);

  socket.receive({ type: "subscribe", namespaceId: "main", collectionName: "items" });
  socket.receive({ type: "subscribe", namespaceId: "main", collectionName: "other_items" });

  assert.equal(hub.snapshotMetrics().subscriptions, 1);
  assert.equal(hub.snapshotMetrics().rejectedSubscriptions, 1);
  assert.equal(decoded(socket).at(-1)?.message, "Too many realtime subscriptions.");
  socket.close();
});

test("RealtimeHub closes only slow clients on outbound queue overflow", () => {
  const hub = new RealtimeHub({ maxQueuedMessagesPerClient: 2 });
  const slow = new FakeRealtimeSocket();
  slow.autoCompleteSends = false;
  const fast = new FakeRealtimeSocket();

  hub.attach(slow as unknown as WebSocket, adminPrincipal);
  hub.attach(fast as unknown as WebSocket, adminPrincipal);
  slow.receive({ type: "subscribe", namespaceId: "main", collectionName: "items" });
  fast.receive({ type: "subscribe", namespaceId: "main", collectionName: "items" });

  hub.broadcast(recordEvent("one"));
  hub.broadcast(recordEvent("two"));

  assert.equal(slow.closeCode, 4408);
  assert.equal(fast.closeCode, null);
  assert.equal(hub.snapshotMetrics().closedSlowClients, 1);
  assert.equal(hub.snapshotMetrics().clients, 1);
  fast.close();
});
