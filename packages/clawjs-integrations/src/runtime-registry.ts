import {
  buildTelegramOperationRequest,
  createTelegramOperationExecutor,
  isTelegramActionOperationSupported,
} from "./telegram-operation-executor.ts";
import {
  isTelegramSourceOperationSupported,
  TELEGRAM_POLL_UPDATE_TYPES,
} from "./telegram-source.ts";
import {
  createTelegramSourceExecutor,
} from "./telegram-source-executor.ts";
import {
  executeConnectorRuntimePaginatedRequestPlan,
  executeConnectorRuntimeRequestPlan,
  type ConnectorRuntimeHttpOptions,
} from "./runtime-http.ts";
import type {
  ConnectorExecutor,
} from "./operation-runner.js";
import type {
  ConnectorSourceExecutor,
} from "./source-runner.js";
import type {
  ConnectorOperationDefinition,
  IntegrationJson,
} from "./types.ts";

export interface ConnectorRuntimeExecutorOptions extends ConnectorRuntimeHttpOptions {}

export type ConnectorRuntimeAuthPlacement = "bearer" | "header" | "query" | "path" | "cookie";

export interface ConnectorRuntimeAuthBinding {
  type: "secret";
  field: string;
  placement?: ConnectorRuntimeAuthPlacement;
  name?: string;
  prefix?: string;
}

export interface ConnectorRuntimeRequestPlan {
  method: string;
  url?: string;
  endpoint: string;
  auth: ConnectorRuntimeAuthBinding[];
  headers?: Record<string, string>;
  query?: Record<string, IntegrationJson>;
  body: Record<string, IntegrationJson>;
  bodyEncoding?: "json" | "form" | "none";
  pagination?: ConnectorRuntimePaginationPlan;
  responseSchema?: ConnectorRuntimeOutputSchema;
}

export type ConnectorRuntimeJsonType = "object" | "array" | "string" | "number" | "boolean" | "null";

export interface ConnectorRuntimeOutputSchema {
  type: ConnectorRuntimeJsonType;
  requiredPaths?: string[];
}

export type ConnectorRuntimePaginationMode = "cursor" | "offset" | "next_url";

export interface ConnectorRuntimePaginationPlan {
  mode: ConnectorRuntimePaginationMode;
  itemsPath?: string;
  nextCursorPath?: string;
  nextUrlPath?: string;
  cursorParam?: string;
  offsetParam?: string;
  limitParam?: string;
  pageSize?: number;
  maxPages?: number;
}

export interface ConnectorRuntimeSourcePlan {
  delivery: string;
  dedupe?: string;
  hooks: string[];
  eventsPath?: string;
  nextCursorPath?: string;
  nextOffsetPath?: string;
}

export type ConnectorRuntimeSourceEventExtraction = Record<string, IntegrationJson> & {
  events: IntegrationJson[];
};

export interface ConnectorRuntimePlanDetails {
  requestPlan?: ConnectorRuntimeRequestPlan;
  sourcePlan?: ConnectorRuntimeSourcePlan;
}

export type ConnectorRuntimePlanKind = "request" | "source";

export type ConnectorRuntimeFixtureKind = "request" | "response" | "source_event";

export interface ConnectorRuntimeFixture {
  kind: ConnectorRuntimeFixtureKind;
  path: string;
  operationId?: string;
}

export interface ConnectorRuntimeImplementation {
  appId: string;
  kind: ConnectorOperationDefinition["kind"];
  executorId: string;
  baseUrl?: string;
  offlineValidated: boolean;
  evidence: string[];
  fixtures?: ConnectorRuntimeFixture[];
  planKinds: ConnectorRuntimePlanKind[];
  supports(operation: ConnectorOperationDefinition): boolean;
  createExecutor?(options?: ConnectorRuntimeExecutorOptions): ConnectorExecutor;
  createSourceExecutor?(options?: ConnectorRuntimeExecutorOptions): ConnectorSourceExecutor;
  buildPlan?(
    operation: ConnectorOperationDefinition,
    values: Record<string, IntegrationJson>,
  ): ConnectorRuntimePlanDetails;
}

const TELEGRAM_ACTION_EVIDENCE = [
  "packages/clawjs-integrations/src/telegram-operation-executor.test.ts",
];

const TELEGRAM_ACTION_FIXTURES: ConnectorRuntimeFixture[] = [
  {
    kind: "request",
    path: "packages/clawjs-integrations/fixtures/telegram-send-message-request.json",
  },
  {
    kind: "response",
    path: "packages/clawjs-integrations/fixtures/telegram-send-message-response.json",
  },
];

const TELEGRAM_SOURCE_EVIDENCE = [
  "packages/clawjs-integrations/src/telegram-source.test.ts",
];

const TELEGRAM_SOURCE_FIXTURES: ConnectorRuntimeFixture[] = [
  {
    kind: "request",
    path: "packages/clawjs-integrations/fixtures/telegram-get-updates-request.json",
  },
  {
    kind: "source_event",
    path: "packages/clawjs-integrations/fixtures/telegram-get-updates-response.json",
  },
];

export const CONNECTOR_RUNTIME_REGISTRY: readonly ConnectorRuntimeImplementation[] = [
  {
    appId: "telegram_bot_api",
    kind: "action",
    executorId: "telegram-bot-api.action.http",
    offlineValidated: true,
    evidence: TELEGRAM_ACTION_EVIDENCE,
    fixtures: TELEGRAM_ACTION_FIXTURES,
    planKinds: ["request"],
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
          responseSchema: {
            type: "object",
            requiredPaths: ["ok"],
          },
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
    fixtures: TELEGRAM_SOURCE_FIXTURES,
    planKinds: ["request", "source"],
    supports: (operation) => isTelegramSourceOperationSupported(operation.id),
    createSourceExecutor: (options) => createTelegramSourceExecutor(options),
    buildPlan: (operation, values) => ({
      requestPlan: {
        method: "GET",
        endpoint: "getUpdates",
        auth: operation.authFieldNames.map((field) => ({ type: "secret", field })),
        headers: { accept: "application/json" },
        query: {
          timeout: "0",
          allowed_updates: JSON.stringify(TELEGRAM_POLL_UPDATE_TYPES),
          ...(values.offset == null || values.offset === "" ? {} : { offset: values.offset }),
          ...(values.limit == null || values.limit === "" ? {} : { limit: values.limit }),
        },
        body: {},
        responseSchema: {
          type: "object",
          requiredPaths: ["ok"],
        },
      },
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
  const implementation = findConnectorRuntimeImplementation(operation, registry);
  if (!implementation) return null;
  return implementation.createExecutor?.(options)
    ?? createHttpConnectorOperationExecutor(implementation, options);
}

export function createConnectorSourceExecutor(
  operation: ConnectorOperationDefinition,
  options: ConnectorRuntimeExecutorOptions = {},
  registry: readonly ConnectorRuntimeImplementation[] = CONNECTOR_RUNTIME_REGISTRY,
): ConnectorSourceExecutor | null {
  if (operation.kind !== "source") return null;
  const implementation = findConnectorRuntimeImplementation(operation, registry);
  if (!implementation) return null;
  return implementation.createSourceExecutor?.(options)
    ?? createHttpConnectorSourceExecutor(implementation, options);
}

function createHttpConnectorOperationExecutor(
  implementation: ConnectorRuntimeImplementation,
  options: ConnectorRuntimeExecutorOptions,
): ConnectorExecutor | null {
  if (!implementation.baseUrl || !implementation.buildPlan || !implementation.planKinds.includes("request")) return null;
  return {
    async execute(ctx) {
      const details = implementation.buildPlan?.(ctx.operation, ctx.values);
      if (!details?.requestPlan) {
        throw new Error(`Connector runtime implementation ${implementation.executorId} did not build a request plan.`);
      }
      const baseUrl = options.baseUrl ?? implementation.baseUrl;
      if (details.requestPlan.pagination) {
        const result = await executeConnectorRuntimePaginatedRequestPlan({
          ...httpOptions(options),
          baseUrl,
          plan: details.requestPlan,
          secrets: ctx.secrets,
        });
        return {
          items: result.items,
          responses: result.responses as unknown as IntegrationJson,
        };
      }
      const response = await executeConnectorRuntimeRequestPlan({
        ...httpOptions(options),
        baseUrl,
        plan: details.requestPlan,
        secrets: ctx.secrets,
      });
      return recordFromRuntimeOutput(response.body);
    },
  };
}

function createHttpConnectorSourceExecutor(
  implementation: ConnectorRuntimeImplementation,
  options: ConnectorRuntimeExecutorOptions,
): ConnectorSourceExecutor | null {
  if (!implementation.baseUrl || !implementation.buildPlan || !implementation.planKinds.includes("request") || !implementation.planKinds.includes("source")) {
    return null;
  }
  return {
    async start(ctx) {
      const details = implementation.buildPlan?.(ctx.operation, ctx.values);
      if (!details?.requestPlan || !details.sourcePlan) {
        throw new Error(`Connector runtime implementation ${implementation.executorId} did not build a source request plan.`);
      }
      const baseUrl = options.baseUrl ?? implementation.baseUrl;
      if (details.requestPlan.pagination) {
        const result = await executeConnectorRuntimePaginatedRequestPlan({
          ...httpOptions(options),
          baseUrl,
          plan: details.requestPlan,
          secrets: ctx.secrets,
        });
        return {
          events: result.items,
          responses: result.responses as unknown as IntegrationJson,
        };
      }
      const response = await executeConnectorRuntimeRequestPlan({
        ...httpOptions(options),
        baseUrl,
        plan: details.requestPlan,
        secrets: ctx.secrets,
      });
      return extractConnectorRuntimeSourceEvents(response.body, details.sourcePlan);
    },
  };
}

export function extractConnectorRuntimeSourceEvents(
  body: IntegrationJson,
  sourcePlan: ConnectorRuntimeSourcePlan,
): ConnectorRuntimeSourceEventExtraction {
  return {
    events: eventsFromRuntimeSourceResponse(body, sourcePlan.eventsPath),
    ...cursorOutputsFromRuntimeSourceResponse(body, sourcePlan),
  };
}

function httpOptions(options: ConnectorRuntimeExecutorOptions): ConnectorRuntimeHttpOptions {
  return {
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    ...(typeof options.maxRetries === "number" ? { maxRetries: options.maxRetries } : {}),
    ...(typeof options.retryDelayMs === "number" ? { retryDelayMs: options.retryDelayMs } : {}),
    ...(options.sleep ? { sleep: options.sleep } : {}),
  };
}

function recordFromRuntimeOutput(output: IntegrationJson): Record<string, IntegrationJson> {
  return output && typeof output === "object" && !Array.isArray(output)
    ? output as Record<string, IntegrationJson>
    : { result: output };
}

function eventsFromRuntimeSourceResponse(body: IntegrationJson, eventsPath: string | undefined): IntegrationJson[] {
  const value = valueAtRuntimePath(body, eventsPath);
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function cursorOutputsFromRuntimeSourceResponse(
  body: IntegrationJson,
  sourcePlan: ConnectorRuntimeSourcePlan,
): Record<string, IntegrationJson> {
  return {
    ...(sourcePlan.nextCursorPath ? optionalOutput("nextCursor", valueAtRuntimePath(body, sourcePlan.nextCursorPath)) : {}),
    ...(sourcePlan.nextOffsetPath ? optionalOutput("nextOffset", valueAtRuntimePath(body, sourcePlan.nextOffsetPath)) : {}),
  };
}

function optionalOutput(key: string, value: IntegrationJson | undefined): Record<string, IntegrationJson> {
  return value == null || value === "" ? {} : { [key]: value };
}

function valueAtRuntimePath(value: IntegrationJson, path: string | undefined): IntegrationJson | undefined {
  if (!path) return value;
  let current: IntegrationJson | undefined = value;
  for (const segment of path.split(".").filter(Boolean)) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = current[segment];
  }
  return current;
}
