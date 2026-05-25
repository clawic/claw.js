import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import Database from "better-sqlite3";

// @clawjs-persistent-surface-ddl-source

import type {
  AttachTranscriptInput,
  AudioAsset,
  AudioAssetWithTranscripts,
  AudioBytes,
  AudioKind,
  AudioOriginActor,
  AudioTranscript,
  AudioTranscriptRole,
  ListAudioFilter,
  ListAudioResult,
  ListGlobalAudioFilter,
  RegisterAudioInput,
} from "./types.ts";

const SCHEMA_DDL = `
  CREATE TABLE IF NOT EXISTS audio_assets (
    id                 TEXT PRIMARY KEY,
    kind               TEXT NOT NULL CHECK (kind IN ('user_message','dictation','agent_tts')),
    app_id             TEXT NOT NULL,
    origin_actor       TEXT NOT NULL CHECK (origin_actor IN ('user','agent')),
    mime_type          TEXT NOT NULL,
    bytes_rel_path     TEXT NOT NULL,
    duration_ms        INTEGER NOT NULL,
    created_at         INTEGER NOT NULL,
    device_id          TEXT,
    session_id         TEXT,
    thread_id          TEXT,
    linked_message_id  TEXT,
    metadata_json      TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_audio_app          ON audio_assets(app_id);
  CREATE INDEX IF NOT EXISTS idx_audio_device       ON audio_assets(app_id, device_id);
  CREATE INDEX IF NOT EXISTS idx_audio_session      ON audio_assets(app_id, session_id);
  CREATE INDEX IF NOT EXISTS idx_audio_thread       ON audio_assets(app_id, thread_id);
  CREATE INDEX IF NOT EXISTS idx_audio_linked_msg   ON audio_assets(app_id, linked_message_id);
  CREATE INDEX IF NOT EXISTS idx_audio_kind         ON audio_assets(app_id, kind, created_at);

  CREATE TABLE IF NOT EXISTS audio_transcripts (
    id          TEXT PRIMARY KEY,
    audio_id    TEXT NOT NULL REFERENCES audio_assets(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('transcription','synthesis_source')),
    text        TEXT NOT NULL,
    provider    TEXT,
    language    TEXT,
    created_at  INTEGER NOT NULL,
    is_primary  INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_transcript_audio   ON audio_transcripts(audio_id);
  CREATE INDEX IF NOT EXISTS idx_transcript_primary ON audio_transcripts(audio_id, is_primary);
`;

interface AssetRow {
  id: string;
  kind: AudioKind;
  app_id: string;
  origin_actor: AudioOriginActor;
  mime_type: string;
  bytes_rel_path: string;
  duration_ms: number;
  created_at: number;
  device_id: string | null;
  session_id: string | null;
  thread_id: string | null;
  linked_message_id: string | null;
  metadata_json: string | null;
}

interface TranscriptRow {
  id: string;
  audio_id: string;
  role: AudioTranscriptRole;
  text: string;
  provider: string | null;
  language: string | null;
  created_at: number;
  is_primary: number;
}

function mimeToExtension(mimeType: string): string {
  const lower = mimeType.toLowerCase();
  if (lower.includes("mp4") || lower.includes("m4a") || lower.includes("aac")) return "m4a";
  if (lower.includes("ogg") || lower.includes("opus")) return "ogg";
  if (lower.includes("wav") || lower.includes("wave")) return "wav";
  if (lower.includes("webm")) return "webm";
  if (lower.includes("mpeg") || lower.includes("mp3")) return "mp3";
  if (lower.includes("flac")) return "flac";
  return "bin";
}

function parseMetadataJson(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function rowToAsset(row: AssetRow): AudioAsset {
  return {
    id: row.id,
    kind: row.kind,
    appId: row.app_id,
    originActor: row.origin_actor,
    mimeType: row.mime_type,
    bytesRelPath: row.bytes_rel_path,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
    deviceId: row.device_id,
    sessionId: row.session_id,
    threadId: row.thread_id,
    linkedMessageId: row.linked_message_id,
    metadata: parseMetadataJson(row.metadata_json),
  };
}

function rowToTranscript(row: TranscriptRow): AudioTranscript {
  return {
    id: row.id,
    audioId: row.audio_id,
    role: row.role,
    text: row.text,
    provider: row.provider,
    language: row.language,
    createdAt: row.created_at,
    isPrimary: row.is_primary === 1,
  };
}

export class AudioServiceStore {
  private readonly db: Database.Database;
  private readonly blobsDir: string;

  constructor(dbPath: string, blobsDir: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.mkdirSync(blobsDir, { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(SCHEMA_DDL);
    this.blobsDir = blobsDir;
  }

  close(): void {
    this.db.close();
  }

  register(input: RegisterAudioInput): AudioAssetWithTranscripts {
    const id = input.id ?? randomUUID();
    const existing = this.db.prepare("SELECT * FROM audio_assets WHERE id = ?").get(id) as AssetRow | undefined;
    if (existing) {
      if (existing.app_id !== input.appId) {
        throw new Error("register: audio id already exists for a different app");
      }
      return this.getByIdInternal(id) ?? { asset: rowToAsset(existing), transcripts: [] };
    }

    const ext = mimeToExtension(input.mimeType);
    const relPath = path.join(input.appId, `${id}.${ext}`);
    const absPath = path.join(this.blobsDir, relPath);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, Buffer.from(input.bytesBase64, "base64"));

    const now = Date.now();
    const tx = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO audio_assets (
          id, kind, app_id, origin_actor, mime_type, bytes_rel_path, duration_ms, created_at,
          device_id, session_id, thread_id, linked_message_id, metadata_json
        ) VALUES (
          @id, @kind, @app_id, @origin_actor, @mime_type, @bytes_rel_path, @duration_ms, @created_at,
          @device_id, @session_id, @thread_id, @linked_message_id, @metadata_json
        )
      `).run({
        id,
        kind: input.kind,
        app_id: input.appId,
        origin_actor: input.originActor,
        mime_type: input.mimeType,
        bytes_rel_path: relPath,
        duration_ms: input.durationMs,
        created_at: now,
        device_id: input.deviceId ?? null,
        session_id: input.sessionId ?? null,
        thread_id: input.threadId ?? null,
        linked_message_id: input.linkedMessageId ?? null,
        metadata_json: input.metadata ? JSON.stringify(input.metadata) : null,
      });

      if (input.transcript) {
        this.insertTranscriptInternal(id, {
          text: input.transcript.text,
          role: input.transcript.role ?? (input.kind === "agent_tts" ? "synthesis_source" : "transcription"),
          provider: input.transcript.provider ?? null,
          language: input.transcript.language ?? null,
          markAsPrimary: true,
        });
      }
    });
    tx();

    const result = this.getByIdInternal(id);
    if (!result) throw new Error("register: failed to read back inserted asset");
    return result;
  }

  attachTranscript(audioId: string, input: AttachTranscriptInput): AudioTranscript {
    const transcriptId = this.insertTranscriptInternal(audioId, input);
    const row = this.db.prepare("SELECT * FROM audio_transcripts WHERE id = ?").get(transcriptId) as TranscriptRow;
    return rowToTranscript(row);
  }

  private insertTranscriptInternal(audioId: string, input: AttachTranscriptInput): string {
    const transcriptId = randomUUID();
    const now = Date.now();
    const tx = this.db.transaction(() => {
      const existingPrimary = this.db.prepare(
        "SELECT id FROM audio_transcripts WHERE audio_id = ? AND is_primary = 1 LIMIT 1",
      ).get(audioId) as { id: string } | undefined;
      const shouldBePrimary = input.markAsPrimary === true || !existingPrimary;
      if (shouldBePrimary && existingPrimary) {
        this.db.prepare("UPDATE audio_transcripts SET is_primary = 0 WHERE audio_id = ?").run(audioId);
      }
      this.db.prepare(`
        INSERT INTO audio_transcripts (id, audio_id, role, text, provider, language, created_at, is_primary)
        VALUES (@id, @audio_id, @role, @text, @provider, @language, @created_at, @is_primary)
      `).run({
        id: transcriptId,
        audio_id: audioId,
        role: input.role,
        text: input.text,
        provider: input.provider ?? null,
        language: input.language ?? null,
        created_at: now,
        is_primary: shouldBePrimary ? 1 : 0,
      });
    });
    tx();
    return transcriptId;
  }

  getById(id: string, appId: string): AudioAssetWithTranscripts | null {
    const row = this.db.prepare("SELECT * FROM audio_assets WHERE id = ? AND app_id = ?").get(id, appId) as AssetRow | undefined;
    if (!row) return null;
    return this.assembleAsset(row);
  }

  private getByIdInternal(id: string): AudioAssetWithTranscripts | null {
    const row = this.db.prepare("SELECT * FROM audio_assets WHERE id = ?").get(id) as AssetRow | undefined;
    if (!row) return null;
    return this.assembleAsset(row);
  }

  private assembleAsset(row: AssetRow): AudioAssetWithTranscripts {
    const transcripts = (this.db.prepare(
      "SELECT * FROM audio_transcripts WHERE audio_id = ? ORDER BY is_primary DESC, created_at DESC",
    ).all(row.id) as TranscriptRow[]).map(rowToTranscript);
    return { asset: rowToAsset(row), transcripts };
  }

  getBytes(id: string, appId: string): AudioBytes | null {
    const row = this.db.prepare("SELECT * FROM audio_assets WHERE id = ? AND app_id = ?").get(id, appId) as AssetRow | undefined;
    if (!row) return null;
    const absPath = path.join(this.blobsDir, row.bytes_rel_path);
    if (!fs.existsSync(absPath)) return null;
    const buffer = fs.readFileSync(absPath);
    return {
      base64: buffer.toString("base64"),
      mimeType: row.mime_type,
      durationMs: row.duration_ms,
    };
  }

  list(filter: ListAudioFilter): ListAudioResult {
    return this.listInternal({ ...filter, requireAppId: true });
  }

  listGlobal(filter: ListGlobalAudioFilter): ListAudioResult {
    return this.listInternal({ ...filter, requireAppId: false });
  }

  private listInternal(filter: ListGlobalAudioFilter & { requireAppId: boolean }): ListAudioResult {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};
    if (filter.requireAppId) {
      if (!filter.appId) throw new Error("list: appId is required");
      conditions.push("app_id = @app_id");
      params.app_id = filter.appId;
    } else if (filter.appId) {
      conditions.push("app_id = @app_id");
      params.app_id = filter.appId;
    }
    if (filter.kind) { conditions.push("kind = @kind"); params.kind = filter.kind; }
    if (filter.originActor) { conditions.push("origin_actor = @origin_actor"); params.origin_actor = filter.originActor; }
    if (filter.deviceId) { conditions.push("device_id = @device_id"); params.device_id = filter.deviceId; }
    if (filter.sessionId) { conditions.push("session_id = @session_id"); params.session_id = filter.sessionId; }
    if (filter.threadId) { conditions.push("thread_id = @thread_id"); params.thread_id = filter.threadId; }
    if (filter.linkedMessageId) { conditions.push("linked_message_id = @linked_message_id"); params.linked_message_id = filter.linkedMessageId; }
    if (filter.fromCreatedAt !== undefined) { conditions.push("created_at >= @from_created_at"); params.from_created_at = filter.fromCreatedAt; }
    if (filter.toCreatedAt !== undefined) { conditions.push("created_at <= @to_created_at"); params.to_created_at = filter.toCreatedAt; }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;

    const total = (this.db.prepare(`SELECT COUNT(*) AS n FROM audio_assets ${where}`).get(params) as { n: number }).n;
    const rows = this.db.prepare(
      `SELECT * FROM audio_assets ${where} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    ).all(params) as AssetRow[];

    const items = rows.map((row) => this.assembleAsset(row));
    return { items, total };
  }

  delete(id: string, appId: string): boolean {
    const row = this.db.prepare("SELECT bytes_rel_path FROM audio_assets WHERE id = ? AND app_id = ?").get(id, appId) as { bytes_rel_path: string } | undefined;
    if (!row) return false;
    const absPath = path.join(this.blobsDir, row.bytes_rel_path);
    const info = this.db.prepare("DELETE FROM audio_assets WHERE id = ? AND app_id = ?").run(id, appId);
    if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
    return info.changes > 0;
  }

  insertCatalogAsset(input: {
    id: string;
    kind: AudioKind;
    appId: string;
    originActor: AudioOriginActor;
    mimeType: string;
    bytesRelPath: string;
    durationMs: number;
    createdAt: number;
    deviceId?: string | null;
    sessionId?: string | null;
    threadId?: string | null;
    linkedMessageId?: string | null;
    metadata?: Record<string, unknown> | null;
    transcriptText?: string | null;
    transcriptProvider?: string | null;
  }): void {
    const tx = this.db.transaction(() => {
      this.db.prepare(`
        INSERT OR IGNORE INTO audio_assets (
          id, kind, app_id, origin_actor, mime_type, bytes_rel_path, duration_ms, created_at,
          device_id, session_id, thread_id, linked_message_id, metadata_json
        ) VALUES (
          @id, @kind, @app_id, @origin_actor, @mime_type, @bytes_rel_path, @duration_ms, @created_at,
          @device_id, @session_id, @thread_id, @linked_message_id, @metadata_json
        )
      `).run({
        id: input.id,
        kind: input.kind,
        app_id: input.appId,
        origin_actor: input.originActor,
        mime_type: input.mimeType,
        bytes_rel_path: input.bytesRelPath,
        duration_ms: input.durationMs,
        created_at: input.createdAt,
        device_id: input.deviceId ?? null,
        session_id: input.sessionId ?? null,
        thread_id: input.threadId ?? null,
        linked_message_id: input.linkedMessageId ?? null,
        metadata_json: input.metadata ? JSON.stringify(input.metadata) : null,
      });
      if (input.transcriptText && input.transcriptText.trim()) {
        this.db.prepare(`
          INSERT INTO audio_transcripts (id, audio_id, role, text, provider, language, created_at, is_primary)
          VALUES (@id, @audio_id, 'transcription', @text, @provider, NULL, @created_at, 1)
        `).run({
          id: randomUUID(),
          audio_id: input.id,
          text: input.transcriptText,
          provider: input.transcriptProvider ?? "unknown",
          created_at: input.createdAt,
        });
      }
    });
    tx();
  }
}
