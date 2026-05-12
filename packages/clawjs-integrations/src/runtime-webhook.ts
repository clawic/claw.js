import {
  extractConnectorRuntimeSourceEvents,
  findConnectorRuntimeImplementation,
  type ConnectorRuntimeImplementation,
  type ConnectorRuntimeSourceEventExtraction,
} from "./runtime-registry.ts";
import type {
  ConnectorOperationDefinition,
  ConnectorSourceDeliveryMode,
  IntegrationJson,
} from "./types.ts";

export interface ConnectorRuntimeWebhookInput {
  operation: ConnectorOperationDefinition;
  payload: IntegrationJson;
  values?: Record<string, IntegrationJson>;
  registry?: readonly ConnectorRuntimeImplementation[];
}

export interface ConnectorRuntimeWebhookResult extends ConnectorRuntimeSourceEventExtraction {
  operationId: string;
  appId: string;
  executorId: string;
  delivery: ConnectorSourceDeliveryMode;
}

export function handleConnectorRuntimeWebhook(
  input: ConnectorRuntimeWebhookInput,
): ConnectorRuntimeWebhookResult {
  if (input.operation.kind !== "source") {
    throw new Error(`Connector runtime webhook requires a source operation: ${input.operation.id}`);
  }
  const implementation = findConnectorRuntimeImplementation(input.operation, input.registry);
  if (!implementation?.buildPlan || !implementation.planKinds.includes("source")) {
    throw new Error(`Connector runtime webhook requires a registered source implementation: ${input.operation.id}`);
  }
  const details = implementation.buildPlan(input.operation, input.values ?? {});
  if (!details.sourcePlan) {
    throw new Error(`Connector runtime webhook implementation ${implementation.executorId} did not build a source plan.`);
  }
  if (details.sourcePlan.delivery !== "webhook" && details.sourcePlan.delivery !== "hybrid") {
    throw new Error(`Connector runtime webhook requires webhook or hybrid delivery: ${input.operation.id}`);
  }
  return {
    operationId: input.operation.id,
    appId: input.operation.appId,
    executorId: implementation.executorId,
    delivery: details.sourcePlan.delivery,
    ...extractConnectorRuntimeSourceEvents(input.payload, details.sourcePlan),
  };
}
