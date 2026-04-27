import { randomUUID } from "node:crypto";

import type { WebSocket } from "ws";

import type { BrowserFrameEvent, BrowserSessionSnapshot } from "../../../browser/shared/types.ts";
import type {
  CancelEnvelope,
  ConnectorAuthContext,
  ConnectorInboundEnvelope,
  ConnectorOutboundEnvelope,
  ConnectorServiceDescriptor,
  ErrorEnvelope,
  HelloEnvelope,
  StreamEnvelope,
} from "../shared/protocol.ts";
import type { RelayDatabase } from "./db.ts";
import type { RelayLogger } from "./logger.ts";

export class OfflineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfflineError";
  }
}

interface ActiveConnection {
  sessionId: string;
  socket: WebSocket;
  auth: ConnectorAuthContext;
  capabilities: string[];
  version: string;
  services: ConnectorServiceDescriptor[];
}

interface PendingInvocation {
  resolve: (value: Record<string, unknown>) => void;
  reject: (reason?: unknown) => void;
  timer: NodeJS.Timeout | null;
  onStream?: (payload: StreamEnvelope) => void;
}

export class ConnectorRegistry {
  private readonly connections = new Map<string, ActiveConnection>();
  private readonly pending = new Map<string, PendingInvocation>();
  private readonly browserWatchers = new Map<string, Set<WebSocket>>();
  private readonly browserSessions = new Map<string, BrowserSessionSnapshot>();
  private readonly browserFrames = new Map<string, BrowserFrameEvent>();

  constructor(
    private readonly db: RelayDatabase,
    private readonly logger: RelayLogger,
    private readonly requestTimeoutMs: number,
  ) {}

  private key(tenantId: string, connectorId: string): string {
    return `${tenantId}:${connectorId}`;
  }

  private browserKey(tenantId: string, agentId: string, workspaceId: string): string {
    return `${tenantId}:${agentId}:${workspaceId}`;
  }

  attach(socket: WebSocket, auth: ConnectorAuthContext): void {
    const sessionId = randomUUID();

    socket.on("message", (buffer) => {
      try {
        const raw = buffer.toString();
        const message = JSON.parse(raw) as ConnectorInboundEnvelope;
        this.handleMessage(socket, sessionId, auth, message);
      } catch (error) {
        this.logger.error(`Failed to parse connector frame: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    socket.on("close", () => {
      this.teardown(sessionId, auth);
    });

    socket.on("error", (error) => {
      this.logger.error(`Connector socket error for ${auth.agentId}: ${error.message}`);
      this.teardown(sessionId, auth);
    });
  }

  private handleMessage(socket: WebSocket, sessionId: string, auth: ConnectorAuthContext, message: ConnectorInboundEnvelope): void {
    switch (message.type) {
      case "hello":
        this.handleHello(socket, sessionId, auth, message);
        return;
      case "heartbeat":
        this.db.touchConnectorSession(sessionId);
        return;
      case "stream": {
        const pending = this.pending.get(message.requestId);
        if (pending?.onStream) pending.onStream(message);
        return;
      }
      case "result": {
        const pending = this.pending.get(message.requestId);
        if (!pending) return;
        if (pending.timer) clearTimeout(pending.timer);
        this.pending.delete(message.requestId);
        pending.resolve(message.payload);
        return;
      }
      case "error": {
        const pending = message.requestId ? this.pending.get(message.requestId) : null;
        const text = `${message.code}: ${message.message}`;
        this.logger.error(`Connector error for ${auth.agentId}: ${text}`);
        if (!pending || !message.requestId) return;
        if (pending.timer) clearTimeout(pending.timer);
        this.pending.delete(message.requestId);
        pending.reject(this.normalizeError(message));
        return;
      }
      case "event":
        if (message.event === "browser.state") {
          const workspaceId = typeof message.payload.workspaceId === "string" ? message.payload.workspaceId : undefined;
          const session = message.payload.session as BrowserSessionSnapshot | undefined;
          if (workspaceId && session) {
            this.browserSessions.set(this.browserKey(auth.tenantId, auth.agentId, workspaceId), session);
            this.broadcastBrowser(auth.tenantId, auth.agentId, workspaceId, {
              type: "browser.state",
              reason: message.payload.reason,
              session,
            });
            this.db.appendActivity({
              tenantId: auth.tenantId,
              agentId: auth.agentId,
              workspaceId,
              capability: "browser.state",
              status: "info",
              detail: typeof message.payload.reason === "string" ? message.payload.reason : "browser update",
            });
            return;
          }
        }
        if (message.event === "browser.frame") {
          const frame = message.payload as BrowserFrameEvent;
          if (typeof frame.workspaceId === "string") {
            this.browserFrames.set(this.browserKey(auth.tenantId, auth.agentId, frame.workspaceId), frame);
            this.broadcastBrowser(auth.tenantId, auth.agentId, frame.workspaceId, {
              type: "browser.frame",
              frame,
            });
            return;
          }
        }
        this.db.appendActivity({
          tenantId: auth.tenantId,
          agentId: auth.agentId,
          workspaceId: typeof message.payload.workspaceId === "string" ? message.payload.workspaceId : undefined,
          capability: message.event,
          status: "info",
          detail: JSON.stringify(message.payload),
        });
        return;
      case "ack":
        return;
      default:
        return;
    }
  }

  private handleHello(socket: WebSocket, sessionId: string, auth: ConnectorAuthContext, message: HelloEnvelope): void {
    if (
      message.payload.tenantId !== auth.tenantId
      || message.payload.connectorId !== auth.connectorId
      || message.payload.agentId !== auth.agentId
    ) {
      this.logger.error(`Connector hello mismatch for ${auth.connectorId}`);
      socket.close();
      return;
    }

    this.db.upsertAgent(auth.tenantId, auth.agentId, auth.agentId);
    this.db.upsertConnector(auth.tenantId, auth.connectorId, auth.agentId, auth.agentId);
    this.db.upsertWorkspaces(auth.tenantId, auth.agentId, message.payload.workspaces);
    this.db.markConnectorOnline({
      sessionId,
      credentialId: auth.credentialId,
      tenantId: auth.tenantId,
      connectorId: auth.connectorId,
      agentId: auth.agentId,
      capabilities: message.payload.capabilities,
      version: message.payload.version,
    });
    if (message.payload.runtime) {
      this.db.appendActivity({
        tenantId: auth.tenantId,
        agentId: auth.agentId,
        capability: "runtime.status",
        status: message.payload.runtime.online ? "success" : "error",
        detail: JSON.stringify(message.payload.runtime),
      });
    }
    this.connections.set(this.key(auth.tenantId, auth.connectorId), {
      sessionId,
      socket,
      auth,
      capabilities: message.payload.capabilities,
      version: message.payload.version,
      services: message.payload.services ?? [],
    });
    for (const service of message.payload.services ?? []) {
      this.db.appendActivity({
        tenantId: auth.tenantId,
        agentId: auth.agentId,
        capability: `service.${service.serviceId}`,
        status: service.status === "offline" ? "error" : "info",
        detail: JSON.stringify({
          serviceId: service.serviceId,
          displayName: service.displayName,
          status: service.status ?? "online",
        }),
      });
    }
    const ack: ConnectorOutboundEnvelope = { type: "ack", payload: { sessionId } };
    socket.send(JSON.stringify(ack));
  }

  private teardown(sessionId: string, auth: ConnectorAuthContext): void {
    const key = this.key(auth.tenantId, auth.connectorId);
    const current = this.connections.get(key);
    if (current?.sessionId === sessionId) {
      this.connections.delete(key);
    }
    this.db.markConnectorOffline(sessionId);
  }

  private normalizeError(message: ErrorEnvelope): Error {
    const detail = message.details ? ` ${JSON.stringify(message.details)}` : "";
    return new Error(`${message.code}: ${message.message}${detail}`);
  }

  async invoke(input: {
    tenantId: string;
    connectorId: string;
    agentId: string;
    workspaceId?: string;
    operation: string;
    payload?: Record<string, unknown>;
    onStream?: (payload: StreamEnvelope) => void;
    signal?: AbortSignal;
    timeoutMs?: number;
  }): Promise<Record<string, unknown>> {
    const connection = this.connections.get(this.key(input.tenantId, input.connectorId));
    if (!connection) {
      throw new OfflineError(`No active connector for ${input.connectorId}`);
    }

    const requestId = randomUUID();
    const envelope: ConnectorOutboundEnvelope = {
      type: "invoke",
      requestId,
      tenantId: input.tenantId,
      agentId: input.agentId,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      operation: input.operation,
      payload: input.payload,
    };

    return await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timeoutMs = input.timeoutMs ?? this.requestTimeoutMs;
      const timer = timeoutMs > 0
        ? setTimeout(() => {
            this.pending.delete(requestId);
            reject(new Error(`Timed out waiting for connector response to ${input.operation}`));
          }, timeoutMs)
        : null;

      this.pending.set(requestId, {
        resolve,
        reject,
        timer,
        onStream: input.onStream,
      });

      const onAbort = () => {
        const pending = this.pending.get(requestId);
        if (!pending) return;
        if (pending.timer) clearTimeout(pending.timer);
        this.pending.delete(requestId);
        const cancelEnvelope: CancelEnvelope = { type: "cancel", requestId };
        connection.socket.send(JSON.stringify(cancelEnvelope));
        pending.resolve({ cancelled: true, requestId });
      };

      if (input.signal) {
        if (input.signal.aborted) {
          if (timer) clearTimeout(timer);
          this.pending.delete(requestId);
          resolve({ cancelled: true, requestId });
          return;
        }
        input.signal.addEventListener("abort", onAbort, { once: true });
      }

      const cleanup = () => {
        if (input.signal) input.signal.removeEventListener("abort", onAbort);
      };

      const originalResolve = this.pending.get(requestId)!.resolve;
      const originalReject = this.pending.get(requestId)!.reject;
      this.pending.set(requestId, {
        ...this.pending.get(requestId)!,
        resolve: (value) => { cleanup(); originalResolve(value); },
        reject: (reason) => { cleanup(); originalReject(reason); },
      });

      connection.socket.send(JSON.stringify(envelope), (error) => {
        if (!error) return;
        cleanup();
        if (timer) clearTimeout(timer);
        this.pending.delete(requestId);
        reject(error);
      });
    });
  }

  resolveService(input: {
    tenantId: string;
    serviceId: string;
  }): { connectorId: string; agentId: string; service: ConnectorServiceDescriptor } | null {
    for (const connection of this.connections.values()) {
      if (connection.auth.tenantId !== input.tenantId) continue;
      const service = connection.services.find((entry) => entry.serviceId === input.serviceId);
      if (!service || service.status === "offline") continue;
      return {
        connectorId: connection.auth.connectorId,
        agentId: connection.auth.agentId,
        service,
      };
    }
    return null;
  }

  revoke(tenantId: string, connectorId: string): void {
    const connection = this.connections.get(this.key(tenantId, connectorId));
    if (!connection) return;
    this.connections.delete(this.key(tenantId, connectorId));
    connection.socket.close();
  }

  subscribeBrowser(input: {
    tenantId: string;
    agentId: string;
    workspaceId: string;
    socket: WebSocket;
  }): () => void {
    const key = this.browserKey(input.tenantId, input.agentId, input.workspaceId);
    const watchers = this.browserWatchers.get(key) ?? new Set<WebSocket>();
    watchers.add(input.socket);
    this.browserWatchers.set(key, watchers);
    return () => {
      const current = this.browserWatchers.get(key);
      if (!current) return;
      current.delete(input.socket);
      if (current.size === 0) {
        this.browserWatchers.delete(key);
      }
    };
  }

  getBrowserState(input: {
    tenantId: string;
    agentId: string;
    workspaceId: string;
  }): {
    session?: BrowserSessionSnapshot;
    frame?: BrowserFrameEvent;
  } {
    const key = this.browserKey(input.tenantId, input.agentId, input.workspaceId);
    return {
      ...(this.browserSessions.has(key) ? { session: this.browserSessions.get(key) } : {}),
      ...(this.browserFrames.has(key) ? { frame: this.browserFrames.get(key) } : {}),
    };
  }

  cacheBrowserState(input: {
    tenantId: string;
    agentId: string;
    workspaceId: string;
    session?: BrowserSessionSnapshot;
    frame?: BrowserFrameEvent;
  }): void {
    const key = this.browserKey(input.tenantId, input.agentId, input.workspaceId);
    if (input.session) this.browserSessions.set(key, input.session);
    if (input.frame) this.browserFrames.set(key, input.frame);
  }

  private broadcastBrowser(
    tenantId: string,
    agentId: string,
    workspaceId: string,
    payload: Record<string, unknown>,
  ): void {
    const watchers = this.browserWatchers.get(this.browserKey(tenantId, agentId, workspaceId));
    if (!watchers || watchers.size === 0) return;
    const raw = JSON.stringify(payload);
    for (const watcher of watchers) {
      if (watcher.readyState !== 1) continue;
      watcher.send(raw);
    }
  }
}
