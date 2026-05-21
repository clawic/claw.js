import { parentPort, workerData } from "node:worker_threads";

import {
  applyAppStateTransaction,
  readAppStateProjection,
} from "./app-state-service.ts";
import { DatabaseServiceStore } from "./store.ts";

type StoreWorkerRequest = {
  id: number;
  operation: string;
  args: unknown[];
};

type StoreWorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: { message: string; name?: string; stack?: string; receipt?: unknown } };

const allowedOperations = new Set([
  "verifyAdmin",
  "findAdminByEmail",
  "createAdmin",
  "listNamespaces",
  "getNamespace",
  "ensureNamespace",
  "createNamespace",
  "ensureBuiltinCollections",
  "listCollections",
  "getCollection",
  "createCollection",
  "updateCollection",
  "deleteCollection",
  "listRecords",
  "getRecord",
  "createRecord",
  "putRecord",
  "updateRecord",
  "deleteRecord",
  "createScopedToken",
  "listScopedTokens",
  "getScopedToken",
  "revokeScopedToken",
  "authenticateScopedToken",
  "saveFile",
  "listFiles",
  "getFile",
  "deleteFile",
  "readAppStateProjection",
  "applyAppStateTransaction",
]);

if (!parentPort) throw new Error("database store worker requires a parent port");

const store = new DatabaseServiceStore(String(workerData.dbPath), String(workerData.filesDir));
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
    const result = execute(request.operation, request.args);
    return { id: request.id, ok: true, result };
  } catch (error) {
    return {
      id: request.id,
      ok: false,
      error: {
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : undefined,
        stack: error instanceof Error ? error.stack : undefined,
        receipt: typeof error === "object" && error && "receipt" in error ? (error as { receipt: unknown }).receipt : undefined,
      },
    };
  }
}

function execute(operation: string, args: unknown[]): unknown {
  if (!allowedOperations.has(operation)) {
    throw new Error(`Unsupported database store operation: ${operation}`);
  }
  if (operation === "readAppStateProjection") {
    return readAppStateProjection(store.sqlite, args[0] as Parameters<typeof readAppStateProjection>[1]);
  }
  if (operation === "applyAppStateTransaction") {
    return applyAppStateTransaction(store.sqlite, args[0]);
  }
  const method = (store as unknown as Record<string, (...methodArgs: unknown[]) => unknown>)[operation];
  if (typeof method !== "function") {
    throw new Error(`Missing database store operation: ${operation}`);
  }
  return method.apply(store, args);
}

process.once("SIGTERM", () => {
  store.close();
  process.exit(0);
});
