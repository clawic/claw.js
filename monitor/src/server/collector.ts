import type { MonitorConfig } from "./config.ts";
import type { MonitorDatabase } from "./db.ts";
import type { Monitor, MonitorStatus, RelayStatusSnapshot } from "../shared/types.ts";

export class HeartbeatCollector {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly db: MonitorDatabase,
    private readonly config: MonitorConfig,
  ) {}

  start(): void {
    if (this.timer) return;
    console.log(`[collector] Starting heartbeat collection every ${this.config.collectIntervalMs}ms`);
    // Run immediately, then on interval
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.config.collectIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    if (this.running) return; // skip if previous tick still running
    this.running = true;
    try {
      const monitors = this.db.listMonitors().filter((m) => m.enabled);
      if (monitors.length === 0) return;

      // Fetch consolidated status from relay once
      const snapshot = await this.fetchRelayStatus();

      for (const monitor of monitors) {
        try {
          await this.check(monitor, snapshot);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.db.appendHeartbeat(monitor.id, "down", null, msg);
        }
      }

      // Purge old data periodically (every tick is fine, it's cheap)
      const retentionMs = this.config.retentionDays * 86_400_000;
      this.db.purgeOldHeartbeats(retentionMs);
    } catch (err) {
      console.error("[collector] Tick failed:", err);
    } finally {
      this.running = false;
    }
  }

  private async fetchRelayStatus(): Promise<RelayStatusSnapshot | null> {
    try {
      const headers: Record<string, string> = { "Accept": "application/json" };
      if (this.config.relayToken) {
        headers["Authorization"] = `Bearer ${this.config.relayToken}`;
      }
      const res = await fetch(`${this.config.relayUrl}/v1/monitor/status`, { headers, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return null;
      return (await res.json()) as RelayStatusSnapshot;
    } catch {
      return null;
    }
  }

  private async check(monitor: Monitor, snapshot: RelayStatusSnapshot | null): Promise<void> {
    switch (monitor.type) {
      case "http":
        await this.checkHttp(monitor);
        break;
      case "connector":
        this.checkConnector(monitor, snapshot);
        break;
      case "workspace":
        this.checkWorkspace(monitor, snapshot);
        break;
      case "usage":
        this.checkUsage(monitor, snapshot);
        break;
      case "channel":
        this.checkChannel(monitor, snapshot);
        break;
    }
  }

  private async checkHttp(monitor: Monitor): Promise<void> {
    const url = monitor.config.url ?? `${this.config.relayUrl}/v1/health`;
    const start = performance.now();
    try {
      const res = await fetch(url, {
        method: monitor.config.method ?? "GET",
        signal: AbortSignal.timeout(10_000),
      });
      const elapsed = Math.round(performance.now() - start);
      const status: MonitorStatus = res.ok ? "up" : "degraded";
      this.db.appendHeartbeat(monitor.id, status, elapsed, `HTTP ${res.status}`);
    } catch (err) {
      const elapsed = Math.round(performance.now() - start);
      const msg = err instanceof Error ? err.message : String(err);
      this.db.appendHeartbeat(monitor.id, "down", elapsed, msg);
    }
  }

  private checkConnector(monitor: Monitor, snapshot: RelayStatusSnapshot | null): void {
    if (!snapshot) {
      this.db.appendHeartbeat(monitor.id, "down", null, "Relay unreachable");
      return;
    }
    const connectorId = monitor.config.connectorId;
    const agentId = monitor.config.agentId;
    const connector = snapshot.connectors.find(
      (c) => (connectorId && c.id === connectorId) || (agentId && c.agentId === agentId),
    );
    if (!connector) {
      this.db.appendHeartbeat(monitor.id, "down", null, "Connector not found");
      return;
    }
    const status: MonitorStatus = connector.status === "online" ? "up" : "down";
    this.db.appendHeartbeat(monitor.id, status, null, `${connector.status} (v${connector.version ?? "?"})`);
  }

  private checkWorkspace(monitor: Monitor, snapshot: RelayStatusSnapshot | null): void {
    if (!snapshot) {
      this.db.appendHeartbeat(monitor.id, "down", null, "Relay unreachable");
      return;
    }
    const wsId = monitor.config.workspaceId;
    for (const agent of snapshot.agents) {
      const ws = agent.workspaces.find((w) => w.id === wsId);
      if (ws) {
        const status: MonitorStatus = ws.status === "active" || ws.status === "idle" ? "up" : ws.status === "error" ? "down" : "degraded";
        this.db.appendHeartbeat(monitor.id, status, null, ws.status);
        return;
      }
    }
    this.db.appendHeartbeat(monitor.id, "down", null, "Workspace not found");
  }

  private checkUsage(monitor: Monitor, snapshot: RelayStatusSnapshot | null): void {
    if (!snapshot) {
      this.db.appendHeartbeat(monitor.id, "degraded", null, "Relay unreachable");
      return;
    }
    const metric = monitor.config.metric ?? "sessions";
    const usage = snapshot.usage;
    let value = 0;
    let detail = "";

    switch (metric) {
      case "tokens":
        value = usage.tokensInLast24h + usage.tokensOutLast24h;
        detail = `In: ${usage.tokensInLast24h}, Out: ${usage.tokensOutLast24h}`;
        break;
      case "sessions":
        value = usage.sessionsLast24h;
        detail = `${value} sessions (24h)`;
        break;
      case "errors":
        value = usage.errorsLast24h;
        detail = `${value} errors (24h)`;
        break;
      case "cost":
        value = Math.round(usage.estimatedCostLast24h * 100);
        detail = `$${usage.estimatedCostLast24h.toFixed(2)} (24h)`;
        break;
    }

    // Usage monitors are always "up" unless relay is down. The value is informational.
    this.db.appendHeartbeat(monitor.id, "up", value, detail);
  }

  private checkChannel(monitor: Monitor, _snapshot: RelayStatusSnapshot | null): void {
    // Channel checks require workspace-level integration status.
    // For v1 we mark as pending if we can't determine status.
    this.db.appendHeartbeat(monitor.id, "pending", null, "Channel check not yet implemented");
  }

  /* -------------------------------------------------------
     Auto-discovery: connect to relay and create monitors
     ------------------------------------------------------- */

  async discover(): Promise<{ created: number; monitors: string[] }> {
    const created: string[] = [];

    // Always create relay-health monitor
    this.db.upsertMonitor({
      id: "relay-health",
      name: "Relay Server",
      group: "infrastructure",
      type: "http",
      config: { url: `${this.config.relayUrl}/v1/health` },
    });
    created.push("relay-health");

    // Fetch snapshot
    const snapshot = await this.fetchRelayStatus();
    if (!snapshot) {
      return { created: created.length, monitors: created };
    }

    // Register connector monitors
    for (const conn of snapshot.connectors) {
      const id = `connector:${conn.id}`;
      this.db.upsertMonitor({
        id,
        name: conn.displayName || conn.agentId,
        group: "agents",
        type: "connector",
        config: { connectorId: conn.id, agentId: conn.agentId },
      });
      created.push(id);
    }

    // Register workspace monitors
    for (const agent of snapshot.agents) {
      for (const ws of agent.workspaces) {
        const id = `workspace:${ws.id}`;
        this.db.upsertMonitor({
          id,
          name: ws.displayName || ws.id,
          group: "workspaces",
          type: "workspace",
          config: { tenantId: agent.tenantId, agentId: agent.id, workspaceId: ws.id },
        });
        created.push(id);
      }
    }

    // Register usage monitors
    const usageMetrics = [
      { id: "usage:tokens", name: "Token Usage", metric: "tokens" },
      { id: "usage:sessions", name: "Session Rate", metric: "sessions" },
      { id: "usage:errors", name: "Error Rate", metric: "errors" },
      { id: "usage:cost", name: "Estimated Cost", metric: "cost" },
    ];
    for (const u of usageMetrics) {
      this.db.upsertMonitor({
        id: u.id,
        name: u.name,
        group: "usage",
        type: "usage",
        config: { metric: u.metric },
      });
      created.push(u.id);
    }

    return { created: created.length, monitors: created };
  }
}
