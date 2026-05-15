export type NotificationDeliveryMode = "alert" | "silent" | "glance";
export type NotificationPriority = "passive" | "normal" | "time-sensitive" | "critical";
export type DeliveryState = "queued" | "delivered" | "read" | "acked" | "cancelled" | "expired" | "failed";
export type SubscriptionAction = "allow" | "mute";
export type ClientPlatform = "ios" | "android";

export interface NotificationContext {
  tenantId: string;
  projectId?: string;
  agentId?: string;
  workspaceId?: string;
  sessionId?: string;
  automationId?: string;
  eventType?: string;
  severity?: string;
}

export interface NotificationAudience {
  userIds?: string[];
  installationIds?: string[];
  useSubscriptions?: boolean;
}

export interface NotificationDeepLink {
  targetClientAppId?: string;
  route?: string;
  params?: Record<string, string>;
  fallbackUrl?: string;
}

export interface NotificationReceiptPolicy {
  kind: "none" | "critical";
  retrySec?: number;
  expireSec?: number;
}

export interface QuietHoursPolicy {
  enabled: boolean;
  timeZone: string;
  startMinute: number;
  endMinute: number;
  allowCritical?: boolean;
}

export interface UserNotificationPreferences {
  tenantId: string;
  userId: string;
  criticalOnly: boolean;
  quietHours?: QuietHoursPolicy | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionFilter {
  sourceAppId?: string;
  clientAppId?: string;
  projectId?: string;
  agentId?: string;
  workspaceId?: string;
  eventType?: string;
  severity?: string;
  minPriority?: NotificationPriority;
  action?: SubscriptionAction;
}

export interface DeviceInstallation {
  id: string;
  tenantId: string;
  userId: string;
  clientAppId: string;
  platform: ClientPlatform;
  deviceName: string;
  pushToken: string | null;
  pushTokenUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string | null;
}

export interface SourceAppRecord {
  id: string;
  tenantId: string;
  displayName: string;
  description?: string;
  iconUrl?: string;
  defaults?: Record<string, unknown>;
  deepLinkTemplate?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ClientAppRecord {
  id: string;
  tenantId: string;
  displayName: string;
  platform: ClientPlatform;
  bundleId: string;
  credentials?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionRecord extends SubscriptionFilter {
  id: string;
  tenantId: string;
  userId: string;
  installationId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationRecord {
  id: string;
  tenantId: string;
  sourceAppId: string;
  idempotencyKey?: string | null;
  priority: NotificationPriority;
  deliveryMode: NotificationDeliveryMode;
  status: "active" | "cancelled";
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  context: NotificationContext;
  deepLink?: NotificationDeepLink;
  targetClientAppId?: string | null;
  receiptPolicy: NotificationReceiptPolicy;
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string | null;
}

export interface DeliveryRecord {
  id: string;
  notificationId: string;
  tenantId: string;
  userId: string;
  installationId: string;
  clientAppId: string;
  state: DeliveryState;
  provider: "apns" | "fcm";
  providerMessageId?: string | null;
  createdAt: string;
  updatedAt: string;
  readAt?: string | null;
  ackedAt?: string | null;
  cancelledAt?: string | null;
  expiredAt?: string | null;
  lastAttemptAt?: string | null;
}

export interface ReceiptRecord {
  id: string;
  notificationId: string;
  tenantId: string;
  status: "pending" | "acked" | "expired" | "cancelled";
  retrySec: number;
  expireAt: string;
  ackedAt?: string | null;
  ackedByInstallationId?: string | null;
  ackedByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string | null;
}

export interface GlanceStateRecord {
  id: string;
  tenantId: string;
  sourceAppId: string;
  scope: string;
  userId?: string | null;
  clientAppId?: string | null;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
