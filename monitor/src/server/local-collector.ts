import type { MonitorConfig } from "./config.ts";
import type { MonitorDatabase } from "./db.ts";
import type { MonitorStatus } from "../shared/types.ts";
import { discoverLocalInstances, probeGateway } from "./local-discovery.ts";

export class LocalCollector {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private discoveryTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly db: MonitorDatabase,
    private readonly config: MonitorConfig,
  ) {}

  start(): void {
    if (this.timer) return;
    console.log(`[local-collector] Starting local collection every ${this.config.collectIntervalMs}ms`);
    console.log(`[local-collector] Re-discovery every ${this.config.localDiscoveryIntervalMs}ms`);

    // Health checks run on the same interval as relay heartbeats
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.config.collectIntervalMs);

    // Re-discovery runs less frequently
    this.discoveryTimer = setInterval(() => void this.discover().catch((err) => {
      console.error("[local-collector] Re-discovery failed:", err);
    }), this.config.localDiscoveryIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer);
      this.discoveryTimer = null;
    }
  }

  async discover(): Promise<{ created: number; monitors: string[] }> {
    const created: string[] = [];
    const instances = await discoverLocalInstances(this.config.localScanPorts);

    for (const instance of instances) {
      // Persist instance in DB
      this.db.upsertInstance(instance);

      // Create a monitor for each instance
      const monitorId = `instance:${instance.id}`;
      this.db.upsertMonitor({
        id: monitorId,
        name: instance.runtimeName,
        group: "instances",
        type: "instance",
        config: {
          instanceId: instance.id,
          gatewayUrl: instance.gatewayUrl,
          adapterId: instance.adapter,
        },
      });
      created.push(monitorId);
    }

    return { created: created.length, monitors: created };
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const instances = this.db.listInstances();
      if (instances.length === 0) return;

      for (const instance of instances) {
        try {
          const probe = await probeGateway(instance.gatewayUrl);
          const monitorId = `instance:${instance.id}`;
          const status: MonitorStatus = probe.available ? "up" : "down";
          const detail = probe.available
            ? `Running (v${probe.version ?? "?"}), ${probe.responseTimeMs}ms`
            : "Gateway unreachable";
          this.db.appendHeartbeat(monitorId, status, probe.responseTimeMs, detail);

          // Update instance status in DB
          this.db.upsertInstance({
            ...instance,
            status: probe.available ? "running" : "unreachable",
            version: probe.version ?? instance.version,
            capabilities: probe.available ? probe.capabilities : instance.capabilities,
            lastSeenAt: probe.available ? Date.now() : instance.lastSeenAt,
          });
        } catch (err) {
          const monitorId = `instance:${instance.id}`;
          const msg = err instanceof Error ? err.message : String(err);
          this.db.appendHeartbeat(monitorId, "down", null, msg);
        }
      }

      // Purge old data
      const retentionMs = this.config.retentionDays * 86_400_000;
      this.db.purgeOldHeartbeats(retentionMs);
    } catch (err) {
      console.error("[local-collector] Tick failed:", err);
    } finally {
      this.running = false;
    }
  }
}
