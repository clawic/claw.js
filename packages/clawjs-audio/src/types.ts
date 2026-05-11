export type AudioKind = "user_message" | "dictation" | "agent_tts";

export type AudioOriginActor = "user" | "agent";

export type AudioTranscriptRole = "transcription" | "synthesis_source";

export interface AudioAsset {
  id: string;
  kind: AudioKind;
  appId: string;
  originActor: AudioOriginActor;
  mimeType: string;
  bytesRelPath: string;
  durationMs: number;
  createdAt: number;
  deviceId: string | null;
  sessionId: string | null;
  threadId: string | null;
  linkedMessageId: string | null;
  metadata: Record<string, unknown> | null;
}

export interface AudioTranscript {
  id: string;
  audioId: string;
  role: AudioTranscriptRole;
  text: string;
  provider: string | null;
  language: string | null;
  createdAt: number;
  isPrimary: boolean;
}

export interface AudioAssetWithTranscripts {
  asset: AudioAsset;
  transcripts: AudioTranscript[];
}

export interface RegisterAudioInput {
  id?: string;
  kind: AudioKind;
  appId: string;
  originActor: AudioOriginActor;
  mimeType: string;
  bytesBase64: string;
  durationMs: number;
  deviceId?: string | null;
  sessionId?: string | null;
  threadId?: string | null;
  linkedMessageId?: string | null;
  metadata?: Record<string, unknown> | null;
  transcript?: {
    text: string;
    role?: AudioTranscriptRole;
    provider?: string | null;
    language?: string | null;
  };
}

export interface AttachTranscriptInput {
  text: string;
  role: AudioTranscriptRole;
  provider?: string | null;
  language?: string | null;
  markAsPrimary?: boolean;
}

export interface ListAudioFilter {
  appId: string;
  kind?: AudioKind;
  originActor?: AudioOriginActor;
  deviceId?: string;
  sessionId?: string;
  threadId?: string;
  linkedMessageId?: string;
  fromCreatedAt?: number;
  toCreatedAt?: number;
  limit?: number;
  offset?: number;
}

export interface ListGlobalAudioFilter {
  appId?: string;
  kind?: AudioKind;
  originActor?: AudioOriginActor;
  deviceId?: string;
  sessionId?: string;
  threadId?: string;
  linkedMessageId?: string;
  fromCreatedAt?: number;
  toCreatedAt?: number;
  limit?: number;
  offset?: number;
}

export interface ListAudioResult {
  items: AudioAssetWithTranscripts[];
  total: number;
}

export interface AudioBytes {
  base64: string;
  mimeType: string;
  durationMs: number;
}
