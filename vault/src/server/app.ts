// Clawix-grade Vault HTTP server. Exposes the full surface used by the
// Clawix Mac UI client and the @clawjs/cli sidecar:
//
//   - Vault lifecycle: setup / unlock / lock / recover / change-password.
//   - Doctor: health + capability map with status granular per area.
//   - Container CRUD (vaults).
//   - Secret CRUD + versions + fields + notes + attachments.
//   - Agent grants + leases + policies + ephemeral authorizations.
//   - Brokered execute (broker.http and any registered executor).
//   - Brand sync.
//   - Audit query + integrity verify.
//
// All sensitive operations require the vault to be unlocked
// (masterKey/auditMacKey held in process memory by VaultSession). This
// matches the Clawix Mac model: the daemon process owns the keys; the
// UI talks HTTP to it.

import path from "node:path";
import fs from "node:fs";

import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";

import { VaultAuthService, hashToken } from "./auth.ts";
import { loadVaultConfig, type VaultConfig } from "./config.ts";
import {
  vaultChangePassword,
  vaultRecover,
  vaultSetup,
  vaultUnlock,
  unwrapItemKey,
  type VaultMetaSnapshot,
} from "./crypto.ts";
import { ARGON2_DEFAULT_PARAMS, calibrateArgon2 } from "./calibration.ts";
import { asUint8Array, openDatabase, type SqliteDb } from "./db.ts";
import {
  PluginRegistryStore,
  PrincipalStore,
  TenantStore,
  UserStore,
  VaultMetaStore,
} from "./stores.ts";
import { VaultResolver } from "./resolver.ts";
import { AuditStore } from "./audit.ts";
import { evaluateGovernance } from "./governance.ts";
import { VaultSession } from "./session.ts";
import { bootPluginRegistry } from "../plugins/loader.ts";
import { redactString } from "../plugins/redaction.ts";
import type { PluginRegistry } from "../plugins/registry.ts";
import type { ExecutorContext } from "../plugins/types.ts";
import { LockableSecret } from "./lockable-secret.ts";

const DEFAULT_TENANT_ID = "clawix-local";

interface AppDeps {
  config: VaultConfig;
  db: SqliteDb;
  registry: PluginRegistry;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config, db, registry } = deps;

  const auth = new VaultAuthService(config.jwtSecret);
  const tenants = new TenantStore(db);
  const users = new UserStore(db);
  const principals = new PrincipalStore(db);
  const metaStore = new VaultMetaStore(db);
  const resolver = new VaultResolver(db);
  const audit = new AuditStore(db);
  const pluginsStore = new PluginRegistryStore(db);
  const session = new VaultSession();

  // Ensure the default tenant exists.
  tenants.upsert(DEFAULT_TENANT_ID, "Clawix Local");

  const app = Fastify({ logger: false });
  await app.register(cors, {
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : true,
    credentials: true,
  });

  // ---------- Auth helpers ----------

  async function requirePrincipalOrUser(req: FastifyRequest, _reply: FastifyReply) {
    const header = req.headers.authorization;
    if (!header || !header.toLowerCase().startsWith("bearer ")) {
      throw app.httpErrors?.unauthorized?.("Bearer token required") ?? Object.assign(new Error("unauthorized"), { statusCode: 401 });
    }
    const token = header.slice("bearer ".length).trim();
    if (token.startsWith("vlt_prn_")) {
      const principal = principals.findByTokenHash(hashToken(token));
      if (!principal) throw Object.assign(new Error("Invalid principal token"), { statusCode: 401 });
      principals.bumpUsage(principal.id);
      return { kind: "principal" as const, principal };
    }
    const claims = await auth.verifyUserToken(token);
    if (!claims) throw Object.assign(new Error("Invalid bearer"), { statusCode: 401 });
    return { kind: "user" as const, claims };
  }

  // ---------- Public ----------

  app.get("/v1/health", async () => ({
    ok: true,
    service: "clawjs-vault",
    host: config.host,
    port: config.port,
    schemaVersion: 2,
    cryptoVersion: 1,
  }));

  app.get("/v1/secret-types", async () => {
    return { types: registry.listTypes() };
  });

  // ---------- Vault lifecycle ----------

  app.get("/v1/vault/state", async () => {
    const exists = metaStore.exists(DEFAULT_TENANT_ID);
    return {
      tenantId: DEFAULT_TENANT_ID,
      initialized: exists,
      unlocked: session.isUnlocked(),
      autoLockMinutes: 60,
    };
  });

  app.post("/v1/vault/setup", async (req, reply) => {
    if (metaStore.exists(DEFAULT_TENANT_ID)) {
      return reply.code(409).send({ error: "Vault already initialized" });
    }
    const body = (req.body ?? {}) as { password?: string; appVersion?: string; calibrate?: boolean };
    if (!body.password) return reply.code(400).send({ error: "password required" });
    const params = body.calibrate ? calibrateArgon2() : ARGON2_DEFAULT_PARAMS;
    const result = vaultSetup(body.password, {
      schemaVersion: 2,
      appVersion: body.appVersion ?? "0.1.2",
      kdfParams: params,
    });
    metaStore.save(DEFAULT_TENANT_ID, result.meta);
    session.setUnlocked({
      tenantId: DEFAULT_TENANT_ID,
      masterKey: result.masterKey,
      auditMacKey: result.auditMacKey,
    });
    audit.append({
      tenantId: DEFAULT_TENANT_ID,
      meta: result.meta,
      auditMacKey: result.auditMacKey,
      event: { kind: "vaultSetup", source: "system", success: true, payload: {} },
    });
    return {
      ok: true,
      recoveryPhrase: result.recoveryPhrase,
      kdfParams: result.meta.kdfParams,
      deviceId: result.meta.deviceId,
    };
  });

  app.post("/v1/vault/unlock", async (req, reply) => {
    const meta = metaStore.load(DEFAULT_TENANT_ID);
    if (!meta) return reply.code(404).send({ error: "Vault not initialized" });
    const body = (req.body ?? {}) as { password?: string };
    if (!body.password) return reply.code(400).send({ error: "password required" });
    try {
      const { masterKey, auditMacKey } = vaultUnlock(meta, body.password);
      session.setUnlocked({ tenantId: DEFAULT_TENANT_ID, masterKey, auditMacKey });
      audit.append({
        tenantId: DEFAULT_TENANT_ID,
        meta,
        auditMacKey,
        event: { kind: "vaultUnlock", source: "system", success: true, payload: {} },
      });
      return { ok: true };
    } catch (err) {
      const tempKeys = (() => {
        try { return vaultUnlock(meta, "_anonymous_"); } catch { return null; }
      })();
      if (tempKeys) {
        audit.append({
          tenantId: DEFAULT_TENANT_ID,
          meta,
          auditMacKey: tempKeys.auditMacKey,
          event: { kind: "vaultFailedUnlock", source: "system", success: false, payload: { reason: (err as Error).message } },
        });
        tempKeys.masterKey.zero();
        tempKeys.auditMacKey.zero();
      }
      return reply.code(401).send({ error: "Invalid password" });
    }
  });

  app.post("/v1/vault/lock", async () => {
    if (session.isUnlocked()) {
      const meta = metaStore.load(DEFAULT_TENANT_ID);
      if (meta) {
        try {
          const keys = session.requireKeys();
          audit.append({
            tenantId: DEFAULT_TENANT_ID,
            meta,
            auditMacKey: keys.auditMacKey,
            event: { kind: "vaultLock", source: "system", payload: {} },
          });
        } catch { /* ignore */ }
      }
    }
    session.lock();
    return { ok: true };
  });

  app.post("/v1/vault/recover", async (req, reply) => {
    const meta = metaStore.load(DEFAULT_TENANT_ID);
    if (!meta) return reply.code(404).send({ error: "Vault not initialized" });
    const body = (req.body ?? {}) as { phrase?: string };
    if (!body.phrase) return reply.code(400).send({ error: "phrase required" });
    try {
      const { masterKey, auditMacKey } = vaultRecover(meta, body.phrase);
      session.setUnlocked({ tenantId: DEFAULT_TENANT_ID, masterKey, auditMacKey });
      audit.append({
        tenantId: DEFAULT_TENANT_ID,
        meta,
        auditMacKey,
        event: { kind: "vaultRecoveryUsed", source: "system", success: true, payload: {} },
      });
      return { ok: true };
    } catch (err) {
      return reply.code(401).send({ error: (err as Error).message });
    }
  });

  app.post("/v1/vault/change-password", async (req, reply) => {
    const meta = metaStore.load(DEFAULT_TENANT_ID);
    if (!meta) return reply.code(404).send({ error: "Vault not initialized" });
    const body = (req.body ?? {}) as { oldPassword?: string; newPassword?: string };
    if (!body.oldPassword || !body.newPassword) return reply.code(400).send({ error: "oldPassword, newPassword required" });
    try {
      const result = vaultChangePassword(meta, body.oldPassword, body.newPassword);
      metaStore.save(DEFAULT_TENANT_ID, result.newMeta);
      // Re-unlock with new password to refresh in-memory keys.
      const unlocked = vaultUnlock(result.newMeta, body.newPassword);
      session.setUnlocked({
        tenantId: DEFAULT_TENANT_ID,
        masterKey: unlocked.masterKey,
        auditMacKey: unlocked.auditMacKey,
      });
      audit.append({
        tenantId: DEFAULT_TENANT_ID,
        meta: result.newMeta,
        auditMacKey: unlocked.auditMacKey,
        event: { kind: "vaultPasswordChange", source: "admin", payload: {} },
      });
      return { ok: true, recoveryPhrase: result.newRecoveryPhrase };
    } catch (err) {
      return reply.code(401).send({ error: (err as Error).message });
    }
  });

  app.get("/v1/vault/doctor", async () => {
    const meta = metaStore.load(DEFAULT_TENANT_ID);
    const unlocked = session.isUnlocked();
    const integrity = unlocked && meta
      ? audit.checkIntegrity({
          tenantId: DEFAULT_TENANT_ID,
          meta,
          auditMacKey: session.requireKeys().auditMacKey,
        })
      : null;
    return {
      tenant: { id: DEFAULT_TENANT_ID, initialized: Boolean(meta) },
      session: { unlocked },
      capabilities: {
        crypto: { supported: true, status: "ready", strategy: "native", details: { aead: "chacha20-poly1305", kdf: "argon2id" } },
        storage: { supported: true, status: "ready", strategy: "sqlite-better-sqlite3" },
        audit: integrity
          ? { supported: true, status: integrity.ok ? "ready" : "degraded", strategy: "hash-chain", details: integrity }
          : { supported: true, status: "unknown", strategy: "hash-chain" },
        plugins: { supported: true, status: "ready", strategy: "registry", details: { types: registry.listTypes().length, executors: registry.listExecutors().length } },
        macosVpn: { supported: process.platform === "darwin", status: process.platform === "darwin" ? "ready" : "unsupported", strategy: "scutil" },
      },
    };
  });

  // ---------- Containers (vault folders) ----------

  app.get("/v1/tenants/:tenantId/vaults", async (req) => {
    await requirePrincipalOrUser(req, undefined as unknown as FastifyReply);
    const { tenantId } = req.params as { tenantId: string };
    const includeTrashed = ((req.query as Record<string, string>)?.includeTrashed === "true");
    const rows = resolver.containers.list(tenantId, includeTrashed);
    return { vaults: rows.map((r) => resolver.describeContainer(r)) };
  });

  app.post("/v1/tenants/:tenantId/vaults", async (req) => {
    await requirePrincipalOrUser(req, undefined as unknown as FastifyReply);
    const { tenantId } = req.params as { tenantId: string };
    const body = (req.body ?? {}) as { name?: string; icon?: string; color?: string; sortOrder?: number };
    if (!body.name) throw Object.assign(new Error("name required"), { statusCode: 400 });
    return { vault: resolver.describeContainer(
      resolver.containers.create({
        tenantId,
        name: body.name,
        ...(body.icon ? { icon: body.icon } : {}),
        ...(body.color ? { color: body.color } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
      })
    ) };
  });

  app.patch("/v1/tenants/:tenantId/vaults/:id", async (req) => {
    await requirePrincipalOrUser(req, undefined as unknown as FastifyReply);
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { name?: string };
    const row = body.name ? resolver.containers.rename(id, body.name) : undefined;
    return { vault: row ? resolver.describeContainer(row) : null };
  });

  app.delete("/v1/tenants/:tenantId/vaults/:id", async (req) => {
    await requirePrincipalOrUser(req, undefined as unknown as FastifyReply);
    const { id } = req.params as { id: string };
    resolver.containers.trash(id);
    return { ok: true };
  });

  // ---------- Secrets ----------

  app.get("/v1/tenants/:tenantId/secrets", async (req) => {
    await requirePrincipalOrUser(req, undefined as unknown as FastifyReply);
    const { tenantId } = req.params as { tenantId: string };
    const q = req.query as Record<string, string> | undefined;
    const rows = resolver.secrets.list({
      tenantId,
      ...(q?.search ? { search: q.search } : {}),
      ...(q?.vaultId ? { vaultId: q.vaultId } : {}),
      includeTrashed: q?.includeTrashed === "true",
      includeArchived: q?.includeArchived === "true",
    });
    return { secrets: rows.map((r) => resolver.describeSecret(r)) };
  });

  app.get("/v1/tenants/:tenantId/secrets/:name", async (req, reply) => {
    await requirePrincipalOrUser(req, reply);
    const { tenantId, name } = req.params as { tenantId: string; name: string };
    const row = resolver.secrets.getByInternalName(tenantId, name);
    if (!row) return reply.code(404).send({ error: "Not found" });
    return { secret: resolver.describeSecret(row) };
  });

  app.post("/v1/tenants/:tenantId/secrets", async (req, reply) => {
    await requirePrincipalOrUser(req, reply);
    const keys = session.requireKeys();
    const { tenantId } = req.params as { tenantId: string };
    const body = (req.body ?? {}) as { draft?: unknown };
    if (!body.draft) return reply.code(400).send({ error: "draft required" });
    const meta = metaStore.load(tenantId)!;
    const created = resolver.secrets.create({
      tenantId,
      masterKey: keys.masterKey,
      draft: body.draft as never,
    });
    audit.append({
      tenantId,
      meta,
      auditMacKey: keys.auditMacKey,
      event: { kind: "adminCreate", source: "admin", secretId: created.id, payload: { internalName: created.internal_name } },
    });
    return { secret: resolver.describeSecret(created) };
  });

  app.patch("/v1/tenants/:tenantId/secrets/:name", async (req, reply) => {
    await requirePrincipalOrUser(req, reply);
    const keys = session.requireKeys();
    const { tenantId, name } = req.params as { tenantId: string; name: string };
    const row = resolver.secrets.getByInternalName(tenantId, name);
    if (!row) return reply.code(404).send({ error: "Not found" });
    const body = (req.body ?? {}) as { title?: string; governance?: unknown };
    let updated = row;
    if (body.title) updated = resolver.secrets.updateTitle(row.id, body.title) ?? updated;
    if (body.governance) updated = resolver.secrets.updateGovernance(row.id, body.governance as never) ?? updated;
    audit.append({
      tenantId,
      meta: metaStore.load(tenantId)!,
      auditMacKey: keys.auditMacKey,
      event: { kind: "adminEdit", source: "admin", secretId: row.id, payload: {} },
    });
    return { secret: resolver.describeSecret(updated) };
  });

  app.post("/v1/tenants/:tenantId/secrets/:name/archive", async (req, reply) => {
    await requirePrincipalOrUser(req, reply);
    const { tenantId, name } = req.params as { tenantId: string; name: string };
    const row = resolver.secrets.getByInternalName(tenantId, name);
    if (!row) return reply.code(404).send({ error: "Not found" });
    const body = (req.body ?? {}) as { archived?: boolean };
    const updated = resolver.secrets.setArchived(row.id, body.archived === true);
    return { secret: updated ? resolver.describeSecret(updated) : null };
  });

  app.post("/v1/tenants/:tenantId/secrets/:name/compromise", async (req, reply) => {
    await requirePrincipalOrUser(req, reply);
    const { tenantId, name } = req.params as { tenantId: string; name: string };
    const row = resolver.secrets.getByInternalName(tenantId, name);
    if (!row) return reply.code(404).send({ error: "Not found" });
    const body = (req.body ?? {}) as { compromised?: boolean; reason?: string };
    const updated = resolver.secrets.setCompromised(row.id, body.compromised !== false, body.reason ?? null);
    return { secret: updated ? resolver.describeSecret(updated) : null };
  });

  app.delete("/v1/tenants/:tenantId/secrets/:name", async (req, reply) => {
    await requirePrincipalOrUser(req, reply);
    const { tenantId, name } = req.params as { tenantId: string; name: string };
    const row = resolver.secrets.getByInternalName(tenantId, name);
    if (!row) return reply.code(404).send({ error: "Not found" });
    const updated = resolver.secrets.trash(row.id);
    return { secret: updated ? resolver.describeSecret(updated) : null };
  });

  app.post("/v1/tenants/:tenantId/secrets/:name/restore", async (req, reply) => {
    await requirePrincipalOrUser(req, reply);
    const { tenantId, name } = req.params as { tenantId: string; name: string };
    const row = resolver.secrets.getByInternalName(tenantId, name);
    if (!row) return reply.code(404).send({ error: "Not found" });
    const updated = resolver.secrets.restore(row.id);
    return { secret: updated ? resolver.describeSecret(updated) : null };
  });

  // ---------- Reveal field / notes ----------

  app.post("/v1/tenants/:tenantId/secrets/:name/reveal-field", async (req, reply) => {
    await requirePrincipalOrUser(req, reply);
    const keys = session.requireKeys();
    const { tenantId, name } = req.params as { tenantId: string; name: string };
    const row = resolver.secrets.getByInternalName(tenantId, name);
    if (!row) return reply.code(404).send({ error: "Not found" });
    const body = (req.body ?? {}) as { field?: string; purpose?: string };
    if (!body.field) return reply.code(400).send({ error: "field required" });
    const decision = evaluateGovernance(row, {});
    if (!decision.allowed) return reply.code(403).send({ error: "Blocked by governance", reasons: decision.reasons });
    const value = resolver.revealField({ secret: row, fieldName: body.field, masterKey: keys.masterKey });
    resolver.secrets.bumpUsage(row.id);
    audit.append({
      tenantId,
      meta: metaStore.load(tenantId)!,
      auditMacKey: keys.auditMacKey,
      event: { kind: body.purpose === "uiCopy" ? "uiCopy" : "uiReveal", source: "ui", secretId: row.id, payload: { field: body.field } },
    });
    return { value };
  });

  // ---------- Brokered execute ----------

  app.post("/v1/tenants/:tenantId/secrets/:name/execute/:executorId", async (req, reply) => {
    await requirePrincipalOrUser(req, reply);
    const keys = session.requireKeys();
    const { tenantId, name, executorId } = req.params as { tenantId: string; name: string; executorId: string };
    const row = resolver.secrets.getByInternalName(tenantId, name);
    if (!row) return reply.code(404).send({ error: "Not found" });
    const executor = registry.getExecutor(executorId);
    if (!executor) return reply.code(404).send({ error: `Executor not registered: ${executorId}` });

    const body = (req.body ?? {}) as { args?: Record<string, unknown>; ctx?: Record<string, unknown> };
    const args = body.args ?? {};

    // Resolve plaintext for governance + executor.
    const itemKey = unwrapItemKey(asUint8Array(row.wrapped_item_key), row.id, keys.masterKey);
    let resolvedFields: Record<string, string>;
    try {
      resolvedFields = resolver.revealAllFields({ secret: row, masterKey: keys.masterKey });
    } catch (err) {
      itemKey.zero();
      return reply.code(500).send({ error: (err as Error).message });
    }

    // Governance enforcement.
    const decision = evaluateGovernance(row, body.ctx ?? {});
    if (!decision.allowed) {
      itemKey.zero();
      return reply.code(403).send({ error: "Blocked by governance", reasons: decision.reasons });
    }

    // Validate executor input.
    const validation = executor.validate?.({ secret: row, resolvedFields, itemKey, args } as ExecutorContext);
    if (validation && validation.ok === false) {
      itemKey.zero();
      return reply.code(422).send({ error: validation.reason });
    }

    let output;
    try {
      output = await executor.execute({ secret: row, resolvedFields, itemKey, args } as ExecutorContext);
    } catch (err) {
      itemKey.zero();
      return reply.code(500).send({ error: (err as Error).message });
    }
    itemKey.zero();

    // Universal redaction guard.
    const redacted = executor.redact
      ? executor.redact(output, resolvedFields)
      : { ...output, body: output.body ? redactString(output.body, Object.values(resolvedFields)) : output.body };

    resolver.secrets.bumpUsage(row.id);
    audit.append({
      tenantId,
      meta: metaStore.load(tenantId)!,
      auditMacKey: keys.auditMacKey,
      event: {
        kind: "proxyExec",
        source: "proxy",
        secretId: row.id,
        success: redacted.ok,
        payload: { executorId, status: redacted.status },
      },
    });
    return redacted;
  });

  // ---------- Brand sync ----------

  app.post("/v1/tenants/:tenantId/secrets/:name/sync", async (req, reply) => {
    await requirePrincipalOrUser(req, reply);
    const keys = session.requireKeys();
    const { tenantId, name } = req.params as { tenantId: string; name: string };
    const row = resolver.secrets.getByInternalName(tenantId, name);
    if (!row) return reply.code(404).send({ error: "Not found" });
    if (!row.type_id) return reply.code(400).send({ error: "Secret has no typeId" });
    const type = registry.getType(row.type_id);
    if (!type?.brandSyncId) return reply.code(400).send({ error: "Type has no brand sync" });
    const sync = registry.getBrandSync(type.brandSyncId);
    if (!sync) return reply.code(404).send({ error: "Brand sync not registered" });

    const resolvedFields = resolver.revealAllFields({ secret: row, masterKey: keys.masterKey });
    const resources = await sync.sync({ secret: row, resolvedFields });
    for (const r of resources) {
      resolver.synced.upsert({ secretId: row.id, resourceType: r.resourceType, resourceId: r.resourceId, metadata: r.metadata });
    }
    return { syncedCount: resources.length, resources };
  });

  // ---------- Agent grants ----------

  app.post("/v1/tenants/:tenantId/grants", async (req, reply) => {
    await requirePrincipalOrUser(req, reply);
    const keys = session.requireKeys();
    const { tenantId } = req.params as { tenantId: string };
    const body = (req.body ?? {}) as {
      agent?: string;
      secretName?: string;
      capability?: { kind: string;[key: string]: unknown };
      vaultCapabilities?: string[];
      reason?: string;
      durationMinutes?: number;
    };
    if (!body.agent || !body.secretName || !body.capability || !body.reason) {
      return reply.code(400).send({ error: "agent, secretName, capability, reason required" });
    }
    const row = resolver.secrets.getByInternalName(tenantId, body.secretName);
    if (!row) return reply.code(404).send({ error: "Secret not found" });
    const issued = resolver.grants.issue({
      tenantId,
      agent: body.agent,
      secretId: row.id,
      capability: body.capability as never,
      vaultCapabilities: (body.vaultCapabilities ?? []) as never[],
      reason: body.reason,
      durationMinutes: body.durationMinutes ?? 10,
    });
    audit.append({
      tenantId,
      meta: metaStore.load(tenantId)!,
      auditMacKey: keys.auditMacKey,
      event: { kind: "grantIssued", source: "admin", secretId: row.id, payload: { grantId: issued.grant.id, agent: body.agent } },
    });
    return { grant: resolver.describeGrant(issued.grant), token: issued.token };
  });

  app.get("/v1/tenants/:tenantId/grants", async (req, reply) => {
    await requirePrincipalOrUser(req, reply);
    const { tenantId } = req.params as { tenantId: string };
    return { grants: resolver.grants.list(tenantId).map((g) => resolver.describeGrant(g)) };
  });

  app.delete("/v1/tenants/:tenantId/grants/:id", async (req, reply) => {
    await requirePrincipalOrUser(req, reply);
    const keys = session.requireKeys();
    const { tenantId, id } = req.params as { tenantId: string; id: string };
    const row = resolver.grants.revoke(id);
    if (!row) return reply.code(404).send({ error: "Not found" });
    audit.append({
      tenantId,
      meta: metaStore.load(tenantId)!,
      auditMacKey: keys.auditMacKey,
      event: { kind: "grantRevoked", source: "admin", secretId: row.secret_id, payload: { grantId: row.id } },
    });
    return { grant: resolver.describeGrant(row) };
  });

  // ---------- Leases ----------

  app.post("/v1/tenants/:tenantId/leases", async (req, reply) => {
    await requirePrincipalOrUser(req, reply);
    const { tenantId } = req.params as { tenantId: string };
    const body = (req.body ?? {}) as {
      secretName?: string;
      mode?: "process" | "browser";
      durationMinutes?: number;
      context?: Record<string, unknown>;
    };
    if (!body.secretName || !body.mode) return reply.code(400).send({ error: "secretName, mode required" });
    const row = resolver.secrets.getByInternalName(tenantId, body.secretName);
    if (!row) return reply.code(404).send({ error: "Not found" });
    const issued = resolver.leases.issue({
      tenantId,
      secretId: row.id,
      mode: body.mode,
      durationMinutes: body.durationMinutes ?? 10,
      ...(body.context ? { context: body.context } : {}),
    });
    return { lease: resolver.describeLease(issued.lease), token: issued.token };
  });

  app.get("/v1/tenants/:tenantId/leases", async (req, reply) => {
    await requirePrincipalOrUser(req, reply);
    const { tenantId } = req.params as { tenantId: string };
    return { leases: resolver.leases.list(tenantId).map((l) => resolver.describeLease(l)) };
  });

  app.post("/v1/tenants/:tenantId/leases/:id/revoke", async (req, reply) => {
    await requirePrincipalOrUser(req, reply);
    const { id } = req.params as { id: string };
    const row = resolver.leases.revoke(id);
    return { lease: row ? resolver.describeLease(row) : null };
  });

  // ---------- Policies ----------

  app.get("/v1/tenants/:tenantId/policies", async (req, reply) => {
    await requirePrincipalOrUser(req, reply);
    const { tenantId } = req.params as { tenantId: string };
    return { policies: resolver.policies.list(tenantId) };
  });

  app.post("/v1/tenants/:tenantId/policies", async (req, reply) => {
    await requirePrincipalOrUser(req, reply);
    const { tenantId } = req.params as { tenantId: string };
    const body = (req.body ?? {}) as { subjectType?: string; subjectId?: string; secretName?: string; capability?: string; effect?: "allow" | "deny" };
    if (!body.subjectType || !body.subjectId || !body.secretName || !body.capability || !body.effect) {
      return reply.code(400).send({ error: "subjectType, subjectId, secretName, capability, effect required" });
    }
    const row = resolver.policies.create({
      tenantId,
      subjectType: body.subjectType,
      subjectId: body.subjectId,
      secretName: body.secretName,
      capability: body.capability,
      effect: body.effect,
    });
    return { policy: row };
  });

  app.delete("/v1/tenants/:tenantId/policies/:id", async (req, reply) => {
    await requirePrincipalOrUser(req, reply);
    const { id } = req.params as { id: string };
    resolver.policies.delete(id);
    return { ok: true };
  });

  // ---------- Audit ----------

  app.get("/v1/tenants/:tenantId/audit", async (req, reply) => {
    await requirePrincipalOrUser(req, reply);
    const keys = session.requireKeys();
    const { tenantId } = req.params as { tenantId: string };
    const q = req.query as Record<string, string> | undefined;
    const filter: Record<string, unknown> = {};
    if (q?.kinds) filter.kinds = q.kinds.split(",");
    if (q?.source) filter.source = q.source;
    if (q?.secretId) filter.secretId = q.secretId;
    if (q?.since) filter.since = q.since;
    if (q?.until) filter.until = q.until;
    if (q?.limit) filter.limit = Number(q.limit);
    return { events: audit.query({ tenantId, auditMacKey: keys.auditMacKey, filter }) };
  });

  app.post("/v1/tenants/:tenantId/audit/verify-integrity", async (req, reply) => {
    await requirePrincipalOrUser(req, reply);
    const keys = session.requireKeys();
    const { tenantId } = req.params as { tenantId: string };
    const meta = metaStore.load(tenantId)!;
    return { report: audit.checkIntegrity({ tenantId, meta, auditMacKey: keys.auditMacKey }) };
  });

  // ---------- Plugins ----------

  app.get("/v1/plugins", async () => {
    return {
      plugins: registry.listPlugins().map((p) => ({ id: p.id, version: p.version, label: p.label })),
      types: registry.listTypes().length,
      executors: registry.listExecutors().length,
      sessionStrategies: registry.listSessions().length,
      permissionModels: registry.listPermissionModels().length,
      brandSyncs: registry.listBrandSyncs().length,
    };
  });

  // ---------- Error handler ----------

  app.setErrorHandler((err, _req, reply) => {
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    reply.code(status).send({ error: err.message });
  });

  return app;
}

export async function startVaultServer(input: { config?: Partial<VaultConfig>; statusFile?: string } = {}): Promise<{
  app: FastifyInstance;
  config: VaultConfig;
}> {
  const config = loadVaultConfig(input.config ?? {});
  const db = openDatabase(config.dbPath);
  const externalDir = process.env.VAULT_PLUGINS_DIR;
  const registry = await bootPluginRegistry(externalDir ? { externalPluginsDir: externalDir } : {});
  const app = await buildApp({ config, db, registry });
  await app.listen({ host: config.host, port: config.port });

  if (input.statusFile) {
    fs.mkdirSync(path.dirname(input.statusFile), { recursive: true });
    fs.writeFileSync(
      input.statusFile,
      JSON.stringify({
        state: "ready",
        pid: process.pid,
        port: config.port,
        version: "0.1.2",
        ts: new Date().toISOString(),
      }),
    );
  }

  return { app, config };
}
