import type {
  ConnectorRuntimeSourcePlan,
} from "./runtime-registry.ts";
import type {
  ConnectorOperationDefinition,
} from "./types.ts";

export type WhatsAppSourceOperation = "new-message" | "message-status";

export function isWhatsAppSourceOperationSupported(operationId: string): boolean {
  return whatsAppSourceOperation(operationId) !== null;
}

export function buildWhatsAppSourcePlan(operation: ConnectorOperationDefinition): ConnectorRuntimeSourcePlan {
  const sourceOperation = whatsAppSourceOperation(operation.id);
  if (!sourceOperation) {
    throw new Error(`Unsupported WhatsApp source operation: ${operation.id}`);
  }
  switch (sourceOperation) {
    case "new-message":
      return {
        delivery: "webhook",
        dedupe: "id",
        hooks: [],
        eventsPath: "entry.changes.value.messages",
      };
    case "message-status":
      return {
        delivery: "webhook",
        dedupe: "id",
        hooks: [],
        eventsPath: "entry.changes.value.statuses",
      };
  }
}

function whatsAppSourceOperation(operationId: string): WhatsAppSourceOperation | null {
  const slug = operationId.split(".").at(-1);
  if (slug === "new-message" || slug === "message-received") return "new-message";
  if (slug === "message-status" || slug === "message-status-updated") return "message-status";
  return null;
}
