import fs from "node:fs";

import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";

import { createDockerBackend } from "./backends/docker.ts";
import { localBackend } from "./backends/local.ts";
import { createSshBackend } from "./backends/ssh.ts";
import { loadSandboxConfig, type SandboxServiceConfig } from "./config.ts";
import { runOnBackend } from "./runner.ts";
import { SandboxServiceStore } from "./store.ts";
import type {
  BackendAdapter,
  ListRunsFilter,
  RunRequest,
  RunStatus,
  SandboxBackend,
} from "./types.ts";

export interface BuildSandboxAppOptions {
  config?: Partial<SandboxServiceConfig>;
  backends?: Partial<Record<SandboxBackend, BackendAdapter>>;
}

function parseBearer(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

function requireSecret(request: FastifyRequest, reply: FastifyReply, secret: string): boolean {
  const token = parseBearer(request);
  if (token !== secret) {
    void reply.code(401).send({ error: "Unauthorized" });
    return false;
  }
  return true;
}

function readBody(request: FastifyRequest): Record<string, unknown> {
  return ((request.body ?? {}) as Record<string, unknown>);
}

function readQuery(request: FastifyRequest): Record<string, string> {
  return ((request.query ?? {}) as Record<string, string>);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function buildSandboxApp(options: BuildSandboxAppOptions = {}) {
  const config = loadSandboxConfig(options.config);
  fs.mkdirSync(config.dataDir, { recursive: true });

  const app = Fastify({ logger: false, bodyLimit: 16 * 1024 * 1024 });
  const store = new SandboxServiceStore(config.dbPath);

  const backends: Partial<Record<SandboxBackend, BackendAdapter>> = {
    local: localBackend,
    ...(config.enableDocker ? { docker: createDockerBackend({ dockerBin: config.dockerBin }) } : {}),
    ...(config.enableSsh ? { ssh: createSshBackend({ sshBin: config.sshBin }) } : {}),
    ...(options.backends ?? {}),
  };

  app.addHook("onClose", async () => {
    store.close();
  });

  app.get("/v1/health", async () => ({
    ok: true,
    service: "sandbox",
    host: config.host,
    port: config.port,
    enabledBackends: Object.keys(backends),
  }));

  app.post("/v1/sandbox/run", async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    try {
      const body = readBody(request);
      const input: RunRequest = {
        id: asString(body.id),
        backend: body.backend as SandboxBackend,
        command: String(body.command ?? ""),
        args: Array.isArray(body.args) ? (body.args as string[]) : [],
        cwd: (body.cwd as string | null | undefined) ?? null,
        env: (body.env as Record<string, string> | null) ?? null,
        stdin: (body.stdin as string | null | undefined) ?? null,
        timeoutMs: asNumber(body.timeoutMs) ?? null,
        image: (body.image as string | null | undefined) ?? null,
        network: (body.network as string | null | undefined) ?? null,
        host: (body.host as string | null | undefined) ?? null,
        identityFile: (body.identityFile as string | null | undefined) ?? null,
        sshOptions: Array.isArray(body.sshOptions) ? (body.sshOptions as string[]) : null,
        metadata: (body.metadata as Record<string, unknown> | null) ?? null,
      };
      if (!input.backend || !input.command) {
        return await reply.code(400).send({ error: "backend and command are required" });
      }
      if (!backends[input.backend]) {
        return await reply.code(400).send({ error: `backend not enabled: ${input.backend}` });
      }
      return await runOnBackend(store, {
        defaultTimeoutMs: config.defaultTimeoutMs,
        backends,
      }, input);
    } catch (error) {
      return await reply.code(500).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/v1/sandbox/runs", async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const query = readQuery(request);
    const filter: ListRunsFilter = {
      backend: asString(query.backend) as SandboxBackend | undefined,
      status: asString(query.status) as RunStatus | undefined,
      host: asString(query.host),
      limit: asNumber(query.limit),
      offset: asNumber(query.offset),
    };
    return { items: store.listRuns(filter) };
  });

  app.get("/v1/sandbox/runs/:id", async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    const run = store.getRun(params.id);
    if (!run) return await reply.code(404).send({ error: "run_not_found" });
    return run;
  });

  return { app, config, store, backends };
}
