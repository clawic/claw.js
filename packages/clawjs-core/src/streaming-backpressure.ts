export const clawStreamingBackpressurePolicyId = "claw.streaming.default.v1" as const;

export type ClawStreamingBufferPolicy = "bounded_queue_close_slow_consumer";
export type ClawStreamingCoalescingPolicy = "same_message_or_animation_frame";
export type ClawStreamingSlowConsumerBehavior = "backpressure_then_close_or_abort";
export type ClawStreamingCancellationPolicy = "abort_signal_required";
export type ClawStreamingPersistencePolicy = "incremental_deltas_no_full_transcript_buffer";

export interface ClawStreamingBackpressurePolicy {
  id: typeof clawStreamingBackpressurePolicyId;
  maxFrameBytes: number;
  maxQueuedFrames: number;
  maxQueuedBytes: number;
  bufferPolicy: ClawStreamingBufferPolicy;
  coalescingPolicy: ClawStreamingCoalescingPolicy;
  slowConsumerBehavior: ClawStreamingSlowConsumerBehavior;
  cancellation: ClawStreamingCancellationPolicy;
  overflowMetricNames: readonly string[];
  persistence: ClawStreamingPersistencePolicy;
}

export const clawDefaultStreamingBackpressurePolicy: ClawStreamingBackpressurePolicy = {
  id: clawStreamingBackpressurePolicyId,
  maxFrameBytes: 65_536,
  maxQueuedFrames: 256,
  maxQueuedBytes: 16_777_216,
  bufferPolicy: "bounded_queue_close_slow_consumer",
  coalescingPolicy: "same_message_or_animation_frame",
  slowConsumerBehavior: "backpressure_then_close_or_abort",
  cancellation: "abort_signal_required",
  overflowMetricNames: [
    "streamOverflowCount",
    "streamDroppedFrames",
    "streamDroppedBytes",
    "streamClosedSlowConsumers",
  ],
  persistence: "incremental_deltas_no_full_transcript_buffer",
};

const textEncoder = new TextEncoder();

export function estimateUtf8Bytes(value: string): number {
  return textEncoder.encode(value).byteLength;
}

export function splitStreamingTextDelta(
  delta: string,
  maxFrameBytes = clawDefaultStreamingBackpressurePolicy.maxFrameBytes,
): string[] {
  if (!delta) return [];
  if (maxFrameBytes < 4) {
    throw new Error("maxFrameBytes must be at least 4 for UTF-8 streaming deltas");
  }
  if (estimateUtf8Bytes(delta) <= maxFrameBytes) return [delta];

  const frames: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const char of delta) {
    const charBytes = estimateUtf8Bytes(char);
    if (current && currentBytes + charBytes > maxFrameBytes) {
      frames.push(current);
      current = "";
      currentBytes = 0;
    }
    current += char;
    currentBytes += charBytes;
  }
  if (current) frames.push(current);
  return frames;
}
