import { performance } from "node:perf_hooks";
import { Worker } from "node:worker_threads";

import type {
  CollectionDefinition,
  DatabaseOperation,
  DatabaseStorageMetrics,
  FileAsset,
  FieldDefinition,
  IndexDefinition,
  ListRecordsOptions,
  NamespaceRecord,
  RecordEnvelope,
  ScopedTokenRecord,
} from "./types.ts";
import { StorageMetrics } from "./storage-metrics.ts";

interface PendingCall {
  resolve(value: unknown): void;
  reject(error: Error & { receipt?: unknown }): void;
}

type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: { message: string; name?: string; stack?: string; receipt?: unknown } };

export class AsyncDatabaseServiceStore {
  private readonly worker: Worker;
  private readonly pending = new Map<number, PendingCall>();
  private readonly metrics = new StorageMetrics();
  private nextId = 1;
  private queueDepth = 0;
  private closed = false;
  private serial = Promise.resolve();

  constructor(dbPath: string, filesDir: string) {
    this.worker = new Worker(resolveWorkerUrl(), {
      workerData: { dbPath, filesDir },
      execArgv: workerExecArgv(),
    });
    this.worker.on("message", (message: WorkerResponse) => this.handleMessage(message));
    this.worker.on("error", (error) => this.rejectAll(error));
    this.worker.on("exit", (code) => {
      if (this.closed || code === 0) return;
      this.rejectAll(new Error(`database store worker exited with code ${code}`));
    });
  }

  snapshotMetrics(): DatabaseStorageMetrics {
    return this.metrics.snapshot(this.queueDepth);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.worker.terminate();
  }

  verifyAdmin(email: string, password: string): Promise<{ id: string; email: string } | null> {
    return this.call("verifyAdmin", email, password);
  }

  findAdminByEmail(email: string): Promise<{ id: string; email: string } | null> {
    return this.call("findAdminByEmail", email);
  }

  createAdmin(input: { email: string; password: string }): Promise<{ id: string; email: string }> {
    return this.call("createAdmin", input);
  }

  listNamespaces(): Promise<NamespaceRecord[]> {
    return this.call("listNamespaces");
  }

  getNamespace(namespaceId: string): Promise<NamespaceRecord | null> {
    return this.call("getNamespace", namespaceId);
  }

  ensureNamespace(input: { id: string; displayName?: string }): Promise<NamespaceRecord> {
    return this.call("ensureNamespace", input);
  }

  createNamespace(input: { id?: string; displayName: string }): Promise<NamespaceRecord> {
    return this.call("createNamespace", input);
  }

  ensureBuiltinCollections(namespaceId: string): Promise<void> {
    return this.call("ensureBuiltinCollections", namespaceId);
  }

  listCollections(namespaceId: string): Promise<CollectionDefinition[]> {
    return this.call("listCollections", namespaceId);
  }

  getCollection(namespaceId: string, name: string): Promise<CollectionDefinition | null> {
    return this.call("getCollection", namespaceId, name);
  }

  createCollection(namespaceId: string, input: {
    name: string;
    displayName?: string;
    fields: FieldDefinition[];
    indexes?: IndexDefinition[];
    builtin?: boolean;
    protected?: boolean;
    coreFieldNames?: string[];
  }): Promise<CollectionDefinition> {
    return this.call("createCollection", namespaceId, input);
  }

  updateCollection(namespaceId: string, name: string, input: {
    displayName?: string;
    fields?: FieldDefinition[];
    indexes?: IndexDefinition[];
  }): Promise<CollectionDefinition> {
    return this.call("updateCollection", namespaceId, name, input);
  }

  deleteCollection(namespaceId: string, name: string): Promise<boolean> {
    return this.call("deleteCollection", namespaceId, name);
  }

  listRecords(namespaceId: string, collectionName: string, options: ListRecordsOptions = {}): Promise<{ total: number; items: RecordEnvelope[] }> {
    return this.call("listRecords", namespaceId, collectionName, options);
  }

  getRecord(namespaceId: string, collectionName: string, id: string): Promise<RecordEnvelope | null> {
    return this.call("getRecord", namespaceId, collectionName, id);
  }

  createRecord(namespaceId: string, collectionName: string, payload: Record<string, unknown>): Promise<RecordEnvelope> {
    return this.call("createRecord", namespaceId, collectionName, payload);
  }

  putRecord(input: {
    namespaceId: string;
    collectionName: string;
    recordId: string;
    payload: Record<string, unknown>;
    createdAt?: string;
    updatedAt?: string;
  }): Promise<RecordEnvelope> {
    return this.call("putRecord", input);
  }

  updateRecord(namespaceId: string, collectionName: string, id: string, patch: Record<string, unknown>): Promise<RecordEnvelope> {
    return this.call("updateRecord", namespaceId, collectionName, id, patch);
  }

  deleteRecord(namespaceId: string, collectionName: string, id: string): Promise<boolean> {
    return this.call("deleteRecord", namespaceId, collectionName, id);
  }

  createScopedToken(input: {
    label: string;
    namespaceId: string;
    collectionName?: string | null;
    operations: DatabaseOperation[];
  }): Promise<{ record: ScopedTokenRecord; token: string }> {
    return this.call("createScopedToken", input);
  }

  listScopedTokens(namespaceId: string): Promise<ScopedTokenRecord[]> {
    return this.call("listScopedTokens", namespaceId);
  }

  getScopedToken(id: string): Promise<ScopedTokenRecord | null> {
    return this.call("getScopedToken", id);
  }

  revokeScopedToken(namespaceId: string, tokenId: string): Promise<boolean> {
    return this.call("revokeScopedToken", namespaceId, tokenId);
  }

  authenticateScopedToken(rawToken: string): Promise<ScopedTokenRecord | null> {
    return this.call("authenticateScopedToken", rawToken);
  }

  saveFile(input: {
    namespaceId: string;
    filename: string;
    contentType: string;
    bytes: Buffer;
    collectionName?: string | null;
    recordId?: string | null;
  }): Promise<FileAsset> {
    return this.call("saveFile", input);
  }

  listFiles(namespaceId: string): Promise<FileAsset[]> {
    return this.call("listFiles", namespaceId);
  }

  getFile(id: string): Promise<(FileAsset & { storagePath: string }) | null> {
    return this.call("getFile", id);
  }

  deleteFile(id: string): Promise<boolean> {
    return this.call("deleteFile", id);
  }

  readAppStateProjection(input: { receiptLimit?: number; sidebarLimit?: number } = {}): Promise<unknown> {
    return this.call("readAppStateProjection", input);
  }

  applyAppStateTransaction(input: unknown): Promise<unknown> {
    return this.call("applyAppStateTransaction", input);
  }

  private call<T>(operation: string, ...args: unknown[]): Promise<T> {
    if (this.closed) return Promise.reject(new Error("database store worker is closed"));
    const start = performance.now();
    let failed = false;
    this.queueDepth += 1;
    const run = () => new Promise<T>((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
      });
      this.worker.postMessage({ id, operation, args });
    });
    const promise = this.serial.then(run, run);
    this.serial = promise.then(() => undefined, () => undefined);
    return promise.catch((error) => {
      failed = true;
      throw error;
    }).finally(() => {
      this.queueDepth = Math.max(0, this.queueDepth - 1);
      this.metrics.record(operation, performance.now() - start, failed);
    });
  }

  private handleMessage(message: WorkerResponse): void {
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.ok) {
      pending.resolve(message.result);
      return;
    }
    const error = new Error(message.error.message) as Error & { receipt?: unknown };
    error.name = message.error.name ?? "Error";
    if (message.error.stack) error.stack = message.error.stack;
    if (message.error.receipt !== undefined) error.receipt = message.error.receipt;
    pending.reject(error);
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}

function resolveWorkerUrl(): URL {
  const suffix = import.meta.url.endsWith(".ts") ? "./store-worker.ts" : "./store-worker.js";
  return new URL(suffix, import.meta.url);
}

function workerExecArgv(): string[] {
  return import.meta.url.endsWith(".ts") ? ["--import", "tsx"] : process.execArgv;
}
