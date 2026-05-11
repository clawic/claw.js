import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { DDL } from "./schema.ts";

export type DB = ReturnType<typeof Database>;

export function openDatabase(dbPath: string): DB {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");
  applySchema(db);
  return db;
}

function applySchema(db: DB) {
  db.transaction(() => {
    for (const stmt of DDL) {
      db.exec(stmt);
    }
  })();
}

export function jsonStringify(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function jsonParse<T = unknown>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function now(): number {
  return Date.now();
}
