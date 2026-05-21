import { afterEach, expect, test, vi } from "vitest";

import { AdaptiveWorkerLoop } from "../../src/server/pipeline/adaptive_worker_loop.ts";

class FakeJobs {
  nextAt: number | null = null;
  private readonly listeners = new Set<() => void>();

  nextQueuedAt(): number | null {
    return this.nextAt;
  }

  onQueueChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emitQueueChange(): void {
    for (const listener of this.listeners) listener();
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

test("adaptive worker loop wakes immediately when due work is enqueued", async () => {
  vi.useFakeTimers();
  const jobs = new FakeJobs();
  const worker = { tick: vi.fn(async () => 0) };
  const loop = new AdaptiveWorkerLoop({ worker, jobs, workerBudget: 10, idleMinMs: 1000, idleMaxMs: 30000 });

  loop.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(worker.tick).toHaveBeenCalledTimes(1);

  jobs.nextAt = Date.now();
  jobs.emitQueueChange();
  await vi.advanceTimersByTimeAsync(0);

  expect(worker.tick).toHaveBeenCalledTimes(2);
  loop.stop();
});

test("adaptive worker loop does not poll every 500ms while idle", async () => {
  vi.useFakeTimers();
  const jobs = new FakeJobs();
  const worker = { tick: vi.fn(async () => 0) };
  const loop = new AdaptiveWorkerLoop({ worker, jobs, workerBudget: 10, idleMinMs: 1000, idleMaxMs: 30000 });

  loop.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(worker.tick).toHaveBeenCalledTimes(1);

  await vi.advanceTimersByTimeAsync(999);
  expect(worker.tick).toHaveBeenCalledTimes(1);

  await vi.advanceTimersByTimeAsync(1);
  expect(worker.tick).toHaveBeenCalledTimes(2);
  loop.stop();
});

test("adaptive worker loop waits until the next queued job is due", async () => {
  vi.useFakeTimers();
  const jobs = new FakeJobs();
  jobs.nextAt = Date.now() + 5000;
  const worker = { tick: vi.fn(async () => 0) };
  const loop = new AdaptiveWorkerLoop({ worker, jobs, workerBudget: 10, idleMinMs: 1000, idleMaxMs: 30000 });

  loop.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(worker.tick).toHaveBeenCalledTimes(1);

  await vi.advanceTimersByTimeAsync(4999);
  expect(worker.tick).toHaveBeenCalledTimes(1);

  await vi.advanceTimersByTimeAsync(1);
  expect(worker.tick).toHaveBeenCalledTimes(2);
  loop.stop();
});

test("adaptive worker loop reschedules future and immediate queue changes", async () => {
  vi.useFakeTimers();
  const jobs = new FakeJobs();
  const worker = { tick: vi.fn(async () => 0) };
  const loop = new AdaptiveWorkerLoop({ worker, jobs, workerBudget: 10, idleMinMs: 1000, idleMaxMs: 30000 });

  loop.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(worker.tick).toHaveBeenCalledTimes(1);

  jobs.nextAt = Date.now() + 4000;
  jobs.emitQueueChange();
  await vi.advanceTimersByTimeAsync(3999);
  expect(worker.tick).toHaveBeenCalledTimes(1);

  jobs.nextAt = Date.now();
  jobs.emitQueueChange();
  await vi.advanceTimersByTimeAsync(0);
  expect(worker.tick).toHaveBeenCalledTimes(2);
  loop.stop();
});

test("adaptive worker loop stop clears pending timers and queue listeners", async () => {
  vi.useFakeTimers();
  const jobs = new FakeJobs();
  const worker = { tick: vi.fn(async () => 0) };
  const loop = new AdaptiveWorkerLoop({ worker, jobs, workerBudget: 10, idleMinMs: 1000, idleMaxMs: 30000 });

  loop.start();
  await vi.advanceTimersByTimeAsync(0);
  loop.stop();

  jobs.nextAt = Date.now();
  jobs.emitQueueChange();
  await vi.advanceTimersByTimeAsync(60000);

  expect(worker.tick).toHaveBeenCalledTimes(1);
});
