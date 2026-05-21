import { clawSessionEvents } from "@clawjs/core";

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
  hardQueueLimit?: number;
  now?: () => number;
}

export interface SessionEventBroadcasterMetrics {
  subscribers: number;
  queuedEvents: number;
  maxQueueDepth: number;
  coalescedEvents: number;
  droppedEvents: number;
  lastFlushLatencyMs: number;
  closedSlowClients: number;
}

interface QueuedSessionEvent {
  event: SessionEvent;
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
  private readonly metrics: Omit<SessionEventBroadcasterMetrics, "subscribers" | "queuedEvents">;
  private readonly onClose: (client: SessionEventClient) => void;
  private flushing = false;
  private waitingForDrain = false;
  private closed = false;

  constructor(
    raw: SessionSseWritable,
    options: Required<SessionEventBroadcasterOptions>,
    metrics: Omit<SessionEventBroadcasterMetrics, "subscribers" | "queuedEvents">,
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

  enqueue(event: SessionEvent): void {
    if (this.closed || this.raw.destroyed || this.raw.writableEnded) return;

    const coalesceKey = messageUpdatedCoalesceKey(event);
    if (coalesceKey) {
      const existing = this.coalesced.get(coalesceKey);
      if (existing) {
        existing.event = event;
        existing.queuedAt = this.options.now();
        this.metrics.coalescedEvents += 1;
        return;
      }
    }

    if (this.queue.length >= this.options.hardQueueLimit) {
      this.closeForOverflow(event);
      return;
    }

    const queued = { event, coalesceKey, queuedAt: this.options.now() };
    this.queue.push(queued);
    if (coalesceKey) this.coalesced.set(coalesceKey, queued);
    this.metrics.maxQueueDepth = Math.max(this.metrics.maxQueueDepth, this.queue.length);
    this.flush();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.queue.length = 0;
    this.coalesced.clear();
    this.onClose(this);
  }

  private closeForOverflow(triggerEvent: SessionEvent): void {
    if (this.closed) return;
    const dropped = this.queue.length + 1;
    this.metrics.droppedEvents += dropped;
    this.metrics.closedSlowClients += 1;
    this.closed = true;
    this.queue.length = 0;
    this.coalesced.clear();
    this.onClose(this);

    const diagnostic: SessionEvent = {
      type: "error",
      at: this.options.now(),
      payload: {
        error: "session_event_stream_overflow",
        dropped,
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

  private flush(): void {
    if (this.flushing || this.waitingForDrain || this.closed) return;
    this.flushing = true;
    try {
      while (this.queue.length > 0 && !this.closed) {
        const next = this.queue[0];
        const accepted = this.raw.write(encodeSseEvent(next.event));
        this.shiftWrittenEvent();
        this.metrics.lastFlushLatencyMs = Math.max(0, this.options.now() - next.queuedAt);
        if (!accepted) {
          this.waitingForDrain = true;
          const onDrain = () => {
            this.waitingForDrain = false;
            this.flush();
          };
          this.raw.once("drain", onDrain);
          return;
        }
      }
    } finally {
      this.flushing = false;
    }
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
    coalescedEvents: 0,
    droppedEvents: 0,
    lastFlushLatencyMs: 0,
    closedSlowClients: 0,
  };

  constructor(options: SessionEventBroadcasterOptions = {}) {
    this.options = {
      hardQueueLimit: options.hardQueueLimit ?? 256,
      now: options.now ?? Date.now,
    };
  }

  subscribe(raw: SessionSseWritable): SessionEventSubscription {
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
    for (const client of this.clients) queuedEvents += client.queueDepth;
    return {
      subscribers: this.clients.size,
      queuedEvents,
      ...this.metrics,
    };
  }
}
