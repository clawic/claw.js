import type {
  AttachTranscriptInput,
  AudioAssetWithTranscripts,
  AudioBytes,
  AudioTranscript,
  ListAudioFilter,
  ListAudioResult,
  ListGlobalAudioFilter,
  RegisterAudioInput,
} from "./types.ts";

export interface AudioApiClientOptions {
  baseUrl: string;
  token: string;
}

function buildQuery(filter: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export class AudioApiClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(options: AudioApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token;
  }

  private async request<T>(input: { method: string; path: string; body?: unknown }): Promise<T> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.token}`,
    };
    if (input.body !== undefined) headers["content-type"] = "application/json";
    const response = await fetch(`${this.baseUrl}${input.path}`, {
      method: input.method,
      headers,
      body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Audio API ${input.method} ${input.path} failed: ${response.status} ${text}`);
    }
    return text ? JSON.parse(text) as T : (undefined as T);
  }

  register(input: RegisterAudioInput): Promise<AudioAssetWithTranscripts> {
    return this.request({ method: "POST", path: "/v1/audio", body: input });
  }

  attachTranscript(audioId: string, input: AttachTranscriptInput): Promise<AudioTranscript> {
    return this.request({ method: "POST", path: `/v1/audio/${encodeURIComponent(audioId)}/transcripts`, body: input });
  }

  get(audioId: string, appId: string): Promise<AudioAssetWithTranscripts> {
    return this.request({ method: "GET", path: `/v1/audio/${encodeURIComponent(audioId)}${buildQuery({ appId })}` });
  }

  getBytes(audioId: string, appId: string): Promise<AudioBytes> {
    return this.request({ method: "GET", path: `/v1/audio/${encodeURIComponent(audioId)}/bytes${buildQuery({ appId })}` });
  }

  list(filter: ListAudioFilter): Promise<ListAudioResult> {
    return this.request({ method: "GET", path: `/v1/audio${buildQuery(filter as unknown as Record<string, unknown>)}` });
  }

  listGlobal(filter: ListGlobalAudioFilter): Promise<ListAudioResult> {
    return this.request({ method: "GET", path: `/v1/audio-global${buildQuery(filter as unknown as Record<string, unknown>)}` });
  }

  delete(audioId: string, appId: string): Promise<{ deleted: boolean }> {
    return this.request({ method: "DELETE", path: `/v1/audio/${encodeURIComponent(audioId)}${buildQuery({ appId })}` });
  }
}
