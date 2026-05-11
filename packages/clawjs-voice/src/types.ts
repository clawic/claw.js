export type TTSProviderId = "system-tts" | "elevenlabs" | "openai-tts" | "azure-speech";
export type STTProviderId = "whisper-local" | "whisper-cloud" | "deepgram" | "openai-stt" | "azure-stt";

export interface TTSRequest {
  text: string;
  provider?: TTSProviderId;
  voice?: string | null;
  language?: string | null;
  speed?: number | null;
  outputPath?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface TTSResult {
  id: string;
  provider: TTSProviderId;
  text: string;
  outputPath: string | null;
  mimeType: string;
  durationMs: number | null;
  bytesWritten: number | null;
  createdAt: number;
  ok: boolean;
  error: string | null;
}

export interface STTRequest {
  audioPath?: string | null;
  audioBase64?: string | null;
  provider?: STTProviderId;
  language?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface STTResult {
  id: string;
  provider: STTProviderId;
  text: string;
  language: string | null;
  durationMs: number;
  createdAt: number;
  ok: boolean;
  error: string | null;
}

export interface TTSProviderAdapter {
  id: TTSProviderId;
  available: boolean;
  description: string;
  synth(request: TTSRequest, defaults: { dataDir: string }): Promise<Omit<TTSResult, "id" | "createdAt">>;
}

export interface STTProviderAdapter {
  id: STTProviderId;
  available: boolean;
  description: string;
  transcribe(request: STTRequest): Promise<Omit<STTResult, "id" | "createdAt">>;
}

export interface ListVoiceRunsFilter {
  kind?: "tts" | "stt";
  provider?: string;
  limit?: number;
  offset?: number;
}
