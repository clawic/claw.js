import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildTimeApp } from "../../../../time/src/server/app.ts";
import { TimeClient } from "./index.ts";

test("TimeClient can create items, read legacy projections, and cancel follow-ups", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-time-client-"));
  const built = buildTimeApp({
    config: {
      host: "127.0.0.1",
      port: 0,
      dataDir: path.join(tmpDir, "data"),
      dbPath: path.join(tmpDir, "data", "time.sqlite"),
      defaultTimeZone: "UTC",
      schedulerIntervalMs: 50,
    },
  });
  const address = await built.app.listen({ host: "127.0.0.1", port: 0 });
  const client = new TimeClient({ baseUrl: address.replace(/\/$/, "") });

  try {
    const created = await client.create({
      kind: "routine",
      title: "Deployment health",
      natural: { command: "every", expression: "3h" },
    });
    assert.equal(created.item.kind, "routine");

    const routines = await client.legacyRoutines();
    assert.equal(routines.routines.length, 1);

    const followUp = await client.create({
      kind: "follow_up",
      title: "Wait for reply",
      natural: {
        command: "after",
        expression: "24h if no reply",
        anchorType: "thread",
        anchorId: "thread-client",
        anchorAt: "2026-04-09T08:00:00.000Z",
      },
    });
    const signalled = await client.signalAnchor({ anchorId: "thread-client", signal: "reply_received" });
    assert.equal(signalled.items[0]?.id, followUp.item.id);
  } finally {
    await built.app.close();
  }
});

test("heartbeat routines enforce runtime safety, budgets, targets, and compact run log", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-time-runtime-"));
  let matches = [{ source: "workspace.tasks", id: "task-1", title: "Ready task", updatedAt: "2026-04-09T08:00:00.000Z" }];
  let releaseAgent: (() => void) | undefined;
  let agentEntered!: () => void;
  const agentEnteredPromise = new Promise<void>((resolve) => {
    agentEntered = resolve;
  });
  const agentCalls: Array<{ target: string; matches: unknown[] }> = [];
  const built = buildTimeApp({
    config: {
      host: "127.0.0.1",
      port: 0,
      dataDir: path.join(tmpDir, "data"),
      dbPath: path.join(tmpDir, "data", "time.sqlite"),
      defaultTimeZone: "UTC",
      schedulerIntervalMs: 50,
    },
    maxCatchUpPerCycle: 1,
    missedJobStaggerMs: 5_000,
    heartbeatChecks: {
      "workspace.tasks": async () => matches,
    },
    heartbeatAgent: async (input) => {
      agentCalls.push({ target: input.target, matches: input.matches });
      if (input.prompt.includes("hold")) {
        agentEntered();
        await new Promise<void>((resolve) => {
          releaseAgent = resolve;
        });
      }
      if (input.prompt.includes("noop")) return { status: "noop", summary: "nothing useful" };
      if (input.prompt.includes("fail")) throw new Error("agent failed");
      return { status: "done", summary: `target ${input.target}` };
    },
  });
  const address = await built.app.listen({ host: "127.0.0.1", port: 0 });
  const client = new TimeClient({ baseUrl: address.replace(/\/$/, "") });
  const due = (id: string, at = "2026-04-09T08:00:00.000Z") => {
    const item = built.store.getItem(id);
    assert.ok(item);
    item.nextRunAt = at;
    built.store.putItem(item);
  };

  try {
    const duplicate = await client.create({
      kind: "routine",
      title: "No duplicate",
      natural: { command: "every", expression: "5m" },
      heartbeat: {
        when: ["workspace.tasks:new"],
        context: "diff",
        limit: 20,
        prompt: "hold work",
        target: "main",
      },
    });
    due(duplicate.item.id);
    const first = built.engine.runSchedulerCycle();
    const second = await built.engine.runSchedulerCycle();
    assert.deepEqual(second, []);
    await agentEnteredPromise;
    releaseAgent?.();
    assert.equal((await first).length, 1);
    assert.equal(agentCalls.length, 1);
    assert.equal(agentCalls[0]?.target, "main");

    const cooldown = await client.create({
      kind: "routine",
      title: "Cooldown",
      natural: { command: "every", expression: "5m" },
      heartbeat: {
        when: ["workspace.tasks:new"],
        context: "diff",
        limit: 20,
        prompt: "cooldown work",
        cooldownMs: 60_000,
        maxWakesPerWindow: { count: 1, windowMs: 300_000 },
      },
    });
    due(cooldown.item.id);
    assert.equal((await built.engine.runSchedulerCycle()).length, 1);
    due(cooldown.item.id, "2026-04-09T08:01:00.000Z");
    assert.deepEqual(await built.engine.runSchedulerCycle(), []);
    const cooled = built.store.getItem(cooldown.item.id);
    assert.equal(cooled?.heartbeat?.state?.lastSkipReason, "heartbeat cooldown active");

    const quiet = await client.create({
      kind: "routine",
      title: "Quiet",
      natural: { command: "every", expression: "5m" },
      heartbeat: {
        when: ["workspace.tasks:new"],
        context: "diff",
        limit: 20,
        prompt: "quiet work",
        activeHours: { start: "00:00", end: "00:00", timezone: "UTC" },
      },
    });
    due(quiet.item.id);
    assert.deepEqual(await built.engine.runSchedulerCycle(), []);
    assert.equal(built.store.getItem(quiet.item.id)?.heartbeat?.state?.lastSkipReason, "outside active hours");

    const noop = await client.create({
      kind: "routine",
      title: "Noop",
      natural: { command: "every", expression: "5m" },
      heartbeat: {
        when: ["workspace.tasks:new"],
        context: "diff",
        limit: 20,
        prompt: "noop work",
      },
    });
    due(noop.item.id);
    assert.deepEqual(await built.engine.runSchedulerCycle(), []);
    assert.equal((await client.listExecutions(noop.item.id)).executions.length, 0);
    assert.equal((await client.listRunLog(noop.item.id)).entries[0]?.status, "noop");

    const fail = await client.create({
      kind: "routine",
      title: "Failing",
      natural: { command: "every", expression: "5m" },
      heartbeat: {
        when: ["workspace.tasks:new"],
        context: "diff",
        limit: 20,
        prompt: "fail work",
      },
    });
    due(fail.item.id);
    const failedRuns = await built.engine.runSchedulerCycle();
    assert.equal(failedRuns.length, 1);
    const failed = built.store.getItem(fail.item.id);
    assert.equal(failed?.runtime?.consecutiveErrors, 1);
    assert.ok(failed?.nextRunAt && failed.nextRunAt > new Date().toISOString());

    const transient = await client.create({
      kind: "routine",
      title: "Transient one-shot",
      schedule: {
        mode: "relative",
        timezone: "UTC",
        relative: {
          anchorType: "task",
          anchorId: "task-transient",
          anchorAt: "2026-04-09T08:00:00.000Z",
          offsetMs: 0,
        },
      },
      heartbeat: {
        when: ["workspace.tasks:new"],
        context: "diff",
        limit: 20,
        prompt: "fail one-shot work",
      },
    });
    for (const at of ["2026-04-09T08:10:00.000Z", "2026-04-09T08:11:00.000Z", "2026-04-09T08:12:00.000Z"]) {
      due(transient.item.id, at);
      assert.equal((await built.engine.runSchedulerCycle()).length, 1);
    }
    const exhausted = built.store.getItem(transient.item.id);
    assert.equal(exhausted?.status, "paused");
    assert.equal(exhausted?.nextRunAt, undefined);
    assert.equal(exhausted?.runtime?.consecutiveErrors, 3);

    const catchupA = await client.create({ kind: "routine", title: "Catch A", natural: { command: "every", expression: "5m" } });
    const catchupB = await client.create({ kind: "routine", title: "Catch B", natural: { command: "every", expression: "5m" } });
    due(catchupA.item.id);
    due(catchupB.item.id);
    const catchupRuns = await built.engine.runSchedulerCycle();
    assert.equal(catchupRuns.length, 1);
    const deferred = [built.store.getItem(catchupA.item.id), built.store.getItem(catchupB.item.id)]
      .find((item) => item?.nextRunAt && item.nextRunAt > new Date().toISOString());
    assert.ok(deferred);

    const stagger = await client.create({
      kind: "routine",
      title: "Stagger",
      natural: { command: "every", expression: "30s" },
      schedule: { staggerMs: 30_000 },
    });
    assert.equal(stagger.item.schedule.cron, "*/30 * * * * *");
    assert.equal(stagger.item.schedule.staggerMs, 30_000);
  } finally {
    await built.app.close();
  }
});

test("heartbeat scheduler recovers stale running executions on startup", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-time-stale-"));
  const dbPath = path.join(tmpDir, "data", "time.sqlite");
  const built = buildTimeApp({
    config: {
      host: "127.0.0.1",
      port: 0,
      dataDir: path.join(tmpDir, "data"),
      dbPath,
      defaultTimeZone: "UTC",
      schedulerIntervalMs: 50,
    },
  });
  const address = await built.app.listen({ host: "127.0.0.1", port: 0 });
  const client = new TimeClient({ baseUrl: address.replace(/\/$/, "") });

  const created = await client.create({
    kind: "routine",
    title: "Recover stale",
    natural: { command: "every", expression: "5m" },
  });
  const staleExecution = {
    id: "stale-execution",
    itemId: created.item.id,
    status: "running" as const,
    scheduledFor: "2026-04-09T08:00:00.000Z",
    startedAt: "2026-04-09T08:00:00.000Z",
    triggeredBy: "scheduler" as const,
  };
  built.store.putExecution(staleExecution);
  built.store.putItem({
    ...created.item,
    runtime: {
      runningExecutionId: staleExecution.id,
      runningAt: staleExecution.startedAt,
    },
  });
  await built.app.close();

  const restarted = buildTimeApp({
    config: {
      host: "127.0.0.1",
      port: 0,
      dataDir: path.join(tmpDir, "data"),
      dbPath,
      defaultTimeZone: "UTC",
      schedulerIntervalMs: 50,
    },
  });
  const recovered = restarted.store.listExecutions(created.item.id)[0];
  assert.equal(recovered?.status, "failed");
  assert.match(recovered?.error ?? "", /stale running/);
  assert.equal(restarted.store.getItem(created.item.id)?.runtime?.runningAt, undefined);
  restarted.engine.close();
});
