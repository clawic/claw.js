import { test } from "node:test";
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SessionsApiClient, SessionsServiceStore, buildSessionsApp, stableProjectIdFromPath } from "@clawjs/sessions";
import type { FastifyInstance } from "fastify";

const SECRET = "sessions-canonical-secret";
const HERE = path.dirname(fileURLToPath(import.meta.url));

interface TestContext {
  client: SessionsApiClient;
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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sessions-canonical-"));
  const { app } = buildSessionsApp({
    config: {
      host: "127.0.0.1",
      port: 0,
      dataDir: tmpDir,
      dbPath: path.join(tmpDir, "sessions.sqlite"),
      sharedSecret: SECRET,
      codexSessionsDir: path.join(tmpDir, "codex"),
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
    close: async () => {
      await app.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

test("projects use stable ids derived from normalized folder paths", async () => {
  const ctx = await spinUp();
  try {
    const folder = path.join(ctx.tmpDir, "Acme App");
    const project = await ctx.client.createProject({ path: folder });

    assert.equal(project.id, stableProjectIdFromPath(folder));
    assert.equal(project.displayName, "Acme App");
    assert.equal(project.hidden, false);
    assert.equal(project.archived, false);

    const renamed = await ctx.client.updateProject(project.id, { displayName: "Core App", hidden: true, sortRank: 12 });
    assert.equal(renamed.displayName, "Core App");
    assert.equal(renamed.hidden, true);
    assert.equal(renamed.sortRank, 12);

    const hidden = await ctx.client.listProjects({ hidden: true });
    assert.equal(hidden.total, 1);
    assert.equal(hidden.items[0].id, project.id);
  } finally {
    await ctx.close();
  }
});

test("sessions list/read/update by project, pinned, archived, and sidebar visibility", async () => {
  const ctx = await spinUp();
  try {
    const project = await ctx.client.createProject({ path: path.join(ctx.tmpDir, "Repo") });
    const session = await ctx.client.createSession({
      id: "session-filtered",
      agent: "codex",
      runtime: "codex",
      runtimeAdapter: "codex",
      runtimeSessionId: "codex-thread-1",
      projectId: project.id,
      title: "Implement gateway",
      cwd: project.path,
    });

    assert.equal(session.projectId, project.id);
    assert.equal(session.projectPath, project.path);
    assert.equal(session.runtimeAdapter, "codex");
    assert.equal(session.runtimeSessionId, "codex-thread-1");

    await ctx.client.update(session.id, { pinned: true, archived: true, sidebarVisible: false });
    assert.equal((await ctx.client.list({ projectId: project.id })).total, 1);
    assert.equal((await ctx.client.list({ pinned: true })).items[0].id, session.id);
    assert.equal((await ctx.client.list({ archived: true })).items[0].id, session.id);
    assert.equal((await ctx.client.list({ sidebarVisible: false })).items[0].id, session.id);
  } finally {
    await ctx.close();
  }
});

test("messages retain timeline and work summary fields in history and search", async () => {
  const ctx = await spinUp();
  try {
    await ctx.client.createSession({ id: "session-messages", agent: "codex", runtime: "codex" });
    const message = await ctx.client.appendMessage("session-messages", {
      role: "assistant",
      contentText: "Final answer",
      timeline: [{ kind: "tool", title: "Read files" }],
      workSummary: { status: "complete", text: "Read project files" },
      streamingState: "complete",
      toolCalls: [{ name: "read" }],
    });

    assert.equal(message.streamingState, "complete");
    assert.deepEqual(message.timeline, [{ kind: "tool", title: "Read files" }]);

    const withMessages = await ctx.client.getSessionWithMessages("session-messages");
    assert.equal(withMessages.messages[0].workSummary?.["text"], "Read project files");

    const search = await ctx.client.search({ query: "Final" });
    assert.equal(search.items.length, 1);
    assert.equal(search.items[0].message.id, message.id);
  } finally {
    await ctx.close();
  }
});

test("fixture Codex turn appends working timeline and final assistant answer", async () => {
  const ctx = await spinUp();
  try {
    const project = await ctx.client.createProject({ path: path.join(ctx.tmpDir, "Runtime") });
    const result = await ctx.client.startTurn("turn-session", {
      prompt: "wire the sessions gateway",
      projectId: project.id,
      cwd: project.path,
      fixtureReply: "Gateway wired through local fixture.",
    });

    assert.equal(result.session?.status, "completed");
    assert.equal(result.userMessage.role, "user");
    assert.equal(result.assistantMessage?.role, "assistant");
    assert.equal(result.assistantMessage?.contentText, "Gateway wired through local fixture.");
    assert.equal(result.assistantMessage?.streamingState, "complete");
    assert.ok((result.assistantMessage?.timeline?.length ?? 0) >= 2);
  } finally {
    await ctx.close();
  }
});

test("CLI seed-realistic creates a reusable hermetic sessions dataset", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sessions-seed-realistic-"));
  try {
    const dbPath = path.join(tmpDir, "seeded.sqlite");
    const result = childProcess.spawnSync(process.execPath, [
      "--import",
      "tsx",
      path.resolve(HERE, "../../src/bin/cli.ts"),
      "seed-realistic",
      "--db-path",
      dbPath,
      "--profile",
      "smoke",
      "--sessions",
      "12",
      "--projects",
      "4",
      "--workspace-root",
      path.join(tmpDir, "workspace"),
    ], {
      cwd: path.resolve(HERE, "../.."),
      encoding: "utf8",
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const seedReport = JSON.parse(result.stdout);
    assert.equal(seedReport.fixtureSetId, "realistic-sessions-v1");
    assert.equal(seedReport.sessionsSeeded, 12);
    assert.ok(seedReport.coverage.markdownHeavyMessages > 0);
    assert.ok(seedReport.coverage.toolEvents > 0);
    assert.ok(seedReport.coverage.recoverableCorruptions > 0);

    const store = new SessionsServiceStore(dbPath);
    try {
      const listed = store.listSessions({ limit: 20 });
      assert.equal(listed.total, 12);
      const markdownHits = store.searchMessages({ query: "Regression Packet", limit: 10 });
      assert.ok(markdownHits.length > 0);
      assert.ok(markdownHits.some((hit) => hit.message.contentBlocks && hit.message.contentBlocks.length > 0));
    } finally {
      store.close();
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("interrupt marks a session interrupted without real Codex execution", async () => {
  const ctx = await spinUp();
  try {
    await ctx.client.createSession({ id: "interrupt-session", agent: "codex", runtime: "codex" });
    const interrupted = await ctx.client.interrupt("interrupt-session");
    assert.equal(interrupted.interrupted, true);
    assert.equal(interrupted.session.status, "interrupted");
  } finally {
    await ctx.close();
  }
});
