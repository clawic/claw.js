import {
  buildTelegramOperationRequest,
  createTelegramOperationExecutor,
  isTelegramActionOperationSupported,
} from "./telegram-operation-executor.ts";
import {
  isTelegramSourceOperationSupported,
} from "./telegram-source.ts";
import type {
  ConnectorExecutor,
} from "./operation-runner.js";
import type {
  ConnectorOperationDefinition,
  IntegrationJson,
} from "./types.ts";

export interface ConnectorRuntimeExecutorOptions {
  fetchImpl?: typeof fetch;
}

export interface ConnectorRuntimeRequestPlan {
  method: string;
  endpoint: string;
  auth: { type: "secret"; field: string }[];
  body: Record<string, IntegrationJson>;
}

export interface ConnectorRuntimeSourcePlan {
  delivery: string;
  dedupe?: string;
  hooks: string[];
}

export interface ConnectorRuntimePlanDetails {
  requestPlan?: ConnectorRuntimeRequestPlan;
  sourcePlan?: ConnectorRuntimeSourcePlan;
}

export interface ConnectorRuntimeImplementation {
  appId: string;
  kind: ConnectorOperationDefinition["kind"];
  executorId: string;
  offlineValidated: boolean;
  evidence: string[];
  supports(operation: ConnectorOperationDefinition): boolean;
  createExecutor?(options?: ConnectorRuntimeExecutorOptions): ConnectorExecutor;
  buildPlan?(
    operation: ConnectorOperationDefinition,
    values: Record<string, IntegrationJson>,
  ): ConnectorRuntimePlanDetails;
}

const TELEGRAM_ACTION_EVIDENCE = [
  "packages/clawjs-integrations/src/telegram-operation-executor.test.ts",
];

const TELEGRAM_SOURCE_EVIDENCE = [
  "packages/clawjs-integrations/src/telegram-source.test.ts",
];

export const CONNECTOR_RUNTIME_REGISTRY: readonly ConnectorRuntimeImplementation[] = [
  {
    appId: "telegram_bot_api",
    kind: "action",
    executorId: "telegram-bot-api.action.http",
    offlineValidated: true,
    evidence: TELEGRAM_ACTION_EVIDENCE,
    supports: (operation) => isTelegramActionOperationSupported(operation.id),
    createExecutor: (options) => createTelegramOperationExecutor(options),
    buildPlan: (operation, values) => {
      const request = buildTelegramOperationRequest(operation.id, values);
      return {
        requestPlan: {
          method: request.method,
          endpoint: request.endpoint,
          auth: operation.authFieldNames.map((field) => ({ type: "secret", field })),
          body: request.body,
        },
      };
    },
  },
  {
    appId: "telegram_bot_api",
    kind: "source",
    executorId: "telegram-bot-api.source.polling",
    offlineValidated: true,
    evidence: TELEGRAM_SOURCE_EVIDENCE,
    supports: (operation) => isTelegramSourceOperationSupported(operation.id),
    buildPlan: (operation) => ({
      sourcePlan: {
        delivery: operation.source?.delivery ?? "manual",
        ...(operation.runtime?.dedupe ? { dedupe: operation.runtime.dedupe } : {}),
        hooks: operation.runtime?.hookNames ?? [],
      },
    }),
  },
];

export function findConnectorRuntimeImplementation(
  operation: ConnectorOperationDefinition,
  registry: readonly ConnectorRuntimeImplementation[] = CONNECTOR_RUNTIME_REGISTRY,
): ConnectorRuntimeImplementation | null {
  return registry.find((implementation) => (
    implementation.appId === operation.appId
    && implementation.kind === operation.kind
    && implementation.supports(operation)
  )) ?? null;
}

export function createConnectorOperationExecutor(
  operation: ConnectorOperationDefinition,
  options: ConnectorRuntimeExecutorOptions = {},
  registry: readonly ConnectorRuntimeImplementation[] = CONNECTOR_RUNTIME_REGISTRY,
): ConnectorExecutor | null {
  if (operation.kind !== "action") return null;
  return findConnectorRuntimeImplementation(operation, registry)?.createExecutor?.(options) ?? null;
}
