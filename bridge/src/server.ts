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
  SshSecretStore,
  WorkspaceStore,
  meshServerPlugin,
  type BridgeFrame,
  type BridgeSession,
  type HostEndpoint,
  type MeshJobHandler,
  type NodeIdentity,
} from "@clawjs/mesh";

import {
  SshClient,
  type HostResolver as SshHostResolver,
  type SecretResolver as SshSecretResolver,
} from "@clawjs/ssh-client";

import { handleCodexJob } from "./codex-job-handler.ts";
import { CodexRuntime, type CodexRuntimeOptions } from "./codex-runtime.ts";
import { createCodexWsHandler } from "./codex-ws-bridge.ts";
import type { BridgeConfig } from "./config.ts";
import type { ComputerUse } from "./computer-use.ts";
import { CoordinatorClient, type SignalingEnvelope } from "./coordinator-client.ts";
import { createIrohNode, type IrohBiStream, type IrohNode } from "./iroh-node.ts";
import { httpLinkClient } from "./link-client.ts";
import { handleSshJob, type SshAuditSink } from "./ssh-job-handler.ts";
import { createSshWsHandler } from "./ssh-ws-bridge.ts";
import { handleTccJob, type TccAuditSink } from "./tcc-job-handler.ts";
import { createTccWsHandler } from "./tcc-ws-bridge.ts";
import type { TerminalProcessController } from "./terminal.ts";

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
  terminal?: TerminalProcessController;
  ssh?: SshClient;
  sshSecretStore?: SshSecretStore;
  irohNode?: IrohNode;
  coordinatorClient?: CoordinatorClient;
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
  terminal?: TerminalProcessController;
  ssh?: SshBridgeOptions;
}

export interface SshBridgeOptions {
  enabled: boolean;
  readyTimeoutMs?: number;
  idleEvictionMs?: number;
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
  const sshEnabled = options.ssh?.enabled === true;
  const sshSecretStore = sshEnabled ? new SshSecretStore(db) : undefined;
  const sshClient = sshEnabled
    ? new SshClient({
        hostResolver: {
          async resolve(id) {
            return hostStore.get(id);
          },
        } satisfies SshHostResolver,
        secretResolver: {
          async resolve(id) {
            return sshSecretStore!.get(id);
          },
        } satisfies SshSecretResolver,
        readyTimeoutMs: options.ssh?.readyTimeoutMs,
        idleEvictionMs: options.ssh?.idleEvictionMs,
      })
    : undefined;

  const meshJobHandler =
    options.jobHandler ??
    buildMeshJobHandler({
      codex,
      computerUse,
      terminal,
      sshClient,
      auditStore,
    });

  const advertisedCapabilities = computeCapabilities(
    config.capabilities,
    codex,
    computerUse,
    terminal,
    sshClient,
  );

  const fastify = Fastify();
  void fastify.register(
    meshServerPlugin({
      identityStore,
      hostStore,
      workspaceStore,
      auditStore,
      sshSecretStore,
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
  const sshHandler = sshClient
    ? createSshWsHandler({ client: sshClient, auditStore })
    : undefined;
  const onFrame = composeFrameHandlers(codexHandler, tccHandler, sshHandler);
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

  const irohEnabled = config.iroh?.enabled !== false;
  let irohNode: IrohNode | undefined;
  let coordinatorClient: CoordinatorClient | undefined;

  const handleInboundIrohStream = (stream: IrohBiStream) => {
    try {
      bridgeServer.attachExternalStream?.(stream);
    } catch (error) {
      stream.close();
      // ignore: external transport is best effort
      void error;
    }
  };

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
    ssh: sshClient,
    sshSecretStore,
    get irohNode() {
      return irohNode;
    },
    get coordinatorClient() {
      return coordinatorClient;
    },
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
      if (irohEnabled) {
        irohNode = await createIrohNode({
          ...(config.iroh?.relayUrl ? { relayUrl: config.iroh.relayUrl } : {}),
        }).catch(() => undefined);
        if (irohNode) {
          try {
            await irohNode.start();
            irohNode.onInbound((stream) => handleInboundIrohStream(stream));
          } catch {
            irohNode = undefined;
          }
        }
      }
      if (config.coordinator) {
        const opts = config.coordinator;
        const endpointDescriptor = irohNode
          ? await irohNode.describeEndpoint().catch(() => null)
          : null;
        coordinatorClient = new CoordinatorClient({
          baseUrl: opts.baseUrl,
          accessToken: opts.accessToken,
          deviceId: opts.deviceId,
          tenantId: opts.tenantId,
          ...(endpointDescriptor?.nodeId ? { irohNodeId: endpointDescriptor.nodeId } : {}),
          ...(endpointDescriptor?.relayUrl ? { relayUrl: endpointDescriptor.relayUrl } : {}),
          ...(opts.heartbeatIntervalMs ? { heartbeatIntervalMs: opts.heartbeatIntervalMs } : {}),
          publicAddrs: async () => {
            if (!irohNode) return [];
            const info = await irohNode.describeEndpoint().catch(() => null);
            return info?.publicAddrs ?? [];
          },
          onSignaling: (envelope: SignalingEnvelope) => {
            void handleCoordinatorSignaling(envelope, { irohNode, coordinatorClient });
          },
        });
        await coordinatorClient.start();
      }
    },
    async stop() {
      if (coordinatorClient) {
        try {
          coordinatorClient.stop();
        } catch {
          /* ignore */
        }
        coordinatorClient = undefined;
      }
      if (irohNode) {
        try {
          await irohNode.stop();
        } catch {
          /* ignore */
        }
        irohNode = undefined;
      }
      if (codex) {
        try {
          await codex.stop();
        } catch {
          /* ignore */
        }
      }
      if (sshClient) {
        try {
          await sshClient.closeAll();
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
  terminal: TerminalProcessController | undefined,
  ssh: SshClient | undefined,
): string[] {
  const caps = new Set(base);
  if (codex) caps.add("codex");
  const cu = computerUse?.capabilities();
  if (cu?.screenshot) caps.add("tcc.computer.screenshot");
  if (cu?.keystroke) caps.add("tcc.computer.input.keystroke");
  if (cu?.click) caps.add("tcc.computer.input.click");
  if (terminal) caps.add("tcc.terminal.spawn");
  if (ssh) {
    caps.add("ssh.exec");
    caps.add("ssh.sftp");
    caps.add("ssh.installBridge");
  }
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
  terminal?: TerminalProcessController;
  sshClient?: SshClient;
  auditStore: AuditStore;
}

function buildMeshJobHandler(
  deps: MeshJobHandlerDeps,
): MeshJobHandler | undefined {
  if (!deps.codex && !deps.computerUse && !deps.terminal && !deps.sshClient) {
    return undefined;
  }
  const auditSink: TccAuditSink = {
    record: (input) => deps.auditStore.record(input),
  };
  const sshAuditSink: SshAuditSink = {
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
    if (method.startsWith("ssh.") && deps.sshClient) {
      const outcome = await handleSshJob(
        {
          client: deps.sshClient,
          audit: sshAuditSink,
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

async function handleCoordinatorSignaling(
  envelope: SignalingEnvelope,
  context: { irohNode: IrohNode | undefined; coordinatorClient: CoordinatorClient | undefined },
): Promise<void> {
  const payload = envelope.payload as
    | { kind?: string; nodeId?: string; relayUrl?: string }
    | undefined;
  if (!payload || typeof payload !== "object") return;
  if (payload.kind !== "iroh.invite" || !payload.nodeId || !context.irohNode) return;
  try {
    const stream = await context.irohNode.connect({
      nodeId: payload.nodeId,
      ...(payload.relayUrl ? { relayUrl: payload.relayUrl } : {}),
    });
    stream.on("error", () => stream.close());
  } catch (error) {
    if (context.coordinatorClient) {
      await context.coordinatorClient
        .sendSignaling(envelope.fromDeviceId, {
          kind: "iroh.error",
          message: error instanceof Error ? error.message : String(error),
        })
        .catch(() => undefined);
    }
  }
}

export type { BridgeFrame, BridgeSession };
