import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";

import { WebSocket, WebSocketServer } from "ws";
import { z } from "zod";

import { AuditStore } from "./audit-store.ts";
import { compareBearerTokensConstantTime } from "./pairing.ts";
import { IdentityStore } from "./identity-store.ts";

export const BRIDGE_FRAME_KINDS = [
  "ping",
  "pong",
  "event",
  "request",
  "response",
] as const;

export type BridgeFrameKind = (typeof BRIDGE_FRAME_KINDS)[number];

export const BridgeFrameSchema = z.object({
  kind: z.enum(BRIDGE_FRAME_KINDS),
  id: z.string().min(1).optional(),
  payload: z.unknown().optional(),
});

export type BridgeFrame = z.infer<typeof BridgeFrameSchema>;

export interface BridgeSession {
  id: string;
  remoteAddress?: string;
  socket: WebSocket | null;
  transport: "websocket" | "iroh";
  closed: boolean;
  send(frame: BridgeFrame): void;
}

export interface ExternalDuplexStream {
  on(event: "data", listener: (chunk: Buffer) => void): this;
  on(event: "end", listener: () => void): this;
  on(event: "close", listener: () => void): this;
  on(event: "error", listener: (error: unknown) => void): this;
  send(payload: Buffer): Promise<void>;
  close(): void;
}

export interface BridgeServerDeps {
  identityStore: IdentityStore;
  auditStore: AuditStore;
  onSession?: (session: BridgeSession) => void;
  onFrame?: (session: BridgeSession, frame: BridgeFrame) => void | Promise<void>;
  onSessionClose?: (session: BridgeSession) => void;
  pingIntervalMs?: number;
  maxSessions?: number;
  maxQueuedFramesPerSession?: number;
  maxBufferedBytesPerSession?: number;
}

const CLOSE_CODES = {
  unauthorized: 4401,
  badFrame: 4400,
  slowClient: 4408,
  serverShutdown: 1001,
} as const;

const DEFAULT_MAX_SESSIONS = 64;
const DEFAULT_MAX_QUEUED_FRAMES_PER_SESSION = 256;
const DEFAULT_MAX_BUFFERED_BYTES_PER_SESSION = 1024 * 1024;

interface BridgeServerLimits {
  maxSessions: number;
  maxQueuedFramesPerSession: number;
  maxBufferedBytesPerSession: number;
}

export class BridgeServer {
  private readonly wss: WebSocketServer;
  private readonly deps: BridgeServerDeps;
  private readonly limits: BridgeServerLimits;
  private readonly sessions = new Set<BridgeSession>();
  private pingInterval: NodeJS.Timeout | null = null;
  private nextId = 1;

  constructor(deps: BridgeServerDeps) {
    this.deps = deps;
    this.limits = {
      maxSessions: readPositiveLimit(deps.maxSessions, DEFAULT_MAX_SESSIONS),
      maxQueuedFramesPerSession: readPositiveLimit(
        deps.maxQueuedFramesPerSession,
        DEFAULT_MAX_QUEUED_FRAMES_PER_SESSION,
      ),
      maxBufferedBytesPerSession: readPositiveLimit(
        deps.maxBufferedBytesPerSession,
        DEFAULT_MAX_BUFFERED_BYTES_PER_SESSION,
      ),
    };
    this.wss = new WebSocketServer({ noServer: true });
  }

  attach(server: HttpServer, path: string = "/bridge"): void {
    server.on("upgrade", (req, socket, head) => {
      if (!req.url) return socket.destroy();
      const url = new URL(req.url, "http://internal");
      if (url.pathname !== path) return;
      this.handleUpgrade(req, socket, head, url);
    });
    this.startPingInterval();
  }

  listen(server: HttpServer, path?: string): void {
    this.attach(server, path);
  }

  close(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = null;
    for (const session of this.sessions) {
      try {
        session.socket?.close(CLOSE_CODES.serverShutdown, "shutdown");
      } catch {
        /* ignore */
      }
    }
    this.wss.close();
  }

  get activeSessionCount(): number {
    return this.sessions.size;
  }

  private handleUpgrade(
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    url: URL,
  ): void {
    const identity = this.deps.identityStore.get();
    if (!identity) {
      this.rejectUnauthorized(socket, "identity not initialized");
      return;
    }
    const presented =
      url.searchParams.get("token") ??
      extractBearer(req.headers["authorization"]);
    if (
      !presented ||
      !compareBearerTokensConstantTime(presented, identity.bearerToken)
    ) {
      this.deps.auditStore.record({
        action: "bridgeAuth",
        outcome: "deny",
        context: { reason: "bad-token", remote: req.socket.remoteAddress },
      });
      this.rejectUnauthorized(socket, "invalid bearer token");
      return;
    }
    if (this.sessions.size >= this.limits.maxSessions) {
      this.deps.auditStore.record({
        action: "bridgeAuth",
        outcome: "deny",
        context: { reason: "too-many-sessions", remote: req.socket.remoteAddress },
      });
      this.rejectTooManyRequests(socket, "too many bridge sessions");
      return;
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.installSession(ws, req);
    });
  }

  private installSession(ws: WebSocket, req: IncomingMessage): void {
    const queue: string[] = [];
    let flushing = false;
    const session: BridgeSession = {
      id: `bridge-${this.nextId++}`,
      remoteAddress: req.socket.remoteAddress ?? undefined,
      socket: ws,
      transport: "websocket",
      closed: false,
      send: (frame: BridgeFrame) => {
        if (session.closed) return;
        if (queue.length >= this.limits.maxQueuedFramesPerSession) {
          this.closeWebSocketSession(session, ws, CLOSE_CODES.slowClient, "slow client");
          return;
        }
        queue.push(JSON.stringify(frame));
        flush();
      },
    };
    const finalize = () => {
      if (session.closed) return;
      session.closed = true;
      queue.length = 0;
      this.sessions.delete(session);
      this.deps.onSessionClose?.(session);
    };
    const flush = () => {
      if (flushing || session.closed) return;
      if (ws.readyState !== WebSocket.OPEN) return;
      if (ws.bufferedAmount > this.limits.maxBufferedBytesPerSession) {
        this.closeWebSocketSession(session, ws, CLOSE_CODES.slowClient, "slow client");
        return;
      }
      const next = queue.shift();
      if (!next) return;
      flushing = true;
      ws.send(next, (error) => {
        flushing = false;
        if (error) {
          this.closeWebSocketSession(session, ws, CLOSE_CODES.slowClient, "send failed");
          return;
        }
        flush();
      });
    };
    this.sessions.add(session);
    this.deps.auditStore.record({
      action: "bridgeAuth",
      outcome: "allow",
      context: { sessionId: session.id, remote: session.remoteAddress },
    });
    this.deps.onSession?.(session);
    ws.on("message", (data) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString("utf8"));
      } catch {
        ws.close(CLOSE_CODES.badFrame, "invalid json");
        return;
      }
      const frame = BridgeFrameSchema.safeParse(parsed);
      if (!frame.success) {
        ws.close(CLOSE_CODES.badFrame, "invalid frame");
        return;
      }
      if (frame.data.kind === "ping") {
        session.send({ kind: "pong", id: frame.data.id });
        return;
      }
      void this.deps.onFrame?.(session, frame.data);
    });
    ws.on("close", () => {
      finalize();
    });
    ws.on("error", () => {
      try {
        ws.terminate();
      } catch {
        /* ignore */
      }
    });
  }

  attachExternalStream(stream: ExternalDuplexStream, options: { remoteLabel?: string } = {}): BridgeSession {
    if (this.sessions.size >= this.limits.maxSessions) {
      stream.close();
      return {
        id: `bridge-iroh-rejected-${this.nextId++}`,
        remoteAddress: options.remoteLabel,
        socket: null,
        transport: "iroh",
        closed: true,
        send: () => {},
      };
    }
    const queue: Buffer[] = [];
    let flushing = false;
    const session: BridgeSession = {
      id: `bridge-iroh-${this.nextId++}`,
      remoteAddress: options.remoteLabel,
      socket: null,
      transport: "iroh",
      closed: false,
      send: (frame: BridgeFrame) => {
        if (session.closed) return;
        if (queue.length >= this.limits.maxQueuedFramesPerSession) {
          closeExternalSession();
          return;
        }
        queue.push(Buffer.from(JSON.stringify(frame), "utf8"));
        flush();
      },
    };
    const finalize = () => {
      if (session.closed) return;
      session.closed = true;
      queue.length = 0;
      this.sessions.delete(session);
      this.deps.onSessionClose?.(session);
    };
    const closeExternalSession = () => {
      finalize();
      try {
        stream.close();
      } catch {
        /* ignore */
      }
    };
    const flush = () => {
      if (flushing || session.closed) return;
      const next = queue.shift();
      if (!next) return;
      flushing = true;
      void stream.send(next).then(
        () => {
          flushing = false;
          flush();
        },
        () => {
          flushing = false;
          closeExternalSession();
        },
      );
    };
    this.sessions.add(session);
    this.deps.onSession?.(session);
    stream.on("data", (chunk: Buffer) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(chunk.toString("utf8"));
      } catch {
        stream.close();
        return;
      }
      const frame = BridgeFrameSchema.safeParse(parsed);
      if (!frame.success) {
        stream.close();
        return;
      }
      if (frame.data.kind === "ping") {
        session.send({ kind: "pong", id: frame.data.id });
        return;
      }
      void this.deps.onFrame?.(session, frame.data);
    });
    stream.on("end", finalize);
    stream.on("close", finalize);
    stream.on("error", finalize);
    return session;
  }

  private rejectUnauthorized(socket: Duplex, reason: string): void {
    this.rejectHttp(socket, 401, "Unauthorized", reason);
  }

  private rejectTooManyRequests(socket: Duplex, reason: string): void {
    this.rejectHttp(socket, 429, "Too Many Requests", reason);
  }

  private rejectHttp(socket: Duplex, statusCode: number, statusText: string, reason: string): void {
    socket.write(
      `HTTP/1.1 ${statusCode} ${statusText}\r\nConnection: close\r\nContent-Type: text/plain\r\nContent-Length: ${
        Buffer.byteLength(reason)
      }\r\n\r\n${reason}`,
    );
    socket.destroy();
  }

  private closeWebSocketSession(
    session: BridgeSession,
    ws: WebSocket,
    code: number,
    reason: string,
  ): void {
    if (session.closed) return;
    try {
      ws.close(code, reason);
    } catch {
      try {
        ws.terminate();
      } catch {
        /* ignore */
      }
    }
  }

  private startPingInterval(): void {
    const ms = this.deps.pingIntervalMs ?? 30_000;
    if (ms <= 0) return;
    this.pingInterval = setInterval(() => {
      for (const session of this.sessions) {
        try {
          session.send({ kind: "ping" });
        } catch {
          /* ignore */
        }
      }
    }, ms);
    this.pingInterval.unref?.();
  }
}

function readPositiveLimit(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function extractBearer(header: string | string[] | undefined): string | null {
  if (typeof header !== "string") return null;
  if (!header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
}
