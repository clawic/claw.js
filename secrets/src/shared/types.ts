export type SecretsUserRole = "tenant_admin" | "tenant_operator";
export type SecretsPrincipalType = "service_principal" | "sidecar_principal";
export type SecretsCapability =
  | "metadata.read"
  | "secret.rotate"
  | "broker.http"
  | "lease.process"
  | "lease.browser"
  | "audit.read";
export type SecretsEffect = "allow" | "deny";
export type SecretsLeaseMode = "process" | "browser";
export type SecretsSecretFieldKind = "string" | "password" | "url";

export interface SecretsSecretTypeFieldDescriptor {
  id: string;
  label: string;
  kind: SecretsSecretFieldKind;
  required: boolean;
  secret?: boolean;
  description?: string;
  placeholder?: string;
}

export interface SecretsTypedActionDescriptor {
  id: string;
  label: string;
  description: string;
  capability: Extract<SecretsCapability, "broker.http">;
  method: "GET" | "POST";
}

export interface SecretsSecretTypeDescriptor {
  typeId: string;
  label: string;
  description: string;
  kind: string;
  defaultAllowedHosts: string[];
  defaultAllowedHeaderNames: string[];
  defaultAllowInURL: boolean;
  defaultAllowInRequestBody: boolean;
  defaultAllowLocalNetwork: boolean;
  defaultReadOnly: boolean;
  defaultLeaseModes: SecretsLeaseMode[];
  defaultCapabilities: SecretsCapability[];
  fields: SecretsSecretTypeFieldDescriptor[];
  actions: SecretsTypedActionDescriptor[];
}

export interface SecretsSecretMetadata {
  secretName: string;
  label?: string;
  kind?: string;
  typeId?: string;
  notes?: string;
  structuredFields?: Record<string, string>;
  allowedHosts: string[];
  allowedHeaderNames: string[];
  allowInURL: boolean;
  allowInRequestBody: boolean;
  allowLocalNetwork: boolean;
  readOnly: boolean;
  exportable: boolean;
  leaseModes: SecretsLeaseMode[];
  maskedFingerprint: string;
  version: number;
  updatedAt: string;
}

export interface SecretsSecretCapabilityStatus {
  capability: SecretsCapability;
  allowed: boolean;
}

export interface SecretsPolicyRecord {
  id: string;
  tenantId: string;
  subjectType: SecretsUserRole | SecretsPrincipalType | "*";
  subjectId: string;
  secretName: string;
  capability: SecretsCapability;
  effect: SecretsEffect;
  createdAt: string;
}

export interface SecretsPrincipalRecord {
  id: string;
  tenantId: string;
  type: SecretsPrincipalType;
  label: string;
  createdAt: string;
  lastUsedAt?: string | null;
}

export interface SecretsLeaseRecord {
  id: string;
  tenantId: string;
  secretName: string;
  capability: SecretsCapability;
  mode: SecretsLeaseMode;
  createdAt: string;
  expiresAt: string;
  consumedAt?: string | null;
  revokedAt?: string | null;
}

export interface SecretsAuditRecord {
  id: string;
  tenantId: string;
  actorType: string;
  actorId: string;
  action: string;
  secretName?: string | null;
  status: "success" | "error";
  detail: string;
  createdAt: string;
}
