import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

// @clawjs-persistent-surface-ddl-source

import type {
  ListRunsFilter,
  RunRecord,
  RunRequest,
  RunResult,
  RunStatus,
  SandboxBackend,
} from "./types.ts";

const SCHEMA_DDL = `
  CREATE TABLE IF NOT EXISTS sandbox_runs (
    id              TEXT PRIMARY KEY,
    backend         TEXT NOT NULL CHECK (backend IN ('local','docker','ssh')),
    status          TEXT NOT NULL CHECK (status IN ('running','completed','failed','timeout','cancelled')),
    exit_code       INTEGER,
    command         TEXT NOT NULL,
    args_json       TEXT NOT NULL DEFAULT '[]',
    cwd             TEXT,
    env_json        TEXT,
    stdin_present   INTEGER NOT NULL DEFAULT 0,
    timeout_ms      INTEGER,
    image           TEXT,
    host            TEXT,
    container_id    TEXT,
    stdout          TEXT NOT NULL DEFAULT '',
    stderr          TEXT NOT NULL DEFAULT '',
    started_at      INTEGER NOT NULL,
    completed_at    INTEGER,
    duration_ms     INTEGER,
    error           TEXT,
    metadata_json   TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_runs_backend_started ON sandbox_runs(backend, started_at DESC);
  CREATE INDEX IF NOT EXISTS idx_runs_status_started  ON sandbox_runs(status, started_at DESC);
  CREATE INDEX IF NOT EXISTS idx_runs_host            ON sandbox_runs(host);
`;

interface RunRow {
  id: string;
  backend: SandboxBackend;
  status: RunStatus;
  exit_code: number | null;
  command: string;
  args_json: string;
  cwd: string | null;
  env_json: string | null;
  stdin_present: number;
  timeout_ms: number | null;
  image: string | null;
  host: string | null;
  container_id: string | null;
  stdout: string;
  stderr: string;
  started_at: number;
  completed_at: number | null;
  duration_ms: number | null;
  error: string | null;
  metadata_json: string | null;
}

function parseJson<T>(value: string | null): T | null {
  if (value == null) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function rowToRecord(row: RunRow): RunRecord {
  const completedAt = row.completed_at ?? row.started_at;
  return {
    id: row.id,
    backend: row.backend,
    status: row.status,
    exitCode: row.exit_code,
    stdout: row.stdout,
    stderr: row.stderr,
    startedAt: row.started_at,
    completedAt,
    durationMs: row.duration_ms ?? Math.max(0, completedAt - row.started_at),
    command: row.command,
    args: parseJson<string[]>(row.args_json) ?? [],
    cwd: row.cwd,
    containerId: row.container_id,
    host: row.host,
    image: row.image,
    metadata: parseJson<Record<string, unknown>>(row.metadata_json),
    error: row.error,
    env: parseJson<Record<string, string>>(row.env_json),
    timeoutMs: row.timeout_ms,
  };
}

export class SandboxServiceStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(SCHEMA_DDL);
  }

  close(): void {
    this.db.close();
  }

  insertRun(input: { id: string; request: RunRequest; startedAt: number }): void {
    this.db.prepare(`
      INSERT INTO sandbox_runs (
        id, backend, status, command, args_json, cwd, env_json, stdin_present, timeout_ms,
        image, host, started_at, metadata_json
      ) VALUES (
        @id, @backend, 'running', @command, @args_json, @cwd, @env_json, @stdin_present, @timeout_ms,
        @image, @host, @started_at, @metadata_json
      )
    `).run({
      id: input.id,
      backend: input.request.backend,
      command: input.request.command,
      args_json: JSON.stringify(input.request.args ?? []),
      cwd: input.request.cwd ?? null,
      env_json: input.request.env ? JSON.stringify(input.request.env) : null,
      stdin_present: input.request.stdin ? 1 : 0,
      timeout_ms: input.request.timeoutMs ?? null,
      image: input.request.image ?? null,
      host: input.request.host ?? null,
      started_at: input.startedAt,
      metadata_json: input.request.metadata ? JSON.stringify(input.request.metadata) : null,
    });
  }

  finishRun(id: string, completion: {
    status: RunStatus;
    exitCode: number | null;
    stdout: string;
    stderr: string;
    containerId?: string | null;
    error?: string | null;
    completedAt?: number;
  }): RunResult {
    const completedAt = completion.completedAt ?? Date.now();
    this.db.prepare(`
      UPDATE sandbox_runs
      SET status        = @status,
          exit_code     = @exit_code,
          stdout        = @stdout,
          stderr        = @stderr,
          container_id  = @container_id,
          completed_at  = @completed_at,
          duration_ms   = @duration_ms,
          error         = @error
      WHERE id = @id
    `).run({
      id,
      status: completion.status,
      exit_code: completion.exitCode,
      stdout: completion.stdout,
      stderr: completion.stderr,
      container_id: completion.containerId ?? null,
      completed_at: completedAt,
      duration_ms: (() => {
        const row = this.db.prepare("SELECT started_at FROM sandbox_runs WHERE id = ?").get(id) as { started_at: number };
        return Math.max(0, completedAt - row.started_at);
      })(),
      error: completion.error ?? null,
    });
    const record = this.getRun(id);
    if (!record) throw new Error(`finishRun: failed to read back ${id}`);
    return record;
  }

  getRun(id: string): RunRecord | null {
    const row = this.db.prepare("SELECT * FROM sandbox_runs WHERE id = ?").get(id) as RunRow | undefined;
    return row ? rowToRecord(row) : null;
  }

  listRuns(filter: ListRunsFilter = {}): RunRecord[] {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};
    if (filter.backend) { conditions.push("backend = @backend"); params.backend = filter.backend; }
    if (filter.status) { conditions.push("status = @status"); params.status = filter.status; }
    if (filter.host) { conditions.push("host = @host"); params.host = filter.host; }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = Math.min(filter.limit ?? 100, 1000);
    const offset = filter.offset ?? 0;
    const rows = this.db.prepare(
      `SELECT * FROM sandbox_runs ${where} ORDER BY started_at DESC LIMIT ${limit} OFFSET ${offset}`,
    ).all(params) as RunRow[];
    return rows.map(rowToRecord);
  }
}
