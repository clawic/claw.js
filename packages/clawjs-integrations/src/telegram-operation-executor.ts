import type {
  ConnectorExecutionContext,
  ConnectorExecutor,
} from "./operation-runner.js";
import type { IntegrationJson } from "./types.js";

export interface TelegramOperationExecutorOptions {
  fetchImpl?: typeof fetch;
}

export interface TelegramRequestPlan {
  method: "POST";
  endpoint: string;
  body: Record<string, IntegrationJson>;
}

type TelegramRequestFetch = typeof fetch;

const BASE = "https://api.telegram.org/bot";

const OPERATION_ENDPOINTS: Record<string, string> = {
  "create-chat-invite-link": "createChatInviteLink",
  "delete-message": "deleteMessage",
  "edit-media-message": "editMessageMedia",
  "edit-text-message": "editMessageText",
  "export-chat-invite-link": "exportChatInviteLink",
  "forward-message": "forwardMessage",
  "get-num-members-in-chat": "getChatMemberCount",
  "kick-chat-member": "banChatMember",
  "list-administrators-in-chat": "getChatAdministrators",
  "list-chats": "getUpdates",
  "list-updates": "getUpdates",
  "pin-message": "pinChatMessage",
  "promote-chat-member": "promoteChatMember",
  "restrict-chat-member": "restrictChatMember",
  "send-album": "sendMediaGroup",
  "send-audio-file": "sendAudio",
  "send-document-or-image": "sendDocument",
  "send-photo": "sendPhoto",
  "send-sticker": "sendSticker",
  "send-text-message-or-reply": "sendMessage",
  "send-video-note": "sendVideoNote",
  "send-video": "sendVideo",
  "send-voice-message": "sendAudio",
  "set-chat-permissions": "setChatPermissions",
  "unpin-message": "unpinChatMessage",
};

const SNAKE_CASE_FIELDS: Record<string, string> = {
  autoPaging: "auto_paging",
  canAddWebPagePreviews: "can_add_web_page_previews",
  canChangeInfo: "can_change_info",
  canInviteUsers: "can_invite_users",
  canPinMessages: "can_pin_messages",
  canSendMediaMessages: "can_send_media_messages",
  canSendMessages: "can_send_messages",
  canSendOtherMessages: "can_send_other_messages",
  canSendPolls: "can_send_polls",
  chatId: "chat_id",
  contentType: "content_type",
  doc: "document",
  fromChatId: "from_chat_id",
  inlineMessageId: "inline_message_id",
  linkPreviewOptions: "link_preview_options",
  messageId: "message_id",
  parseMode: "parse_mode",
  replyMarkup: "reply_markup",
  replyToMessageId: "reply_to_message_id",
  userId: "user_id",
  videoNote: "video_note",
};

const MEDIA_TYPE_ENDPOINTS: Record<string, { endpoint: string; field: string }> = {
  "Document/Image": { endpoint: "sendDocument", field: "document" },
  Photo: { endpoint: "sendPhoto", field: "photo" },
  Audio: { endpoint: "sendAudio", field: "audio" },
  Video: { endpoint: "sendVideo", field: "video" },
  "Video Note": { endpoint: "sendVideoNote", field: "video_note" },
  Voice: { endpoint: "sendVoice", field: "voice" },
  Sticker: { endpoint: "sendSticker", field: "sticker" },
};

const CHAT_PERMISSION_FIELDS = [
  "can_send_messages",
  "can_send_media_messages",
  "can_send_polls",
  "can_send_other_messages",
  "can_add_web_page_previews",
  "can_change_info",
  "can_invite_users",
  "can_pin_messages",
];

const WRAPPER_ONLY_FIELDS = new Set([
  "auto_paging",
  "content_type",
  "filename",
]);

export function createTelegramOperationExecutor(options: TelegramOperationExecutorOptions = {}): ConnectorExecutor {
  return {
    async execute(ctx) {
      return executeTelegramOperation(ctx, options);
    },
  };
}

export async function executeTelegramOperation(
  ctx: ConnectorExecutionContext,
  options: TelegramOperationExecutorOptions = {},
): Promise<Record<string, IntegrationJson>> {
  const token = resolveTelegramToken(ctx.secrets);
  const plan = buildTelegramOperationRequest(ctx.operation.id, ctx.values);
  return sendTelegramRequest({
    token,
    endpoint: plan.endpoint,
    body: plan.body,
    fetchImpl: options.fetchImpl,
  });
}

export function buildTelegramOperationRequest(
  operationId: string,
  values: Record<string, IntegrationJson>,
): TelegramRequestPlan {
  const slug = telegramOperationSlug(operationId);
  const endpoint = endpointForOperation(slug, values);
  return {
    method: "POST",
    endpoint,
    body: normalizeTelegramBody(slug, values),
  };
}

export async function sendTelegramRequest(input: {
  token: string;
  endpoint: string;
  body: Record<string, IntegrationJson>;
  fetchImpl?: TelegramRequestFetch;
}): Promise<Record<string, IntegrationJson>> {
  const fetcher = input.fetchImpl ?? fetch;
  const response = await fetcher(`${BASE}${input.token}/${input.endpoint}`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(input.body),
  });
  const payload = await parseTelegramResponse(response);
  if (!response.ok || payload.ok === false) {
    const description = typeof payload.description === "string" ? payload.description : response.statusText;
    throw new Error(`Telegram ${input.endpoint} failed: ${response.status} ${description}`);
  }
  return payload;
}

function endpointForOperation(slug: string, values: Record<string, IntegrationJson>): string {
  if (slug === "send-media-by-url-or-id") {
    const type = typeof values.mediaType === "string" ? values.mediaType : "";
    const media = MEDIA_TYPE_ENDPOINTS[type];
    if (!media) throw new Error("Telegram media type is not supported.");
    return media.endpoint;
  }
  const endpoint = OPERATION_ENDPOINTS[slug];
  if (!endpoint) {
    throw new Error(`Unsupported Telegram operation: ${slug}`);
  }
  return endpoint;
}

function normalizeTelegramBody(
  slug: string,
  values: Record<string, IntegrationJson>,
): Record<string, IntegrationJson> {
  const body: Record<string, IntegrationJson> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value == null || key === "telegramBotApi" || key === "mediaType") continue;
    if (key === "type" && slug !== "edit-media-message") continue;
    const mapped = SNAKE_CASE_FIELDS[key] ?? key;
    if (WRAPPER_ONLY_FIELDS.has(mapped)) continue;
    body[mapped] = parseJsonLikeTelegramValue(value);
  }

  if (slug === "send-media-by-url-or-id") {
    const mediaType = typeof values.mediaType === "string" ? values.mediaType : "";
    const mediaConfig = MEDIA_TYPE_ENDPOINTS[mediaType];
    if (!mediaConfig) throw new Error("Telegram media type is not supported.");
    const media = body.media;
    delete body.media;
    if (media != null) body[mediaConfig.field] = media;
  }

  if (slug === "send-voice-message") {
    const voice = body.voice;
    delete body.voice;
    if (voice != null) body.audio = voice;
  }

  if (slug === "set-chat-permissions") {
    const permissions: Record<string, IntegrationJson> = {};
    for (const field of CHAT_PERMISSION_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        permissions[field] = body[field];
        delete body[field];
      }
    }
    body.permissions = permissions;
  }

  if (slug === "edit-media-message") {
    const media: Record<string, IntegrationJson> = {};
    for (const field of ["type", "media", "caption", "parse_mode"]) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        media[field] = body[field];
        delete body[field];
      }
    }
    body.media = media;
  }

  return body;
}

function parseJsonLikeTelegramValue(value: IntegrationJson): IntegrationJson {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
  try {
    return JSON.parse(trimmed) as IntegrationJson;
  } catch {
    return value;
  }
}

function telegramOperationSlug(operationId: string): string {
  const raw = operationId.includes(".action.")
    ? operationId.slice(operationId.indexOf(".action.") + ".action.".length)
    : operationId;
  for (const slug of Object.keys(OPERATION_ENDPOINTS)) {
    if (raw === slug || raw.startsWith(`${slug}-`)) return slug;
  }
  if (raw.startsWith("send-media-by-url-or-id")) return "send-media-by-url-or-id";
  return raw;
}

function resolveTelegramToken(secrets: Record<string, string>): string {
  const token = secrets.telegramBotApi ?? secrets.token ?? secrets.auth;
  if (!token) {
    throw new Error("Missing Telegram token secret.");
  }
  return token;
}

async function parseTelegramResponse(response: Response): Promise<Record<string, IntegrationJson> & { ok?: boolean; description?: string }> {
  const text = await response.text();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as IntegrationJson;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, IntegrationJson>
      : { result: parsed };
  } catch {
    return { description: text };
  }
}
