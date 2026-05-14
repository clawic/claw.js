import type {
  IntegrationQaCoverageStatus,
  IntegrationQaLiveLane,
  OfficialApiCoverageEntry,
  OfficialApiCoverageMatrix,
} from "./integration-qa-policy.ts";

export const TELEGRAM_OFFICIAL_BOT_API_VERSION = "10.0";
export const TELEGRAM_OFFICIAL_BOT_API_SOURCE_URL = "https://core.telegram.org/bots/api";
export const TELEGRAM_OFFICIAL_BOT_API_SOURCE_DATE = "2026-05-08";

export const TELEGRAM_OFFICIAL_BOT_API_METHODS = [
  "getUpdates",
  "setWebhook",
  "deleteWebhook",
  "getWebhookInfo",
  "getMe",
  "logOut",
  "close",
  "sendMessage",
  "forwardMessage",
  "forwardMessages",
  "copyMessage",
  "copyMessages",
  "sendPhoto",
  "sendLivePhoto",
  "sendAudio",
  "sendDocument",
  "sendVideo",
  "sendAnimation",
  "sendVoice",
  "sendVideoNote",
  "sendPaidMedia",
  "sendMediaGroup",
  "sendLocation",
  "sendVenue",
  "sendContact",
  "sendPoll",
  "sendChecklist",
  "sendDice",
  "sendMessageDraft",
  "sendChatAction",
  "setMessageReaction",
  "getUserProfilePhotos",
  "getUserProfileAudios",
  "setUserEmojiStatus",
  "getFile",
  "banChatMember",
  "unbanChatMember",
  "restrictChatMember",
  "promoteChatMember",
  "setChatAdministratorCustomTitle",
  "setChatMemberTag",
  "banChatSenderChat",
  "unbanChatSenderChat",
  "setChatPermissions",
  "exportChatInviteLink",
  "createChatInviteLink",
  "editChatInviteLink",
  "createChatSubscriptionInviteLink",
  "editChatSubscriptionInviteLink",
  "revokeChatInviteLink",
  "approveChatJoinRequest",
  "declineChatJoinRequest",
  "setChatPhoto",
  "deleteChatPhoto",
  "setChatTitle",
  "setChatDescription",
  "pinChatMessage",
  "unpinChatMessage",
  "unpinAllChatMessages",
  "leaveChat",
  "getChat",
  "getChatAdministrators",
  "getChatMemberCount",
  "getChatMember",
  "getUserPersonalChatMessages",
  "setChatStickerSet",
  "deleteChatStickerSet",
  "getForumTopicIconStickers",
  "createForumTopic",
  "editForumTopic",
  "closeForumTopic",
  "reopenForumTopic",
  "deleteForumTopic",
  "unpinAllForumTopicMessages",
  "editGeneralForumTopic",
  "closeGeneralForumTopic",
  "reopenGeneralForumTopic",
  "hideGeneralForumTopic",
  "unhideGeneralForumTopic",
  "unpinAllGeneralForumTopicMessages",
  "answerCallbackQuery",
  "answerGuestQuery",
  "getUserChatBoosts",
  "getBusinessConnection",
  "getManagedBotToken",
  "replaceManagedBotToken",
  "getManagedBotAccessSettings",
  "setManagedBotAccessSettings",
  "setMyCommands",
  "deleteMyCommands",
  "getMyCommands",
  "setMyName",
  "getMyName",
  "setMyDescription",
  "getMyDescription",
  "setMyShortDescription",
  "getMyShortDescription",
  "setMyProfilePhoto",
  "removeMyProfilePhoto",
  "setChatMenuButton",
  "getChatMenuButton",
  "setMyDefaultAdministratorRights",
  "getMyDefaultAdministratorRights",
  "getAvailableGifts",
  "sendGift",
  "giftPremiumSubscription",
  "verifyUser",
  "verifyChat",
  "removeUserVerification",
  "removeChatVerification",
  "readBusinessMessage",
  "deleteBusinessMessages",
  "setBusinessAccountName",
  "setBusinessAccountUsername",
  "setBusinessAccountBio",
  "setBusinessAccountProfilePhoto",
  "removeBusinessAccountProfilePhoto",
  "setBusinessAccountGiftSettings",
  "getBusinessAccountStarBalance",
  "transferBusinessAccountStars",
  "getBusinessAccountGifts",
  "getUserGifts",
  "getChatGifts",
  "convertGiftToStars",
  "upgradeGift",
  "transferGift",
  "postStory",
  "repostStory",
  "editStory",
  "deleteStory",
  "answerWebAppQuery",
  "savePreparedInlineMessage",
  "savePreparedKeyboardButton",
  "editMessageText",
  "editMessageCaption",
  "editMessageMedia",
  "editMessageLiveLocation",
  "stopMessageLiveLocation",
  "editMessageChecklist",
  "editMessageReplyMarkup",
  "stopPoll",
  "approveSuggestedPost",
  "declineSuggestedPost",
  "deleteMessage",
  "deleteMessages",
  "deleteMessageReaction",
  "deleteAllMessageReactions",
  "sendSticker",
  "getStickerSet",
  "getCustomEmojiStickers",
  "uploadStickerFile",
  "createNewStickerSet",
  "addStickerToSet",
  "setStickerPositionInSet",
  "deleteStickerFromSet",
  "replaceStickerInSet",
  "setStickerEmojiList",
  "setStickerKeywords",
  "setStickerMaskPosition",
  "setStickerSetTitle",
  "setStickerSetThumbnail",
  "setCustomEmojiStickerSetThumbnail",
  "deleteStickerSet",
  "answerInlineQuery",
  "sendInvoice",
  "createInvoiceLink",
  "answerShippingQuery",
  "answerPreCheckoutQuery",
  "getMyStarBalance",
  "getStarTransactions",
  "refundStarPayment",
  "editUserStarSubscription",
  "setPassportDataErrors",
  "sendGame",
  "setGameScore",
  "getGameHighScores",
] as const;

type TelegramOfficialMethod = typeof TELEGRAM_OFFICIAL_BOT_API_METHODS[number];
export type TelegramOfficialUpdateField = typeof TELEGRAM_OFFICIAL_UPDATE_FIELDS[number];

export interface TelegramUpdateCoverageEntry {
  provider: "telegram_bot_api";
  officialApiVersion: string;
  updateField: TelegramOfficialUpdateField;
  status: IntegrationQaCoverageStatus;
  sourceKinds: readonly string[];
  liveLane: IntegrationQaLiveLane;
  requiresCredentialLease: boolean;
  notes: string;
}

interface TelegramMethodOverride {
  status: IntegrationQaCoverageStatus;
  liveLane: IntegrationQaLiveLane;
  connectorOperationIds?: string[];
  requiresCredentialLease?: boolean;
  notes: string;
}

const IMPLEMENTED_METHODS: Record<string, TelegramMethodOverride> = {
  getUpdates: implemented("telegram_bot_api.source.*", "Long-poll source and update-list actions are implemented; live checks need a leased disposable bot."),
  sendMessage: implemented("telegram_bot_api.action.send-text-message-or-reply", "Text send/reply is implemented through the Bot API sendMessage method."),
  forwardMessage: implemented("telegram_bot_api.action.forward-message", "Single-message forwarding is implemented through forwardMessage."),
  sendPhoto: implemented("telegram_bot_api.action.send-photo", "Photo sends are implemented through sendPhoto."),
  sendAudio: implemented("telegram_bot_api.action.send-audio-file", "Audio-file sends are implemented through sendAudio."),
  sendDocument: implemented("telegram_bot_api.action.send-document-or-image", "Document/image sends are implemented through sendDocument."),
  sendVideo: implemented("telegram_bot_api.action.send-video", "Video sends are implemented through sendVideo."),
  sendVoice: implemented("telegram_bot_api.action.send-voice-message", "Voice-message sends are implemented through sendVoice."),
  sendVideoNote: implemented("telegram_bot_api.action.send-video-note", "Video-note sends are implemented through sendVideoNote."),
  sendMediaGroup: implemented("telegram_bot_api.action.send-album", "Album sends are implemented through sendMediaGroup."),
  banChatMember: implemented("telegram_bot_api.action.kick-chat-member", "Member bans are implemented; live checks need a disposable admin group."),
  restrictChatMember: implemented("telegram_bot_api.action.restrict-chat-member", "Member restrictions are implemented; live checks need a disposable admin group."),
  promoteChatMember: implemented("telegram_bot_api.action.promote-chat-member", "Member promotion is implemented; live checks need a disposable admin group."),
  setChatPermissions: implemented("telegram_bot_api.action.set-chat-permissions", "Chat permissions are implemented; live checks need a disposable admin group."),
  exportChatInviteLink: implemented("telegram_bot_api.action.export-chat-invite-link", "Invite-link export is implemented; live checks need a disposable admin group."),
  createChatInviteLink: implemented("telegram_bot_api.action.create-chat-invite-link", "Invite-link creation is implemented; live checks need a disposable admin group."),
  pinChatMessage: implemented("telegram_bot_api.action.pin-message", "Message pinning is implemented; live checks need a disposable admin group."),
  unpinChatMessage: implemented("telegram_bot_api.action.unpin-message", "Message unpinning is implemented; live checks need a disposable admin group."),
  getChatAdministrators: implemented("telegram_bot_api.action.list-administrators-in-chat", "Administrator listing is implemented as a read-only chat check."),
  getChatMemberCount: implemented("telegram_bot_api.action.get-num-members-in-chat", "Member-count listing is implemented as a read-only chat check."),
  editMessageText: implemented("telegram_bot_api.action.edit-text-message", "Text-message edits are implemented through editMessageText."),
  editMessageMedia: implemented("telegram_bot_api.action.edit-media-message", "Media-message edits are implemented through editMessageMedia."),
  deleteMessage: implemented("telegram_bot_api.action.delete-message", "Single-message deletion is implemented; live checks must use disposable messages."),
  sendSticker: implemented("telegram_bot_api.action.send-sticker", "Sticker sends are implemented through sendSticker."),
};

const POLICY_BLOCKED_METHODS = new Set<TelegramOfficialMethod>([
  "getManagedBotToken",
  "replaceManagedBotToken",
  "getManagedBotAccessSettings",
  "setManagedBotAccessSettings",
]);

const MANUAL_ONLY_METHODS = new Set<TelegramOfficialMethod>([
  "setWebhook",
  "deleteWebhook",
  "getWebhookInfo",
  "logOut",
  "close",
  "sendPaidMedia",
  "setMyProfilePhoto",
  "removeMyProfilePhoto",
  "sendGift",
  "giftPremiumSubscription",
  "verifyUser",
  "verifyChat",
  "removeUserVerification",
  "removeChatVerification",
  "deleteBusinessMessages",
  "setBusinessAccountName",
  "setBusinessAccountUsername",
  "setBusinessAccountBio",
  "setBusinessAccountProfilePhoto",
  "removeBusinessAccountProfilePhoto",
  "setBusinessAccountGiftSettings",
  "transferBusinessAccountStars",
  "convertGiftToStars",
  "upgradeGift",
  "transferGift",
  "postStory",
  "repostStory",
  "editStory",
  "deleteStory",
  "uploadStickerFile",
  "createNewStickerSet",
  "addStickerToSet",
  "setStickerPositionInSet",
  "deleteStickerFromSet",
  "replaceStickerInSet",
  "setStickerEmojiList",
  "setStickerKeywords",
  "setStickerMaskPosition",
  "setStickerSetTitle",
  "setStickerSetThumbnail",
  "setCustomEmojiStickerSetThumbnail",
  "deleteStickerSet",
  "sendInvoice",
  "createInvoiceLink",
  "answerShippingQuery",
  "answerPreCheckoutQuery",
  "refundStarPayment",
  "editUserStarSubscription",
  "setPassportDataErrors",
  "sendGame",
  "setGameScore",
]);

export const TELEGRAM_OFFICIAL_API_COVERAGE: readonly OfficialApiCoverageEntry[] =
  TELEGRAM_OFFICIAL_BOT_API_METHODS.map((officialMethod) => coverageEntry(officialMethod));

export const TELEGRAM_OFFICIAL_UPDATE_FIELDS = [
  "message",
  "edited_message",
  "channel_post",
  "edited_channel_post",
  "business_connection",
  "business_message",
  "edited_business_message",
  "deleted_business_messages",
  "guest_message",
  "message_reaction",
  "message_reaction_count",
  "inline_query",
  "chosen_inline_result",
  "callback_query",
  "shipping_query",
  "pre_checkout_query",
  "purchased_paid_media",
  "poll",
  "poll_answer",
  "my_chat_member",
  "chat_member",
  "chat_join_request",
  "chat_boost",
  "removed_chat_boost",
  "managed_bot",
] as const;

export const TELEGRAM_OFFICIAL_UPDATE_COVERAGE: readonly TelegramUpdateCoverageEntry[] =
  TELEGRAM_OFFICIAL_UPDATE_FIELDS.map((updateField) => updateCoverageEntry(updateField));

export const TELEGRAM_OFFICIAL_API_MATRIX: OfficialApiCoverageMatrix = {
  provider: "telegram_bot_api",
  officialApiVersion: TELEGRAM_OFFICIAL_BOT_API_VERSION,
  officialSourceUrl: TELEGRAM_OFFICIAL_BOT_API_SOURCE_URL,
  officialSourceDate: TELEGRAM_OFFICIAL_BOT_API_SOURCE_DATE,
  officialMethods: TELEGRAM_OFFICIAL_BOT_API_METHODS,
  entries: TELEGRAM_OFFICIAL_API_COVERAGE,
};

function coverageEntry(officialMethod: TelegramOfficialMethod): OfficialApiCoverageEntry {
  const override = IMPLEMENTED_METHODS[officialMethod];
  if (override) return makeEntry(officialMethod, override);
  if (POLICY_BLOCKED_METHODS.has(officialMethod)) {
    return makeEntry(officialMethod, {
      status: "unsupported_by_policy",
      liveLane: "blocked_by_policy",
      connectorOperationIds: [],
      requiresCredentialLease: false,
      notes: "Managed-bot token and access delegation methods are blocked until the broker can mint scoped, auditable leases without exposing raw credentials.",
    });
  }
  if (MANUAL_ONLY_METHODS.has(officialMethod)) {
    return makeEntry(officialMethod, {
      status: "manual_only",
      liveLane: "manual_physical",
      connectorOperationIds: [],
      requiresCredentialLease: true,
      notes: "This official method can touch money, account state, public delivery, uploaded assets, or destructive chat state; live validation requires an explicit manual scenario.",
    });
  }
  return makeEntry(officialMethod, {
    status: "fixture_only",
    liveLane: "none",
    connectorOperationIds: [],
    requiresCredentialLease: false,
    notes: "Official Bot API method is tracked but not yet exposed by the connector; fixture coverage must be added before implementation can claim runtime completeness.",
  });
}

function updateCoverageEntry(updateField: TelegramOfficialUpdateField): TelegramUpdateCoverageEntry {
  if (
    updateField === "message"
    || updateField === "edited_message"
    || updateField === "channel_post"
    || updateField === "edited_channel_post"
  ) {
    return {
      provider: "telegram_bot_api",
      officialApiVersion: TELEGRAM_OFFICIAL_BOT_API_VERSION,
      updateField,
      status: "implemented",
      sourceKinds: ["new-updates", "message-updates", "channel-updates", "new-bot-command-received"],
      liveLane: "brokered_live",
      requiresCredentialLease: true,
      notes: "The polling source extracts message and channel message updates into connector events.",
    };
  }
  if (
    updateField === "shipping_query"
    || updateField === "pre_checkout_query"
    || updateField === "purchased_paid_media"
    || updateField === "managed_bot"
  ) {
    return {
      provider: "telegram_bot_api",
      officialApiVersion: TELEGRAM_OFFICIAL_BOT_API_VERSION,
      updateField,
      status: updateField === "managed_bot" ? "unsupported_by_policy" : "manual_only",
      sourceKinds: [],
      liveLane: updateField === "managed_bot" ? "blocked_by_policy" : "manual_physical",
      requiresCredentialLease: updateField !== "managed_bot",
      notes: "This update type depends on payments, paid media, or managed-bot delegation and cannot be default-live validated.",
    };
  }
  return {
    provider: "telegram_bot_api",
    officialApiVersion: TELEGRAM_OFFICIAL_BOT_API_VERSION,
    updateField,
    status: "fixture_only",
    sourceKinds: [],
    liveLane: "none",
    requiresCredentialLease: false,
    notes: "Official update type is tracked but not yet extracted into a typed connector source event.",
  };
}

function implemented(connectorOperationId: string, notes: string): TelegramMethodOverride {
  return {
    status: "implemented",
    liveLane: "brokered_live",
    connectorOperationIds: [connectorOperationId],
    requiresCredentialLease: true,
    notes,
  };
}

function makeEntry(
  officialMethod: TelegramOfficialMethod,
  override: TelegramMethodOverride,
): OfficialApiCoverageEntry {
  return {
    provider: "telegram_bot_api",
    officialApiVersion: TELEGRAM_OFFICIAL_BOT_API_VERSION,
    officialMethod,
    status: override.status,
    liveLane: override.liveLane,
    connectorOperationIds: override.connectorOperationIds ?? [],
    requiresCredentialLease: override.requiresCredentialLease ?? false,
    notes: override.notes,
  };
}
