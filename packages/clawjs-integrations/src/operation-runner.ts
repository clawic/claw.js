import {
  findConnectorOperation,
  type ConnectorCatalogError,
} from "./catalog.ts";
import {
  buildConnectorValues,
  invalidConnectorFieldNames,
  redactConnectorSecretValues,
  requiredConnectorFieldNames,
} from "./connector-input.ts";
import {
  auditCredentialLeaseEvent,
  buildConnectorCredentialLeaseRequest,
  credentialLeaseAuditEvent,
  verifyConnectorCredentialLease,
  type ConnectorCredentialLeaseBroker,
  type ConnectorCredentialLeasePolicy,
} from "./credential-lease-broker.ts";
import {
  buildConnectorOperationRuntimePlan,
  type ConnectorOperationRuntimePlan,
} from "./runtime-coverage.ts";
import {
  createConnectorOperationExecutor,
  type ConnectorRuntimeExecutorOptions,
  type ConnectorRuntimeImplementation,
} from "./runtime-registry.ts";
import type {
  ConnectorCatalog,
  ConnectorOperationDefinition,
  ConnectorOperationInput,
  IntegrationJson,
} from "./types.js";

export interface ConnectorExecutionContext {
  operation: ConnectorOperationDefinition;
  values: Record<string, IntegrationJson>;
  secrets: Record<string, string>;
}

export interface ConnectorExecutor {
  execute(ctx: ConnectorExecutionContext): Promise<Record<string, IntegrationJson>>;
}

export interface RunConnectorOperationOptions {
  catalog: ConnectorCatalog;
  operationId: string;
  input?: ConnectorOperationInput;
  dryRun?: boolean;
  executor?: ConnectorExecutor;
  credentialBroker?: ConnectorCredentialLeaseBroker;
  leasePolicy?: ConnectorCredentialLeasePolicy;
  runtimeExecutorOptions?: ConnectorRuntimeExecutorOptions;
  runtimeRegistry?: readonly ConnectorRuntimeImplementation[];
}

export interface ConnectorOperationDryRun {
  status: "dry_run";
  operationId: string;
  appId: string;
  kind: "action" | "source";
  missingFields: string[];
  missingSecrets: string[];
  invalidFields: string[];
  values: Record<string, IntegrationJson>;
  secretRefs: Record<string, string>;
  runtime?: ConnectorOperationRuntimePlan;
}

export interface ConnectorOperationRunResult {
  status: "executed";
  operationId: string;
  appId: string;
  output: Record<string, IntegrationJson>;
  credentialLeaseId?: string;
  credentialLeaseReleased?: boolean;
}

export async function runConnectorOperation(
  options: RunConnectorOperationOptions,
): Promise<ConnectorOperationDryRun | ConnectorOperationRunResult> {
  const found = findConnectorOperation(options.catalog, options.operationId);
  if (!found) {
    throw new Error(`Unknown connector operation: ${options.operationId}`);
  }

  const input = options.input ?? {};
  const values = buildConnectorValues(found.operation.fields, input.values ?? {}, { includeManaged: true });
  const secretRefs = input.secretRefs ?? {};
  const missingFields = requiredConnectorFieldNames(found.operation.fields)
    .filter((fieldName) => values[fieldName] == null || values[fieldName] === "");
  const missingSecrets = found.operation.authFieldNames
    .filter((fieldName) => !secretRefs[fieldName]);
  const invalidFields = invalidConnectorFieldNames(found.operation.fields, values, input.values ?? {});

  if (options.dryRun !== false) {
    return {
      status: "dry_run",
      operationId: found.operation.id,
      appId: found.app.id,
      kind: found.operation.kind,
      missingFields,
      missingSecrets,
      invalidFields,
      values: redactConnectorSecretValues(found.operation.fields, values),
      secretRefs,
      runtime: buildConnectorOperationRuntimePlan(found.operation, values, { registry: options.runtimeRegistry }),
    };
  }

  if (missingFields.length > 0 || missingSecrets.length > 0 || invalidFields.length > 0) {
    throw new Error(`Connector operation is missing or invalid input: ${[...missingFields, ...missingSecrets, ...invalidFields].join(", ")}`);
  }
  if (found.operation.authFieldNames.length > 0 && !options.credentialBroker) {
    throw new Error("Connector operation execution with secrets requires a capability broker; plaintext secret resolution is disabled.");
  }
  const executor = options.executor ?? createConnectorOperationExecutor(found.operation, options.runtimeExecutorOptions, options.runtimeRegistry);
  if (!executor) {
    throw new Error("Connector operation execution requires an explicit executor or registered runtime executor.");
  }

  if (found.operation.authFieldNames.length === 0) {
    const output = await executor.execute({
      operation: found.operation,
      values,
      secrets: {},
    });
    return {
      status: "executed",
      operationId: found.operation.id,
      appId: found.app.id,
      output,
    };
  }

  const broker = options.credentialBroker;
  if (!broker) {
    throw new Error("Connector operation execution with secrets requires a capability broker; plaintext secret resolution is disabled.");
  }
  const leaseRequest = buildConnectorCredentialLeaseRequest({
    appId: found.app.id,
    operationId: found.operation.id,
    purpose: options.leasePolicy?.purpose ?? "operation",
    secretRefs,
    scopes: options.leasePolicy?.scopes,
    ttlSeconds: options.leasePolicy?.ttlSeconds,
    costPolicy: options.leasePolicy?.costPolicy,
    valuesPreview: redactConnectorSecretValues(found.operation.fields, values),
  });
  const lease = await broker.acquire(leaseRequest);
  await auditCredentialLeaseEvent(broker, credentialLeaseAuditEvent({ event: "acquire", lease }));
  let released = false;
  try {
    verifyConnectorCredentialLease(lease, leaseRequest, found.operation.authFieldNames);
    if (broker.heartbeat) {
      await broker.heartbeat(lease, leaseRequest);
      await auditCredentialLeaseEvent(broker, credentialLeaseAuditEvent({ event: "heartbeat", lease }));
    }
    const output = await executor.execute({
      operation: found.operation,
      values,
      secrets: lease.secrets,
    });
    await broker.release(lease, leaseRequest);
    released = true;
    await auditCredentialLeaseEvent(broker, credentialLeaseAuditEvent({ event: "release", lease }));
    return {
      status: "executed",
      operationId: found.operation.id,
      appId: found.app.id,
      output,
      credentialLeaseId: lease.id,
      credentialLeaseReleased: released,
    };
  } finally {
    if (!released) {
      await broker.release(lease, leaseRequest);
      await auditCredentialLeaseEvent(broker, credentialLeaseAuditEvent({ event: "release", lease }));
    }
  }
}

export type { ConnectorCatalogError };
