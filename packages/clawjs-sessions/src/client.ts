import { clawApiPath } from "@clawjs/core";
import type {
  AppendMessageInput,
  CreateProjectInput,
  CreateSessionInput,
  ListProjectsFilter,
  ListProjectsResult,
  ListSessionsFilter,
  ListSessionsResult,
  ProjectRecord,
  SearchSessionsInput,
  SessionEvent,
  SessionMessageRecord,
  SessionRecord,
  SessionSearchHit,
  SessionWithMessages,
  StartTurnInput,
  UpdateProjectInput,
} from "./types.ts";

export interface SessionsApiClientOptions {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
}

interface ImportCodexResult {
  scanned: number;
  imported: Array<{
    filePath: string;
    sessionId: string | null;
    messagesImported: number;
    skipped: boolean;
    reason?: string;
  }>;
}

function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const entries: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    entries.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return entries.length ? `?${entries.join("&")}` : "";
}

export class SessionsApiClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: SessionsApiClientOptions) {
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
      throw new Error(`sessions api ${method} ${path} -> ${response.status}: ${text}`);
    }
    return (await response.json()) as T;
  }

  health(): Promise<{ ok: boolean; service: string }> {
    return this.call("GET", clawApiPath("health"));
  }

  createProject(input: CreateProjectInput): Promise<ProjectRecord> {
    return this.call("POST", clawApiPath("projects"), input);
  }

  getProject(id: string): Promise<ProjectRecord> {
    return this.call("GET", clawApiPath(`projects/${encodeURIComponent(id)}`));
  }

  listProjects(filter: ListProjectsFilter = {}): Promise<ListProjectsResult> {
    return this.call("GET", clawApiPath(`projects${buildQuery({
      hidden: filter.hidden,
      archived: filter.archived,
      limit: filter.limit,
      offset: filter.offset,
    })}`));
  }

  updateProject(id: string, patch: UpdateProjectInput): Promise<ProjectRecord> {
    return this.call("PATCH", clawApiPath(`projects/${encodeURIComponent(id)}`), patch);
  }

  deleteProject(id: string): Promise<{ deleted: boolean }> {
    return this.call("DELETE", clawApiPath(`projects/${encodeURIComponent(id)}`));
  }

  createSession(input: CreateSessionInput): Promise<SessionRecord> {
    return this.call("POST", clawApiPath("sessions"), input);
  }

  getSession(id: string): Promise<SessionRecord> {
    return this.call("GET", clawApiPath(`sessions/${encodeURIComponent(id)}`));
  }

  getSessionWithMessages(id: string, limit?: number): Promise<SessionWithMessages> {
    return this.call("GET", clawApiPath(`sessions/${encodeURIComponent(id)}${buildQuery({ includeMessages: true, limit })}`));
  }

  list(filter: ListSessionsFilter = {}): Promise<ListSessionsResult> {
    return this.call("GET", clawApiPath(`sessions${buildQuery({
      agent: filter.agent,
      runtime: filter.runtime,
      machine: filter.machine,
      workspaceId: filter.workspaceId,
      projectId: filter.projectId,
      projectPath: filter.projectPath,
      pinned: filter.pinned,
      archived: filter.archived,
      sidebarVisible: filter.sidebarVisible,
      status: filter.status,
      fromCreatedAt: filter.fromCreatedAt,
      toCreatedAt: filter.toCreatedAt,
      limit: filter.limit,
      offset: filter.offset,
    })}`));
  }

  search(input: SearchSessionsInput): Promise<{ items: SessionSearchHit[] }> {
    return this.call("GET", clawApiPath(`sessions/search${buildQuery({
      q: input.query,
      agent: input.agent,
      projectId: input.projectId,
      projectPath: input.projectPath,
      limit: input.limit,
    })}`));
  }

  update(id: string, patch: {
    title?: string;
    pinned?: boolean;
    archived?: boolean;
    sidebarVisible?: boolean;
    projectId?: string | null;
    projectPath?: string | null;
    status?: string;
  }): Promise<SessionRecord> {
    return this.call("PATCH", clawApiPath(`sessions/${encodeURIComponent(id)}`), patch);
  }

  delete(id: string): Promise<{ deleted: boolean }> {
    return this.call("DELETE", clawApiPath(`sessions/${encodeURIComponent(id)}`));
  }

  appendMessage(sessionId: string, input: Omit<AppendMessageInput, "sessionId">): Promise<SessionMessageRecord> {
    return this.call("POST", clawApiPath(`sessions/${encodeURIComponent(sessionId)}/messages`), input);
  }

  updateMessage(sessionId: string, messageId: string, patch: Partial<Omit<AppendMessageInput, "id" | "sessionId" | "role" | "timestamp" | "sourceNativeId">>): Promise<SessionMessageRecord> {
    return this.call("PATCH", clawApiPath(`sessions/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}`), patch);
  }

  listMessages(sessionId: string, opts: { limit?: number; offset?: number } = {}): Promise<{ items: SessionMessageRecord[] }> {
    return this.call("GET", clawApiPath(`sessions/${encodeURIComponent(sessionId)}/messages${buildQuery(opts)}`));
  }

  importCodex(input: { dir?: string; forceReimport?: boolean; machine?: string } = {}): Promise<ImportCodexResult> {
    return this.call("POST", clawApiPath("sessions/import/codex"), input);
  }

  startTurn(sessionId: string, input: Omit<StartTurnInput, "sessionId">): Promise<{
    session: SessionRecord | null;
    userMessage: SessionMessageRecord;
    assistantMessage: SessionMessageRecord | null;
  }> {
    return this.call("POST", clawApiPath(`sessions/${encodeURIComponent(sessionId)}/turns`), input);
  }

  interrupt(sessionId: string): Promise<{ interrupted: boolean; session: SessionRecord }> {
    return this.call("POST", clawApiPath(`sessions/${encodeURIComponent(sessionId)}/interrupt`), {});
  }

  async *events(signal?: AbortSignal): AsyncGenerator<SessionEvent> {
    const path = clawApiPath("events");
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "GET",
      headers: { authorization: `Bearer ${this.token}` },
      signal,
    });
    if (!response.ok || !response.body) {
      const text = await response.text();
      throw new Error(`sessions api GET ${path} -> ${response.status}: ${text}`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const dataLine = frame.split("\n").find((line) => line.startsWith("data: "));
        if (dataLine) yield JSON.parse(dataLine.slice(6)) as SessionEvent;
        boundary = buffer.indexOf("\n\n");
      }
    }
  }

  async exportTrajectories(options: { agent?: string; since?: number; includeFailed?: boolean; tag?: string; format?: "json" | "jsonl" } = {}): Promise<unknown> {
    const path = clawApiPath(`sessions/export${buildQuery({
      agent: options.agent,
      since: options.since,
      includeFailed: options.includeFailed,
      tag: options.tag,
      format: options.format,
    })}`);
    const url = `${this.baseUrl}${path}`;
    const response = await this.fetchImpl(url, {
      method: "GET",
      headers: { authorization: `Bearer ${this.token}` },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`sessions api GET ${path} -> ${response.status}: ${text}`);
    }
    if (options.format === "jsonl") {
      return await response.text();
    }
    return await response.json();
  }
}
