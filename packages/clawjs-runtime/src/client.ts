import { clawApiPath } from "@clawjs/core";
import type {
  ClaimResult,
  CreateKanbanTaskInput,
  DispatcherTickResult,
  DistillInput,
  DistillationRecord,
  KanbanBoard,
  KanbanCommentRecord,
  KanbanEventRecord,
  KanbanTaskRecord,
  ListKanbanFilter,
  NudgeInput,
  NudgeRecord,
  RuntimeJobKind,
  RuntimeJobRecord,
  UpdateKanbanTaskInput,
  UserModelRefreshInput,
  UserModelRefreshRecord,
} from "./types.ts";

export interface RuntimeApiClientOptions {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
}

function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const entries: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    entries.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return entries.length ? `?${entries.join("&")}` : "";
}

export class RuntimeApiClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: RuntimeApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.token}`,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`runtime api ${method} ${path} -> ${response.status}: ${text}`);
    }
    return (await response.json()) as T;
  }

  health(): Promise<{ ok: boolean; service: string }> {
    return this.call("GET", clawApiPath("health"));
  }

  status(): Promise<{
    skillsOutputDir: string;
    recent: {
      jobs: RuntimeJobRecord[];
      distillations: DistillationRecord[];
      nudges: NudgeRecord[];
      userModelRefreshes: UserModelRefreshRecord[];
    };
  }> {
    return this.call("GET", clawApiPath("runtime/status"));
  }

  customAppSDKContracts(): Promise<unknown> {
    return this.call("GET", clawApiPath("contracts/custom-app-sdk"));
  }

  distill(input: DistillInput): Promise<DistillationRecord> {
    return this.call("POST", clawApiPath("runtime/distill"), input);
  }

  nudge(input: NudgeInput): Promise<{ items: NudgeRecord[] }> {
    return this.call("POST", clawApiPath("runtime/nudge"), input);
  }

  refreshUserModel(input: UserModelRefreshInput = {}): Promise<UserModelRefreshRecord> {
    return this.call("POST", clawApiPath("runtime/refresh-user-model"), input);
  }

  listDistillations(session?: string, limit?: number): Promise<{ items: DistillationRecord[] }> {
    return this.call("GET", clawApiPath(`runtime/distillations${buildQuery({ session, limit })}`));
  }

  listNudges(session?: string, limit?: number): Promise<{ items: NudgeRecord[] }> {
    return this.call("GET", clawApiPath(`runtime/nudges${buildQuery({ session, limit })}`));
  }

  listUserModelRefreshes(limit?: number): Promise<{ items: UserModelRefreshRecord[] }> {
    return this.call("GET", clawApiPath(`runtime/user-model-refreshes${buildQuery({ limit })}`));
  }

  listJobs(kind?: RuntimeJobKind, limit?: number): Promise<{ items: RuntimeJobRecord[] }> {
    return this.call("GET", clawApiPath(`runtime/jobs${buildQuery({ kind, limit })}`));
  }

  createKanbanTask(input: CreateKanbanTaskInput): Promise<KanbanTaskRecord> {
    return this.call("POST", clawApiPath("kanban/tasks"), input);
  }

  listKanbanTasks(filter: ListKanbanFilter = {}): Promise<{ items: KanbanTaskRecord[] }> {
    return this.call("GET", clawApiPath(`kanban/tasks${buildQuery({
      status: filter.status,
      agent: filter.agentAssigned,
      claimedBy: filter.claimedBy,
      projectPath: filter.projectPath,
      limit: filter.limit,
      offset: filter.offset,
    })}`));
  }

  getKanbanTask(id: string): Promise<KanbanTaskRecord> {
    return this.call("GET", clawApiPath(`kanban/tasks/${encodeURIComponent(id)}`));
  }

  updateKanbanTask(id: string, patch: UpdateKanbanTaskInput): Promise<KanbanTaskRecord> {
    return this.call("PATCH", clawApiPath(`kanban/tasks/${encodeURIComponent(id)}`), patch);
  }

  deleteKanbanTask(id: string): Promise<{ deleted: boolean }> {
    return this.call("DELETE", clawApiPath(`kanban/tasks/${encodeURIComponent(id)}`));
  }

  claimKanbanTask(id: string, agent: string, ttlMs?: number): Promise<ClaimResult> {
    return this.call("POST", clawApiPath(`kanban/tasks/${encodeURIComponent(id)}/claim`), { agent, ttlMs });
  }

  completeKanbanTask(id: string, actor?: string): Promise<KanbanTaskRecord> {
    return this.call("POST", clawApiPath(`kanban/tasks/${encodeURIComponent(id)}/complete`), { actor });
  }

  failKanbanTask(id: string, reason: string, actor?: string): Promise<KanbanTaskRecord> {
    return this.call("POST", clawApiPath(`kanban/tasks/${encodeURIComponent(id)}/fail`), { reason, actor });
  }

  blockKanbanTask(id: string, reason: string, actor?: string): Promise<KanbanTaskRecord> {
    return this.call("POST", clawApiPath(`kanban/tasks/${encodeURIComponent(id)}/block`), { reason, actor });
  }

  unblockKanbanTask(id: string, actor?: string): Promise<KanbanTaskRecord> {
    return this.call("POST", clawApiPath(`kanban/tasks/${encodeURIComponent(id)}/unblock`), { actor });
  }

  addKanbanComment(taskId: string, author: string, body: string): Promise<KanbanCommentRecord> {
    return this.call("POST", clawApiPath(`kanban/tasks/${encodeURIComponent(taskId)}/comments`), { author, body });
  }

  listKanbanComments(taskId: string): Promise<{ items: KanbanCommentRecord[] }> {
    return this.call("GET", clawApiPath(`kanban/tasks/${encodeURIComponent(taskId)}/comments`));
  }

  listKanbanEvents(taskId: string): Promise<{ items: KanbanEventRecord[] }> {
    return this.call("GET", clawApiPath(`kanban/tasks/${encodeURIComponent(taskId)}/events`));
  }

  getKanbanBoard(): Promise<KanbanBoard> {
    return this.call("GET", clawApiPath("kanban/board"));
  }

  runKanbanDispatcher(options: { claimTtlMs?: number; autoBlockThreshold?: number } = {}): Promise<DispatcherTickResult> {
    return this.call("POST", clawApiPath("kanban/dispatcher/tick"), options);
  }
}
