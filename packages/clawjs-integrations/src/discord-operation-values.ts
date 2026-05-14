import type { IntegrationJson } from "./types.ts";

export function guildId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.guildId, values.guild), "guildId"));
}

export function channelId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.channelId, values.channel), "channelId"));
}

export function overwriteId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.overwriteId, values.permissionOverwriteId, values.targetId), "overwriteId"));
}

export function messageId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.messageId, values.message), "messageId"));
}

export function answerId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.answerId, values.pollAnswerId), "answerId"));
}

export function userId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.userId, values.user), "userId"));
}

export function roleId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.roleId, values.role), "roleId"));
}

export function integrationId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.integrationId, values.integration), "integrationId"));
}

export function webhookId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.webhookId, values.webhook), "webhookId"));
}

export function webhookToken(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.webhookToken, values.token), "webhookToken"));
}

export function inviteCode(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.inviteCode, values.invite), "inviteCode"));
}

export function applicationId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.applicationId, values.application), "applicationId"));
}

export function interactionId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.interactionId, values.interaction), "interactionId"));
}

export function interactionToken(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.interactionToken, values.token), "interactionToken"));
}

export function instanceId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.instanceId, values.instance), "instanceId"));
}

export function commandId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.commandId, values.command), "commandId"));
}

export function entitlementId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.entitlementId, values.entitlement), "entitlementId"));
}

export function skuId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.skuId, values.sku), "skuId"));
}

export function subscriptionId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.subscriptionId, values.subscription), "subscriptionId"));
}

export function lobbyId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.lobbyId, values.lobby), "lobbyId"));
}

export function emojiId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.emojiId, values.emoji), "emojiId"));
}

export function stickerId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.stickerId, values.sticker), "stickerId"));
}

export function stickerPackId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.stickerPackId, values.stickerPack), "stickerPackId"));
}

export function templateCode(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.templateCode, values.template), "templateCode"));
}

export function soundboardSoundId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.soundboardSoundId, values.soundId, values.soundboardSound), "soundboardSoundId"));
}

export function guildScheduledEventId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.guildScheduledEventId, values.scheduledEventId, values.eventId), "guildScheduledEventId"));
}

export function autoModerationRuleId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.autoModerationRuleId, values.ruleId), "autoModerationRuleId"));
}

export function firstValue(...values: IntegrationJson[]): IntegrationJson {
  return values.find((value) => value != null && value !== "") ?? null;
}

export function requiredString(value: IntegrationJson, name: string): string {
  const parsed = optionalString(value);
  if (!parsed) throw new Error(`Discord ${name} is required`);
  return parsed;
}

export function requiredNumber(value: IntegrationJson, name: string): number {
  const parsed = optionalNumber(value);
  if (parsed == null) throw new Error(`Discord ${name} is required`);
  return parsed;
}

export function optionalString(value: IntegrationJson): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

export function optionalNullableString(value: IntegrationJson): string | null | undefined {
  if (value === null) return null;
  return optionalString(value);
}

export function optionalNullableStringField(values: Record<string, IntegrationJson>, ...keys: string[]): string | null | undefined {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(values, key)) return optionalNullableString(values[key]);
  }
  return undefined;
}

export function optionalNumber(value: IntegrationJson): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

export function optionalBoolean(value: IntegrationJson): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function optionalNullableBooleanField(values: Record<string, IntegrationJson>, key: string): boolean | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(values, key)) return undefined;
  if (values[key] === null) return null;
  return optionalBoolean(values[key]);
}

export function optionalNullableNumberField(values: Record<string, IntegrationJson>, key: string): number | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(values, key)) return undefined;
  if (values[key] === null) return null;
  return optionalNumber(values[key]);
}

export function optionalJsonArray(value: IntegrationJson): IntegrationJson[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

export function optionalNullableJsonArrayField(values: Record<string, IntegrationJson>, key: string): IntegrationJson[] | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(values, key)) return undefined;
  if (values[key] === null) return null;
  return optionalJsonArray(values[key]);
}

export function optionalFileArray(value: IntegrationJson): IntegrationJson[] | undefined {
  if (Array.isArray(value) && value.length) return value;
  const file = optionalString(value);
  return file ? [file] : undefined;
}

export function optionalArrayQuery(value: IntegrationJson): IntegrationJson | undefined {
  return optionalJsonArray(value) ?? optionalString(value);
}

export function optionalCommaDelimited(value: IntegrationJson): string | undefined {
  if (Array.isArray(value)) {
    const entries = value.map((entry) => optionalString(entry)).filter((entry): entry is string => Boolean(entry));
    return entries.length ? entries.join(",") : undefined;
  }
  return optionalString(value);
}

export function requiredJsonArray(value: IntegrationJson, name: string): IntegrationJson[] {
  const parsed = optionalJsonArray(value);
  if (!parsed) throw new Error(`Discord ${name} is required`);
  return parsed;
}

export function requiredJsonObject(value: IntegrationJson, name: string): Record<string, IntegrationJson> {
  const parsed = optionalJsonObject(value);
  if (!parsed) throw new Error(`Discord ${name} is required`);
  return parsed;
}

export function optionalJsonObject(value: IntegrationJson): Record<string, IntegrationJson> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, IntegrationJson>
    : undefined;
}

export function optionalNullableJsonObject(value: IntegrationJson): Record<string, IntegrationJson> | null | undefined {
  if (value === null) return null;
  return optionalJsonObject(value);
}

export function optionalNullableJsonObjectField(values: Record<string, IntegrationJson>, key: string): Record<string, IntegrationJson> | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(values, key)) return undefined;
  return optionalNullableJsonObject(values[key]);
}

export function pathSegment(value: string): string {
  return encodeURIComponent(value);
}

export function removeEmptyValues(input: Record<string, IntegrationJson | undefined>): Record<string, IntegrationJson> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== "" && value !== null),
  ) as Record<string, IntegrationJson>;
}

export function auditHeaders(
  headers: Record<string, string>,
  values: Record<string, IntegrationJson>,
): Record<string, string> {
  const auditLogReason = optionalString(values.auditLogReason);
  return auditLogReason ? { ...headers, "X-Audit-Log-Reason": auditLogReason } : headers;
}
