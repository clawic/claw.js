import assert from "node:assert/strict";
import { test } from "vitest";

import {
  clawDefaultStreamingBackpressurePolicy,
  clawStreamingBackpressurePolicyId,
  estimateUtf8Bytes,
  splitStreamingTextDelta,
} from "./streaming-backpressure.ts";

test("default streaming backpressure policy declares bounded transport rules", () => {
  assert.equal(clawDefaultStreamingBackpressurePolicy.id, clawStreamingBackpressurePolicyId);
  assert.equal(clawDefaultStreamingBackpressurePolicy.maxFrameBytes, 65_536);
  assert.equal(clawDefaultStreamingBackpressurePolicy.maxQueuedFrames, 256);
  assert.equal(clawDefaultStreamingBackpressurePolicy.maxQueuedBytes, 16_777_216);
  assert.equal(clawDefaultStreamingBackpressurePolicy.bufferPolicy, "bounded_queue_close_slow_consumer");
  assert.equal(clawDefaultStreamingBackpressurePolicy.cancellation, "abort_signal_required");
  assert.equal(clawDefaultStreamingBackpressurePolicy.persistence, "incremental_deltas_no_full_transcript_buffer");
  assert.ok(clawDefaultStreamingBackpressurePolicy.overflowMetricNames.includes("streamOverflowCount"));
});

test("splitStreamingTextDelta preserves text while respecting UTF-8 frame limits", () => {
  const input = `a${"😀".repeat(8)}z`;
  const frames = splitStreamingTextDelta(input, 8);

  assert.equal(frames.join(""), input);
  assert.ok(frames.length > 1);
  for (const frame of frames) {
    assert.ok(estimateUtf8Bytes(frame) <= 8);
  }
});
