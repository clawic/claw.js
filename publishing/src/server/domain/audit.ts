import type { DB } from "../db/index.ts";
import { jsonStringify, now } from "../db/index.ts";
import { prefixedId } from "../../shared/ids.ts";
import type { AuthPrincipal } from "../auth.ts";

export class AuditLog {
  constructor(private readonly db: DB) {}

  record(input: {
    workspaceId: string | null;
    principal: AuthPrincipal | null;
    action: string;
    targetType?: string | null;
    targetId?: string | null;
    payload?: Record<string, unknown>;
    ip?: string | null;
  }) {
    const id = prefixedId("aud");
    let actorUserId: string | null = null;
    let actorTokenId: string | null = null;
    if (input.principal) {
      if (input.principal.kind === "user") {
        actorUserId = input.principal.userId;
        actorTokenId = input.principal.tokenId;
      } else if (input.principal.kind === "service") {
        actorTokenId = input.principal.tokenId;
      }
    }
    this.db
      .prepare(
        `INSERT INTO audit_event
         (id, workspace_id, actor_user_id, actor_token_id, action, target_type, target_id, payload, ip, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.workspaceId,
        actorUserId,
        actorTokenId,
        input.action,
        input.targetType ?? null,
        input.targetId ?? null,
        jsonStringify(input.payload ?? {}),
        input.ip ?? null,
        now(),
      );
  }

  list(workspaceId: string | null, limit = 100): unknown[] {
    return this.db
      .prepare(
        `SELECT id, workspace_id, actor_user_id, actor_token_id, action, target_type, target_id, payload, ip, created_at
         FROM audit_event WHERE workspace_id IS ? OR workspace_id = ?
         ORDER BY created_at DESC LIMIT ?`,
      )
      .all(workspaceId, workspaceId, limit);
  }
}
