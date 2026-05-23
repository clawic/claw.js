import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { buildDatabaseApp } from "./app.ts";
import { DatabaseServiceStore } from "./store.ts";

function tempRoot(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function explainDetails(store: DatabaseServiceStore, sql: string, params: Record<string, unknown> = {}): string[] {
  return (store.sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(params) as Array<{ detail: string }>).map((row) => row.detail);
}

function assertIndexBacked(details: string[], indexName: string): void {
  assert.ok(
    details.some((detail) => detail.includes(indexName)),
    `expected ${indexName} in query plan:\n${details.join("\n")}`,
  );
  assert.equal(
    details.some((detail) => detail.includes("USE TEMP B-TREE")),
    false,
    `critical database query must not sort through a temp b-tree:\n${details.join("\n")}`,
  );
}

function seedRecords(
  store: DatabaseServiceStore,
  collectionName: string,
  count: number,
  payloadForIndex: (index: number) => Record<string, unknown>,
): void {
  const insert = store.sqlite.prepare(`
    INSERT INTO records (namespace_id, collection_name, id, data_json, created_at, updated_at)
    VALUES ('main', @collectionName, @id, @dataJson, @createdAt, @updatedAt)
  `);
  const seed = store.sqlite.transaction(() => {
    for (let index = 0; index < count; index += 1) {
      const timestamp = new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();
      insert.run({
        collectionName,
        id: `record-${index.toString().padStart(5, "0")}`,
        dataJson: JSON.stringify(payloadForIndex(index)),
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
  });
  seed();
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

test("database record hot path query contracts stay paged and index-backed", () => {
  const rootDir = tempRoot("clawjs-database-query-plan-");
  const store = new DatabaseServiceStore(path.join(rootDir, "core.sqlite"), path.join(rootDir, "files"));
  try {
    store.createCollection("main", {
      name: "hot_records",
      displayName: "Hot Records",
      fields: [
        { name: "status", type: "text" },
        { name: "rank", type: "number" },
      ],
      indexes: [
        { name: "hot_records_status_rank_idx", fields: ["status", "rank"] },
      ],
    });

    seedRecords(store, "hot_records", 1_200, (index) => ({
      status: index % 2 === 0 ? "open" : "closed",
      rank: index,
    }));

    const newestDetails = explainDetails(
      store,
      `SELECT id, data_json, created_at, updated_at
       FROM records
       WHERE namespace_id = @namespaceId AND collection_name = @collectionName
       ORDER BY created_at DESC, id ASC
       LIMIT @limit OFFSET @offset`,
      { namespaceId: "main", collectionName: "hot_records", limit: 50, offset: 0 },
    );
    assertIndexBacked(newestDetails, "records_collection_created_idx");

    const recentlyUpdatedDetails = explainDetails(
      store,
      `SELECT id, data_json, created_at, updated_at
       FROM records
       WHERE namespace_id = @namespaceId AND collection_name = @collectionName
       ORDER BY updated_at DESC, id ASC
       LIMIT @limit OFFSET @offset`,
      { namespaceId: "main", collectionName: "hot_records", limit: 50, offset: 0 },
    );
    assertIndexBacked(recentlyUpdatedDetails, "records_collection_updated_idx");

    const filteredCountDetails = explainDetails(
      store,
      `SELECT COUNT(*) AS n
       FROM records
       WHERE namespace_id = @namespaceId
         AND collection_name = @collectionName
         AND json_extract(data_json, '$.status') = @status`,
      { namespaceId: "main", collectionName: "hot_records", status: "open" },
    );
    assertIndexBacked(filteredCountDetails, "hot_records_status_rank_idx");

    const filteredPageDetails = explainDetails(
      store,
      `SELECT id, data_json, created_at, updated_at
       FROM records
       WHERE namespace_id = @namespaceId
         AND collection_name = @collectionName
         AND json_extract(data_json, '$.status') = @status
       ORDER BY json_extract(data_json, '$.rank') ASC, id ASC
       LIMIT @limit OFFSET @offset`,
      { namespaceId: "main", collectionName: "hot_records", status: "open", limit: 25, offset: 100 },
    );
    assertIndexBacked(filteredPageDetails, "hot_records_status_rank_idx");

    const page = store.listRecords("main", "hot_records", {
      filter: { status: "open" },
      sort: "rank",
      limit: 1_000,
      maxLimit: 125,
      offset: 100,
    });
    assert.equal(page.total, 600);
    assert.equal(page.items.length, 125);
    assert.deepEqual(page.items.slice(0, 3).map((item) => item.rank), [200, 202, 204]);
  } finally {
    store.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("database HTTP records route clamps oversized pages at the API boundary", async () => {
  const rootDir = tempRoot("clawjs-database-http-query-contract-");
  const dbPath = path.join(rootDir, "core.sqlite");
  const filesDir = path.join(rootDir, "files");
  const seedStore = new DatabaseServiceStore(dbPath, filesDir);
  try {
    seedStore.createCollection("main", {
      name: "api_hot_records",
      displayName: "API Hot Records",
      fields: [{ name: "rank", type: "number" }],
    });
    seedRecords(seedStore, "api_hot_records", 650, (index) => ({ rank: index }));
  } finally {
    seedStore.close();
  }

  const built = buildDatabaseApp({
    config: {
      dataDir: path.join(rootDir, "data"),
      dbPath,
      filesDir,
      jwtSecret: "test-secret",
    },
  });
  const { app } = built;
  try {
    const token = await adminToken(app);
    const auth = { authorization: `Bearer ${token}` };

    const response = await app.inject({
      method: "GET",
      url: "/v1/namespaces/main/collections/api_hot_records/records?limit=5000",
      headers: auth,
    });
    assert.equal(response.statusCode, 200);
    const body = response.json() as { total: number; items: Array<{ rank: number }> };
    assert.equal(body.total, 650);
    assert.equal(body.items.length, 500);
  } finally {
    await app.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
