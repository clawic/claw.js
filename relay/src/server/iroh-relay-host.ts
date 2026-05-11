import { spawn, type ChildProcess } from "node:child_process";

import type { RelayConfig } from "./config.ts";
import type { RelayLogger } from "./logger.ts";

export interface IrohRelayHostOptions {
  binaryPath?: string;
  listenAddr?: string;
  publicUrl?: string;
  enabled?: boolean;
}

export function loadIrohRelayHostOptions(): IrohRelayHostOptions {
  return {
    binaryPath: process.env.RELAY_IROH_RELAY_BIN,
    listenAddr: process.env.RELAY_IROH_RELAY_LISTEN_ADDR,
    publicUrl: process.env.RELAY_IROH_RELAY_PUBLIC_URL,
    enabled: process.env.RELAY_IROH_RELAY_DISABLE !== "1",
  };
}

export class IrohRelayHost {
  private child: ChildProcess | null = null;
  private stopping = false;
  private restartTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: RelayConfig,
    private readonly logger: RelayLogger,
    private readonly options: IrohRelayHostOptions,
  ) {}

  isEnabled(): boolean {
    return this.options.enabled !== false && Boolean(this.options.binaryPath);
  }

  publicUrl(): string | null {
    if (this.options.publicUrl) return this.options.publicUrl;
    if (!this.isEnabled()) return null;
    const base = this.config.publicBaseUrl.replace(/^http/, "ws");
    return `${base.replace(/\/$/, "")}/v1/iroh-relay`;
  }

  start(): void {
    if (!this.isEnabled() || this.child || this.stopping) return;
    const bin = this.options.binaryPath!;
    const args: string[] = [];
    if (this.options.listenAddr) {
      args.push("--listen", this.options.listenAddr);
    }
    try {
      this.child = spawn(bin, args, {
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      this.logger.warn(`[iroh-relay] spawn failed: ${error instanceof Error ? error.message : String(error)}`);
      this.scheduleRestart();
      return;
    }
    this.child.stdout?.on("data", (chunk) => {
      this.logger.info(`[iroh-relay] ${chunk.toString().trimEnd()}`);
    });
    this.child.stderr?.on("data", (chunk) => {
      this.logger.warn(`[iroh-relay] ${chunk.toString().trimEnd()}`);
    });
    this.child.on("exit", (code, signal) => {
      this.logger.warn(`[iroh-relay] exited code=${code} signal=${signal}`);
      this.child = null;
      if (!this.stopping) this.scheduleRestart();
    });
    this.logger.info(`[iroh-relay] supervisor started bin=${bin}`);
  }

  stop(): void {
    this.stopping = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.child) {
      try {
        this.child.kill("SIGTERM");
      } catch {
        // ignore
      }
      this.child = null;
    }
  }

  private scheduleRestart(): void {
    if (this.stopping) return;
    if (this.restartTimer) return;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.start();
    }, 5_000);
  }

  describe(): {
    enabled: boolean;
    publicUrl: string | null;
    listenAddr: string | null;
    binaryPath: string | null;
  } {
    return {
      enabled: this.isEnabled(),
      publicUrl: this.publicUrl(),
      listenAddr: this.options.listenAddr ?? null,
      binaryPath: this.options.binaryPath ?? null,
    };
  }
}
