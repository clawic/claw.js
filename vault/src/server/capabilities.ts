// Two orthogonal capability dimensions on the Vault:
//
// 1. VaultCapability  — what an agent can do WITH the vault system itself
//    (read metadata, rotate, broker HTTP, mint leases, read audit log).
//    These are flat string identifiers, the same set ClawJS Vault already
//    exposed.
//
// 2. BusinessCapability — what an agent can do TOWARDS an external
//    service. These carry a typed scope so the compiler forces the caller
//    to specify (repository, package, etc.). Ports the Secrets Vault
//    `AgentAuthorizationCapability` enum + leaves room for plugins to
//    register more via the "custom" variant.
//
// Both dimensions are stored on every agent_grant: vault_capabilities is
// a JSON array of VaultCapability strings, capability_kind +
// capability_scope_json store the BusinessCapability discriminated union.

export const VAULT_CAPABILITIES = [
  "metadata.read",
  "secret.rotate",
  "broker.http",
  "lease.process",
  "lease.browser",
  "audit.read",
] as const;

export type VaultCapability = (typeof VAULT_CAPABILITIES)[number];

export function isVaultCapability(value: unknown): value is VaultCapability {
  return typeof value === "string" && (VAULT_CAPABILITIES as readonly string[]).includes(value);
}

// ---------- BusinessCapability (discriminated union) ----------

export type BusinessCapability =
  | { kind: "github.git_push"; repository: string }
  | { kind: "github.release_create"; repository: string; tag: string }
  | { kind: "npm.publish"; package: string; version: string }
  | { kind: "appstore.action"; action: string; appId?: string }
  | { kind: "apple_ads.action"; action: string }
  | { kind: "apple_notarization"; bundleId?: string }
  | { kind: "revenuecat"; project: string; action: string; apiVersion: "v1" | "v2" }
  | { kind: "openai.image_generate"; quotaTag?: string }
  | { kind: "command.exec"; command: string }
  | { kind: "ssh.connect"; user: string; host: string; port: number }
  | { kind: "broker.http.read" }
  | { kind: "broker.http.write" }
  | { kind: "custom"; typeId: string; scope: Record<string, unknown> };

export function serializeBusinessCapability(cap: BusinessCapability): { kind: string; scopeJson: string } {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { kind, ...scope } = cap;
  return { kind, scopeJson: JSON.stringify(scope) };
}

export function deserializeBusinessCapability(kind: string, scopeJson: string | null): BusinessCapability {
  const scope = scopeJson ? (JSON.parse(scopeJson) as Record<string, unknown>) : {};
  return { kind, ...scope } as BusinessCapability;
}

export interface CapabilityCheck {
  expectedKind?: BusinessCapability["kind"];
  expectedScope?: Partial<Record<string, unknown>>;
  requiredVaultCapabilities?: VaultCapability[];
}

export function matchesScope(stored: BusinessCapability, expected: Partial<Record<string, unknown>>): boolean {
  for (const [key, value] of Object.entries(expected)) {
    if (value === undefined || value === null) continue;
    if ((stored as Record<string, unknown>)[key] !== value) return false;
  }
  return true;
}
