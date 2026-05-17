import type {
  ConnectorRuntimeRequestPlan,
} from "./runtime-registry.ts";
import type {
  ConnectorOperationDefinition,
  IntegrationJson,
} from "./types.ts";

export const WHATSAPP_ACTION_SLUGS = [
  "verify-phone-number",
  "send-message",
  "send-image-message",
  "send-document-message",
  "send-audio-message",
  "send-video-message",
  "send-sticker-message",
  "send-location-message",
  "send-contacts-message",
  "send-template-message",
  "mark-message-read",
] as const;

type WhatsAppRuntimeOperation =
  | "verify-phone-number"
  | "send-text-message"
  | "send-image-message"
  | "send-document-message"
  | "send-audio-message"
  | "send-video-message"
  | "send-sticker-message"
  | "send-location-message"
  | "send-contacts-message"
  | "send-template-message"
  | "mark-message-read";

export function isWhatsAppActionOperationSupported(operationId: string): boolean {
  return whatsAppRuntimeOperation(operationId) !== null;
}

export function buildWhatsAppOperationRequest(
  operation: ConnectorOperationDefinition,
  values: Record<string, IntegrationJson>,
): ConnectorRuntimeRequestPlan {
  const runtimeOperation = whatsAppRuntimeOperation(operation.id);
  if (!runtimeOperation) {
    throw new Error(`Unsupported WhatsApp operation: ${operation.id}`);
  }
  const auth = operation.authFieldNames.map((field) => ({
    type: "secret" as const,
    field,
    placement: "bearer" as const,
  }));
  const phoneNumberId = requiredString(values.phoneNumberId, "phoneNumberId");
  switch (runtimeOperation) {
    case "verify-phone-number":
      return {
        method: "GET",
        endpoint: `${encodeURIComponent(phoneNumberId)}`,
        auth,
        headers: {
          accept: "application/json",
        },
        body: {},
        responseSchema: {
          type: "object",
          requiredPaths: ["id"],
        },
      };
    case "send-text-message":
      return sendMessagePlan(phoneNumberId, auth, {
        type: "text",
        text: {
          body: requiredString(values.text, "text"),
        },
      }, values);
    case "send-image-message":
      return sendMessagePlan(phoneNumberId, auth, {
        type: "image",
        image: mediaObject(values, "image"),
      }, values);
    case "send-document-message":
      return sendMessagePlan(phoneNumberId, auth, {
        type: "document",
        document: mediaObject(values, "document", ["caption", "filename"]),
      }, values);
    case "send-audio-message":
      return sendMessagePlan(phoneNumberId, auth, {
        type: "audio",
        audio: mediaObject(values, "audio"),
      }, values);
    case "send-video-message":
      return sendMessagePlan(phoneNumberId, auth, {
        type: "video",
        video: mediaObject(values, "video", ["caption"]),
      }, values);
    case "send-sticker-message":
      return sendMessagePlan(phoneNumberId, auth, {
        type: "sticker",
        sticker: mediaObject(values, "sticker"),
      }, values);
    case "send-location-message":
      return sendMessagePlan(phoneNumberId, auth, {
        type: "location",
        location: compactObject({
          latitude: requiredNumber(values.latitude, "latitude"),
          longitude: requiredNumber(values.longitude, "longitude"),
          name: optionalString(values.name),
          address: optionalString(values.address),
        }),
      }, values);
    case "send-contacts-message":
      return sendMessagePlan(phoneNumberId, auth, {
        type: "contacts",
        contacts: contactsPayload(values),
      }, values);
    case "send-template-message":
      return sendMessagePlan(phoneNumberId, auth, {
        type: "template",
        template: compactObject({
          name: requiredString(values.templateName, "templateName"),
          language: { code: requiredString(values.languageCode, "languageCode") },
          components: optionalJsonArray(values.components),
        }),
      }, values);
    case "mark-message-read":
      return {
        method: "POST",
        endpoint: `${encodeURIComponent(phoneNumberId)}/messages`,
        auth,
        headers: {
          accept: "application/json",
        },
        body: {
          messaging_product: "whatsapp",
          status: "read",
          message_id: requiredString(values.messageId, "messageId"),
        },
        responseSchema: {
          type: "object",
          requiredPaths: ["success"],
        },
      };
  }
}

function whatsAppRuntimeOperation(operationId: string): WhatsAppRuntimeOperation | null {
  const slug = operationId.split(".").at(-1);
  if (slug === "verify-phone-number" || slug === "get-phone-number") return "verify-phone-number";
  if (slug === "send-message" || slug === "send-text-message") return "send-text-message";
  if (slug === "send-image-message" || slug === "send-image") return "send-image-message";
  if (slug === "send-document-message" || slug === "send-document") return "send-document-message";
  if (slug === "send-audio-message" || slug === "send-audio") return "send-audio-message";
  if (slug === "send-video-message" || slug === "send-video") return "send-video-message";
  if (slug === "send-sticker-message" || slug === "send-sticker") return "send-sticker-message";
  if (slug === "send-location-message" || slug === "send-location") return "send-location-message";
  if (slug === "send-contacts-message" || slug === "send-contacts") return "send-contacts-message";
  if (slug === "send-template-message" || slug === "send-template") return "send-template-message";
  if (slug === "mark-message-read" || slug === "mark-read") return "mark-message-read";
  return null;
}

function sendMessagePlan(
  phoneNumberId: string,
  auth: ConnectorRuntimeRequestPlan["auth"],
  message: Record<string, IntegrationJson>,
  values: Record<string, IntegrationJson>,
): ConnectorRuntimeRequestPlan {
  const body: Record<string, IntegrationJson> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: requiredString(values.to, "to"),
    ...message,
  };
  const quotedMessageId = optionalString(values.quotedMessageId);
  if (quotedMessageId) body.context = { message_id: quotedMessageId };
  return {
    method: "POST",
    endpoint: `${encodeURIComponent(phoneNumberId)}/messages`,
    auth,
    headers: {
      accept: "application/json",
    },
    body,
    responseSchema: {
      type: "object",
      requiredPaths: ["messages"],
    },
  };
}

function mediaObject(
  values: Record<string, IntegrationJson>,
  fieldName: string,
  optionalFields: readonly string[] = ["caption"],
): Record<string, IntegrationJson> {
  const mediaId = optionalString(values.mediaId);
  const mediaLink = optionalString(values.mediaLink);
  const body: Record<string, IntegrationJson> = mediaId
    ? { id: mediaId }
    : { link: mediaLink ?? requiredString(values[fieldName], fieldName) };
  for (const field of optionalFields) {
    const value = optionalString(values[field]);
    if (value) body[field] = value;
  }
  return body;
}

function contactsPayload(values: Record<string, IntegrationJson>): IntegrationJson[] {
  const contacts = optionalJsonArray(values.contacts);
  if (contacts.length > 0) return contacts;
  return [{
    name: {
      formatted_name: requiredString(values.formattedName, "formattedName"),
    },
    phones: [{
      phone: requiredString(values.contactPhone, "contactPhone"),
      type: optionalString(values.contactPhoneType) ?? "WORK",
    }],
  }];
}

function optionalJsonArray(value: IntegrationJson): IntegrationJson[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed as IntegrationJson[] : [];
  } catch {
    return [];
  }
}

function compactObject(value: Record<string, IntegrationJson | undefined>): Record<string, IntegrationJson> {
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, IntegrationJson] => entry[1] !== undefined),
  );
}

function requiredString(value: IntegrationJson, name: string): string {
  const parsed = optionalString(value);
  if (!parsed) throw new Error(`WhatsApp ${name} is required`);
  return parsed;
}

function requiredNumber(value: IntegrationJson, name: string): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  throw new Error(`WhatsApp ${name} is required`);
}

function optionalString(value: IntegrationJson): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
