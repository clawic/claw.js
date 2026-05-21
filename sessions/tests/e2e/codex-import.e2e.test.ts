import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { SessionsApiClient, buildSessionsApp } from "@clawjs/sessions";
import type { FastifyInstance } from "fastify";

const SECRET = "sessions-e2e-secret";

interface TestContext {
  client: SessionsApiClient;
  close: () => Promise<void>;
  tmpDir: string;
  codexDir: string;
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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sessions-e2e-"));
  const codexDir = path.join(tmpDir, "codex-sessions");
  fs.mkdirSync(codexDir, { recursive: true });
  const { app } = buildSessionsApp({
    config: {
      host: "127.0.0.1",
      port: 0,
      dataDir: tmpDir,
      dbPath: path.join(tmpDir, "sessions.sqlite"),
      sharedSecret: SECRET,
      codexSessionsDir: codexDir,
    },
  });
  const client = new SessionsApiClient({
    baseUrl: "http://sessions.test",
    token: SECRET,
    fetchImpl: injectFetch(app),
  });
  return {
    client,
    tmpDir,
    codexDir,
    close: async () => {
      await app.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

function writeFixtureRollout(
  codexDir: string,
  sessionUuid: string,
  options: { cwd?: string; branch?: string; userMessage?: string; assistantReply?: string } = {},
): string {
  const day = path.join(codexDir, "2026", "05", "11");
  fs.mkdirSync(day, { recursive: true });
  const rolloutPrefix = ["rollout", "2026-05-11T10-00-00"].join("-");
  const filePath = path.join(day, `${rolloutPrefix}-${sessionUuid}.jsonl`);
  const lines = [
    {
      timestamp: "2026-05-11T10:00:00.000Z",
      type: "session_meta",
      payload: {
        id: sessionUuid,
        timestamp: "2026-05-11T10:00:00.000Z",
        cwd: options.cwd ?? "/tmp/fixture-project",
        originator: "codex_cli",
        cli_version: "0.42.0",
        instructions: null,
        git: {
          commit_hash: "abc123",
          branch: options.branch ?? "main",
          repository_url: "git@example.com:test/repo.git",
        },
      },
    },
    {
      timestamp: "2026-05-11T10:00:01.000Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: options.userMessage ?? "ship the kanban dispatcher" }],
      },
    },
    {
      timestamp: "2026-05-11T10:00:05.000Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: options.assistantReply ?? "I will implement the kanban dispatcher loop" }],
      },
    },
  ];
  fs.writeFileSync(filePath, lines.map((entry) => JSON.stringify(entry)).join("\n") + "\n", "utf8");
  return filePath;
}

test("codex import: full round-trip with session + messages", async () => {
  const ctx = await spinUp();
  try {
    const sessionUuid = "11111111-2222-3333-4444-555555555555";
    writeFixtureRollout(ctx.codexDir, sessionUuid);

    const importResult = await ctx.client.importCodex({});
    assert.equal(importResult.scanned, 1);
    assert.equal(importResult.imported[0].sessionId, sessionUuid);
    assert.equal(importResult.imported[0].messagesImported, 2);

    const session = await ctx.client.getSession(sessionUuid);
    assert.equal(session.agent, "codex");
    assert.equal(session.runtime, "codex_cli");
    assert.equal(session.cwd, "/tmp/fixture-project");
    assert.equal(session.branch, "main");
    assert.equal(session.messageCount, 2);

    const withMessages = await ctx.client.getSessionWithMessages(sessionUuid);
    assert.equal(withMessages.messages.length, 2);
    assert.equal(withMessages.messages[0].role, "user");
    assert.equal(withMessages.messages[1].role, "assistant");
  } finally {
    await ctx.close();
  }
});

test("codex import: idempotent on unchanged file", async () => {
  const ctx = await spinUp();
  try {
    const sessionUuid = "22222222-aaaa-bbbb-cccc-dddddddddddd";
    writeFixtureRollout(ctx.codexDir, sessionUuid);

    const first = await ctx.client.importCodex({});
    assert.equal(first.imported[0].messagesImported, 2);

    const second = await ctx.client.importCodex({});
    assert.equal(second.imported[0].skipped, true);
    assert.equal(second.imported[0].reason, "unchanged");

    const session = await ctx.client.getSession(sessionUuid);
    assert.equal(session.messageCount, 2);
  } finally {
    await ctx.close();
  }
});

test("codex import: forced re-import after edit picks up new messages", async () => {
  const ctx = await spinUp();
  try {
    const sessionUuid = "33333333-eeee-ffff-aaaa-111111111111";
    const filePath = writeFixtureRollout(ctx.codexDir, sessionUuid);
    await ctx.client.importCodex({});

    const append = {
      timestamp: "2026-05-11T10:00:10.000Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "also implement skill distillation" }],
      },
    };
    fs.appendFileSync(filePath, JSON.stringify(append) + "\n", "utf8");

    const reimport = await ctx.client.importCodex({});
    assert.equal(reimport.imported[0].skipped, false);
    assert.equal(reimport.imported[0].messagesImported, 1);

    const session = await ctx.client.getSession(sessionUuid);
    assert.equal(session.messageCount, 3);
  } finally {
    await ctx.close();
  }
});

test("FTS5 search finds substring across imported messages", async () => {
  const ctx = await spinUp();
  try {
    writeFixtureRollout(ctx.codexDir, "44444444-1111-2222-3333-555555555555", {
      userMessage: "we need to ship the runtime distillation pipeline",
      assistantReply: "got it, kicking off the runtime loop",
    });
    writeFixtureRollout(ctx.codexDir, "55555555-aaaa-bbbb-cccc-dddddddddddd", {
      userMessage: "any update on the kanban dispatcher?",
      assistantReply: "60 second tick, claim reclaim, all wired",
    });
    await ctx.client.importCodex({});

    const result = await ctx.client.search({ query: "kanban" });
    assert.ok(result.items.length > 0, "expected at least one search hit");
    const hit = result.items[0];
    assert.match(hit.snippet, /<<kanban>>/i);
    assert.equal(hit.session.agent, "codex");
  } finally {
    await ctx.close();
  }
});

test("session survives deletion of native JSONL (resilience to mirror)", async () => {
  const ctx = await spinUp();
  try {
    const sessionUuid = "66666666-7777-8888-9999-aaaaaaaaaaaa";
    const filePath = writeFixtureRollout(ctx.codexDir, sessionUuid);
    await ctx.client.importCodex({});

    fs.unlinkSync(filePath);

    const session = await ctx.client.getSession(sessionUuid);
    assert.equal(session.id, sessionUuid);
    assert.equal(session.messageCount, 2);

    const withMessages = await ctx.client.getSessionWithMessages(sessionUuid);
    assert.equal(withMessages.messages.length, 2);
  } finally {
    await ctx.close();
  }
});

test("pin/archive/visibility flags update via PATCH and reflect in list filters", async () => {
  const ctx = await spinUp();
  try {
    const sessionUuid = "77777777-8888-9999-aaaa-bbbbbbbbbbbb";
    writeFixtureRollout(ctx.codexDir, sessionUuid);
    await ctx.client.importCodex({});

    await ctx.client.update(sessionUuid, { pinned: true, title: "Renamed session" });
    const pinned = await ctx.client.list({ pinned: true });
    assert.equal(pinned.items.length, 1);
    assert.equal(pinned.items[0].title, "Renamed session");

    await ctx.client.update(sessionUuid, { archived: true });
    const archived = await ctx.client.list({ archived: true });
    assert.equal(archived.items.length, 1);

    await ctx.client.update(sessionUuid, { sidebarVisible: false });
    const hidden = await ctx.client.list({ sidebarVisible: false });
    assert.equal(hidden.items.length, 1);
  } finally {
    await ctx.close();
  }
});
