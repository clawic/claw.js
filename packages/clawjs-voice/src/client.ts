import type { STTRequest, STTResult, TTSRequest, TTSResult } from "./types.ts";

export interface VoiceApiClientOptions { baseUrl: string; token: string; fetchImpl?: typeof fetch; }

function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const entries: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    entries.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return entries.length ? `?${entries.join("&")}` : "";
}

export class VoiceApiClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: VoiceApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { authorization: `Bearer ${this.token}` };
    if (body !== undefined) headers["content-type"] = "application/json";
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    if (!response.ok) { const text = await response.text(); throw new Error(`voice api ${method} ${path} -> ${response.status}: ${text}`); }
    return (await response.json()) as T;
  }

  health(): Promise<unknown> { return this.call("GET", "/v1/health"); }
  providers(): Promise<{ tts: Array<{ id: string; available: boolean; description: string }>; stt: Array<{ id: string; available: boolean; description: string }> }> { return this.call("GET", "/v1/voice/providers"); }
  say(request: TTSRequest): Promise<TTSResult> { return this.call("POST", "/v1/voice/say", request); }
  transcribe(request: STTRequest): Promise<STTResult> { return this.call("POST", "/v1/voice/transcribe", request); }
  runs(filter: { kind?: "tts" | "stt"; provider?: string; limit?: number; offset?: number } = {}): Promise<{ items: Array<TTSResult | STTResult> }> {
    return this.call("GET", `/v1/voice/runs${buildQuery(filter)}`);
  }
}
