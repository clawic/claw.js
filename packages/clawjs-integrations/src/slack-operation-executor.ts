import type {
  ConnectorRuntimeRequestPlan,
} from "./runtime-registry.ts";
import type {
  ConnectorOperationDefinition,
  IntegrationJson,
} from "./types.ts";

export const SLACK_APP_ID = "slack";

export type SlackRuntimeOperation = "send-message" | "list-channels" | "get-channel";

export function isSlackActionOperationSupported(operationId: string): boolean {
  return slackRuntimeOperation(operationId) !== null;
}

export function buildSlackOperationRequest(
  operation: ConnectorOperationDefinition,
  values: Record<string, IntegrationJson>,
): ConnectorRuntimeRequestPlan {
  const runtimeOperation = slackRuntimeOperation(operation.id);
  if (!runtimeOperation) {
    throw new Error(`Unsupported Slack operation: ${operation.id}`);
  }
  const auth = operation.authFieldNames.map((field) => ({
    type: "secret" as const,
    field,
    placement: "bearer" as const,
  }));
  switch (runtimeOperation) {
    case "send-message":
      return {
        method: "POST",
        endpoint: "chat.postMessage",
        auth,
        headers: {
          accept: "application/json",
        },
        body: removeEmptyValues({
          channel: firstString(values.channel, values.channelId),
          text: values.text,
          thread_ts: firstString(values.threadTs, values.thread_ts),
          mrkdwn: values.mrkdwn,
        }),
        responseSchema: {
          type: "object",
          requiredPaths: ["ok", "channel", "ts"],
        },
      };
    case "list-channels":
      return {
        method: "GET",
        endpoint: "conversations.list",
        auth,
        headers: {
          accept: "application/json",
        },
        query: removeEmptyValues({
          types: values.types ?? "public_channel,private_channel",
          limit: values.limit ?? 200,
          cursor: values.cursor,
          exclude_archived: values.excludeArchived ?? true,
        }),
        body: {},
        pagination: {
          mode: "cursor",
          itemsPath: "channels",
          nextCursorPath: "response_metadata.next_cursor",
          cursorParam: "cursor",
          limitParam: "limit",
          pageSize: numberValue(values.limit) ?? 200,
        },
        responseSchema: {
          type: "object",
          requiredPaths: ["ok", "channels"],
        },
      };
    case "get-channel":
      return {
        method: "GET",
        endpoint: "conversations.info",
        auth,
        headers: {
          accept: "application/json",
        },
        query: removeEmptyValues({
          channel: firstString(values.channel, values.channelId),
        }),
        body: {},
        responseSchema: {
          type: "object",
          requiredPaths: ["ok", "channel"],
        },
      };
  }
}

function slackRuntimeOperation(operationId: string): SlackRuntimeOperation | null {
  const slug = operationId.split(".").at(-1);
  if (slug === "send-message" || slug === "send-text-message") return "send-message";
  if (slug === "list-channels") return "list-channels";
  if (slug === "get-channel" || slug === "channel-info") return "get-channel";
  return null;
}

function firstString(...values: IntegrationJson[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function numberValue(value: IntegrationJson): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function removeEmptyValues(input: Record<string, IntegrationJson | undefined>): Record<string, IntegrationJson> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== ""),
  ) as Record<string, IntegrationJson>;
}
