export type VaultUserRole = "tenant_admin" | "tenant_operator";
export type VaultPrincipalType = "service_principal" | "sidecar_principal";
export type VaultCapability =
  | "metadata.read"
  | "secret.rotate"
  | "broker.http"
  | "lease.process"
  | "lease.browser"
  | "audit.read";
export type VaultEffect = "allow" | "deny";
export type VaultLeaseMode = "process" | "browser";
export type VaultSecretFieldKind = "string" | "password" | "url";

export interface VaultSecretTypeFieldDescriptor {
  id: string;
  label: string;
  kind: VaultSecretFieldKind;
  required: boolean;
  secret?: boolean;
  description?: string;
  placeholder?: string;
}

export interface VaultTypedActionDescriptor {
  id: string;
  label: string;
  description: string;
  capability: Extract<VaultCapability, "broker.http">;
  method: "GET" | "POST";
}

export interface VaultSecretTypeDescriptor {
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
  defaultLeaseModes: VaultLeaseMode[];
  defaultCapabilities: VaultCapability[];
  fields: VaultSecretTypeFieldDescriptor[];
  actions: VaultTypedActionDescriptor[];
}

export interface VaultSecretMetadata {
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
  leaseModes: VaultLeaseMode[];
  maskedFingerprint: string;
  version: number;
  updatedAt: string;
}

export interface VaultSecretCapabilityStatus {
  capability: VaultCapability;
  allowed: boolean;
}

export interface VaultPolicyRecord {
  id: string;
  tenantId: string;
  subjectType: VaultUserRole | VaultPrincipalType | "*";
  subjectId: string;
  secretName: string;
  capability: VaultCapability;
  effect: VaultEffect;
  createdAt: string;
}

export interface VaultPrincipalRecord {
  id: string;
  tenantId: string;
  type: VaultPrincipalType;
  label: string;
  createdAt: string;
  lastUsedAt?: string | null;
}

export interface VaultLeaseRecord {
  id: string;
  tenantId: string;
  secretName: string;
  capability: VaultCapability;
  mode: VaultLeaseMode;
  createdAt: string;
  expiresAt: string;
  consumedAt?: string | null;
  revokedAt?: string | null;
}

export interface VaultAuditRecord {
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
