import type {
  ConnectorRuntimeRequestPlan,
} from "./runtime-registry.ts";
import type {
  ConnectorOperationDefinition,
  IntegrationJson,
} from "./types.ts";

export type WhatsAppRuntimeOperation = "verify-phone-number" | "send-text-message";

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
    case "send-text-message": {
      const body: Record<string, IntegrationJson> = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: requiredString(values.to, "to"),
        type: "text",
        text: {
          body: requiredString(values.text, "text"),
        },
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
  }
}

function whatsAppRuntimeOperation(operationId: string): WhatsAppRuntimeOperation | null {
  const slug = operationId.split(".").at(-1);
  if (slug === "verify-phone-number" || slug === "get-phone-number") return "verify-phone-number";
  if (slug === "send-message" || slug === "send-text-message") return "send-text-message";
  return null;
}

function requiredString(value: IntegrationJson, name: string): string {
  const parsed = optionalString(value);
  if (!parsed) throw new Error(`WhatsApp ${name} is required`);
  return parsed;
}

function optionalString(value: IntegrationJson): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
