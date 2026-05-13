import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  BridgeStatusSchema,
  HeartbeatWriter,
} from "./heartbeat.ts";

async function withTmp(): Promise<{ path: string }> {
  const dir = await mkdtemp(join(tmpdir(), "mesh-heartbeat-"));
  return { path: join(dir, "state", "bridge-status.json") };
}

test("write produces a valid status file", async () => {
  const { path } = await withTmp();
  const writer = new HeartbeatWriter({
    path,
    intervalMs: 0,
    initial: {
      pid: 1234,
      nodeId: "node-1",
      displayName: "Studio Mac",
      host: "127.0.0.1",
      bridgePort: 7778,
      httpPort: 7779,
      startedAt: new Date("2026-05-10T10:00:00.000Z").toISOString(),
      version: "0.1.0",
    },
    now: () => new Date("2026-05-10T10:01:00.000Z"),
  });
  await writer.start();
  const text = await readFile(path, "utf8");
  const status = BridgeStatusSchema.parse(JSON.parse(text));
  assert.equal(status.nodeId, "node-1");
  assert.equal(status.bridgePort, 7778);
  assert.equal(status.lastHeartbeatAt, "2026-05-10T10:01:00.000Z");
  await writer.stop();
});

test("stop removes the status file", async () => {
  const { path } = await withTmp();
  const writer = new HeartbeatWriter({
    path,
    intervalMs: 0,
    initial: {
      pid: 1,
      nodeId: "n",
      displayName: "d",
      host: "127.0.0.1",
      bridgePort: 7778,
      httpPort: 7779,
      startedAt: new Date().toISOString(),
    },
  });
  await writer.start();
  await writer.stop();
  await assert.rejects(stat(path));
});
