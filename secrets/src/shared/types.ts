export type SecretsUserRole = "tenant_admin" | "tenant_operator";
export type SecretsPrincipalType = "service_principal" | "sidecar_principal";
type SecretsCapability =
  | "metadata.read"
  | "secret.rotate"
  | "broker.http"
  | "lease.process"
  | "lease.browser"
  | "audit.read";
type SecretsEffect = "allow" | "deny";
type SecretsLeaseMode = "process" | "browser";
type SecretsSecretFieldKind = "string" | "password" | "url";

interface SecretsSecretTypeFieldDescriptor {
  id: string;
  label: string;
  kind: SecretsSecretFieldKind;
  required: boolean;
  secret?: boolean;
  description?: string;
  placeholder?: string;
}

interface SecretsTypedActionDescriptor {
  id: string;
  label: string;
  description: string;
  capability: Extract<SecretsCapability, "broker.http">;
  method: "GET" | "POST";
}

interface SecretsSecretTypeDescriptor {
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

interface SecretsSecretMetadata {
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

interface SecretsSecretCapabilityStatus {
  capability: SecretsCapability;
  allowed: boolean;
}

interface SecretsPolicyRecord {
  id: string;
  tenantId: string;
  subjectType: SecretsUserRole | SecretsPrincipalType | "*";
  subjectId: string;
  secretName: string;
  capability: SecretsCapability;
  effect: SecretsEffect;
  createdAt: string;
}

interface SecretsPrincipalRecord {
  id: string;
  tenantId: string;
  type: SecretsPrincipalType;
  label: string;
  createdAt: string;
  lastUsedAt?: string | null;
}

interface SecretsLeaseRecord {
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

interface SecretsAuditRecord {
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
