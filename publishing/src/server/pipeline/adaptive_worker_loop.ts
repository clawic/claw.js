import type { JobsService } from "../domain/jobs.ts";
import type { Worker } from "./worker.ts";

interface Logger {
  error(input: unknown, message?: string): void;
}

export interface AdaptiveWorkerLoopOptions {
  worker: Pick<Worker, "tick">;
  jobs: Pick<JobsService, "nextQueuedAt" | "onQueueChange">;
  workerBudget: number;
  idleMinMs: number;
  idleMaxMs: number;
  logger?: Logger;
}

export class AdaptiveWorkerLoop {
  private readonly worker: Pick<Worker, "tick">;
  private readonly jobs: Pick<JobsService, "nextQueuedAt" | "onQueueChange">;
  private readonly workerBudget: number;
  private readonly idleMinMs: number;
  private readonly idleMaxMs: number;
  private readonly logger?: Logger;
  private timer: NodeJS.Timeout | null = null;
  private unsubscribe: (() => void) | null = null;
  private stopped = true;
  private running = false;
  private pendingWake = false;
  private idleDelayMs: number;

  constructor(options: AdaptiveWorkerLoopOptions) {
    this.worker = options.worker;
    this.jobs = options.jobs;
    this.workerBudget = Math.max(1, options.workerBudget);
    this.idleMinMs = Math.max(1, options.idleMinMs);
    this.idleMaxMs = Math.max(this.idleMinMs, options.idleMaxMs);
    this.logger = options.logger;
    this.idleDelayMs = this.idleMinMs;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.unsubscribe = this.jobs.onQueueChange(() => this.wake());
    this.schedule(0);
  }

  stop(): void {
    this.stopped = true;
    this.pendingWake = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  wake(): void {
    if (this.stopped) return;
    this.idleDelayMs = this.idleMinMs;
    if (this.running) {
      this.pendingWake = true;
      return;
    }
    const nextQueuedAt = this.jobs.nextQueuedAt();
    this.schedule(nextQueuedAt === null ? 0 : Math.min(Math.max(0, nextQueuedAt - Date.now()), this.idleMaxMs));
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, Math.max(0, delayMs));
    this.timer.unref?.();
  }

  private async run(): Promise<void> {
    if (this.stopped || this.running) return;
    this.running = true;
    let scheduleImmediate = false;
    try {
      const processed = await this.worker.tick(this.workerBudget);
      if (this.stopped) return;
      if (this.pendingWake) {
        this.pendingWake = false;
        this.idleDelayMs = this.idleMinMs;
        scheduleImmediate = true;
      } else if (processed > 0) {
        this.idleDelayMs = this.idleMinMs;
        scheduleImmediate = true;
      } else {
        this.scheduleNextIdle();
      }
    } catch (err) {
      this.logger?.error({ err }, "adaptive worker loop tick failed");
      if (!this.stopped) {
        const delay = this.idleDelayMs;
        this.idleDelayMs = Math.min(this.idleDelayMs * 2, this.idleMaxMs);
        this.schedule(delay);
      }
    } finally {
      this.running = false;
      if (!this.stopped && scheduleImmediate) this.schedule(0);
    }
  }

  private scheduleNextIdle(): void {
    const nextQueuedAt = this.jobs.nextQueuedAt();
    if (nextQueuedAt !== null) {
      this.idleDelayMs = this.idleMinMs;
      this.schedule(Math.min(Math.max(0, nextQueuedAt - Date.now()), this.idleMaxMs));
      return;
    }
    const delay = this.idleDelayMs;
    this.idleDelayMs = Math.min(this.idleDelayMs * 2, this.idleMaxMs);
    this.schedule(delay);
  }
}
