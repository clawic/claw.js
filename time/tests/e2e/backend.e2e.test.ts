import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildTimeApp } from "../../src/server/app.ts";

const state: {
  baseUrl: string;
  stop?: () => Promise<void>;
} = {
  baseUrl: "",
};

before(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-time-e2e-"));
  const built = buildTimeApp({
    config: {
      host: "127.0.0.1",
      port: 0,
      dataDir: path.join(tmpDir, "data"),
      dbPath: path.join(tmpDir, "data", "core.sqlite"),
      defaultTimeZone: "UTC",
      schedulerIntervalMs: 50,
    },
  });
  const address = await built.app.listen({ host: "127.0.0.1", port: 0 });
  state.baseUrl = address.replace(/\/$/, "");
  state.stop = async () => {
    await built.app.close();
  };
});

after(async () => {
  await state.stop?.();
});

test("time service stores items, projects v1 views, and cancels follow-ups", async () => {
  const eventResponse = await fetch(`${state.baseUrl}/v1/items`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind: "event",
      title: "Release review",
      startsAt: "2026-04-10T09:00:00.000Z",
      schedule: { mode: "one_off", timezone: "UTC", startsAt: "2026-04-10T09:00:00.000Z" },
    }),
  });
  assert.equal(eventResponse.status, 201);
  const { item: eventItem } = await eventResponse.json() as { item: { id: string } };

  const routineResponse = await fetch(`${state.baseUrl}/v1/items`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind: "routine",
      title: "Check deployment health",
      natural: { command: "every", expression: "3h" },
    }),
  });
  const { item: routineItem } = await routineResponse.json() as { item: { id: string } };
  assert.ok(routineItem.id);

  const followUpResponse = await fetch(`${state.baseUrl}/v1/items`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind: "follow_up",
      title: "No reply follow-up",
      natural: {
        command: "after",
        expression: "24h if no reply",
        anchorType: "thread",
        anchorId: "thread-42",
        anchorAt: "2026-04-09T08:00:00.000Z",
      },
    }),
  });
  const { item: followUp } = await followUpResponse.json() as { item: { id: string } };

  const calendar = await fetch(`${state.baseUrl}/v1/views/calendar?start=2026-04-01T00%3A00%3A00.000Z&end=2026-04-30T23%3A59%3A59.999Z`);
  const calendarPayload = await calendar.json() as { entries: Array<{ id: string }> };
  assert.equal(calendarPayload.entries.some((entry) => entry.id === eventItem.id), true);

  const timeline = await fetch(`${state.baseUrl}/v1/views/timeline`);
  const timelinePayload = await timeline.json() as { items: Array<{ id: string }> };
  assert.equal(timelinePayload.items.some((entry) => entry.id === routineItem.id), true);

  const signalResponse = await fetch(`${state.baseUrl}/v1/signals`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ anchorId: "thread-42", signal: "reply_received" }),
  });
  const signalPayload = await signalResponse.json() as { items: Array<{ id: string; status: string }> };
  assert.equal(signalPayload.items.find((entry) => entry.id === followUp.id)?.status, "cancelled");
});
