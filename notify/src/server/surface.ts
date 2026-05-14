import { clawPersistentSurface } from "@clawjs/core";

const source = { file: "notify/src/server/surface.ts", language: "typescript" } as const;

export const schemaSurfaceNodes = [
  clawPersistentSurface.table({ id: `claw.database.notify.table.admins`, name: "admins", parentId: "claw.database.notify", databaseId: "claw.database.notify", source }),
  clawPersistentSurface.table({ id: `claw.database.notify.table.source_apps`, name: "source_apps", parentId: "claw.database.notify", databaseId: "claw.database.notify", source }),
  clawPersistentSurface.table({ id: `claw.database.notify.table.source_app_tokens`, name: "source_app_tokens", parentId: "claw.database.notify", databaseId: "claw.database.notify", source }),
  clawPersistentSurface.table({ id: `claw.database.notify.table.client_apps`, name: "client_apps", parentId: "claw.database.notify", databaseId: "claw.database.notify", source }),
  clawPersistentSurface.table({ id: `claw.database.notify.table.device_installations`, name: "device_installations", parentId: "claw.database.notify", databaseId: "claw.database.notify", source }),
  clawPersistentSurface.table({ id: `claw.database.notify.table.user_preferences`, name: "user_preferences", parentId: "claw.database.notify", databaseId: "claw.database.notify", source }),
  clawPersistentSurface.table({ id: `claw.database.notify.table.subscriptions`, name: "subscriptions", parentId: "claw.database.notify", databaseId: "claw.database.notify", source }),
  clawPersistentSurface.table({ id: `claw.database.notify.table.notifications`, name: "notifications", parentId: "claw.database.notify", databaseId: "claw.database.notify", source }),
  clawPersistentSurface.table({ id: `claw.database.notify.table.deliveries`, name: "deliveries", parentId: "claw.database.notify", databaseId: "claw.database.notify", source }),
  clawPersistentSurface.table({ id: `claw.database.notify.table.delivery_attempts`, name: "delivery_attempts", parentId: "claw.database.notify", databaseId: "claw.database.notify", source }),
  clawPersistentSurface.table({ id: `claw.database.notify.table.receipts`, name: "receipts", parentId: "claw.database.notify", databaseId: "claw.database.notify", source }),
  clawPersistentSurface.table({ id: `claw.database.notify.table.glance_states`, name: "glance_states", parentId: "claw.database.notify", databaseId: "claw.database.notify", source }),
  clawPersistentSurface.index({ id: `claw.database.notify.index.notifications_source_idempotency_idx`, name: "notifications_source_idempotency_idx", parentId: "claw.database.notify", databaseId: "claw.database.notify", source }),
  clawPersistentSurface.index({ id: `claw.database.notify.index.deliveries_notification_installation_idx`, name: "deliveries_notification_installation_idx", parentId: "claw.database.notify", databaseId: "claw.database.notify", source })
];

export const NOTIFY_STORE_SCHEMA_SQL = String.raw`
      CREATE TABLE IF NOT EXISTS admins (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS source_apps (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        description TEXT,
        icon_url TEXT,
        defaults_json TEXT,
        deep_link_template_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS source_app_tokens (
        id TEXT PRIMARY KEY,
        source_app_id TEXT NOT NULL REFERENCES source_apps(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        last_used_at TEXT,
        revoked_at TEXT
      );

      CREATE TABLE IF NOT EXISTS client_apps (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        platform TEXT NOT NULL,
        bundle_id TEXT NOT NULL,
        credentials_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS device_installations (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        client_app_id TEXT NOT NULL REFERENCES client_apps(id) ON DELETE CASCADE,
        platform TEXT NOT NULL,
        device_name TEXT NOT NULL,
        push_token TEXT,
        push_token_updated_at TEXT,
        access_token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_seen_at TEXT,
        revoked_at TEXT
      );

      CREATE TABLE IF NOT EXISTS user_preferences (
        tenant_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        critical_only INTEGER NOT NULL DEFAULT 0,
        quiet_hours_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (tenant_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        installation_id TEXT REFERENCES device_installations(id) ON DELETE CASCADE,
        source_app_id TEXT REFERENCES source_apps(id) ON DELETE CASCADE,
        client_app_id TEXT REFERENCES client_apps(id) ON DELETE CASCADE,
        project_id TEXT,
        agent_id TEXT,
        workspace_id TEXT,
        event_type TEXT,
        severity TEXT,
        min_priority TEXT,
        action TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        source_app_id TEXT NOT NULL REFERENCES source_apps(id) ON DELETE CASCADE,
        idempotency_key TEXT,
        priority TEXT NOT NULL,
        delivery_mode TEXT NOT NULL,
        status TEXT NOT NULL,
        title TEXT,
        body TEXT,
        data_json TEXT,
        context_json TEXT NOT NULL,
        deep_link_json TEXT,
        target_client_app_id TEXT REFERENCES client_apps(id) ON DELETE SET NULL,
        receipt_policy_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        cancelled_at TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS notifications_source_idempotency_idx
        ON notifications(source_app_id, idempotency_key)
        WHERE idempotency_key IS NOT NULL;

      CREATE TABLE IF NOT EXISTS deliveries (
        id TEXT PRIMARY KEY,
        notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
        tenant_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        installation_id TEXT NOT NULL REFERENCES device_installations(id) ON DELETE CASCADE,
        client_app_id TEXT NOT NULL REFERENCES client_apps(id) ON DELETE CASCADE,
        state TEXT NOT NULL,
        provider TEXT NOT NULL,
        provider_message_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        read_at TEXT,
        acked_at TEXT,
        cancelled_at TEXT,
        expired_at TEXT,
        last_attempt_at TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS deliveries_notification_installation_idx
        ON deliveries(notification_id, installation_id);

      CREATE TABLE IF NOT EXISTS delivery_attempts (
        id TEXT PRIMARY KEY,
        delivery_id TEXT NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        status TEXT NOT NULL,
        request_json TEXT,
        response_json TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS receipts (
        id TEXT PRIMARY KEY,
        notification_id TEXT NOT NULL UNIQUE REFERENCES notifications(id) ON DELETE CASCADE,
        tenant_id TEXT NOT NULL,
        status TEXT NOT NULL,
        retry_sec INTEGER NOT NULL,
        expire_at TEXT NOT NULL,
        acked_at TEXT,
        acked_by_installation_id TEXT REFERENCES device_installations(id) ON DELETE SET NULL,
        acked_by_user_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        cancelled_at TEXT
      );

      CREATE TABLE IF NOT EXISTS glance_states (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        source_app_id TEXT NOT NULL REFERENCES source_apps(id) ON DELETE CASCADE,
        scope TEXT NOT NULL,
        user_id TEXT,
        client_app_id TEXT REFERENCES client_apps(id) ON DELETE CASCADE,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `;
