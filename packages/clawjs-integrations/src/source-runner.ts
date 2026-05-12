import {
  findConnectorOperation,
  type ConnectorCatalogError,
} from "./catalog.ts";
import type {
  ConnectorCatalog,
  ConnectorFieldDefinition,
  ConnectorOperationDefinition,
  ConnectorOperationInput,
  ConnectorSourceCapabilities,
  IntegrationJson,
} from "./types.js";
import type { ConnectorSecretResolver } from "./operation-runner.js";

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
  values: Record<string, IntegrationJson>;
  secretRefs: Record<string, string>;
  managedInterfaces: ConnectorManagedInterface[];
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
}

export type ConnectorSourceSubscriptionStatus = "ready" | "blocked" | "disabled";
export type ConnectorSourceSubscriptionBlockReason = "missing_fields" | "missing_secrets" | "disabled";

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
  resolveSecret?: ConnectorSecretResolver;
  executor?: ConnectorSourceExecutor;
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
  const values = buildValues(found.operation.fields, input.values ?? {});
  const secretRefs = input.secretRefs ?? {};
  const missingFields = requiredFieldNames(found.operation.fields)
    .filter((fieldName) => values[fieldName] == null || values[fieldName] === "");
  const missingSecrets = found.operation.authFieldNames
    .filter((fieldName) => !secretRefs[fieldName]);
  const plan = buildSourcePlan({
    appId: found.app.id,
    operation: found.operation,
    missingFields,
    missingSecrets,
    values,
    secretRefs,
  });

  if (options.dryRun !== false) return plan;

  if (missingFields.length > 0 || missingSecrets.length > 0) {
    throw new Error(`Connector source is missing required input: ${[...missingFields, ...missingSecrets].join(", ")}`);
  }
  if (!options.executor) {
    throw new Error("Connector source execution requires an explicit executor.");
  }

  const secrets: Record<string, string> = {};
  for (const fieldName of found.operation.authFieldNames) {
    const ref = secretRefs[fieldName];
    if (!ref) continue;
    const value = await options.resolveSecret?.(ref);
    if (!value) {
      throw new Error(`Unable to resolve secret: ${fieldName}`);
    }
    secrets[fieldName] = value;
  }

  const output = await options.executor.start({
    operation: found.operation,
    values,
    secrets,
    plan,
  });
  return {
    status: "source_started",
    operationId: found.operation.id,
    appId: found.app.id,
    output,
  };
}

function buildSourcePlan(options: {
  appId: string;
  operation: ConnectorOperationDefinition;
  missingFields: string[];
  missingSecrets: string[];
  values: Record<string, IntegrationJson>;
  secretRefs: Record<string, string>;
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
    values: redactSecretValues(options.operation.fields, options.values),
    secretRefs: options.secretRefs,
    managedInterfaces: managedInterfaces(options.operation.fields),
    ...(options.operation.runtime?.dedupe ? { dedupe: options.operation.runtime.dedupe } : {}),
    hasHooks: options.operation.runtime?.hasHooks === true,
    stateful: source.usesServiceDb,
  };
}

function buildValues(
  fields: ConnectorFieldDefinition[],
  input: Record<string, IntegrationJson>,
): Record<string, IntegrationJson> {
  const values: Record<string, IntegrationJson> = {};
  for (const field of fields) {
    if (field.managed) continue;
    if (Object.prototype.hasOwnProperty.call(input, field.name)) {
      values[field.name] = input[field.name] ?? null;
    } else if (Object.prototype.hasOwnProperty.call(field, "default")) {
      values[field.name] = field.default ?? null;
    }
  }
  return values;
}

function requiredFieldNames(fields: ConnectorFieldDefinition[]): string[] {
  return fields.filter((field) => !field.optional && !field.secret && !field.managed).map((field) => field.name);
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

function redactSecretValues(
  fields: ConnectorFieldDefinition[],
  values: Record<string, IntegrationJson>,
): Record<string, IntegrationJson> {
  const secretFields = new Set(fields.filter((field) => field.secret).map((field) => field.name));
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, secretFields.has(key) ? "[secret]" : value]),
  );
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
  return reasons;
}

function isoTimestamp(value: Date | string | undefined): string {
  if (typeof value === "string") return value;
  return (value ?? new Date()).toISOString();
}

export type { ConnectorCatalogError };
