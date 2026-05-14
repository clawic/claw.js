// Stores for the Clawix-grade schema. Each Store wraps one or two tables
// and exposes a typed CRUD surface used by the Secrets resolver and HTTP
// handlers. Audit and agent grants live in their own files because they
// have heavier behaviour (chain hashing, scoped capabilities).

import {
  type SqliteDb,
  asBuffer,
  asUint8Array,
  newId,
  nowIso,
  parseJsonArray,
  serializeSecretsMeta,
  deserializeSecretsMeta,
  type ApprovalMode,
  type AttachmentRow,
  type EphemeralAuthorizationRow,
  type FieldKind,
  type LeaseMode,
  type LeaseRow,
  type PluginRegistryRow,
  type PolicyRow,
  type Placement,
  type PrincipalRow,
  type SecretFieldRow,
  type SecretNotesRow,
  type SecretRow,
  type SecretSessionCacheRow,
  type SecretSyncedResourceRow,
  type SecretVersionRow,
  type TenantRow,
  type UserRow,
  type FolderRow,
  type VersionAuthor,
  type VersionReason,
} from "./db.ts";
import {
  generateAttachmentKey,
  hashAgentToken,
  hashLeaseToken,
  sealAttachment,
  sealField,
  sealNotes,
  type SecretsMetaSnapshot,
  wrapAttachmentKey,
  wrapItemKey,
  generateItemKey,
} from "./crypto.ts";
import { LockableSecret } from "./lockable-secret.ts";

// ---------- Tenant store ----------

export class TenantStore {
  constructor(private readonly db: SqliteDb) {}

  upsert(id: string, label: string): TenantRow {
    const existing = this.db.prepare("SELECT * FROM tenants WHERE id = ?").get(id) as TenantRow | undefined;
    if (existing) return existing;
    const row: TenantRow = { id, label, created_at: nowIso() };
    this.db.prepare("INSERT INTO tenants (id, label, created_at) VALUES (?, ?, ?)").run(row.id, row.label, row.created_at);
    return row;
  }

  list(): TenantRow[] {
    return this.db.prepare("SELECT * FROM tenants ORDER BY created_at ASC").all() as TenantRow[];
  }

  get(id: string): TenantRow | undefined {
    return this.db.prepare("SELECT * FROM tenants WHERE id = ?").get(id) as TenantRow | undefined;
  }
}

// ---------- User store ----------

export class UserStore {
  constructor(private readonly db: SqliteDb) {}

  create(input: {
    tenantId: string;
    email: string;
    passwordHash: string;
    role: "tenant_admin" | "tenant_operator";
  }): UserRow {
    const row: UserRow = {
      id: newId(),
      tenant_id: input.tenantId,
      email: input.email,
      password_hash: input.passwordHash,
      role: input.role,
      created_at: nowIso(),
    };
    this.db
      .prepare(
        "INSERT INTO users (id, tenant_id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(row.id, row.tenant_id, row.email, row.password_hash, row.role, row.created_at);
    return row;
  }

  findByEmail(tenantId: string, email: string): UserRow | undefined {
    return this.db
      .prepare("SELECT * FROM users WHERE tenant_id = ? AND email = ?")
      .get(tenantId, email) as UserRow | undefined;
  }

  get(id: string): UserRow | undefined {
    return this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  }

  list(tenantId: string): UserRow[] {
    return this.db.prepare("SELECT * FROM users WHERE tenant_id = ? ORDER BY created_at ASC").all(tenantId) as UserRow[];
  }
}

// ---------- Principal store ----------

export class PrincipalStore {
  constructor(private readonly db: SqliteDb) {}

  create(input: {
    tenantId: string;
    type: "service_principal" | "sidecar_principal";
    label: string;
    tokenHash: string;
  }): PrincipalRow {
    const row: PrincipalRow = {
      id: newId(),
      tenant_id: input.tenantId,
      type: input.type,
      label: input.label,
      token_hash: input.tokenHash,
      created_at: nowIso(),
      last_used_at: null,
    };
    this.db
      .prepare(
        "INSERT INTO principals (id, tenant_id, type, label, token_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(row.id, row.tenant_id, row.type, row.label, row.token_hash, row.created_at);
    return row;
  }

  findByTokenHash(tokenHash: string): PrincipalRow | undefined {
    return this.db.prepare("SELECT * FROM principals WHERE token_hash = ?").get(tokenHash) as PrincipalRow | undefined;
  }

  list(tenantId: string): PrincipalRow[] {
    return this.db
      .prepare("SELECT * FROM principals WHERE tenant_id = ? ORDER BY created_at ASC")
      .all(tenantId) as PrincipalRow[];
  }

  bumpUsage(id: string): void {
    this.db.prepare("UPDATE principals SET last_used_at = ? WHERE id = ?").run(nowIso(), id);
  }
}

// ---------- Secrets meta store ----------

export class SecretsMetaStore {
  constructor(private readonly db: SqliteDb) {}

  load(tenantId: string): SecretsMetaSnapshot | undefined {
    const row = this.db
      .prepare("SELECT snapshot_json FROM secrets_meta WHERE tenant_id = ?")
      .get(tenantId) as { snapshot_json: string } | undefined;
    return row ? deserializeSecretsMeta(row.snapshot_json) : undefined;
  }

  save(tenantId: string, meta: SecretsMetaSnapshot): void {
    const json = serializeSecretsMeta(meta);
    const ts = nowIso();
    this.db
      .prepare(
        "INSERT INTO secrets_meta (tenant_id, snapshot_json, updated_at) VALUES (?, ?, ?) " +
          "ON CONFLICT(tenant_id) DO UPDATE SET snapshot_json = excluded.snapshot_json, updated_at = excluded.updated_at",
      )
      .run(tenantId, json, ts);
  }

  exists(tenantId: string): boolean {
    return Boolean(this.load(tenantId));
  }
}

// ---------- Secrets container store ----------

export class FolderStore {
  constructor(private readonly db: SqliteDb) {}

  create(input: {
    tenantId: string;
    name: string;
    icon?: string;
    color?: string;
    sortOrder?: number;
  }): FolderRow {
    const ts = nowIso();
    const row: FolderRow = {
      id: newId(),
      tenant_id: input.tenantId,
      name: input.name,
      icon: input.icon ?? null,
      color: input.color ?? null,
      sort_order: input.sortOrder ?? 0,
      trashed_at: null,
      created_at: ts,
      updated_at: ts,
    };
    this.db
      .prepare(
        "INSERT INTO folders (id, tenant_id, name, icon, color, sort_order, trashed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)",
      )
      .run(row.id, row.tenant_id, row.name, row.icon, row.color, row.sort_order, row.created_at, row.updated_at);
    return row;
  }

  list(tenantId: string, includeTrashed = false): FolderRow[] {
    const sql = includeTrashed
      ? "SELECT * FROM folders WHERE tenant_id = ? ORDER BY sort_order ASC, created_at ASC"
      : "SELECT * FROM folders WHERE tenant_id = ? AND trashed_at IS NULL ORDER BY sort_order ASC, created_at ASC";
    return this.db.prepare(sql).all(tenantId) as FolderRow[];
  }

  rename(id: string, name: string): FolderRow | undefined {
    this.db.prepare("UPDATE folders SET name = ?, updated_at = ? WHERE id = ?").run(name, nowIso(), id);
    return this.db.prepare("SELECT * FROM folders WHERE id = ?").get(id) as FolderRow | undefined;
  }

  trash(id: string): void {
    this.db.prepare("UPDATE folders SET trashed_at = ?, updated_at = ? WHERE id = ?").run(nowIso(), nowIso(), id);
  }
}

// ---------- Secret CRUD + versions + fields + notes ----------

export interface DraftSecretField {
  fieldName: string;
  fieldKind: FieldKind;
  placement: Placement;
  isSecret: boolean;
  isConcealed?: boolean;
  publicValue?: string;
  secretValue?: string; // plaintext, sealed before storage
  otpPeriod?: number;
  otpDigits?: number;
  otpAlgorithm?: string;
  sortOrder?: number;
}

export interface DraftSecret {
  folderId?: string | null;
  typeId?: string | null;
  internalName: string;
  title: string;
  fields: DraftSecretField[];
  notes?: string;
  tags?: string[];
  governance?: Partial<GovernanceFields>;
}

export interface GovernanceFields {
  allowedHosts: string[];
  allowedHeaders: string[];
  allowInUrl: boolean;
  allowInBody: boolean;
  allowInEnv: boolean;
  allowInsecureTransport: boolean;
  allowLocalNetwork: boolean;
  allowedAgents: string[] | null;
  approvalMode: ApprovalMode;
  approvalWindowMinutes: number | null;
  ttlExpiresAt: string | null;
  maxUses: number | null;
  rotationReminderDays: number | null;
  redactionLabel: string | null;
  clipboardClearSeconds: number | null;
  auditRetentionDays: number | null;
  requiresVpn: boolean;
  vpnProfileName: string | null;
}

const DEFAULT_GOVERNANCE: GovernanceFields = {
  allowedHosts: [],
  allowedHeaders: ["Authorization"],
  allowInUrl: false,
  allowInBody: false,
  allowInEnv: false,
  allowInsecureTransport: false,
  allowLocalNetwork: false,
  allowedAgents: null,
  approvalMode: "auto",
  approvalWindowMinutes: null,
  ttlExpiresAt: null,
  maxUses: null,
  rotationReminderDays: null,
  redactionLabel: null,
  clipboardClearSeconds: null,
  auditRetentionDays: null,
  requiresVpn: false,
  vpnProfileName: null,
};

export class SecretStore {
  constructor(private readonly db: SqliteDb) {}

  // ----- CRUD -----

  create(input: { tenantId: string; draft: DraftSecret; masterKey: LockableSecret; author?: VersionAuthor }): SecretRow {
    const author = input.author ?? "ui";
    const governance: GovernanceFields = { ...DEFAULT_GOVERNANCE, ...input.draft.governance };
    const ts = nowIso();
    const id = newId();
    const itemKeyBytes = generateItemKey();
    const wrappedItemKey = wrapItemKey(itemKeyBytes, id, input.masterKey);
    const itemKey = LockableSecret.fromBytes(itemKeyBytes);
    itemKeyBytes.fill(0);

    try {
      const tx = this.db.transaction(() => {
        // Insert secret row
        this.db
          .prepare(
            `INSERT INTO secrets (
               id, tenant_id, folder_id, type_id, internal_name, title,
               wrapped_item_key, current_version_id,
               allowed_hosts_json, allowed_headers_json,
               allow_in_url, allow_in_body, allow_in_env,
               allow_insecure_transport, allow_local_network,
               allowed_agents_json, approval_mode, approval_window_minutes,
               ttl_expires_at, max_uses, rotation_reminder_days,
               redaction_label, clipboard_clear_seconds, audit_retention_days,
               requires_vpn, vpn_profile_name,
               is_archived, is_compromised, is_compromised_reason,
               is_locked, read_only, trashed_at,
               use_count, last_used_at, last_rotated_at,
               tags_json, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL,
               ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               0, 0, NULL, 0, 0, NULL, 0, NULL, NULL, ?, ?, ?)`,
          )
          .run(
            id,
            input.tenantId,
            input.draft.folderId ?? null,
            input.draft.typeId ?? null,
            input.draft.internalName,
            input.draft.title,
            asBuffer(wrappedItemKey),
            JSON.stringify(governance.allowedHosts),
            JSON.stringify(governance.allowedHeaders),
            governance.allowInUrl ? 1 : 0,
            governance.allowInBody ? 1 : 0,
            governance.allowInEnv ? 1 : 0,
            governance.allowInsecureTransport ? 1 : 0,
            governance.allowLocalNetwork ? 1 : 0,
            governance.allowedAgents ? JSON.stringify(governance.allowedAgents) : null,
            governance.approvalMode,
            governance.approvalWindowMinutes,
            governance.ttlExpiresAt,
            governance.maxUses,
            governance.rotationReminderDays,
            governance.redactionLabel,
            governance.clipboardClearSeconds,
            governance.auditRetentionDays,
            governance.requiresVpn ? 1 : 0,
            governance.vpnProfileName,
            JSON.stringify(input.draft.tags ?? []),
            ts,
            ts,
          );

        const versionId = this.insertVersion({
          secretId: id,
          versionNumber: 1,
          reason: "create",
          author,
          diffSummary: null,
        });

        this.insertFields({
          secretId: id,
          versionId,
          itemKey,
          fields: input.draft.fields,
        });

        if (input.draft.notes !== undefined && input.draft.notes !== null) {
          this.upsertNotes({
            secretId: id,
            versionId,
            itemKey,
            plaintext: input.draft.notes,
          });
        }

        this.db
          .prepare("UPDATE secrets SET current_version_id = ? WHERE id = ?")
          .run(versionId, id);
      });
      tx();
    } finally {
      itemKey.zero();
    }

    return this.get(id)!;
  }

  insertVersion(input: {
    secretId: string;
    versionNumber: number;
    reason: VersionReason;
    author: VersionAuthor;
    diffSummary?: string | null;
  }): string {
    const versionId = newId();
    this.db
      .prepare(
        "INSERT INTO secret_versions (id, secret_id, version_number, reason, diff_summary, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(versionId, input.secretId, input.versionNumber, input.reason, input.diffSummary ?? null, nowIso(), input.author);
    return versionId;
  }

  insertFields(input: {
    secretId: string;
    versionId: string;
    itemKey: LockableSecret;
    fields: DraftSecretField[];
  }): void {
    const stmt = this.db.prepare(
      `INSERT INTO secret_fields (
         id, secret_id, version_id, field_name, field_kind, placement,
         is_secret, is_concealed, public_value, value_ciphertext,
         otp_period, otp_digits, otp_algorithm, sort_order
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    input.fields.forEach((field, idx) => {
      const ciphertext =
        field.isSecret && field.secretValue !== undefined
          ? asBuffer(sealField(field.secretValue, input.itemKey, input.secretId, field.fieldName))
          : null;
      stmt.run(
        newId(),
        input.secretId,
        input.versionId,
        field.fieldName,
        field.fieldKind,
        field.placement,
        field.isSecret ? 1 : 0,
        field.isConcealed === false ? 0 : 1,
        field.publicValue ?? null,
        ciphertext,
        field.otpPeriod ?? null,
        field.otpDigits ?? null,
        field.otpAlgorithm ?? null,
        field.sortOrder ?? idx,
      );
    });
  }

  upsertNotes(input: {
    secretId: string;
    versionId: string;
    itemKey: LockableSecret;
    plaintext: string;
  }): void {
    const ct = input.plaintext === ""
      ? null
      : asBuffer(sealNotes(input.plaintext, input.itemKey, input.secretId));
    this.db
      .prepare(
        "INSERT INTO secret_notes (secret_id, version_id, ciphertext) VALUES (?, ?, ?) " +
          "ON CONFLICT(secret_id, version_id) DO UPDATE SET ciphertext = excluded.ciphertext",
      )
      .run(input.secretId, input.versionId, ct);
  }

  get(id: string): SecretRow | undefined {
    return this.db.prepare("SELECT * FROM secrets WHERE id = ?").get(id) as SecretRow | undefined;
  }

  getByInternalName(tenantId: string, internalName: string): SecretRow | undefined {
    return this.db
      .prepare("SELECT * FROM secrets WHERE tenant_id = ? AND internal_name = ?")
      .get(tenantId, internalName) as SecretRow | undefined;
  }

  list(input: {
    tenantId: string;
    folderId?: string | null;
    includeTrashed?: boolean;
    includeArchived?: boolean;
    search?: string;
  }): SecretRow[] {
    const where: string[] = ["tenant_id = ?"];
    const params: unknown[] = [input.tenantId];
    if (!input.includeTrashed) where.push("trashed_at IS NULL");
    if (!input.includeArchived) where.push("is_archived = 0");
    if (input.folderId !== undefined) {
      if (input.folderId === null) where.push("folder_id IS NULL");
      else {
        where.push("folder_id = ?");
        params.push(input.folderId);
      }
    }
    if (input.search) {
      where.push("(internal_name LIKE ? OR title LIKE ?)");
      const like = `%${input.search}%`;
      params.push(like, like);
    }
    const sql = `SELECT * FROM secrets WHERE ${where.join(" AND ")} ORDER BY title ASC`;
    return this.db.prepare(sql).all(...params) as SecretRow[];
  }

  getCurrentVersion(secretId: string): SecretVersionRow | undefined {
    const secret = this.get(secretId);
    if (!secret?.current_version_id) return undefined;
    return this.db
      .prepare("SELECT * FROM secret_versions WHERE id = ?")
      .get(secret.current_version_id) as SecretVersionRow | undefined;
  }

  listVersions(secretId: string): SecretVersionRow[] {
    return this.db
      .prepare("SELECT * FROM secret_versions WHERE secret_id = ? ORDER BY version_number DESC")
      .all(secretId) as SecretVersionRow[];
  }

  listFields(versionId: string): SecretFieldRow[] {
    return this.db
      .prepare("SELECT * FROM secret_fields WHERE version_id = ? ORDER BY sort_order ASC")
      .all(versionId) as SecretFieldRow[];
  }

  getNotes(secretId: string, versionId: string): SecretNotesRow | undefined {
    return this.db
      .prepare("SELECT * FROM secret_notes WHERE secret_id = ? AND version_id = ?")
      .get(secretId, versionId) as SecretNotesRow | undefined;
  }

  // ----- Mutations on existing secret -----

  updateTitle(id: string, title: string): SecretRow | undefined {
    this.db.prepare("UPDATE secrets SET title = ?, updated_at = ? WHERE id = ?").run(title, nowIso(), id);
    return this.get(id);
  }

  updatePlainMetadata(
    id: string,
    input: { title?: string; lastUsedAt?: string | null; values?: Record<string, string | null | undefined> },
  ): SecretRow | undefined {
    const current = this.get(id);
    if (!current) return undefined;
    const ts = nowIso();
    const title = input.title ?? current.title;
    const lastUsedAt = input.lastUsedAt === undefined ? current.last_used_at : input.lastUsedAt;
    this.db
      .prepare("UPDATE secrets SET title = ?, last_used_at = ?, updated_at = ? WHERE id = ?")
      .run(title, lastUsedAt, ts, id);

    const fields = this.listFields(current.current_version_id ?? "");
    const byName = new Map(fields.map((field) => [field.field_name, field]));
    let nextSortOrder = fields.reduce((max, field) => Math.max(max, field.sort_order), -1) + 1;
    for (const [name, value] of Object.entries(input.values ?? {})) {
      const existing = byName.get(name);
      if (value !== undefined && value !== null && value !== "") {
        if (existing) {
          if (existing.is_secret === 1) continue;
          this.db
            .prepare("UPDATE secret_fields SET public_value = ?, is_concealed = 0 WHERE id = ?")
            .run(value, existing.id);
        } else if (current.current_version_id) {
          this.db
            .prepare(
              `INSERT INTO secret_fields (
                 id, secret_id, version_id, field_name, field_kind, placement,
                 is_secret, is_concealed, public_value, value_ciphertext,
                 otp_period, otp_digits, otp_algorithm, sort_order
               ) VALUES (?, ?, ?, ?, ?, 'none', 0, 0, ?, NULL, NULL, NULL, NULL, ?)`,
            )
            .run(newId(), current.id, current.current_version_id, name, "text", value, nextSortOrder++);
        }
      } else if (existing && existing.is_secret !== 1) {
        this.db.prepare("DELETE FROM secret_fields WHERE id = ?").run(existing.id);
      }
    }
    return this.get(id);
  }

  updateGovernance(id: string, governance: Partial<GovernanceFields>): SecretRow | undefined {
    const current = this.get(id);
    if (!current) return undefined;
    const merged: GovernanceFields = {
      ...DEFAULT_GOVERNANCE,
      allowedHosts: parseJsonArray(current.allowed_hosts_json),
      allowedHeaders: parseJsonArray(current.allowed_headers_json),
      allowInUrl: current.allow_in_url === 1,
      allowInBody: current.allow_in_body === 1,
      allowInEnv: current.allow_in_env === 1,
      allowInsecureTransport: current.allow_insecure_transport === 1,
      allowLocalNetwork: current.allow_local_network === 1,
      allowedAgents: current.allowed_agents_json ? parseJsonArray(current.allowed_agents_json) : null,
      approvalMode: current.approval_mode,
      approvalWindowMinutes: current.approval_window_minutes,
      ttlExpiresAt: current.ttl_expires_at,
      maxUses: current.max_uses,
      rotationReminderDays: current.rotation_reminder_days,
      redactionLabel: current.redaction_label,
      clipboardClearSeconds: current.clipboard_clear_seconds,
      auditRetentionDays: current.audit_retention_days,
      requiresVpn: current.requires_vpn === 1,
      vpnProfileName: current.vpn_profile_name,
      ...governance,
    };
    this.db
      .prepare(
        `UPDATE secrets SET
           allowed_hosts_json = ?,
           allowed_headers_json = ?,
           allow_in_url = ?,
           allow_in_body = ?,
           allow_in_env = ?,
           allow_insecure_transport = ?,
           allow_local_network = ?,
           allowed_agents_json = ?,
           approval_mode = ?,
           approval_window_minutes = ?,
           ttl_expires_at = ?,
           max_uses = ?,
           rotation_reminder_days = ?,
           redaction_label = ?,
           clipboard_clear_seconds = ?,
           audit_retention_days = ?,
           requires_vpn = ?,
           vpn_profile_name = ?,
           updated_at = ?
         WHERE id = ?`,
      )
      .run(
        JSON.stringify(merged.allowedHosts),
        JSON.stringify(merged.allowedHeaders),
        merged.allowInUrl ? 1 : 0,
        merged.allowInBody ? 1 : 0,
        merged.allowInEnv ? 1 : 0,
        merged.allowInsecureTransport ? 1 : 0,
        merged.allowLocalNetwork ? 1 : 0,
        merged.allowedAgents ? JSON.stringify(merged.allowedAgents) : null,
        merged.approvalMode,
        merged.approvalWindowMinutes,
        merged.ttlExpiresAt,
        merged.maxUses,
        merged.rotationReminderDays,
        merged.redactionLabel,
        merged.clipboardClearSeconds,
        merged.auditRetentionDays,
        merged.requiresVpn ? 1 : 0,
        merged.vpnProfileName,
        nowIso(),
        id,
      );
    return this.get(id);
  }

  setArchived(id: string, archived: boolean): SecretRow | undefined {
    this.db.prepare("UPDATE secrets SET is_archived = ?, updated_at = ? WHERE id = ?").run(archived ? 1 : 0, nowIso(), id);
    return this.get(id);
  }

  setCompromised(id: string, flag: boolean, reason: string | null): SecretRow | undefined {
    this.db
      .prepare("UPDATE secrets SET is_compromised = ?, is_compromised_reason = ?, updated_at = ? WHERE id = ?")
      .run(flag ? 1 : 0, reason, nowIso(), id);
    return this.get(id);
  }

  setReadOnly(id: string, readOnly: boolean): SecretRow | undefined {
    this.db.prepare("UPDATE secrets SET read_only = ?, updated_at = ? WHERE id = ?").run(readOnly ? 1 : 0, nowIso(), id);
    return this.get(id);
  }

  trash(id: string): SecretRow | undefined {
    const ts = nowIso();
    this.db.prepare("UPDATE secrets SET trashed_at = ?, updated_at = ? WHERE id = ?").run(ts, ts, id);
    return this.get(id);
  }

  restore(id: string): SecretRow | undefined {
    this.db.prepare("UPDATE secrets SET trashed_at = NULL, updated_at = ? WHERE id = ?").run(nowIso(), id);
    return this.get(id);
  }

  bumpUsage(id: string): void {
    this.db
      .prepare("UPDATE secrets SET use_count = use_count + 1, last_used_at = ? WHERE id = ?")
      .run(nowIso(), id);
  }

  markRotated(id: string): void {
    this.db.prepare("UPDATE secrets SET last_rotated_at = ?, updated_at = ? WHERE id = ?").run(nowIso(), nowIso(), id);
  }

  purgeTrashed(olderThan: Date): number {
    const cutoff = olderThan.toISOString();
    const result = this.db
      .prepare("DELETE FROM secrets WHERE trashed_at IS NOT NULL AND trashed_at < ?")
      .run(cutoff);
    return result.changes;
  }
}

// ---------- Attachment store ----------

export class AttachmentStore {
  constructor(private readonly db: SqliteDb) {}

  add(input: {
    secretId: string;
    versionId: string;
    filename: string;
    mimeType?: string;
    data: Uint8Array;
    masterKey: LockableSecret;
  }): AttachmentRow {
    const id = newId();
    const attachmentKeyBytes = generateAttachmentKey();
    const wrappedKey = wrapAttachmentKey(attachmentKeyBytes, id, input.masterKey);
    const attachmentKey = LockableSecret.fromBytes(attachmentKeyBytes);
    attachmentKeyBytes.fill(0);

    let ciphertext: Uint8Array;
    try {
      ciphertext = sealAttachment(input.data, attachmentKey, id);
    } finally {
      attachmentKey.zero();
    }

    const row: AttachmentRow = {
      id,
      secret_id: input.secretId,
      version_id: input.versionId,
      filename: input.filename,
      mime_type: input.mimeType ?? null,
      size: input.data.length,
      wrapped_attachment_key: asBuffer(wrappedKey),
      ciphertext: asBuffer(ciphertext),
      created_at: nowIso(),
    };

    this.db
      .prepare(
        `INSERT INTO attachments (
           id, secret_id, version_id, filename, mime_type, size,
           wrapped_attachment_key, ciphertext, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.id,
        row.secret_id,
        row.version_id,
        row.filename,
        row.mime_type,
        row.size,
        row.wrapped_attachment_key,
        row.ciphertext,
        row.created_at,
      );
    return row;
  }

  list(versionId: string): AttachmentRow[] {
    return this.db
      .prepare("SELECT * FROM attachments WHERE version_id = ? ORDER BY created_at ASC")
      .all(versionId) as AttachmentRow[];
  }

  get(id: string): AttachmentRow | undefined {
    return this.db.prepare("SELECT * FROM attachments WHERE id = ?").get(id) as AttachmentRow | undefined;
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM attachments WHERE id = ?").run(id);
  }
}

// ---------- Ephemeral authorization store ----------

export class EphemeralAuthorizationStore {
  constructor(private readonly db: SqliteDb) {}

  create(input: {
    tenantId: string;
    secretId: string;
    kind: string;
    scope: Record<string, unknown>;
    durationMinutes: number;
  }): EphemeralAuthorizationRow {
    const ts = new Date();
    const expires = new Date(ts.getTime() + input.durationMinutes * 60 * 1000);
    const row: EphemeralAuthorizationRow = {
      id: newId(),
      tenant_id: input.tenantId,
      secret_id: input.secretId,
      kind: input.kind,
      scope_json: JSON.stringify(input.scope),
      created_at: ts.toISOString(),
      expires_at: expires.toISOString(),
      consumed_at: null,
    };
    this.db
      .prepare(
        "INSERT INTO secret_ephemeral_authorizations (id, tenant_id, secret_id, kind, scope_json, created_at, expires_at, consumed_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)",
      )
      .run(row.id, row.tenant_id, row.secret_id, row.kind, row.scope_json, row.created_at, row.expires_at);
    return row;
  }

  listActive(secretId: string): EphemeralAuthorizationRow[] {
    return this.db
      .prepare(
        "SELECT * FROM secret_ephemeral_authorizations WHERE secret_id = ? AND consumed_at IS NULL AND expires_at > ? ORDER BY expires_at ASC",
      )
      .all(secretId, nowIso()) as EphemeralAuthorizationRow[];
  }

  consume(id: string): void {
    this.db
      .prepare("UPDATE secret_ephemeral_authorizations SET consumed_at = ? WHERE id = ?")
      .run(nowIso(), id);
  }

  sweepExpired(): number {
    const result = this.db
      .prepare("DELETE FROM secret_ephemeral_authorizations WHERE expires_at < ?")
      .run(nowIso());
    return result.changes;
  }
}

// ---------- Policy store ----------

export class PolicyStore {
  constructor(private readonly db: SqliteDb) {}

  create(input: {
    tenantId: string;
    subjectType: string;
    subjectId: string;
    secretName: string;
    capability: string;
    effect: "allow" | "deny";
  }): PolicyRow {
    const row: PolicyRow = {
      id: newId(),
      tenant_id: input.tenantId,
      subject_type: input.subjectType,
      subject_id: input.subjectId,
      secret_name: input.secretName,
      capability: input.capability,
      effect: input.effect,
      created_at: nowIso(),
    };
    this.db
      .prepare(
        "INSERT INTO policies (id, tenant_id, subject_type, subject_id, secret_name, capability, effect, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        row.id,
        row.tenant_id,
        row.subject_type,
        row.subject_id,
        row.secret_name,
        row.capability,
        row.effect,
        row.created_at,
      );
    return row;
  }

  list(tenantId: string): PolicyRow[] {
    return this.db
      .prepare("SELECT * FROM policies WHERE tenant_id = ? ORDER BY created_at DESC")
      .all(tenantId) as PolicyRow[];
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM policies WHERE id = ?").run(id);
  }

  /**
   * Evaluates ABAC rules. Deny takes precedence. If no matching rule is
   * found, the caller decides the default (typically allow for users with
   * tenant_admin role, deny for principals).
   */
  evaluate(input: {
    tenantId: string;
    subjectType: string;
    subjectId: string;
    secretName: string;
    capability: string;
  }): "allow" | "deny" | undefined {
    const rows = this.db
      .prepare(
        "SELECT * FROM policies WHERE tenant_id = ? AND (subject_type = ? OR subject_type = '*') AND (subject_id = ? OR subject_id = '*') AND (secret_name = ? OR secret_name = '*') AND capability = ?",
      )
      .all(input.tenantId, input.subjectType, input.subjectId, input.secretName, input.capability) as PolicyRow[];
    if (rows.length === 0) return undefined;
    if (rows.some((r) => r.effect === "deny")) return "deny";
    return "allow";
  }
}

// ---------- Session cache store ----------

export class SessionCacheStore {
  constructor(private readonly db: SqliteDb) {}

  upsert(input: {
    secretId: string;
    cacheKey: string;
    wrappedToken: Uint8Array;
    expiresAt: string;
  }): void {
    this.db
      .prepare(
        "INSERT INTO secret_session_cache (secret_id, cache_key, wrapped_token, expires_at, refreshed_at) VALUES (?, ?, ?, ?, ?) " +
          "ON CONFLICT(secret_id, cache_key) DO UPDATE SET wrapped_token = excluded.wrapped_token, expires_at = excluded.expires_at, refreshed_at = excluded.refreshed_at",
      )
      .run(input.secretId, input.cacheKey, asBuffer(input.wrappedToken), input.expiresAt, nowIso());
  }

  get(secretId: string, cacheKey: string): SecretSessionCacheRow | undefined {
    return this.db
      .prepare("SELECT * FROM secret_session_cache WHERE secret_id = ? AND cache_key = ?")
      .get(secretId, cacheKey) as SecretSessionCacheRow | undefined;
  }

  drop(secretId: string, cacheKey: string): void {
    this.db.prepare("DELETE FROM secret_session_cache WHERE secret_id = ? AND cache_key = ?").run(secretId, cacheKey);
  }
}

// ---------- Synced resources store ----------

export class SyncedResourceStore {
  constructor(private readonly db: SqliteDb) {}

  upsert(input: {
    secretId: string;
    resourceType: string;
    resourceId: string;
    metadata: Record<string, unknown>;
  }): SecretSyncedResourceRow {
    const id = newId();
    const ts = nowIso();
    this.db
      .prepare(
        "INSERT INTO secret_synced_resources (id, secret_id, resource_type, resource_id, resource_metadata_json, synced_at) VALUES (?, ?, ?, ?, ?, ?) " +
          "ON CONFLICT(secret_id, resource_type, resource_id) DO UPDATE SET resource_metadata_json = excluded.resource_metadata_json, synced_at = excluded.synced_at",
      )
      .run(id, input.secretId, input.resourceType, input.resourceId, JSON.stringify(input.metadata), ts);
    return this.list(input.secretId).find((r) => r.resource_type === input.resourceType && r.resource_id === input.resourceId)!;
  }

  list(secretId: string): SecretSyncedResourceRow[] {
    return this.db
      .prepare("SELECT * FROM secret_synced_resources WHERE secret_id = ? ORDER BY resource_type, resource_id")
      .all(secretId) as SecretSyncedResourceRow[];
  }
}

// ---------- Plugin registry store ----------

export class PluginRegistryStore {
  constructor(private readonly db: SqliteDb) {}

  upsert(input: { pluginId: string; version: string; manifest: unknown }): PluginRegistryRow {
    const ts = nowIso();
    this.db
      .prepare(
        "INSERT INTO plugin_registry (plugin_id, version, manifest_json, installed_at) VALUES (?, ?, ?, ?) " +
          "ON CONFLICT(plugin_id) DO UPDATE SET version = excluded.version, manifest_json = excluded.manifest_json, installed_at = excluded.installed_at",
      )
      .run(input.pluginId, input.version, JSON.stringify(input.manifest), ts);
    return { plugin_id: input.pluginId, version: input.version, manifest_json: JSON.stringify(input.manifest), installed_at: ts };
  }

  list(): PluginRegistryRow[] {
    return this.db.prepare("SELECT * FROM plugin_registry ORDER BY plugin_id ASC").all() as PluginRegistryRow[];
  }

  remove(pluginId: string): void {
    this.db.prepare("DELETE FROM plugin_registry WHERE plugin_id = ?").run(pluginId);
  }
}
