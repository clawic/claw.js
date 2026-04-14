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
