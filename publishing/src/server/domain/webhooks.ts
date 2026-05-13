import type { DB } from "../db/index.ts";
import { jsonParse, jsonStringify, now } from "../db/index.ts";
import { prefixedId } from "../../shared/ids.ts";
import type { VaultClient } from "../vault/client.ts";

export interface WebhookRow {
  id: string;
  workspace_id: string;
  name: string;
  callback_url: string;
  http_method: "POST" | "PUT";
  content_type: "application/json" | "application/x-www-form-urlencoded";
  events: string[];
  secret_vault_ref: string;
  max_attempts: number;
  status: "active" | "paused" | "disabled";
  created_at: number;
}

export class WebhooksService {
  constructor(private readonly db: DB, private readonly vault: VaultClient) {}

  async create(workspaceId: string, input: {
    name: string;
    callback_url: string;
    http_method?: "POST" | "PUT";
    content_type?: "application/json" | "application/x-www-form-urlencoded";
    events: string[];
    secret?: string;
    max_attempts?: number;
  }): Promise<WebhookRow> {
    const id = prefixedId("wh");
    const secret = input.secret ?? `wh_${Math.random().toString(36).slice(2, 18)}`;
    const ref = await this.vault.put(undefined, secret);
    this.db
      .prepare(
        `INSERT INTO webhook (id, workspace_id, name, callback_url, http_method, content_type, events, secret_vault_ref, max_attempts, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      )
      .run(
        id,
        workspaceId,
        input.name,
        input.callback_url,
        input.http_method ?? "POST",
        input.content_type ?? "application/json",
        jsonStringify(input.events),
        ref,
        input.max_attempts ?? 5,
        now(),
      );
    return this.get(workspaceId, id)!;
  }

  list(workspaceId: string): WebhookRow[] {
    const rows = this.db
      .prepare(`SELECT * FROM webhook WHERE workspace_id = ? ORDER BY created_at DESC`)
      .all(workspaceId) as Array<Record<string, unknown>>;
    return rows.map(rowToWebhook);
  }

  get(workspaceId: string, id: string): WebhookRow | null {
    const row = this.db
      .prepare(`SELECT * FROM webhook WHERE workspace_id = ? AND id = ?`)
      .get(workspaceId, id) as Record<string, unknown> | undefined;
    return row ? rowToWebhook(row) : null;
  }

  activeForEvent(workspaceId: string, eventName: string): WebhookRow[] {
    return this.list(workspaceId).filter((w) => w.status === "active" && w.events.some((e) => matchEvent(e, eventName)));
  }

  remove(workspaceId: string, id: string): void {
    this.db.prepare(`DELETE FROM webhook WHERE workspace_id = ? AND id = ?`).run(workspaceId, id);
  }

  recordDelivery(input: {
    webhookId: string;
    eventName: string;
    eventId: string;
    payload: Record<string, unknown>;
    attempt: number;
    requestHeaders: Record<string, string>;
    responseStatus?: number;
    responseHeaders?: Record<string, string>;
    responseBody?: string;
    deliveredAt?: number | null;
    failedAt?: number | null;
    nextRetryAt?: number | null;
  }): { id: string } {
    const id = prefixedId("whd");
    this.db
      .prepare(
        `INSERT INTO webhook_delivery (id, webhook_id, event_name, event_id, payload, attempt, request_headers, response_status, response_headers, response_body, delivered_at, failed_at, next_retry_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.webhookId,
        input.eventName,
        input.eventId,
        jsonStringify(input.payload),
        input.attempt,
        jsonStringify(input.requestHeaders),
        input.responseStatus ?? null,
        jsonStringify(input.responseHeaders ?? {}),
        input.responseBody ?? null,
        input.deliveredAt ?? null,
        input.failedAt ?? null,
        input.nextRetryAt ?? null,
      );
    return { id };
  }

  deliveries(webhookId: string, limit = 100) {
    return this.db
      .prepare(`SELECT * FROM webhook_delivery WHERE webhook_id = ? ORDER BY rowid DESC LIMIT ?`)
      .all(webhookId, limit);
  }

  delivery(id: string) {
    return this.db.prepare(`SELECT * FROM webhook_delivery WHERE id = ?`).get(id);
  }
}

function matchEvent(pattern: string, name: string): boolean {
  if (pattern === name) return true;
  if (pattern.endsWith(".*") && name.startsWith(pattern.slice(0, -2) + ".")) return true;
  return false;
}

function rowToWebhook(row: Record<string, unknown>): WebhookRow {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    name: String(row.name),
    callback_url: String(row.callback_url),
    http_method: row.http_method as WebhookRow["http_method"],
    content_type: row.content_type as WebhookRow["content_type"],
    events: jsonParse<string[]>(row.events as string, []),
    secret_vault_ref: String(row.secret_vault_ref),
    max_attempts: Number(row.max_attempts),
    status: row.status as WebhookRow["status"],
    created_at: Number(row.created_at),
  };
}
