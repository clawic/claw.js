import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { buildIndexApp } from "./app.ts";

const API = "/v1";
const TOKEN = "test-index-admin-token-0123456789abcdef";

async function withIndexApp<T>(fn: (request: RequestHelper) => Promise<T>): Promise<T> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-index-query-"));
  const built = buildIndexApp({
    adminToken: TOKEN,
    startScheduler: false,
    config: {
      dataDir: dir,
      dbPath: path.join(dir, "index.sqlite"),
    },
  });
  const request: RequestHelper = async (method, url, payload) => {
    const response = await built.app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${TOKEN}` },
      payload,
    });
    const body = response.json();
    return { statusCode: response.statusCode, body };
  };
  try {
    return await fn(request);
  } finally {
    await built.app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

type RequestHelper = (
  method: "GET" | "POST",
  url: string,
  payload?: Record<string, unknown>,
) => Promise<{ statusCode: number; body: any }>;

async function seedEntity(
  request: RequestHelper,
  input: { type: string; title: string; observedAt: string; sourceUrl?: string },
): Promise<string> {
  const response = await request("POST", `${API}/entities/upsert`, {
    type: input.type,
    observedAt: input.observedAt,
    sourceUrl: input.sourceUrl,
    data: {
      canonical_url: input.sourceUrl ?? `https://example.test/${input.title.toLowerCase().replace(/\s+/g, "-")}`,
      title: input.title,
      body: `${input.title} body`,
    },
  });
  assert.equal(response.statusCode, 200, JSON.stringify(response.body));
  return response.body.entity.id;
}

test("entities/query filters by collection, tag, and full text", async () => {
  await withIndexApp(async (request) => {
    const alpha = await seedEntity(request, { type: "article", title: "Alpha Planning", observedAt: "2026-05-21T10:00:00.000Z" });
    await seedEntity(request, { type: "article", title: "Beta Planning", observedAt: "2026-05-21T09:00:00.000Z" });
    await seedEntity(request, { type: "product", title: "Alpha Device", observedAt: "2026-05-21T08:00:00.000Z" });

    const tag = await request("POST", `${API}/tags/apply`, { entityId: alpha, name: "important" });
    assert.equal(tag.statusCode, 200);

    const collection = await request("POST", `${API}/collections`, { name: "Research" });
    assert.equal(collection.statusCode, 200);
    const collectionId = collection.body.collection.id;
    const add = await request("POST", `${API}/collections/${collectionId}/add`, { entityId: alpha });
    assert.equal(add.statusCode, 200);

    const response = await request("POST", `${API}/entities/query`, {
      type: "article",
      fullText: "Alpha",
      tagIds: [tag.body.tag.id],
      collectionId,
      limit: 10,
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body.entities.map((entity: { id: string }) => entity.id), [alpha]);
    assert.equal(response.body.nextCursor, null);
  });
});

test("entities/query pages with a stable cursor and rejects filter mismatches", async () => {
  await withIndexApp(async (request) => {
    const newest = await seedEntity(request, { type: "article", title: "Cursor Newest", observedAt: "2026-05-21T10:00:00.000Z" });
    const middle = await seedEntity(request, { type: "article", title: "Cursor Middle", observedAt: "2026-05-21T09:00:00.000Z" });
    const oldest = await seedEntity(request, { type: "article", title: "Cursor Oldest", observedAt: "2026-05-21T08:00:00.000Z" });

    const first = await request("POST", `${API}/entities/query`, { type: "article", limit: 2 });
    assert.equal(first.statusCode, 200);
    assert.deepEqual(first.body.entities.map((entity: { id: string }) => entity.id), [newest, middle]);
    assert.equal(typeof first.body.nextCursor, "string");

    const second = await request("POST", `${API}/entities/query`, {
      type: "article",
      limit: 2,
      cursor: first.body.nextCursor,
    });
    assert.equal(second.statusCode, 200);
    assert.deepEqual(second.body.entities.map((entity: { id: string }) => entity.id), [oldest]);
    assert.equal(second.body.nextCursor, null);

    const mismatch = await request("POST", `${API}/entities/query`, {
      type: "product",
      limit: 2,
      cursor: first.body.nextCursor,
    });
    assert.equal(mismatch.statusCode, 400);
    assert.match(mismatch.body.error, /cursor/i);
  });
});

test("entities/query rejects deep offset pagination in favor of cursors", async () => {
  await withIndexApp(async (request) => {
    await seedEntity(request, { type: "article", title: "Offset Cap", observedAt: "2026-05-21T10:00:00.000Z" });

    const response = await request("POST", `${API}/entities/query`, {
      type: "article",
      limit: 100,
      offset: 5_001,
    });

    assert.equal(response.statusCode, 400);
    assert.match(response.body.error, /nextCursor/);
  });
});
