import type {
  ConnectorRuntimeRequestPlan,
} from "./runtime-registry.ts";
import type {
  ConnectorOperationDefinition,
  IntegrationJson,
} from "./types.ts";

export type DiscordRuntimeOperation = "get-channel" | "list-guild-channels" | "send-message";

export function isDiscordActionOperationSupported(operationId: string): boolean {
  return discordRuntimeOperation(operationId) !== null;
}

export function buildDiscordOperationRequest(
  operation: ConnectorOperationDefinition,
  values: Record<string, IntegrationJson>,
): ConnectorRuntimeRequestPlan {
  const runtimeOperation = discordRuntimeOperation(operation.id);
  if (!runtimeOperation) {
    throw new Error(`Unsupported Discord operation: ${operation.id}`);
  }
  const auth = operation.authFieldNames.map((field) => ({
    type: "secret" as const,
    field,
    placement: "bearer" as const,
    prefix: "Bot",
  }));
  const headers = { accept: "application/json" };

  switch (runtimeOperation) {
    case "get-channel":
      return {
        method: "GET",
        endpoint: `channels/${pathSegment(requiredString(firstValue(values.channelId, values.channel), "channelId"))}`,
        auth,
        headers,
        body: {},
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "type"],
        },
      };
    case "list-guild-channels":
      return {
        method: "GET",
        endpoint: `guilds/${pathSegment(requiredString(firstValue(values.guildId, values.guild), "guildId"))}/channels`,
        auth,
        headers,
        body: {},
        responseSchema: {
          type: "array",
        },
      };
    case "send-message":
      return {
        method: "POST",
        endpoint: `channels/${pathSegment(requiredString(firstValue(values.channelId, values.channel), "channelId"))}/messages`,
        auth,
        headers,
        body: removeEmptyValues({
          content: requiredString(values.content ?? values.text, "content"),
          tts: values.tts,
          message_reference: messageReference(values),
        }),
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "channel_id"],
        },
      };
  }
}

function discordRuntimeOperation(operationId: string): DiscordRuntimeOperation | null {
  const slug = operationId.split(".").at(-1);
  if (slug === "get-channel" || slug === "channel-info") return "get-channel";
  if (slug === "list-guild-channels" || slug === "list-channels") return "list-guild-channels";
  if (slug === "send-message" || slug === "send-channel-message") return "send-message";
  return null;
}

function messageReference(values: Record<string, IntegrationJson>): IntegrationJson | undefined {
  const messageId = optionalString(firstValue(values.messageId, values.replyToMessageId));
  if (!messageId) return undefined;
  return removeEmptyValues({
    message_id: messageId,
    channel_id: optionalString(firstValue(values.referenceChannelId, values.channelId, values.channel)),
    guild_id: optionalString(firstValue(values.guildId, values.guild)),
    fail_if_not_exists: values.failIfNotExists,
  });
}

function firstValue(...values: IntegrationJson[]): IntegrationJson {
  return values.find((value) => value != null && value !== "") ?? null;
}

function requiredString(value: IntegrationJson, name: string): string {
  const parsed = optionalString(value);
  if (!parsed) throw new Error(`Discord ${name} is required`);
  return parsed;
}

function optionalString(value: IntegrationJson): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function pathSegment(value: string): string {
  return encodeURIComponent(value);
}

function removeEmptyValues(input: Record<string, IntegrationJson | undefined>): Record<string, IntegrationJson> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== ""),
  ) as Record<string, IntegrationJson>;
}
