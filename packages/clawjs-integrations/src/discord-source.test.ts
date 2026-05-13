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
  source("discord.source.message-create", "Message Create"),
  source("discord.source.message-update", "Message Update"),
  source("discord.source.message-delete", "Message Delete"),
  source("discord.source.guild-audit-log-entry-create", "Guild Audit Log Entry Create"),
  source("discord.source.auto-moderation-rule-create", "Auto Moderation Rule Create"),
  source("discord.source.auto-moderation-rule-update", "Auto Moderation Rule Update"),
  source("discord.source.auto-moderation-rule-delete", "Auto Moderation Rule Delete"),
  source("discord.source.auto-moderation-action-execution", "Auto Moderation Action Execution"),
  source("discord.source.guild-emojis-update", "Guild Emojis Update"),
  source("discord.source.guild-stickers-update", "Guild Stickers Update"),
  source("discord.source.guild-member-add", "Guild Member Add"),
  source("discord.source.guild-member-remove", "Guild Member Remove"),
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

function source(id: string, name: string) {
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
      dedupe: "id",
    },
    source: {
      delivery: "webhook" as const,
      usesTimer: false,
      usesHttp: true,
      usesServiceDb: false,
    },
  };
}
