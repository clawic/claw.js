import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { buildDiscordOperationRequest } from "./discord-operation-executor.ts";
import { action, field, operation, GUILD_FIELD, WEBHOOK_FIELD, WEBHOOK_TOKEN_FIELD } from "./discord-operation-test-catalog.ts";

const headers = { accept: "application/json" };
const auth = [{ type: "secret" as const, field: "discordBotToken", placement: "bearer" as const, prefix: "Bot" }];
const bearerAuth = [{ type: "secret" as const, field: "discordBearerToken", placement: "bearer" as const }];

describe("discord operation request plans", () => {
  it("builds Discord command, event, and stage request plans", () => {
    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.create-guild-scheduled-event"), {
      guildId: "456",
      channelId: "123",
      name: "Launch",
      privacyLevel: 2,
      scheduledStartTime: "2026-05-13T10:00:00.000Z",
      scheduledEndTime: "2026-05-13T11:00:00.000Z",
      entityType: 2,
      description: "Release walkthrough",
      auditLogReason: "schedule release event",
    }), {
      method: "POST",
      endpoint: "guilds/456/scheduled-events",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "schedule release event",
      },
      body: {
        channel_id: "123",
        name: "Launch",
        privacy_level: 2,
        scheduled_start_time: "2026-05-13T10:00:00.000Z",
        scheduled_end_time: "2026-05-13T11:00:00.000Z",
        description: "Release walkthrough",
        entity_type: 2,
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "guild_id", "name"],
      },
    });

    const recurrenceRule = {
      start: "2026-05-13T10:00:00.000Z",
      frequency: 2,
      interval: 1,
      by_weekday: [2],
    };
    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.create-guild-scheduled-event"), {
      guildId: "456",
      name: "External launch",
      privacyLevel: 2,
      scheduledStartTime: "2026-05-13T10:00:00.000Z",
      scheduledEndTime: "2026-05-13T11:00:00.000Z",
      entityType: 3,
      entityMetadata: { location: "Online" },
      image: "data:image/png;base64,c2FtcGxl",
      recurrenceRule,
    }), {
      method: "POST",
      endpoint: "guilds/456/scheduled-events",
      auth,
      headers,
      body: {
        entity_metadata: { location: "Online" },
        name: "External launch",
        privacy_level: 2,
        scheduled_start_time: "2026-05-13T10:00:00.000Z",
        scheduled_end_time: "2026-05-13T11:00:00.000Z",
        entity_type: 3,
        image: "data:image/png;base64,c2FtcGxl",
        recurrence_rule: recurrenceRule,
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "guild_id", "name"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.update-guild-scheduled-event"), {
      guildId: "456",
      guildScheduledEventId: "event-123",
      channelId: null,
      entityMetadata: null,
      description: null,
      recurrenceRule: null,
      image: "data:image/png;base64,dXBkYXRlZA==",
      status: 2,
      auditLogReason: "reschedule event",
    }), {
      method: "PATCH",
      endpoint: "guilds/456/scheduled-events/event-123",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "reschedule event",
      },
      body: {
        channel_id: null,
        entity_metadata: null,
        description: null,
        status: 2,
        image: "data:image/png;base64,dXBkYXRlZA==",
        recurrence_rule: null,
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "guild_id", "name"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.delete-guild-scheduled-event"), {
      guildId: "456",
      guildScheduledEventId: "event-123",
    }), {
      method: "DELETE",
      endpoint: "guilds/456/scheduled-events/event-123",
      auth,
      headers,
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.list-guild-scheduled-event-users"), {
      guildId: "456",
      guildScheduledEventId: "event-123",
      limit: 50,
      withMember: true,
      before: "user-before",
      after: "user-after",
    }), {
      method: "GET",
      endpoint: "guilds/456/scheduled-events/event-123/users",
      auth,
      headers,
      query: {
        limit: 50,
        with_member: true,
        before: "user-before",
        after: "user-after",
      },
      body: {},
      responseSchema: {
        type: "array",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.create-stage-instance"), {
      channelId: "123",
      topic: "Launch room",
      privacyLevel: 2,
      sendStartNotification: true,
      guildScheduledEventId: "event-123",
      auditLogReason: "start stage",
    }), {
      method: "POST",
      endpoint: "stage-instances",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "start stage",
      },
      body: {
        channel_id: "123",
        topic: "Launch room",
        privacy_level: 2,
        send_start_notification: true,
        guild_scheduled_event_id: "event-123",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "channel_id", "topic"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.update-stage-instance"), {
      channelId: "123",
      topic: "Updated room",
      privacyLevel: 2,
      auditLogReason: "rescheduled",
    }), {
      method: "PATCH",
      endpoint: "stage-instances/123",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "rescheduled",
      },
      body: {
        topic: "Updated room",
        privacy_level: 2,
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "channel_id", "topic"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.delete-stage-instance"), {
      channelId: "123",
      auditLogReason: "close stage",
    }), {
      method: "DELETE",
      endpoint: "stage-instances/123",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "close stage",
      },
      body: {},
      responseSchema: {
        type: "null",
      },
    });
  });
});
