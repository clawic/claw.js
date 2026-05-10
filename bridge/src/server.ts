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
import { httpLinkClient } from "./link-client.ts";

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
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface BridgeRuntimeOptions {
  config: BridgeConfig;
  jobHandler?: MeshJobHandler;
  databaseFactory?: (path: string) => Database.Database;
  bonjourFactory?: () => BonjourAnnouncer;
  codex?: CodexRuntimeOptions;
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

  const meshJobHandler =
    options.jobHandler ??
    (codex ? buildCodexMeshJobHandler(codex) : undefined);

  const fastify = Fastify();
  void fastify.register(
    meshServerPlugin({
      identityStore,
      hostStore,
      workspaceStore,
      auditStore,
      capabilities: codex
        ? Array.from(new Set([...config.capabilities, "codex"]))
        : config.capabilities,
      endpointResolver: () => resolveLocalEndpoints(config),
      jobHandler: meshJobHandler,
      linkClient: httpLinkClient,
    }),
  );

  const onFrame = codex
    ? createCodexWsHandler({ runtime: codex, auditStore })
    : undefined;
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

function buildCodexMeshJobHandler(runtime: CodexRuntime): MeshJobHandler {
  return async ({ senderId, payload }) => {
    const jobId = `codex:${senderId}:${Date.now()}`;
    const outcome = await handleCodexJob({ runtime }, payload, jobId);
    return {
      jobId,
      status: outcome.ok ? "completed" : "rejected",
      detail: outcome.ok ? undefined : outcome.error,
    };
  };
}

export type { BridgeFrame, BridgeSession };
