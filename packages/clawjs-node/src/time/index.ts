import type {
  TemporalAction,
  TemporalExecution,
  TemporalHeartbeatPolicy,
  TemporalItem,
  TemporalNaturalInput,
  TemporalParticipant,
  TemporalProjection,
  TemporalRunLogEntry,
} from "@clawjs/core";
import { clawTimeApiRoutes } from "@clawjs/core";

import { EmbeddedTimeEngine, type EmbeddedTimeEngineOptions } from "./embedded.ts";

export interface TimeClientOptions {
  baseUrl: string;
  token?: string;
}

export interface TimeServiceLike {
  list: TimeClient["list"];
  get: TimeClient["get"];
  create: TimeClient["create"];
  update: TimeClient["update"];
  delete: TimeClient["delete"];
  pause: TimeClient["pause"];
  resume: TimeClient["resume"];
  runNow: TimeClient["runNow"];
  listExecutions: TimeClient["listExecutions"];
  listRunLog: TimeClient["listRunLog"];
  calendarView: TimeClient["calendarView"];
  timelineView: TimeClient["timelineView"];
  signalAnchor: TimeClient["signalAnchor"];
}

export interface CreateTemporalItemInput {
  id?: string;
  kind: TemporalItem["kind"];
  title: string;
  description?: string;
  location?: string;
  startsAt?: string;
  endsAt?: string;
  dueAt?: string;
  timezone?: string;
  schedule?: Partial<TemporalItem["schedule"]>;
  participants?: Array<Partial<TemporalParticipant>>;
  actions?: Array<Partial<TemporalAction>>;
  projections?: Array<Partial<TemporalProjection>>;
  heartbeat?: Partial<TemporalHeartbeatPolicy>;
  ownerId?: string;
  workspaceId?: string;
  projectId?: string;
  agentId?: string;
  sourceProvider?: string;
  anchorType?: TemporalItem["anchorType"];
  anchorId?: string;
  natural?: TemporalNaturalInput;
}

export interface UpdateTemporalItemInput extends Partial<Omit<CreateTemporalItemInput, "id" | "kind">> {
  status?: TemporalItem["status"];
}

function appendQuery(path: string, query?: Record<string, string | number | boolean | undefined>): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const suffix = params.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export class TimeClient {
  private readonly baseUrl: string;
  private readonly token?: string;

  constructor(options: TimeClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (this.token) headers.set("authorization", `Bearer ${this.token}`);
    if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
    const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    const payload = await response.json().catch(() => null) as T & { error?: string } | null;
    if (!response.ok) {
      throw new Error(payload && typeof payload === "object" && "error" in payload ? String(payload.error) : `time request failed: ${response.status}`);
    }
    return payload as T;
  }

  async list(filters?: {
    kind?: TemporalItem["kind"];
    status?: TemporalItem["status"];
    workspaceId?: string;
    projectId?: string;
    agentId?: string;
    ownerId?: string;
    sourceProvider?: string;
  }) {
    return await this.request<{ items: TemporalItem[] }>(appendQuery(clawTimeApiRoutes.items, filters));
  }

  async get(id: string) {
    return await this.request<{ item: TemporalItem }>(clawTimeApiRoutes.item(id));
  }

  async create(input: CreateTemporalItemInput) {
    return await this.request<{ item: TemporalItem }>(clawTimeApiRoutes.items, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async update(id: string, input: UpdateTemporalItemInput) {
    return await this.request<{ item: TemporalItem }>(clawTimeApiRoutes.item(id), {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }

  async delete(id: string) {
    return await this.request<{ ok: boolean }>(clawTimeApiRoutes.item(id), {
      method: "DELETE",
    });
  }

  async pause(id: string) {
    return await this.request<{ item: TemporalItem }>(clawTimeApiRoutes.itemPause(id), {
      method: "POST",
    });
  }

  async resume(id: string) {
    return await this.request<{ item: TemporalItem }>(clawTimeApiRoutes.itemResume(id), {
      method: "POST",
    });
  }

  async runNow(id: string) {
    return await this.request<{ item: TemporalItem; execution: TemporalExecution }>(clawTimeApiRoutes.itemRun(id), {
      method: "POST",
    });
  }

  async listExecutions(itemId?: string) {
    return await this.request<{ executions: TemporalExecution[] }>(appendQuery(clawTimeApiRoutes.executions, { itemId }));
  }

  async listRunLog(itemId?: string, limit?: number) {
    return await this.request<{ entries: TemporalRunLogEntry[] }>(appendQuery(clawTimeApiRoutes.runLog, { itemId, limit }));
  }

  async calendarView(input?: { start?: string; end?: string }) {
    return await this.request<{ items: TemporalItem[]; entries: Array<Record<string, unknown>> }>(appendQuery(clawTimeApiRoutes.calendarView, input));
  }

  async timelineView(input?: { start?: string; end?: string }) {
    return await this.request<{ items: TemporalItem[] }>(appendQuery(clawTimeApiRoutes.timelineView, input));
  }

  async signalAnchor(input: { anchorId: string; signal: "reply_received" | "task_completed" | "event_started" | "execution_succeeded" }) {
    return await this.request<{ items: TemporalItem[] }>(clawTimeApiRoutes.signals, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

}

export { EmbeddedTimeEngine };
export type { EmbeddedTimeEngineOptions, TemporalHeartbeatAgentRunner, TemporalHeartbeatCheckProvider } from "./embedded.ts";
