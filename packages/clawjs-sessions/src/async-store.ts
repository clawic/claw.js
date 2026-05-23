import { Worker } from "node:worker_threads";
import { performance } from "node:perf_hooks";

import type {
  AppendMessageInput,
  CreateProjectInput,
  CreateSessionInput,
  ExportTrajectoryOptions,
  HydrateSessionInput,
  HydratedSessionResult,
  ListSessionDynamicToolsOptions,
  ListSessionEventsFilter,
  ListProjectsFilter,
  ListProjectsResult,
  ListSessionsFilter,
  ListSessionsResult,
  ProjectRecord,
  RebuildSessionProjectionsInput,
  RebuildSessionProjectionsResult,
  RebuildSessionProjectionResult,
  SearchSessionsInput,
  SearchSessionEventsInput,
  SessionEventSearchHit,
  SessionMessageRecord,
  SessionOriginRecord,
  SessionProjectionMetaRecord,
  SessionRecord,
  SessionStructuredEventRecord,
  SessionSearchHit,
  SessionStatus,
  SessionStorageMetrics,
  SessionTurnSummaryRecord,
  SessionWithMessages,
  SidebarBootstrapResult,
  SessionDynamicToolRecord,
  TrajectoryRecord,
  UpdateProjectInput,
  UpsertOriginInput,
} from "./types.ts";
import { StorageMetrics } from "./storage-metrics.ts";

interface PendingCall {
  resolve(value: unknown): void;
  reject(error: Error): void;
}

type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: { message: string; name?: string; stack?: string } };

export class AsyncSessionsServiceStore {
  private readonly worker: Worker;
  private readonly pending = new Map<number, PendingCall>();
  private readonly metrics = new StorageMetrics();
  private nextId = 1;
  private queueDepth = 0;
  private closed = false;
  private serial = Promise.resolve();

  constructor(dbPath: string) {
    this.worker = new Worker(resolveWorkerUrl(), {
      workerData: { dbPath },
      execArgv: workerExecArgv(),
    });
    this.worker.on("message", (message: WorkerResponse) => this.handleMessage(message));
    this.worker.on("error", (error) => this.rejectAll(error));
    this.worker.on("exit", (code) => {
      if (this.closed || code === 0) return;
      this.rejectAll(new Error(`sessions store worker exited with code ${code}`));
    });
  }

  snapshotMetrics(): SessionStorageMetrics {
    return this.metrics.snapshot(this.queueDepth);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.worker.terminate();
  }

  createProject(input: CreateProjectInput): Promise<ProjectRecord> {
    return this.call("createProject", input);
  }

  getProject(id: string): Promise<ProjectRecord | null> {
    return this.call("getProject", id);
  }

  getProjectByPath(projectPath: string): Promise<ProjectRecord | null> {
    return this.call("getProjectByPath", projectPath);
  }

  getProjectByResourceId(resourceId: string): Promise<ProjectRecord | null> {
    return this.call("getProjectByResourceId", resourceId);
  }

  listProjects(filter: ListProjectsFilter = {}): Promise<ListProjectsResult> {
    return this.call("listProjects", filter);
  }

  updateProject(id: string, patch: UpdateProjectInput): Promise<ProjectRecord | null> {
    return this.call("updateProject", id, patch);
  }

  deleteProject(id: string): Promise<boolean> {
    return this.call("deleteProject", id);
  }

  createSession(input: CreateSessionInput): Promise<SessionRecord> {
    return this.call("createSession", input);
  }

  getSession(id: string): Promise<SessionRecord | null> {
    return this.call("getSession", id);
  }

  getSessionWithMessages(id: string, limit?: number): Promise<SessionWithMessages | null> {
    return this.call("getSessionWithMessages", id, limit);
  }

  hydrateSession(input: HydrateSessionInput): Promise<HydratedSessionResult | null> {
    return this.call("hydrateSession", input);
  }

  listSessionDynamicTools(sessionId: string, options: ListSessionDynamicToolsOptions = {}): Promise<SessionDynamicToolRecord[]> {
    return this.call("listSessionDynamicTools", sessionId, options);
  }

  listSessions(filter: ListSessionsFilter = {}): Promise<ListSessionsResult> {
    return this.call("listSessions", filter);
  }

  sidebarBootstrap(input: { recentLimit?: number } = {}): Promise<SidebarBootstrapResult> {
    return this.call("sidebarBootstrap", input);
  }

  updateSessionTitle(id: string, title: string): Promise<SessionRecord | null> {
    return this.call("updateSessionTitle", id, title);
  }

  setPinned(id: string, pinned: boolean): Promise<SessionRecord | null> {
    return this.call("setPinned", id, pinned);
  }

  setArchived(id: string, archived: boolean): Promise<SessionRecord | null> {
    return this.call("setArchived", id, archived);
  }

  setSidebarVisibility(id: string, visible: boolean): Promise<SessionRecord | null> {
    return this.call("setSidebarVisibility", id, visible);
  }

  assignProject(id: string, projectPath: string | null): Promise<SessionRecord | null> {
    return this.call("assignProject", id, projectPath);
  }

  assignProjectById(id: string, projectId: string | null): Promise<SessionRecord | null> {
    return this.call("assignProjectById", id, projectId);
  }

  setStatus(id: string, status: SessionStatus): Promise<SessionRecord | null> {
    return this.call("setStatus", id, status);
  }

  deleteSession(id: string): Promise<boolean> {
    return this.call("deleteSession", id);
  }

  appendMessage(input: AppendMessageInput): Promise<SessionMessageRecord> {
    return this.call("appendMessage", input);
  }

  appendMessageResult(input: AppendMessageInput): Promise<{ message: SessionMessageRecord; inserted: boolean }> {
    return this.call("appendMessageResult", input);
  }

  updateMessage(id: string, patch: Partial<Pick<AppendMessageInput, "contentText" | "contentBlocks" | "toolCalls" | "timeline" | "workSummary" | "streamingState" | "attachments">>): Promise<SessionMessageRecord | null> {
    return this.call("updateMessage", id, patch);
  }

  listMessages(sessionId: string, limit?: number, offset?: number): Promise<SessionMessageRecord[]> {
    return this.call("listMessages", sessionId, limit, offset);
  }

  searchMessages(input: SearchSessionsInput): Promise<SessionSearchHit[]> {
    return this.call("searchMessages", input);
  }

  listSessionEvents(filter: ListSessionEventsFilter): Promise<SessionStructuredEventRecord[]> {
    return this.call("listSessionEvents", filter);
  }

  searchSessionEvents(input: SearchSessionEventsInput): Promise<SessionEventSearchHit[]> {
    return this.call("searchSessionEvents", input);
  }

  listTurnSummaries(sessionId: string, turnIds?: string[]): Promise<SessionTurnSummaryRecord[]> {
    return this.call("listTurnSummaries", sessionId, turnIds);
  }

  getProjectionMeta(sessionId: string): Promise<SessionProjectionMetaRecord | null> {
    return this.call("getProjectionMeta", sessionId);
  }

  markSessionProjectionStale(sessionId: string, reason: string): Promise<SessionProjectionMetaRecord> {
    return this.call("markSessionProjectionStale", sessionId, reason);
  }

  rebuildSessionProjection(sessionId: string): Promise<RebuildSessionProjectionResult> {
    return this.call("rebuildSessionProjection", sessionId);
  }

  rebuildSessionProjections(input: RebuildSessionProjectionsInput = {}): Promise<RebuildSessionProjectionsResult> {
    return this.call("rebuildSessionProjections", input);
  }

  upsertOrigin(input: UpsertOriginInput): Promise<SessionOriginRecord> {
    return this.call("upsertOrigin", input);
  }

  listOrigins(sessionId: string): Promise<SessionOriginRecord[]> {
    return this.call("listOrigins", sessionId);
  }

  findOriginByPath(nativePath: string): Promise<SessionOriginRecord | null> {
    return this.call("findOriginByPath", nativePath);
  }

  exportTrajectories(options: ExportTrajectoryOptions = {}): Promise<TrajectoryRecord[]> {
    return this.call("exportTrajectories", options);
  }

  importCodexSessionsDir(dir: string, options: unknown): Promise<unknown> {
    return this.call("importCodexSessionsDir", dir, options);
  }

  private call<T>(operation: string, ...args: unknown[]): Promise<T> {
    if (this.closed) return Promise.reject(new Error("sessions store worker is closed"));
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
    const error = new Error(message.error.message);
    error.name = message.error.name ?? "Error";
    if (message.error.stack) error.stack = message.error.stack;
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
  return import.meta.url.endsWith(".ts") ? ["--import", "tsx"] : [];
}
