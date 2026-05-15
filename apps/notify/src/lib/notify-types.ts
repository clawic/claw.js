export type NotifyPriority = "passive" | "normal" | "time-sensitive" | "critical";
export type NotifyDeliveryState = "queued" | "delivered" | "read" | "acked" | "cancelled" | "expired" | "failed";

export interface NotifySourceApp {
  id: string;
  tenantId: string;
  displayName: string;
  description?: string;
  iconUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotifyClientApp {
  id: string;
  tenantId: string;
  displayName: string;
  platform: "ios" | "android";
  bundleId: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotifyInstallation {
  id: string;
  tenantId: string;
  userId: string;
  clientAppId: string;
  platform: "ios" | "android";
  deviceName: string;
  pushToken: string | null;
  pushTokenUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string | null;
}

export interface NotifySubscription {
  id: string;
  tenantId: string;
  userId: string;
  installationId?: string | null;
  sourceAppId?: string;
  clientAppId?: string;
  projectId?: string;
  agentId?: string;
  workspaceId?: string;
  eventType?: string;
  severity?: string;
  minPriority?: NotifyPriority;
  action: "allow" | "mute";
  createdAt: string;
  updatedAt: string;
}

export interface NotifyQuietHours {
  enabled: boolean;
  timeZone: string;
  startMinute: number;
  endMinute: number;
  allowCritical?: boolean;
}

export interface NotifyPreferences {
  tenantId: string;
  userId: string;
  criticalOnly: boolean;
  quietHours?: NotifyQuietHours | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotifyNotification {
  id: string;
  tenantId: string;
  sourceAppId: string;
  priority: NotifyPriority;
  deliveryMode: "alert" | "silent" | "glance";
  status: "active" | "cancelled";
  title?: string;
  body?: string;
  context: {
    tenantId: string;
    projectId?: string;
    agentId?: string;
    workspaceId?: string;
    sessionId?: string;
    automationId?: string;
    eventType?: string;
    severity?: string;
  };
  deepLink?: {
    route?: string;
    params?: Record<string, string>;
    fallbackUrl?: string;
  };
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string | null;
}

export interface NotifyDelivery {
  id: string;
  notificationId: string;
  tenantId: string;
  userId: string;
  installationId: string;
  clientAppId: string;
  state: NotifyDeliveryState;
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

export interface NotifyReceipt {
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

export interface NotifyFeedItem {
  delivery: NotifyDelivery;
  notification: NotifyNotification;
  receipt: NotifyReceipt | null;
}

export interface NotifyGlance {
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

export interface NotifyMetrics {
  sourceApps: number;
  clientApps: number;
  installations: number;
  subscriptions: number;
  notifications: number;
  deliveries: number;
  pendingReceipts: number;
  failedDeliveries: number;
}

export interface NotifyDashboardSnapshot {
  tenantId: string;
  userId: string;
  metrics: NotifyMetrics;
  sourceApps: NotifySourceApp[];
  clientApps: NotifyClientApp[];
  installations: NotifyInstallation[];
  preferences: NotifyPreferences;
  subscriptions: NotifySubscription[];
  feed: NotifyFeedItem[];
  notifications: NotifyNotification[];
  deliveries: NotifyDelivery[];
  glances: NotifyGlance[];
}
