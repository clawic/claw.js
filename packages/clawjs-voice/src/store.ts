import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import type { ListVoiceRunsFilter, STTResult, TTSResult } from "./types.ts";

const SCHEMA_DDL = `
  CREATE TABLE IF NOT EXISTS voice_tts_runs (
    id              TEXT PRIMARY KEY,
    provider        TEXT NOT NULL,
    text            TEXT NOT NULL,
    voice           TEXT,
    language        TEXT,
    output_path     TEXT,
    mime_type       TEXT,
    duration_ms     INTEGER,
    bytes_written   INTEGER,
    ok              INTEGER NOT NULL DEFAULT 1,
    error           TEXT,
    created_at      INTEGER NOT NULL,
    metadata_json   TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_tts_provider ON voice_tts_runs(provider, created_at DESC);

  CREATE TABLE IF NOT EXISTS voice_stt_runs (
    id              TEXT PRIMARY KEY,
    provider        TEXT NOT NULL,
    text            TEXT NOT NULL,
    language        TEXT,
    duration_ms     INTEGER NOT NULL DEFAULT 0,
    ok              INTEGER NOT NULL DEFAULT 1,
    error           TEXT,
    created_at      INTEGER NOT NULL,
    metadata_json   TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_stt_provider ON voice_stt_runs(provider, created_at DESC);
`;

interface TtsRow {
  id: string; provider: string; text: string; voice: string | null; language: string | null;
  output_path: string | null; mime_type: string | null; duration_ms: number | null;
  bytes_written: number | null; ok: number; error: string | null; created_at: number;
  metadata_json: string | null;
}

interface SttRow {
  id: string; provider: string; text: string; language: string | null; duration_ms: number;
  ok: number; error: string | null; created_at: number; metadata_json: string | null;
}

export class VoiceServiceStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(SCHEMA_DDL);
  }

  close(): void { this.db.close(); }

  recordTTS(result: TTSResult): void {
    this.db.prepare(`
      INSERT INTO voice_tts_runs (id, provider, text, output_path, mime_type, duration_ms, bytes_written, ok, error, created_at)
      VALUES (@id, @provider, @text, @output_path, @mime_type, @duration_ms, @bytes_written, @ok, @error, @created_at)
    `).run({
      id: result.id, provider: result.provider, text: result.text,
      output_path: result.outputPath, mime_type: result.mimeType,
      duration_ms: result.durationMs, bytes_written: result.bytesWritten,
      ok: result.ok ? 1 : 0, error: result.error, created_at: result.createdAt,
    });
  }

  recordSTT(result: STTResult): void {
    this.db.prepare(`
      INSERT INTO voice_stt_runs (id, provider, text, language, duration_ms, ok, error, created_at)
      VALUES (@id, @provider, @text, @language, @duration_ms, @ok, @error, @created_at)
    `).run({
      id: result.id, provider: result.provider, text: result.text, language: result.language,
      duration_ms: result.durationMs, ok: result.ok ? 1 : 0, error: result.error, created_at: result.createdAt,
    });
  }

  listRuns(filter: ListVoiceRunsFilter = {}): Array<TTSResult | STTResult> {
    const limit = Math.min(filter.limit ?? 100, 1000);
    const offset = filter.offset ?? 0;
    const result: Array<TTSResult | STTResult> = [];
    if (!filter.kind || filter.kind === "tts") {
      const rows = filter.provider
        ? (this.db.prepare("SELECT * FROM voice_tts_runs WHERE provider = ? ORDER BY created_at DESC LIMIT ? OFFSET ?").all(filter.provider, limit, offset) as TtsRow[])
        : (this.db.prepare("SELECT * FROM voice_tts_runs ORDER BY created_at DESC LIMIT ? OFFSET ?").all(limit, offset) as TtsRow[]);
      for (const row of rows) {
        result.push({
          id: row.id, provider: row.provider as TTSResult["provider"], text: row.text,
          outputPath: row.output_path, mimeType: row.mime_type ?? "application/octet-stream",
          durationMs: row.duration_ms, bytesWritten: row.bytes_written,
          createdAt: row.created_at, ok: row.ok === 1, error: row.error,
        });
      }
    }
    if (!filter.kind || filter.kind === "stt") {
      const rows = filter.provider
        ? (this.db.prepare("SELECT * FROM voice_stt_runs WHERE provider = ? ORDER BY created_at DESC LIMIT ? OFFSET ?").all(filter.provider, limit, offset) as SttRow[])
        : (this.db.prepare("SELECT * FROM voice_stt_runs ORDER BY created_at DESC LIMIT ? OFFSET ?").all(limit, offset) as SttRow[]);
      for (const row of rows) {
        result.push({
          id: row.id, provider: row.provider as STTResult["provider"], text: row.text,
          language: row.language, durationMs: row.duration_ms, createdAt: row.created_at,
          ok: row.ok === 1, error: row.error,
        });
      }
    }
    return result;
  }
}
