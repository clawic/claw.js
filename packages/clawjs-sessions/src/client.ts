import type {
  AppendMessageInput,
  CreateSessionInput,
  ListSessionsFilter,
  ListSessionsResult,
  SearchSessionsInput,
  SessionMessageRecord,
  SessionRecord,
  SessionSearchHit,
  SessionWithMessages,
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
    return this.call("GET", "/v1/health");
  }

  createSession(input: CreateSessionInput): Promise<SessionRecord> {
    return this.call("POST", "/v1/sessions", input);
  }

  getSession(id: string): Promise<SessionRecord> {
    return this.call("GET", `/v1/sessions/${encodeURIComponent(id)}`);
  }

  getSessionWithMessages(id: string, limit?: number): Promise<SessionWithMessages> {
    return this.call("GET", `/v1/sessions/${encodeURIComponent(id)}${buildQuery({ includeMessages: true, limit })}`);
  }

  list(filter: ListSessionsFilter = {}): Promise<ListSessionsResult> {
    return this.call("GET", `/v1/sessions${buildQuery({
      agent: filter.agent,
      runtime: filter.runtime,
      machine: filter.machine,
      workspaceId: filter.workspaceId,
      projectPath: filter.projectPath,
      pinned: filter.pinned,
      archived: filter.archived,
      sidebarVisible: filter.sidebarVisible,
      status: filter.status,
      fromCreatedAt: filter.fromCreatedAt,
      toCreatedAt: filter.toCreatedAt,
      limit: filter.limit,
      offset: filter.offset,
    })}`);
  }

  search(input: SearchSessionsInput): Promise<{ items: SessionSearchHit[] }> {
    return this.call("GET", `/v1/sessions/search${buildQuery({
      q: input.query,
      agent: input.agent,
      projectPath: input.projectPath,
      limit: input.limit,
    })}`);
  }

  update(id: string, patch: {
    title?: string;
    pinned?: boolean;
    archived?: boolean;
    sidebarVisible?: boolean;
    projectPath?: string | null;
    status?: string;
  }): Promise<SessionRecord> {
    return this.call("PATCH", `/v1/sessions/${encodeURIComponent(id)}`, patch);
  }

  delete(id: string): Promise<{ deleted: boolean }> {
    return this.call("DELETE", `/v1/sessions/${encodeURIComponent(id)}`);
  }

  appendMessage(sessionId: string, input: Omit<AppendMessageInput, "sessionId">): Promise<SessionMessageRecord> {
    return this.call("POST", `/v1/sessions/${encodeURIComponent(sessionId)}/messages`, input);
  }

  listMessages(sessionId: string, opts: { limit?: number; offset?: number } = {}): Promise<{ items: SessionMessageRecord[] }> {
    return this.call("GET", `/v1/sessions/${encodeURIComponent(sessionId)}/messages${buildQuery(opts)}`);
  }

  importCodex(input: { dir?: string; forceReimport?: boolean; machine?: string } = {}): Promise<ImportCodexResult> {
    return this.call("POST", "/v1/sessions/import/codex", input);
  }
}
