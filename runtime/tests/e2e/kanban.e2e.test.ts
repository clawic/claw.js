import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { FastifyInstance } from "fastify";

import { RuntimeApiClient, buildRuntimeApp } from "@clawjs/runtime";
import { SessionsApiClient, buildSessionsApp } from "@clawjs/sessions";
import { UserModelApiClient, buildUserModelApp } from "@clawjs/user-model";

const SECRET = "kanban-e2e-secret";

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

interface KanbanTestContext {
  client: RuntimeApiClient;
  close: () => Promise<void>;
}

async function spinUp(): Promise<KanbanTestContext> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kanban-e2e-"));

  const sessionsApp = buildSessionsApp({
    config: {
      host: "127.0.0.1",
      port: 0,
      dataDir: path.join(tmpDir, "sessions"),
      dbPath: path.join(tmpDir, "sessions", "sessions.sqlite"),
      sharedSecret: SECRET,
    },
  }).app;
  const userModelApp = buildUserModelApp({
    config: {
      host: "127.0.0.1",
      port: 0,
      dataDir: path.join(tmpDir, "user-model"),
      dbPath: path.join(tmpDir, "user-model", "clawjs.sqlite"),
      sharedSecret: SECRET,
    },
  }).app;

  const runtime = buildRuntimeApp({
    config: {
      host: "127.0.0.1",
      port: 0,
      dataDir: path.join(tmpDir, "runtime"),
      dbPath: path.join(tmpDir, "runtime", "runtime.sqlite"),
      skillsOutputDir: path.join(tmpDir, "skills"),
      sharedSecret: SECRET,
    },
    context: {
      sessionsClient: new SessionsApiClient({
        baseUrl: "http://sessions.test",
        token: SECRET,
        fetchImpl: injectFetch(sessionsApp),
      }),
      userModelClient: new UserModelApiClient({
        baseUrl: "http://user-model.test",
        token: SECRET,
        fetchImpl: injectFetch(userModelApp),
      }),
    },
  });

  const client = new RuntimeApiClient({
    baseUrl: "http://runtime.test",
    token: SECRET,
    fetchImpl: injectFetch(runtime.app),
  });

  return {
    client,
    close: async () => {
      await runtime.app.close();
      await userModelApp.close();
      await sessionsApp.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

test("create task without deps lands in todo, with deps lands in triage", async () => {
  const ctx = await spinUp();
  try {
    const a = await ctx.client.createKanbanTask({ title: "no-deps" });
    assert.equal(a.status, "todo");

    const b = await ctx.client.createKanbanTask({ title: "needs-a", dependsOnIds: [a.id] });
    assert.equal(b.status, "triage");
  } finally {
    await ctx.close();
  }
});

test("dispatcher promotes triage(no deps) -> todo and todo(deps-done) -> ready", async () => {
  const ctx = await spinUp();
  try {
    const dep = await ctx.client.createKanbanTask({ title: "dep-task" });
    const child = await ctx.client.createKanbanTask({ title: "child", dependsOnIds: [dep.id] });
    assert.equal(child.status, "triage");

    const orphan = await ctx.client.createKanbanTask({ title: "orphan-triage", status: "triage" });
    assert.equal(orphan.status, "triage");

    const firstTick = await ctx.client.runKanbanDispatcher();
    assert.ok(firstTick.promotedIds.includes(orphan.id), "orphan should be promoted to todo");

    await ctx.client.claimKanbanTask(dep.id, "agent-a");
    await ctx.client.completeKanbanTask(dep.id, "agent-a");

    const secondTick = await ctx.client.runKanbanDispatcher();
    assert.ok(secondTick.promotedIds.includes(child.id), "child should promote once dep done");

    const childAfter = await ctx.client.getKanbanTask(child.id);
    assert.equal(childAfter.status, "ready");
  } finally {
    await ctx.close();
  }
});

test("claim is atomic and exclusive while claim is live", async () => {
  const ctx = await spinUp();
  try {
    const task = await ctx.client.createKanbanTask({ title: "claimable" });
    await ctx.client.runKanbanDispatcher();
    const claimA = await ctx.client.claimKanbanTask(task.id, "agent-a");
    assert.equal(claimA.claimed, true);
    assert.equal(claimA.task?.status, "in_progress");
    assert.equal(claimA.task?.claimedBy, "agent-a");

    const claimB = await ctx.client.claimKanbanTask(task.id, "agent-b");
    assert.equal(claimB.claimed, false);
    assert.match(claimB.reason ?? "", /status_not_ready|claimed_by_other/);
  } finally {
    await ctx.close();
  }
});

test("complete moves in_progress -> done and clears claim", async () => {
  const ctx = await spinUp();
  try {
    const task = await ctx.client.createKanbanTask({ title: "to-complete" });
    await ctx.client.runKanbanDispatcher();
    await ctx.client.claimKanbanTask(task.id, "agent-a");
    const done = await ctx.client.completeKanbanTask(task.id, "agent-a");
    assert.equal(done.status, "done");
    assert.equal(done.claimedBy, null);
    assert.ok(done.completedAt && done.completedAt > 0);
  } finally {
    await ctx.close();
  }
});

test("fail returns task to ready, increments failure_count, dispatcher auto-blocks at threshold", async () => {
  const ctx = await spinUp();
  try {
    const task = await ctx.client.createKanbanTask({ title: "flaky" });
    await ctx.client.runKanbanDispatcher();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const claim = await ctx.client.claimKanbanTask(task.id, "agent-a");
      assert.equal(claim.claimed, true, `attempt ${attempt} should claim`);
      await ctx.client.failKanbanTask(task.id, `error attempt ${attempt}`, "agent-a");
    }
    const afterFail = await ctx.client.getKanbanTask(task.id);
    assert.equal(afterFail.failureCount, 3);
    assert.equal(afterFail.status, "ready");

    const tick = await ctx.client.runKanbanDispatcher({ autoBlockThreshold: 3 });
    assert.ok(tick.autoBlockedIds.includes(task.id));

    const blocked = await ctx.client.getKanbanTask(task.id);
    assert.equal(blocked.status, "blocked");
    assert.match(blocked.blockReason ?? "", /auto_blocked_after_3_failures/);
  } finally {
    await ctx.close();
  }
});

test("unblock returns task to todo when deps exist, ready when none", async () => {
  const ctx = await spinUp();
  try {
    const dep = await ctx.client.createKanbanTask({ title: "dep-task" });
    const a = await ctx.client.createKanbanTask({ title: "no-deps-blocked" });
    const b = await ctx.client.createKanbanTask({ title: "with-deps-blocked", dependsOnIds: [dep.id] });

    await ctx.client.blockKanbanTask(a.id, "manual hold");
    await ctx.client.blockKanbanTask(b.id, "manual hold");

    const aUnblocked = await ctx.client.unblockKanbanTask(a.id);
    assert.equal(aUnblocked.status, "ready");

    const bUnblocked = await ctx.client.unblockKanbanTask(b.id);
    assert.equal(bUnblocked.status, "todo");
  } finally {
    await ctx.close();
  }
});

test("stale claim is reclaimed by dispatcher tick", async () => {
  const ctx = await spinUp();
  try {
    const task = await ctx.client.createKanbanTask({ title: "stale-task" });
    await ctx.client.runKanbanDispatcher();
    const claim = await ctx.client.claimKanbanTask(task.id, "agent-slow", 10);
    assert.equal(claim.claimed, true);

    await new Promise((resolve) => setTimeout(resolve, 25));
    const tick = await ctx.client.runKanbanDispatcher();
    assert.ok(tick.reclaimedIds.includes(task.id), `expected reclaim, got ${JSON.stringify(tick)}`);

    const after = await ctx.client.getKanbanTask(task.id);
    assert.equal(after.status, "ready");
    assert.equal(after.failureCount, 1);
  } finally {
    await ctx.close();
  }
});

test("comments append and list ordered chronologically", async () => {
  const ctx = await spinUp();
  try {
    const task = await ctx.client.createKanbanTask({ title: "with-comments" });
    await ctx.client.addKanbanComment(task.id, "agent-a", "starting work");
    await new Promise((resolve) => setTimeout(resolve, 2));
    await ctx.client.addKanbanComment(task.id, "agent-b", "i can help");
    const list = await ctx.client.listKanbanComments(task.id);
    assert.equal(list.items.length, 2);
    assert.equal(list.items[0].body, "starting work");
    assert.equal(list.items[1].body, "i can help");
  } finally {
    await ctx.close();
  }
});

test("events log all state transitions for a task", async () => {
  const ctx = await spinUp();
  try {
    const task = await ctx.client.createKanbanTask({ title: "audited" });
    await ctx.client.runKanbanDispatcher();
    await ctx.client.claimKanbanTask(task.id, "agent-a");
    await ctx.client.completeKanbanTask(task.id, "agent-a");

    const events = await ctx.client.listKanbanEvents(task.id);
    const kinds = events.items.map((event) => event.kind);
    assert.ok(kinds.includes("created"));
    assert.ok(kinds.includes("transition"));
    assert.ok(kinds.includes("claimed"));
    assert.ok(kinds.includes("completed"));
  } finally {
    await ctx.close();
  }
});

test("board view groups tasks by status", async () => {
  const ctx = await spinUp();
  try {
    const dep = await ctx.client.createKanbanTask({ title: "board-dep" });
    await ctx.client.createKanbanTask({ title: "board-pending", dependsOnIds: [dep.id] });
    await ctx.client.runKanbanDispatcher();
    await ctx.client.claimKanbanTask(dep.id, "agent-a");

    const board = await ctx.client.getKanbanBoard();
    assert.equal(board.in_progress.length, 1);
    assert.equal(board.triage.length, 1);
  } finally {
    await ctx.close();
  }
});
