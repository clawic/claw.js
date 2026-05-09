// VaultResolver: high-level surface used by the HTTP layer and the
// brokered execution paths. Wraps secret CRUD, version reading, template
// resolution and governance enforcement.

import {
  asUint8Array,
  parseJsonArray,
  type AttachmentRow,
  type AgentGrantRow,
  type LeaseRow,
  type SecretFieldRow,
  type SecretNotesRow,
  type SecretRow,
  type SecretSyncedResourceRow,
  type SecretVersionRow,
  type SqliteDb,
  type VaultContainerRow,
} from "./db.ts";
import {
  openField,
  openNotes,
  unwrapItemKey,
} from "./crypto.ts";
import { LockableSecret } from "./lockable-secret.ts";
import {
  AttachmentStore,
  EphemeralAuthorizationStore,
  PolicyStore,
  SecretStore,
  SyncedResourceStore,
  VaultContainerStore,
} from "./stores.ts";
import { AgentGrantStore } from "./agent-grants.ts";
import { LeaseStore } from "./leases.ts";
import {
  describeReason,
  evaluateGovernance,
  type GovernanceDenialReason,
  type ResolveContext,
} from "./governance.ts";
import type { VaultCapability } from "./capabilities.ts";

// ---------- Public DTOs (over the wire) ----------

export interface DescribedField {
  fieldName: string;
  fieldKind: string;
  placement: string;
  isSecret: boolean;
  isConcealed: boolean;
  publicValue: string | null;
  hasCiphertext: boolean;
  otpPeriod: number | null;
  otpDigits: number | null;
  otpAlgorithm: string | null;
  sortOrder: number;
}

export interface DescribedSecret {
  id: string;
  tenantId: string;
  vaultId: string | null;
  typeId: string | null;
  internalName: string;
  title: string;
  versionNumber: number;
  versionReason: string;
  governance: {
    allowedHosts: string[];
    allowedHeaders: string[];
    allowInUrl: boolean;
    allowInBody: boolean;
    allowInEnv: boolean;
    allowInsecureTransport: boolean;
    allowLocalNetwork: boolean;
    allowedAgents: string[] | null;
    approvalMode: string;
    approvalWindowMinutes: number | null;
    ttlExpiresAt: string | null;
    maxUses: number | null;
    rotationReminderDays: number | null;
    redactionLabel: string | null;
    clipboardClearSeconds: number | null;
    auditRetentionDays: number | null;
    requiresVpn: boolean;
    vpnProfileName: string | null;
  };
  states: {
    isArchived: boolean;
    isCompromised: boolean;
    isCompromisedReason: string | null;
    isLocked: boolean;
    readOnly: boolean;
    trashedAt: string | null;
  };
  counters: {
    useCount: number;
    lastUsedAt: string | null;
    lastRotatedAt: string | null;
  };
  tags: string[];
  fields: DescribedField[];
  hasNotes: boolean;
  attachments: { id: string; filename: string; size: number; mimeType: string | null }[];
  syncedResources: SecretSyncedResourceRow[];
  createdAt: string;
  updatedAt: string;
}

export interface RevealedField {
  fieldName: string;
  value: string;
}

export interface ResolutionOutput {
  values: Record<string, string>; // fieldName → plaintext
  redactionLabels: Record<string, string>;
  decision: { allowed: boolean; reasons: GovernanceDenialReason[]; needsApproval: boolean; needsVpn: boolean };
}

// ---------- Resolver ----------

export class VaultResolver {
  readonly secrets: SecretStore;
  readonly containers: VaultContainerStore;
  readonly attachments: AttachmentStore;
  readonly grants: AgentGrantStore;
  readonly leases: LeaseStore;
  readonly policies: PolicyStore;
  readonly ephemeral: EphemeralAuthorizationStore;
  readonly synced: SyncedResourceStore;

  constructor(db: SqliteDb) {
    this.secrets = new SecretStore(db);
    this.containers = new VaultContainerStore(db);
    this.attachments = new AttachmentStore(db);
    this.grants = new AgentGrantStore(db);
    this.leases = new LeaseStore(db);
    this.policies = new PolicyStore(db);
    this.ephemeral = new EphemeralAuthorizationStore(db);
    this.synced = new SyncedResourceStore(db);
  }

  // ---- Describe / list ----

  describeSecret(secret: SecretRow): DescribedSecret {
    const version = this.secrets.getCurrentVersion(secret.id);
    const fields: SecretFieldRow[] = version ? this.secrets.listFields(version.id) : [];
    const notes: SecretNotesRow | undefined = version
      ? this.secrets.getNotes(secret.id, version.id)
      : undefined;
    const attachments: AttachmentRow[] = version ? this.attachments.list(version.id) : [];
    const synced = this.synced.list(secret.id);

    return {
      id: secret.id,
      tenantId: secret.tenant_id,
      vaultId: secret.vault_id,
      typeId: secret.type_id,
      internalName: secret.internal_name,
      title: secret.title,
      versionNumber: version?.version_number ?? 0,
      versionReason: version?.reason ?? "create",
      governance: {
        allowedHosts: parseJsonArray(secret.allowed_hosts_json),
        allowedHeaders: parseJsonArray(secret.allowed_headers_json),
        allowInUrl: secret.allow_in_url === 1,
        allowInBody: secret.allow_in_body === 1,
        allowInEnv: secret.allow_in_env === 1,
        allowInsecureTransport: secret.allow_insecure_transport === 1,
        allowLocalNetwork: secret.allow_local_network === 1,
        allowedAgents: secret.allowed_agents_json ? parseJsonArray(secret.allowed_agents_json) : null,
        approvalMode: secret.approval_mode,
        approvalWindowMinutes: secret.approval_window_minutes,
        ttlExpiresAt: secret.ttl_expires_at,
        maxUses: secret.max_uses,
        rotationReminderDays: secret.rotation_reminder_days,
        redactionLabel: secret.redaction_label,
        clipboardClearSeconds: secret.clipboard_clear_seconds,
        auditRetentionDays: secret.audit_retention_days,
        requiresVpn: secret.requires_vpn === 1,
        vpnProfileName: secret.vpn_profile_name,
      },
      states: {
        isArchived: secret.is_archived === 1,
        isCompromised: secret.is_compromised === 1,
        isCompromisedReason: secret.is_compromised_reason,
        isLocked: secret.is_locked === 1,
        readOnly: secret.read_only === 1,
        trashedAt: secret.trashed_at,
      },
      counters: {
        useCount: secret.use_count,
        lastUsedAt: secret.last_used_at,
        lastRotatedAt: secret.last_rotated_at,
      },
      tags: parseJsonArray(secret.tags_json),
      fields: fields.map((f) => ({
        fieldName: f.field_name,
        fieldKind: f.field_kind,
        placement: f.placement,
        isSecret: f.is_secret === 1,
        isConcealed: f.is_concealed === 1,
        publicValue: f.public_value,
        hasCiphertext: f.value_ciphertext !== null,
        otpPeriod: f.otp_period,
        otpDigits: f.otp_digits,
        otpAlgorithm: f.otp_algorithm,
        sortOrder: f.sort_order,
      })),
      hasNotes: notes?.ciphertext != null,
      attachments: attachments.map((a) => ({
        id: a.id,
        filename: a.filename,
        size: a.size,
        mimeType: a.mime_type,
      })),
      syncedResources: synced,
      createdAt: secret.created_at,
      updatedAt: secret.updated_at,
    };
  }

  // ---- Reveal ----

  revealField(input: { secret: SecretRow; fieldName: string; masterKey: LockableSecret }): RevealedField {
    const version = this.secrets.getCurrentVersion(input.secret.id);
    if (!version) throw new Error("Secret has no current version");
    const fields = this.secrets.listFields(version.id);
    const field = fields.find((f) => f.field_name === input.fieldName);
    if (!field) throw new Error(`Field not found: ${input.fieldName}`);
    if (field.is_secret === 0 || !field.value_ciphertext) {
      return { fieldName: field.field_name, value: field.public_value ?? "" };
    }
    const itemKey = unwrapItemKey(asUint8Array(input.secret.wrapped_item_key), input.secret.id, input.masterKey);
    try {
      const value = openField(asUint8Array(field.value_ciphertext), itemKey, input.secret.id, field.field_name);
      return { fieldName: field.field_name, value };
    } finally {
      itemKey.zero();
    }
  }

  revealAllFields(input: { secret: SecretRow; masterKey: LockableSecret }): Record<string, string> {
    const version = this.secrets.getCurrentVersion(input.secret.id);
    if (!version) throw new Error("Secret has no current version");
    const fields = this.secrets.listFields(version.id);
    const itemKey = unwrapItemKey(asUint8Array(input.secret.wrapped_item_key), input.secret.id, input.masterKey);
    try {
      const out: Record<string, string> = {};
      for (const field of fields) {
        if (field.is_secret === 1 && field.value_ciphertext) {
          out[field.field_name] = openField(
            asUint8Array(field.value_ciphertext),
            itemKey,
            input.secret.id,
            field.field_name,
          );
        } else if (field.public_value !== null) {
          out[field.field_name] = field.public_value;
        }
      }
      return out;
    } finally {
      itemKey.zero();
    }
  }

  revealNotes(input: { secret: SecretRow; masterKey: LockableSecret }): string | null {
    const version = this.secrets.getCurrentVersion(input.secret.id);
    if (!version) return null;
    const notes = this.secrets.getNotes(input.secret.id, version.id);
    if (!notes?.ciphertext) return null;
    const itemKey = unwrapItemKey(asUint8Array(input.secret.wrapped_item_key), input.secret.id, input.masterKey);
    try {
      return openNotes(asUint8Array(notes.ciphertext), itemKey, input.secret.id);
    } finally {
      itemKey.zero();
    }
  }

  // ---- Governance ----

  evaluate(secret: SecretRow, ctx: ResolveContext) {
    return evaluateGovernance(secret, ctx);
  }

  redactionLabel(secret: SecretRow): string {
    return secret.redaction_label ?? "[REDACTED]";
  }

  // ---- Helpers for serialization in the HTTP layer ----

  describeGrant(row: AgentGrantRow) {
    return this.grants.toSummary(row);
  }

  describeLease(row: LeaseRow) {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      secretId: row.secret_id,
      mode: row.mode,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      consumedAt: row.consumed_at,
      revokedAt: row.revoked_at,
    };
  }

  describeContainer(row: VaultContainerRow) {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      icon: row.icon,
      color: row.color,
      sortOrder: row.sort_order,
      trashedAt: row.trashed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export { describeReason };
