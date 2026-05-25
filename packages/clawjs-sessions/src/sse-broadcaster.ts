import {
  clawDefaultStreamingBackpressurePolicy,
  clawStreamingBackpressurePolicyId,
  clawSessionEvents,
  estimateUtf8Bytes,
  splitStreamingTextDelta,
} from "@clawjs/core";

import type { SessionEvent } from "./types.ts";

export interface SessionSseWritable {
  write(chunk: string): boolean;
  end(): void;
  once(event: "drain", listener: () => void): this;
  off?(event: "drain", listener: () => void): this;
  removeListener?(event: "drain", listener: () => void): this;
  destroyed?: boolean;
  writableEnded?: boolean;
}

export interface SessionEventBroadcasterOptions {
  streamingPolicyId?: string;
  hardQueueLimit?: number;
  maxQueuedBytes?: number;
  maxFrameBytes?: number;
  maxSubscribers?: number;
  now?: () => number;
}

export interface SessionEventBroadcasterMetrics {
  streamingPolicyId: string;
  maxFrameBytes: number;
  hardQueueLimit: number;
  maxQueuedBytesLimit: number;
  subscribers: number;
  queuedEvents: number;
  queuedBytes: number;
  maxQueueDepth: number;
  maxQueuedBytes: number;
  coalescedEvents: number;
  droppedEvents: number;
  droppedBytes: number;
  overflowCount: number;
  lastFlushLatencyMs: number;
  closedSlowClients: number;
  closedFailedClients: number;
  writeFailureCount: number;
  rejectedSubscribers: number;
}

export const SESSION_EVENTS_STREAMING_POLICY_ID = clawStreamingBackpressurePolicyId;

type MutableSessionEventBroadcasterMetrics = Omit<
  SessionEventBroadcasterMetrics,
  "streamingPolicyId" | "maxFrameBytes" | "hardQueueLimit" | "maxQueuedBytesLimit" | "subscribers" | "queuedEvents" | "queuedBytes"
>;

interface QueuedSessionEvent {
  event: SessionEvent;
  frame: string;
  frameBytes: number;
  coalesceKey: string | null;
  queuedAt: number;
}

export interface SessionEventSubscription {
  enqueue(event: SessionEvent): void;
  close(): void;
  readonly queueDepth: number;
}

export function encodeSseEvent(event: SessionEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function messageUpdatedCoalesceKey(event: SessionEvent): string | null {
  if (event.type !== clawSessionEvents.messageUpdated) return null;
  if (!event.sessionId || !event.messageId) return null;
  return `${event.sessionId}:${event.messageId}`;
}

class SessionEventClient implements SessionEventSubscription {
  private readonly queue: QueuedSessionEvent[] = [];
  private readonly coalesced = new Map<string, QueuedSessionEvent>();
  private readonly raw: SessionSseWritable;
  private readonly options: Required<SessionEventBroadcasterOptions>;
  private readonly metrics: MutableSessionEventBroadcasterMetrics;
  private readonly onClose: (client: SessionEventClient) => void;
  private flushing = false;
  private waitingForDrain = false;
  private closed = false;
  private drainListener: (() => void) | null = null;

  constructor(
    raw: SessionSseWritable,
    options: Required<SessionEventBroadcasterOptions>,
    metrics: MutableSessionEventBroadcasterMetrics,
    onClose: (client: SessionEventClient) => void,
  ) {
    this.raw = raw;
    this.options = options;
    this.metrics = metrics;
    this.onClose = onClose;
  }

  get queueDepth(): number {
    return this.queue.length;
  }

  get queuedBytes(): number {
    return this.queue.reduce((total, event) => total + event.frameBytes, 0);
  }

  enqueue(event: SessionEvent): void {
    if (this.closed || this.raw.destroyed || this.raw.writableEnded) return;
    for (const frameEvent of splitOversizedSessionEvent(event, this.options.maxFrameBytes)) {
      this.enqueueFrame(frameEvent);
      if (this.closed) return;
    }
  }

  private enqueueFrame(event: SessionEvent): void {
    const frame = encodeSseEvent(event);
    const frameBytes = estimateUtf8Bytes(frame);
    if (frameBytes > this.options.maxFrameBytes) {
      this.closeForOverflow(event, frameBytes);
      return;
    }

    const coalesceKey = messageUpdatedCoalesceKey(event);
    if (coalesceKey) {
      const existing = this.coalesced.get(coalesceKey);
      if (existing) {
        this.metrics.droppedBytes += existing.frameBytes;
        existing.frame = frame;
        existing.frameBytes = frameBytes;
        existing.event = event;
        existing.queuedAt = this.options.now();
        this.metrics.coalescedEvents += 1;
        this.metrics.maxQueuedBytes = Math.max(this.metrics.maxQueuedBytes, this.queuedBytes);
        return;
      }
    }

    if (this.queue.length >= this.options.hardQueueLimit || this.queuedBytes + frameBytes > this.options.maxQueuedBytes) {
      this.closeForOverflow(event, frameBytes);
      return;
    }

    const queued = { event, frame, frameBytes, coalesceKey, queuedAt: this.options.now() };
    this.queue.push(queued);
    if (coalesceKey) this.coalesced.set(coalesceKey, queued);
    this.metrics.maxQueueDepth = Math.max(this.metrics.maxQueueDepth, this.queue.length);
    this.metrics.maxQueuedBytes = Math.max(this.metrics.maxQueuedBytes, this.queuedBytes);
    this.flush();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.removeDrainListener();
    this.queue.length = 0;
    this.coalesced.clear();
    this.onClose(this);
  }

  private closeForWriteFailure(): void {
    if (this.closed) return;
    this.metrics.droppedEvents += this.queue.length;
    this.metrics.droppedBytes += this.queuedBytes;
    this.metrics.closedFailedClients += 1;
    this.metrics.writeFailureCount += 1;
    this.closed = true;
    this.removeDrainListener();
    this.queue.length = 0;
    this.coalesced.clear();
    this.onClose(this);
    try {
      this.raw.end();
    } catch {
      // The transport already failed; subscriber removal and metrics are the durable recovery signal.
    }
  }

  private closeForOverflow(triggerEvent: SessionEvent, triggerBytes = 0): void {
    if (this.closed) return;
    const dropped = this.queue.length + 1;
    const droppedBytes = this.queuedBytes + triggerBytes;
    this.metrics.droppedEvents += dropped;
    this.metrics.droppedBytes += droppedBytes;
    this.metrics.overflowCount += 1;
    this.metrics.closedSlowClients += 1;
    this.closed = true;
    this.removeDrainListener();
    this.queue.length = 0;
    this.coalesced.clear();
    this.onClose(this);

    const diagnostic: SessionEvent = {
      type: "error",
      at: this.options.now(),
      payload: {
        error: "session_event_stream_overflow",
        streamingPolicyId: this.options.streamingPolicyId,
        maxFrameBytes: this.options.maxFrameBytes,
        hardQueueLimit: this.options.hardQueueLimit,
        maxQueuedBytes: this.options.maxQueuedBytes,
        dropped,
        droppedBytes,
        triggerType: triggerEvent.type,
      },
    };
    try {
      this.raw.write(encodeSseEvent(diagnostic));
    } catch {
      // The client is already being closed; the metrics above are the durable signal.
    }
    try {
      this.raw.end();
    } catch {
      // Nothing useful remains to do for a failed slow-client close.
    }
  }

  private closeForTransportEnd(): void {
    if (this.closed) return;
    this.closed = true;
    this.removeDrainListener();
    this.queue.length = 0;
    this.coalesced.clear();
    this.onClose(this);
  }

  private flush(): void {
    if (this.flushing || this.waitingForDrain || this.closed) return;
    if (this.raw.destroyed || this.raw.writableEnded) {
      this.closeForTransportEnd();
      return;
    }
    this.flushing = true;
    try {
      while (this.queue.length > 0 && !this.closed) {
        if (this.raw.destroyed || this.raw.writableEnded) {
          this.closeForTransportEnd();
          return;
        }
        const next = this.queue[0];
        let accepted: boolean;
        try {
          accepted = this.raw.write(next.frame);
        } catch {
          this.closeForWriteFailure();
          return;
        }
        this.shiftWrittenEvent();
        this.metrics.lastFlushLatencyMs = Math.max(0, this.options.now() - next.queuedAt);
        if (!accepted) {
          this.waitingForDrain = true;
          const onDrain = () => {
            this.waitingForDrain = false;
            this.drainListener = null;
            if (this.raw.destroyed || this.raw.writableEnded) {
              this.closeForTransportEnd();
              return;
            }
            this.flush();
          };
          this.drainListener = onDrain;
          this.raw.once("drain", onDrain);
          return;
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  private removeDrainListener(): void {
    if (!this.drainListener) return;
    const listener = this.drainListener;
    this.drainListener = null;
    this.waitingForDrain = false;
    if (this.raw.off) {
      this.raw.off("drain", listener);
      return;
    }
    this.raw.removeListener?.("drain", listener);
  }

  private shiftWrittenEvent(): void {
    const written = this.queue.shift();
    if (!written?.coalesceKey) return;
    if (this.coalesced.get(written.coalesceKey) === written) {
      this.coalesced.delete(written.coalesceKey);
    }
  }
}

export class SessionEventBroadcaster {
  private readonly clients = new Set<SessionEventClient>();
  private readonly options: Required<SessionEventBroadcasterOptions>;
  private readonly metrics = {
    maxQueueDepth: 0,
    maxQueuedBytes: 0,
    coalescedEvents: 0,
    droppedEvents: 0,
    droppedBytes: 0,
    overflowCount: 0,
    lastFlushLatencyMs: 0,
    closedSlowClients: 0,
    closedFailedClients: 0,
    writeFailureCount: 0,
    rejectedSubscribers: 0,
  };

  constructor(options: SessionEventBroadcasterOptions = {}) {
    this.options = {
      streamingPolicyId: options.streamingPolicyId ?? SESSION_EVENTS_STREAMING_POLICY_ID,
      hardQueueLimit: options.hardQueueLimit ?? clawDefaultStreamingBackpressurePolicy.maxQueuedFrames,
      maxQueuedBytes: options.maxQueuedBytes ?? clawDefaultStreamingBackpressurePolicy.maxQueuedBytes,
      maxFrameBytes: options.maxFrameBytes ?? clawDefaultStreamingBackpressurePolicy.maxFrameBytes,
      maxSubscribers: options.maxSubscribers ?? 128,
      now: options.now ?? Date.now,
    };
  }

  subscribe(raw: SessionSseWritable): SessionEventSubscription {
    const subscription = this.trySubscribe(raw);
    if (!subscription) throw new Error("too many session event subscribers");
    return subscription;
  }

  trySubscribe(raw: SessionSseWritable): SessionEventSubscription | null {
    if (this.clients.size >= this.options.maxSubscribers) {
      this.metrics.rejectedSubscribers += 1;
      return null;
    }
    const client = new SessionEventClient(raw, this.options, this.metrics, (closedClient) => {
      this.clients.delete(closedClient);
    });
    this.clients.add(client);
    return client;
  }

  publish(event: SessionEvent): void {
    for (const client of [...this.clients]) {
      client.enqueue(event);
    }
  }

  close(): void {
    for (const client of [...this.clients]) {
      client.close();
    }
  }

  snapshotMetrics(): SessionEventBroadcasterMetrics {
    let queuedEvents = 0;
    let queuedBytes = 0;
    for (const client of this.clients) {
      queuedEvents += client.queueDepth;
      queuedBytes += client.queuedBytes;
    }
    return {
      streamingPolicyId: this.options.streamingPolicyId,
      maxFrameBytes: this.options.maxFrameBytes,
      hardQueueLimit: this.options.hardQueueLimit,
      maxQueuedBytesLimit: this.options.maxQueuedBytes,
      subscribers: this.clients.size,
      queuedEvents,
      queuedBytes,
      ...this.metrics,
    };
  }
}

function cloneSessionEventWithContentText(event: SessionEvent, contentText: string): SessionEvent {
  const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
    ? event.payload as Record<string, unknown>
    : {};
  const delta = payload.delta && typeof payload.delta === "object" && !Array.isArray(payload.delta)
    ? payload.delta as Record<string, unknown>
    : {};
  return {
    ...event,
    payload: {
      ...payload,
      delta: {
        ...delta,
        contentText,
      },
    },
  };
}

function splitOversizedSessionEvent(event: SessionEvent, maxFrameBytes: number): SessionEvent[] {
  if (estimateUtf8Bytes(encodeSseEvent(event)) <= maxFrameBytes) return [event];
  if (event.type !== clawSessionEvents.messageUpdated) return [event];
  const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
    ? event.payload as Record<string, unknown>
    : {};
  const delta = payload.delta && typeof payload.delta === "object" && !Array.isArray(payload.delta)
    ? payload.delta as Record<string, unknown>
    : {};
  if (typeof delta.contentText !== "string" || !delta.contentText) return [event];

  const emptyFrameBytes = estimateUtf8Bytes(encodeSseEvent(cloneSessionEventWithContentText(event, "")));
  const maxDeltaBytes = Math.max(4, maxFrameBytes - emptyFrameBytes - 16);
  return splitStreamingTextDelta(delta.contentText, maxDeltaBytes)
    .map((contentText) => cloneSessionEventWithContentText(event, contentText));
}
