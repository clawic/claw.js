import type {
  DistillInput,
  DistillationRecord,
  NudgeInput,
  NudgeRecord,
  RuntimeJobKind,
  RuntimeJobRecord,
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
    return this.call("GET", "/v1/health");
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
    return this.call("GET", "/v1/runtime/status");
  }

  distill(input: DistillInput): Promise<DistillationRecord> {
    return this.call("POST", "/v1/runtime/distill", input);
  }

  nudge(input: NudgeInput): Promise<{ items: NudgeRecord[] }> {
    return this.call("POST", "/v1/runtime/nudge", input);
  }

  refreshUserModel(input: UserModelRefreshInput = {}): Promise<UserModelRefreshRecord> {
    return this.call("POST", "/v1/runtime/refresh-user-model", input);
  }

  listDistillations(session?: string, limit?: number): Promise<{ items: DistillationRecord[] }> {
    return this.call("GET", `/v1/runtime/distillations${buildQuery({ session, limit })}`);
  }

  listNudges(session?: string, limit?: number): Promise<{ items: NudgeRecord[] }> {
    return this.call("GET", `/v1/runtime/nudges${buildQuery({ session, limit })}`);
  }

  listUserModelRefreshes(limit?: number): Promise<{ items: UserModelRefreshRecord[] }> {
    return this.call("GET", `/v1/runtime/user-model-refreshes${buildQuery({ limit })}`);
  }

  listJobs(kind?: RuntimeJobKind, limit?: number): Promise<{ items: RuntimeJobRecord[] }> {
    return this.call("GET", `/v1/runtime/jobs${buildQuery({ kind, limit })}`);
  }
}
