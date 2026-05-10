import { createServer, type Server as HttpServer } from "node:http";
import { networkInterfaces } from "node:os";

import Database from "better-sqlite3";
import Fastify, { type FastifyInstance } from "fastify";

import {
  AuditStore,
  BonjourAnnouncer,
  BridgeServer,
  HeartbeatWriter,
  HostStore,
  IdentityStore,
  WorkspaceStore,
  meshServerPlugin,
  type BridgeFrame,
  type BridgeSession,
  type HostEndpoint,
  type MeshJobHandler,
  type NodeIdentity,
} from "@clawjs/mesh";

import { handleCodexJob } from "./codex-job-handler.ts";
import { CodexRuntime, type CodexRuntimeOptions } from "./codex-runtime.ts";
import { createCodexWsHandler } from "./codex-ws-bridge.ts";
import type { BridgeConfig } from "./config.ts";
import type { ComputerUse } from "./computer-use.ts";
import { httpLinkClient } from "./link-client.ts";
import { handleTccJob, type TccAuditSink } from "./tcc-job-handler.ts";
import { createTccWsHandler } from "./tcc-ws-bridge.ts";
import type { TerminalManager } from "./terminal.ts";

export interface BridgeRuntime {
  identity: NodeIdentity;
  config: BridgeConfig;
  hostStore: HostStore;
  workspaceStore: WorkspaceStore;
  auditStore: AuditStore;
  identityStore: IdentityStore;
  fastify: FastifyInstance;
  bridgeServer: BridgeServer;
  bridgeHttpServer: HttpServer;
  heartbeat: HeartbeatWriter;
  bonjour?: BonjourAnnouncer;
  codex?: CodexRuntime;
  computerUse?: ComputerUse;
  terminal?: TerminalManager;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface BridgeRuntimeOptions {
  config: BridgeConfig;
  jobHandler?: MeshJobHandler;
  databaseFactory?: (path: string) => Database.Database;
  bonjourFactory?: () => BonjourAnnouncer;
  codex?: CodexRuntimeOptions;
  computerUse?: ComputerUse;
  terminal?: TerminalManager;
}

export function createBridgeRuntime(
  options: BridgeRuntimeOptions,
): BridgeRuntime {
  const config = options.config;
  const db = (options.databaseFactory ?? defaultDbFactory)(config.dbPath);
  const identityStore = new IdentityStore(db);
  const identity = identityStore.getOrCreate(config.displayName);
  const hostStore = new HostStore(db);
  const workspaceStore = new WorkspaceStore(db);
  const auditStore = new AuditStore(db);

  const codex = options.codex ? new CodexRuntime(options.codex) : undefined;
  const computerUse = options.computerUse;
  const terminal = options.terminal;

  const meshJobHandler =
    options.jobHandler ??
    buildMeshJobHandler({ codex, computerUse, terminal, auditStore });

  const advertisedCapabilities = computeCapabilities(
    config.capabilities,
    codex,
    computerUse,
    terminal,
  );

  const fastify = Fastify();
  void fastify.register(
    meshServerPlugin({
      identityStore,
      hostStore,
      workspaceStore,
      auditStore,
      capabilities: advertisedCapabilities,
      endpointResolver: () => resolveLocalEndpoints(config),
      jobHandler: meshJobHandler,
      linkClient: httpLinkClient,
    }),
  );

  const codexHandler = codex
    ? createCodexWsHandler({ runtime: codex, auditStore })
    : undefined;
  const tccHandler =
    computerUse || terminal
      ? createTccWsHandler({ computerUse, terminal, auditStore })
      : undefined;
  const onFrame = composeFrameHandlers(codexHandler, tccHandler);
  const bridgeHttpServer = createServer();
  const bridgeServer = new BridgeServer({
    identityStore,
    auditStore,
    onFrame: onFrame
      ? (session, frame) => {
          void onFrame(session, frame);
        }
      : undefined,
  });
  bridgeServer.attach(bridgeHttpServer, "/bridge");

  const heartbeat = new HeartbeatWriter({
    path: config.statusPath,
    initial: {
      pid: process.pid,
      nodeId: identity.nodeId,
      displayName: identity.displayName,
      host: config.bindAddress,
      bridgePort: config.bridgePort,
      httpPort: config.httpPort,
      startedAt: new Date().toISOString(),
      version: config.version,
    },
  });

  const bonjour = config.bonjourEnabled
    ? (options.bonjourFactory ?? (() => new BonjourAnnouncer()))()
    : undefined;

  return {
    identity,
    config,
    hostStore,
    workspaceStore,
    auditStore,
    identityStore,
    fastify,
    bridgeServer,
    bridgeHttpServer,
    heartbeat,
    bonjour,
    codex,
    computerUse,
    terminal,
    async start() {
      await fastify.listen({ port: config.httpPort, host: config.bindAddress });
      await new Promise<void>((resolve, reject) => {
        bridgeHttpServer.once("error", reject);
        bridgeHttpServer.listen(config.bridgePort, config.bindAddress, () =>
          resolve(),
        );
      });
      await heartbeat.start();
      bonjour?.announce({
        name: `clawix-bridge ${identity.displayName}`,
        bridgePort: config.bridgePort,
        httpPort: config.httpPort,
        nodeId: identity.nodeId,
        displayName: identity.displayName,
        version: config.version,
      });
      if (codex) {
        await codex.start();
      }
    },
    async stop() {
      if (codex) {
        try {
          await codex.stop();
        } catch {
          /* ignore */
        }
      }
      if (terminal) {
        try {
          await terminal.closeAll(2_000);
        } catch {
          /* ignore */
        }
      }
      try {
        await bonjour?.destroy();
      } catch {
        /* ignore */
      }
      bridgeServer.close();
      await new Promise<void>((resolve) =>
        bridgeHttpServer.close(() => resolve()),
      );
      await fastify.close();
      await heartbeat.stop();
      db.close();
    },
  };
}

function defaultDbFactory(path: string): Database.Database {
  return new Database(path);
}

function resolveLocalEndpoints(config: BridgeConfig): HostEndpoint[] {
  const endpoints: HostEndpoint[] = [
    {
      kind: "loopback",
      host: "127.0.0.1",
      port: config.bridgePort,
      protocol: "bridge",
    },
  ];
  for (const lan of listLanIPv4()) {
    endpoints.push({
      kind: "lan",
      host: lan,
      port: config.bridgePort,
      protocol: "bridge",
    });
  }
  return endpoints;
}

function listLanIPv4(): string[] {
  const out: string[] = [];
  const ifaces = networkInterfaces();
  for (const list of Object.values(ifaces)) {
    if (!list) continue;
    for (const item of list) {
      if (item.family === "IPv4" && !item.internal) {
        out.push(item.address);
      }
    }
  }
  return out;
}

function computeCapabilities(
  base: string[],
  codex: CodexRuntime | undefined,
  computerUse: ComputerUse | undefined,
  terminal: TerminalManager | undefined,
): string[] {
  const caps = new Set(base);
  if (codex) caps.add("codex");
  const cu = computerUse?.capabilities();
  if (cu?.screenshot) caps.add("tcc.computer.screenshot");
  if (cu?.keystroke) caps.add("tcc.computer.input.keystroke");
  if (cu?.click) caps.add("tcc.computer.input.click");
  if (terminal) caps.add("tcc.terminal.spawn");
  return Array.from(caps);
}

function composeFrameHandlers(
  ...handlers: (
    | ((session: BridgeSession, frame: BridgeFrame) => Promise<void>)
    | undefined
  )[]
): ((session: BridgeSession, frame: BridgeFrame) => Promise<void>) | undefined {
  const concrete = handlers.filter(
    (h): h is (s: BridgeSession, f: BridgeFrame) => Promise<void> => !!h,
  );
  if (concrete.length === 0) return undefined;
  if (concrete.length === 1) return concrete[0];
  return async (session, frame) => {
    for (const h of concrete) {
      await h(session, frame);
    }
  };
}

interface MeshJobHandlerDeps {
  codex?: CodexRuntime;
  computerUse?: ComputerUse;
  terminal?: TerminalManager;
  auditStore: AuditStore;
}

function buildMeshJobHandler(
  deps: MeshJobHandlerDeps,
): MeshJobHandler | undefined {
  if (!deps.codex && !deps.computerUse && !deps.terminal) return undefined;
  const auditSink: TccAuditSink = {
    record: (input) => deps.auditStore.record(input),
  };
  return async ({ senderId, payload }) => {
    const method =
      payload && typeof payload === "object" && "method" in payload
        ? String((payload as { method?: unknown }).method ?? "")
        : "";
    const jobId = `${senderId}:${Date.now()}`;
    if (method.startsWith("codex.") && deps.codex) {
      const outcome = await handleCodexJob({ runtime: deps.codex }, payload, jobId);
      return {
        jobId,
        status: outcome.ok ? "completed" : "rejected",
        detail: outcome.ok ? undefined : outcome.error,
      };
    }
    if (method.startsWith("tcc.") && (deps.computerUse || deps.terminal)) {
      const outcome = await handleTccJob(
        {
          computerUse: deps.computerUse,
          terminal: deps.terminal,
          audit: auditSink,
          actorId: senderId,
        },
        payload,
        jobId,
      );
      return {
        jobId,
        status: outcome.ok ? "completed" : "rejected",
        detail: outcome.ok ? undefined : outcome.error,
      };
    }
    return {
      jobId,
      status: "rejected",
      detail: `unknown method: ${method}`,
    };
  };
}

export type { BridgeFrame, BridgeSession };
