import type {
  ConnectorRuntimeRequestPlan,
} from "./runtime-registry.ts";
import type {
  ConnectorOperationDefinition,
  IntegrationJson,
} from "./types.ts";

export const SLACK_APP_ID = "slack";

export type SlackRuntimeOperation =
  | "send-message"
  | "update-message"
  | "delete-message"
  | "schedule-message"
  | "delete-scheduled-message"
  | "post-ephemeral"
  | "list-channels"
  | "get-channel"
  | "create-channel"
  | "rename-channel"
  | "archive-channel"
  | "unarchive-channel"
  | "invite-to-channel"
  | "kick-from-channel"
  | "join-channel"
  | "leave-channel"
  | "conversation-history"
  | "conversation-replies"
  | "conversation-members"
  | "open-conversation"
  | "list-users"
  | "get-user"
  | "get-user-presence"
  | "set-user-presence"
  | "add-reaction"
  | "remove-reaction"
  | "get-reactions"
  | "add-pin"
  | "remove-pin"
  | "list-pins"
  | "list-files"
  | "get-file"
  | "delete-file"
  | "add-reminder"
  | "list-reminders"
  | "complete-reminder"
  | "delete-reminder"
  | "search-messages"
  | "search-files"
  | "list-usergroups"
  | "enable-usergroup"
  | "disable-usergroup"
  | "list-usergroup-users"
  | "update-usergroup-users"
  | "open-view"
  | "publish-view"
  | "push-view"
  | "update-view"
  | "test-auth";

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
      return postPlan("chat.postMessage", auth, {
        channel: requiredString(firstValue(values.channel, values.channelId), "channelId"),
        text: requiredString(values.text, "text"),
        thread_ts: firstValue(values.threadTs, values.thread_ts),
        blocks: values.blocks,
        attachments: values.attachments,
        mrkdwn: values.mrkdwn,
        unfurl_links: firstValue(values.unfurlLinks, values.unfurl_links),
        unfurl_media: firstValue(values.unfurlMedia, values.unfurl_media),
      }, ["ok", "channel", "ts"]);
    case "update-message":
      return postPlan("chat.update", auth, {
        channel: requiredString(firstValue(values.channel, values.channelId), "channelId"),
        ts: requiredString(firstValue(values.ts, values.messageTs, values.message_ts), "messageTs"),
        text: values.text,
        blocks: values.blocks,
        attachments: values.attachments,
      }, ["ok", "channel", "ts"]);
    case "delete-message":
      return postPlan("chat.delete", auth, {
        channel: requiredString(firstValue(values.channel, values.channelId), "channelId"),
        ts: requiredString(firstValue(values.ts, values.messageTs, values.message_ts), "messageTs"),
      }, ["ok", "channel", "ts"]);
    case "schedule-message":
      return postPlan("chat.scheduleMessage", auth, {
        channel: requiredString(firstValue(values.channel, values.channelId), "channelId"),
        text: requiredString(values.text, "text"),
        post_at: requiredInteger(firstValue(values.postAt, values.post_at), "postAt"),
        thread_ts: firstValue(values.threadTs, values.thread_ts),
      }, ["ok", "channel", "scheduled_message_id"]);
    case "delete-scheduled-message":
      return postPlan("chat.deleteScheduledMessage", auth, {
        channel: requiredString(firstValue(values.channel, values.channelId), "channelId"),
        scheduled_message_id: requiredString(firstValue(values.scheduledMessageId, values.scheduled_message_id), "scheduledMessageId"),
      }, ["ok"]);
    case "post-ephemeral":
      return postPlan("chat.postEphemeral", auth, {
        channel: requiredString(firstValue(values.channel, values.channelId), "channelId"),
        user: requiredString(firstValue(values.user, values.userId), "userId"),
        text: requiredString(values.text, "text"),
        thread_ts: firstValue(values.threadTs, values.thread_ts),
        blocks: values.blocks,
        attachments: values.attachments,
      }, ["ok", "message_ts"]);
    case "list-channels":
      return getCursorPlan("conversations.list", auth, {
        types: values.types ?? "public_channel,private_channel",
        limit: values.limit ?? 200,
        cursor: values.cursor,
        exclude_archived: firstValue(values.excludeArchived, values.exclude_archived) ?? true,
      }, "channels", ["ok", "channels"]);
    case "get-channel":
      return getPlan("conversations.info", auth, {
        channel: requiredString(firstValue(values.channel, values.channelId), "channelId"),
        include_locale: firstValue(values.includeLocale, values.include_locale),
      }, ["ok", "channel"]);
    case "create-channel":
      return postPlan("conversations.create", auth, {
        name: requiredString(values.name, "name"),
        is_private: firstValue(values.isPrivate, values.is_private),
      }, ["ok", "channel"]);
    case "rename-channel":
      return postPlan("conversations.rename", auth, {
        channel: requiredString(firstValue(values.channel, values.channelId), "channelId"),
        name: requiredString(values.name, "name"),
      }, ["ok", "channel"]);
    case "archive-channel":
      return postPlan("conversations.archive", auth, {
        channel: requiredString(firstValue(values.channel, values.channelId), "channelId"),
      }, ["ok"]);
    case "unarchive-channel":
      return postPlan("conversations.unarchive", auth, {
        channel: requiredString(firstValue(values.channel, values.channelId), "channelId"),
      }, ["ok"]);
    case "invite-to-channel":
      return postPlan("conversations.invite", auth, {
        channel: requiredString(firstValue(values.channel, values.channelId), "channelId"),
        users: requiredString(firstValue(values.users, values.userIds), "users"),
      }, ["ok", "channel"]);
    case "kick-from-channel":
      return postPlan("conversations.kick", auth, {
        channel: requiredString(firstValue(values.channel, values.channelId), "channelId"),
        user: requiredString(firstValue(values.user, values.userId), "userId"),
      }, ["ok"]);
    case "join-channel":
      return postPlan("conversations.join", auth, {
        channel: requiredString(firstValue(values.channel, values.channelId), "channelId"),
      }, ["ok", "channel"]);
    case "leave-channel":
      return postPlan("conversations.leave", auth, {
        channel: requiredString(firstValue(values.channel, values.channelId), "channelId"),
      }, ["ok"]);
    case "conversation-history":
      return getCursorPlan("conversations.history", auth, {
        channel: requiredString(firstValue(values.channel, values.channelId), "channelId"),
        limit: values.limit ?? 100,
        cursor: values.cursor,
        latest: values.latest,
        oldest: values.oldest,
        inclusive: values.inclusive,
      }, "messages", ["ok", "messages"]);
    case "conversation-replies":
      return getCursorPlan("conversations.replies", auth, {
        channel: requiredString(firstValue(values.channel, values.channelId), "channelId"),
        ts: requiredString(firstValue(values.ts, values.messageTs, values.message_ts), "messageTs"),
        limit: values.limit ?? 100,
        cursor: values.cursor,
        latest: values.latest,
        oldest: values.oldest,
        inclusive: values.inclusive,
      }, "messages", ["ok", "messages"]);
    case "conversation-members":
      return getCursorPlan("conversations.members", auth, {
        channel: requiredString(firstValue(values.channel, values.channelId), "channelId"),
        limit: values.limit ?? 200,
        cursor: values.cursor,
      }, "members", ["ok", "members"]);
    case "open-conversation":
      return postPlan("conversations.open", auth, {
        users: requiredString(firstValue(values.users, values.userIds, values.userId), "users"),
        channel: firstValue(values.channel, values.channelId),
        return_im: firstValue(values.returnIm, values.return_im),
      }, ["ok", "channel"]);
    case "list-users":
      return getCursorPlan("users.list", auth, {
        limit: values.limit ?? 200,
        cursor: values.cursor,
        team_id: firstValue(values.teamId, values.team_id),
        include_locale: firstValue(values.includeLocale, values.include_locale),
      }, "members", ["ok", "members"]);
    case "get-user":
      return getPlan("users.info", auth, {
        user: requiredString(firstValue(values.user, values.userId), "userId"),
        include_locale: firstValue(values.includeLocale, values.include_locale),
      }, ["ok", "user"]);
    case "get-user-presence":
      return getPlan("users.getPresence", auth, {
        user: requiredString(firstValue(values.user, values.userId), "userId"),
      }, ["ok", "presence"]);
    case "set-user-presence":
      return postPlan("users.setPresence", auth, {
        presence: requiredString(values.presence, "presence"),
      }, ["ok"]);
    case "add-reaction":
      return postPlan("reactions.add", auth, messageTarget(values), ["ok"]);
    case "remove-reaction":
      return postPlan("reactions.remove", auth, messageTarget(values), ["ok"]);
    case "get-reactions":
      return getPlan("reactions.get", auth, messageTarget(values), ["ok"]);
    case "add-pin":
      return postPlan("pins.add", auth, pinTarget(values), ["ok"]);
    case "remove-pin":
      return postPlan("pins.remove", auth, pinTarget(values), ["ok"]);
    case "list-pins":
      return getPlan("pins.list", auth, {
        channel: requiredString(firstValue(values.channel, values.channelId), "channelId"),
      }, ["ok", "items"]);
    case "list-files":
      return getPlan("files.list", auth, {
        channel: firstValue(values.channel, values.channelId),
        user: firstValue(values.user, values.userId),
        ts_from: firstValue(values.tsFrom, values.ts_from),
        ts_to: firstValue(values.tsTo, values.ts_to),
        types: values.types,
        count: values.count ?? values.limit,
        page: values.page,
      }, ["ok", "files"]);
    case "get-file":
      return getPlan("files.info", auth, {
        file: requiredString(firstValue(values.file, values.fileId), "fileId"),
        count: values.count,
        page: values.page,
      }, ["ok", "file"]);
    case "delete-file":
      return postPlan("files.delete", auth, {
        file: requiredString(firstValue(values.file, values.fileId), "fileId"),
      }, ["ok"]);
    case "add-reminder":
      return postPlan("reminders.add", auth, {
        text: requiredString(values.text, "text"),
        time: requiredString(values.time, "time"),
        user: firstValue(values.user, values.userId),
      }, ["ok", "reminder"]);
    case "list-reminders":
      return getPlan("reminders.list", auth, {}, ["ok", "reminders"]);
    case "complete-reminder":
      return postPlan("reminders.complete", auth, {
        reminder: requiredString(firstValue(values.reminder, values.reminderId), "reminderId"),
      }, ["ok"]);
    case "delete-reminder":
      return postPlan("reminders.delete", auth, {
        reminder: requiredString(firstValue(values.reminder, values.reminderId), "reminderId"),
      }, ["ok"]);
    case "search-messages":
      return getPlan("search.messages", auth, {
        query: requiredString(values.query, "query"),
        count: values.count ?? values.limit,
        page: values.page,
        sort: values.sort,
        sort_dir: firstValue(values.sortDir, values.sort_dir),
      }, ["ok", "messages"]);
    case "search-files":
      return getPlan("search.files", auth, {
        query: requiredString(values.query, "query"),
        count: values.count ?? values.limit,
        page: values.page,
        sort: values.sort,
        sort_dir: firstValue(values.sortDir, values.sort_dir),
      }, ["ok", "files"]);
    case "list-usergroups":
      return getPlan("usergroups.list", auth, {
        include_users: firstValue(values.includeUsers, values.include_users),
        include_count: firstValue(values.includeCount, values.include_count),
        include_disabled: firstValue(values.includeDisabled, values.include_disabled),
      }, ["ok", "usergroups"]);
    case "enable-usergroup":
      return postPlan("usergroups.enable", auth, {
        usergroup: requiredString(firstValue(values.usergroup, values.usergroupId), "usergroupId"),
        include_count: firstValue(values.includeCount, values.include_count),
      }, ["ok", "usergroup"]);
    case "disable-usergroup":
      return postPlan("usergroups.disable", auth, {
        usergroup: requiredString(firstValue(values.usergroup, values.usergroupId), "usergroupId"),
        include_count: firstValue(values.includeCount, values.include_count),
      }, ["ok", "usergroup"]);
    case "list-usergroup-users":
      return getPlan("usergroups.users.list", auth, {
        usergroup: requiredString(firstValue(values.usergroup, values.usergroupId), "usergroupId"),
        include_disabled: firstValue(values.includeDisabled, values.include_disabled),
      }, ["ok", "users"]);
    case "update-usergroup-users":
      return postPlan("usergroups.users.update", auth, {
        usergroup: requiredString(firstValue(values.usergroup, values.usergroupId), "usergroupId"),
        users: requiredString(firstValue(values.users, values.userIds), "users"),
        include_count: firstValue(values.includeCount, values.include_count),
      }, ["ok", "usergroup"]);
    case "open-view":
      return postPlan("views.open", auth, {
        trigger_id: requiredString(firstValue(values.triggerId, values.trigger_id), "triggerId"),
        view: requiredJson(values.view, "view"),
      }, ["ok", "view"]);
    case "publish-view":
      return postPlan("views.publish", auth, {
        user_id: requiredString(firstValue(values.userId, values.user_id), "userId"),
        view: requiredJson(values.view, "view"),
        hash: values.hash,
      }, ["ok", "view"]);
    case "push-view":
      return postPlan("views.push", auth, {
        trigger_id: requiredString(firstValue(values.triggerId, values.trigger_id), "triggerId"),
        view: requiredJson(values.view, "view"),
      }, ["ok", "view"]);
    case "update-view":
      return postPlan("views.update", auth, {
        view: requiredJson(values.view, "view"),
        view_id: firstValue(values.viewId, values.view_id),
        external_id: firstValue(values.externalId, values.external_id),
        hash: values.hash,
      }, ["ok", "view"]);
    case "test-auth":
      return getPlan("auth.test", auth, {}, ["ok", "team_id", "user_id"]);
  }
}

function slackRuntimeOperation(operationId: string): SlackRuntimeOperation | null {
  const slug = operationId.split(".").at(-1);
  if (slug === "send-message" || slug === "send-text-message") return "send-message";
  if (slug === "update-message") return "update-message";
  if (slug === "delete-message") return "delete-message";
  if (slug === "schedule-message") return "schedule-message";
  if (slug === "delete-scheduled-message") return "delete-scheduled-message";
  if (slug === "post-ephemeral") return "post-ephemeral";
  if (slug === "list-channels") return "list-channels";
  if (slug === "get-channel" || slug === "channel-info") return "get-channel";
  if (slug === "create-channel") return "create-channel";
  if (slug === "rename-channel") return "rename-channel";
  if (slug === "archive-channel") return "archive-channel";
  if (slug === "unarchive-channel") return "unarchive-channel";
  if (slug === "invite-to-channel") return "invite-to-channel";
  if (slug === "kick-from-channel") return "kick-from-channel";
  if (slug === "join-channel") return "join-channel";
  if (slug === "leave-channel") return "leave-channel";
  if (slug === "conversation-history" || slug === "list-messages") return "conversation-history";
  if (slug === "conversation-replies" || slug === "list-thread-replies") return "conversation-replies";
  if (slug === "conversation-members" || slug === "list-channel-members") return "conversation-members";
  if (slug === "open-conversation") return "open-conversation";
  if (slug === "list-users") return "list-users";
  if (slug === "get-user" || slug === "user-info") return "get-user";
  if (slug === "get-user-presence") return "get-user-presence";
  if (slug === "set-user-presence") return "set-user-presence";
  if (slug === "add-reaction") return "add-reaction";
  if (slug === "remove-reaction") return "remove-reaction";
  if (slug === "get-reactions") return "get-reactions";
  if (slug === "add-pin") return "add-pin";
  if (slug === "remove-pin") return "remove-pin";
  if (slug === "list-pins") return "list-pins";
  if (slug === "list-files") return "list-files";
  if (slug === "get-file" || slug === "file-info") return "get-file";
  if (slug === "delete-file") return "delete-file";
  if (slug === "add-reminder") return "add-reminder";
  if (slug === "list-reminders") return "list-reminders";
  if (slug === "complete-reminder") return "complete-reminder";
  if (slug === "delete-reminder") return "delete-reminder";
  if (slug === "search-messages") return "search-messages";
  if (slug === "search-files") return "search-files";
  if (slug === "list-usergroups") return "list-usergroups";
  if (slug === "enable-usergroup") return "enable-usergroup";
  if (slug === "disable-usergroup") return "disable-usergroup";
  if (slug === "list-usergroup-users") return "list-usergroup-users";
  if (slug === "update-usergroup-users") return "update-usergroup-users";
  if (slug === "open-view") return "open-view";
  if (slug === "publish-view") return "publish-view";
  if (slug === "push-view") return "push-view";
  if (slug === "update-view") return "update-view";
  if (slug === "test-auth") return "test-auth";
  return null;
}

function getPlan(
  endpoint: string,
  auth: ConnectorRuntimeRequestPlan["auth"],
  query: Record<string, IntegrationJson | undefined>,
  requiredPaths: string[],
): ConnectorRuntimeRequestPlan {
  return {
    method: "GET",
    endpoint,
    auth,
    headers: {
      accept: "application/json",
    },
    query: removeEmptyValues(query),
    body: {},
    responseSchema: {
      type: "object",
      requiredPaths,
    },
  };
}

function getCursorPlan(
  endpoint: string,
  auth: ConnectorRuntimeRequestPlan["auth"],
  query: Record<string, IntegrationJson | undefined>,
  itemsPath: string,
  requiredPaths: string[],
): ConnectorRuntimeRequestPlan {
  const limit = numberValue(query.limit) ?? numberValue(query.count) ?? 200;
  return {
    ...getPlan(endpoint, auth, query, requiredPaths),
    pagination: {
      mode: "cursor",
      itemsPath,
      nextCursorPath: "response_metadata.next_cursor",
      cursorParam: "cursor",
      limitParam: "limit",
      pageSize: limit,
    },
  };
}

function postPlan(
  endpoint: string,
  auth: ConnectorRuntimeRequestPlan["auth"],
  body: Record<string, IntegrationJson | undefined>,
  requiredPaths: string[],
): ConnectorRuntimeRequestPlan {
  return {
    method: "POST",
    endpoint,
    auth,
    headers: {
      accept: "application/json",
    },
    body: removeEmptyValues(body),
    responseSchema: {
      type: "object",
      requiredPaths,
    },
  };
}

function messageTarget(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return {
    channel: requiredString(firstValue(values.channel, values.channelId), "channelId"),
    timestamp: requiredString(firstValue(values.timestamp, values.ts, values.messageTs, values.message_ts), "timestamp"),
    name: requiredString(firstValue(values.name, values.reaction), "name"),
  };
}

function pinTarget(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return {
    channel: requiredString(firstValue(values.channel, values.channelId), "channelId"),
    timestamp: requiredString(firstValue(values.timestamp, values.ts, values.messageTs, values.message_ts), "timestamp"),
  };
}

function firstValue(...values: Array<IntegrationJson | undefined>): IntegrationJson | undefined {
  for (const value of values) {
    if (value !== undefined && value !== "") return value;
  }
  return undefined;
}

function requiredString(value: IntegrationJson | undefined, name: string): string {
  if (typeof value === "string" && value.trim()) return value;
  throw new Error(`Slack ${name} must be a non-empty string`);
}

function requiredInteger(value: IntegrationJson | undefined, name: string): number {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  throw new Error(`Slack ${name} must be an integer`);
}

function requiredJson(value: IntegrationJson | undefined, name: string): IntegrationJson {
  if (value == null || value === "") throw new Error(`Slack ${name} is required`);
  return value;
}

function numberValue(value: IntegrationJson | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function removeEmptyValues(input: Record<string, IntegrationJson | undefined>): Record<string, IntegrationJson> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== ""),
  ) as Record<string, IntegrationJson>;
}
