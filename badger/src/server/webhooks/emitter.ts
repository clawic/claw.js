import crypto from "node:crypto";

import type { CanonicalEvent } from "../../shared/types.ts";
import { prefixedId } from "../../shared/ids.ts";
import type { VaultClient } from "../vault/client.ts";
import type { WebhooksService } from "../domain/webhooks.ts";
import type { JobsService } from "../domain/jobs.ts";
import type { RealtimeBus } from "../realtime/ws.ts";

interface EventInput {
  workspaceId: string;
  name: string;
  data: Record<string, unknown>;
  previous_data?: Record<string, unknown>;
  actor?: { kind: "user" | "token" | "system"; id?: string };
}

export class EventBus {
  constructor(
    private readonly webhooks: WebhooksService,
    private readonly jobs: JobsService,
    private readonly vault: VaultClient,
    private readonly realtime: RealtimeBus,
  ) {}

  emit(input: EventInput): CanonicalEvent {
    const event: CanonicalEvent = {
      id: prefixedId("evt"),
      name: input.name,
      workspace_id: input.workspaceId,
      occurred_at: new Date().toISOString(),
      actor: input.actor ?? { kind: "system" },
      data: input.data,
      ...(input.previous_data ? { previous_data: input.previous_data } : {}),
    };
    this.realtime.emit(event);
    const subscribers = this.webhooks.activeForEvent(input.workspaceId, input.name);
    for (const sub of subscribers) {
      this.jobs.enqueue({
        workspaceId: input.workspaceId,
        kind: "webhook_deliver",
        payload: { webhook_id: sub.id, event: event as unknown as Record<string, unknown> },
        maxAttempts: sub.max_attempts,
      });
    }
    return event;
  }

  async deliver(payload: { webhook_id: string; event: CanonicalEvent; workspaceId: string }, attempt: number): Promise<{ ok: boolean; status?: number; body?: string; nextRetryAt?: number }> {
    const hook = this.webhooks.get(payload.workspaceId, payload.webhook_id);
    if (!hook) return { ok: true }; // hook gone, drop
    if (hook.status !== "active") return { ok: true };
    const secret = (await this.vault.get(hook.secret_vault_ref)) ?? "";
    const ts = Math.floor(Date.now() / 1000);
    const body = JSON.stringify(payload.event);
    const sig = crypto.createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
    const headers: Record<string, string> = {
      "content-type": hook.content_type,
      "x-badger-signature": `t=${ts},v1=${sig}`,
      "x-badger-event": payload.event.name,
      "x-badger-attempt": String(attempt),
    };
    let response: Response;
    try {
      response = await fetch(hook.callback_url, {
        method: hook.http_method,
        headers,
        body,
      });
    } catch (err) {
      this.webhooks.recordDelivery({
        webhookId: hook.id,
        eventName: payload.event.name,
        eventId: payload.event.id,
        payload: payload.event as unknown as Record<string, unknown>,
        attempt,
        requestHeaders: headers,
        failedAt: Date.now(),
        responseBody: (err as Error).message,
      });
      return { ok: false };
    }
    const respText = await response.text();
    const ok = response.ok;
    this.webhooks.recordDelivery({
      webhookId: hook.id,
      eventName: payload.event.name,
      eventId: payload.event.id,
      payload: payload.event as unknown as Record<string, unknown>,
      attempt,
      requestHeaders: headers,
      responseStatus: response.status,
      responseHeaders: headersToRecord(response.headers),
      responseBody: respText.slice(0, 4000),
      deliveredAt: ok ? Date.now() : null,
      failedAt: ok ? null : Date.now(),
    });
    return { ok, status: response.status, body: respText };
  }
}

function headersToRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}
