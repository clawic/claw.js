import { EventEmitter } from "node:events";

export type MonitorEventName =
  | "monitor.snapshot"
  | "monitor.session.start"
  | "monitor.session.delta"
  | "monitor.session.end"
  | "monitor.session.touch"
  | "monitor.agent.presence"
  | "monitor.activity"
  | "monitor.client.attach"
  | "monitor.client.detach"
  | "monitor.heartbeat";

export interface MonitorEnvelope {
  event: MonitorEventName;
  payload: Record<string, unknown>;
  ts: number;
}

export type MonitorListener = (envelope: MonitorEnvelope) => void;

export interface MonitorClientInfo {
  clientId: string;
  openedSessionId?: string;
  attachedAt: number;
}

const MAX_LISTENERS_PER_TENANT = 64;

export class MonitorBus {
  private readonly emitter = new EventEmitter();
  private readonly clientsByTenant = new Map<string, Map<string, MonitorClientInfo>>();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  publish(tenantId: string, event: MonitorEventName, payload: Record<string, unknown>): void {
    const envelope: MonitorEnvelope = { event, payload, ts: Date.now() };
    this.emitter.emit(tenantId, envelope);
  }

  subscribe(tenantId: string, listener: MonitorListener): () => void {
    if (this.emitter.listenerCount(tenantId) >= MAX_LISTENERS_PER_TENANT) {
      throw new Error("monitor_bus_listener_limit");
    }
    this.emitter.on(tenantId, listener);
    return () => this.emitter.off(tenantId, listener);
  }

  listenerCount(tenantId: string): number {
    return this.emitter.listenerCount(tenantId);
  }

  attachClient(tenantId: string, info: MonitorClientInfo): void {
    let bucket = this.clientsByTenant.get(tenantId);
    if (!bucket) {
      bucket = new Map();
      this.clientsByTenant.set(tenantId, bucket);
    }
    bucket.set(info.clientId, info);
    this.publish(tenantId, "monitor.client.attach", { ...info });
  }

  updateClient(tenantId: string, clientId: string, openedSessionId: string | undefined): void {
    const bucket = this.clientsByTenant.get(tenantId);
    const existing = bucket?.get(clientId);
    if (!existing) return;
    const next: MonitorClientInfo = {
      clientId,
      attachedAt: existing.attachedAt,
      ...(openedSessionId ? { openedSessionId } : {}),
    };
    bucket!.set(clientId, next);
    this.publish(tenantId, "monitor.client.attach", { ...next, updated: true });
  }

  detachClient(tenantId: string, clientId: string): void {
    const bucket = this.clientsByTenant.get(tenantId);
    if (!bucket) return;
    const info = bucket.get(clientId);
    bucket.delete(clientId);
    if (bucket.size === 0) this.clientsByTenant.delete(tenantId);
    this.publish(tenantId, "monitor.client.detach", {
      clientId,
      ...(info?.openedSessionId ? { openedSessionId: info.openedSessionId } : {}),
    });
  }

  listClients(tenantId: string): MonitorClientInfo[] {
    const bucket = this.clientsByTenant.get(tenantId);
    if (!bucket) return [];
    return Array.from(bucket.values());
  }
}
