import assert from "node:assert/strict";
import { test } from "vitest";

import { invokeChannelProcessor } from "./processors.ts";

import type { ChannelMessageRecord, ChannelProcessorDescriptor } from "@clawjs/core";

function processor(command: string): ChannelProcessorDescriptor {
  const now = new Date().toISOString();
  return {
    id: "timeout-test",
    command,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

function message(): ChannelMessageRecord {
  const now = new Date().toISOString();
  return {
    id: "message.timeout",
    provider: "telegram",
    accountId: "support",
    targetId: "1001",
    direction: "inbound",
    status: "received",
    text: "hello",
    createdAt: now,
    updatedAt: now,
  };
}

test("channel processor timeout rejects instead of reporting a clean ignored result", async () => {
  await assert.rejects(
    () => invokeChannelProcessor(
      processor(`${process.execPath} -e "setTimeout(() => {}, 10000)"`),
      {
        type: "channel.message.received",
        provider: "telegram",
        accountId: "support",
        targetId: "1001",
        message: message(),
      },
      { timeoutMs: 25 },
    ),
    /channel processor timeout-test timed out after 25ms/,
  );
});
