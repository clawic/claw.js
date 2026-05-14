import { clawApiPath } from "@clawjs/core";
import { setTimeout as delay } from "node:timers/promises";

export interface CoordinatorClientOptions {
  baseUrl: string;
  accessToken: string;
  deviceId: string;
  tenantId: string;
  irohNodeId?: string;
  relayUrl?: string;
  publicAddrs?: () => Promise<string[]>;
  heartbeatIntervalMs?: number;
  onSignaling?: (envelope: SignalingEnvelope) => void;
  fetchImpl?: typeof fetch;
}

export interface SignalingEnvelope {
  id: string;
  fromDeviceId: string;
  payload: unknown;
  createdAt: number;
}

export interface CoordinatorPeer {
  deviceId: string;
  irohNodeId: string;
  relayUrl: string | null;
  publicAddrs: string[];
  label: string;
  platform: string | null;
  lastSeenAt: number;
}

export class CoordinatorClient {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly options: CoordinatorClientOptions) {}

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    await this.heartbeatOnce().catch(() => undefined);
    this.scheduleNext();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  async listPeers(): Promise<{ peers: CoordinatorPeer[]; irohRelay: { publicUrl: string | null } }> {
    const response = await this.fetch(clawApiPath("peers"), { method: "GET" });
    if (!response.ok) {
      throw new Error(`coordinator /peers failed: ${response.status}`);
    }
    const json = (await response.json()) as {
      items: CoordinatorPeer[];
      irohRelay: { publicUrl: string | null };
    };
    return { peers: json.items ?? [], irohRelay: json.irohRelay ?? { publicUrl: null } };
  }

  async sendSignaling(toDeviceId: string, payload: unknown): Promise<void> {
    const response = await this.fetch(clawApiPath("signaling/send"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ toDeviceId, payload }),
    });
    if (!response.ok) {
      throw new Error(`coordinator /signaling/send failed: ${response.status}`);
    }
  }

  private scheduleNext(): void {
    const interval = this.options.heartbeatIntervalMs ?? 15_000;
    this.timer = setTimeout(async () => {
      if (!this.running) return;
      try {
        await this.heartbeatOnce();
      } catch {
        // swallow; next heartbeat will retry
        await delay(0);
      } finally {
        if (this.running) this.scheduleNext();
      }
    }, interval);
  }

  private async heartbeatOnce(): Promise<void> {
    const addrs = this.options.publicAddrs ? await this.options.publicAddrs().catch(() => []) : [];
    const body: Record<string, unknown> = {};
    if (this.options.irohNodeId) body.irohNodeId = this.options.irohNodeId;
    if (this.options.relayUrl) body.relayUrl = this.options.relayUrl;
    if (addrs.length > 0) body.publicAddrs = addrs;
    const response = await this.fetch(clawApiPath("devices/heartbeat"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`heartbeat failed: ${response.status}`);
    }
    const json = (await response.json()) as {
      signaling?: SignalingEnvelope[];
    };
    if (this.options.onSignaling && Array.isArray(json.signaling)) {
      for (const entry of json.signaling) {
        try {
          this.options.onSignaling(entry);
        } catch {
          // ignore handler errors so heartbeat loop survives
        }
      }
    }
  }

  private async fetch(path: string, init: RequestInit): Promise<Response> {
    const url = `${this.options.baseUrl.replace(/\/$/, "")}${path}`;
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${this.options.accessToken}`);
    headers.set("x-clawix-tenant-id", this.options.tenantId);
    const impl = this.options.fetchImpl ?? fetch;
    return impl(url, { ...init, headers });
  }
}
