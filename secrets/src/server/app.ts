// Clawix-grade Secrets HTTP server. Exposes the full surface used by the
// Clawix Mac UI client and the @clawjs/cli sidecar:
//
//   - Secrets lifecycle: setup / unlock / lock / recover / change-password.
//   - Doctor: health + capability map with status granular per area.
//   - Container CRUD (folders).
//   - Secret CRUD + versions + fields + notes + attachments.
//   - Agent grants + leases + policies + ephemeral authorizations.
//   - Brokered execute (broker.http and any registered executor).
//   - Brand sync.
//   - Audit query + integrity verify.
//
// All sensitive operations require the secrets to be unlocked
// (masterKey/auditMacKey held in process memory by SecretsSession). This
// matches the Clawix Mac model: the daemon process owns the keys; the
// UI talks HTTP to it.

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";

import { SecretsAuthService, generateOpaqueToken, hashToken } from "./auth.ts";
import { loadSecretsConfig, type SecretsConfig } from "./config.ts";
import {
  secretsChangePassword,
  secretsRecover,
  secretsSetup,
  secretsUnlock,
  unwrapItemKey,
  type SecretsMetaSnapshot,
} from "./crypto.ts";
import { ARGON2_DEFAULT_PARAMS, calibrateArgon2 } from "./calibration.ts";
import { asUint8Array, openDatabase, type SqliteDb } from "./db.ts";
import {
  PluginRegistryStore,
  PrincipalStore,
  TenantStore,
  UserStore,
  SecretsMetaStore,
} from "./stores.ts";
import { SecretsResolver } from "./resolver.ts";
import { AuditStore } from "./audit.ts";
import { SECRETS_CAPABILITIES } from "./capabilities.ts";
import { evaluateGovernance } from "./governance.ts";
import { SecretsSession } from "./session.ts";
import { bootPluginRegistry } from "../plugins/loader.ts";
import { redactString } from "../plugins/redaction.ts";
import type { PluginRegistry } from "../plugins/registry.ts";
import type { ExecutorContext } from "../plugins/types.ts";
import { LockableSecret } from "./lockable-secret.ts";
import { decryptBackup, encryptBackup, restoreLogicalBackup, SECRETS_BACKUP_FORMAT } from "./backup.ts";

const DEFAULT_TENANT_ID = "clawix-local";

function hasIndexHtml(dir: string): boolean {
  return fs.existsSync(path.join(dir, "index.html"));
}

export function resolveUiRoot(config: SecretsConfig, moduleUrl = import.meta.url): string {
  if (hasIndexHtml(config.uiDistDir)) return config.uiDistDir;
  const cwdDist = path.join(process.cwd(), "ui", "dist");
  if (hasIndexHtml(cwdDist)) return cwdDist;
  const moduleDir = path.dirname(fileURLToPath(moduleUrl));
  const candidates = [
    path.resolve(moduleDir, "../ui/dist"),
    path.resolve(moduleDir, "../../ui/dist"),
    path.resolve(moduleDir, "../../../secrets/ui/dist"),
  ];
  return candidates.find(hasIndexHtml) ?? config.uiDistDir;
}

function resolveBrandRoot(): string | null {
  const candidates = [
    path.resolve(process.cwd(), "public"),
    path.resolve(process.cwd(), "..", "public"),
    path.resolve(process.cwd(), "../..", "public"),
  ];
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, "favicon.ico"))) ?? null;
}

interface AppDeps {
  config: SecretsConfig;
  db: SqliteDb;
  registry: PluginRegistry;
}

export async function buildSecretsApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config, db, registry } = deps;

  const auth = new SecretsAuthService(config.jwtSecret);
  const tenants = new TenantStore(db);
  const users = new UserStore(db);
  const principals = new PrincipalStore(db);
  const metaStore = new SecretsMetaStore(db);
  const resolver = new SecretsResolver(db);
  const audit = new AuditStore(db);
  const pluginsStore = new PluginRegistryStore(db);
  const session = new SecretsSession();

  // Ensure the default tenant exists.
  tenants.upsert(DEFAULT_TENANT_ID, "Clawix Local");

  const app = Fastify({ logger: false });
  await app.register(cors, {
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : true,
    credentials: true,
  });
  const brandRoot = resolveBrandRoot();
  if (brandRoot) {
    await app.register(fastifyStatic, {
      root: brandRoot,
      prefix: "/brand/",
      decorateReply: false,
    });
  }

  // ---------- Auth helpers ----------

  async function requirePrincipalOrUser(req: FastifyRequest, _reply: FastifyReply) {
    const header = req.headers.authorization;
    if (!header || !header.toLowerCase().startsWith("bearer ")) {
      throw app.httpErrors?.unauthorized?.("Bearer token required") ?? Object.assign(new Error("unauthorized"), { statusCode: 401 });
    }
    const token = header.slice("bearer ".length).trim();
    if (config.adminToken && token === config.adminToken) {
      return {
        kind: "user" as const,
        claims: {
          kind: "user" as const,
          sub: "local-admin",
          tenantId: DEFAULT_TENANT_ID,
          role: "tenant_admin" as const,
          email: "local@secrets",
        },
      };
    }
    if (token.startsWith("sec_prn_")) {
      const principal = principals.findByTokenHash(hashToken(token));
      if (!principal) throw Object.assign(new Error("Invalid principal token"), { statusCode: 401 });
      principals.bumpUsage(principal.id);
      return { kind: "principal" as const, principal };
    }
    const claims = await auth.verifyUserToken(token);
    if (!claims) throw Object.assign(new Error("Invalid bearer"), { statusCode: 401 });
    return { kind: "user" as const, claims };
  }

  function actorForPolicy(actor: Awaited<ReturnType<typeof requirePrincipalOrUser>>) {
    if (actor.kind === "principal") {
      return {
        subjectType: actor.principal.type,
        subjectId: actor.principal.id,
        tenantId: actor.principal.tenant_id,
        defaultAllow: false,
      };
    }
    return {
      subjectType: actor.claims.role,
      subjectId: actor.claims.sub,
      tenantId: actor.claims.tenantId,
      defaultAllow: actor.claims.role === "tenant_admin",
    };
  }

  function isCapabilityAllowed(actor: Awaited<ReturnType<typeof requirePrincipalOrUser>>, tenantId: string, secretName: string, capability: string): boolean {
    const subject = actorForPolicy(actor);
    const effect = resolver.policies.evaluate({
      tenantId,
      subjectType: subject.subjectType,
      subjectId: subject.subjectId,
      secretName,
      capability,
    });
    if (effect === "deny") return false;
    if (effect === "allow") return true;
    return subject.defaultAllow;
  }

  function firstSecretValue(fields: Record<string, string>, preferred?: string): string {
    if (preferred && fields[preferred] !== undefined) return fields[preferred];
    for (const key of ["token", "api_key", "password", "client_secret", "access_token"]) {
      if (fields[key] !== undefined) return fields[key];
    }
    return Object.values(fields)[0] ?? "";
  }

  function isLocalNetworkHost(hostname: string): boolean {
    return hostname === "localhost"
      || hostname === "127.0.0.1"
      || hostname === "::1"
      || hostname.startsWith("10.")
      || hostname.startsWith("192.168.")
      || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
  }

  // ---------- Public ----------

  app.get("/v1/health", async () => ({
    ok: true,
    service: "clawjs-secrets",
    host: config.host,
    port: config.port,
    schemaVersion: 2,
    cryptoVersion: 1,
  }));

  app.get("/v1/secret-types", async () => {
    return { types: registry.listTypes() };
  });

  app.post("/v1/auth/login", async (req, reply) => {
    const body = (req.body ?? {}) as { tenantId?: string; email?: string; password?: string };
    if (!config.adminToken || body.password !== config.adminToken) {
      return reply.code(401).send({ error: "Invalid credentials" });
    }
    const tenantId = body.tenantId ?? DEFAULT_TENANT_ID;
    tenants.upsert(tenantId, "Clawix Local");
    const email = body.email ?? "local@secrets";
    let user = users.findByEmail(tenantId, email);
    if (!user) {
      user = users.create({
        tenantId,
        email,
        passwordHash: hashToken(config.adminToken),
        role: "tenant_admin",
      });
    }
    const accessToken = await auth.issueUserToken({
      userId: user.id,
      tenantId,
      role: "tenant_admin",
      email,
    });
    return { accessToken, tenantId, user: { id: user.id, email, role: "tenant_admin" } };
  });

  // ---------- Secrets lifecycle ----------

  app.get("/v1/secrets/state", async () => {
    const exists = metaStore.exists(DEFAULT_TENANT_ID);
    return {
      tenantId: DEFAULT_TENANT_ID,
      initialized: exists,
      unlocked: session.isUnlocked(),
      autoLockMinutes: 60,
    };
  });

  app.post("/v1/secrets/setup", async (req, reply) => {
    if (metaStore.exists(DEFAULT_TENANT_ID)) {
      return reply.code(409).send({ error: "Secrets already initialized" });
    }
    const body = (req.body ?? {}) as { password?: string; appVersion?: string; calibrate?: boolean };
    if (!body.password) return reply.code(400).send({ error: "password required" });
    const params = body.calibrate ? calibrateArgon2() : ARGON2_DEFAULT_PARAMS;
    const result = secretsSetup(body.password, {
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
      event: { kind: "secretsSetup", source: "system", success: true, payload: {} },
    });
    return {
      ok: true,
      recoveryPhrase: result.recoveryPhrase,
      kdfParams: result.meta.kdfParams,
      deviceId: result.meta.deviceId,
    };
  });

  app.post("/v1/secrets/unlock", async (req, reply) => {
    const meta = metaStore.load(DEFAULT_TENANT_ID);
    if (!meta) return reply.code(404).send({ error: "Secrets not initialized" });
    const body = (req.body ?? {}) as { password?: string };
    if (!body.password) return reply.code(400).send({ error: "password required" });
    try {
      const { masterKey, auditMacKey } = secretsUnlock(meta, body.password);
      session.setUnlocked({ tenantId: DEFAULT_TENANT_ID, masterKey, auditMacKey });
      audit.append({
        tenantId: DEFAULT_TENANT_ID,
        meta,
        auditMacKey,
        event: { kind: "secretsUnlock", source: "system", success: true, payload: {} },
      });
      return { ok: true };
    } catch (err) {
      const tempKeys = (() => {
        try { return secretsUnlock(meta, "_anonymous_"); } catch { return null; }
      })();
      if (tempKeys) {
        audit.append({
          tenantId: DEFAULT_TENANT_ID,
          meta,
          auditMacKey: tempKeys.auditMacKey,
          event: { kind: "secretsFailedUnlock", source: "system", success: false, payload: { reason: (err as Error).message } },
        });
        tempKeys.masterKey.zero();
        tempKeys.auditMacKey.zero();
      }
      return reply.code(401).send({ error: "Invalid password" });
    }
  });

  app.post("/v1/secrets/lock", async () => {
    if (session.isUnlocked()) {
      const meta = metaStore.load(DEFAULT_TENANT_ID);
      if (meta) {
        try {
          const keys = session.requireKeys();
          audit.append({
            tenantId: DEFAULT_TENANT_ID,
            meta,
            auditMacKey: keys.auditMacKey,
            event: { kind: "secretsLock", source: "system", payload: {} },
          });
        } catch { /* ignore */ }
      }
    }
    session.lock();
    return { ok: true };
  });

  app.post("/v1/secrets/recover", async (req, reply) => {
    const meta = metaStore.load(DEFAULT_TENANT_ID);
    if (!meta) return reply.code(404).send({ error: "Secrets not initialized" });
    const body = (req.body ?? {}) as { phrase?: string };
    if (!body.phrase) return reply.code(400).send({ error: "phrase required" });
    try {
      const { masterKey, auditMacKey } = secretsRecover(meta, body.phrase);
      session.setUnlocked({ tenantId: DEFAULT_TENANT_ID, masterKey, auditMacKey });
      audit.append({
        tenantId: DEFAULT_TENANT_ID,
        meta,
        auditMacKey,
        event: { kind: "secretsRecoveryUsed", source: "system", success: true, payload: {} },
      });
      return { ok: true };
    } catch (err) {
      return reply.code(401).send({ error: (err as Error).message });
    }
  });

  app.post("/v1/secrets/change-password", async (req, reply) => {
    const meta = metaStore.load(DEFAULT_TENANT_ID);
    if (!meta) return reply.code(404).send({ error: "Secrets not initialized" });
    const body = (req.body ?? {}) as { oldPassword?: string; newPassword?: string };
    if (!body.oldPassword || !body.newPassword) return reply.code(400).send({ error: "oldPassword, newPassword required" });
    try {
      const result = secretsChangePassword(meta, body.oldPassword, body.newPassword);
      metaStore.save(DEFAULT_TENANT_ID, result.newMeta);
      // Re-unlock with new password to refresh in-memory keys.
      const unlocked = secretsUnlock(result.newMeta, body.newPassword);
      session.setUnlocked({
        tenantId: DEFAULT_TENANT_ID,
        masterKey: unlocked.masterKey,
        auditMacKey: unlocked.auditMacKey,
      });
      audit.append({
        tenantId: DEFAULT_TENANT_ID,
        meta: result.newMeta,
        auditMacKey: unlocked.auditMacKey,
        event: { kind: "secretsPasswordChange", source: "admin", payload: {} },
      });
      return { ok: true, recoveryPhrase: result.newRecoveryPhrase };
    } catch (err) {
      return reply.code(401).send({ error: (err as Error).message });
    }
  });

  app.get("/v1/secrets/doctor", async () => {
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

  // ---------- Encrypted backup / restore ----------

  app.post("/v1/secrets/backup/export", async (req, reply) => {
    await requirePrincipalOrUser(req, reply);
    session.requireKeys();
    const body = (req.body ?? {}) as { passphrase?: string };
    if (!body.passphrase) return reply.code(400).send({ error: "passphrase required" });
    try {
      const backup = encryptBackup(db, body.passphrase);
      return {
        ok: true,
        format: SECRETS_BACKUP_FORMAT,
        exportedAt: backup.exportedAt,
        backup,
      };
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message });
    }
  });

  app.post("/v1/secrets/backup/import", async (req, reply) => {
    await requirePrincipalOrUser(req, reply);
    session.requireKeys();
    const body = (req.body ?? {}) as { passphrase?: string; backup?: unknown };
    if (!body.passphrase || !body.backup) return reply.code(400).send({ error: "passphrase, backup required" });
    try {
      const logical = decryptBackup(body.backup, body.passphrase);
      const result = restoreLogicalBackup(db, logical);
      session.lock();
      return { ok: true, format: SECRETS_BACKUP_FORMAT, imported: result, state: { unlocked: false } };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  // ---------- Containers (secrets folders) ----------

  app.get("/v1/tenants/:tenantId/folders", async (req) => {
    await requirePrincipalOrUser(req, undefined as unknown as FastifyReply);
    const { tenantId } = req.params as { tenantId: string };
    const includeTrashed = ((req.query as Record<string, string>)?.includeTrashed === "true");
    const rows = resolver.containers.list(tenantId, includeTrashed);
    return { folders: rows.map((r) => resolver.describeContainer(r)) };
  });

  app.post("/v1/tenants/:tenantId/folders", async (req) => {
    await requirePrincipalOrUser(req, undefined as unknown as FastifyReply);
    const { tenantId } = req.params as { tenantId: string };
    const body = (req.body ?? {}) as { name?: string; icon?: string; color?: string; sortOrder?: number };
    if (!body.name) throw Object.assign(new Error("name required"), { statusCode: 400 });
    return { folder: resolver.describeContainer(
      resolver.containers.create({
        tenantId,
        name: body.name,
        ...(body.icon ? { icon: body.icon } : {}),
        ...(body.color ? { color: body.color } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
      })
    ) };
  });

  app.patch("/v1/tenants/:tenantId/folders/:id", async (req) => {
    await requirePrincipalOrUser(req, undefined as unknown as FastifyReply);
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { name?: string };
    const row = body.name ? resolver.containers.rename(id, body.name) : undefined;
    return { folder: row ? resolver.describeContainer(row) : null };
  });

  app.delete("/v1/tenants/:tenantId/folders/:id", async (req) => {
    await requirePrincipalOrUser(req, undefined as unknown as FastifyReply);
    const { id } = req.params as { id: string };
    resolver.containers.trash(id);
    return { ok: true };
  });

  // ---------- Principals ----------

  app.get("/v1/tenants/:tenantId/principals", async (req) => {
    await requirePrincipalOrUser(req, undefined as unknown as FastifyReply);
    const { tenantId } = req.params as { tenantId: string };
    return {
      principals: principals.list(tenantId).map((p) => ({
        id: p.id,
        tenantId: p.tenant_id,
        type: p.type,
        label: p.label,
        createdAt: p.created_at,
        lastUsedAt: p.last_used_at,
      })),
    };
  });

  app.post("/v1/tenants/:tenantId/principals", async (req, reply) => {
    await requirePrincipalOrUser(req, reply);
    const { tenantId } = req.params as { tenantId: string };
    const body = (req.body ?? {}) as { type?: "service_principal" | "sidecar_principal"; label?: string };
    if (!body.type || !body.label) return reply.code(400).send({ error: "type, label required" });
    const issued = generateOpaqueToken("sec_prn");
    const principal = principals.create({
      tenantId,
      type: body.type,
      label: body.label,
      tokenHash: hashToken(issued.token),
    });
    return {
      principal: {
        id: principal.id,
        tenantId: principal.tenant_id,
        type: principal.type,
        label: principal.label,
        createdAt: principal.created_at,
        lastUsedAt: principal.last_used_at,
      },
      token: issued.token,
    };
  });

  // ---------- Secrets ----------

  app.get("/v1/tenants/:tenantId/secrets", async (req) => {
    await requirePrincipalOrUser(req, undefined as unknown as FastifyReply);
    const { tenantId } = req.params as { tenantId: string };
    const q = req.query as Record<string, string> | undefined;
    const rows = resolver.secrets.list({
      tenantId,
      ...(q?.search ? { search: q.search } : {}),
      ...(q?.folderId ? { folderId: q.folderId } : {}),
      includeTrashed: q?.includeTrashed === "true",
      includeArchived: q?.includeArchived === "true",
    });
    return { secrets: rows.map((r) => resolver.describeSecret(r)) };
  });

  app.get("/v1/tenants/:tenantId/secrets/:name", async (req, reply) => {
    const actor = await requirePrincipalOrUser(req, reply);
    const { tenantId, name } = req.params as { tenantId: string; name: string };
    if (!isCapabilityAllowed(actor, tenantId, name, "metadata.read")) return reply.code(403).send({ error: "metadata.read denied" });
    const row = resolver.secrets.getByInternalName(tenantId, name);
    if (!row) return reply.code(404).send({ error: "Not found" });
    return { secret: resolver.describeSecret(row) };
  });

  app.get("/v1/tenants/:tenantId/secrets/:name/versions", async (req, reply) => {
    const actor = await requirePrincipalOrUser(req, reply);
    const { tenantId, name } = req.params as { tenantId: string; name: string };
    if (!isCapabilityAllowed(actor, tenantId, name, "metadata.read")) return reply.code(403).send({ error: "metadata.read denied" });
    const row = resolver.secrets.getByInternalName(tenantId, name);
    if (!row) return reply.code(404).send({ error: "Not found" });
    return { versions: resolver.secrets.listVersions(row.id) };
  });

  app.get("/v1/tenants/:tenantId/secrets/:name/capabilities", async (req, reply) => {
    const actor = await requirePrincipalOrUser(req, reply);
    const { tenantId, name } = req.params as { tenantId: string; name: string };
    const row = resolver.secrets.getByInternalName(tenantId, name);
    if (!row) return reply.code(404).send({ error: "Not found" });
    return {
      secret: resolver.describeSecret(row),
      capabilities: SECRETS_CAPABILITIES.map((capability) => ({
        capability,
        allowed: isCapabilityAllowed(actor, tenantId, name, capability),
      })),
    };
  });

  app.get("/v1/tenants/:tenantId/secrets/:name/actions", async (req, reply) => {
    const actor = await requirePrincipalOrUser(req, reply);
    const { tenantId, name } = req.params as { tenantId: string; name: string };
    const row = resolver.secrets.getByInternalName(tenantId, name);
    if (!row) return reply.code(404).send({ error: "Not found" });
    const type = row.type_id ? registry.getType(row.type_id) : undefined;
    const actions = (type?.executorIds ?? ["broker.http"])
      .map((executorId) => registry.getExecutor(executorId))
      .filter((executor): executor is NonNullable<typeof executor> => Boolean(executor))
      .map((executor) => ({
        id: executor.id,
        label: executor.label,
        capability: executor.capabilities[0] ?? "broker.http",
        allowed: executor.capabilities.every((capability) => isCapabilityAllowed(actor, tenantId, name, capability)),
      }));
    return { secret: resolver.describeSecret(row), actions };
  });

  app.post("/v1/tenants/:tenantId/secrets/:name/actions/:actionId", async (req, reply) => {
    const actor = await requirePrincipalOrUser(req, reply);
    const keys = session.requireKeys();
    const { tenantId, name, actionId } = req.params as { tenantId: string; name: string; actionId: string };
    const row = resolver.secrets.getByInternalName(tenantId, name);
    if (!row) return reply.code(404).send({ error: "Not found" });
    const executor = registry.getExecutor(actionId);
    if (!executor) return reply.code(404).send({ error: "Action not registered" });
    if (!executor.capabilities.every((capability) => isCapabilityAllowed(actor, tenantId, name, capability))) {
      return reply.code(403).send({ error: "Action denied" });
    }
    const body = (req.body ?? {}) as { args?: Record<string, unknown> };
    const itemKey = unwrapItemKey(asUint8Array(row.wrapped_item_key), row.id, keys.masterKey);
    const resolvedFields = resolver.revealAllFields({ secret: row, masterKey: keys.masterKey });
    try {
      const validation = executor.validate?.({ secret: row, resolvedFields, itemKey, args: body.args ?? {} } as ExecutorContext);
      if (validation && validation.ok === false) return reply.code(422).send({ error: validation.reason });
      const output = await executor.execute({ secret: row, resolvedFields, itemKey, args: body.args ?? {} } as ExecutorContext);
      const redacted = executor.redact ? executor.redact(output, resolvedFields) : output;
      return { action: { id: executor.id, label: executor.label, capability: executor.capabilities[0] ?? "broker.http" }, result: redacted };
    } finally {
      itemKey.zero();
    }
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

  app.post("/v1/tenants/:tenantId/broker/http", async (req, reply) => {
    const actor = await requirePrincipalOrUser(req, reply);
    const keys = session.requireKeys();
    const { tenantId } = req.params as { tenantId: string };
    const body = (req.body ?? {}) as {
      method?: string;
      url?: string;
      headers?: Record<string, string>;
      body?: string;
      timeoutMs?: number;
    };
    if (!body.method || !body.url) return reply.code(400).send({ error: "method, url required" });

    const requestHeaders = body.headers ?? {};
    const urlBefore = body.url;
    const bodyBefore = body.body ?? "";
    const template = /\{\{\s*([a-zA-Z0-9_.-]+)(?:\.([a-zA-Z0-9_]+))?\s*\}\}/g;
    const textForDiscovery = [urlBefore, bodyBefore, ...Object.values(requestHeaders)].join("\n");
    const matches = [...textForDiscovery.matchAll(template)];
    if (matches.length === 0) return reply.code(400).send({ error: "No secret placeholders found" });

    const resolvedByToken = new Map<string, string>();
    const redactionValues: string[] = [];
    const target = new URL(urlBefore.replace(template, "placeholder"));
    for (const match of matches) {
      const token = match[0];
      if (resolvedByToken.has(token)) continue;
      const secretName = match[1];
      const fieldName = match[2];
      if (!isCapabilityAllowed(actor, tenantId, secretName, "broker.http")) {
        return reply.code(403).send({ error: "broker.http denied", secretName });
      }
      const row = resolver.secrets.getByInternalName(tenantId, secretName);
      if (!row) return reply.code(404).send({ error: `Secret not found: ${secretName}` });
      const placements = [
        urlBefore.includes(token) ? "query" : null,
        bodyBefore.includes(token) ? "body" : null,
        Object.values(requestHeaders).some((value) => value.includes(token)) ? "header" : null,
      ].filter(Boolean) as Array<"query" | "body" | "header">;
      const decision = evaluateGovernance(row, {
        host: target.host,
        method: body.method,
        headers: Object.fromEntries(Object.entries(requestHeaders).filter(([, value]) => value.includes(token))),
        placements,
        insecureTransport: target.protocol === "http:",
        localNetwork: isLocalNetworkHost(target.hostname),
      });
      if (!decision.allowed) return reply.code(400).send({ error: "Blocked by governance", secretName, reasons: decision.reasons });
      const fields = resolver.revealAllFields({ secret: row, masterKey: keys.masterKey });
      const value = firstSecretValue(fields, fieldName);
      resolvedByToken.set(token, value);
      redactionValues.push(value);
    }

    const replaceSecrets = (input: string) => {
      let out = input;
      for (const [token, value] of resolvedByToken) out = out.split(token).join(value);
      return out;
    };
    const outgoingHeaders = Object.fromEntries(
      Object.entries(requestHeaders).map(([key, value]) => [key, replaceSecrets(value)]),
    );
    const outgoingUrl = replaceSecrets(urlBefore);
    const outgoingBody = body.body === undefined ? undefined : replaceSecrets(body.body);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), body.timeoutMs ?? 30_000);
    try {
      const response = await fetch(outgoingUrl, {
        method: body.method,
        headers: outgoingHeaders,
        body: outgoingBody,
        signal: controller.signal,
      });
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = redactString(value, redactionValues);
      });
      const bodyText = redactString(await response.text(), redactionValues);
      return {
        ok: response.ok,
        status: response.status,
        headers: responseHeaders,
        bodyText,
      };
    } finally {
      clearTimeout(timer);
    }
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
      secretsCapabilities?: string[];
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
      secretsCapabilities: (body.secretsCapabilities ?? []) as never[],
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

  const uiRoot = resolveUiRoot(config);
  if (hasIndexHtml(uiRoot)) {
    await app.register(fastifyStatic, {
      root: uiRoot,
      prefix: "/",
      decorateReply: false,
      wildcard: true,
    });
  }

  // ---------- Error handler ----------

  app.setErrorHandler((err, _req, reply) => {
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    reply.code(status).send({ error: err.message });
  });

  return app;
}

export async function startSecretsServer(input: { config?: Partial<SecretsConfig>; statusFile?: string } = {}): Promise<{
  app: FastifyInstance;
  config: SecretsConfig;
}> {
  const config = loadSecretsConfig(input.config ?? {});
  const db = openDatabase(config.dbPath);
  const externalDir = process.env.SECRETS_PLUGINS_DIR;
  const registry = await bootPluginRegistry(externalDir ? { externalPluginsDir: externalDir } : {});
  const app = await buildSecretsApp({ config, db, registry });
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
