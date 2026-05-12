import { ConnectorCatalogError } from "./catalog.ts";
import {
  CONNECTOR_RUNTIME_REGISTRY,
  findConnectorRuntimeImplementation,
  type ConnectorRuntimeImplementation,
  type ConnectorRuntimeRequestPlan,
  type ConnectorRuntimeSourcePlan,
} from "./runtime-registry.ts";
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
  registry?: readonly ConnectorRuntimeImplementation[];
}

export interface ConnectorOperationRuntimePlan {
  status: ConnectorRuntimeCoverageStatus;
  operationId: string;
  appId: string;
  kind: ConnectorOperationDefinition["kind"];
  executorId?: string;
  offlineValidated: boolean;
  evidence: string[];
  requestPlan?: ConnectorRuntimeRequestPlan;
  sourcePlan?: ConnectorRuntimeSourcePlan;
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

export function evaluateConnectorRuntimeCoverage(
  catalog: ConnectorCatalog,
  options: { registry?: readonly ConnectorRuntimeImplementation[] } = {},
): ConnectorRuntimeCoverageReport {
  const registry = options.registry ?? CONNECTOR_RUNTIME_REGISTRY;
  const entries = catalog.apps.flatMap((app) => app.operations.map((operation) => coverageEntry(operation, registry)));
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
  const report = evaluateConnectorRuntimeCoverage(catalog, { registry: options.registry });
  const errors = [...report.errors];
  if (!options.allowUnsupportedReasons) {
    for (const entry of report.entries) {
      if (entry.status === "unsupported") {
        errors.push(`unsupported runtime implementation for ${entry.operationId}: ${entry.unsupported_real_runtime_reason?.code ?? "unknown"}`);
      }
    }
  }
  for (const entry of report.entries) {
    if (entry.status !== "unsupported") continue;
    const reason = entry.unsupported_real_runtime_reason;
    if (!reason?.code?.trim()) errors.push(`unsupported runtime reason for ${entry.operationId} requires code`);
    if (!reason?.message?.trim()) errors.push(`unsupported runtime reason for ${entry.operationId} requires message`);
    if (!reason?.evidence?.some((item) => item.trim())) {
      errors.push(`unsupported runtime reason for ${entry.operationId} requires concrete evidence`);
    }
  }
  if (errors.length > 0) {
    throw new ConnectorRuntimeCoverageError(
      `Connector runtime coverage failed with ${errors.length} error(s): ${errors.join("; ")}`,
      { ...report, errors },
    );
  }
  return report;
}

export function buildConnectorOperationRuntimePlan(
  operation: ConnectorOperationDefinition,
  values: Record<string, IntegrationJson> = {},
  options: { registry?: readonly ConnectorRuntimeImplementation[] } = {},
): ConnectorOperationRuntimePlan {
  const registry = options.registry ?? CONNECTOR_RUNTIME_REGISTRY;
  const entry = coverageEntry(operation, registry);
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
  if (entry.status === "implemented") {
    const implementation = findConnectorRuntimeImplementation(operation, registry);
    return {
      ...base,
      ...implementation?.buildPlan?.(operation, values),
    };
  }
  return base;
}

function coverageEntry(
  operation: ConnectorOperationDefinition,
  registry: readonly ConnectorRuntimeImplementation[],
): ConnectorRuntimeCoverageEntry {
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
  const implementation = findConnectorRuntimeImplementation(operation, registry);
  if (implementation) {
    return {
      operationId: operation.id,
      appId: operation.appId,
      kind: operation.kind,
      status: "implemented",
      executorId: implementation.executorId,
      offlineValidated: implementation.offlineValidated,
      evidence: implementation.evidence,
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
