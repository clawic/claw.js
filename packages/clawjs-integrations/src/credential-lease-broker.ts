import type { IntegrationJson } from "./types.js";

export type ConnectorCredentialLeasePurpose =
  | "operation"
  | "source"
  | "live_smoke";

export interface ConnectorCredentialLeaseCostPolicy {
  mode: "free_only" | "approved_cost";
  maxCostCents?: number;
  currency?: string;
}

export interface ConnectorCredentialLeaseRequest {
  provider: string;
  appId: string;
  operationId: string;
  purpose: ConnectorCredentialLeasePurpose;
  secretRefs: Record<string, string>;
  scopes: readonly string[];
  ttlSeconds: number;
  costPolicy: ConnectorCredentialLeaseCostPolicy;
  valuesPreview: Record<string, IntegrationJson>;
}

export interface ConnectorCredentialLease {
  id: string;
  provider: string;
  appId: string;
  operationId: string;
  scopes: readonly string[];
  issuedAt: string;
  expiresAt: string;
  secrets: Record<string, string>;
}

export interface ConnectorCredentialLeaseAuditEvent {
  event: "acquire" | "heartbeat" | "release";
  leaseId: string;
  provider: string;
  appId: string;
  operationId: string;
  at: string;
}

export interface ConnectorCredentialLeaseBroker {
  acquire(request: ConnectorCredentialLeaseRequest): Promise<ConnectorCredentialLease>;
  heartbeat?(lease: ConnectorCredentialLease, request: ConnectorCredentialLeaseRequest): Promise<void>;
  release(lease: ConnectorCredentialLease, request: ConnectorCredentialLeaseRequest): Promise<void>;
  audit?(event: ConnectorCredentialLeaseAuditEvent): void | Promise<void>;
}

export interface ConnectorCredentialLeasePolicy {
  purpose?: ConnectorCredentialLeasePurpose;
  scopes?: readonly string[];
  ttlSeconds?: number;
  costPolicy?: ConnectorCredentialLeaseCostPolicy;
}

export function buildConnectorCredentialLeaseRequest(input: {
  provider?: string;
  appId: string;
  operationId: string;
  purpose: ConnectorCredentialLeasePurpose;
  secretRefs: Record<string, string>;
  scopes?: readonly string[];
  ttlSeconds?: number;
  costPolicy?: ConnectorCredentialLeaseCostPolicy;
  valuesPreview?: Record<string, IntegrationJson>;
}): ConnectorCredentialLeaseRequest {
  return {
    provider: input.provider ?? input.appId,
    appId: input.appId,
    operationId: input.operationId,
    purpose: input.purpose,
    secretRefs: input.secretRefs,
    scopes: input.scopes?.length ? [...input.scopes] : [`connector:${input.appId}:${input.operationId}`],
    ttlSeconds: input.ttlSeconds ?? 300,
    costPolicy: input.costPolicy ?? { mode: "free_only" },
    valuesPreview: input.valuesPreview ?? {},
  };
}

export function verifyConnectorCredentialLease(
  lease: ConnectorCredentialLease,
  request: ConnectorCredentialLeaseRequest,
  requiredSecretFields: readonly string[],
): void {
  if (lease.provider !== request.provider) {
    throw new Error(`Credential lease ${lease.id} provider mismatch.`);
  }
  if (lease.appId !== request.appId || lease.operationId !== request.operationId) {
    throw new Error(`Credential lease ${lease.id} target mismatch.`);
  }
  const missing = requiredSecretFields.filter((field) => !lease.secrets[field]);
  if (missing.length > 0) {
    throw new Error(`Credential lease ${lease.id} is missing required secrets: ${missing.join(", ")}`);
  }
  const now = Date.now();
  const expiresAt = Date.parse(lease.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    throw new Error(`Credential lease ${lease.id} is expired.`);
  }
}

export async function auditCredentialLeaseEvent(
  broker: ConnectorCredentialLeaseBroker,
  event: ConnectorCredentialLeaseAuditEvent,
): Promise<void> {
  await broker.audit?.(event);
}

export function credentialLeaseAuditEvent(input: {
  event: ConnectorCredentialLeaseAuditEvent["event"];
  lease: ConnectorCredentialLease;
  at?: Date | string;
}): ConnectorCredentialLeaseAuditEvent {
  return {
    event: input.event,
    leaseId: input.lease.id,
    provider: input.lease.provider,
    appId: input.lease.appId,
    operationId: input.lease.operationId,
    at: isoTimestamp(input.at),
  };
}

function isoTimestamp(value?: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return new Date(value).toISOString();
  return new Date().toISOString();
}
