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
  createConnectorSourceExecutor,
  type ConnectorRuntimeExecutorOptions,
  type ConnectorRuntimeImplementation,
} from "./runtime-registry.ts";
import {
  assertConnectorRuntimeControlPlane,
  type ConnectorRuntimeControlPlaneOptions,
} from "./control-plane-runtime.ts";
import type {
  ConnectorCatalog,
  ConnectorFieldDefinition,
  ConnectorOperationDefinition,
  ConnectorOperationInput,
  ConnectorSourceCapabilities,
  IntegrationJson,
} from "./types.js";

export type ConnectorManagedInterfaceRole = "timer" | "http" | "service_db" | "other";

export interface ConnectorManagedInterface {
  name: string;
  type: string;
  role: ConnectorManagedInterfaceRole;
  customResponse?: boolean;
}

export interface ConnectorSourcePlan {
  status: "source_plan";
  operationId: string;
  appId: string;
  delivery: ConnectorSourceCapabilities["delivery"];
  missingFields: string[];
  missingSecrets: string[];
  invalidFields: string[];
  values: Record<string, IntegrationJson>;
  secretRefs: Record<string, string>;
  managedInterfaces: ConnectorManagedInterface[];
  runtime?: ConnectorOperationRuntimePlan;
  dedupe?: string;
  hasHooks: boolean;
  stateful: boolean;
}

export interface ConnectorSourceExecutionContext {
  operation: ConnectorOperationDefinition;
  values: Record<string, IntegrationJson>;
  secrets: Record<string, string>;
  plan: ConnectorSourcePlan;
}

export interface ConnectorSourceExecutor {
  start(ctx: ConnectorSourceExecutionContext): Promise<Record<string, IntegrationJson>>;
}

export interface ConnectorSourceRunResult {
  status: "source_started";
  operationId: string;
  appId: string;
  output: Record<string, IntegrationJson>;
  credentialLeaseId?: string;
  credentialLeaseReleased?: boolean;
  controlPlaneDecision?: {
    allowed: true;
    auditTraceMode: string;
  };
}

export type ConnectorSourceSubscriptionStatus = "ready" | "blocked" | "disabled";
export type ConnectorSourceSubscriptionBlockReason = "missing_fields" | "missing_secrets" | "invalid_fields" | "disabled";

export interface ConnectorSourceSubscription {
  id: string;
  status: ConnectorSourceSubscriptionStatus;
  operationId: string;
  appId: string;
  delivery: ConnectorSourceCapabilities["delivery"];
  managedInterfaces: ConnectorManagedInterface[];
  values: Record<string, IntegrationJson>;
  secretRefs: Record<string, string>;
  blockReasons: ConnectorSourceSubscriptionBlockReason[];
  missingFields: string[];
  missingSecrets: string[];
  invalidFields: string[];
  stateful: boolean;
  hasHooks: boolean;
  createdAt: string;
  updatedAt: string;
  dedupe?: string;
}

export interface RegisterConnectorSourceOptions {
  id?: string;
  enabled?: boolean;
  now?: Date | string;
}

export interface RunConnectorSourceOptions {
  catalog: ConnectorCatalog;
  operationId: string;
  input?: ConnectorOperationInput;
  dryRun?: boolean;
  executor?: ConnectorSourceExecutor;
  credentialBroker?: ConnectorCredentialLeaseBroker;
  leasePolicy?: ConnectorCredentialLeasePolicy;
  runtimeExecutorOptions?: ConnectorRuntimeExecutorOptions;
  runtimeRegistry?: readonly ConnectorRuntimeImplementation[];
  controlPlane?: ConnectorRuntimeControlPlaneOptions;
}

export class ConnectorSourceScheduler {
  readonly #subscriptions = new Map<string, ConnectorSourceSubscription>();

  register(plan: ConnectorSourcePlan, options: RegisterConnectorSourceOptions = {}): ConnectorSourceSubscription {
    const subscription = sourceSubscriptionFromPlan(plan, {
      id: options.id,
      enabled: options.enabled,
      now: options.now,
      existing: options.id ? this.#subscriptions.get(options.id) : undefined,
    });
    this.#subscriptions.set(subscription.id, subscription);
    return subscription;
  }

  get(id: string): ConnectorSourceSubscription | null {
    return this.#subscriptions.get(id) ?? null;
  }

  list(): ConnectorSourceSubscription[] {
    return [...this.#subscriptions.values()];
  }

  unregister(id: string): boolean {
    return this.#subscriptions.delete(id);
  }
}

export function sourceSubscriptionFromPlan(
  plan: ConnectorSourcePlan,
  options: RegisterConnectorSourceOptions & { existing?: ConnectorSourceSubscription } = {},
): ConnectorSourceSubscription {
  const id = options.id ?? stableSubscriptionId(plan);
  const now = isoTimestamp(options.now);
  const enabled = options.enabled !== false;
  const blockReasons = blockReasonsForPlan(plan, enabled);
  const status: ConnectorSourceSubscriptionStatus = enabled
    ? blockReasons.length ? "blocked" : "ready"
    : "disabled";
  return {
    id,
    status,
    operationId: plan.operationId,
    appId: plan.appId,
    delivery: plan.delivery,
    managedInterfaces: plan.managedInterfaces,
    values: plan.values,
    secretRefs: plan.secretRefs,
    blockReasons,
    missingFields: plan.missingFields,
    missingSecrets: plan.missingSecrets,
    invalidFields: plan.invalidFields,
    stateful: plan.stateful,
    hasHooks: plan.hasHooks,
    createdAt: options.existing?.createdAt ?? now,
    updatedAt: now,
    ...(plan.dedupe ? { dedupe: plan.dedupe } : {}),
  };
}

export async function runConnectorSource(
  options: RunConnectorSourceOptions,
): Promise<ConnectorSourcePlan | ConnectorSourceRunResult> {
  const found = findConnectorOperation(options.catalog, options.operationId);
  if (!found) {
    throw new Error(`Unknown connector operation: ${options.operationId}`);
  }
  if (found.operation.kind !== "source") {
    throw new Error(`Connector operation is not a source: ${options.operationId}`);
  }

  const input = options.input ?? {};
  const values = buildConnectorValues(found.operation.fields, input.values ?? {});
  const secretRefs = input.secretRefs ?? {};
  const missingFields = requiredConnectorFieldNames(found.operation.fields)
    .filter((fieldName) => values[fieldName] == null || values[fieldName] === "");
  const missingSecrets = found.operation.authFieldNames
    .filter((fieldName) => !secretRefs[fieldName]);
  const invalidFields = invalidConnectorFieldNames(found.operation.fields, values, input.values ?? {});
  const plan = buildSourcePlan({
    appId: found.app.id,
    operation: found.operation,
    missingFields,
    missingSecrets,
    invalidFields,
    values,
    secretRefs,
    runtime: buildConnectorOperationRuntimePlan(found.operation, values, { registry: options.runtimeRegistry }),
  });

  if (options.dryRun !== false) return plan;

  if (missingFields.length > 0 || missingSecrets.length > 0 || invalidFields.length > 0) {
    throw new Error(`Connector source is missing or invalid input: ${[...missingFields, ...missingSecrets, ...invalidFields].join(", ")}`);
  }
  const controlPlaneDecision = assertConnectorRuntimeControlPlane({
    app: found.app,
    operation: found.operation,
    controlPlane: options.controlPlane,
  });
  if (found.operation.authFieldNames.length > 0 && !options.credentialBroker) {
    throw new Error("Connector source execution with secrets requires a capability broker; plaintext secret resolution is disabled.");
  }
  const executor = options.executor ?? createConnectorSourceExecutor(found.operation, options.runtimeExecutorOptions, options.runtimeRegistry);
  if (!executor) {
    throw new Error("Connector source execution requires an explicit executor or registered runtime executor.");
  }

  if (found.operation.authFieldNames.length === 0) {
    const output = await executor.start({
      operation: found.operation,
      values,
      secrets: {},
      plan,
    });
    return {
      status: "source_started",
      operationId: found.operation.id,
      appId: found.app.id,
      output,
      controlPlaneDecision: {
        allowed: true,
        auditTraceMode: controlPlaneDecision.audit.traceMode,
      },
    };
  }

  const broker = options.credentialBroker;
  if (!broker) {
    throw new Error("Connector source execution with secrets requires a capability broker; plaintext secret resolution is disabled.");
  }
  const leaseRequest = buildConnectorCredentialLeaseRequest({
    appId: found.app.id,
    operationId: found.operation.id,
    purpose: options.leasePolicy?.purpose ?? "source",
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
    const output = await executor.start({
      operation: found.operation,
      values,
      secrets: lease.secrets,
      plan,
    });
    await broker.release(lease, leaseRequest);
    released = true;
    await auditCredentialLeaseEvent(broker, credentialLeaseAuditEvent({ event: "release", lease }));
    return {
      status: "source_started",
      operationId: found.operation.id,
      appId: found.app.id,
      output,
      credentialLeaseId: lease.id,
      credentialLeaseReleased: released,
      controlPlaneDecision: {
        allowed: true,
        auditTraceMode: controlPlaneDecision.audit.traceMode,
      },
    };
  } finally {
    if (!released) {
      await broker.release(lease, leaseRequest);
      await auditCredentialLeaseEvent(broker, credentialLeaseAuditEvent({ event: "release", lease }));
    }
  }
}

function buildSourcePlan(options: {
  appId: string;
  operation: ConnectorOperationDefinition;
  missingFields: string[];
  missingSecrets: string[];
  invalidFields: string[];
  values: Record<string, IntegrationJson>;
  secretRefs: Record<string, string>;
  runtime?: ConnectorOperationRuntimePlan;
}): ConnectorSourcePlan {
  const source = options.operation.source ?? {
    delivery: "manual" as const,
    usesTimer: false,
    usesHttp: false,
    usesServiceDb: false,
  };
  return {
    status: "source_plan",
    operationId: options.operation.id,
    appId: options.appId,
    delivery: source.delivery,
    missingFields: options.missingFields,
    missingSecrets: options.missingSecrets,
    invalidFields: options.invalidFields,
    values: redactConnectorSecretValues(options.operation.fields, options.values),
    secretRefs: options.secretRefs,
    managedInterfaces: managedInterfaces(options.operation.fields),
    ...(options.runtime ? { runtime: options.runtime } : {}),
    ...(options.operation.runtime?.dedupe ? { dedupe: options.operation.runtime.dedupe } : {}),
    hasHooks: options.operation.runtime?.hasHooks === true,
    stateful: source.usesServiceDb,
  };
}

function managedInterfaces(fields: ConnectorFieldDefinition[]): ConnectorManagedInterface[] {
  return fields
    .filter((field) => field.managed)
    .map((field) => ({
      name: field.name,
      type: field.type,
      role: managedInterfaceRole(field.type),
      ...(field.customResponse === true ? { customResponse: true } : {}),
    }));
}

function managedInterfaceRole(type: string): ConnectorManagedInterfaceRole {
  if (type === "$.interface.timer") return "timer";
  if (type === "$.interface.http") return "http";
  if (type === "$.service.db") return "service_db";
  return "other";
}

function stableSubscriptionId(plan: ConnectorSourcePlan): string {
  return `${plan.appId}:${plan.operationId}`;
}

function blockReasonsForPlan(
  plan: ConnectorSourcePlan,
  enabled: boolean,
): ConnectorSourceSubscriptionBlockReason[] {
  if (!enabled) return ["disabled"];
  const reasons: ConnectorSourceSubscriptionBlockReason[] = [];
  if (plan.missingFields.length) reasons.push("missing_fields");
  if (plan.missingSecrets.length) reasons.push("missing_secrets");
  if (plan.invalidFields.length) reasons.push("invalid_fields");
  return reasons;
}

function isoTimestamp(value: Date | string | undefined): string {
  if (typeof value === "string") return value;
  return (value ?? new Date()).toISOString();
}

export type { ConnectorCatalogError };
