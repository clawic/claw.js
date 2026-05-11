import type {
  CommitSnapshotInput,
  ForgetInput,
  ForgetResult,
  UpdateItemInput,
  UpsertItemInput,
  UserModelSection,
  UserProfileBySection,
  UserProfileHistoryRecord,
  UserProfileItem,
  UserProfileSnapshot,
} from "./types.ts";

export interface UserModelApiClientOptions {
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

export class UserModelApiClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: UserModelApiClientOptions) {
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
      throw new Error(`user-model api ${method} ${path} -> ${response.status}: ${text}`);
    }
    return (await response.json()) as T;
  }

  health(): Promise<{ ok: boolean; service: string }> {
    return this.call("GET", "/v1/health");
  }

  snapshot(): Promise<UserProfileSnapshot> {
    return this.call("GET", "/v1/user-model");
  }

  bySection(): Promise<UserProfileBySection> {
    return this.call("GET", `/v1/user-model${buildQuery({ bySection: true })}`);
  }

  counts(): Promise<{ counts: Record<UserModelSection, number> }> {
    return this.call("GET", "/v1/user-model/counts");
  }

  upsertItem(input: UpsertItemInput): Promise<UserProfileItem> {
    return this.call("POST", "/v1/user-model/items", input);
  }

  updateItem(id: string, patch: UpdateItemInput): Promise<UserProfileItem> {
    return this.call("PATCH", `/v1/user-model/items/${encodeURIComponent(id)}`, patch);
  }

  deleteItem(id: string): Promise<{ deleted: boolean }> {
    return this.call("DELETE", `/v1/user-model/items/${encodeURIComponent(id)}`);
  }

  forget(input: ForgetInput): Promise<ForgetResult> {
    return this.call("POST", "/v1/user-model/forget", input);
  }

  refresh(reason?: string): Promise<{ ok: boolean; message: string; snapshot: UserProfileHistoryRecord }> {
    return this.call("POST", "/v1/user-model/refresh", reason ? { reason } : {});
  }

  commitSnapshot(input: CommitSnapshotInput = {}): Promise<UserProfileHistoryRecord> {
    return this.call("POST", "/v1/user-model/snapshot", input);
  }

  history(limit?: number): Promise<{ items: UserProfileHistoryRecord[] }> {
    return this.call("GET", `/v1/user-model/history${buildQuery({ limit })}`);
  }
}
