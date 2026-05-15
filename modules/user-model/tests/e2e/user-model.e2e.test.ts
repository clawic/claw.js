import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { UserModelApiClient, buildUserModelApp } from "@clawjs/user-model";
import type { FastifyInstance } from "fastify";

const SECRET = "user-model-e2e-secret";

interface TestContext {
  client: UserModelApiClient;
  close: () => Promise<void>;
  tmpDir: string;
}

function injectFetch(app: FastifyInstance): typeof fetch {
  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const response = await app.inject({
      method: init?.method ?? "GET",
      url: `${url.pathname}${url.search}`,
      headers: init?.headers as Record<string, string> | undefined,
      payload: init?.body ? String(init.body) : undefined,
    });
    return new Response(response.body, {
      status: response.statusCode,
      headers: response.headers as Record<string, string>,
    });
  };
}

async function spinUp(): Promise<TestContext> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "user-model-e2e-"));
  const { app } = buildUserModelApp({
    config: {
      host: "127.0.0.1",
      port: 0,
      dataDir: tmpDir,
      dbPath: path.join(tmpDir, "core.sqlite"),
      sharedSecret: SECRET,
    },
  });
  const client = new UserModelApiClient({
    baseUrl: "http://user-model.test",
    token: SECRET,
    fetchImpl: injectFetch(app),
  });
  return {
    client,
    tmpDir,
    close: async () => {
      await app.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

test("add + show roundtrip across sections", async () => {
  const ctx = await spinUp();
  try {
    await ctx.client.upsertItem({
      section: "preference",
      contentText: "prefers terse responses without trailing summaries",
      topic: "tone",
      confidence: 0.95,
      source: "session_001",
    });
    await ctx.client.upsertItem({
      section: "expertise",
      contentText: "deep Flutter and Swift native UI experience",
      topic: "stack",
    });
    await ctx.client.upsertItem({
      section: "edge_case",
      contentText: "always check Codex JSONL formats on a real sample before parsing",
    });

    const snapshot = await ctx.client.snapshot();
    assert.equal(snapshot.items.length, 3);

    const grouped = await ctx.client.bySection();
    assert.equal(grouped.preference.length, 1);
    assert.equal(grouped.expertise.length, 1);
    assert.equal(grouped.edge_case.length, 1);
    assert.equal(grouped.preference[0].confidence, 0.95);
  } finally {
    await ctx.close();
  }
});

test("counts groups by section correctly", async () => {
  const ctx = await spinUp();
  try {
    await ctx.client.upsertItem({ section: "preference", contentText: "a" });
    await ctx.client.upsertItem({ section: "preference", contentText: "b" });
    await ctx.client.upsertItem({ section: "goal", contentText: "ship phase 1" });

    const { counts } = await ctx.client.counts();
    assert.equal(counts.preference, 2);
    assert.equal(counts.goal, 1);
    assert.equal(counts.expertise, 0);
  } finally {
    await ctx.close();
  }
});

test("edit updates content and timestamp", async () => {
  const ctx = await spinUp();
  try {
    const item = await ctx.client.upsertItem({
      section: "preference",
      contentText: "original text",
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const updated = await ctx.client.updateItem(item.id, { contentText: "updated text", topic: "new-topic" });
    assert.equal(updated.contentText, "updated text");
    assert.equal(updated.topic, "new-topic");
    assert.ok(updated.updatedAt >= item.updatedAt);
    assert.equal(updated.createdAt, item.createdAt);
  } finally {
    await ctx.close();
  }
});

test("forget by --about deletes matching items by content or topic", async () => {
  const ctx = await spinUp();
  try {
    await ctx.client.upsertItem({ section: "expertise", contentText: "Flutter mobile development" });
    await ctx.client.upsertItem({ section: "expertise", contentText: "React web apps", topic: "react" });
    await ctx.client.upsertItem({ section: "expertise", contentText: "Swift native iOS" });

    const result = await ctx.client.forget({ about: "Flutter" });
    assert.equal(result.forgottenCount, 1);

    const remaining = await ctx.client.snapshot();
    assert.equal(remaining.items.length, 2);
    assert.ok(!remaining.items.some((item) => item.contentText.includes("Flutter")));
  } finally {
    await ctx.close();
  }
});

test("forget by topic only removes matching topic", async () => {
  const ctx = await spinUp();
  try {
    await ctx.client.upsertItem({ section: "preference", contentText: "Item A", topic: "tone" });
    await ctx.client.upsertItem({ section: "preference", contentText: "Item B", topic: "tone" });
    await ctx.client.upsertItem({ section: "preference", contentText: "Item C", topic: "style" });

    const result = await ctx.client.forget({ topic: "tone" });
    assert.equal(result.forgottenCount, 2);

    const remaining = await ctx.client.snapshot();
    assert.equal(remaining.items.length, 1);
    assert.equal(remaining.items[0].topic, "style");
  } finally {
    await ctx.close();
  }
});

test("refresh records snapshot in history with reason", async () => {
  const ctx = await spinUp();
  try {
    await ctx.client.upsertItem({ section: "expertise", contentText: "TypeScript fluency" });

    const refreshed = await ctx.client.refresh("test_run");
    assert.ok(refreshed.snapshot.id > 0);
    assert.equal(refreshed.snapshot.reason, "test_run");
    assert.equal(refreshed.snapshot.snapshot.items.length, 1);

    const history = await ctx.client.history();
    assert.equal(history.items.length, 1);
    assert.equal(history.items[0].reason, "test_run");
  } finally {
    await ctx.close();
  }
});

test("snapshot endpoint commits arbitrary checkpoint", async () => {
  const ctx = await spinUp();
  try {
    await ctx.client.upsertItem({ section: "goal", contentText: "ship sessions/" });
    const first = await ctx.client.commitSnapshot({ reason: "milestone-1" });

    await ctx.client.upsertItem({ section: "goal", contentText: "ship user-model/" });
    const second = await ctx.client.commitSnapshot({ reason: "milestone-2" });

    assert.ok(second.id > first.id);
    assert.equal(first.snapshot.items.length, 1);
    assert.equal(second.snapshot.items.length, 2);
  } finally {
    await ctx.close();
  }
});

test("validation: invalid section is rejected", async () => {
  const ctx = await spinUp();
  try {
    await assert.rejects(
      () => ctx.client.upsertItem({ section: "not_a_section" as never, contentText: "x" }),
      /invalid section|400/,
    );
  } finally {
    await ctx.close();
  }
});
