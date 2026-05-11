import type { DB } from "../db/index.ts";
import { jsonParse, jsonStringify, now } from "../db/index.ts";
import { prefixedId } from "../../shared/ids.ts";
import type { ChannelAccountState } from "../channels/contract.ts";

export interface ChannelAccountRow extends ChannelAccountState {
  avatarUrl: string | null;
  tokenExpiresAt: number | null;
  createdAt: number;
}

export class ChannelAccountsService {
  constructor(private readonly db: DB) {}

  create(input: {
    workspaceId: string;
    familyId: string;
    providerAccountId: string;
    displayName: string;
    handle?: string | null;
    avatarUrl?: string | null;
    metadata?: Record<string, unknown>;
    credentialsVaultRef?: string | null;
    scopes?: string[];
    tokenExpiresAt?: number | null;
    capabilitiesSnapshot?: Record<string, unknown>;
  }): ChannelAccountRow {
    const id = prefixedId("ca");
    const created = now();
    this.db
      .prepare(
        `INSERT INTO channel_account (id, workspace_id, family_id, provider_account_id, display_name, handle, avatar_url,
           metadata, credentials_vault_ref, scopes, token_expires_at, refresh_strategy, authorized, last_authorized_at,
           capabilities_snapshot, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'auto', 1, ?, ?, ?)`,
      )
      .run(
        id,
        input.workspaceId,
        input.familyId,
        input.providerAccountId,
        input.displayName,
        input.handle ?? null,
        input.avatarUrl ?? null,
        jsonStringify(input.metadata ?? {}),
        input.credentialsVaultRef ?? null,
        jsonStringify(input.scopes ?? []),
        input.tokenExpiresAt ?? null,
        created,
        jsonStringify(input.capabilitiesSnapshot ?? {}),
        created,
      );
    return this.get(input.workspaceId, id)!;
  }

  list(workspaceId: string): ChannelAccountRow[] {
    const rows = this.db
      .prepare(
        `SELECT id, workspace_id, family_id, provider_account_id, display_name, handle, avatar_url,
                metadata, credentials_vault_ref, scopes, token_expires_at, authorized, created_at
         FROM channel_account WHERE workspace_id = ? AND disabled_at IS NULL ORDER BY created_at`,
      )
      .all(workspaceId) as Array<Record<string, unknown>>;
    return rows.map(rowToAccount);
  }

  get(workspaceId: string, id: string): ChannelAccountRow | null {
    const row = this.db
      .prepare(
        `SELECT id, workspace_id, family_id, provider_account_id, display_name, handle, avatar_url,
                metadata, credentials_vault_ref, scopes, token_expires_at, authorized, created_at
         FROM channel_account WHERE workspace_id = ? AND id = ?`,
      )
      .get(workspaceId, id) as Record<string, unknown> | undefined;
    return row ? rowToAccount(row) : null;
  }

  setAuthorized(id: string, authorized: boolean): void {
    const ts = now();
    if (authorized) {
      this.db
        .prepare(`UPDATE channel_account SET authorized = 1, last_authorized_at = ? WHERE id = ?`)
        .run(ts, id);
    } else {
      this.db
        .prepare(`UPDATE channel_account SET authorized = 0, last_unauthorized_at = ? WHERE id = ?`)
        .run(ts, id);
    }
  }

  remove(id: string): void {
    this.db.prepare(`UPDATE channel_account SET disabled_at = ? WHERE id = ?`).run(now(), id);
  }

  saveHealth(id: string, status: string, details: Record<string, unknown>): void {
    this.db
      .prepare(
        `INSERT INTO channel_account_health (channel_account_id, last_probe_at, status, details)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(channel_account_id) DO UPDATE SET last_probe_at=excluded.last_probe_at, status=excluded.status, details=excluded.details`,
      )
      .run(id, now(), status, jsonStringify(details));
  }

  health(id: string) {
    return this.db
      .prepare(
        `SELECT channel_account_id, last_probe_at, status, details FROM channel_account_health WHERE channel_account_id = ?`,
      )
      .get(id);
  }
}

function rowToAccount(row: Record<string, unknown>): ChannelAccountRow {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    familyId: String(row.family_id),
    providerAccountId: String(row.provider_account_id),
    displayName: String(row.display_name),
    handle: (row.handle as string) ?? null,
    avatarUrl: (row.avatar_url as string) ?? null,
    metadata: jsonParse<Record<string, unknown>>(row.metadata as string, {}),
    credentialsVaultRef: (row.credentials_vault_ref as string) ?? null,
    scopes: jsonParse<string[]>(row.scopes as string, []),
    tokenExpiresAt: (row.token_expires_at as number) ?? null,
    authorized: !!row.authorized,
    createdAt: Number(row.created_at),
  };
}
