import assert from "node:assert/strict";
import { test } from "vitest";

import {
  clawDefaultStreamingBackpressurePolicy,
  estimateUtf8Bytes,
} from "@clawjs/core";

import { splitMonitorPayload } from "./monitor-routes.ts";

test("monitor stream splits large session deltas below the streaming frame limit", () => {
  const delta = "relay-monitor-delta-".repeat(5_000);
  const frames = splitMonitorPayload("monitor.session.delta", {
    scopeId: "scope-1",
    sessionId: "session-1",
    delta,
  });

  assert.ok(frames.length > 1);
  for (const frame of frames) {
    assert.ok(frame.frameBytes <= clawDefaultStreamingBackpressurePolicy.maxFrameBytes);
    assert.equal(frame.frameBytes, estimateUtf8Bytes(frame.frame));
  }

  const reconstructed = frames
    .map((frame) => {
      const line = frame.frame.split("\n").find((candidate) => candidate.startsWith("data: "));
      assert.ok(line);
      const payload = JSON.parse(line.slice("data: ".length)) as { delta: string };
      return payload.delta;
    })
    .join("");
  assert.equal(reconstructed, delta);
});

test("monitor stream replaces unsplittable oversized frames with observable overflow", () => {
  const frames = splitMonitorPayload("monitor.snapshot", {
    activity: [{ detail: "x".repeat(clawDefaultStreamingBackpressurePolicy.maxFrameBytes + 1) }],
  });

  assert.equal(frames.length, 1);
  assert.ok(frames[0]!.frameBytes <= clawDefaultStreamingBackpressurePolicy.maxFrameBytes);
  assert.match(frames[0]!.frame, /event: monitor\.overflow/);
  assert.match(frames[0]!.frame, /frame_too_large/);
});
