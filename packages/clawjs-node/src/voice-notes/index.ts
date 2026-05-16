import crypto from "crypto";
import fs from "fs";
import path from "path";

import type { WorkspaceStorage } from "../data/store.ts";
import type { LocalStorageStore, StorageObject } from "../storage/store.ts";
import type { SttProviderConfig, SttTranscribeResult } from "../stt/index.ts";

export type VoiceNoteStatus = "stored" | "transcribing" | "transcribed" | "failed";

export interface VoiceNoteSource {
  origin: string;
  provider?: string;
  accountId?: string;
  targetId?: string;
  threadId?: string | number;
  providerMessageId?: string;
  senderId?: string;
  senderLabel?: string;
  receivedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface VoiceNoteRecord {
  id: string;
  source: VoiceNoteSource;
  status: VoiceNoteStatus;
  audio: {
    bucket: string;
    key: string;
    storageUrl: string;
    mimeType: string;
    sizeBytes: number;
    sha256: string;
    durationSeconds?: number;
    fileName?: string;
  };
  transcript?: {
    text: string;
    language?: string;
    provider: string;
    model?: string;
    transcribedAt: string;
  };
  error?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateVoiceNoteInput {
  data: Uint8Array;
  mimeType?: string;
  fileName?: string;
  durationSeconds?: number;
  source: VoiceNoteSource;
  tags?: string[];
}

export interface RegisterVoiceNotePathInput extends Omit<CreateVoiceNoteInput, "data"> {
  filePath: string;
}

export interface VoiceNoteListInput {
  origin?: string;
  provider?: string;
  accountId?: string;
  targetId?: string;
  threadId?: string | number;
  status?: VoiceNoteStatus;
  query?: string;
  limit?: number;
}

export interface VoiceNoteStore {
  create(input: CreateVoiceNoteInput): VoiceNoteRecord;
  registerPath(input: RegisterVoiceNotePathInput): VoiceNoteRecord;
  list(input?: VoiceNoteListInput): VoiceNoteRecord[];
  get(id: string): VoiceNoteRecord | null;
  download(id: string): { note: VoiceNoteRecord; filePath: string; buffer: Buffer } | null;
  transcribe(id: string, input?: SttProviderConfig): Promise<VoiceNoteRecord>;
  markTranscribed(id: string, result: SttTranscribeResult): VoiceNoteRecord;
  markFailed(id: string, error: unknown): VoiceNoteRecord;
}

function nowIso(): string {
  return new Date().toISOString();
}

function sha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function safeId(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 120) || crypto.randomUUID();
}

function extensionFromMime(mimeType: string, fileName?: string): string {
  const fromName = fileName ? path.extname(fileName).toLowerCase() : "";
  if (fromName) return fromName;
  switch (mimeType.toLowerCase()) {
    case "audio/ogg":
    case "audio/oga":
      return ".ogg";
    case "audio/mpeg":
      return ".mp3";
    case "audio/mp4":
    case "audio/x-m4a":
      return ".m4a";
    case "audio/wav":
    case "audio/wave":
      return ".wav";
    case "audio/webm":
      return ".webm";
    default:
      return ".bin";
  }
}

function storageUrl(object: StorageObject): string {
  return `storage://${object.bucket}/${object.key}`;
}

export function createVoiceNoteStore(options: {
  dataStore: WorkspaceStorage;
  storage: LocalStorageStore;
  transcribe: (input: SttProviderConfig & { filePath: string }) => Promise<SttTranscribeResult>;
}): VoiceNoteStore {
  const collection = options.dataStore.collection<VoiceNoteRecord>("voice-notes");

  function put(record: VoiceNoteRecord): VoiceNoteRecord {
    return collection.put(record.id, record);
  }

  function create(input: CreateVoiceNoteInput): VoiceNoteRecord {
    const buffer = Buffer.from(input.data);
    const digest = sha256(buffer);
    const timestamp = nowIso();
    const sourceId = [
      input.source.origin,
      input.source.provider,
      input.source.accountId,
      input.source.targetId,
      input.source.threadId,
      input.source.providerMessageId,
      digest.slice(0, 16),
    ].filter((part) => part !== undefined && part !== null && String(part).trim()).map(String).join("-");
    const id = safeId(sourceId);
    const mimeType = input.mimeType?.trim() || "application/octet-stream";
    const object = options.storage.put({
      key: `voice-notes/${id}${extensionFromMime(mimeType, input.fileName)}`,
      data: buffer,
      contentType: mimeType,
      metadata: {
        voiceNoteId: id,
        origin: input.source.origin,
        provider: input.source.provider,
        accountId: input.source.accountId,
        targetId: input.source.targetId,
        threadId: input.source.threadId,
        providerMessageId: input.source.providerMessageId,
      },
    });
    const existing = collection.get(id);
    const record: VoiceNoteRecord = {
      id,
      source: input.source,
      status: existing?.status === "transcribed" ? "transcribed" : "stored",
      audio: {
        bucket: object.bucket,
        key: object.key,
        storageUrl: storageUrl(object),
        mimeType: object.contentType,
        sizeBytes: object.sizeBytes,
        sha256: object.sha256,
        durationSeconds: input.durationSeconds,
        fileName: input.fileName,
      },
      transcript: existing?.transcript,
      tags: input.tags,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    return put(record);
  }

  function registerPath(input: RegisterVoiceNotePathInput): VoiceNoteRecord {
    return create({
      ...input,
      data: fs.readFileSync(input.filePath),
      fileName: input.fileName ?? path.basename(input.filePath),
    });
  }

  function get(id: string): VoiceNoteRecord | null {
    return collection.get(id);
  }

  function list(input: VoiceNoteListInput = {}): VoiceNoteRecord[] {
    const limit = Math.max(1, Math.min(input.limit ?? 100, 1000));
    const query = input.query?.trim().toLowerCase();
    return collection.list()
      .filter((note) => {
        if (input.origin && note.source.origin !== input.origin) return false;
        if (input.provider && note.source.provider !== input.provider) return false;
        if (input.accountId && note.source.accountId !== input.accountId) return false;
        if (input.targetId && note.source.targetId !== input.targetId) return false;
        if (input.threadId !== undefined && String(note.source.threadId ?? "") !== String(input.threadId)) return false;
        if (input.status && note.status !== input.status) return false;
        if (query) {
          const haystack = [
            note.id,
            note.source.senderLabel,
            note.source.targetId,
            note.transcript?.text,
            ...(note.tags ?? []),
          ].filter(Boolean).join(" ").toLowerCase();
          if (!haystack.includes(query)) return false;
        }
        return true;
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit);
  }

  function download(id: string): { note: VoiceNoteRecord; filePath: string; buffer: Buffer } | null {
    const note = get(id);
    if (!note) return null;
    const object = options.storage.get({ bucket: note.audio.bucket, key: note.audio.key });
    if (!object) return null;
    return { note, filePath: object.filePath, buffer: object.buffer };
  }

  function markTranscribed(id: string, result: SttTranscribeResult): VoiceNoteRecord {
    const note = get(id);
    if (!note) throw new Error(`voice note not found: ${id}`);
    return put({
      ...note,
      status: "transcribed",
      transcript: {
        text: result.text,
        language: result.language,
        provider: result.provider,
        model: result.model,
        transcribedAt: nowIso(),
      },
      error: undefined,
      updatedAt: nowIso(),
    });
  }

  function markFailed(id: string, error: unknown): VoiceNoteRecord {
    const note = get(id);
    if (!note) throw new Error(`voice note not found: ${id}`);
    return put({
      ...note,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      updatedAt: nowIso(),
    });
  }

  async function transcribe(id: string, input: SttProviderConfig = {}): Promise<VoiceNoteRecord> {
    const downloaded = download(id);
    if (!downloaded) throw new Error(`voice note not found: ${id}`);
    put({ ...downloaded.note, status: "transcribing", error: undefined, updatedAt: nowIso() });
    try {
      const result = await options.transcribe({
        ...input,
        filePath: downloaded.filePath,
      });
      return markTranscribed(id, result);
    } catch (error) {
      return markFailed(id, error);
    }
  }

  return { create, registerPath, list, get, download, transcribe, markTranscribed, markFailed };
}
