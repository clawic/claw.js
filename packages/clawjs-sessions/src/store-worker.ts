import { parentPort, workerData } from "node:worker_threads";

import { importCodexSessionsDir } from "./adapters/codex.ts";
import { SessionsServiceStore } from "./store.ts";

type StoreWorkerRequest = {
  id: number;
  operation: string;
  args: unknown[];
};

type StoreWorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: { message: string; name?: string; stack?: string } };

const allowedOperations = new Set([
  "createProject",
  "getProject",
  "getProjectByPath",
  "getProjectByResourceId",
  "listProjects",
  "updateProject",
  "deleteProject",
  "createSession",
  "getSession",
  "getSessionWithMessages",
  "hydrateSession",
  "listSessionDynamicTools",
  "listSessions",
  "sidebarBootstrap",
  "updateSessionTitle",
  "setPinned",
  "setArchived",
  "setSidebarVisibility",
  "assignProject",
  "assignProjectById",
  "setStatus",
  "deleteSession",
  "appendMessage",
  "appendMessageResult",
  "updateMessage",
  "listMessages",
  "searchMessages",
  "listSessionEvents",
  "searchSessionEvents",
  "listTurnSummaries",
  "getProjectionMeta",
  "markSessionProjectionStale",
  "rebuildSessionProjection",
  "rebuildSessionProjections",
  "getSessionMemoryExtract",
  "listPendingSessionMemoryExtractions",
  "rebuildSessionMemoryExtract",
  "rebuildSessionMemoryExtracts",
  "upsertOrigin",
  "listOrigins",
  "findOriginByPath",
  "exportTrajectories",
  "importCodexSessionsDir",
]);

if (!parentPort) throw new Error("store worker requires a parent port");

const store = new SessionsServiceStore(String(workerData.dbPath));
let chain = Promise.resolve();

parentPort.on("message", (request: StoreWorkerRequest) => {
  chain = chain.then(() => handle(request), () => handle(request));
});

async function handle(request: StoreWorkerRequest): Promise<void> {
  const response = await run(request);
  parentPort?.postMessage(response);
}

async function run(request: StoreWorkerRequest): Promise<StoreWorkerResponse> {
  try {
    const result = await execute(request.operation, request.args);
    return { id: request.id, ok: true, result };
  } catch (error) {
    return {
      id: request.id,
      ok: false,
      error: {
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : undefined,
        stack: error instanceof Error ? error.stack : undefined,
      },
    };
  }
}

async function execute(operation: string, args: unknown[]): Promise<unknown> {
  if (!allowedOperations.has(operation)) {
    throw new Error(`Unsupported sessions store operation: ${operation}`);
  }
  if (operation === "importCodexSessionsDir") {
    const [dir, options] = args as [string, Parameters<typeof importCodexSessionsDir>[2]];
    return importCodexSessionsDir(store, String(dir), options as Parameters<typeof importCodexSessionsDir>[2]);
  }
  const method = (store as unknown as Record<string, (...methodArgs: unknown[]) => unknown>)[operation];
  if (typeof method !== "function") {
    throw new Error(`Missing sessions store operation: ${operation}`);
  }
  return method.apply(store, args);
}

process.once("SIGTERM", () => {
  store.close();
  process.exit(0);
});
