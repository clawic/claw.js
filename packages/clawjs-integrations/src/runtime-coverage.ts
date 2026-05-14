import fs from "node:fs";
import path from "node:path";

import { ConnectorCatalogError } from "./catalog.ts";
import {
  CONNECTOR_RUNTIME_REGISTRY,
  createConnectorOperationExecutor,
  createConnectorSourceExecutor,
  extractConnectorRuntimeSourceEvents,
  findConnectorRuntimeImplementation,
  type ConnectorRuntimeFixture,
  type ConnectorRuntimeExecutorOptions,
  type ConnectorRuntimeImplementation,
  type ConnectorRuntimeOutputSchema,
  type ConnectorRuntimeOutputSchemaVariant,
  type ConnectorRuntimeRequestPlan,
  type ConnectorRuntimeSourcePlan,
} from "./runtime-registry.ts";
import {
  createConnectorRuntimeFixtureFetch,
  loadConnectorRuntimeFixtures,
} from "./runtime-fixtures.ts";
import type {
  ConnectorCatalog,
  ConnectorFieldDefinition,
  ConnectorOperationDefinition,
  ConnectorUnsupportedRealRuntimeReason,
  IntegrationJson,
} from "./types.ts";

export type ConnectorRuntimeCoverageStatus = "implemented" | "unsupported" | "missing";
export type ConnectorRuntimeAuditStatus = "implemented" | "missing" | "partial" | "impossible";

export interface ConnectorRuntimeCoverageEntry {
  operationId: string;
  appId: string;
  kind: ConnectorOperationDefinition["kind"];
  status: ConnectorRuntimeCoverageStatus;
  executorId?: string;
  offlineValidated: boolean;
  evidence: string[];
  fixtures: ConnectorRuntimeFixture[];
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

export interface ConnectorRuntimeAuditSummary {
  total: number;
  implemented: number;
  missing: number;
  partial: number;
  impossible: number;
  offlineValidated: number;
}

export interface ConnectorRuntimeAuditOperation {
  operationId: string;
  kind: ConnectorOperationDefinition["kind"];
  status: ConnectorRuntimeAuditStatus;
  coverageStatus: ConnectorRuntimeCoverageStatus;
  executorId: string | null;
  offlineValidated: boolean;
  evidence: string[];
  fixtures: ConnectorRuntimeFixture[];
  unsupported_real_runtime_reason?: ConnectorUnsupportedRealRuntimeReason;
  errors: string[];
}

export interface ConnectorRuntimeAuditProvider {
  appId: string;
  name: string;
  summary: ConnectorRuntimeAuditSummary;
  operations: ConnectorRuntimeAuditOperation[];
}

export interface ConnectorRuntimeAuditReport {
  summary: ConnectorRuntimeAuditSummary;
  providers: ConnectorRuntimeAuditProvider[];
  errors: string[];
}

export interface VerifyConnectorRuntimeCoverageOptions {
  allowUnsupportedReasons?: boolean;
  evidenceRoot?: string;
  registry?: readonly ConnectorRuntimeImplementation[];
}

export interface VerifyConnectorRuntimeOfflineExecutionOptions extends VerifyConnectorRuntimeCoverageOptions {
  runtimeExecutorOptions?: Omit<ConnectorRuntimeExecutorOptions, "fetchImpl">;
}

export interface ConnectorRuntimeOfflineExecutionResult {
  operationId: string;
  appId: string;
  kind: ConnectorOperationDefinition["kind"];
  executorId: string;
  ok: boolean;
  error?: string;
}

export interface ConnectorRuntimeOfflineExecutionReport {
  results: ConnectorRuntimeOfflineExecutionResult[];
  errors: string[];
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
  const registry = options.registry ?? CONNECTOR_RUNTIME_REGISTRY;
  const report = evaluateConnectorRuntimeCoverage(catalog, { registry });
  const errors = [...report.errors];
  const evidenceRoot = path.resolve(options.evidenceRoot ?? process.cwd());
  if (!options.allowUnsupportedReasons) {
    for (const entry of report.entries) {
      if (entry.status === "unsupported") {
        errors.push(`unsupported runtime implementation for ${entry.operationId}: ${entry.unsupported_real_runtime_reason?.code ?? "unknown"}`);
      }
    }
  }
  for (const entry of report.entries) {
    if (entry.status === "implemented" && !entry.offlineValidated) {
      errors.push(`runtime implementation for ${entry.operationId} requires offline validation`);
    }
    if (entry.status === "implemented" && !entry.evidence.some((item) => item.trim())) {
      errors.push(`runtime implementation for ${entry.operationId} requires concrete evidence`);
    }
    if (entry.status === "implemented" && entry.fixtures.length === 0) {
      errors.push(`runtime implementation for ${entry.operationId} requires offline fixtures`);
    }
    errors.push(...evidencePathErrors(`runtime implementation for ${entry.operationId}`, entry.evidence, evidenceRoot));
    errors.push(...fixturePathErrors(`runtime implementation for ${entry.operationId}`, entry.fixtures, evidenceRoot));
    if (entry.status === "implemented") {
      const operation = findCatalogOperation(catalog, entry.operationId);
      const implementations = operation ? findConnectorRuntimeImplementations(operation, registry) : [];
      if (implementations.length > 1) {
        errors.push(`runtime implementation for ${entry.operationId} is ambiguous: ${implementations.map((item) => item.executorId).join(", ")}`);
      }
      const implementation = implementations[0] ?? null;
      if (implementation && operation && operationsSupportedByImplementation(catalog, implementation).length > 1) {
        if (!hasOperationScopedFixtures(implementation.fixtures ?? [], operation.id)) {
          errors.push(`runtime implementation for ${entry.operationId} requires operation-scoped offline fixtures`);
        }
      }
      if (operation?.kind === "action") {
        if (!hasActionExecutor(implementation)) errors.push(`runtime implementation for ${entry.operationId} requires a registered action executor`);
        if (!implementation?.planKinds.includes("request")) errors.push(`runtime implementation for ${entry.operationId} requires a request plan kind`);
      }
      if (operation?.kind === "source") {
        if (!hasSourceExecutor(implementation, operation)) errors.push(`runtime implementation for ${entry.operationId} requires a registered source executor`);
        if (!implementation?.planKinds.includes("source")) errors.push(`runtime implementation for ${entry.operationId} requires a source plan kind`);
        if ((operation.source?.delivery === "polling" || operation.source?.delivery === "hybrid") && !implementation?.planKinds.includes("request")) {
          errors.push(`runtime implementation for ${entry.operationId} requires a request plan kind for polling delivery`);
        }
      }
      if (!operation) errors.push(`runtime implementation for ${entry.operationId} requires a catalog operation`);
      errors.push(...runtimeFixtureKindErrors(entry, implementation, operation));
      if (!implementation?.buildPlan) errors.push(`runtime implementation for ${entry.operationId} requires a runtime plan builder`);
      else if (operation) {
        try {
          const details = implementation.buildPlan(operation, sampleValuesForOperation(operation));
          if (implementation.planKinds.includes("request") && !isRequestPlan(details.requestPlan)) {
            errors.push(`runtime implementation for ${entry.operationId} must build a request plan`);
          }
          if (details.requestPlan) {
            const authErrors = requestPlanAuthErrors(operation, details.requestPlan);
            errors.push(...authErrors.map((error) => `runtime implementation for ${entry.operationId} ${error}`));
            if (usesGenericHttpActionExecutor(implementation)) {
              const transportErrors = genericHttpRequestPlanErrors(details.requestPlan);
              errors.push(...transportErrors.map((error) => `runtime implementation for ${entry.operationId} ${error}`));
            }
          }
          if (implementation.planKinds.includes("source") && !isSourcePlan(details.sourcePlan)) {
            errors.push(`runtime implementation for ${entry.operationId} must build a source plan`);
          }
          if (details.sourcePlan) {
            const sourceErrors = sourcePlanContractErrors(operation, details.sourcePlan);
            errors.push(...sourceErrors.map((error) => `runtime implementation for ${entry.operationId} ${error}`));
            if (usesGenericHttpSourceExecutor(implementation)) {
              const genericSourceErrors = genericHttpSourcePlanErrors(details.sourcePlan, details.requestPlan);
              errors.push(...genericSourceErrors.map((error) => `runtime implementation for ${entry.operationId} ${error}`));
            }
          }
        } catch (error) {
          errors.push(`runtime implementation for ${entry.operationId} plan builder failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    if (entry.status !== "unsupported") continue;
    const reason = entry.unsupported_real_runtime_reason;
    if (!reason?.code?.trim()) errors.push(`unsupported runtime reason for ${entry.operationId} requires code`);
    if (!reason?.message?.trim()) errors.push(`unsupported runtime reason for ${entry.operationId} requires message`);
    if (!reason?.evidence?.some((item) => item.trim())) {
      errors.push(`unsupported runtime reason for ${entry.operationId} requires concrete evidence`);
    }
    errors.push(...evidencePathErrors(`unsupported runtime reason for ${entry.operationId}`, reason?.evidence ?? [], evidenceRoot));
  }
  if (errors.length > 0) {
    throw new ConnectorRuntimeCoverageError(
      `Connector runtime coverage failed with ${errors.length} error(s): ${errors.join("; ")}`,
      { ...report, errors },
    );
  }
  return report;
}

export async function verifyConnectorRuntimeOfflineExecutions(
  catalog: ConnectorCatalog,
  options: VerifyConnectorRuntimeOfflineExecutionOptions = {},
): Promise<ConnectorRuntimeOfflineExecutionReport> {
  const registry = options.registry ?? CONNECTOR_RUNTIME_REGISTRY;
  const coverage = verifyConnectorRuntimeCoverage(catalog, options);
  const evidenceRoot = path.resolve(options.evidenceRoot ?? process.cwd());
  const results: ConnectorRuntimeOfflineExecutionResult[] = [];

  for (const entry of coverage.entries.filter((item) => item.status === "implemented")) {
    const operation = findCatalogOperation(catalog, entry.operationId);
    const implementation = operation ? findConnectorRuntimeImplementation(operation, registry) : null;
    if (!operation || !implementation) continue;
    const result = await executeRuntimeImplementationOffline({
      operation,
      implementation,
      evidenceRoot,
      runtimeExecutorOptions: options.runtimeExecutorOptions,
    });
    results.push(result);
  }

  const errors = results
    .filter((result) => !result.ok)
    .map((result) => `runtime offline execution for ${result.operationId} failed: ${result.error ?? "unknown error"}`);
  if (errors.length > 0) {
    throw new ConnectorRuntimeCoverageError(
      `Connector runtime offline execution failed with ${errors.length} error(s): ${errors.join("; ")}`,
      { ...coverage, errors: [...coverage.errors, ...errors] },
    );
  }
  return { results, errors };
}

async function executeRuntimeImplementationOffline(input: {
  operation: ConnectorOperationDefinition;
  implementation: ConnectorRuntimeImplementation;
  evidenceRoot: string;
  runtimeExecutorOptions?: Omit<ConnectorRuntimeExecutorOptions, "fetchImpl">;
}): Promise<ConnectorRuntimeOfflineExecutionResult> {
  try {
    const fixtures = loadConnectorRuntimeFixtures(
      runtimeFixturesForOperation(input.implementation.fixtures ?? [], input.operation.id),
      { evidenceRoot: input.evidenceRoot },
    );
    const runtimeExecutorOptions = {
      ...input.runtimeExecutorOptions,
      fetchImpl: createConnectorRuntimeFixtureFetch(fixtures),
    };
    const values = sampleValuesForOperation(input.operation);
    const secrets = sampleSecretsForOperation(input.operation);
    if (input.operation.kind === "action") {
      const executor = createConnectorOperationExecutor(input.operation, runtimeExecutorOptions, [input.implementation]);
      if (!executor) throw new Error("missing action executor");
      await executor.execute({ operation: input.operation, values, secrets });
    } else if (usesWebhookSourceHandler(input.implementation, input.operation)) {
      const details = input.implementation.buildPlan?.(input.operation, values);
      if (!details?.sourcePlan) throw new Error("missing webhook source plan");
      const fixture = fixtures.find((item) => item.kind === "source_event");
      if (!fixture) throw new Error("missing webhook source event fixture");
      extractConnectorRuntimeSourceEvents(fixture.body, details.sourcePlan);
    } else {
      const executor = createConnectorSourceExecutor(input.operation, runtimeExecutorOptions, [input.implementation]);
      if (!executor) throw new Error("missing source executor");
      await executor.start({
        operation: input.operation,
        values,
        secrets,
        plan: {
          status: "source_plan",
          operationId: input.operation.id,
          appId: input.operation.appId,
          delivery: input.operation.source?.delivery ?? "manual",
          missingFields: [],
          missingSecrets: [],
          invalidFields: [],
          values,
          secretRefs: Object.fromEntries(input.operation.authFieldNames.map((field) => [field, `secret://${field}`])),
          managedInterfaces: [],
          ...(input.operation.runtime?.dedupe ? { dedupe: input.operation.runtime.dedupe } : {}),
          hasHooks: input.operation.runtime?.hasHooks === true,
          stateful: input.operation.source?.usesServiceDb === true,
        },
      });
    }
    return {
      operationId: input.operation.id,
      appId: input.operation.appId,
      kind: input.operation.kind,
      executorId: input.implementation.executorId,
      ok: true,
    };
  } catch (error) {
    return {
      operationId: input.operation.id,
      appId: input.operation.appId,
      kind: input.operation.kind,
      executorId: input.implementation.executorId,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function buildConnectorRuntimeAudit(
  catalog: ConnectorCatalog,
  report: ConnectorRuntimeCoverageReport,
): ConnectorRuntimeAuditReport {
  const providers = catalog.apps.map((app) => {
    const entries = report.entries.filter((entry) => entry.appId === app.id);
    const operations = entries.map((entry) => auditOperation(entry, report.errors));
    return {
      appId: app.id,
      name: app.name,
      summary: summarizeAuditOperations(operations),
      operations,
    };
  });
  return {
    summary: summarizeAuditOperations(providers.flatMap((provider) => provider.operations)),
    providers,
    errors: report.errors,
  };
}

function auditOperation(
  entry: ConnectorRuntimeCoverageEntry,
  errors: readonly string[],
): ConnectorRuntimeAuditOperation {
  const operationErrors = errors.filter((error) => error.includes(entry.operationId));
  return {
    operationId: entry.operationId,
    kind: entry.kind,
    status: auditStatusForEntry(entry, operationErrors),
    coverageStatus: entry.status,
    executorId: entry.executorId ?? null,
    offlineValidated: entry.offlineValidated,
    evidence: entry.evidence,
    fixtures: entry.fixtures,
    ...(entry.unsupported_real_runtime_reason ? { unsupported_real_runtime_reason: entry.unsupported_real_runtime_reason } : {}),
    errors: operationErrors,
  };
}

function auditStatusForEntry(
  entry: ConnectorRuntimeCoverageEntry,
  errors: readonly string[],
): ConnectorRuntimeAuditStatus {
  if (entry.status === "unsupported") return "impossible";
  if (entry.status === "missing") return "missing";
  return errors.length > 0 ? "partial" : "implemented";
}

function summarizeAuditOperations(
  operations: readonly ConnectorRuntimeAuditOperation[],
): ConnectorRuntimeAuditSummary {
  return operations.reduce<ConnectorRuntimeAuditSummary>(
    (summary, operation) => {
      summary.total += 1;
      summary[operation.status] += 1;
      if (operation.offlineValidated) summary.offlineValidated += 1;
      return summary;
    },
    { total: 0, implemented: 0, missing: 0, partial: 0, impossible: 0, offlineValidated: 0 },
  );
}

function hasActionExecutor(implementation: ConnectorRuntimeImplementation | null): boolean {
  return Boolean(implementation?.createExecutor || usesGenericHttpActionExecutor(implementation));
}

function hasSourceExecutor(
  implementation: ConnectorRuntimeImplementation | null,
  operation: ConnectorOperationDefinition | null,
): boolean {
  return Boolean(
    implementation?.createSourceExecutor
    || usesGenericHttpSourceExecutor(implementation)
    || usesWebhookSourceHandler(implementation, operation),
  );
}

function usesGenericHttpActionExecutor(implementation: ConnectorRuntimeImplementation | null): boolean {
  return Boolean(implementation?.baseUrl && implementation.buildPlan && implementation.planKinds.includes("request"));
}

function usesGenericHttpSourceExecutor(implementation: ConnectorRuntimeImplementation | null): boolean {
  return Boolean(
    implementation?.baseUrl
    && implementation.buildPlan
    && implementation.planKinds.includes("request")
    && implementation.planKinds.includes("source"),
  );
}

function usesWebhookSourceHandler(
  implementation: ConnectorRuntimeImplementation | null,
  operation: ConnectorOperationDefinition | null,
): boolean {
  return Boolean(
    operation?.kind === "source"
    && operation.source?.delivery === "webhook"
    && implementation?.buildPlan
    && implementation.planKinds.includes("source")
    && !implementation.planKinds.includes("request"),
  );
}

function evidencePathErrors(label: string, evidence: readonly string[], evidenceRoot: string): string[] {
  const errors: string[] = [];
  for (const item of evidence) {
    const evidencePath = item.trim();
    if (!evidencePath) continue;
    const normalized = path.normalize(evidencePath);
    if (path.isAbsolute(normalized) || normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
      errors.push(`${label} evidence must be a repository-relative file path: ${evidencePath}`);
      continue;
    }
    const resolved = resolveExistingEvidenceFile(evidenceRoot, normalized);
    if (!resolved) errors.push(`${label} evidence file not found: ${evidencePath}`);
  }
  return errors;
}

function fixturePathErrors(label: string, fixtures: readonly ConnectorRuntimeFixture[], evidenceRoot: string): string[] {
  const errors: string[] = [];
  for (const fixture of fixtures) {
    if (fixture.operationId !== undefined && (typeof fixture.operationId !== "string" || !fixture.operationId.trim())) {
      errors.push(`${label} fixture has invalid operationId`);
    }
    if (!["request", "response", "source_event"].includes(fixture.kind)) {
      errors.push(`${label} fixture has invalid kind: ${String(fixture.kind)}`);
    }
    errors.push(...fixtureFilePathErrors(`${label} fixture`, fixture.path, evidenceRoot));
  }
  return errors;
}

function fixtureFilePathErrors(label: string, fixturePath: string, evidenceRoot: string): string[] {
  const normalized = path.normalize(fixturePath);
  if (path.isAbsolute(normalized)) {
    return isFile(normalized) ? [] : [`${label} file not found: ${fixturePath}`];
  }
  return evidencePathErrors(label, [fixturePath], evidenceRoot);
}

function runtimeFixtureKindErrors(
  entry: ConnectorRuntimeCoverageEntry,
  implementation: ConnectorRuntimeImplementation | null,
  operation: ConnectorOperationDefinition | null,
): string[] {
  if (!implementation) return [];
  const errors: string[] = [];
  const fixtureKinds = new Set(
    runtimeFixturesForOperation(entry.fixtures, entry.operationId).map((fixture) => fixture.kind),
  );
  if (implementation.planKinds.includes("request") && !fixtureKinds.has("request")) {
    errors.push(`runtime implementation for ${entry.operationId} requires offline request fixtures`);
  }
  if (operation?.kind === "action" && implementation.planKinds.includes("request") && !fixtureKinds.has("response")) {
    errors.push(`runtime implementation for ${entry.operationId} requires offline response fixtures`);
  }
  if (operation?.kind === "source" && implementation.planKinds.includes("source") && !fixtureKinds.has("source_event")) {
    errors.push(`runtime implementation for ${entry.operationId} requires offline source event fixtures`);
  }
  return errors;
}

function resolveExistingEvidenceFile(evidenceRoot: string, evidencePath: string): string | null {
  let candidateRoot = evidenceRoot;
  for (;;) {
    const candidate = path.resolve(candidateRoot, evidencePath);
    if (isFile(candidate)) return candidate;
    const parent = path.dirname(candidateRoot);
    if (parent === candidateRoot) return null;
    candidateRoot = parent;
  }
}

function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function requestPlanAuthErrors(
  operation: ConnectorOperationDefinition,
  requestPlan: ConnectorRuntimeRequestPlan,
): string[] {
  const errors: string[] = [];
  const expected = new Set(operation.authFieldNames);
  const actual = new Set(requestPlan.auth.map((entry) => entry.field));
  for (const field of expected) {
    if (!actual.has(field)) errors.push(`request plan auth missing ${field}`);
  }
  for (const field of actual) {
    if (!expected.has(field)) errors.push(`request plan auth includes unknown ${field}`);
  }
  return errors;
}

function genericHttpRequestPlanErrors(requestPlan: ConnectorRuntimeRequestPlan): string[] {
  const errors: string[] = [];
  for (const binding of requestPlan.auth) {
    if (!binding.placement) errors.push(`generic HTTP request auth ${binding.field} requires a transport placement`);
  }
  return errors;
}

function genericHttpSourcePlanErrors(
  sourcePlan: ConnectorRuntimeSourcePlan,
  requestPlan: ConnectorRuntimeRequestPlan | undefined,
): string[] {
  if (requestPlan?.pagination?.itemsPath) return [];
  return typeof sourcePlan.eventsPath === "string" && sourcePlan.eventsPath.trim()
    ? []
    : ["generic HTTP source plan requires eventsPath or paginated request itemsPath"];
}

function sourcePlanContractErrors(
  operation: ConnectorOperationDefinition,
  sourcePlan: ConnectorRuntimeSourcePlan,
): string[] {
  if (operation.kind !== "source") return ["source plan is only valid for source operations"];
  const errors: string[] = [];
  const expectedDelivery = operation.source?.delivery ?? "manual";
  if (sourcePlan.delivery !== expectedDelivery) {
    errors.push(`source plan delivery ${sourcePlan.delivery} expected ${expectedDelivery}`);
  }
  const expectedHooks = operation.runtime?.hookNames ?? [];
  if (!sameStringSet(sourcePlan.hooks, expectedHooks)) {
    errors.push(`source plan hooks ${formatStringList(sourcePlan.hooks)} expected ${formatStringList(expectedHooks)}`);
  }
  const expectedDedupe = operation.runtime?.dedupe;
  if (sourcePlan.dedupe !== expectedDedupe) {
    errors.push(`source plan dedupe ${sourcePlan.dedupe ?? "<missing>"} expected ${expectedDedupe ?? "<missing>"}`);
  }
  return errors;
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const rightValues = new Set(right);
  return left.every((value) => rightValues.has(value));
}

function formatStringList(values: readonly string[]): string {
  return values.length ? values.join(",") : "<empty>";
}

function isRequestPlan(value: ConnectorRuntimeRequestPlan | undefined): boolean {
  return Boolean(
    value
    && typeof value.method === "string"
    && value.method.trim()
    && typeof value.endpoint === "string"
    && value.endpoint.trim()
    && Array.isArray(value.auth)
    && value.auth.every(isAuthBinding)
    && isStringRecord(value.headers)
    && isOptionalJsonRecord(value.query)
    && isRequiredJsonRecord(value.body)
    && (value.bodyValue === undefined || isIntegrationJson(value.bodyValue))
    && (
      value.responseBodyEncoding === undefined
      || ["json", "text", "base64"].includes(value.responseBodyEncoding)
    )
    && isOutputSchema(value.responseSchema)
  );
}

function isOutputSchema(value: ConnectorRuntimeOutputSchema | undefined): boolean {
  return Boolean(
    value
    && (
      isOutputSchemaVariant(value)
      || (
        value.type === undefined
        && value.requiredPaths === undefined
        && Array.isArray(value.oneOf)
        && value.oneOf.length > 0
        && value.oneOf.every(isOutputSchemaVariant)
      )
    ),
  );
}

function isOutputSchemaVariant(value: ConnectorRuntimeOutputSchema | ConnectorRuntimeOutputSchemaVariant | undefined): boolean {
  if (!value || ("oneOf" in value && value.oneOf !== undefined)) return false;

  return Boolean(
    value.type !== undefined
    && ["object", "array", "string", "number", "boolean", "null"].includes(value.type)
    && (value.requiredPaths === undefined || (
      Array.isArray(value.requiredPaths)
      && value.requiredPaths.every((path) => typeof path === "string" && path.trim())
    )),
  );
}

function isAuthBinding(value: ConnectorRuntimeRequestPlan["auth"][number]): boolean {
  if (value.type !== "secret") return false;
  if (typeof value.field !== "string" || !value.field.trim()) return false;
  if (value.placement && !["bearer", "header", "query", "path", "cookie"].includes(value.placement)) return false;
  if (
    (value.placement === "header" || value.placement === "query" || value.placement === "path" || value.placement === "cookie")
    && (typeof value.name !== "string" || !value.name.trim())
  ) {
    return false;
  }
  if (value.prefix !== undefined && typeof value.prefix !== "string") return false;
  return true;
}

function isStringRecord(value: Record<string, string> | undefined): boolean {
  return value === undefined || (
    isPlainRecord(value)
    && Object.values(value).every((entry) => typeof entry === "string")
  );
}

function isOptionalJsonRecord(value: Record<string, IntegrationJson> | undefined): boolean {
  return value === undefined || isRequiredJsonRecord(value);
}

function isRequiredJsonRecord(value: Record<string, IntegrationJson> | undefined): boolean {
  return Boolean(
    value
    && isPlainRecord(value)
    && Object.values(value).every(isIntegrationJson),
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isIntegrationJson(value: unknown): value is IntegrationJson {
  if (value === null) return true;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.every(isIntegrationJson);
  if (isPlainRecord(value)) return Object.values(value).every(isIntegrationJson);
  return false;
}

function isSourcePlan(value: ConnectorRuntimeSourcePlan | undefined): boolean {
  return Boolean(
    value
    && typeof value.delivery === "string"
    && value.delivery.trim()
    && Array.isArray(value.hooks)
    && isOptionalPath(value.eventsPath)
    && isOptionalPath(value.nextCursorPath)
    && isOptionalPath(value.nextOffsetPath),
  );
}

function isOptionalPath(value: string | undefined): boolean {
  return value === undefined || (typeof value === "string" && value.trim().length > 0);
}

function sampleValuesForOperation(operation: ConnectorOperationDefinition): Record<string, IntegrationJson> {
  const values: Record<string, IntegrationJson> = {};
  for (const field of operation.fields) {
    if (field.managed || field.secret) continue;
    values[field.name] = sampleValueForField(field);
  }
  return values;
}

function sampleSecretsForOperation(operation: ConnectorOperationDefinition): Record<string, string> {
  return Object.fromEntries(operation.authFieldNames.map((field) => [field, `offline-${field}-secret`]));
}

function sampleValueForField(field: ConnectorFieldDefinition): IntegrationJson {
  if (Object.prototype.hasOwnProperty.call(field, "default")) return field.default ?? null;
  if (field.options?.length) return field.options[0]?.value ?? null;
  if (field.type === "boolean") return false;
  if (field.type === "integer" || field.type === "number") return field.min ?? 1;
  if (field.type === "array") return [];
  if (field.name === "mediaType") return "Document/Image";
  if (field.name === "media") return "https://example.invalid/media";
  return "sample";
}

function findCatalogOperation(
  catalog: ConnectorCatalog,
  operationId: string,
): ConnectorOperationDefinition | null {
  for (const app of catalog.apps) {
    const operation = app.operations.find((candidate) => candidate.id === operationId);
    if (operation) return operation;
  }
  return null;
}

function operationsSupportedByImplementation(
  catalog: ConnectorCatalog,
  implementation: ConnectorRuntimeImplementation,
): ConnectorOperationDefinition[] {
  return catalog.apps
    .flatMap((app) => app.operations)
    .filter((operation) => (
      operation.appId === implementation.appId
      && operation.kind === implementation.kind
      && implementation.supports(operation)
    ));
}

function hasOperationScopedFixtures(
  fixtures: readonly ConnectorRuntimeFixture[],
  operationId: string,
): boolean {
  return fixtures.some((fixture) => fixture.operationId === operationId);
}

function runtimeFixturesForOperation(
  fixtures: readonly ConnectorRuntimeFixture[],
  operationId: string,
): ConnectorRuntimeFixture[] {
  const scoped = fixtures.filter((fixture) => fixture.operationId === operationId);
  if (scoped.length > 0) return scoped;
  return fixtures.filter((fixture) => fixture.operationId === undefined);
}

function findConnectorRuntimeImplementations(
  operation: ConnectorOperationDefinition,
  registry: readonly ConnectorRuntimeImplementation[],
): ConnectorRuntimeImplementation[] {
  return registry.filter((implementation) => (
    implementation.appId === operation.appId
    && implementation.kind === operation.kind
    && implementation.supports(operation)
  ));
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
      fixtures: [],
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
      fixtures: runtimeFixturesForOperation(implementation.fixtures ?? [], operation.id),
    };
  }
  return {
    operationId: operation.id,
    appId: operation.appId,
    kind: operation.kind,
    status: "missing",
    offlineValidated: false,
    evidence: [],
    fixtures: [],
  };
}
