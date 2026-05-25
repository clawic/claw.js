import { randomUUID } from "node:crypto";
import { NOTIFY_STORE_SCHEMA_SQL } from "./surface.ts";

import Database from "better-sqlite3";

import { generateOpaqueToken, hashSecret } from "./auth.ts";
import type {
  ClientAppRecord,
  ClientPlatform,
  DeliveryRecord,
  DeviceInstallation,
  GlanceStateRecord,
  NotificationAudience,
  NotificationContext,
  NotificationDeepLink,
  NotificationDeliveryMode,
  NotificationPriority,
  NotificationReceiptPolicy,
  NotificationRecord,
  QuietHoursPolicy,
  ReceiptRecord,
  SourceAppRecord,
  SubscriptionAction,
  SubscriptionFilter,
  SubscriptionRecord,
  UserNotificationPreferences,
} from "../shared/types.ts";

interface SourceAppRow {
  id: string;
  tenant_id: string;
  display_name: string;
  description: string | null;
  icon_url: string | null;
  defaults_json: string | null;
  deep_link_template_json: string | null;
  created_at: string;
  updated_at: string;
}

interface ClientAppRow {
  id: string;
  tenant_id: string;
  display_name: string;
  platform: ClientPlatform;
  bundle_id: string;
  credentials_json: string | null;
  created_at: string;
  updated_at: string;
}

interface InstallationRow {
  id: string;
  tenant_id: string;
  user_id: string;
  client_app_id: string;
  platform: ClientPlatform;
  device_name: string;
  push_token: string | null;
  push_token_updated_at: string | null;
  created_at: string;
  updated_at: string;
  last_seen_at: string | null;
}

interface SubscriptionRow {
  id: string;
  tenant_id: string;
  user_id: string;
  installation_id: string | null;
  source_app_id: string | null;
  client_app_id: string | null;
  project_id: string | null;
  agent_id: string | null;
  workspace_id: string | null;
  event_type: string | null;
  severity: string | null;
  min_priority: NotificationPriority | null;
  action: SubscriptionAction;
  created_at: string;
  updated_at: string;
}

interface NotificationRow {
  id: string;
  tenant_id: string;
  source_app_id: string;
  approval_id: string;
  idempotency_key: string | null;
  priority: NotificationPriority;
  delivery_mode: NotificationDeliveryMode;
  status: "active" | "cancelled";
  title: string | null;
  body: string | null;
  data_json: string | null;
  context_json: string;
  deep_link_json: string | null;
  target_client_app_id: string | null;
  receipt_policy_json: string;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
}

interface DeliveryRow {
  id: string;
  notification_id: string;
  tenant_id: string;
  user_id: string;
  installation_id: string;
  client_app_id: string;
  state: DeliveryRecord["state"];
  provider: DeliveryRecord["provider"];
  provider_message_id: string | null;
  created_at: string;
  updated_at: string;
  read_at: string | null;
  acked_at: string | null;
  cancelled_at: string | null;
  expired_at: string | null;
  last_attempt_at: string | null;
}

interface ReceiptRow {
  id: string;
  notification_id: string;
  tenant_id: string;
  status: ReceiptRecord["status"];
  retry_sec: number;
  expire_at: string;
  acked_at: string | null;
  acked_by_installation_id: string | null;
  acked_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
}

interface GlanceRow {
  id: string;
  tenant_id: string;
  source_app_id: string;
  scope: string;
  user_id: string | null;
  client_app_id: string | null;
  data_json: string;
  created_at: string;
  updated_at: string;
}

interface UserPreferenceRow {
  tenant_id: string;
  user_id: string;
  critical_only: number;
  quiet_hours_json: string | null;
  created_at: string;
  updated_at: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || randomUUID().slice(0, 8);
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function uniqueId(value: string): string {
  const normalized = slugify(value);
  return normalized.length <= 48 ? normalized : normalized.slice(0, 48);
}

function priorityRank(priority: NotificationPriority): number {
  switch (priority) {
    case "passive":
      return 0;
    case "normal":
      return 1;
    case "time-sensitive":
      return 2;
    case "critical":
      return 3;
  }
}

function minuteOfDay(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  });
  const parts = formatter.formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function quietHoursActive(policy: QuietHoursPolicy | null | undefined, now = new Date()): boolean {
  if (!policy?.enabled) return false;
  const currentMinute = minuteOfDay(now, policy.timeZone);
  if (policy.startMinute === policy.endMinute) return true;
  if (policy.startMinute < policy.endMinute) {
    return currentMinute >= policy.startMinute && currentMinute < policy.endMinute;
  }
  return currentMinute >= policy.startMinute || currentMinute < policy.endMinute;
}

function serializeSourceApp(row: SourceAppRow): SourceAppRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    displayName: row.display_name,
    ...(row.description ? { description: row.description } : {}),
    ...(row.icon_url ? { iconUrl: row.icon_url } : {}),
    ...(row.defaults_json ? { defaults: parseJson<Record<string, unknown>>(row.defaults_json, {}) } : {}),
    ...(row.deep_link_template_json ? { deepLinkTemplate: parseJson<Record<string, unknown>>(row.deep_link_template_json, {}) } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeClientApp(row: ClientAppRow): ClientAppRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    displayName: row.display_name,
    platform: row.platform,
    bundleId: row.bundle_id,
    ...(row.credentials_json ? { credentials: parseJson<Record<string, unknown>>(row.credentials_json, {}) } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeInstallation(row: InstallationRow): DeviceInstallation {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    clientAppId: row.client_app_id,
    platform: row.platform,
    deviceName: row.device_name,
    pushToken: row.push_token,
    pushTokenUpdatedAt: row.push_token_updated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSeenAt: row.last_seen_at,
  };
}

function serializeSubscription(row: SubscriptionRow): SubscriptionRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    ...(row.installation_id ? { installationId: row.installation_id } : {}),
    ...(row.source_app_id ? { sourceAppId: row.source_app_id } : {}),
    ...(row.client_app_id ? { clientAppId: row.client_app_id } : {}),
    ...(row.project_id ? { projectId: row.project_id } : {}),
    ...(row.agent_id ? { agentId: row.agent_id } : {}),
    ...(row.workspace_id ? { workspaceId: row.workspace_id } : {}),
    ...(row.event_type ? { eventType: row.event_type } : {}),
    ...(row.severity ? { severity: row.severity } : {}),
    ...(row.min_priority ? { minPriority: row.min_priority } : {}),
    action: row.action,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeNotification(row: NotificationRow): NotificationRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    sourceAppId: row.source_app_id,
    approvalId: row.approval_id,
    idempotencyKey: row.idempotency_key,
    priority: row.priority,
    deliveryMode: row.delivery_mode,
    status: row.status,
    ...(row.title ? { title: row.title } : {}),
    ...(row.body ? { body: row.body } : {}),
    ...(row.data_json ? { data: parseJson<Record<string, unknown>>(row.data_json, {}) } : {}),
    context: parseJson<NotificationContext>(row.context_json, { tenantId: row.tenant_id }),
    ...(row.deep_link_json ? { deepLink: parseJson<NotificationDeepLink>(row.deep_link_json, {}) } : {}),
    targetClientAppId: row.target_client_app_id,
    receiptPolicy: parseJson<NotificationReceiptPolicy>(row.receipt_policy_json, { kind: "none" }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cancelledAt: row.cancelled_at,
  };
}

function serializeDelivery(row: DeliveryRow): DeliveryRecord {
  return {
    id: row.id,
    notificationId: row.notification_id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    installationId: row.installation_id,
    clientAppId: row.client_app_id,
    state: row.state,
    provider: row.provider,
    providerMessageId: row.provider_message_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    readAt: row.read_at,
    ackedAt: row.acked_at,
    cancelledAt: row.cancelled_at,
    expiredAt: row.expired_at,
    lastAttemptAt: row.last_attempt_at,
  };
}

function serializeReceipt(row: ReceiptRow): ReceiptRecord {
  return {
    id: row.id,
    notificationId: row.notification_id,
    tenantId: row.tenant_id,
    status: row.status,
    retrySec: row.retry_sec,
    expireAt: row.expire_at,
    ackedAt: row.acked_at,
    ackedByInstallationId: row.acked_by_installation_id,
    ackedByUserId: row.acked_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cancelledAt: row.cancelled_at,
  };
}

function serializeGlance(row: GlanceRow): GlanceStateRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    sourceAppId: row.source_app_id,
    scope: row.scope,
    userId: row.user_id,
    clientAppId: row.client_app_id,
    data: parseJson<Record<string, unknown>>(row.data_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeUserPreferences(row: UserPreferenceRow): UserNotificationPreferences {
  return {
    tenantId: row.tenant_id,
    userId: row.user_id,
    criticalOnly: row.critical_only === 1,
    quietHours: parseJson<QuietHoursPolicy | null>(row.quiet_hours_json, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class NotifyServiceStore {
  readonly sqlite: Database.Database;

  constructor(dbPath: string) {
    this.sqlite = new Database(dbPath);
    this.sqlite.pragma("journal_mode = WAL");
    this.sqlite.pragma("foreign_keys = ON");
    this.setup();
  }

  close(): void {
    this.sqlite.close();
  }

  private setup(): void {
    this.sqlite.exec(NOTIFY_STORE_SCHEMA_SQL);
    const notificationColumns = new Set(
      this.sqlite.prepare("PRAGMA table_info(notifications)").all()
        .map((row) => String((row as { name: string }).name)),
    );
    if (!notificationColumns.has("approval_id")) {
      this.sqlite.prepare("ALTER TABLE notifications ADD COLUMN approval_id TEXT NOT NULL DEFAULT 'legacy-missing-approval'").run();
    }

    const now = nowIso();
    this.sqlite.prepare(`
      INSERT OR IGNORE INTO admins (id, email, password_hash, created_at)
      VALUES (?, ?, ?, ?)
    `).run("admin-main", "admin@notify.local", hashSecret("notify-admin"), now);
  }

  verifyAdmin(email: string, password: string): { id: string; email: string } | null {
    const row = this.sqlite.prepare(`
      SELECT id, email, password_hash
      FROM admins
      WHERE email = ?
    `).get(email) as { id: string; email: string; password_hash: string } | undefined;
    if (!row) return null;
    return row.password_hash === hashSecret(password) ? { id: row.id, email: row.email } : null;
  }

  createSourceApp(input: {
    tenantId: string;
    id?: string;
    displayName: string;
    description?: string;
    iconUrl?: string;
    defaults?: Record<string, unknown>;
    deepLinkTemplate?: Record<string, unknown>;
  }): { record: SourceAppRecord; token: string } {
    const timestamp = nowIso();
    const id = input.id?.trim() || uniqueId(input.displayName);
    const token = generateOpaqueToken("ntfsrc");
    this.sqlite.prepare(`
      INSERT INTO source_apps (
        id, tenant_id, display_name, description, icon_url, defaults_json, deep_link_template_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.tenantId,
      input.displayName.trim(),
      input.description?.trim() || null,
      input.iconUrl?.trim() || null,
      input.defaults ? JSON.stringify(input.defaults) : null,
      input.deepLinkTemplate ? JSON.stringify(input.deepLinkTemplate) : null,
      timestamp,
      timestamp,
    );
    this.sqlite.prepare(`
      INSERT INTO source_app_tokens (id, source_app_id, token_hash, created_at)
      VALUES (?, ?, ?, ?)
    `).run(randomUUID(), id, hashSecret(token), timestamp);
    return {
      record: this.getSourceApp(id)!,
      token,
    };
  }

  getSourceApp(id: string): SourceAppRecord | null {
    const row = this.sqlite.prepare(`
      SELECT *
      FROM source_apps
      WHERE id = ?
    `).get(id) as SourceAppRow | undefined;
    return row ? serializeSourceApp(row) : null;
  }

  listSourceApps(tenantId: string): SourceAppRecord[] {
    const rows = this.sqlite.prepare(`
      SELECT *
      FROM source_apps
      WHERE tenant_id = ?
      ORDER BY created_at ASC
    `).all(tenantId) as SourceAppRow[];
    return rows.map(serializeSourceApp);
  }

  rotateSourceAppToken(sourceAppId: string): string {
    const timestamp = nowIso();
    this.sqlite.prepare(`
      UPDATE source_app_tokens
      SET revoked_at = ?
      WHERE source_app_id = ? AND revoked_at IS NULL
    `).run(timestamp, sourceAppId);
    const token = generateOpaqueToken("ntfsrc");
    this.sqlite.prepare(`
      INSERT INTO source_app_tokens (id, source_app_id, token_hash, created_at)
      VALUES (?, ?, ?, ?)
    `).run(randomUUID(), sourceAppId, hashSecret(token), timestamp);
    return token;
  }

  authenticateSourceAppToken(rawToken: string): { sourceAppId: string; tenantId: string } | null {
    const row = this.sqlite.prepare(`
      SELECT sa.id, sa.tenant_id
      FROM source_app_tokens sat
      JOIN source_apps sa ON sa.id = sat.source_app_id
      WHERE sat.token_hash = ? AND sat.revoked_at IS NULL
    `).get(hashSecret(rawToken)) as { id: string; tenant_id: string } | undefined;
    if (!row) return null;
    this.sqlite.prepare(`
      UPDATE source_app_tokens
      SET last_used_at = ?
      WHERE token_hash = ?
    `).run(nowIso(), hashSecret(rawToken));
    return {
      sourceAppId: row.id,
      tenantId: row.tenant_id,
    };
  }

  createClientApp(input: {
    tenantId: string;
    id?: string;
    displayName: string;
    platform: ClientPlatform;
    bundleId: string;
    credentials?: Record<string, unknown>;
  }): ClientAppRecord {
    const timestamp = nowIso();
    const id = input.id?.trim() || uniqueId(`${input.displayName}-${input.platform}`);
    this.sqlite.prepare(`
      INSERT INTO client_apps (
        id, tenant_id, display_name, platform, bundle_id, credentials_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.tenantId,
      input.displayName.trim(),
      input.platform,
      input.bundleId.trim(),
      input.credentials ? JSON.stringify(input.credentials) : null,
      timestamp,
      timestamp,
    );
    return this.getClientApp(id)!;
  }

  getClientApp(id: string): ClientAppRecord | null {
    const row = this.sqlite.prepare(`
      SELECT *
      FROM client_apps
      WHERE id = ?
    `).get(id) as ClientAppRow | undefined;
    return row ? serializeClientApp(row) : null;
  }

  listClientApps(tenantId: string): ClientAppRecord[] {
    const rows = this.sqlite.prepare(`
      SELECT *
      FROM client_apps
      WHERE tenant_id = ?
      ORDER BY created_at ASC
    `).all(tenantId) as ClientAppRow[];
    return rows.map(serializeClientApp);
  }

  registerInstallation(input: {
    tenantId: string;
    userId: string;
    clientAppId: string;
    deviceName: string;
    pushToken?: string;
  }): { record: DeviceInstallation; token: string } {
    const clientApp = this.getClientApp(input.clientAppId);
    if (!clientApp) throw new Error("Unknown client app.");
    if (clientApp.tenantId !== input.tenantId) throw new Error("Client app tenant mismatch.");
    const timestamp = nowIso();
    const token = generateOpaqueToken("ntfins");
    const id = randomUUID();
    this.sqlite.prepare(`
      INSERT INTO device_installations (
        id, tenant_id, user_id, client_app_id, platform, device_name, push_token, push_token_updated_at,
        access_token_hash, created_at, updated_at, last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.tenantId,
      input.userId,
      input.clientAppId,
      clientApp.platform,
      input.deviceName.trim(),
      input.pushToken?.trim() || null,
      input.pushToken?.trim() ? timestamp : null,
      hashSecret(token),
      timestamp,
      timestamp,
      timestamp,
    );
    return {
      record: this.getInstallation(id)!,
      token,
    };
  }

  authenticateInstallationToken(rawToken: string): { installationId: string; tenantId: string; userId: string; clientAppId: string } | null {
    const row = this.sqlite.prepare(`
      SELECT id, tenant_id, user_id, client_app_id
      FROM device_installations
      WHERE access_token_hash = ? AND revoked_at IS NULL
    `).get(hashSecret(rawToken)) as { id: string; tenant_id: string; user_id: string; client_app_id: string } | undefined;
    if (!row) return null;
    this.touchInstallation(row.id);
    return {
      installationId: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      clientAppId: row.client_app_id,
    };
  }

  getInstallation(id: string): DeviceInstallation | null {
    const row = this.sqlite.prepare(`
      SELECT id, tenant_id, user_id, client_app_id, platform, device_name, push_token, push_token_updated_at, created_at, updated_at, last_seen_at
      FROM device_installations
      WHERE id = ? AND revoked_at IS NULL
    `).get(id) as InstallationRow | undefined;
    return row ? serializeInstallation(row) : null;
  }

  touchInstallation(id: string): void {
    const timestamp = nowIso();
    this.sqlite.prepare(`
      UPDATE device_installations
      SET last_seen_at = ?, updated_at = ?
      WHERE id = ? AND revoked_at IS NULL
    `).run(timestamp, timestamp, id);
  }

  updateInstallationPushToken(installationId: string, pushToken: string): DeviceInstallation | null {
    const timestamp = nowIso();
    this.sqlite.prepare(`
      UPDATE device_installations
      SET push_token = ?, push_token_updated_at = ?, updated_at = ?, last_seen_at = ?
      WHERE id = ? AND revoked_at IS NULL
    `).run(pushToken.trim(), timestamp, timestamp, timestamp, installationId);
    return this.getInstallation(installationId);
  }

  unregisterInstallation(input: { installationId: string; tenantId: string; userId?: string }): boolean {
    const timestamp = nowIso();
    const info = input.userId
      ? this.sqlite.prepare(`
        UPDATE device_installations
        SET revoked_at = ?, updated_at = ?
        WHERE id = ? AND tenant_id = ? AND user_id = ? AND revoked_at IS NULL
      `).run(timestamp, timestamp, input.installationId, input.tenantId, input.userId)
      : this.sqlite.prepare(`
        UPDATE device_installations
        SET revoked_at = ?, updated_at = ?
        WHERE id = ? AND tenant_id = ? AND revoked_at IS NULL
      `).run(timestamp, timestamp, input.installationId, input.tenantId);
    return info.changes > 0;
  }

  listInstallationsByIds(tenantId: string, ids: string[]): DeviceInstallation[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(", ");
    const rows = this.sqlite.prepare(`
      SELECT id, tenant_id, user_id, client_app_id, platform, device_name, push_token, push_token_updated_at, created_at, updated_at, last_seen_at
      FROM device_installations
      WHERE tenant_id = ? AND revoked_at IS NULL AND id IN (${placeholders})
    `).all(tenantId, ...ids) as InstallationRow[];
    return rows.map(serializeInstallation);
  }

  listInstallationsForUser(tenantId: string, userId: string): DeviceInstallation[] {
    const rows = this.sqlite.prepare(`
      SELECT id, tenant_id, user_id, client_app_id, platform, device_name, push_token, push_token_updated_at, created_at, updated_at, last_seen_at
      FROM device_installations
      WHERE tenant_id = ? AND user_id = ? AND revoked_at IS NULL
      ORDER BY created_at ASC
    `).all(tenantId, userId) as InstallationRow[];
    return rows.map(serializeInstallation);
  }

  listActiveInstallationsForUsers(tenantId: string, userIds: string[]): DeviceInstallation[] {
    if (userIds.length === 0) return [];
    const placeholders = userIds.map(() => "?").join(", ");
    const rows = this.sqlite.prepare(`
      SELECT id, tenant_id, user_id, client_app_id, platform, device_name, push_token, push_token_updated_at, created_at, updated_at, last_seen_at
      FROM device_installations
      WHERE tenant_id = ? AND revoked_at IS NULL AND user_id IN (${placeholders})
    `).all(tenantId, ...userIds) as InstallationRow[];
    return rows.map(serializeInstallation);
  }

  getUserPreferences(tenantId: string, userId: string): UserNotificationPreferences {
    const row = this.sqlite.prepare(`
      SELECT *
      FROM user_preferences
      WHERE tenant_id = ? AND user_id = ?
    `).get(tenantId, userId) as UserPreferenceRow | undefined;
    if (row) return serializeUserPreferences(row);
    const timestamp = nowIso();
    this.sqlite.prepare(`
      INSERT INTO user_preferences (tenant_id, user_id, critical_only, quiet_hours_json, created_at, updated_at)
      VALUES (?, ?, 0, NULL, ?, ?)
    `).run(tenantId, userId, timestamp, timestamp);
    return this.getUserPreferences(tenantId, userId);
  }

  upsertUserPreferences(input: {
    tenantId: string;
    userId: string;
    criticalOnly?: boolean;
    quietHours?: QuietHoursPolicy | null;
  }): UserNotificationPreferences {
    const current = this.getUserPreferences(input.tenantId, input.userId);
    const timestamp = nowIso();
    this.sqlite.prepare(`
      UPDATE user_preferences
      SET critical_only = ?, quiet_hours_json = ?, updated_at = ?
      WHERE tenant_id = ? AND user_id = ?
    `).run(
      (input.criticalOnly ?? current.criticalOnly) ? 1 : 0,
      input.quietHours === undefined ? JSON.stringify(current.quietHours ?? null) : JSON.stringify(input.quietHours ?? null),
      timestamp,
      input.tenantId,
      input.userId,
    );
    return this.getUserPreferences(input.tenantId, input.userId);
  }

  upsertSubscription(input: {
    id?: string;
    tenantId: string;
    userId: string;
    installationId?: string | null;
    filter: SubscriptionFilter;
  }): SubscriptionRecord {
    const timestamp = nowIso();
    const id = input.id ?? randomUUID();
    const payload = {
      id,
      tenantId: input.tenantId,
      userId: input.userId,
      installationId: input.installationId ?? null,
      sourceAppId: input.filter.sourceAppId ?? null,
      clientAppId: input.filter.clientAppId ?? null,
      projectId: input.filter.projectId ?? null,
      agentId: input.filter.agentId ?? null,
      workspaceId: input.filter.workspaceId ?? null,
      eventType: input.filter.eventType ?? null,
      severity: input.filter.severity ?? null,
      minPriority: input.filter.minPriority ?? null,
      action: input.filter.action ?? "allow",
    };
    const existing = this.sqlite.prepare(`
      SELECT id
      FROM subscriptions
      WHERE id = ?
    `).get(id) as { id: string } | undefined;
    if (existing) {
      this.sqlite.prepare(`
        UPDATE subscriptions
        SET installation_id = ?, source_app_id = ?, client_app_id = ?, project_id = ?, agent_id = ?, workspace_id = ?,
            event_type = ?, severity = ?, min_priority = ?, action = ?, updated_at = ?
        WHERE id = ? AND tenant_id = ? AND user_id = ?
      `).run(
        payload.installationId,
        payload.sourceAppId,
        payload.clientAppId,
        payload.projectId,
        payload.agentId,
        payload.workspaceId,
        payload.eventType,
        payload.severity,
        payload.minPriority,
        payload.action,
        timestamp,
        id,
        input.tenantId,
        input.userId,
      );
    } else {
      this.sqlite.prepare(`
        INSERT INTO subscriptions (
          id, tenant_id, user_id, installation_id, source_app_id, client_app_id, project_id, agent_id, workspace_id,
          event_type, severity, min_priority, action, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        input.tenantId,
        input.userId,
        payload.installationId,
        payload.sourceAppId,
        payload.clientAppId,
        payload.projectId,
        payload.agentId,
        payload.workspaceId,
        payload.eventType,
        payload.severity,
        payload.minPriority,
        payload.action,
        timestamp,
        timestamp,
      );
    }
    return this.getSubscription(id)!;
  }

  getSubscription(id: string): SubscriptionRecord | null {
    const row = this.sqlite.prepare(`
      SELECT *
      FROM subscriptions
      WHERE id = ?
    `).get(id) as SubscriptionRow | undefined;
    return row ? serializeSubscription(row) : null;
  }

  deleteSubscription(input: { id: string; tenantId: string; userId: string }): boolean {
    const info = this.sqlite.prepare(`
      DELETE FROM subscriptions
      WHERE id = ? AND tenant_id = ? AND user_id = ?
    `).run(input.id, input.tenantId, input.userId);
    return info.changes > 0;
  }

  listSubscriptionsForTenant(tenantId: string): SubscriptionRecord[] {
    const rows = this.sqlite.prepare(`
      SELECT *
      FROM subscriptions
      WHERE tenant_id = ?
      ORDER BY created_at ASC
    `).all(tenantId) as SubscriptionRow[];
    return rows.map(serializeSubscription);
  }

  listSubscriptionsForUser(tenantId: string, userId: string): SubscriptionRecord[] {
    const rows = this.sqlite.prepare(`
      SELECT *
      FROM subscriptions
      WHERE tenant_id = ? AND user_id = ?
      ORDER BY created_at ASC
    `).all(tenantId, userId) as SubscriptionRow[];
    return rows.map(serializeSubscription);
  }

  getNotificationBySourceAndIdempotency(sourceAppId: string, idempotencyKey: string): NotificationRecord | null {
    const row = this.sqlite.prepare(`
      SELECT *
      FROM notifications
      WHERE source_app_id = ? AND idempotency_key = ?
    `).get(sourceAppId, idempotencyKey) as NotificationRow | undefined;
    return row ? serializeNotification(row) : null;
  }

  createNotification(input: {
    tenantId: string;
    sourceAppId: string;
    approvalId: string;
    idempotencyKey?: string;
    priority: NotificationPriority;
    deliveryMode: NotificationDeliveryMode;
    title?: string;
    body?: string;
    data?: Record<string, unknown>;
    context: NotificationContext;
    deepLink?: NotificationDeepLink;
    targetClientAppId?: string;
    receiptPolicy: NotificationReceiptPolicy;
  }): NotificationRecord {
    const timestamp = nowIso();
    const id = randomUUID();
    this.sqlite.prepare(`
      INSERT INTO notifications (
        id, tenant_id, source_app_id, approval_id, idempotency_key, priority, delivery_mode, status, title, body,
        data_json, context_json, deep_link_json, target_client_app_id, receipt_policy_json, created_at, updated_at, cancelled_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `).run(
      id,
      input.tenantId,
      input.sourceAppId,
      input.approvalId,
      input.idempotencyKey ?? null,
      input.priority,
      input.deliveryMode,
      input.title?.trim() || null,
      input.body?.trim() || null,
      input.data ? JSON.stringify(input.data) : null,
      JSON.stringify(input.context),
      input.deepLink ? JSON.stringify(input.deepLink) : null,
      input.targetClientAppId ?? null,
      JSON.stringify(input.receiptPolicy),
      timestamp,
      timestamp,
    );
    return this.getNotification(id)!;
  }

  getNotification(id: string): NotificationRecord | null {
    const row = this.sqlite.prepare(`
      SELECT *
      FROM notifications
      WHERE id = ?
    `).get(id) as NotificationRow | undefined;
    return row ? serializeNotification(row) : null;
  }

  getNotificationForSource(sourceAppId: string, id: string): NotificationRecord | null {
    const row = this.sqlite.prepare(`
      SELECT *
      FROM notifications
      WHERE id = ? AND source_app_id = ?
    `).get(id, sourceAppId) as NotificationRow | undefined;
    return row ? serializeNotification(row) : null;
  }

  createReceipt(input: { notificationId: string; tenantId: string; retrySec: number; expireAt: string }): ReceiptRecord {
    const timestamp = nowIso();
    const id = randomUUID();
    this.sqlite.prepare(`
      INSERT INTO receipts (
        id, notification_id, tenant_id, status, retry_sec, expire_at, acked_at, acked_by_installation_id, acked_by_user_id,
        created_at, updated_at, cancelled_at
      ) VALUES (?, ?, ?, 'pending', ?, ?, NULL, NULL, NULL, ?, ?, NULL)
    `).run(id, input.notificationId, input.tenantId, input.retrySec, input.expireAt, timestamp, timestamp);
    return this.getReceipt(id)!;
  }

  getReceipt(id: string): ReceiptRecord | null {
    const row = this.sqlite.prepare(`
      SELECT *
      FROM receipts
      WHERE id = ?
    `).get(id) as ReceiptRow | undefined;
    return row ? serializeReceipt(row) : null;
  }

  getReceiptByNotification(notificationId: string): ReceiptRecord | null {
    const row = this.sqlite.prepare(`
      SELECT *
      FROM receipts
      WHERE notification_id = ?
    `).get(notificationId) as ReceiptRow | undefined;
    return row ? serializeReceipt(row) : null;
  }

  expirePendingReceipts(): void {
    const timestamp = nowIso();
    const rows = this.sqlite.prepare(`
      SELECT id, notification_id
      FROM receipts
      WHERE status = 'pending' AND expire_at <= ?
    `).all(timestamp) as Array<{ id: string; notification_id: string }>;
    for (const row of rows) {
      this.sqlite.prepare(`
        UPDATE receipts
        SET status = 'expired', updated_at = ?
        WHERE id = ?
      `).run(timestamp, row.id);
      this.sqlite.prepare(`
        UPDATE deliveries
        SET state = 'expired', expired_at = ?, updated_at = ?
        WHERE notification_id = ? AND state IN ('queued', 'delivered')
      `).run(timestamp, timestamp, row.notification_id);
    }
  }

  createDelivery(input: {
    notificationId: string;
    tenantId: string;
    userId: string;
    installationId: string;
    clientAppId: string;
    provider: DeliveryRecord["provider"];
  }): DeliveryRecord {
    const timestamp = nowIso();
    const id = randomUUID();
    const providerMessageId = randomUUID();
    this.sqlite.prepare(`
      INSERT INTO deliveries (
        id, notification_id, tenant_id, user_id, installation_id, client_app_id, state, provider, provider_message_id,
        created_at, updated_at, read_at, acked_at, cancelled_at, expired_at, last_attempt_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'delivered', ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?)
    `).run(
      id,
      input.notificationId,
      input.tenantId,
      input.userId,
      input.installationId,
      input.clientAppId,
      input.provider,
      providerMessageId,
      timestamp,
      timestamp,
      timestamp,
    );
    this.sqlite.prepare(`
      INSERT INTO delivery_attempts (id, delivery_id, provider, status, request_json, response_json, created_at)
      VALUES (?, ?, ?, 'success', ?, ?, ?)
    `).run(
      randomUUID(),
      id,
      input.provider,
      JSON.stringify({ installationId: input.installationId }),
      JSON.stringify({ providerMessageId }),
      timestamp,
    );
    return this.getDelivery(id)!;
  }

  getDelivery(id: string): DeliveryRecord | null {
    const row = this.sqlite.prepare(`
      SELECT *
      FROM deliveries
      WHERE id = ?
    `).get(id) as DeliveryRow | undefined;
    return row ? serializeDelivery(row) : null;
  }

  listDeliveriesForNotification(notificationId: string): DeliveryRecord[] {
    const rows = this.sqlite.prepare(`
      SELECT *
      FROM deliveries
      WHERE notification_id = ?
      ORDER BY created_at ASC
    `).all(notificationId) as DeliveryRow[];
    return rows.map(serializeDelivery);
  }

  listNotificationsForTenant(tenantId: string, limit = 100): NotificationRecord[] {
    const rows = this.sqlite.prepare(`
      SELECT *
      FROM notifications
      WHERE tenant_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(tenantId, limit) as NotificationRow[];
    return rows.map(serializeNotification);
  }

  listDeliveriesForTenant(input: {
    tenantId: string;
    limit?: number;
    userId?: string;
    state?: DeliveryRecord["state"];
  }): DeliveryRecord[] {
    const limit = input.limit ?? 200;
    const rows = input.userId && input.state
      ? this.sqlite.prepare(`
        SELECT *
        FROM deliveries
        WHERE tenant_id = ? AND user_id = ? AND state = ?
        ORDER BY created_at DESC
        LIMIT ?
      `).all(input.tenantId, input.userId, input.state, limit)
      : input.userId
        ? this.sqlite.prepare(`
          SELECT *
          FROM deliveries
          WHERE tenant_id = ? AND user_id = ?
          ORDER BY created_at DESC
          LIMIT ?
        `).all(input.tenantId, input.userId, limit)
        : input.state
          ? this.sqlite.prepare(`
            SELECT *
            FROM deliveries
            WHERE tenant_id = ? AND state = ?
            ORDER BY created_at DESC
            LIMIT ?
          `).all(input.tenantId, input.state, limit)
          : this.sqlite.prepare(`
            SELECT *
            FROM deliveries
            WHERE tenant_id = ?
            ORDER BY created_at DESC
            LIMIT ?
          `).all(input.tenantId, limit);
    return (rows as DeliveryRow[]).map(serializeDelivery);
  }

  markDeliveryRead(installationId: string, notificationId: string): DeliveryRecord | null {
    const timestamp = nowIso();
    this.sqlite.prepare(`
      UPDATE deliveries
      SET state = CASE WHEN state = 'delivered' THEN 'read' ELSE state END,
          read_at = COALESCE(read_at, ?),
          updated_at = ?
      WHERE installation_id = ? AND notification_id = ?
    `).run(timestamp, timestamp, installationId, notificationId);
    const row = this.sqlite.prepare(`
      SELECT *
      FROM deliveries
      WHERE installation_id = ? AND notification_id = ?
    `).get(installationId, notificationId) as DeliveryRow | undefined;
    return row ? serializeDelivery(row) : null;
  }

  markDeliveryReadById(tenantId: string, deliveryId: string): DeliveryRecord | null {
    const timestamp = nowIso();
    this.sqlite.prepare(`
      UPDATE deliveries
      SET state = CASE WHEN state = 'delivered' THEN 'read' ELSE state END,
          read_at = COALESCE(read_at, ?),
          updated_at = ?
      WHERE id = ? AND tenant_id = ?
    `).run(timestamp, timestamp, deliveryId, tenantId);
    return this.getDelivery(deliveryId);
  }

  acknowledgeReceipt(receiptId: string, installationId: string): ReceiptRecord | null {
    const installation = this.getInstallation(installationId);
    if (!installation) return null;
    const receipt = this.getReceipt(receiptId);
    if (!receipt || receipt.status !== "pending") return receipt;
    if (installation.tenantId !== receipt.tenantId) return null;
    if (!this.hasDeliveryForInstallation({
      tenantId: receipt.tenantId,
      notificationId: receipt.notificationId,
      installationId,
    })) {
      return null;
    }
    const timestamp = nowIso();
    this.sqlite.prepare(`
      UPDATE receipts
      SET status = 'acked', acked_at = ?, acked_by_installation_id = ?, acked_by_user_id = ?, updated_at = ?
      WHERE id = ?
    `).run(timestamp, installationId, installation.userId, timestamp, receiptId);
    this.sqlite.prepare(`
      UPDATE deliveries
      SET state = 'acked', acked_at = ?, updated_at = ?
      WHERE notification_id = ?
    `).run(timestamp, timestamp, receipt.notificationId);
    return this.getReceipt(receiptId);
  }

  hasDeliveryForInstallation(input: {
    tenantId: string;
    notificationId: string;
    installationId: string;
  }): boolean {
    const row = this.sqlite.prepare(`
      SELECT 1
      FROM deliveries
      WHERE tenant_id = ? AND notification_id = ? AND installation_id = ?
      LIMIT 1
    `).get(input.tenantId, input.notificationId, input.installationId) as { "1": number } | undefined;
    return Boolean(row);
  }

  cancelNotification(sourceAppId: string, notificationId: string): NotificationRecord | null {
    const timestamp = nowIso();
    this.sqlite.prepare(`
      UPDATE notifications
      SET status = 'cancelled', cancelled_at = ?, updated_at = ?
      WHERE id = ? AND source_app_id = ?
    `).run(timestamp, timestamp, notificationId, sourceAppId);
    const notification = this.getNotification(notificationId);
    if (!notification || notification.status !== "cancelled") return notification;
    this.sqlite.prepare(`
      UPDATE deliveries
      SET state = CASE WHEN state = 'acked' THEN state ELSE 'cancelled' END,
          cancelled_at = CASE WHEN state = 'acked' THEN cancelled_at ELSE ? END,
          updated_at = ?
      WHERE notification_id = ?
    `).run(timestamp, timestamp, notificationId);
    this.sqlite.prepare(`
      UPDATE receipts
      SET status = CASE WHEN status = 'acked' THEN status ELSE 'cancelled' END,
          cancelled_at = CASE WHEN status = 'acked' THEN cancelled_at ELSE ? END,
          updated_at = ?
      WHERE notification_id = ?
    `).run(timestamp, timestamp, notificationId);
    return this.getNotification(notificationId);
  }

  upsertGlance(input: {
    tenantId: string;
    sourceAppId: string;
    scope: string;
    userId?: string | null;
    clientAppId?: string | null;
    data: Record<string, unknown>;
  }): GlanceStateRecord {
    const timestamp = nowIso();
    const row = this.sqlite.prepare(`
      SELECT id
      FROM glance_states
      WHERE tenant_id = ? AND source_app_id = ? AND scope = ? AND COALESCE(user_id, '') = COALESCE(?, '') AND COALESCE(client_app_id, '') = COALESCE(?, '')
    `).get(input.tenantId, input.sourceAppId, input.scope, input.userId ?? null, input.clientAppId ?? null) as { id: string } | undefined;
    if (row) {
      this.sqlite.prepare(`
        UPDATE glance_states
        SET data_json = ?, updated_at = ?
        WHERE id = ?
      `).run(JSON.stringify(input.data), timestamp, row.id);
      return this.getGlance(row.id)!;
    }
    const id = randomUUID();
    this.sqlite.prepare(`
      INSERT INTO glance_states (id, tenant_id, source_app_id, scope, user_id, client_app_id, data_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.tenantId, input.sourceAppId, input.scope, input.userId ?? null, input.clientAppId ?? null, JSON.stringify(input.data), timestamp, timestamp);
    return this.getGlance(id)!;
  }

  getGlance(id: string): GlanceStateRecord | null {
    const row = this.sqlite.prepare(`
      SELECT *
      FROM glance_states
      WHERE id = ?
    `).get(id) as GlanceRow | undefined;
    return row ? serializeGlance(row) : null;
  }

  listGlancesForInstallation(tenantId: string, userId: string, clientAppId: string): GlanceStateRecord[] {
    const rows = this.sqlite.prepare(`
      SELECT *
      FROM glance_states
      WHERE tenant_id = ?
        AND (user_id IS NULL OR user_id = ?)
        AND (client_app_id IS NULL OR client_app_id = ?)
      ORDER BY updated_at DESC
    `).all(tenantId, userId, clientAppId) as GlanceRow[];
    return rows.map(serializeGlance);
  }

  listGlancesForUser(tenantId: string, userId: string): GlanceStateRecord[] {
    const rows = this.sqlite.prepare(`
      SELECT *
      FROM glance_states
      WHERE tenant_id = ? AND (user_id IS NULL OR user_id = ?)
      ORDER BY updated_at DESC
    `).all(tenantId, userId) as GlanceRow[];
    return rows.map(serializeGlance);
  }

  listFeed(tenantId: string, installationId: string, limit = 50): Array<{
    delivery: DeliveryRecord;
    notification: NotificationRecord;
    receipt: ReceiptRecord | null;
  }> {
    this.expirePendingReceipts();
    const rows = this.sqlite.prepare(`
      SELECT
        d.id as delivery_id,
        d.notification_id as delivery_notification_id,
        d.tenant_id as delivery_tenant_id,
        d.user_id as delivery_user_id,
        d.installation_id as delivery_installation_id,
        d.client_app_id as delivery_client_app_id,
        d.state as delivery_state,
        d.provider as delivery_provider,
        d.provider_message_id as delivery_provider_message_id,
        d.created_at as delivery_created_at,
        d.updated_at as delivery_updated_at,
        d.read_at as delivery_read_at,
        d.acked_at as delivery_acked_at,
        d.cancelled_at as delivery_cancelled_at,
        d.expired_at as delivery_expired_at,
        d.last_attempt_at as delivery_last_attempt_at,
        n.id as notification_id,
        n.tenant_id as notification_tenant_id,
        n.source_app_id as notification_source_app_id,
        n.idempotency_key as notification_idempotency_key,
        n.priority as notification_priority,
        n.delivery_mode as notification_delivery_mode,
        n.status as notification_status,
        n.title as notification_title,
        n.body as notification_body,
        n.data_json as notification_data_json,
        n.context_json as notification_context_json,
        n.deep_link_json as notification_deep_link_json,
        n.target_client_app_id as notification_target_client_app_id,
        n.receipt_policy_json as notification_receipt_policy_json,
        n.created_at as notification_created_at,
        n.updated_at as notification_updated_at,
        n.cancelled_at as notification_cancelled_at,
        r.id as receipt_id,
        r.notification_id as receipt_notification_id,
        r.tenant_id as receipt_tenant_id,
        r.status as receipt_status,
        r.retry_sec as receipt_retry_sec,
        r.expire_at as receipt_expire_at,
        r.acked_at as receipt_acked_at,
        r.acked_by_installation_id as receipt_acked_by_installation_id,
        r.acked_by_user_id as receipt_acked_by_user_id,
        r.created_at as receipt_created_at,
        r.updated_at as receipt_updated_at,
        r.cancelled_at as receipt_cancelled_at
      FROM deliveries d
      JOIN notifications n ON n.id = d.notification_id
      LEFT JOIN receipts r ON r.notification_id = n.id
      WHERE d.tenant_id = ? AND d.installation_id = ?
      ORDER BY d.created_at DESC
      LIMIT ?
    `).all(tenantId, installationId, limit) as Array<Record<string, unknown>>;
    return rows.map((row) => {
      const delivery = serializeDelivery({
        id: String(row.delivery_id),
        notification_id: String(row.delivery_notification_id),
        tenant_id: String(row.delivery_tenant_id),
        user_id: String(row.delivery_user_id),
        installation_id: String(row.delivery_installation_id),
        client_app_id: String(row.delivery_client_app_id),
        state: row.delivery_state as DeliveryRecord["state"],
        provider: row.delivery_provider as DeliveryRecord["provider"],
        provider_message_id: row.delivery_provider_message_id as string | null,
        created_at: String(row.delivery_created_at),
        updated_at: String(row.delivery_updated_at),
        read_at: row.delivery_read_at as string | null,
        acked_at: row.delivery_acked_at as string | null,
        cancelled_at: row.delivery_cancelled_at as string | null,
        expired_at: row.delivery_expired_at as string | null,
        last_attempt_at: row.delivery_last_attempt_at as string | null,
      });
      const notification = serializeNotification({
        id: String(row.notification_id),
        tenant_id: String(row.notification_tenant_id),
        source_app_id: String(row.notification_source_app_id),
        idempotency_key: row.notification_idempotency_key as string | null,
        priority: row.notification_priority as NotificationPriority,
        delivery_mode: row.notification_delivery_mode as NotificationDeliveryMode,
        status: row.notification_status as "active" | "cancelled",
        title: row.notification_title as string | null,
        body: row.notification_body as string | null,
        data_json: row.notification_data_json as string | null,
        context_json: String(row.notification_context_json),
        deep_link_json: row.notification_deep_link_json as string | null,
        target_client_app_id: row.notification_target_client_app_id as string | null,
        receipt_policy_json: String(row.notification_receipt_policy_json),
        created_at: String(row.notification_created_at),
        updated_at: String(row.notification_updated_at),
        cancelled_at: row.notification_cancelled_at as string | null,
      });
      const receipt = row.receipt_id
        ? serializeReceipt({
          id: String(row.receipt_id),
          notification_id: String(row.receipt_notification_id),
          tenant_id: String(row.receipt_tenant_id),
          status: row.receipt_status as ReceiptRecord["status"],
          retry_sec: Number(row.receipt_retry_sec),
          expire_at: String(row.receipt_expire_at),
          acked_at: row.receipt_acked_at as string | null,
          acked_by_installation_id: row.receipt_acked_by_installation_id as string | null,
          acked_by_user_id: row.receipt_acked_by_user_id as string | null,
          created_at: String(row.receipt_created_at),
          updated_at: String(row.receipt_updated_at),
          cancelled_at: row.receipt_cancelled_at as string | null,
        })
        : null;
      return { delivery, notification, receipt };
    });
  }

  listFeedForUser(tenantId: string, userId: string, limit = 100): Array<{
    delivery: DeliveryRecord;
    notification: NotificationRecord;
    receipt: ReceiptRecord | null;
  }> {
    this.expirePendingReceipts();
    const rows = this.sqlite.prepare(`
      SELECT
        d.id as delivery_id,
        d.notification_id as delivery_notification_id,
        d.tenant_id as delivery_tenant_id,
        d.user_id as delivery_user_id,
        d.installation_id as delivery_installation_id,
        d.client_app_id as delivery_client_app_id,
        d.state as delivery_state,
        d.provider as delivery_provider,
        d.provider_message_id as delivery_provider_message_id,
        d.created_at as delivery_created_at,
        d.updated_at as delivery_updated_at,
        d.read_at as delivery_read_at,
        d.acked_at as delivery_acked_at,
        d.cancelled_at as delivery_cancelled_at,
        d.expired_at as delivery_expired_at,
        d.last_attempt_at as delivery_last_attempt_at,
        n.id as notification_id,
        n.tenant_id as notification_tenant_id,
        n.source_app_id as notification_source_app_id,
        n.idempotency_key as notification_idempotency_key,
        n.priority as notification_priority,
        n.delivery_mode as notification_delivery_mode,
        n.status as notification_status,
        n.title as notification_title,
        n.body as notification_body,
        n.data_json as notification_data_json,
        n.context_json as notification_context_json,
        n.deep_link_json as notification_deep_link_json,
        n.target_client_app_id as notification_target_client_app_id,
        n.receipt_policy_json as notification_receipt_policy_json,
        n.created_at as notification_created_at,
        n.updated_at as notification_updated_at,
        n.cancelled_at as notification_cancelled_at,
        r.id as receipt_id,
        r.notification_id as receipt_notification_id,
        r.tenant_id as receipt_tenant_id,
        r.status as receipt_status,
        r.retry_sec as receipt_retry_sec,
        r.expire_at as receipt_expire_at,
        r.acked_at as receipt_acked_at,
        r.acked_by_installation_id as receipt_acked_by_installation_id,
        r.acked_by_user_id as receipt_acked_by_user_id,
        r.created_at as receipt_created_at,
        r.updated_at as receipt_updated_at,
        r.cancelled_at as receipt_cancelled_at
      FROM deliveries d
      JOIN notifications n ON n.id = d.notification_id
      LEFT JOIN receipts r ON r.notification_id = n.id
      WHERE d.tenant_id = ? AND d.user_id = ?
      ORDER BY d.created_at DESC
      LIMIT ?
    `).all(tenantId, userId, limit) as Array<Record<string, unknown>>;
    return rows.map((row) => {
      const delivery = serializeDelivery({
        id: String(row.delivery_id),
        notification_id: String(row.delivery_notification_id),
        tenant_id: String(row.delivery_tenant_id),
        user_id: String(row.delivery_user_id),
        installation_id: String(row.delivery_installation_id),
        client_app_id: String(row.delivery_client_app_id),
        state: row.delivery_state as DeliveryRecord["state"],
        provider: row.delivery_provider as DeliveryRecord["provider"],
        provider_message_id: row.delivery_provider_message_id as string | null,
        created_at: String(row.delivery_created_at),
        updated_at: String(row.delivery_updated_at),
        read_at: row.delivery_read_at as string | null,
        acked_at: row.delivery_acked_at as string | null,
        cancelled_at: row.delivery_cancelled_at as string | null,
        expired_at: row.delivery_expired_at as string | null,
        last_attempt_at: row.delivery_last_attempt_at as string | null,
      });
      const notification = serializeNotification({
        id: String(row.notification_id),
        tenant_id: String(row.notification_tenant_id),
        source_app_id: String(row.notification_source_app_id),
        idempotency_key: row.notification_idempotency_key as string | null,
        priority: row.notification_priority as NotificationPriority,
        delivery_mode: row.notification_delivery_mode as NotificationDeliveryMode,
        status: row.notification_status as "active" | "cancelled",
        title: row.notification_title as string | null,
        body: row.notification_body as string | null,
        data_json: row.notification_data_json as string | null,
        context_json: String(row.notification_context_json),
        deep_link_json: row.notification_deep_link_json as string | null,
        target_client_app_id: row.notification_target_client_app_id as string | null,
        receipt_policy_json: String(row.notification_receipt_policy_json),
        created_at: String(row.notification_created_at),
        updated_at: String(row.notification_updated_at),
        cancelled_at: row.notification_cancelled_at as string | null,
      });
      const receipt = row.receipt_id
        ? serializeReceipt({
          id: String(row.receipt_id),
          notification_id: String(row.receipt_notification_id),
          tenant_id: String(row.receipt_tenant_id),
          status: row.receipt_status as ReceiptRecord["status"],
          retry_sec: Number(row.receipt_retry_sec),
          expire_at: String(row.receipt_expire_at),
          acked_at: row.receipt_acked_at as string | null,
          acked_by_installation_id: row.receipt_acked_by_installation_id as string | null,
          acked_by_user_id: row.receipt_acked_by_user_id as string | null,
          created_at: String(row.receipt_created_at),
          updated_at: String(row.receipt_updated_at),
          cancelled_at: row.receipt_cancelled_at as string | null,
        })
        : null;
      return { delivery, notification, receipt };
    });
  }

  getMetricsSummary(tenantId: string): {
    sourceApps: number;
    clientApps: number;
    installations: number;
    subscriptions: number;
    notifications: number;
    deliveries: number;
    pendingReceipts: number;
    failedDeliveries: number;
  } {
    this.expirePendingReceipts();
    const single = (sql: string) =>
      Number((this.sqlite.prepare(sql).get(tenantId) as { count: number } | undefined)?.count ?? 0);
    return {
      sourceApps: single(`SELECT COUNT(*) as count FROM source_apps WHERE tenant_id = ?`),
      clientApps: single(`SELECT COUNT(*) as count FROM client_apps WHERE tenant_id = ?`),
      installations: single(`SELECT COUNT(*) as count FROM device_installations WHERE tenant_id = ? AND revoked_at IS NULL`),
      subscriptions: single(`SELECT COUNT(*) as count FROM subscriptions WHERE tenant_id = ?`),
      notifications: single(`SELECT COUNT(*) as count FROM notifications WHERE tenant_id = ?`),
      deliveries: single(`SELECT COUNT(*) as count FROM deliveries WHERE tenant_id = ?`),
      pendingReceipts: single(`SELECT COUNT(*) as count FROM receipts WHERE tenant_id = ? AND status = 'pending'`),
      failedDeliveries: single(`SELECT COUNT(*) as count FROM deliveries WHERE tenant_id = ? AND state = 'failed'`),
    };
  }
}

function matchesSubscription(
  subscription: SubscriptionRecord,
  input: {
    sourceAppId: string;
    context: NotificationContext;
    priority: NotificationPriority;
  },
): boolean {
  if (subscription.sourceAppId && subscription.sourceAppId !== input.sourceAppId) return false;
  if (subscription.projectId && subscription.projectId !== input.context.projectId) return false;
  if (subscription.agentId && subscription.agentId !== input.context.agentId) return false;
  if (subscription.workspaceId && subscription.workspaceId !== input.context.workspaceId) return false;
  if (subscription.eventType && subscription.eventType !== input.context.eventType) return false;
  if (subscription.severity && subscription.severity !== input.context.severity) return false;
  if (subscription.minPriority && priorityRank(input.priority) < priorityRank(subscription.minPriority)) return false;
  return true;
}

export function resolveAudienceInstallations(input: {
  tenantId: string;
  sourceAppId: string;
  audience: NotificationAudience | undefined;
  context: NotificationContext;
  priority: NotificationPriority;
  targetClientAppId?: string | null;
  store: NotifyServiceStore;
}): DeviceInstallation[] {
  const explicitUserIds = [...new Set(input.audience?.userIds?.filter(Boolean) ?? [])];
  const explicitInstallationIds = [...new Set(input.audience?.installationIds?.filter(Boolean) ?? [])];
  const useSubscriptions = input.audience?.useSubscriptions ?? (explicitUserIds.length === 0 && explicitInstallationIds.length === 0);

  const byInstallation = new Map<string, DeviceInstallation>();
  const directInstallations = input.store.listInstallationsByIds(input.tenantId, explicitInstallationIds);
  for (const installation of directInstallations) {
    byInstallation.set(installation.id, installation);
  }

  const userTargets = new Map<string, string | null>();
  for (const userId of explicitUserIds) {
    userTargets.set(userId, input.targetClientAppId ?? null);
  }

  const subscriptions = useSubscriptions ? input.store.listSubscriptionsForTenant(input.tenantId) : [];
  const muteRules = subscriptions.filter((subscription) =>
    matchesSubscription(subscription, {
      sourceAppId: input.sourceAppId,
      context: input.context,
      priority: input.priority,
    }) && subscription.action === "mute"
  );
  for (const subscription of subscriptions) {
    if (!matchesSubscription(subscription, {
      sourceAppId: input.sourceAppId,
      context: input.context,
      priority: input.priority,
    })) {
      continue;
    }
    if (subscription.action !== "allow") continue;
    if (subscription.installationId) {
      const installation = input.store.listInstallationsByIds(input.tenantId, [subscription.installationId])[0];
      if (installation) byInstallation.set(installation.id, installation);
      continue;
    }
    userTargets.set(subscription.userId, subscription.clientAppId ?? input.targetClientAppId ?? null);
  }

  const expanded = input.store.listActiveInstallationsForUsers(input.tenantId, [...userTargets.keys()]);
  for (const installation of expanded) {
    const scopedClientAppId = userTargets.get(installation.userId) ?? null;
    if (input.targetClientAppId && installation.clientAppId !== input.targetClientAppId) continue;
    if (scopedClientAppId && installation.clientAppId !== scopedClientAppId) continue;
    byInstallation.set(installation.id, installation);
  }

  const filtered = [...byInstallation.values()].filter((installation) => {
    for (const mute of muteRules) {
      if (mute.installationId) {
        if (mute.installationId === installation.id) return false;
        continue;
      }
      if (mute.userId !== installation.userId) continue;
      if (mute.clientAppId && mute.clientAppId !== installation.clientAppId) continue;
      return false;
    }
    const preferences = input.store.getUserPreferences(input.tenantId, installation.userId);
    if (preferences.criticalOnly && input.priority !== "critical") {
      return false;
    }
    if (quietHoursActive(preferences.quietHours) && !(input.priority === "critical" && preferences.quietHours?.allowCritical)) {
      return false;
    }
    return true;
  });

  return filtered.sort((left, right) => left.id.localeCompare(right.id));
}
