import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { z } from "zod";

export const BridgeStatusSchema = z.object({
  v: z.literal(1),
  pid: z.number().int().min(1),
  nodeId: z.string().min(1),
  displayName: z.string().min(1),
  host: z.string().min(1),
  bridgePort: z.number().int().min(1).max(65535),
  httpPort: z.number().int().min(1).max(65535),
  startedAt: z.string().datetime(),
  lastHeartbeatAt: z.string().datetime(),
  version: z.string().optional(),
});

export type BridgeStatus = z.infer<typeof BridgeStatusSchema>;

export interface HeartbeatWriterOptions {
  path: string;
  intervalMs?: number;
  initial: Omit<BridgeStatus, "v" | "lastHeartbeatAt">;
  now?: () => Date;
}

export class HeartbeatWriter {
  private readonly path: string;
  private readonly intervalMs: number;
  private readonly base: Omit<BridgeStatus, "v" | "lastHeartbeatAt">;
  private readonly now: () => Date;
  private timer: NodeJS.Timeout | null = null;

  constructor(opts: HeartbeatWriterOptions) {
    this.path = opts.path;
    this.intervalMs = opts.intervalMs ?? 5_000;
    this.base = opts.initial;
    this.now = opts.now ?? (() => new Date());
  }

  async start(): Promise<void> {
    await this.write();
    if (this.intervalMs > 0) {
      this.timer = setInterval(() => {
        void this.write().catch(() => {
          /* heartbeat failures should not crash the daemon */
        });
      }, this.intervalMs);
      this.timer.unref?.();
    }
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    try {
      await rm(this.path, { force: true });
    } catch {
      /* ignore */
    }
  }

  async write(): Promise<BridgeStatus> {
    const status: BridgeStatus = BridgeStatusSchema.parse({
      v: 1,
      ...this.base,
      lastHeartbeatAt: this.now().toISOString(),
    });
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, JSON.stringify(status, null, 2), "utf8");
    return status;
  }
}
