import { clawApiPath } from "@clawjs/core";
import type {
  ListRunsFilter,
  RunRecord,
  RunRequest,
  RunResult,
} from "./types.ts";

export interface SandboxApiClientOptions {
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

export class SandboxApiClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: SandboxApiClientOptions) {
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
      throw new Error(`sandbox api ${method} ${path} -> ${response.status}: ${text}`);
    }
    return (await response.json()) as T;
  }

  health(): Promise<{ ok: boolean; service: string; enabledBackends: string[] }> {
    return this.call("GET", clawApiPath("health"));
  }

  run(request: RunRequest): Promise<RunResult> {
    return this.call("POST", clawApiPath("sandbox/run"), request);
  }

  listRuns(filter: ListRunsFilter = {}): Promise<{ items: RunRecord[] }> {
    return this.call("GET", clawApiPath(`sandbox/runs${buildQuery({
      backend: filter.backend,
      status: filter.status,
      host: filter.host,
      limit: filter.limit,
      offset: filter.offset,
    })}`));
  }

  getRun(id: string): Promise<RunRecord> {
    return this.call("GET", clawApiPath(`sandbox/runs/${encodeURIComponent(id)}`));
  }
}
