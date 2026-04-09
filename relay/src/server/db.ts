import { createHash, randomUUID } from "node:crypto";

import Database from "better-sqlite3";

import type { ActivityRecord, ConnectorAuthContext, ConnectorWorkspaceDescriptor, UsageRecord } from "../shared/protocol.ts";
import { generateOpaqueToken, parseOpaqueToken } from "../shared/protocol.ts";
import { buildEffectiveAccessPolicy, type EffectiveAccessPolicy, type ProjectResourceRef, type ProjectSecretRef } from "../shared/project-model.ts";
import { randomCode, verifyPasswordHash } from "./security.ts";

interface MembershipRow {
  user_id: string;
  tenant_id: string;
  scopes_json: string;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: "admin" | "user";
}

interface TableColumnRow {
  name: string;
}

const SEEDED_PASSWORD_HASHES = {
  admin: "$argon2id$v=19$m=65536,t=3,p=4$YTbT6cgvfjxPmilhTzj9Ug$zTKomDhj/v0KBLMQy42glrgABL2ptwhTCV8PCrNOB8U",
  user: "$argon2id$v=19$m=65536,t=3,p=4$iGARd9UUspBceQ3IohaTig$DqtKkxl29XpQxPqvz8g9ZY4MeQ6vadyBGpfcO1Uu/pY",
} as const;

function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function now(): number {
  return Date.now();
}

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

function parseJsonObject<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export class RelayDatabase {
  readonly sqlite: Database.Database;

  constructor(filename: string) {
    this.sqlite = new Database(filename);
    this.sqlite.pragma("journal_mode = WAL");
    this.sqlite.pragma("foreign_keys = ON");
    this.init();
    this.seed();
  }

  close(): void {
    this.sqlite.close();
  }

  private init(): void {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS memberships (
        user_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        scopes_json TEXT NOT NULL,
        PRIMARY KEY (user_id, tenant_id)
      );
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        token_id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL,
        user_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        scopes_json TEXT NOT NULL,
        device_id TEXT,
        agent_id TEXT,
        workspace_id TEXT,
        expires_at INTEGER NOT NULL,
        revoked_at INTEGER,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS connector_enrollments (
        token_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        connector_id TEXT,
        agent_id TEXT NOT NULL,
        description TEXT,
        token_hash TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        used_at INTEGER,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS connector_credentials (
        token_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        connector_id TEXT,
        agent_id TEXT NOT NULL,
        description TEXT,
        token_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_rotated_at INTEGER NOT NULL,
        revoked_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS connectors (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_seen_at INTEGER,
        PRIMARY KEY (tenant_id, id)
      );
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        label TEXT NOT NULL,
        platform TEXT,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        revoked_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS workspace_grants (
        tenant_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (tenant_id, device_id, agent_id, workspace_id)
      );
      CREATE TABLE IF NOT EXISTS pairing_sessions (
        id TEXT PRIMARY KEY,
        device_code_id TEXT NOT NULL UNIQUE,
        device_code_hash TEXT NOT NULL,
        user_code TEXT NOT NULL,
        requested_connector_id TEXT NOT NULL,
        requested_agent_id TEXT NOT NULL,
        requested_display_name TEXT,
        tenant_id TEXT,
        connector_id TEXT,
        agent_id TEXT,
        approved_by_user_id TEXT,
        connector_token_id TEXT,
        status TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        last_polled_at INTEGER,
        approved_at INTEGER,
        denied_at INTEGER,
        consumed_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        role TEXT,
        description TEXT,
        instructions TEXT,
        resource_refs_json TEXT,
        secret_refs_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (tenant_id, id)
      );
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        description TEXT,
        instructions TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (tenant_id, id)
      );
      CREATE TABLE IF NOT EXISTS project_agents (
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        runtime_agent_id TEXT NOT NULL,
        display_name TEXT,
        instructions TEXT,
        resource_refs_json TEXT,
        secret_refs_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (tenant_id, project_id, agent_id)
      );
      CREATE TABLE IF NOT EXISTS project_resource_refs (
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        ref_id TEXT NOT NULL,
        label TEXT,
        uri TEXT,
        mode TEXT,
        metadata_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (tenant_id, project_id, ref_id)
      );
      CREATE TABLE IF NOT EXISTS project_secret_refs (
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        ref_id TEXT NOT NULL,
        label TEXT,
        secret_name TEXT,
        mode TEXT,
        metadata_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (tenant_id, project_id, ref_id)
      );
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (tenant_id, agent_id, id)
      );
      CREATE TABLE IF NOT EXISTS connector_sessions (
        id TEXT PRIMARY KEY,
        credential_token_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        status TEXT NOT NULL,
        connected_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        capabilities_json TEXT,
        version TEXT
      );
      CREATE TABLE IF NOT EXISTS activity_events (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        agent_id TEXT,
        workspace_id TEXT,
        capability TEXT NOT NULL,
        status TEXT NOT NULL,
        detail TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS usage_records (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        agent_id TEXT,
        workspace_id TEXT,
        tokens_in INTEGER NOT NULL,
        tokens_out INTEGER NOT NULL,
        estimated_cost_usd REAL NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
    this.ensureColumn("agents", "role", "TEXT");
    this.ensureColumn("agents", "description", "TEXT");
    this.ensureColumn("agents", "instructions", "TEXT");
    this.ensureColumn("agents", "resource_refs_json", "TEXT");
    this.ensureColumn("agents", "secret_refs_json", "TEXT");
    this.ensureColumn("projects", "instructions", "TEXT");
    this.ensureColumn("project_agents", "instructions", "TEXT");
    this.ensureColumn("project_agents", "resource_refs_json", "TEXT");
    this.ensureColumn("project_agents", "secret_refs_json", "TEXT");
    this.ensureColumn("project_agents", "display_name", "TEXT");
    this.ensureColumn("refresh_tokens", "device_id", "TEXT");
    this.ensureColumn("connector_enrollments", "connector_id", "TEXT");
    this.ensureColumn("connector_credentials", "connector_id", "TEXT");
    this.ensureColumn("connector_sessions", "connector_id", "TEXT");
  }

  private ensureColumn(tableName: string, columnName: string, columnDefinition: string): void {
    const rows = this.sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as TableColumnRow[];
    if (rows.some((row) => row.name === columnName)) return;
    this.sqlite.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
  }

  private seed(): void {
    this.sqlite.prepare("INSERT OR IGNORE INTO tenants (id, name, created_at) VALUES (?, ?, ?)").run(
      "demo-tenant",
      "Demo Tenant",
      now(),
    );
    this.ensureUser("admin@relay.local", "relay-admin", "admin", ["*"]);
    this.ensureUser("user@relay.local", "relay-user", "user", [
      "tenant:read",
      "agent:read",
      "workspace:read",
      "chat:read",
      "chat:write",
      "chat:stream",
      "workspace:data",
    ]);
  }

  private ensureUser(email: string, password: string, role: "admin" | "user", scopes: string[]): void {
    const userId = `${role}-user`;
    const passwordHash = role === "admin" ? SEEDED_PASSWORD_HASHES.admin : SEEDED_PASSWORD_HASHES.user;
    this.sqlite.prepare(
      "INSERT OR IGNORE INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(userId, email, passwordHash, role, now());
    if (password) {
      this.sqlite.prepare("UPDATE users SET password_hash = ? WHERE id = ? AND password_hash = ?").run(
        passwordHash,
        userId,
        hashSecret(password),
      );
    }
    this.sqlite.prepare(
      "INSERT OR IGNORE INTO memberships (user_id, tenant_id, scopes_json) VALUES (?, ?, ?)",
    ).run(userId, "demo-tenant", JSON.stringify(scopes));
  }

  getUserByEmail(email: string): { id: string; email: string; role: "admin" | "user"; passwordHash: string } | null {
    const row = this.sqlite.prepare("SELECT id, email, role, password_hash FROM users WHERE email = ?").get(email) as UserRow | undefined;
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      role: row.role,
      passwordHash: row.password_hash,
    };
  }

  getUserById(userId: string): { id: string; email: string; role: "admin" | "user"; passwordHash: string } | null {
    const row = this.sqlite.prepare("SELECT id, email, role, password_hash FROM users WHERE id = ?").get(userId) as UserRow | undefined;
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      role: row.role,
      passwordHash: row.password_hash,
    };
  }

  async verifyPassword(user: { id: string; passwordHash: string }, password: string): Promise<boolean> {
    const result = await verifyPasswordHash(user.passwordHash, password);
    if (result.valid && result.upgradedHash) {
      this.sqlite.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(result.upgradedHash, user.id);
    }
    return result.valid;
  }

  getMembership(userId: string, tenantId: string): { tenantId: string; scopes: string[] } | null {
    const row = this.sqlite.prepare("SELECT user_id, tenant_id, scopes_json FROM memberships WHERE user_id = ? AND tenant_id = ?").get(
      userId,
      tenantId,
    ) as MembershipRow | undefined;
    if (!row) return null;
    return {
      tenantId: row.tenant_id,
      scopes: parseJsonArray(row.scopes_json),
    };
  }

  createRefreshToken(input: {
    userId: string;
    tenantId: string;
    scopes: string[];
    deviceId?: string;
    agentId?: string;
    workspaceId?: string;
    ttlSec: number;
  }): string {
    const generated = generateOpaqueToken("rfr");
    this.sqlite.prepare(`
      INSERT INTO refresh_tokens (
        token_id, token_hash, user_id, tenant_id, scopes_json, device_id, agent_id, workspace_id, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      generated.tokenId,
      hashSecret(generated.secret),
      input.userId,
      input.tenantId,
      JSON.stringify(input.scopes),
      input.deviceId ?? null,
      input.agentId ?? null,
      input.workspaceId ?? null,
      now() + input.ttlSec * 1000,
      now(),
    );
    return generated.token;
  }

  consumeRefreshToken(token: string): {
    userId: string;
    tenantId: string;
    scopes: string[];
    deviceId?: string;
    agentId?: string;
    workspaceId?: string;
  } | null {
    const parsed = parseOpaqueToken("rfr", token);
    if (!parsed) return null;
    const row = this.sqlite.prepare(`
      SELECT token_hash, user_id, tenant_id, scopes_json, device_id, agent_id, workspace_id, expires_at, revoked_at
      FROM refresh_tokens WHERE token_id = ?
    `).get(parsed.tokenId) as {
      token_hash: string;
      user_id: string;
      tenant_id: string;
      scopes_json: string;
      device_id: string | null;
      agent_id: string | null;
      workspace_id: string | null;
      expires_at: number;
      revoked_at: number | null;
    } | undefined;
    if (!row) return null;
    if (row.revoked_at || row.expires_at <= now()) return null;
    if (row.token_hash !== hashSecret(parsed.secret)) return null;
    this.sqlite.prepare("UPDATE refresh_tokens SET revoked_at = ? WHERE token_id = ?").run(now(), parsed.tokenId);
    return {
      userId: row.user_id,
      tenantId: row.tenant_id,
      scopes: parseJsonArray(row.scopes_json),
      ...(row.device_id ? { deviceId: row.device_id } : {}),
      ...(row.agent_id ? { agentId: row.agent_id } : {}),
      ...(row.workspace_id ? { workspaceId: row.workspace_id } : {}),
    };
  }

  revokeRefreshToken(token: string): void {
    const parsed = parseOpaqueToken("rfr", token);
    if (!parsed) return;
    this.sqlite.prepare("UPDATE refresh_tokens SET revoked_at = ? WHERE token_id = ?").run(now(), parsed.tokenId);
  }

  createDevice(input: {
    userId: string;
    tenantId: string;
    label: string;
    platform?: string;
  }): { deviceId: string; label: string; platform?: string | null; createdAt: number; lastSeenAt: number } {
    const deviceId = randomUUID();
    const timestamp = now();
    this.sqlite.prepare(`
      INSERT INTO devices (id, user_id, tenant_id, label, platform, created_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(deviceId, input.userId, input.tenantId, input.label, input.platform ?? null, timestamp, timestamp);
    return {
      deviceId,
      label: input.label,
      platform: input.platform ?? null,
      createdAt: timestamp,
      lastSeenAt: timestamp,
    };
  }

  touchDevice(deviceId: string): void {
    this.sqlite.prepare("UPDATE devices SET last_seen_at = ? WHERE id = ? AND revoked_at IS NULL").run(now(), deviceId);
  }

  listDevices(userId: string, tenantId: string): Array<{
    deviceId: string;
    label: string;
    platform?: string | null;
    createdAt: number;
    lastSeenAt: number;
    revokedAt?: number | null;
  }> {
    const rows = this.sqlite.prepare(`
      SELECT id, label, platform, created_at, last_seen_at, revoked_at
      FROM devices
      WHERE user_id = ? AND tenant_id = ?
      ORDER BY created_at DESC
    `).all(userId, tenantId) as Array<{
      id: string;
      label: string;
      platform: string | null;
      created_at: number;
      last_seen_at: number;
      revoked_at: number | null;
    }>;
    return rows.map((row) => ({
      deviceId: row.id,
      label: row.label,
      platform: row.platform,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      revokedAt: row.revoked_at,
    }));
  }

  createWorkspaceGrant(input: {
    tenantId: string;
    deviceId: string;
    agentId: string;
    workspaceId: string;
  }): void {
    this.sqlite.prepare(`
      INSERT OR IGNORE INTO workspace_grants (tenant_id, device_id, agent_id, workspace_id, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(input.tenantId, input.deviceId, input.agentId, input.workspaceId, now());
  }

  deviceHasWorkspaceAccess(tenantId: string, deviceId: string, agentId: string, workspaceId: string): boolean {
    const total = this.sqlite.prepare(`
      SELECT COUNT(*) as count
      FROM workspace_grants
      WHERE tenant_id = ? AND device_id = ?
    `).get(tenantId, deviceId) as { count: number };
    if ((total.count ?? 0) === 0) return true;

    const match = this.sqlite.prepare(`
      SELECT COUNT(*) as count
      FROM workspace_grants
      WHERE tenant_id = ? AND device_id = ? AND agent_id = ? AND workspace_id = ?
    `).get(tenantId, deviceId, agentId, workspaceId) as { count: number };
    return (match.count ?? 0) > 0;
  }

  listGrantedWorkspacesForDevice(tenantId: string, deviceId: string): Array<{ agentId: string; workspaceId: string; displayName: string }> {
    const total = this.sqlite.prepare(`
      SELECT COUNT(*) as count
      FROM workspace_grants
      WHERE tenant_id = ? AND device_id = ?
    `).get(tenantId, deviceId) as { count: number };

    if ((total.count ?? 0) === 0) {
      const rows = this.sqlite.prepare(`
        SELECT agent_id, id, display_name
        FROM workspaces
        WHERE tenant_id = ?
        ORDER BY agent_id, id
      `).all(tenantId) as Array<{ agent_id: string; id: string; display_name: string }>;
      return rows.map((row) => ({
        agentId: row.agent_id,
        workspaceId: row.id,
        displayName: row.display_name,
      }));
    }

    const rows = this.sqlite.prepare(`
      SELECT wg.agent_id, wg.workspace_id, w.display_name
      FROM workspace_grants wg
      LEFT JOIN workspaces w
        ON w.tenant_id = wg.tenant_id AND w.agent_id = wg.agent_id AND w.id = wg.workspace_id
      WHERE wg.tenant_id = ? AND wg.device_id = ?
      ORDER BY wg.agent_id, wg.workspace_id
    `).all(tenantId, deviceId) as Array<{
      agent_id: string;
      workspace_id: string;
      display_name: string | null;
    }>;
    return rows.map((row) => ({
      agentId: row.agent_id,
      workspaceId: row.workspace_id,
      displayName: row.display_name ?? row.workspace_id,
    }));
  }

  upsertConnector(tenantId: string, connectorId: string, agentId: string, displayName?: string): void {
    const timestamp = now();
    this.sqlite.prepare(`
      INSERT INTO connectors (id, tenant_id, agent_id, display_name, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'pending', ?, ?)
      ON CONFLICT(tenant_id, id) DO UPDATE SET
        agent_id = excluded.agent_id,
        display_name = excluded.display_name,
        updated_at = excluded.updated_at
    `).run(connectorId, tenantId, agentId, displayName ?? agentId, timestamp, timestamp);
  }

  getConnector(tenantId: string, connectorId: string): {
    connectorId: string;
    agentId: string;
    displayName: string;
    status: string;
    lastSeenAt?: number | null;
  } | null {
    const row = this.sqlite.prepare(`
      SELECT id, agent_id, display_name, status, last_seen_at
      FROM connectors
      WHERE tenant_id = ? AND id = ?
    `).get(tenantId, connectorId) as {
      id: string;
      agent_id: string;
      display_name: string;
      status: string;
      last_seen_at: number | null;
    } | undefined;
    if (!row) return null;
    return {
      connectorId: row.id,
      agentId: row.agent_id,
      displayName: row.display_name,
      status: row.status,
      lastSeenAt: row.last_seen_at,
    };
  }

  getConnectorByAgentId(tenantId: string, agentId: string): {
    connectorId: string;
    agentId: string;
    displayName: string;
    status: string;
    lastSeenAt?: number | null;
  } | null {
    const row = this.sqlite.prepare(`
      SELECT id, agent_id, display_name, status, last_seen_at
      FROM connectors
      WHERE tenant_id = ? AND agent_id = ?
      ORDER BY updated_at DESC
      LIMIT 1
    `).get(tenantId, agentId) as {
      id: string;
      agent_id: string;
      display_name: string;
      status: string;
      last_seen_at: number | null;
    } | undefined;
    if (!row) return null;
    return {
      connectorId: row.id,
      agentId: row.agent_id,
      displayName: row.display_name,
      status: row.status,
      lastSeenAt: row.last_seen_at,
    };
  }

  private createConnectorCredential(input: {
    tenantId: string;
    connectorId: string;
    agentId: string;
    description?: string | null;
  }): { tokenId: string; connectorToken: string } {
    const connector = generateOpaqueToken("con");
    this.sqlite.prepare(`
      INSERT INTO connector_credentials (
        token_id, tenant_id, connector_id, agent_id, description, token_hash, created_at, last_rotated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      connector.tokenId,
      input.tenantId,
      input.connectorId,
      input.agentId,
      input.description ?? null,
      hashSecret(connector.secret),
      now(),
      now(),
    );
    return { tokenId: connector.tokenId, connectorToken: connector.token };
  }

  createPairingSession(input: {
    connectorId: string;
    agentId: string;
    displayName?: string;
    expiresSec: number;
  }): {
    pairingId: string;
    deviceCode: string;
    userCode: string;
    expiresAt: number;
  } {
    const pairingId = randomUUID();
    const generated = generateOpaqueToken("dvc");
    const expiresAt = now() + input.expiresSec * 1000;
    const userCode = `${randomCode(4)}-${randomCode(4)}`;
    this.sqlite.prepare(`
      INSERT INTO pairing_sessions (
        id, device_code_id, device_code_hash, user_code, requested_connector_id, requested_agent_id, requested_display_name,
        status, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(
      pairingId,
      generated.tokenId,
      hashSecret(generated.secret),
      userCode,
      input.connectorId,
      input.agentId,
      input.displayName ?? null,
      expiresAt,
      now(),
    );
    return {
      pairingId,
      deviceCode: generated.token,
      userCode,
      expiresAt,
    };
  }

  getPairingSession(pairingId: string): {
    pairingId: string;
    userCode: string;
    requestedConnectorId: string;
    requestedAgentId: string;
    requestedDisplayName?: string | null;
    tenantId?: string | null;
    connectorId?: string | null;
    agentId?: string | null;
    status: string;
    expiresAt: number;
  } | null {
    const row = this.sqlite.prepare(`
      SELECT id, user_code, requested_connector_id, requested_agent_id, requested_display_name,
        tenant_id, connector_id, agent_id, status, expires_at
      FROM pairing_sessions WHERE id = ?
    `).get(pairingId) as {
      id: string;
      user_code: string;
      requested_connector_id: string;
      requested_agent_id: string;
      requested_display_name: string | null;
      tenant_id: string | null;
      connector_id: string | null;
      agent_id: string | null;
      status: string;
      expires_at: number;
    } | undefined;
    if (!row) return null;
    return {
      pairingId: row.id,
      userCode: row.user_code,
      requestedConnectorId: row.requested_connector_id,
      requestedAgentId: row.requested_agent_id,
      requestedDisplayName: row.requested_display_name,
      tenantId: row.tenant_id,
      connectorId: row.connector_id,
      agentId: row.agent_id,
      status: row.status,
      expiresAt: row.expires_at,
    };
  }

  approvePairing(pairingId: string, input: {
    tenantId: string;
    approvedByUserId: string;
  }): {
    pairingId: string;
    tenantId: string;
    connectorId: string;
    agentId: string;
  } | null {
    const row = this.sqlite.prepare(`
      SELECT requested_connector_id, requested_agent_id, requested_display_name, status, expires_at
      FROM pairing_sessions
      WHERE id = ?
    `).get(pairingId) as {
      requested_connector_id: string;
      requested_agent_id: string;
      requested_display_name: string | null;
      status: string;
      expires_at: number;
    } | undefined;
    if (!row || row.status !== "pending" || row.expires_at <= now()) return null;
    this.upsertConnector(input.tenantId, row.requested_connector_id, row.requested_agent_id, row.requested_display_name ?? row.requested_agent_id);
    this.upsertAgent(input.tenantId, row.requested_agent_id, row.requested_agent_id);
    this.sqlite.prepare(`
      UPDATE pairing_sessions
      SET status = 'approved',
          tenant_id = ?,
          connector_id = ?,
          agent_id = ?,
          approved_by_user_id = ?,
          approved_at = ?
      WHERE id = ?
    `).run(
      input.tenantId,
      row.requested_connector_id,
      row.requested_agent_id,
      input.approvedByUserId,
      now(),
      pairingId,
    );
    return {
      pairingId,
      tenantId: input.tenantId,
      connectorId: row.requested_connector_id,
      agentId: row.requested_agent_id,
    };
  }

  denyPairing(pairingId: string): boolean {
    const changed = this.sqlite.prepare(`
      UPDATE pairing_sessions
      SET status = 'denied',
          denied_at = ?
      WHERE id = ? AND status = 'pending'
    `).run(now(), pairingId);
    return changed.changes > 0;
  }

  consumeApprovedPairing(deviceCode: string): {
    pairingId: string;
    tenantId: string;
    connectorId: string;
    agentId: string;
    connectorToken: string;
  } | { status: "pending" | "denied" | "expired" | "already_used" | "invalid" } {
    const parsed = parseOpaqueToken("dvc", deviceCode);
    if (!parsed) return { status: "invalid" };
    const row = this.sqlite.prepare(`
      SELECT id, device_code_hash, tenant_id, connector_id, agent_id, connector_token_id, status, expires_at, consumed_at
      FROM pairing_sessions
      WHERE device_code_id = ?
    `).get(parsed.tokenId) as {
      id: string;
      device_code_hash: string;
      tenant_id: string | null;
      connector_id: string | null;
      agent_id: string | null;
      connector_token_id: string | null;
      status: string;
      expires_at: number;
      consumed_at: number | null;
    } | undefined;
    if (!row || row.device_code_hash !== hashSecret(parsed.secret)) return { status: "invalid" };
    this.sqlite.prepare("UPDATE pairing_sessions SET last_polled_at = ? WHERE id = ?").run(now(), row.id);
    if (row.expires_at <= now()) return { status: "expired" };
    if (row.status === "pending") return { status: "pending" };
    if (row.status === "denied") return { status: "denied" };
    if (row.consumed_at) return { status: "already_used" };
    if (row.status !== "approved" || !row.tenant_id || !row.connector_id || !row.agent_id) {
      return { status: "invalid" };
    }
    const credential = this.createConnectorCredential({
      tenantId: row.tenant_id,
      connectorId: row.connector_id,
      agentId: row.agent_id,
      description: null,
    });
    this.sqlite.prepare("UPDATE pairing_sessions SET consumed_at = ? WHERE id = ?").run(now(), row.id);
    return {
      pairingId: row.id,
      tenantId: row.tenant_id,
      connectorId: row.connector_id,
      agentId: row.agent_id,
      connectorToken: credential.connectorToken,
    };
  }

  revokeConnector(tenantId: string, connectorId: string): boolean {
    this.sqlite.prepare(`
      UPDATE connector_credentials
      SET revoked_at = COALESCE(revoked_at, ?)
      WHERE tenant_id = ? AND COALESCE(connector_id, agent_id) = ?
    `).run(now(), tenantId, connectorId);
    const changed = this.sqlite.prepare(`
      UPDATE connectors
      SET status = 'revoked', updated_at = ?
      WHERE tenant_id = ? AND id = ?
    `).run(now(), tenantId, connectorId);
    return changed.changes > 0;
  }

  createEnrollment(tenantId: string, agentId: string, description?: string, ttlSec = 3600): string {
    const generated = generateOpaqueToken("enr");
    const connectorId = agentId;
    this.upsertConnector(tenantId, connectorId, agentId, description ?? agentId);
    this.sqlite.prepare(`
      INSERT INTO connector_enrollments (token_id, tenant_id, connector_id, agent_id, description, token_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      generated.tokenId,
      tenantId,
      connectorId,
      agentId,
      description ?? null,
      hashSecret(generated.secret),
      now() + ttlSec * 1000,
      now(),
    );
    this.upsertAgent(tenantId, agentId, agentId);
    return generated.token;
  }

  consumeEnrollment(token: string): { tenantId: string; connectorId: string; agentId: string; connectorToken: string } | null {
    const parsed = parseOpaqueToken("enr", token);
    if (!parsed) return null;
    const row = this.sqlite.prepare(`
      SELECT tenant_id, connector_id, agent_id, token_hash, expires_at, used_at, description
      FROM connector_enrollments WHERE token_id = ?
    `).get(parsed.tokenId) as {
      tenant_id: string;
      connector_id: string | null;
      agent_id: string;
      token_hash: string;
      expires_at: number;
      used_at: number | null;
      description: string | null;
    } | undefined;
    if (!row) return null;
    if (row.used_at || row.expires_at <= now()) return null;
    if (row.token_hash !== hashSecret(parsed.secret)) return null;

    this.sqlite.prepare("UPDATE connector_enrollments SET used_at = ? WHERE token_id = ?").run(now(), parsed.tokenId);
    const connectorId = row.connector_id ?? row.agent_id;
    const connector = this.createConnectorCredential({
      tenantId: row.tenant_id,
      connectorId,
      agentId: row.agent_id,
      description: row.description,
    });

    return {
      tenantId: row.tenant_id,
      connectorId,
      agentId: row.agent_id,
      connectorToken: connector.connectorToken,
    };
  }

  verifyConnectorToken(token: string): ConnectorAuthContext | null {
    const parsed = parseOpaqueToken("con", token);
    if (!parsed) return null;
    const row = this.sqlite.prepare(`
      SELECT token_id, tenant_id, connector_id, agent_id, token_hash, revoked_at
      FROM connector_credentials WHERE token_id = ?
    `).get(parsed.tokenId) as {
      token_id: string;
      tenant_id: string;
      connector_id: string | null;
      agent_id: string;
      token_hash: string;
      revoked_at: number | null;
    } | undefined;
    if (!row || row.revoked_at) return null;
    if (row.token_hash !== hashSecret(parsed.secret)) return null;
    return {
      credentialId: row.token_id,
      tenantId: row.tenant_id,
      connectorId: row.connector_id ?? row.agent_id,
      agentId: row.agent_id,
    };
  }

  markConnectorOnline(input: {
    sessionId: string;
    credentialId: string;
    tenantId: string;
    connectorId: string;
    agentId: string;
    capabilities: string[];
    version: string;
  }): void {
    this.sqlite.prepare(`
      INSERT INTO connector_sessions (
        id, credential_token_id, tenant_id, connector_id, agent_id, status, connected_at, last_seen_at, capabilities_json, version
      ) VALUES (?, ?, ?, ?, ?, 'online', ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = 'online',
        last_seen_at = excluded.last_seen_at,
        capabilities_json = excluded.capabilities_json,
        version = excluded.version
    `).run(
      input.sessionId,
      input.credentialId,
      input.tenantId,
      input.connectorId,
      input.agentId,
      now(),
      now(),
      JSON.stringify(input.capabilities),
      input.version,
    );
    this.sqlite.prepare(`
      UPDATE connectors
      SET status = 'online', updated_at = ?, last_seen_at = ?
      WHERE tenant_id = ? AND id = ?
    `).run(now(), now(), input.tenantId, input.connectorId);
    this.appendActivity({
      tenantId: input.tenantId,
      agentId: input.agentId,
      capability: "connector",
      status: "info",
      detail: `Connector ${input.connectorId} online for ${input.agentId}`,
    });
  }

  touchConnectorSession(sessionId: string): void {
    this.sqlite.prepare("UPDATE connector_sessions SET last_seen_at = ? WHERE id = ?").run(now(), sessionId);
  }

  markConnectorOffline(sessionId: string): void {
    const row = this.sqlite.prepare("SELECT tenant_id, connector_id, agent_id FROM connector_sessions WHERE id = ?").get(sessionId) as {
      tenant_id: string;
      connector_id: string | null;
      agent_id: string;
    } | undefined;
    this.sqlite.prepare("UPDATE connector_sessions SET status = 'offline', last_seen_at = ? WHERE id = ?").run(now(), sessionId);
    if (row) {
      this.sqlite.prepare(`
        UPDATE connectors
        SET status = 'offline', updated_at = ?, last_seen_at = ?
        WHERE tenant_id = ? AND id = ?
      `).run(now(), now(), row.tenant_id, row.connector_id ?? row.agent_id);
      this.appendActivity({
        tenantId: row.tenant_id,
        agentId: row.agent_id,
        capability: "connector",
        status: "info",
        detail: `Connector ${row.connector_id ?? row.agent_id} offline for ${row.agent_id}`,
      });
    }
  }

  listProjectResourceRefs(tenantId: string, projectId: string): ProjectResourceRef[] {
    const rows = this.sqlite.prepare(`
      SELECT ref_id, label, uri, mode, metadata_json
      FROM project_resource_refs
      WHERE tenant_id = ? AND project_id = ?
      ORDER BY ref_id
    `).all(tenantId, projectId) as Array<{
      ref_id: string;
      label: string | null;
      uri: string | null;
      mode: "allow" | "deny" | null;
      metadata_json: string | null;
    }>;
    return rows.map((row) => ({
      id: row.ref_id,
      ...(row.label ? { label: row.label } : {}),
      ...(row.uri ? { uri: row.uri } : {}),
      ...(row.mode ? { mode: row.mode } : {}),
      ...(row.metadata_json ? { metadata: parseJsonObject<Record<string, unknown>>(row.metadata_json, {}) } : {}),
    }));
  }

  replaceProjectResourceRefs(tenantId: string, projectId: string, refs: ProjectResourceRef[] = []): void {
    const tx = this.sqlite.transaction(() => {
      this.sqlite.prepare("DELETE FROM project_resource_refs WHERE tenant_id = ? AND project_id = ?").run(tenantId, projectId);
      for (const ref of refs) {
        this.sqlite.prepare(`
          INSERT INTO project_resource_refs (
            tenant_id, project_id, ref_id, label, uri, mode, metadata_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          tenantId,
          projectId,
          ref.id,
          ref.label ?? null,
          ref.uri ?? null,
          ref.mode ?? null,
          ref.metadata ? JSON.stringify(ref.metadata) : null,
          now(),
          now(),
        );
      }
    });
    tx();
  }

  listProjectSecretRefs(tenantId: string, projectId: string): ProjectSecretRef[] {
    const rows = this.sqlite.prepare(`
      SELECT ref_id, label, secret_name, mode, metadata_json
      FROM project_secret_refs
      WHERE tenant_id = ? AND project_id = ?
      ORDER BY ref_id
    `).all(tenantId, projectId) as Array<{
      ref_id: string;
      label: string | null;
      secret_name: string | null;
      mode: "allow" | "deny" | null;
      metadata_json: string | null;
    }>;
    return rows.map((row) => ({
      id: row.ref_id,
      ...(row.label ? { label: row.label } : {}),
      ...(row.secret_name ? { secretName: row.secret_name } : {}),
      ...(row.mode ? { mode: row.mode } : {}),
      ...(row.metadata_json ? { metadata: parseJsonObject<Record<string, unknown>>(row.metadata_json, {}) } : {}),
    }));
  }

  replaceProjectSecretRefs(tenantId: string, projectId: string, refs: ProjectSecretRef[] = []): void {
    const tx = this.sqlite.transaction(() => {
      this.sqlite.prepare("DELETE FROM project_secret_refs WHERE tenant_id = ? AND project_id = ?").run(tenantId, projectId);
      for (const ref of refs) {
        this.sqlite.prepare(`
          INSERT INTO project_secret_refs (
            tenant_id, project_id, ref_id, label, secret_name, mode, metadata_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          tenantId,
          projectId,
          ref.id,
          ref.label ?? null,
          ref.secretName ?? null,
          ref.mode ?? null,
          ref.metadata ? JSON.stringify(ref.metadata) : null,
          now(),
          now(),
        );
      }
    });
    tx();
  }

  listAgents(tenantId: string): Array<{
    agentId: string;
    displayName: string;
    role?: string | null;
    description?: string | null;
    instructions?: string | null;
    resourceRefs: ProjectResourceRef[];
    secretRefs: ProjectSecretRef[];
    status: "online" | "offline";
    lastSeenAt: number | null;
    capabilities: string[];
    version: string | null;
  }> {
    const rows = this.sqlite.prepare(`
      SELECT
        a.id as agent_id,
        a.display_name,
        a.role,
        a.description,
        a.instructions,
        a.resource_refs_json,
        a.secret_refs_json,
        cs.status,
        cs.last_seen_at,
        cs.capabilities_json,
        cs.version
      FROM agents a
      LEFT JOIN connector_sessions cs
        ON cs.tenant_id = a.tenant_id AND cs.agent_id = a.id
       AND cs.last_seen_at = (
         SELECT MAX(inner_cs.last_seen_at) FROM connector_sessions inner_cs
         WHERE inner_cs.tenant_id = a.tenant_id AND inner_cs.agent_id = a.id
       )
      WHERE a.tenant_id = ?
      ORDER BY a.id
    `).all(tenantId) as Array<{
      agent_id: string;
      display_name: string;
      role: string | null;
      description: string | null;
      instructions: string | null;
      resource_refs_json: string | null;
      secret_refs_json: string | null;
      status: "online" | "offline" | null;
      last_seen_at: number | null;
      capabilities_json: string | null;
      version: string | null;
    }>;

    return rows.map((row) => ({
      agentId: row.agent_id,
      displayName: row.display_name,
      role: row.role,
      description: row.description,
      instructions: row.instructions,
      resourceRefs: parseJsonObject<ProjectResourceRef[]>(row.resource_refs_json, []),
      secretRefs: parseJsonObject<ProjectSecretRef[]>(row.secret_refs_json, []),
      status: row.status ?? "offline",
      lastSeenAt: row.last_seen_at,
      capabilities: parseJsonArray(row.capabilities_json),
      version: row.version,
    }));
  }

  getAgent(tenantId: string, agentId: string): {
    agentId: string;
    displayName: string;
    role?: string | null;
    description?: string | null;
    instructions?: string | null;
    resourceRefs: ProjectResourceRef[];
    secretRefs: ProjectSecretRef[];
  } | null {
    const row = this.sqlite.prepare(`
      SELECT id, display_name, role, description, instructions, resource_refs_json, secret_refs_json
      FROM agents
      WHERE tenant_id = ? AND id = ?
    `).get(tenantId, agentId) as {
      id: string;
      display_name: string;
      role: string | null;
      description: string | null;
      instructions: string | null;
      resource_refs_json: string | null;
      secret_refs_json: string | null;
    } | undefined;
    if (!row) return null;
    return {
      agentId: row.id,
      displayName: row.display_name,
      role: row.role,
      description: row.description,
      instructions: row.instructions,
      resourceRefs: parseJsonObject<ProjectResourceRef[]>(row.resource_refs_json, []),
      secretRefs: parseJsonObject<ProjectSecretRef[]>(row.secret_refs_json, []),
    };
  }

  upsertAgent(
    tenantId: string,
    agentId: string,
    displayName: string,
    metadata: {
      role?: string;
      description?: string;
      instructions?: string;
      resourceRefs?: ProjectResourceRef[];
      secretRefs?: ProjectSecretRef[];
    } = {},
  ): void {
    this.sqlite.prepare(`
      INSERT INTO agents (
        id, tenant_id, display_name, role, description, instructions, resource_refs_json, secret_refs_json, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tenant_id, id) DO UPDATE SET
        display_name = excluded.display_name,
        role = COALESCE(excluded.role, agents.role),
        description = COALESCE(excluded.description, agents.description),
        instructions = COALESCE(excluded.instructions, agents.instructions),
        resource_refs_json = COALESCE(excluded.resource_refs_json, agents.resource_refs_json),
        secret_refs_json = COALESCE(excluded.secret_refs_json, agents.secret_refs_json),
        updated_at = excluded.updated_at
    `).run(
      agentId,
      tenantId,
      displayName,
      metadata.role ?? null,
      metadata.description ?? null,
      metadata.instructions ?? null,
      metadata.resourceRefs ? JSON.stringify(metadata.resourceRefs) : null,
      metadata.secretRefs ? JSON.stringify(metadata.secretRefs) : null,
      now(),
      now(),
    );
  }

  upsertProject(input: {
    tenantId: string;
    projectId: string;
    displayName: string;
    description?: string;
    instructions?: string;
    resourceRefs?: ProjectResourceRef[];
    secretRefs?: ProjectSecretRef[];
  }): {
    projectId: string;
    displayName: string;
    description?: string;
    instructions?: string;
    resourceRefs: ProjectResourceRef[];
    secretRefs: ProjectSecretRef[];
    createdAt: number;
    updatedAt: number;
  } {
    const timestamp = now();
    this.sqlite.prepare(`
      INSERT INTO projects (id, tenant_id, display_name, description, instructions, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tenant_id, id) DO UPDATE SET
        display_name = excluded.display_name,
        description = excluded.description,
        instructions = excluded.instructions,
        updated_at = excluded.updated_at
    `).run(
      input.projectId,
      input.tenantId,
      input.displayName,
      input.description ?? null,
      input.instructions ?? null,
      timestamp,
      timestamp,
    );
    if (input.resourceRefs) {
      this.replaceProjectResourceRefs(input.tenantId, input.projectId, input.resourceRefs);
    }
    if (input.secretRefs) {
      this.replaceProjectSecretRefs(input.tenantId, input.projectId, input.secretRefs);
    }
    return this.getProject(input.tenantId, input.projectId)!;
  }

  getProject(tenantId: string, projectId: string): {
    projectId: string;
    displayName: string;
    description?: string;
    instructions?: string;
    resourceRefs: ProjectResourceRef[];
    secretRefs: ProjectSecretRef[];
    createdAt: number;
    updatedAt: number;
  } | null {
    const row = this.sqlite.prepare(`
      SELECT id, display_name, description, instructions, created_at, updated_at
      FROM projects
      WHERE tenant_id = ? AND id = ?
    `).get(tenantId, projectId) as {
      id: string;
      display_name: string;
      description: string | null;
      instructions: string | null;
      created_at: number;
      updated_at: number;
    } | undefined;
    if (!row) return null;
    return {
      projectId: row.id,
      displayName: row.display_name,
      ...(row.description ? { description: row.description } : {}),
      ...(row.instructions ? { instructions: row.instructions } : {}),
      resourceRefs: this.listProjectResourceRefs(tenantId, row.id),
      secretRefs: this.listProjectSecretRefs(tenantId, row.id),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  listProjects(tenantId: string): Array<{
    projectId: string;
    displayName: string;
    description?: string;
    instructions?: string;
    resourceRefs: ProjectResourceRef[];
    secretRefs: ProjectSecretRef[];
    createdAt: number;
    updatedAt: number;
  }> {
    const rows = this.sqlite.prepare(`
      SELECT id, display_name, description, instructions, created_at, updated_at
      FROM projects
      WHERE tenant_id = ?
      ORDER BY id
    `).all(tenantId) as Array<{
      id: string;
      display_name: string;
      description: string | null;
      instructions: string | null;
      created_at: number;
      updated_at: number;
    }>;
    return rows.map((row) => ({
      projectId: row.id,
      displayName: row.display_name,
      ...(row.description ? { description: row.description } : {}),
      ...(row.instructions ? { instructions: row.instructions } : {}),
      resourceRefs: this.listProjectResourceRefs(tenantId, row.id),
      secretRefs: this.listProjectSecretRefs(tenantId, row.id),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  upsertProjectAssignment(input: {
    tenantId: string;
    projectId: string;
    agentId: string;
    workspaceId: string;
    runtimeAgentId: string;
    displayName?: string;
    instructions?: string;
    resourceRefs?: ProjectResourceRef[];
    secretRefs?: ProjectSecretRef[];
  }): {
    projectId: string;
    agentId: string;
    workspaceId: string;
    runtimeAgentId: string;
    displayName?: string;
    instructions?: string;
    resourceRefs: ProjectResourceRef[];
    secretRefs: ProjectSecretRef[];
    effectiveAccessPolicy: EffectiveAccessPolicy;
    createdAt: number;
    updatedAt: number;
  } {
    const timestamp = now();
    this.sqlite.prepare(`
      INSERT INTO project_agents (
        tenant_id, project_id, agent_id, workspace_id, runtime_agent_id, display_name, instructions, resource_refs_json, secret_refs_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tenant_id, project_id, agent_id) DO UPDATE SET
        workspace_id = excluded.workspace_id,
        runtime_agent_id = excluded.runtime_agent_id,
        display_name = excluded.display_name,
        instructions = excluded.instructions,
        resource_refs_json = excluded.resource_refs_json,
        secret_refs_json = excluded.secret_refs_json,
        updated_at = excluded.updated_at
    `).run(
      input.tenantId,
      input.projectId,
      input.agentId,
      input.workspaceId,
      input.runtimeAgentId,
      input.displayName ?? null,
      input.instructions ?? null,
      JSON.stringify(input.resourceRefs ?? []),
      JSON.stringify(input.secretRefs ?? []),
      timestamp,
      timestamp,
    );
    return this.getProjectAssignment(input.tenantId, input.projectId, input.agentId)!;
  }

  getProjectAssignment(tenantId: string, projectId: string, agentId: string): {
    projectId: string;
    agentId: string;
    workspaceId: string;
    runtimeAgentId: string;
    displayName?: string;
    instructions?: string;
    resourceRefs: ProjectResourceRef[];
    secretRefs: ProjectSecretRef[];
    effectiveAccessPolicy: EffectiveAccessPolicy;
    createdAt: number;
    updatedAt: number;
  } | null {
    const row = this.sqlite.prepare(`
      SELECT workspace_id, runtime_agent_id, display_name, instructions, resource_refs_json, secret_refs_json, created_at, updated_at
      FROM project_agents
      WHERE tenant_id = ? AND project_id = ? AND agent_id = ?
    `).get(tenantId, projectId, agentId) as {
      workspace_id: string;
      runtime_agent_id: string;
      display_name: string | null;
      instructions: string | null;
      resource_refs_json: string | null;
      secret_refs_json: string | null;
      created_at: number;
      updated_at: number;
    } | undefined;
    if (!row) return null;
    const agent = this.getAgent(tenantId, agentId);
    const project = this.getProject(tenantId, projectId);
    const resourceRefs = parseJsonObject<ProjectResourceRef[]>(row.resource_refs_json, []);
    const secretRefs = parseJsonObject<ProjectSecretRef[]>(row.secret_refs_json, []);
    return {
      projectId,
      agentId,
      workspaceId: row.workspace_id,
      runtimeAgentId: row.runtime_agent_id,
      ...(row.display_name ? { displayName: row.display_name } : {}),
      ...(row.instructions ? { instructions: row.instructions } : {}),
      resourceRefs,
      secretRefs,
      effectiveAccessPolicy: buildEffectiveAccessPolicy({
        projectResourceRefs: project?.resourceRefs ?? [],
        agentResourceRefs: agent?.resourceRefs ?? [],
        assignmentResourceRefs: resourceRefs,
        projectSecretRefs: project?.secretRefs ?? [],
        agentSecretRefs: agent?.secretRefs ?? [],
        assignmentSecretRefs: secretRefs,
      }),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  listProjectAgents(tenantId: string, projectId: string): Array<{
    projectId: string;
    agentId: string;
    workspaceId: string;
    runtimeAgentId: string;
    displayName?: string;
    instructions?: string;
    resourceRefs: ProjectResourceRef[];
    secretRefs: ProjectSecretRef[];
    effectiveAccessPolicy: EffectiveAccessPolicy;
    createdAt: number;
    updatedAt: number;
  }> {
    const rows = this.sqlite.prepare(`
      SELECT agent_id
      FROM project_agents
      WHERE tenant_id = ? AND project_id = ?
      ORDER BY agent_id
    `).all(tenantId, projectId) as Array<{ agent_id: string }>;
    return rows
      .map((row) => this.getProjectAssignment(tenantId, projectId, row.agent_id))
      .filter((assignment): assignment is NonNullable<typeof assignment> => assignment !== null);
  }

  listAgentProjects(tenantId: string, agentId: string): Array<{
    projectId: string;
    displayName: string;
    description?: string;
    instructions?: string;
    workspaceId: string;
    runtimeAgentId: string;
    effectiveAccessPolicy: EffectiveAccessPolicy;
    createdAt: number;
    updatedAt: number;
  }> {
    const rows = this.sqlite.prepare(`
      SELECT project_id
      FROM project_agents
      WHERE tenant_id = ? AND agent_id = ?
      ORDER BY project_id
    `).all(tenantId, agentId) as Array<{ project_id: string }>;

    return rows.flatMap((row) => {
      const project = this.getProject(tenantId, row.project_id);
      const assignment = this.getProjectAssignment(tenantId, row.project_id, agentId);
      if (!project || !assignment) return [];
      return [{
        projectId: project.projectId,
        displayName: project.displayName,
        ...(project.description ? { description: project.description } : {}),
        ...(project.instructions ? { instructions: project.instructions } : {}),
        workspaceId: assignment.workspaceId,
        runtimeAgentId: assignment.runtimeAgentId,
        effectiveAccessPolicy: assignment.effectiveAccessPolicy,
        createdAt: project.createdAt,
        updatedAt: assignment.updatedAt,
      }];
    });
  }

  deleteProjectAssignment(tenantId: string, projectId: string, agentId: string): void {
    this.sqlite.prepare("DELETE FROM project_agents WHERE tenant_id = ? AND project_id = ? AND agent_id = ?")
      .run(tenantId, projectId, agentId);
  }

  upsertWorkspaces(tenantId: string, agentId: string, workspaces: ConnectorWorkspaceDescriptor[]): void {
    for (const workspace of workspaces) {
      this.sqlite.prepare(`
        INSERT INTO workspaces (id, tenant_id, agent_id, display_name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(tenant_id, agent_id, id) DO UPDATE SET
          display_name = excluded.display_name,
          updated_at = excluded.updated_at
      `).run(workspace.workspaceId, tenantId, agentId, workspace.displayName, now(), now());
    }
  }

  listWorkspaces(tenantId: string, agentId: string): Array<{ workspaceId: string; displayName: string }> {
    const rows = this.sqlite.prepare(`
      SELECT id, display_name FROM workspaces WHERE tenant_id = ? AND agent_id = ? ORDER BY id
    `).all(tenantId, agentId) as Array<{ id: string; display_name: string }>;
    return rows.map((row) => ({
      workspaceId: row.id,
      displayName: row.display_name,
    }));
  }

  appendActivity(input: {
    tenantId: string;
    agentId?: string;
    workspaceId?: string;
    capability: string;
    status: "success" | "error" | "info";
    detail: string;
  }): void {
    this.sqlite.prepare(`
      INSERT INTO activity_events (id, tenant_id, agent_id, workspace_id, capability, status, detail, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      input.tenantId,
      input.agentId ?? null,
      input.workspaceId ?? null,
      input.capability,
      input.status,
      input.detail,
      now(),
    );
  }

  recordUsage(input: {
    tenantId: string;
    agentId?: string;
    workspaceId?: string;
    tokensIn: number;
    tokensOut: number;
  }): void {
    const estimatedCostUsd = Number((((input.tokensIn + input.tokensOut) / 1000) * 0.01).toFixed(4));
    this.sqlite.prepare(`
      INSERT INTO usage_records (id, tenant_id, agent_id, workspace_id, tokens_in, tokens_out, estimated_cost_usd, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      input.tenantId,
      input.agentId ?? null,
      input.workspaceId ?? null,
      input.tokensIn,
      input.tokensOut,
      estimatedCostUsd,
      now(),
    );
  }

  listActivity(tenantId: string, agentId?: string, workspaceId?: string): ActivityRecord[] {
    const clauses = ["tenant_id = ?"];
    const params: Array<string> = [tenantId];
    if (agentId) {
      clauses.push("agent_id = ?");
      params.push(agentId);
    }
    if (workspaceId) {
      clauses.push("workspace_id = ?");
      params.push(workspaceId);
    }
    const rows = this.sqlite.prepare(`
      SELECT id, tenant_id, agent_id, workspace_id, capability, status, detail, created_at
      FROM activity_events
      WHERE ${clauses.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT 100
    `).all(...params) as Array<{
      id: string;
      tenant_id: string;
      agent_id: string | null;
      workspace_id: string | null;
      capability: string;
      status: "success" | "error" | "info";
      detail: string;
      created_at: number;
    }>;
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      agentId: row.agent_id,
      workspaceId: row.workspace_id,
      capability: row.capability,
      status: row.status,
      detail: row.detail,
      createdAt: row.created_at,
    }));
  }

  listUsage(tenantId: string, agentId?: string, workspaceId?: string): UsageRecord[] {
    const clauses = ["tenant_id = ?"];
    const params: Array<string> = [tenantId];
    if (agentId) {
      clauses.push("agent_id = ?");
      params.push(agentId);
    }
    if (workspaceId) {
      clauses.push("workspace_id = ?");
      params.push(workspaceId);
    }
    const rows = this.sqlite.prepare(`
      SELECT id, tenant_id, agent_id, workspace_id, tokens_in, tokens_out, estimated_cost_usd, created_at
      FROM usage_records
      WHERE ${clauses.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT 100
    `).all(...params) as Array<{
      id: string;
      tenant_id: string;
      agent_id: string | null;
      workspace_id: string | null;
      tokens_in: number;
      tokens_out: number;
      estimated_cost_usd: number;
      created_at: number;
    }>;
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      agentId: row.agent_id,
      workspaceId: row.workspace_id,
      tokensIn: row.tokens_in,
      tokensOut: row.tokens_out,
      estimatedCostUsd: row.estimated_cost_usd,
      createdAt: row.created_at,
    }));
  }

  clearActivity(tenantId: string, agentId?: string): number {
    const stmt = agentId
      ? this.sqlite.prepare("DELETE FROM activity_events WHERE tenant_id = ? AND agent_id = ?")
      : this.sqlite.prepare("DELETE FROM activity_events WHERE tenant_id = ?");
    const info = agentId ? stmt.run(tenantId, agentId) : stmt.run(tenantId);
    return info.changes;
  }

  clearUsage(tenantId: string, agentId?: string): number {
    const stmt = agentId
      ? this.sqlite.prepare("DELETE FROM usage_records WHERE tenant_id = ? AND agent_id = ?")
      : this.sqlite.prepare("DELETE FROM usage_records WHERE tenant_id = ?");
    const info = agentId ? stmt.run(tenantId, agentId) : stmt.run(tenantId);
    return info.changes;
  }

  deleteWorkspace(tenantId: string, agentId: string, workspaceId: string): void {
    const tx = this.sqlite.transaction(() => {
      this.sqlite.prepare("DELETE FROM activity_events WHERE tenant_id = ? AND agent_id = ? AND workspace_id = ?")
        .run(tenantId, agentId, workspaceId);
      this.sqlite.prepare("DELETE FROM usage_records WHERE tenant_id = ? AND agent_id = ? AND workspace_id = ?")
        .run(tenantId, agentId, workspaceId);
      this.sqlite.prepare("DELETE FROM workspaces WHERE tenant_id = ? AND agent_id = ? AND id = ?")
        .run(tenantId, agentId, workspaceId);
    });
    tx();
  }

  deleteAgent(tenantId: string, agentId: string): void {
    const tx = this.sqlite.transaction(() => {
      this.sqlite.prepare("DELETE FROM activity_events WHERE tenant_id = ? AND agent_id = ?")
        .run(tenantId, agentId);
      this.sqlite.prepare("DELETE FROM usage_records WHERE tenant_id = ? AND agent_id = ?")
        .run(tenantId, agentId);
      this.sqlite.prepare("DELETE FROM connector_sessions WHERE tenant_id = ? AND agent_id = ?")
        .run(tenantId, agentId);
      this.sqlite.prepare("DELETE FROM connector_credentials WHERE tenant_id = ? AND agent_id = ?")
        .run(tenantId, agentId);
      this.sqlite.prepare("DELETE FROM connector_enrollments WHERE tenant_id = ? AND agent_id = ?")
        .run(tenantId, agentId);
      this.sqlite.prepare("DELETE FROM project_agents WHERE tenant_id = ? AND agent_id = ?")
        .run(tenantId, agentId);
      this.sqlite.prepare("DELETE FROM workspaces WHERE tenant_id = ? AND agent_id = ?")
        .run(tenantId, agentId);
      this.sqlite.prepare("DELETE FROM agents WHERE tenant_id = ? AND id = ?")
        .run(tenantId, agentId);
    });
    tx();
  }
}
