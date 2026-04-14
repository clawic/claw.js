import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import Database from "better-sqlite3";

import { createWrappedSecretVersion, unwrapSecretValue, type CipherEnvelope } from "./crypto.ts";
import { generateOpaqueToken, hashToken, type VaultActor } from "./auth.ts";
import type {
  VaultAuditRecord,
  VaultCapability,
  VaultEffect,
  VaultLeaseMode,
  VaultLeaseRecord,
  VaultPolicyRecord,
  VaultPrincipalRecord,
  VaultPrincipalType,
  VaultSecretMetadata,
  VaultUserRole,
} from "../shared/types.ts";

type SecretRow = {
  id: string;
  tenant_id: string;
  name: string;
  label: string | null;
  kind: string | null;
  type_id: string | null;
  notes: string | null;
  structured_fields_json: string | null;
  allowed_hosts_json: string;
  allowed_header_names_json: string;
  allow_in_url: number;
  allow_in_request_body: number;
  allow_local_network: number;
  read_only: number;
  exportable: number;
  lease_modes_json: string;
  active_version: number;
  updated_at: string;
};

type SecretVersionRow = {
  id: string;
  secret_id: string;
  version: number;
  wrapped_dek_json: string;
  encrypted_value_json: string;
  masked_fingerprint: string;
  created_at: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

function toSecretMetadata(row: SecretRow, version: SecretVersionRow | undefined): VaultSecretMetadata {
  return {
    secretName: row.name,
    ...(row.label ? { label: row.label } : {}),
    ...(row.kind ? { kind: row.kind } : {}),
    ...(row.type_id ? { typeId: row.type_id } : {}),
    ...(row.notes ? { notes: row.notes } : {}),
    ...(row.structured_fields_json ? { structuredFields: JSON.parse(row.structured_fields_json) as Record<string, string> } : {}),
    allowedHosts: parseJsonArray(row.allowed_hosts_json),
    allowedHeaderNames: parseJsonArray(row.allowed_header_names_json),
    allowInURL: row.allow_in_url === 1,
    allowInRequestBody: row.allow_in_request_body === 1,
    allowLocalNetwork: row.allow_local_network === 1,
    readOnly: row.read_only === 1,
    exportable: row.exportable === 1,
    leaseModes: parseJsonArray(row.lease_modes_json) as VaultLeaseMode[],
    maskedFingerprint: version?.masked_fingerprint ?? "sha256:unknown",
    version: row.active_version,
    updatedAt: row.updated_at,
  };
}

export class VaultDatabase {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
    this.seed();
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    this.db.exec(`
      create table if not exists tenants (
        id text primary key,
        display_name text not null,
        created_at text not null
      );
      create table if not exists users (
        id text primary key,
        tenant_id text not null,
        email text not null,
        password_hash text not null,
        role text not null,
        created_at text not null
      );
      create unique index if not exists users_tenant_email on users (tenant_id, email);
      create table if not exists principals (
        id text primary key,
        tenant_id text not null,
        type text not null,
        label text not null,
        token_hash text not null,
        created_at text not null,
        last_used_at text
      );
      create table if not exists secrets (
        id text primary key,
        tenant_id text not null,
        name text not null,
        label text,
        kind text,
        type_id text,
        notes text,
        structured_fields_json text,
        allowed_hosts_json text not null,
        allowed_header_names_json text not null,
        allow_in_url integer not null default 0,
        allow_in_request_body integer not null default 0,
        allow_local_network integer not null default 0,
        read_only integer not null default 0,
        exportable integer not null default 0,
        lease_modes_json text not null,
        active_version integer not null,
        updated_at text not null,
        created_at text not null
      );
      create unique index if not exists secrets_tenant_name on secrets (tenant_id, name);
      create table if not exists secret_versions (
        id text primary key,
        secret_id text not null,
        version integer not null,
        wrapped_dek_json text not null,
        encrypted_value_json text not null,
        masked_fingerprint text not null,
        created_at text not null
      );
      create unique index if not exists secret_versions_unique on secret_versions (secret_id, version);
      create table if not exists policies (
        id text primary key,
        tenant_id text not null,
        subject_type text not null,
        subject_id text not null,
        secret_name text not null,
        capability text not null,
        effect text not null,
        created_at text not null
      );
      create table if not exists leases (
        id text primary key,
        tenant_id text not null,
        secret_name text not null,
        capability text not null,
        mode text not null,
        token_hash text not null,
        created_by_actor_type text not null,
        created_by_actor_id text not null,
        metadata_json text not null,
        created_at text not null,
        expires_at text not null,
        consumed_at text,
        revoked_at text
      );
      create table if not exists audit_events (
        id text primary key,
        tenant_id text not null,
        actor_type text not null,
        actor_id text not null,
        action text not null,
        secret_name text,
        status text not null,
        detail text not null,
        metadata_json text not null,
        created_at text not null
      );
    `);
    const secretColumns = this.db.prepare("pragma table_info(secrets)").all() as Array<{ name: string }>;
    const secretColumnNames = new Set(secretColumns.map((column) => column.name));
    if (!secretColumnNames.has("type_id")) {
      this.db.exec("alter table secrets add column type_id text");
    }
    if (!secretColumnNames.has("structured_fields_json")) {
      this.db.exec("alter table secrets add column structured_fields_json text");
    }
  }

  private seed(): void {
    const tenantExists = this.db.prepare("select id from tenants where id = ?").get("demo-tenant");
    if (!tenantExists) {
      const createdAt = nowIso();
      this.db.prepare("insert into tenants (id, display_name, created_at) values (?, ?, ?)").run("demo-tenant", "Demo Tenant", createdAt);
      this.db.prepare("insert into users (id, tenant_id, email, password_hash, role, created_at) values (?, ?, ?, ?, ?, ?)").run(
        "user-admin",
        "demo-tenant",
        "admin@vault.local",
        "vault-admin",
        "tenant_admin",
        createdAt,
      );
      this.db.prepare("insert into users (id, tenant_id, email, password_hash, role, created_at) values (?, ?, ?, ?, ?, ?)").run(
        "user-operator",
        "demo-tenant",
        "operator@vault.local",
        "vault-operator",
        "tenant_operator",
        createdAt,
      );
    }
  }

  verifyUser(tenantId: string, email: string, password: string): { id: string; email: string; role: VaultUserRole } | null {
    const row = this.db.prepare("select id, email, role, password_hash from users where tenant_id = ? and email = ?").get(tenantId, email) as {
      id: string;
      email: string;
      role: VaultUserRole;
      password_hash: string;
    } | undefined;
    if (!row || row.password_hash !== password) return null;
    return { id: row.id, email: row.email, role: row.role };
  }

  createPrincipal(tenantId: string, type: VaultPrincipalType, label: string): VaultPrincipalRecord & { token: string } {
    const { id, token } = generateOpaqueToken("vlt_prn");
    const createdAt = nowIso();
    this.db.prepare(`
      insert into principals (id, tenant_id, type, label, token_hash, created_at, last_used_at)
      values (?, ?, ?, ?, ?, ?, null)
    `).run(id, tenantId, type, label, hashToken(token), createdAt);
    return {
      id,
      tenantId,
      type,
      label,
      createdAt,
      lastUsedAt: null,
      token,
    };
  }

  authenticatePrincipal(token: string): VaultActor | null {
    const tokenHash = hashToken(token);
    const row = this.db.prepare("select id, tenant_id, type from principals where token_hash = ?").get(tokenHash) as {
      id: string;
      tenant_id: string;
      type: VaultPrincipalType;
    } | undefined;
    if (!row) return null;
    this.db.prepare("update principals set last_used_at = ? where id = ?").run(nowIso(), row.id);
    return {
      actorType: row.type,
      actorId: row.id,
      tenantId: row.tenant_id,
    };
  }

  listPrincipals(tenantId: string): VaultPrincipalRecord[] {
    const rows = this.db.prepare("select id, tenant_id, type, label, created_at, last_used_at from principals where tenant_id = ? order by created_at desc").all(tenantId) as Array<{
      id: string;
      tenant_id: string;
      type: VaultPrincipalType;
      label: string;
      created_at: string;
      last_used_at: string | null;
    }>;
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      type: row.type,
      label: row.label,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
    }));
  }

  upsertSecret(
    tenantId: string,
    input: {
      secretName: string;
      secretValue: string;
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
      exportable?: boolean;
      leaseModes: VaultLeaseMode[];
    },
    kek: Buffer,
  ): VaultSecretMetadata {
    const existing = this.db.prepare("select * from secrets where tenant_id = ? and name = ?").get(tenantId, input.secretName) as SecretRow | undefined;
    const createdAt = nowIso();
    if (!existing) {
      const id = randomUUID();
      const wrapped = createWrappedSecretVersion(input.secretValue, 1, kek);
      this.db.prepare(`
        insert into secrets (
          id, tenant_id, name, label, kind, type_id, notes, structured_fields_json, allowed_hosts_json, allowed_header_names_json,
          allow_in_url, allow_in_request_body, allow_local_network, read_only, exportable, lease_modes_json,
          active_version, updated_at, created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        tenantId,
        input.secretName,
        input.label ?? null,
        input.kind ?? null,
        input.typeId ?? null,
        input.notes ?? null,
        JSON.stringify(input.structuredFields ?? {}),
        JSON.stringify(input.allowedHosts),
        JSON.stringify(input.allowedHeaderNames),
        input.allowInURL ? 1 : 0,
        input.allowInRequestBody ? 1 : 0,
        input.allowLocalNetwork ? 1 : 0,
        input.readOnly ? 1 : 0,
        input.exportable ? 1 : 0,
        JSON.stringify(input.leaseModes),
        wrapped.version,
        createdAt,
        createdAt,
      );
      this.db.prepare(`
        insert into secret_versions (id, secret_id, version, wrapped_dek_json, encrypted_value_json, masked_fingerprint, created_at)
        values (?, ?, ?, ?, ?, ?, ?)
      `).run(
        wrapped.id,
        id,
        wrapped.version,
        JSON.stringify(wrapped.wrappedDek),
        JSON.stringify(wrapped.encryptedValue),
        wrapped.maskedFingerprint,
        createdAt,
      );
      return this.getSecretMetadata(tenantId, input.secretName)!;
    }

    const nextVersion = existing.active_version + 1;
    const wrapped = createWrappedSecretVersion(input.secretValue, nextVersion, kek);
    this.db.prepare(`
      update secrets
      set label = ?, kind = ?, type_id = ?, notes = ?, structured_fields_json = ?, allowed_hosts_json = ?, allowed_header_names_json = ?,
        allow_in_url = ?, allow_in_request_body = ?, allow_local_network = ?, read_only = ?, exportable = ?,
        lease_modes_json = ?, active_version = ?, updated_at = ?
      where id = ?
    `).run(
      input.label ?? null,
      input.kind ?? null,
      input.typeId ?? null,
      input.notes ?? null,
      JSON.stringify(input.structuredFields ?? {}),
      JSON.stringify(input.allowedHosts),
      JSON.stringify(input.allowedHeaderNames),
      input.allowInURL ? 1 : 0,
      input.allowInRequestBody ? 1 : 0,
      input.allowLocalNetwork ? 1 : 0,
      input.readOnly ? 1 : 0,
      input.exportable ? 1 : 0,
      JSON.stringify(input.leaseModes),
      nextVersion,
      createdAt,
      existing.id,
    );
    this.db.prepare(`
      insert into secret_versions (id, secret_id, version, wrapped_dek_json, encrypted_value_json, masked_fingerprint, created_at)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(
      wrapped.id,
      existing.id,
      wrapped.version,
      JSON.stringify(wrapped.wrappedDek),
      JSON.stringify(wrapped.encryptedValue),
      wrapped.maskedFingerprint,
      createdAt,
    );
    return this.getSecretMetadata(tenantId, input.secretName)!;
  }

  listSecrets(tenantId: string, search?: string): VaultSecretMetadata[] {
    const rows = (search?.trim()
      ? this.db.prepare("select * from secrets where tenant_id = ? and name like ? order by updated_at desc").all(tenantId, `%${search.trim()}%`)
      : this.db.prepare("select * from secrets where tenant_id = ? order by updated_at desc").all(tenantId)) as SecretRow[];
    return rows.map((row) => {
      const version = this.db.prepare("select * from secret_versions where secret_id = ? and version = ?").get(row.id, row.active_version) as SecretVersionRow | undefined;
      return toSecretMetadata(row, version);
    });
  }

  getSecretRow(tenantId: string, secretName: string): SecretRow | null {
    return (this.db.prepare("select * from secrets where tenant_id = ? and name = ?").get(tenantId, secretName) as SecretRow | undefined) ?? null;
  }

  getSecretMetadata(tenantId: string, secretName: string): VaultSecretMetadata | null {
    const row = this.getSecretRow(tenantId, secretName);
    if (!row) return null;
    const version = this.db.prepare("select * from secret_versions where secret_id = ? and version = ?").get(row.id, row.active_version) as SecretVersionRow | undefined;
    return toSecretMetadata(row, version);
  }

  readSecretValue(tenantId: string, secretName: string, kek: Buffer): string | null {
    const row = this.getSecretRow(tenantId, secretName);
    if (!row) return null;
    const version = this.db.prepare("select * from secret_versions where secret_id = ? and version = ?").get(row.id, row.active_version) as SecretVersionRow | undefined;
    if (!version) return null;
    return unwrapSecretValue({
      wrappedDek: JSON.parse(version.wrapped_dek_json) as CipherEnvelope,
      encryptedValue: JSON.parse(version.encrypted_value_json) as CipherEnvelope,
    }, kek);
  }

  createPolicy(input: {
    tenantId: string;
    subjectType: VaultUserRole | VaultPrincipalType | "*";
    subjectId: string;
    secretName: string;
    capability: VaultCapability;
    effect: VaultEffect;
  }): VaultPolicyRecord {
    const id = randomUUID();
    const createdAt = nowIso();
    this.db.prepare(`
      insert into policies (id, tenant_id, subject_type, subject_id, secret_name, capability, effect, created_at)
      values (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.tenantId, input.subjectType, input.subjectId, input.secretName, input.capability, input.effect, createdAt);
    return {
      id,
      tenantId: input.tenantId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      secretName: input.secretName,
      capability: input.capability,
      effect: input.effect,
      createdAt,
    };
  }

  listPolicies(tenantId: string): VaultPolicyRecord[] {
    const rows = this.db.prepare(`
      select
        id,
        tenant_id as tenantId,
        subject_type as subjectType,
        subject_id as subjectId,
        secret_name as secretName,
        capability,
        effect,
        created_at as createdAt
      from policies
      where tenant_id = ?
      order by created_at desc
    `).all(tenantId) as VaultPolicyRecord[];
    return rows;
  }

  deletePolicy(tenantId: string, policyId: string): boolean {
    const result = this.db.prepare("delete from policies where tenant_id = ? and id = ?").run(tenantId, policyId);
    return result.changes > 0;
  }

  createLease(input: {
    tenantId: string;
    secretName: string;
    capability: VaultCapability;
    mode: VaultLeaseMode;
    ttlSec: number;
    actor: VaultActor;
    metadata?: Record<string, unknown>;
  }): VaultLeaseRecord & { token: string } {
    const { id, token } = generateOpaqueToken("vlt_lease");
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + Math.max(1, input.ttlSec) * 1000).toISOString();
    this.db.prepare(`
      insert into leases (
        id, tenant_id, secret_name, capability, mode, token_hash,
        created_by_actor_type, created_by_actor_id, metadata_json, created_at, expires_at, consumed_at, revoked_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, null)
    `).run(
      id,
      input.tenantId,
      input.secretName,
      input.capability,
      input.mode,
      hashToken(token),
      input.actor.actorType,
      input.actor.actorId,
      JSON.stringify(input.metadata ?? {}),
      createdAt,
      expiresAt,
    );
    return {
      id,
      tenantId: input.tenantId,
      secretName: input.secretName,
      capability: input.capability,
      mode: input.mode,
      createdAt,
      expiresAt,
      consumedAt: null,
      revokedAt: null,
      token,
    };
  }

  listLeases(tenantId: string): VaultLeaseRecord[] {
    return this.db.prepare("select id, tenant_id as tenantId, secret_name as secretName, capability, mode, created_at as createdAt, expires_at as expiresAt, consumed_at as consumedAt, revoked_at as revokedAt from leases where tenant_id = ? order by created_at desc").all(tenantId) as VaultLeaseRecord[];
  }

  revokeLease(tenantId: string, leaseId: string): boolean {
    const result = this.db.prepare("update leases set revoked_at = ? where tenant_id = ? and id = ? and revoked_at is null").run(nowIso(), tenantId, leaseId);
    return result.changes > 0;
  }

  consumeLease(tenantId: string, leaseId: string, token: string): { secretName: string; capability: VaultCapability; mode: VaultLeaseMode } | null {
    const row = this.db.prepare("select * from leases where tenant_id = ? and id = ?").get(tenantId, leaseId) as {
      id: string;
      secret_name: string;
      capability: VaultCapability;
      mode: VaultLeaseMode;
      token_hash: string;
      expires_at: string;
      consumed_at: string | null;
      revoked_at: string | null;
    } | undefined;
    if (!row) return null;
    if (row.token_hash !== hashToken(token)) return null;
    if (row.revoked_at || row.consumed_at) return null;
    if (Date.parse(row.expires_at) < Date.now()) return null;
    this.db.prepare("update leases set consumed_at = ? where id = ?").run(nowIso(), leaseId);
    return {
      secretName: row.secret_name,
      capability: row.capability,
      mode: row.mode,
    };
  }

  appendAudit(input: {
    tenantId: string;
    actorType: string;
    actorId: string;
    action: string;
    secretName?: string;
    status: "success" | "error";
    detail: string;
    metadata?: Record<string, unknown>;
  }): void {
    this.db.prepare(`
      insert into audit_events (id, tenant_id, actor_type, actor_id, action, secret_name, status, detail, metadata_json, created_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      input.tenantId,
      input.actorType,
      input.actorId,
      input.action,
      input.secretName ?? null,
      input.status,
      input.detail,
      JSON.stringify(input.metadata ?? {}),
      nowIso(),
    );
  }

  listAudit(tenantId: string): VaultAuditRecord[] {
    return this.db.prepare("select id, tenant_id as tenantId, actor_type as actorType, actor_id as actorId, action, secret_name as secretName, status, detail, created_at as createdAt from audit_events where tenant_id = ? order by created_at desc").all(tenantId) as VaultAuditRecord[];
  }
}
