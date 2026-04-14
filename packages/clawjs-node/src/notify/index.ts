export type {
  DeliveryState,
  DeviceInstallation,
  NotificationAudience,
  NotificationContext,
  NotificationDeepLink,
  NotificationDeliveryMode,
  NotificationPriority,
  NotificationReceiptPolicy,
  SubscriptionFilter,
} from "@clawjs/core";

import type {
  DeviceInstallation,
  NotificationAudience,
  NotificationContext,
  NotificationDeepLink,
  NotificationDeliveryMode,
  NotificationPriority,
  NotificationReceiptPolicy,
  SubscriptionFilter,
} from "@clawjs/core";

export interface NotifyClientOptions {
  baseUrl: string;
  token?: string;
}

export interface SendNotificationInput {
  idempotencyKey?: string;
  priority?: NotificationPriority;
  audience?: NotificationAudience;
  context: NotificationContext;
  delivery?: {
    mode?: NotificationDeliveryMode;
    title?: string;
    body?: string;
    data?: Record<string, unknown>;
    deepLink?: NotificationDeepLink;
    targetClientAppId?: string;
  };
  receiptPolicy?: NotificationReceiptPolicy;
}

export interface UpsertSubscriptionInput extends SubscriptionFilter {
  id?: string;
  installationScoped?: boolean;
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

export interface UpdateUserPreferencesInput {
  criticalOnly?: boolean;
  quietHours?: QuietHoursPolicy | null;
}

export class NotifyClient {
  private readonly baseUrl: string;
  private readonly token?: string;

  constructor(options: NotifyClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (this.token) {
      headers.set("authorization", `Bearer ${this.token}`);
    }
    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    const payload = await response.json() as T & { error?: string };
    if (!response.ok) {
      throw new Error(typeof payload === "object" && payload && "error" in payload ? String(payload.error) : JSON.stringify(payload));
    }
    return payload;
  }

  async createSourceApp(input: {
    tenantId: string;
    id?: string;
    displayName: string;
    description?: string;
    iconUrl?: string;
    defaults?: Record<string, unknown>;
    deepLinkTemplate?: Record<string, unknown>;
  }) {
    return await this.request<{
      record: { id: string; tenantId: string };
      token: string;
    }>("/v1/source-apps", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async rotateSourceAppToken(sourceAppId: string) {
    return await this.request<{ sourceAppId: string; token: string }>(`/v1/source-apps/${sourceAppId}/rotate-token`, {
      method: "POST",
    });
  }

  async createClientApp(input: {
    tenantId: string;
    id?: string;
    displayName: string;
    platform: "ios" | "android";
    bundleId: string;
    credentials?: Record<string, unknown>;
  }) {
    return await this.request<{
      id: string;
      tenantId: string;
      platform: "ios" | "android";
      bundleId: string;
    }>("/v1/client-apps", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async registerInstallation(input: {
    tenantId: string;
    userId: string;
    clientAppId: string;
    deviceName: string;
    pushToken?: string;
  }) {
    return await this.request<{
      record: { id: string; tenantId: string; userId: string; clientAppId: string };
      token: string;
    }>("/v1/client/installations/register", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async send(input: SendNotificationInput) {
    return await this.request<{
      created: boolean;
      notification: { id: string };
      deliveries: Array<{ id: string; installationId: string; state: string }>;
      receipt: { id: string; status: string } | null;
    }>("/v1/notifications", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async cancel(notificationId: string) {
    return await this.request<{
      notification: { id: string; status: string };
      deliveries: Array<{ id: string; state: string }>;
    }>(`/v1/notifications/${notificationId}/cancel`, {
      method: "POST",
    });
  }

  async receipt(receiptId: string) {
    return await this.request<{
      receipt: { id: string; status: string };
      notification: { id: string } | null;
    }>(`/v1/receipts/${receiptId}`);
  }

  async feed(limit?: number) {
    const suffix = typeof limit === "number" ? `?limit=${limit}` : "";
    return await this.request<{
      installation: { id: string } | null;
      items: Array<{
        delivery: { state: string };
        notification: { id: string };
        receipt: { id: string; status: string } | null;
      }>;
      glances: Array<{ scope: string; data: Record<string, unknown> }>;
    }>(`/v1/client/feed${suffix}`);
  }

  async preferences() {
    return await this.request<{
      preferences: UserNotificationPreferences;
      subscriptions: Array<{ id: string; action: string }>;
    }>("/v1/client/preferences");
  }

  async updatePreferences(input: UpdateUserPreferencesInput) {
    return await this.request<{ preferences: UserNotificationPreferences }>("/v1/client/preferences", {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }

  async devices() {
    return await this.request<{ installations: DeviceInstallation[] }>("/v1/client/devices");
  }

  async unregisterInstallation(installationId: string) {
    return await this.request<{ ok: boolean }>(`/v1/client/installations/${installationId}/unregister`, {
      method: "POST",
    });
  }

  async glances() {
    return await this.request<{ glances: Array<{ scope: string; data: Record<string, unknown> }> }>("/v1/client/glances");
  }

  async markRead(notificationId: string) {
    return await this.request<{ delivery: { state: string } }>(`/v1/client/notifications/${notificationId}/read`, {
      method: "POST",
    });
  }

  async acknowledgeReceipt(receiptId: string) {
    return await this.request<{ receipt: { id: string; status: string } }>(`/v1/client/receipts/${receiptId}/ack`, {
      method: "POST",
    });
  }

  async updatePushToken(installationId: string, pushToken: string) {
    return await this.request<{ installation: { id: string; pushToken: string } }>(`/v1/client/installations/${installationId}/push-token`, {
      method: "POST",
      body: JSON.stringify({ pushToken }),
    });
  }

  async upsertSubscription(input: UpsertSubscriptionInput) {
    return await this.request<{ subscription: { id: string } }>("/v1/subscriptions", {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }

  async deleteSubscription(id: string) {
    return await this.request<{ ok: boolean }>(`/v1/subscriptions/${id}`, {
      method: "DELETE",
    });
  }

  async putGlance(scope: string, input: {
    tenantId?: string;
    userId?: string;
    clientAppId?: string;
    data: Record<string, unknown>;
  }) {
    return await this.request<{ glance: { id: string; scope: string } }>(`/v1/glances/${encodeURIComponent(scope)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }
}
