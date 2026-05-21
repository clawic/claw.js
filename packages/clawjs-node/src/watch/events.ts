export interface ClawEvent<TPayload = unknown> {
  type: string;
  payload: TPayload;
  timestamp: string;
}

export type EventListener<TPayload = unknown> = (event: ClawEvent<TPayload>) => void;

export interface ClawEventBusOptions {
  iteratorQueueLimit?: number;
  now?: () => number;
}

export interface ClawEventIteratorOptions {
  signal?: AbortSignal;
  consumerTimeoutMs?: number;
  queueLimit?: number;
}

export interface ClawEventBusMetrics {
  iterators: number;
  queuedEvents: number;
  maxQueueDepth: number;
  coalescedEvents: number;
  droppedEvents: number;
  overflowCount: number;
  abortedIterators: number;
  timedOutIterators: number;
}

type IteratorPush = (event: ClawEvent) => void;
type IteratorCloseReason = "return" | "throw" | "abort" | "timeout";

interface QueuedClawEvent {
  event: ClawEvent;
  queuedAt: number;
}

interface MutableClawEventBusMetrics {
  maxQueueDepth: number;
  coalescedEvents: number;
  droppedEvents: number;
  overflowCount: number;
  abortedIterators: number;
  timedOutIterators: number;
}

const DEFAULT_ITERATOR_QUEUE_LIMIT = 256;

function normalizeQueueLimit(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

class ClawEventIteratorSubscription implements AsyncIterator<ClawEvent> {
  private readonly queue: QueuedClawEvent[] = [];
  private readonly queueLimit: number;
  private readonly now: () => number;
  private readonly metrics: MutableClawEventBusMetrics;
  private readonly unregister: (push: IteratorPush) => void;
  private readonly signal: AbortSignal | undefined;
  private readonly consumerTimeoutMs: number | undefined;
  private resolveNext: ((value: IteratorResult<ClawEvent>) => void) | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private readonly abortListener = () => {
    this.close("abort");
  };

  readonly push: IteratorPush = (event) => {
    if (this.closed) return;
    if (this.resolveNext) {
      const currentResolve = this.resolveNext;
      this.resolveNext = null;
      this.clearTimeout();
      currentResolve({ value: event, done: false });
      return;
    }

    const existingIndex = this.findLatestQueuedEventIndex(event.type);
    if (existingIndex >= 0) {
      this.queue[existingIndex] = { event, queuedAt: this.now() };
      this.metrics.coalescedEvents += 1;
      this.scheduleTimeout();
      return;
    }

    if (this.queue.length >= this.queueLimit) {
      this.queue.shift();
      this.metrics.droppedEvents += 1;
      this.metrics.overflowCount += 1;
    }

    this.queue.push({ event, queuedAt: this.now() });
    this.metrics.maxQueueDepth = Math.max(this.metrics.maxQueueDepth, this.queue.length);
    this.scheduleTimeout();
  };

  constructor(input: {
    queueLimit: number;
    now: () => number;
    metrics: MutableClawEventBusMetrics;
    unregister: (push: IteratorPush) => void;
    signal?: AbortSignal;
    consumerTimeoutMs?: number;
  }) {
    this.queueLimit = input.queueLimit;
    this.now = input.now;
    this.metrics = input.metrics;
    this.unregister = input.unregister;
    this.signal = input.signal;
    this.consumerTimeoutMs = input.consumerTimeoutMs;

    if (this.signal?.aborted) {
      this.closed = true;
      this.metrics.abortedIterators += 1;
      return;
    }
    this.signal?.addEventListener("abort", this.abortListener, { once: true });
  }

  [Symbol.asyncIterator](): AsyncIterator<ClawEvent> {
    return this;
  }

  async next(): Promise<IteratorResult<ClawEvent>> {
    if (this.closed) return { value: undefined, done: true };

    const queued = this.queue.shift();
    if (queued) {
      this.scheduleTimeout();
      return { value: queued.event, done: false };
    }

    return await new Promise<IteratorResult<ClawEvent>>((resolve) => {
      this.resolveNext = resolve;
      this.scheduleTimeout();
    });
  }

  async return(): Promise<IteratorResult<ClawEvent>> {
    this.close("return");
    return { value: undefined, done: true };
  }

  async throw(error?: unknown): Promise<IteratorResult<ClawEvent>> {
    this.close("throw");
    throw error;
  }

  queuedEvents(): number {
    return this.queue.length;
  }

  private findLatestQueuedEventIndex(type: string): number {
    for (let index = this.queue.length - 1; index >= 0; index -= 1) {
      if (this.queue[index]?.event.type === type) return index;
    }
    return -1;
  }

  private close(reason: IteratorCloseReason): void {
    if (this.closed) return;
    this.closed = true;
    if (reason === "abort") this.metrics.abortedIterators += 1;
    if (reason === "timeout") this.metrics.timedOutIterators += 1;
    this.clearTimeout();
    this.queue.length = 0;
    this.signal?.removeEventListener("abort", this.abortListener);
    this.unregister(this.push);
    if (this.resolveNext) {
      const currentResolve = this.resolveNext;
      this.resolveNext = null;
      currentResolve({ value: undefined, done: true });
    }
  }

  private scheduleTimeout(): void {
    this.clearTimeout();
    if (this.closed || this.consumerTimeoutMs === undefined) return;
    if (!Number.isFinite(this.consumerTimeoutMs) || this.consumerTimeoutMs <= 0) return;
    if (this.queue.length === 0 && !this.resolveNext) return;

    const oldestQueuedAt = this.queue[0]?.queuedAt;
    const timeoutMs = this.resolveNext || oldestQueuedAt === undefined
      ? this.consumerTimeoutMs
      : Math.max(0, oldestQueuedAt + this.consumerTimeoutMs - this.now());
    this.timeout = setTimeout(() => {
      this.close("timeout");
    }, timeoutMs);
  }

  private clearTimeout(): void {
    if (!this.timeout) return;
    clearTimeout(this.timeout);
    this.timeout = null;
  }
}

export class ClawEventBus {
  private readonly listeners = new Map<string, Set<EventListener>>();
  private readonly iterators = new Map<string, Set<IteratorPush>>();
  private readonly iteratorSubscriptions = new Set<ClawEventIteratorSubscription>();
  private readonly iteratorQueueLimit: number;
  private readonly now: () => number;
  private readonly metrics: MutableClawEventBusMetrics = {
    maxQueueDepth: 0,
    coalescedEvents: 0,
    droppedEvents: 0,
    overflowCount: 0,
    abortedIterators: 0,
    timedOutIterators: 0,
  };

  constructor(options: ClawEventBusOptions = {}) {
    this.iteratorQueueLimit = normalizeQueueLimit(options.iteratorQueueLimit, DEFAULT_ITERATOR_QUEUE_LIMIT);
    this.now = options.now ?? Date.now;
  }

  emit<TPayload>(type: string, payload: TPayload): void {
    const event: ClawEvent<TPayload> = {
      type,
      payload,
      timestamp: new Date(this.now()).toISOString(),
    };
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
    for (const listener of this.listeners.get("*") ?? []) {
      listener(event);
    }
    for (const push of this.iterators.get(type) ?? []) {
      push(event);
    }
    for (const push of this.iterators.get("*") ?? []) {
      push(event);
    }
  }

  on(type: string, listener: EventListener): () => void {
    const bucket = this.listeners.get(type) ?? new Set<EventListener>();
    bucket.add(listener);
    this.listeners.set(type, bucket);
    return () => {
      bucket.delete(listener);
      if (bucket.size === 0) {
        this.listeners.delete(type);
      }
    };
  }

  iterate(type = "*", options: ClawEventIteratorOptions = {}): AsyncIterable<ClawEvent> {
    const queueLimit = normalizeQueueLimit(options.queueLimit, this.iteratorQueueLimit);
    const bucket = this.iterators.get(type) ?? new Set<IteratorPush>();
    const subscription = new ClawEventIteratorSubscription({
      queueLimit,
      now: this.now,
      metrics: this.metrics,
      unregister: (push) => {
        const activeBucket = this.iterators.get(type);
        activeBucket?.delete(push);
        if (activeBucket?.size === 0) {
          this.iterators.delete(type);
        }
        this.iteratorSubscriptions.delete(subscription);
      },
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.consumerTimeoutMs !== undefined ? { consumerTimeoutMs: options.consumerTimeoutMs } : {}),
    });

    if (!options.signal?.aborted) {
      bucket.add(subscription.push);
      this.iterators.set(type, bucket);
      this.iteratorSubscriptions.add(subscription);
    }

    return subscription;
  }

  snapshotMetrics(): ClawEventBusMetrics {
    let queuedEvents = 0;
    for (const subscription of this.iteratorSubscriptions) {
      queuedEvents += subscription.queuedEvents();
    }
    return {
      iterators: this.iteratorSubscriptions.size,
      queuedEvents,
      ...this.metrics,
    };
  }
}
