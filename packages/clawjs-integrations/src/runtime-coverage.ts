import { ConnectorCatalogError } from "./catalog.ts";
import {
  buildTelegramOperationRequest,
  isTelegramActionOperationSupported,
} from "./telegram-operation-executor.ts";
import {
  isTelegramSourceOperationSupported,
} from "./telegram-source.ts";
import type {
  ConnectorCatalog,
  ConnectorOperationDefinition,
  ConnectorUnsupportedRealRuntimeReason,
  IntegrationJson,
} from "./types.ts";

export type ConnectorRuntimeCoverageStatus = "implemented" | "unsupported" | "missing";

export interface ConnectorRuntimeCoverageEntry {
  operationId: string;
  appId: string;
  kind: ConnectorOperationDefinition["kind"];
  status: ConnectorRuntimeCoverageStatus;
  executorId?: string;
  offlineValidated: boolean;
  evidence: string[];
  unsupported_real_runtime_reason?: ConnectorUnsupportedRealRuntimeReason;
}

export interface ConnectorRuntimeCoverageSummary {
  total: number;
  implemented: number;
  unsupported: number;
  missing: number;
  offlineValidated: number;
}

export interface ConnectorRuntimeCoverageReport {
  summary: ConnectorRuntimeCoverageSummary;
  entries: ConnectorRuntimeCoverageEntry[];
  errors: string[];
}

export interface VerifyConnectorRuntimeCoverageOptions {
  allowUnsupportedReasons?: boolean;
}

export interface ConnectorOperationRuntimePlan {
  status: ConnectorRuntimeCoverageStatus;
  operationId: string;
  appId: string;
  kind: ConnectorOperationDefinition["kind"];
  executorId?: string;
  offlineValidated: boolean;
  evidence: string[];
  requestPlan?: {
    method: string;
    endpoint: string;
    auth: { type: "secret"; field: string }[];
    body: Record<string, IntegrationJson>;
  };
  sourcePlan?: {
    delivery: string;
    dedupe?: string;
    hooks: string[];
  };
  unsupported_real_runtime_reason?: ConnectorUnsupportedRealRuntimeReason;
}

export class ConnectorRuntimeCoverageError extends ConnectorCatalogError {
  readonly report: ConnectorRuntimeCoverageReport;

  constructor(message: string, report: ConnectorRuntimeCoverageReport) {
    super(message);
    this.name = "ConnectorRuntimeCoverageError";
    this.report = report;
  }
}

const TELEGRAM_ACTION_EVIDENCE = [
  "packages/clawjs-integrations/src/telegram-operation-executor.test.ts",
];

const TELEGRAM_SOURCE_EVIDENCE = [
  "packages/clawjs-integrations/src/telegram-source.test.ts",
];

export function evaluateConnectorRuntimeCoverage(catalog: ConnectorCatalog): ConnectorRuntimeCoverageReport {
  const entries = catalog.apps.flatMap((app) => app.operations.map((operation) => coverageEntry(operation)));
  const summary = entries.reduce<ConnectorRuntimeCoverageSummary>(
    (acc, entry) => {
      acc.total += 1;
      acc[entry.status] += 1;
      if (entry.offlineValidated) acc.offlineValidated += 1;
      return acc;
    },
    { total: 0, implemented: 0, unsupported: 0, missing: 0, offlineValidated: 0 },
  );
  const errors = entries
    .filter((entry) => entry.status === "missing")
    .map((entry) => `missing runtime implementation for ${entry.operationId}`);
  return { summary, entries, errors };
}

export function verifyConnectorRuntimeCoverage(
  catalog: ConnectorCatalog,
  options: VerifyConnectorRuntimeCoverageOptions = {},
): ConnectorRuntimeCoverageReport {
  const report = evaluateConnectorRuntimeCoverage(catalog);
  const errors = [...report.errors];
  if (!options.allowUnsupportedReasons) {
    for (const entry of report.entries) {
      if (entry.status === "unsupported") {
        errors.push(`unsupported runtime implementation for ${entry.operationId}: ${entry.unsupported_real_runtime_reason?.code ?? "unknown"}`);
      }
    }
  }
  if (errors.length > 0) {
    throw new ConnectorRuntimeCoverageError(
      `Connector runtime coverage failed with ${errors.length} error(s).`,
      { ...report, errors },
    );
  }
  return report;
}

export function buildConnectorOperationRuntimePlan(
  operation: ConnectorOperationDefinition,
  values: Record<string, IntegrationJson> = {},
): ConnectorOperationRuntimePlan {
  const entry = coverageEntry(operation);
  const base = {
    status: entry.status,
    operationId: entry.operationId,
    appId: entry.appId,
    kind: entry.kind,
    ...(entry.executorId ? { executorId: entry.executorId } : {}),
    offlineValidated: entry.offlineValidated,
    evidence: entry.evidence,
    ...(entry.unsupported_real_runtime_reason ? { unsupported_real_runtime_reason: entry.unsupported_real_runtime_reason } : {}),
  };
  if (entry.status === "implemented" && operation.appId === "telegram_bot_api" && operation.kind === "action") {
    const request = buildTelegramOperationRequest(operation.id, values);
    return {
      ...base,
      requestPlan: {
        method: request.method,
        endpoint: request.endpoint,
        auth: operation.authFieldNames.map((field) => ({ type: "secret" as const, field })),
        body: request.body,
      },
    };
  }
  if (entry.status === "implemented" && operation.appId === "telegram_bot_api" && operation.kind === "source") {
    return {
      ...base,
      sourcePlan: {
        delivery: operation.source?.delivery ?? "manual",
        ...(operation.runtime?.dedupe ? { dedupe: operation.runtime.dedupe } : {}),
        hooks: operation.runtime?.hookNames ?? [],
      },
    };
  }
  return base;
}

function coverageEntry(operation: ConnectorOperationDefinition): ConnectorRuntimeCoverageEntry {
  const unsupported = operation.unsupported_real_runtime_reason;
  if (unsupported) {
    return {
      operationId: operation.id,
      appId: operation.appId,
      kind: operation.kind,
      status: "unsupported",
      offlineValidated: false,
      evidence: unsupported.evidence,
      unsupported_real_runtime_reason: unsupported,
    };
  }
  if (operation.appId === "telegram_bot_api" && operation.kind === "action" && isTelegramActionOperationSupported(operation.id)) {
    return {
      operationId: operation.id,
      appId: operation.appId,
      kind: operation.kind,
      status: "implemented",
      executorId: "telegram-bot-api.action.http",
      offlineValidated: true,
      evidence: TELEGRAM_ACTION_EVIDENCE,
    };
  }
  if (operation.appId === "telegram_bot_api" && operation.kind === "source" && isTelegramSourceOperationSupported(operation.id)) {
    return {
      operationId: operation.id,
      appId: operation.appId,
      kind: operation.kind,
      status: "implemented",
      executorId: "telegram-bot-api.source.polling",
      offlineValidated: true,
      evidence: TELEGRAM_SOURCE_EVIDENCE,
    };
  }
  return {
    operationId: operation.id,
    appId: operation.appId,
    kind: operation.kind,
    status: "missing",
    offlineValidated: false,
    evidence: [],
  };
}
