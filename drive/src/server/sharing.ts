// Unified sharing service: read links, tailnet shares, public Cloudflare tunnels,
// and agent svagt_drv tokens. Heavy work (tailscale registration, cloudflared
// spawning) is delegated to helpers; if they fail, the API still returns a
// useful record so the UI knows what mode was attempted.

import { spawn, type ChildProcess } from "node:child_process";

import type { DriveStore } from "./db.ts";
import type { DriveEventBus } from "./realtime.ts";
import type {
  DriveAgentCapability,
  DriveAgentShareRecord,
  DriveTailnetShareRecord,
  DriveTunnelShareRecord,
  DriveRealtimeEvent,
} from "../shared/types.ts";

export interface SharingActor {
  kind: "admin" | "token" | "share" | "agent";
  id: string;
  name: string;
}

export interface ServiceConfig {
  /** Absolute path to the cloudflared binary (bundled in the macOS .app helpers). */
  cloudflaredPath?: string;
  /** Hostname of the local Drive endpoint, e.g. "127.0.0.1:7792". */
  localOrigin: string;
  /** Optional override of the bridge daemon path that registers MagicDNS. */
  bridgeDaemonPath?: string;
}

export class DriveSharingService {
  private readonly tunnels = new Map<string, ChildProcess>();

  constructor(
    private readonly store: DriveStore,
    private readonly bus: DriveEventBus,
    private readonly config: ServiceConfig = { localOrigin: "127.0.0.1:7792" },
  ) {}

  shutdown(): void {
    for (const proc of this.tunnels.values()) {
      try { proc.kill("SIGTERM"); } catch { /* noop */ }
    }
    this.tunnels.clear();
  }

  async createTailnet(itemId: string, actor: SharingActor): Promise<DriveTailnetShareRecord> {
    // Best-effort: ask the bridge daemon to register a MagicDNS hostname. If
    // the daemon is unreachable, we still create a record so the UI can tell
    // the user to enable Tailscale.
    const magicdnsName = await registerTailnet(this.config.bridgeDaemonPath, itemId);
    const record = this.store.createTailnetShare({
      itemId,
      magicdnsName: magicdnsName ?? `pending.${itemId.slice(0, 8)}.tail-scale.ts.net`,
      tailnetNodeId: null,
    });
    this.store.appendAuditEvent({
      kind: "share_created",
      itemId,
      principalKind: actor.kind,
      principalId: actor.id,
      principalName: actor.name,
      metadata: { mode: "tailnet", shareId: record.id },
    });
    this.emit("share.created", itemId, { mode: "tailnet", shareId: record.id });
    return record;
  }

  async createTunnel(itemId: string, actor: SharingActor): Promise<DriveTunnelShareRecord> {
    if (!this.config.cloudflaredPath) {
      const stub = this.store.createTunnelShare({
        itemId,
        tunnelUrl: "https://cloudflared-not-installed.invalid",
        tunnelPid: null,
      });
      this.store.stopTunnelShare(stub.id, "errored");
      return { ...stub, status: "errored", stoppedAt: new Date().toISOString() };
    }
    const url = await spawnCloudflared(this.config.cloudflaredPath, this.config.localOrigin, (proc, resolvedUrl) => {
      const record = this.store.createTunnelShare({
        itemId,
        tunnelUrl: resolvedUrl,
        tunnelPid: proc.pid ?? null,
      });
      this.tunnels.set(record.id, proc);
      proc.on("close", () => {
        this.store.stopTunnelShare(record.id, "stopped");
        this.tunnels.delete(record.id);
        this.emit("share.revoked", itemId, { mode: "public_tunnel", shareId: record.id });
      });
      this.store.appendAuditEvent({
        kind: "share_created",
        itemId,
        principalKind: actor.kind,
        principalId: actor.id,
        principalName: actor.name,
        metadata: { mode: "public_tunnel", shareId: record.id, url: resolvedUrl },
      });
      this.emit("share.created", itemId, { mode: "public_tunnel", shareId: record.id, url: resolvedUrl });
      return record;
    });
    return url;
  }

  revokeTunnel(shareId: string, itemId: string, actor: SharingActor): boolean {
    const proc = this.tunnels.get(shareId);
    if (proc) try { proc.kill("SIGTERM"); } catch { /* noop */ }
    const stopped = this.store.stopTunnelShare(shareId, "stopped");
    this.tunnels.delete(shareId);
    if (stopped) {
      this.store.appendAuditEvent({
        kind: "share_revoked",
        itemId,
        principalKind: actor.kind,
        principalId: actor.id,
        principalName: actor.name,
        metadata: { mode: "public_tunnel", shareId },
      });
      this.emit("share.revoked", itemId, { mode: "public_tunnel", shareId });
    }
    return stopped;
  }

  revokeTailnet(shareId: string, itemId: string, actor: SharingActor): boolean {
    const ok = this.store.revokeTailnetShare(shareId);
    if (ok) {
      this.store.appendAuditEvent({
        kind: "share_revoked",
        itemId,
        principalKind: actor.kind,
        principalId: actor.id,
        principalName: actor.name,
        metadata: { mode: "tailnet", shareId },
      });
      this.emit("share.revoked", itemId, { mode: "tailnet", shareId });
    }
    return ok;
  }

  createAgent(input: {
    itemId: string;
    capability: DriveAgentCapability;
    reason: string | null;
    agentName: string;
  }, actor: SharingActor): { record: DriveAgentShareRecord; token: string } {
    const created = this.store.createAgentShare(input);
    this.store.appendAuditEvent({
      kind: "share_created",
      itemId: input.itemId,
      principalKind: actor.kind,
      principalId: actor.id,
      principalName: actor.name,
      metadata: {
        mode: "agent",
        shareId: created.record.id,
        capability: input.capability.kind,
        ttlMinutes: input.capability.ttlMinutes,
      },
    });
    this.emit("share.created", input.itemId, { mode: "agent", shareId: created.record.id });
    return created;
  }

  revokeAgent(shareId: string, itemId: string, actor: SharingActor): boolean {
    const ok = this.store.revokeAgentShare(shareId);
    if (ok) {
      this.store.appendAuditEvent({
        kind: "share_revoked",
        itemId,
        principalKind: actor.kind,
        principalId: actor.id,
        principalName: actor.name,
        metadata: { mode: "agent", shareId },
      });
      this.emit("share.revoked", itemId, { mode: "agent", shareId });
    }
    return ok;
  }

  private emit(kind: DriveRealtimeEvent["kind"], itemId: string | null, payload: Record<string, unknown>): void {
    this.bus.emit({
      kind,
      itemId,
      parentId: null,
      timestamp: new Date().toISOString(),
      payload,
    });
  }
}

async function registerTailnet(_bridgeDaemonPath: string | undefined, itemId: string): Promise<string | null> {
  // Fase 4 decision: if the bridge daemon exposes an HTTP endpoint at
  // 127.0.0.1:9876/v1/drive/tailnet, we POST { itemId } and read back the
  // assigned magicdns hostname. No daemon yet → return null.
  try {
    const response = await fetch("http://127.0.0.1:9876/v1/drive/tailnet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId }),
    });
    if (!response.ok) return null;
    const json = (await response.json()) as { magicdnsName?: string };
    return typeof json.magicdnsName === "string" ? json.magicdnsName : null;
  } catch {
    return null;
  }
}

function spawnCloudflared<T>(
  binaryPath: string,
  localOrigin: string,
  onResolved: (proc: ChildProcess, url: string) => T,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const proc = spawn(binaryPath, ["tunnel", "--no-autoupdate", "--url", `http://${localOrigin}`], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timeout = setTimeout(() => {
      try { proc.kill("SIGTERM"); } catch { /* noop */ }
      reject(new Error("cloudflared_timeout"));
    }, 25_000);
    const onChunk = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match) {
        clearTimeout(timeout);
        const result = onResolved(proc, match[0]);
        resolve(result);
      }
    };
    proc.stdout.on("data", onChunk);
    proc.stderr.on("data", onChunk);
    proc.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}
