export interface StorageOperationMetric {
  count: number;
  errors: number;
  slowCount: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  lastMs: number;
}

export interface StorageMetricsSnapshot {
  queueDepth: number;
  operations: Record<string, StorageOperationMetric>;
}

interface MutableOperationMetric {
  count: number;
  errors: number;
  slowCount: number;
  maxMs: number;
  lastMs: number;
  samples: number[];
}

export class StorageMetrics {
  private readonly operations = new Map<string, MutableOperationMetric>();
  private readonly slowThresholdMs: number;
  private readonly maxSamples: number;

  constructor(
    slowThresholdMs = 100,
    maxSamples = 512,
  ) {
    this.slowThresholdMs = slowThresholdMs;
    this.maxSamples = maxSamples;
  }

  record(operation: string, durationMs: number, error: boolean): void {
    const metric = this.operations.get(operation) ?? {
      count: 0,
      errors: 0,
      slowCount: 0,
      maxMs: 0,
      lastMs: 0,
      samples: [],
    };
    metric.count += 1;
    if (error) metric.errors += 1;
    if (durationMs >= this.slowThresholdMs) metric.slowCount += 1;
    metric.maxMs = Math.max(metric.maxMs, durationMs);
    metric.lastMs = durationMs;
    metric.samples.push(durationMs);
    if (metric.samples.length > this.maxSamples) metric.samples.shift();
    this.operations.set(operation, metric);
  }

  snapshot(queueDepth: number): StorageMetricsSnapshot {
    const operations: Record<string, StorageOperationMetric> = {};
    for (const [operation, metric] of this.operations) {
      const samples = [...metric.samples].sort((left, right) => left - right);
      operations[operation] = {
        count: metric.count,
        errors: metric.errors,
        slowCount: metric.slowCount,
        p50Ms: percentile(samples, 0.5),
        p95Ms: percentile(samples, 0.95),
        p99Ms: percentile(samples, 0.99),
        maxMs: round(metric.maxMs),
        lastMs: round(metric.lastMs),
      };
    }
    return { queueDepth, operations };
  }
}

function percentile(sortedSamples: number[], ratio: number): number {
  if (sortedSamples.length === 0) return 0;
  const index = Math.min(sortedSamples.length - 1, Math.floor(sortedSamples.length * ratio));
  return round(sortedSamples[index] ?? 0);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
