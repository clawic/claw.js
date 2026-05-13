import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { DDL } from "./schema.ts";

const BADGER_SQL_NAMES = [
  "workspace",
  "user",
  "workspace_member",
  "workspace_invitation",
  "api_token",
  "audit_event",
  "channel_family",
  "channel_account",
  "channel_account_health",
  "post",
  "post_account",
  "post_variant",
  "post_label",
  "post_label_pivot",
  "media",
  "post_media_pivot",
  "post_activity",
  "queue",
  "queue_slot",
  "queue_account",
  "queue_entry",
  "blackout_window",
  "recurrence",
  "bulk_import_batch",
  "campaign",
  "template",
  "hashtag_group",
  "dynamic_variable",
  "evergreen_pool",
  "evergreen_pool_member",
  "ab_variant_set",
  "ab_variant_member",
  "utm_template",
  "tracked_link",
  "link_shortener_provider",
  "locale_variant_policy",
  "audience_segment",
  "account_metric_daily",
  "post_metric",
  "report",
  "report_export",
  "imported_post",
  "inbox_thread",
  "inbox_message",
  "inbox_rule",
  "approval_workflow",
  "post_approval",
  "post_approval_decision",
  "external_reviewer_link",
  "webhook",
  "webhook_delivery",
  "integration_service",
  "ai_brand_voice",
  "job",
  "job_batch",
  "setting",
  "system_status",
  "publishing_migrations",
  "audit_event_ws_idx",
  "post_ws_status_idx",
  "post_account_state_idx",
  "post_variant_post_idx",
  "post_activity_post_idx",
  "queue_entry_q_idx",
  "recurrence_next_idx",
  "webhook_delivery_hook_idx",
  "job_state_idx",
];

type NativeDB = ReturnType<typeof Database>;

export class PrefixedPublishingDatabase {
  constructor(private readonly db: NativeDB) {}

  prepare(sql: string): any {
    return this.db.prepare(rewritePublishingSql(sql));
  }

  exec(sql: string) {
    return this.db.exec(rewritePublishingSql(sql));
  }

  pragma(source: string, options?: Parameters<NativeDB["pragma"]>[1]) {
    return this.db.pragma(source, options);
  }

  transaction<T extends (...args: any[]) => any>(fn: T): T {
    return this.db.transaction((...args: Parameters<T>) => fn(...args)) as unknown as T;
  }

  close() {
    return this.db.close();
  }
}

export type DB = PrefixedPublishingDatabase;

export function openDatabase(dbPath: string): DB {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new PrefixedPublishingDatabase(new Database(dbPath));
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

function rewritePublishingSql(sql: string): string {
  let rewritten = sql;
  for (const name of BADGER_SQL_NAMES) {
    rewritten = rewritten.replace(new RegExp(`\\b${name}\\b`, "g"), `publishing_${name}`);
  }
  return rewritten;
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
