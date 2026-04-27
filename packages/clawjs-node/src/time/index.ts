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
  legacyEvents: TimeClient["legacyEvents"];
  legacyRoutines: TimeClient["legacyRoutines"];
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
    return await this.request<{ items: TemporalItem[] }>(appendQuery("/v1/items", filters));
  }

  async get(id: string) {
    return await this.request<{ item: TemporalItem }>(`/v1/items/${encodeURIComponent(id)}`);
  }

  async create(input: CreateTemporalItemInput) {
    return await this.request<{ item: TemporalItem }>("/v1/items", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async update(id: string, input: UpdateTemporalItemInput) {
    return await this.request<{ item: TemporalItem }>(`/v1/items/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }

  async delete(id: string) {
    return await this.request<{ ok: boolean }>(`/v1/items/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  async pause(id: string) {
    return await this.request<{ item: TemporalItem }>(`/v1/items/${encodeURIComponent(id)}/pause`, {
      method: "POST",
    });
  }

  async resume(id: string) {
    return await this.request<{ item: TemporalItem }>(`/v1/items/${encodeURIComponent(id)}/resume`, {
      method: "POST",
    });
  }

  async runNow(id: string) {
    return await this.request<{ item: TemporalItem; execution: TemporalExecution }>(`/v1/items/${encodeURIComponent(id)}/run`, {
      method: "POST",
    });
  }

  async listExecutions(itemId?: string) {
    return await this.request<{ executions: TemporalExecution[] }>(appendQuery("/v1/executions", { itemId }));
  }

  async listRunLog(itemId?: string, limit?: number) {
    return await this.request<{ entries: TemporalRunLogEntry[] }>(appendQuery("/v1/run-log", { itemId, limit }));
  }

  async calendarView(input?: { start?: string; end?: string }) {
    return await this.request<{ items: TemporalItem[]; entries: Array<Record<string, unknown>> }>(appendQuery("/v1/views/calendar", input));
  }

  async timelineView(input?: { start?: string; end?: string }) {
    return await this.request<{ items: TemporalItem[] }>(appendQuery("/v1/views/timeline", input));
  }

  async signalAnchor(input: { anchorId: string; signal: "reply_received" | "task_completed" | "event_started" | "execution_succeeded" }) {
    return await this.request<{ items: TemporalItem[] }>("/v1/signals", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async legacyEvents() {
    return await this.request<{ events: Array<Record<string, unknown>> }>("/v1/legacy/events");
  }

  async legacyRoutines() {
    return await this.request<{ routines: Array<Record<string, unknown>>; executions: Array<Record<string, unknown>> }>("/v1/legacy/routines");
  }
}

export { EmbeddedTimeEngine };
export type { EmbeddedTimeEngineOptions, TemporalHeartbeatAgentRunner, TemporalHeartbeatCheckProvider } from "./embedded.ts";
