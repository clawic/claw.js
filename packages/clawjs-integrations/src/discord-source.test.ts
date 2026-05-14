import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeConnectorCatalog } from "./catalog.ts";
import {
  verifyConnectorRuntimeCoverage,
  verifyConnectorRuntimeOfflineExecutions,
} from "./runtime-coverage.ts";
import {
  handleConnectorRuntimeWebhook,
} from "./runtime-webhook.ts";
import {
  buildDiscordSourcePlan,
} from "./discord-source.ts";

const DISCORD_SOURCE_OPERATIONS = [
  source("discord.source.event", "Event"),
  source("discord.source.application-authorized", "Application Authorized", "timestamp"),
  source("discord.source.application-deauthorized", "Application Deauthorized", "timestamp"),
  source("discord.source.entitlement-create", "Entitlement Create", "timestamp"),
  source("discord.source.entitlement-update", "Entitlement Update", "timestamp"),
  source("discord.source.entitlement-delete", "Entitlement Delete", "timestamp"),
  source("discord.source.lobby-message-create", "Lobby Message Create", "timestamp"),
  source("discord.source.lobby-message-update", "Lobby Message Update", "timestamp"),
  source("discord.source.lobby-message-delete", "Lobby Message Delete", "timestamp"),
  source("discord.source.game-direct-message-create", "Game Direct Message Create", "timestamp"),
  source("discord.source.game-direct-message-update", "Game Direct Message Update", "timestamp"),
  source("discord.source.game-direct-message-delete", "Game Direct Message Delete", "timestamp"),
  source("discord.source.channel-create", "Channel Create"),
  source("discord.source.channel-update", "Channel Update"),
  source("discord.source.channel-delete", "Channel Delete"),
  source("discord.source.channel-pins-update", "Channel Pins Update"),
  source("discord.source.message-create", "Message Create"),
  source("discord.source.message-update", "Message Update"),
  source("discord.source.message-delete", "Message Delete"),
  source("discord.source.message-delete-bulk", "Message Delete Bulk"),
  source("discord.source.message-reaction-add", "Message Reaction Add"),
  source("discord.source.message-reaction-remove", "Message Reaction Remove"),
  source("discord.source.message-reaction-remove-all", "Message Reaction Remove All"),
  source("discord.source.message-reaction-remove-emoji", "Message Reaction Remove Emoji"),
  source("discord.source.typing-start", "Typing Start"),
  source("discord.source.message-poll-vote-add", "Message Poll Vote Add"),
  source("discord.source.message-poll-vote-remove", "Message Poll Vote Remove"),
  source("discord.source.guild-create", "Guild Create"),
  source("discord.source.guild-update", "Guild Update"),
  source("discord.source.guild-delete", "Guild Delete"),
  source("discord.source.guild-audit-log-entry-create", "Guild Audit Log Entry Create"),
  source("discord.source.guild-ban-add", "Guild Ban Add"),
  source("discord.source.guild-ban-remove", "Guild Ban Remove"),
  source("discord.source.guild-integrations-update", "Guild Integrations Update"),
  source("discord.source.integration-create", "Integration Create"),
  source("discord.source.integration-update", "Integration Update"),
  source("discord.source.integration-delete", "Integration Delete"),
  source("discord.source.webhooks-update", "Webhooks Update"),
  source("discord.source.invite-create", "Invite Create"),
  source("discord.source.invite-delete", "Invite Delete"),
  source("discord.source.application-command-permissions-update", "Application Command Permissions Update"),
  source("discord.source.auto-moderation-rule-create", "Auto Moderation Rule Create"),
  source("discord.source.auto-moderation-rule-update", "Auto Moderation Rule Update"),
  source("discord.source.auto-moderation-rule-delete", "Auto Moderation Rule Delete"),
  source("discord.source.auto-moderation-action-execution", "Auto Moderation Action Execution"),
  source("discord.source.guild-emojis-update", "Guild Emojis Update"),
  source("discord.source.guild-stickers-update", "Guild Stickers Update"),
  source("discord.source.guild-member-add", "Guild Member Add"),
  source("discord.source.guild-member-remove", "Guild Member Remove"),
  source("discord.source.guild-member-update", "Guild Member Update"),
  source("discord.source.guild-members-chunk", "Guild Members Chunk"),
  source("discord.source.guild-role-create", "Guild Role Create"),
  source("discord.source.guild-role-update", "Guild Role Update"),
  source("discord.source.guild-role-delete", "Guild Role Delete"),
  source("discord.source.guild-scheduled-event-create", "Guild Scheduled Event Create"),
  source("discord.source.guild-scheduled-event-update", "Guild Scheduled Event Update"),
  source("discord.source.guild-scheduled-event-delete", "Guild Scheduled Event Delete"),
  source("discord.source.guild-soundboard-sound-create", "Guild Soundboard Sound Create"),
  source("discord.source.guild-soundboard-sound-update", "Guild Soundboard Sound Update"),
  source("discord.source.guild-soundboard-sound-delete", "Guild Soundboard Sound Delete"),
  source("discord.source.guild-soundboard-sounds-update", "Guild Soundboard Sounds Update"),
  source("discord.source.soundboard-sounds", "Soundboard Sounds"),
  source("discord.source.voice-channel-effect-send", "Voice Channel Effect Send"),
  source("discord.source.stage-instance-create", "Stage Instance Create"),
  source("discord.source.stage-instance-update", "Stage Instance Update"),
  source("discord.source.stage-instance-delete", "Stage Instance Delete"),
  source("discord.source.interaction-create", "Interaction Create"),
  source("discord.source.thread-create", "Thread Create"),
  source("discord.source.thread-update", "Thread Update"),
  source("discord.source.thread-delete", "Thread Delete"),
  source("discord.source.thread-list-sync", "Thread List Sync"),
  source("discord.source.thread-member-update", "Thread Member Update"),
  source("discord.source.thread-members-update", "Thread Members Update"),
  source("discord.source.reaction-add", "Reaction Add"),
];

const DISCORD_SOURCE_CATALOG = normalizeConnectorCatalog({
  version: 1,
  apps: [{
    id: "discord",
    name: "Discord",
    authFieldNames: [],
    fields: [],
    operations: DISCORD_SOURCE_OPERATIONS,
  }],
});

describe("discord event sources", () => {
  it("builds Discord event source plans", () => {
    assert.deepEqual(buildDiscordSourcePlan(operation("discord.source.message-create")), {
      delivery: "webhook",
      dedupe: "id",
      hooks: [],
    });
    assert.deepEqual(buildDiscordSourcePlan(operation("discord.source.application-authorized")), {
      delivery: "webhook",
      dedupe: "timestamp",
      hooks: [],
      eventsPath: "event",
    });
  });

  it("extracts Discord event payloads as source events", () => {
    const result = handleConnectorRuntimeWebhook({
      operation: operation("discord.source.interaction-create"),
      payload: {
        id: "interaction-sample",
        type: 2,
        application_id: "app-sample",
        guild_id: "guild-sample",
        channel_id: "channel-sample",
        data: {
          id: "command-sample",
          name: "sample",
        },
      },
    });
    assert.deepEqual(result.events, [{
      id: "interaction-sample",
      type: 2,
      application_id: "app-sample",
      guild_id: "guild-sample",
      channel_id: "channel-sample",
      data: {
        id: "command-sample",
        name: "sample",
      },
    }]);

    const webhookResult = handleConnectorRuntimeWebhook({
      operation: operation("discord.source.application-authorized"),
      payload: {
        version: 1,
        application_id: "app-sample",
        type: 1,
        event: {
          type: "APPLICATION_AUTHORIZED",
          timestamp: "2026-01-01T00:00:00.000000",
          data: {
            integration_type: 1,
            scopes: ["applications.commands"],
            user: {
              id: "user-sample",
              username: "sample",
            },
          },
        },
      },
    });
    assert.deepEqual(webhookResult.events, [{
      type: "APPLICATION_AUTHORIZED",
      timestamp: "2026-01-01T00:00:00.000000",
      data: {
        integration_type: 1,
        scopes: ["applications.commands"],
        user: {
          id: "user-sample",
          username: "sample",
        },
      },
    }]);
  });

  it("covers Discord event sources with operation-scoped offline fixtures", async () => {
    const coverage = verifyConnectorRuntimeCoverage(DISCORD_SOURCE_CATALOG);
    assert.equal(coverage.summary.missing, 0);
    assert.equal(coverage.summary.implemented, DISCORD_SOURCE_OPERATIONS.length);

    const offline = await verifyConnectorRuntimeOfflineExecutions(DISCORD_SOURCE_CATALOG);
    assert.deepEqual(
      offline.results.map((result) => result.operationId).sort(),
      DISCORD_SOURCE_OPERATIONS.map((operation) => operation.id).sort(),
    );
  });
});

function operation(operationId: string) {
  const found = DISCORD_SOURCE_CATALOG.apps[0]?.operations.find((candidate) => candidate.id === operationId);
  assert.ok(found);
  return found;
}

function source(id: string, name: string, dedupe = "id") {
  return {
    id,
    appId: "discord",
    kind: "source" as const,
    name,
    fields: [],
    authFieldNames: [],
    runtime: {
      hasRun: false,
      hasHooks: false,
      hasAdditionalProps: false,
      hasMethods: false,
      dedupe,
    },
    source: {
      delivery: "webhook" as const,
      usesTimer: false,
      usesHttp: true,
      usesServiceDb: false,
    },
  };
}
