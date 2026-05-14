// @clawjs-persistent-surface-ddl-source
import { randomUUID } from "node:crypto";

import type Database from "better-sqlite3";
import { z } from "zod";

import { DEFAULT_TENANT_ID } from "./host-store.ts";

const DDL = `
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT,
  target_id TEXT,
  outcome TEXT NOT NULL,
  context_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant_ts
  ON audit_events(tenant_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_tenant_action
  ON audit_events(tenant_id, action, ts DESC);
`;

export const AUDIT_ACTIONS = [
  "meshLink",
  "meshPair",
  "meshRevoke",
  "meshTouch",
  "meshJob",
  "meshRemoteJob",
  "proxyExec",
  "proxySsh",
  "proxyGit",
  "proxyRequest",
  "bridgeAuth",
  "bearerRotate",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_OUTCOMES = [
  "allow",
  "deny",
  "success",
  "failure",
] as const;

export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

export const AuditEventSchema = z.object({
  id: z.string().min(1),
  ts: z.date(),
  action: z.enum(AUDIT_ACTIONS),
  actorId: z.string().min(1).optional(),
  targetId: z.string().min(1).optional(),
  outcome: z.enum(AUDIT_OUTCOMES),
  context: z.record(z.unknown()).optional(),
});

export type AuditEvent = z.infer<typeof AuditEventSchema>;

export const AuditEventInputSchema = AuditEventSchema.partial({
  id: true,
  ts: true,
});

export type AuditEventInput = z.infer<typeof AuditEventInputSchema>;

interface AuditRow {
  id: string;
  tenant_id: string;
  ts: string;
  action: string;
  actor_id: string | null;
  target_id: string | null;
  outcome: string;
  context_json: string | null;
}

export interface AuditQuery {
  action?: AuditAction;
  actorId?: string;
  targetId?: string;
  since?: Date;
  until?: Date;
  limit?: number;
}

export class AuditStore {
  private readonly db: Database.Database;
  private readonly tenantId: string;

  constructor(db: Database.Database, tenantId: string = DEFAULT_TENANT_ID) {
    this.db = db;
    this.tenantId = tenantId;
    this.db.exec(DDL);
  }

  record(input: AuditEventInput): AuditEvent {
    const parsed = AuditEventInputSchema.parse(input);
    const event = AuditEventSchema.parse({
      id: parsed.id ?? randomUUID(),
      ts: parsed.ts ?? new Date(),
      action: parsed.action,
      actorId: parsed.actorId,
      targetId: parsed.targetId,
      outcome: parsed.outcome,
      context: parsed.context,
    });
    this.db
      .prepare(
        `INSERT INTO audit_events (
          id, tenant_id, ts, action, actor_id, target_id, outcome, context_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.id,
        this.tenantId,
        event.ts.toISOString(),
        event.action,
        event.actorId ?? null,
        event.targetId ?? null,
        event.outcome,
        event.context ? JSON.stringify(event.context) : null,
      );
    return event;
  }

  list(query: AuditQuery = {}): AuditEvent[] {
    const clauses: string[] = ["tenant_id = ?"];
    const args: unknown[] = [this.tenantId];
    if (query.action) {
      clauses.push("action = ?");
      args.push(query.action);
    }
    if (query.actorId) {
      clauses.push("actor_id = ?");
      args.push(query.actorId);
    }
    if (query.targetId) {
      clauses.push("target_id = ?");
      args.push(query.targetId);
    }
    if (query.since) {
      clauses.push("ts >= ?");
      args.push(query.since.toISOString());
    }
    if (query.until) {
      clauses.push("ts <= ?");
      args.push(query.until.toISOString());
    }
    const limit = query.limit ?? 200;
    const rows = this.db
      .prepare<unknown[], AuditRow>(
        `SELECT * FROM audit_events
         WHERE ${clauses.join(" AND ")}
         ORDER BY ts DESC
         LIMIT ?`,
      )
      .all(...args, limit);
    return rows.map(rowToEvent);
  }

  count(action?: AuditAction): number {
    if (action) {
      const row = this.db
        .prepare<[string, string], { c: number }>(
          "SELECT COUNT(*) AS c FROM audit_events WHERE tenant_id = ? AND action = ?",
        )
        .get(this.tenantId, action);
      return row?.c ?? 0;
    }
    const row = this.db
      .prepare<[string], { c: number }>(
        "SELECT COUNT(*) AS c FROM audit_events WHERE tenant_id = ?",
      )
      .get(this.tenantId);
    return row?.c ?? 0;
  }
}

function rowToEvent(row: AuditRow): AuditEvent {
  return AuditEventSchema.parse({
    id: row.id,
    ts: new Date(row.ts),
    action: row.action,
    actorId: row.actor_id ?? undefined,
    targetId: row.target_id ?? undefined,
    outcome: row.outcome,
    context: row.context_json ? JSON.parse(row.context_json) : undefined,
  });
}
