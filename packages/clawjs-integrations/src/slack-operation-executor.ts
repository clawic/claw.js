import type {
  ConnectorRuntimeRequestPlan,
} from "./runtime-registry.ts";
import type {
  ConnectorFieldDefinition,
  ConnectorOperationDefinition,
  IntegrationJson,
} from "./types.ts";

export const SLACK_APP_ID = "slack";

export type SlackField = ConnectorFieldDefinition;

export interface SlackGenericOperationSpec {
  slug: string;
  method: "GET" | "POST";
  endpoint: string;
  fields: SlackField[];
  query?: string[];
  body?: string[];
  requiredPaths?: string[];
  cursorItemsPath?: string;
}

export const SLACK_CORE_ACTION_SLUGS = [
  "send-message",
  "update-message",
  "delete-message",
  "schedule-message",
  "delete-scheduled-message",
  "post-ephemeral",
  "list-channels",
  "get-channel",
  "create-channel",
  "rename-channel",
  "archive-channel",
  "unarchive-channel",
  "invite-to-channel",
  "kick-from-channel",
  "join-channel",
  "leave-channel",
  "conversation-history",
  "conversation-replies",
  "conversation-members",
  "open-conversation",
  "list-users",
  "get-user",
  "get-user-presence",
  "set-user-presence",
  "add-reaction",
  "remove-reaction",
  "get-reactions",
  "add-pin",
  "remove-pin",
  "list-pins",
  "list-files",
  "get-file",
  "delete-file",
  "add-reminder",
  "list-reminders",
  "complete-reminder",
  "delete-reminder",
  "search-messages",
  "search-files",
  "list-usergroups",
  "enable-usergroup",
  "disable-usergroup",
  "list-usergroup-users",
  "update-usergroup-users",
  "open-view",
  "publish-view",
  "push-view",
  "update-view",
  "test-auth",
] as const;

const CHANNEL_FIELD = stringField("channelId", { default: "C123" });
const USER_FIELD = stringField("userId", { default: "U123" });
const MESSAGE_TS_FIELD = stringField("messageTs", { default: "1710000000.000000" });
const CURSOR_FIELDS = [
  integerField("limit", { optional: true, default: 100, min: 1, max: 1000 }),
  stringField("cursor", { optional: true, default: "cursor_sample" }),
];

export const SLACK_EXTRA_ACTION_SPECS = [
  spec("get-message-permalink", "GET", "chat.getPermalink", [CHANNEL_FIELD, MESSAGE_TS_FIELD], { query: ["channel", "message_ts"], requiredPaths: ["ok", "permalink"] }),
  spec("send-me-message", "POST", "chat.meMessage", [CHANNEL_FIELD, stringField("text", { default: "sample" })], { body: ["channel", "text"], requiredPaths: ["ok", "channel", "ts"] }),
  spec("list-scheduled-messages", "GET", "chat.scheduledMessages.list", [CHANNEL_FIELD, ...CURSOR_FIELDS, stringField("latest", { optional: true, default: "1710003600.000000" }), stringField("oldest", { optional: true, default: "1710000000.000000" })], { query: ["channel", "limit", "cursor", "latest", "oldest"], requiredPaths: ["ok", "scheduled_messages"], cursorItemsPath: "scheduled_messages" }),
  spec("unfurl-message", "POST", "chat.unfurl", [CHANNEL_FIELD, MESSAGE_TS_FIELD, objectField("unfurls", { "https://example.invalid": { title: "Example" } }), stringField("userAuthMessage", { optional: true, default: "Authorize" }), stringField("userAuthUrl", { optional: true, default: "https://example.invalid/auth" })], { body: ["channel", "ts", "unfurls", "user_auth_message", "user_auth_url"], requiredPaths: ["ok"] }),
  spec("close-conversation", "POST", "conversations.close", [CHANNEL_FIELD], { body: ["channel"], requiredPaths: ["ok"] }),
  spec("mark-conversation", "POST", "conversations.mark", [CHANNEL_FIELD, MESSAGE_TS_FIELD], { body: ["channel", "ts"], requiredPaths: ["ok"] }),
  spec("set-conversation-purpose", "POST", "conversations.setPurpose", [CHANNEL_FIELD, stringField("purpose", { default: "Sample purpose" })], { body: ["channel", "purpose"], requiredPaths: ["ok", "purpose"] }),
  spec("set-conversation-topic", "POST", "conversations.setTopic", [CHANNEL_FIELD, stringField("topic", { default: "Sample topic" })], { body: ["channel", "topic"], requiredPaths: ["ok", "topic"] }),
  spec("lookup-user-by-email", "GET", "users.lookupByEmail", [stringField("email", { default: "person@example.invalid" })], { query: ["email"], requiredPaths: ["ok", "user"] }),
  spec("get-user-profile", "GET", "users.profile.get", [USER_FIELD, booleanField("includeLabels", { optional: true, default: true })], { query: ["user", "include_labels"], requiredPaths: ["ok", "profile"] }),
  spec("set-user-profile", "POST", "users.profile.set", [USER_FIELD, objectField("profile", { status_text: "Working", status_emoji: ":computer:" }), stringField("name", { optional: true, default: "status_text" }), stringField("value", { optional: true, default: "Working" })], { body: ["user", "profile", "name", "value"], requiredPaths: ["ok", "profile"] }),
  spec("list-emoji", "GET", "emoji.list", [], { requiredPaths: ["ok", "emoji"] }),
  spec("get-team-info", "GET", "team.info", [stringField("teamId", { optional: true, default: "T123" })], { query: ["team"], requiredPaths: ["ok", "team"] }),
  spec("get-team-profile", "GET", "team.profile.get", [stringField("visibility", { optional: true, default: "all" })], { query: ["visibility"], requiredPaths: ["ok", "profile"] }),
  spec("get-bot-info", "GET", "bots.info", [stringField("botId", { optional: true, default: "B123" }), USER_FIELD], { query: ["bot", "user"], requiredPaths: ["ok", "bot"] }),
  spec("add-bookmark", "POST", "bookmarks.add", [CHANNEL_FIELD, stringField("title", { default: "Sample bookmark" }), stringField("type", { default: "link" }), stringField("link", { default: "https://example.invalid" }), stringField("emoji", { optional: true, default: ":bookmark:" })], { body: ["channel_id", "title", "type", "link", "emoji"], requiredPaths: ["ok", "bookmark"] }),
  spec("edit-bookmark", "POST", "bookmarks.edit", [CHANNEL_FIELD, stringField("bookmarkId", { default: "Bk123" }), stringField("title", { default: "Updated bookmark" }), stringField("link", { optional: true, default: "https://example.invalid/updated" }), stringField("emoji", { optional: true, default: ":bookmark:" })], { body: ["channel_id", "bookmark_id", "title", "link", "emoji"], requiredPaths: ["ok", "bookmark"] }),
  spec("list-bookmarks", "GET", "bookmarks.list", [CHANNEL_FIELD], { query: ["channel_id"], requiredPaths: ["ok", "bookmarks"] }),
  spec("remove-bookmark", "POST", "bookmarks.remove", [CHANNEL_FIELD, stringField("bookmarkId", { default: "Bk123" })], { body: ["channel_id", "bookmark_id"], requiredPaths: ["ok"] }),
  spec("add-star", "POST", "stars.add", [CHANNEL_FIELD, MESSAGE_TS_FIELD, stringField("fileId", { optional: true, default: "F123" })], { body: ["channel", "timestamp", "file"], requiredPaths: ["ok"] }),
  spec("list-stars", "GET", "stars.list", [integerField("count", { optional: true, default: 20, min: 1, max: 100 }), integerField("page", { optional: true, default: 1, min: 1 }), ...CURSOR_FIELDS], { query: ["count", "page", "limit", "cursor"], requiredPaths: ["ok", "items"] }),
  spec("remove-star", "POST", "stars.remove", [CHANNEL_FIELD, MESSAGE_TS_FIELD, stringField("fileId", { optional: true, default: "F123" })], { body: ["channel", "timestamp", "file"], requiredPaths: ["ok"] }),
  spec("get-dnd-info", "GET", "dnd.info", [USER_FIELD], { query: ["user"], requiredPaths: ["ok", "dnd_enabled"] }),
  spec("set-dnd-snooze", "POST", "dnd.setSnooze", [integerField("numMinutes", { default: 30, min: 1, max: 1440 })], { body: ["num_minutes"], requiredPaths: ["ok", "snooze_enabled"] }),
  spec("end-dnd-snooze", "POST", "dnd.endSnooze", [], { requiredPaths: ["ok"] }),
  spec("get-team-dnd-info", "GET", "dnd.teamInfo", [stringField("users", { default: "U123,U456" })], { query: ["users"], requiredPaths: ["ok", "users"] }),
  spec("add-remote-file", "POST", "files.remote.add", [stringField("externalId", { default: "external-123" }), stringField("externalUrl", { default: "https://example.invalid/file" }), stringField("title", { default: "Sample file" }), stringField("filetype", { optional: true, default: "text" }), stringField("indexableFileContents", { optional: true, default: "sample" })], { body: ["external_id", "external_url", "title", "filetype", "indexable_file_contents"], requiredPaths: ["ok", "file"] }),
  spec("get-remote-file", "GET", "files.remote.info", [stringField("externalId", { optional: true, default: "external-123" }), stringField("fileId", { optional: true, default: "F123" })], { query: ["external_id", "file"], requiredPaths: ["ok", "file"] }),
  spec("list-remote-files", "GET", "files.remote.list", [CHANNEL_FIELD, ...CURSOR_FIELDS, stringField("tsFrom", { optional: true, default: "1710000000.000000" }), stringField("tsTo", { optional: true, default: "1710003600.000000" })], { query: ["channel", "limit", "cursor", "ts_from", "ts_to"], requiredPaths: ["ok", "files"], cursorItemsPath: "files" }),
  spec("remove-remote-file", "POST", "files.remote.remove", [stringField("externalId", { optional: true, default: "external-123" }), stringField("fileId", { optional: true, default: "F123" })], { body: ["external_id", "file"], requiredPaths: ["ok"] }),
  spec("share-remote-file", "POST", "files.remote.share", [stringField("externalId", { optional: true, default: "external-123" }), stringField("fileId", { optional: true, default: "F123" }), stringField("channels", { default: "C123" })], { body: ["external_id", "file", "channels"], requiredPaths: ["ok", "file"] }),
  spec("update-remote-file", "POST", "files.remote.update", [stringField("externalId", { optional: true, default: "external-123" }), stringField("fileId", { optional: true, default: "F123" }), stringField("title", { optional: true, default: "Updated file" }), stringField("externalUrl", { optional: true, default: "https://example.invalid/file-updated" })], { body: ["external_id", "file", "title", "external_url"], requiredPaths: ["ok", "file"] }),
  spec("create-usergroup", "POST", "usergroups.create", [stringField("name", { default: "Sample Group" }), stringField("handle", { default: "sample-group" }), stringField("description", { optional: true, default: "Sample group" }), stringField("channels", { optional: true, default: "C123" }), booleanField("includeCount", { optional: true, default: true })], { body: ["name", "handle", "description", "channels", "include_count"], requiredPaths: ["ok", "usergroup"] }),
  spec("update-usergroup", "POST", "usergroups.update", [stringField("usergroupId", { default: "S123" }), stringField("name", { optional: true, default: "Updated Group" }), stringField("handle", { optional: true, default: "updated-group" }), stringField("description", { optional: true, default: "Updated group" }), stringField("channels", { optional: true, default: "C123" }), booleanField("includeCount", { optional: true, default: true })], { body: ["usergroup", "name", "handle", "description", "channels", "include_count"], requiredPaths: ["ok", "usergroup"] }),
  spec("list-auth-teams", "GET", "auth.teams.list", CURSOR_FIELDS, { query: ["limit", "cursor"], requiredPaths: ["ok", "teams"], cursorItemsPath: "teams" }),
  spec("revoke-auth", "POST", "auth.revoke", [booleanField("test", { optional: true, default: true })], { body: ["test"], requiredPaths: ["ok", "revoked"] }),
  spec("add-call", "POST", "calls.add", [stringField("externalUniqueId", { default: "call-123" }), stringField("joinUrl", { default: "https://example.invalid/call" }), stringField("createdBy", { default: "U123" }), stringField("dateStart", { optional: true, default: "1710000000" })], { body: ["external_unique_id", "join_url", "created_by", "date_start"], requiredPaths: ["ok", "call"] }),
  spec("get-call", "GET", "calls.info", [stringField("callId", { default: "R123" })], { query: ["id"], requiredPaths: ["ok", "call"] }),
  spec("update-call", "POST", "calls.update", [stringField("callId", { default: "R123" }), stringField("title", { optional: true, default: "Updated call" }), stringField("joinUrl", { optional: true, default: "https://example.invalid/call-updated" })], { body: ["id", "title", "join_url"], requiredPaths: ["ok", "call"] }),
  spec("end-call", "POST", "calls.end", [stringField("callId", { default: "R123" }), integerField("duration", { optional: true, default: 300, min: 0 })], { body: ["id", "duration"], requiredPaths: ["ok", "call"] }),
  spec("add-call-participants", "POST", "calls.participants.add", [stringField("callId", { default: "R123" }), stringField("users", { default: "U123,U456" })], { body: ["id", "users"], requiredPaths: ["ok"] }),
  spec("remove-call-participants", "POST", "calls.participants.remove", [stringField("callId", { default: "R123" }), stringField("users", { default: "U123" })], { body: ["id", "users"], requiredPaths: ["ok"] }),
] as const satisfies readonly SlackGenericOperationSpec[];

export const SLACK_ACTION_SLUGS = [
  ...SLACK_CORE_ACTION_SLUGS,
  ...SLACK_EXTRA_ACTION_SPECS.map((item) => item.slug),
] as const;

export type SlackRuntimeOperation = typeof SLACK_ACTION_SLUGS[number];

const SLACK_OPERATION_SET = new Set<string>(SLACK_ACTION_SLUGS);
const SLACK_EXTRA_SPEC_BY_SLUG = new Map(SLACK_EXTRA_ACTION_SPECS.map((item) => [item.slug, item]));
const SLACK_OPERATION_ALIASES: Record<string, SlackRuntimeOperation> = {
  "send-text-message": "send-message",
  "channel-info": "get-channel",
  "list-messages": "conversation-history",
  "list-thread-replies": "conversation-replies",
  "list-channel-members": "conversation-members",
  "user-info": "get-user",
  "file-info": "get-file",
};

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
  const genericSpec = SLACK_EXTRA_SPEC_BY_SLUG.get(runtimeOperation);
  if (genericSpec) return genericSlackPlan(genericSpec, values, auth);

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
  throw new Error(`Unsupported Slack operation: ${operation.id}`);
}

function slackRuntimeOperation(operationId: string): SlackRuntimeOperation | null {
  const slug = operationId.split(".").at(-1);
  const resolved = slug ? SLACK_OPERATION_ALIASES[slug] ?? slug : null;
  if (resolved && SLACK_OPERATION_SET.has(resolved)) return resolved as SlackRuntimeOperation;
  return null;
}

function spec(
  slug: string,
  method: SlackGenericOperationSpec["method"],
  endpoint: string,
  fields: SlackField[],
  options: {
    query?: string[];
    body?: string[];
    requiredPaths?: string[];
    cursorItemsPath?: string;
  } = {},
): SlackGenericOperationSpec {
  return {
    slug,
    method,
    endpoint,
    fields,
    query: options.query,
    body: options.body,
    requiredPaths: options.requiredPaths,
    cursorItemsPath: options.cursorItemsPath,
  };
}

function genericSlackPlan(
  spec: SlackGenericOperationSpec,
  values: Record<string, IntegrationJson>,
  auth: ConnectorRuntimeRequestPlan["auth"],
): ConnectorRuntimeRequestPlan {
  const query = valuesForWebKeys(values, spec.query ?? []);
  const plan: ConnectorRuntimeRequestPlan = spec.method === "GET"
    ? getPlan(spec.endpoint, auth, query, spec.requiredPaths ?? ["ok"])
    : postPlan(spec.endpoint, auth, valuesForWebKeys(values, spec.body ?? []), spec.requiredPaths ?? ["ok"]);
  if (spec.cursorItemsPath) {
    const limit = numberValue(query.limit) ?? numberValue(query.count) ?? 100;
    plan.pagination = {
      mode: "cursor",
      itemsPath: spec.cursorItemsPath,
      nextCursorPath: "response_metadata.next_cursor",
      cursorParam: "cursor",
      limitParam: "limit",
      pageSize: limit,
    };
  }
  return plan;
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

function valuesForWebKeys(values: Record<string, IntegrationJson>, keys: readonly string[]): Record<string, IntegrationJson> {
  return removeEmptyValues(Object.fromEntries(keys.map((key) => [key, valueForWebKey(values, key)])));
}

function valueForWebKey(values: Record<string, IntegrationJson>, key: string): IntegrationJson | undefined {
  const camel = camelCase(key);
  const candidates = [
    key,
    camel,
    `${camel}Id`,
    key.endsWith("_id") ? camelCase(key.slice(0, -3)) : "",
    key === "channel" ? "channelId" : "",
    key === "user" ? "userId" : "",
    key === "ts" || key === "timestamp" || key === "message_ts" ? "messageTs" : "",
    key === "id" ? "callId" : "",
    key === "file" ? "fileId" : "",
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (Object.prototype.hasOwnProperty.call(values, candidate)) return values[candidate];
  }
  return undefined;
}

function camelCase(key: string): string {
  return key.replaceAll(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function stringField(name: string, options: { optional?: boolean; default: string }): SlackField {
  return { name, type: "string", optional: options.optional ?? false, default: options.default };
}

function integerField(name: string, options: { optional?: boolean; default: number; min?: number; max?: number }): SlackField {
  return { name, type: "integer", optional: options.optional ?? false, default: options.default, ...(options.min ? { min: options.min } : {}), ...(options.max ? { max: options.max } : {}) };
}

function booleanField(name: string, options: { optional?: boolean; default: boolean }): SlackField {
  return { name, type: "boolean", optional: options.optional ?? false, default: options.default };
}

function objectField(name: string, defaultValue: Record<string, IntegrationJson>, options: { optional?: boolean } = {}): SlackField {
  return { name, type: "object", optional: options.optional ?? false, default: defaultValue };
}
