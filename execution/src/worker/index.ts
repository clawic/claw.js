import { setTimeout as delay } from "node:timers/promises";
import WebSocket from "ws";

import type {
  WorkerCompleteEnvelope,
  WorkerHelloEnvelope,
  WorkerInboundEnvelope,
  WorkerLogsEnvelope,
} from "../shared/protocol.ts";
import { executeRun } from "./runtime.ts";

export interface ExecutionWorkerOptions {
  baseUrl: string;
  tenantId: string;
  workerId: string;
  label: string;
  workspaceRoot: string;
  runtimes: Array<"node" | "python">;
  deployKinds: Array<"static" | "node-web">;
  secret: string;
}

interface RunExecutionWorkerOptions {
  signal?: AbortSignal;
}

function toWebSocketUrl(baseUrl: string): string {
  const url = new URL("/v1/workers/connect", baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function parseArgs(argv: string[]): ExecutionWorkerOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[index + 1];
    if (value && !value.startsWith("--")) {
      values.set(key, value);
      index += 1;
    }
  }
  return {
    baseUrl: values.get("base-url") ?? process.env.EXECUTION_PLANE_URL ?? "http://127.0.0.1:4710",
    tenantId: values.get("tenant-id") ?? process.env.EXECUTION_PLANE_TENANT_ID ?? "demo-tenant",
    workerId: values.get("worker-id") ?? process.env.EXECUTION_PLANE_WORKER_ID ?? "local-worker",
    label: values.get("label") ?? process.env.EXECUTION_PLANE_WORKER_LABEL ?? "Local Worker",
    workspaceRoot: values.get("workspace-root") ?? process.env.EXECUTION_PLANE_WORKSPACE_ROOT ?? "./execution-worker",
    runtimes: ((values.get("runtimes") ?? process.env.EXECUTION_PLANE_RUNTIMES ?? "node,python").split(",").map((value) => value.trim()).filter(Boolean) as Array<"node" | "python">),
    deployKinds: ((values.get("deploy-kinds") ?? process.env.EXECUTION_PLANE_DEPLOY_KINDS ?? "static,node-web").split(",").map((value) => value.trim()).filter(Boolean) as Array<"static" | "node-web">),
    secret: values.get("secret") ?? process.env.EXECUTION_PLANE_WORKER_SECRET ?? "execution-worker-secret",
  };
}

export async function runExecutionWorker(argv = process.argv.slice(2), runtimeOptions: RunExecutionWorkerOptions = {}): Promise<void> {
  const workerOptions = parseArgs(argv);
  while (!runtimeOptions.signal?.aborted) {
    try {
      await runOnce(workerOptions, runtimeOptions.signal);
    } catch (error) {
      if (runtimeOptions.signal?.aborted) break;
      console.error(`[execution-worker] ${error instanceof Error ? error.message : String(error)}`);
    }
    await delay(1_000, undefined, { signal: runtimeOptions.signal }).catch(() => undefined);
  }
}

async function runOnce(options: ExecutionWorkerOptions, signal?: AbortSignal): Promise<void> {
  const socket = new WebSocket(toWebSocketUrl(options.baseUrl));
  signal?.addEventListener("abort", () => socket.close(), { once: true });

  socket.on("open", () => {
    const hello: WorkerHelloEnvelope = {
      type: "hello",
      payload: {
        tenantId: options.tenantId,
        workerId: options.workerId,
        label: options.label,
        workspaceRoot: options.workspaceRoot,
        secret: options.secret,
        runtimes: options.runtimes,
        deployKinds: options.deployKinds,
      },
    };
    socket.send(JSON.stringify(hello));
    const heartbeat = setInterval(() => {
      socket.send(JSON.stringify({
        type: "heartbeat",
        payload: {
          workerId: options.workerId,
          timestamp: Date.now(),
        },
      }));
      socket.send(JSON.stringify({
        type: "claimRun",
        payload: {
          tenantId: options.tenantId,
          workerId: options.workerId,
        },
      }));
    }, 750);
    socket.once("close", () => clearInterval(heartbeat));
  });

  socket.on("message", async (buffer) => {
    const message = JSON.parse(buffer.toString()) as WorkerInboundEnvelope;
    if (message.type !== "invoke") return;
    const result = await executeRun(message.payload, (stream, line) => {
      const payload: WorkerLogsEnvelope = {
        type: "streamLogs",
        requestId: message.requestId,
        payload: {
          runId: message.payload.runId,
          stream,
          line,
        },
      };
      socket.send(JSON.stringify(payload));
    });
    const complete: WorkerCompleteEnvelope = {
      type: "completeRun",
      requestId: message.requestId,
      payload: {
        runId: message.payload.runId,
        status: result.exitCode === 0 ? "succeeded" : "failed",
        exitCode: result.exitCode,
        outputText: result.outputText,
        errorText: result.errorText,
        artifacts: result.artifacts,
        ...(result.notebookSnapshot ? { notebookSnapshot: result.notebookSnapshot } : {}),
      },
    };
    socket.send(JSON.stringify(complete));
  });

  await new Promise<void>((resolve, reject) => {
    socket.once("close", () => resolve());
    socket.once("error", (error) => reject(error));
  });
}
