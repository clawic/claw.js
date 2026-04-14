import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";

import { VaultAuthService, type VaultActor, type VaultClaims } from "./auth.ts";
import {
  buildTypedActionBrokerRequest,
  getSecretType,
  listSecretActions,
  listSecretTypes,
  normalizeStructuredFields,
  resolveSecretCapabilities,
  validateTypedSecretInput,
} from "./catalog.ts";
import { loadVaultConfig, type VaultConfig } from "./config.ts";
import { resolveKek } from "./crypto.ts";
import { VaultDatabase } from "./db.ts";
import { isAllowed } from "./policy.ts";
import type { VaultCapability, VaultLeaseMode, VaultPrincipalType, VaultUserRole } from "../shared/types.ts";

export function resolveUiRoot(config: VaultConfig, importMetaUrl = import.meta.url): string {
  const candidates = [
    config.uiDistDir,
    fileURLToPath(new URL("../../ui/dist", importMetaUrl)),
    fileURLToPath(new URL("../ui/dist", importMetaUrl)),
    path.join(process.cwd(), "vault", "ui", "dist"),
    path.join(process.cwd(), "ui", "dist"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

function resolveBrandRoot(): string {
  const candidates = [
    fileURLToPath(new URL("../../../public", import.meta.url)),
    fileURLToPath(new URL("../../public", import.meta.url)),
    path.join(process.cwd(), "..", "public"),
    path.join(process.cwd(), "public"),
  ];
  return candidates.find((candidate) => (
    fs.existsSync(path.join(candidate, "logo.png")) &&
    fs.existsSync(path.join(candidate, "favicon.ico"))
  )) ?? candidates[0];
}

function parseBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

function readBody(request: FastifyRequest): Record<string, unknown> {
  return (request.body ?? {}) as Record<string, unknown>;
}

function redactInlineSecrets(value: string): string {
  return value.replace(/\{\{[^}]+\}\}/g, "{{REDACTED}}");
}

function requestActor(actor: VaultActor | VaultClaims): VaultActor {
  if ("kind" in actor && actor.kind === "user") {
    return {
      actorType: actor.role,
      actorId: actor.sub,
      tenantId: actor.tenantId,
      email: actor.email,
    };
  }
  return actor;
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local")) return true;
  if (net.isIP(host) === 4) {
    return host.startsWith("10.")
      || host.startsWith("127.")
      || host.startsWith("192.168.")
      || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  }
  return false;
}

function parseTemplateTokens(value: string): string[] {
  return [...value.matchAll(/\{\{([^}]+)\}\}/g)].map((match) => match[1] ?? "").filter(Boolean);
}

async function parseActor(
  request: FastifyRequest,
  auth: VaultAuthService,
  db: VaultDatabase,
): Promise<VaultActor | VaultClaims | null> {
  const token = parseBearerToken(request);
  if (!token) return null;
  if (token.startsWith("vlt_prn_")) {
    return db.authenticatePrincipal(token);
  }
  return await auth.verifyUserToken(token);
}

async function requireActor(
  request: FastifyRequest,
  reply: FastifyReply,
  auth: VaultAuthService,
  db: VaultDatabase,
  options: {
    tenantId?: string;
    roles?: VaultUserRole[];
    principalTypes?: VaultPrincipalType[];
  } = {},
): Promise<VaultActor | VaultClaims | null> {
  const actor = await parseActor(request, auth, db);
  if (!actor) {
    await reply.code(401).send({ error: "Unauthorized" });
    return null;
  }
  const tenantId = "kind" in actor && actor.kind === "user" ? actor.tenantId : actor.tenantId;
  if (options.tenantId && tenantId !== options.tenantId) {
    await reply.code(403).send({ error: "Forbidden", message: "Tenant mismatch." });
    return null;
  }
  if (options.roles && "kind" in actor && actor.kind === "user" && !options.roles.includes(actor.role)) {
    await reply.code(403).send({ error: "Forbidden", message: "User role not allowed." });
    return null;
  }
  if (options.principalTypes && !("kind" in actor && actor.kind === "user") && !options.principalTypes.includes(actor.actorType as VaultPrincipalType)) {
    await reply.code(403).send({ error: "Forbidden", message: "Principal type not allowed." });
    return null;
  }
  return actor;
}

function assertSecretAccess(
  db: VaultDatabase,
  actor: VaultActor | VaultClaims,
  tenantId: string,
  secretName: string,
  capability: VaultCapability,
): boolean {
  if ("kind" in actor && actor.kind === "user" && capability !== "broker.http") {
    return actor.role === "tenant_admin" || actor.role === "tenant_operator";
  }
  const policies = db.listPolicies(tenantId);
  return isAllowed(policies, actor, secretName, capability);
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim())
    : [];
}

function normalizeLeaseModes(value: unknown): VaultLeaseMode[] {
  return normalizeStringArray(value).filter((entry): entry is VaultLeaseMode => entry === "process" || entry === "browser");
}

function applySecretTypeDefaults(input: {
  kind?: string;
  typeId?: string | null;
  structuredFields?: Record<string, string>;
  allowedHosts?: string[];
  allowedHeaderNames?: string[];
  allowInURL?: boolean;
  allowInRequestBody?: boolean;
  allowLocalNetwork?: boolean;
  readOnly?: boolean;
  leaseModes?: VaultLeaseMode[];
}) {
  const descriptor = getSecretType(input.typeId);
  return {
    kind: input.kind ?? descriptor?.kind,
    typeId: input.typeId ?? descriptor?.typeId,
    structuredFields: input.structuredFields ?? {},
    allowedHosts: input.allowedHosts && input.allowedHosts.length > 0 ? input.allowedHosts : [...(descriptor?.defaultAllowedHosts ?? [])],
    allowedHeaderNames: input.allowedHeaderNames && input.allowedHeaderNames.length > 0 ? input.allowedHeaderNames : [...(descriptor?.defaultAllowedHeaderNames ?? [])],
    allowInURL: typeof input.allowInURL === "boolean" ? input.allowInURL : descriptor?.defaultAllowInURL ?? false,
    allowInRequestBody: typeof input.allowInRequestBody === "boolean" ? input.allowInRequestBody : descriptor?.defaultAllowInRequestBody ?? false,
    allowLocalNetwork: typeof input.allowLocalNetwork === "boolean" ? input.allowLocalNetwork : descriptor?.defaultAllowLocalNetwork ?? false,
    readOnly: typeof input.readOnly === "boolean" ? input.readOnly : descriptor?.defaultReadOnly ?? false,
    leaseModes: input.leaseModes && input.leaseModes.length > 0 ? input.leaseModes : [...(descriptor?.defaultLeaseModes ?? [])],
  };
}

async function executeBrokerRequest(
  db: VaultDatabase,
  kek: Buffer,
  tenantId: string,
  actor: VaultActor | VaultClaims,
  input: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: string;
  },
) {
  const templateSources = [
    input.url,
    ...Object.values(input.headers ?? {}),
    input.body ?? "",
  ];
  const secretNames = [...new Set(templateSources.flatMap(parseTemplateTokens))];
  const secrets = secretNames.map((secretName) => {
    const metadata = db.getSecretMetadata(tenantId, secretName);
    if (!metadata) throw new Error(`Unknown secret ${secretName}`);
    if (!assertSecretAccess(db, actor, tenantId, secretName, "broker.http")) {
      throw new Error(`Forbidden for secret ${secretName}`);
    }
    if (metadata.readOnly && !["GET", "HEAD", "OPTIONS"].includes(input.method.toUpperCase())) {
      throw new Error(`Secret ${secretName} is readOnly`);
    }
    return {
      metadata,
      value: db.readSecretValue(tenantId, secretName, kek) ?? "",
    };
  });

  const target = new URL(input.url);
  for (const secret of secrets) {
    if (!secret.metadata.allowedHosts.includes(target.host)) {
      throw new Error(`Secret ${secret.metadata.secretName} cannot be used with host ${target.host}`);
    }
    if (isPrivateHost(target.hostname) && !secret.metadata.allowLocalNetwork) {
      throw new Error(`Secret ${secret.metadata.secretName} cannot be used on local/private hosts`);
    }
  }

  const headers = { ...(input.headers ?? {}) };
  for (const [headerName, headerValue] of Object.entries(headers)) {
    const tokens = parseTemplateTokens(headerValue);
    for (const token of tokens) {
      const secret = secrets.find((entry) => entry.metadata.secretName === token);
      if (!secret) continue;
      if (!secret.metadata.allowedHeaderNames.includes(headerName)) {
        throw new Error(`Secret ${token} cannot be injected into header ${headerName}`);
      }
      headers[headerName] = headers[headerName]!.replaceAll(`{{${token}}}`, secret.value);
    }
  }

  let url = input.url;
  for (const secret of secrets) {
    if (url.includes(`{{${secret.metadata.secretName}}}`)) {
      if (!secret.metadata.allowInURL) {
        throw new Error(`Secret ${secret.metadata.secretName} cannot be injected into the URL`);
      }
      url = url.replaceAll(`{{${secret.metadata.secretName}}}`, secret.value);
    }
  }

  let body = input.body;
  if (body) {
    for (const secret of secrets) {
      if (body.includes(`{{${secret.metadata.secretName}}}`)) {
        if (!secret.metadata.allowInRequestBody) {
          throw new Error(`Secret ${secret.metadata.secretName} cannot be injected into the request body`);
        }
        body = body.replaceAll(`{{${secret.metadata.secretName}}}`, secret.value);
      }
    }
  }

  const response = await fetch(url, {
    method: input.method.toUpperCase(),
    headers,
    ...(body ? { body } : {}),
  });
  const bodyText = await response.text();
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    bodyText,
    ok: response.ok,
  };
}

export interface BuildVaultAppOptions {
  config?: Partial<VaultConfig>;
}

export function buildVaultApp(options: BuildVaultAppOptions = {}) {
  const config = loadVaultConfig(options.config);
  const uiRoot = resolveUiRoot(config);
  const brandRoot = resolveBrandRoot();
  const app = Fastify({ logger: false });
  const db = new VaultDatabase(config.dbPath);
  const auth = new VaultAuthService(config.jwtSecret);
  const kek = resolveKek(config.kekBase64);

  app.addHook("onClose", async () => {
    db.close();
  });

  app.register(cors, {
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : true,
  });
  if (fs.existsSync(uiRoot)) {
    app.register(fastifyStatic, {
      root: uiRoot,
      prefix: "/static/",
    });
  }
  app.register(fastifyStatic, {
    root: brandRoot,
    prefix: "/brand/",
    decorateReply: false,
  });

  app.get("/", async (_request, reply) => {
    const target = path.join(uiRoot, "index.html");
    if (!fs.existsSync(target)) {
      return await reply.code(404).send("Vault UI not built.");
    }
    reply.type("text/html; charset=utf-8");
    return fs.readFileSync(target, "utf8");
  });

  app.get("/v1/health", async () => ({
    ok: true,
    service: "vault",
    host: config.host,
    port: config.port,
  }));

  app.post("/v1/auth/login", async (request, reply) => {
    const body = readBody(request);
    const tenantId = typeof body.tenantId === "string" ? body.tenantId.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const user = db.verifyUser(tenantId, email, password);
    if (!user) {
      return await reply.code(401).send({ error: "Invalid email, password, or tenant." });
    }
    const accessToken = await auth.issueUserToken({
      userId: user.id,
      tenantId,
      role: user.role,
      email: user.email,
    });
    return {
      accessToken,
      tenantId,
      role: user.role,
      email: user.email,
    };
  });

  app.get("/v1/auth/me", async (request, reply) => {
    const actor = await requireActor(request, reply, auth, db);
    if (!actor) return null;
    return {
      actor: requestActor(actor),
    };
  });

  app.get("/v1/secret-types", async (request) => {
    const search = typeof (request.query as Record<string, unknown> | undefined)?.search === "string"
      ? (request.query as Record<string, unknown>).search as string
      : undefined;
    return { types: listSecretTypes(search) };
  });

  app.get("/v1/tenants/:tenantId/secrets", async (request, reply) => {
    const params = request.params as { tenantId: string };
    const actor = await requireActor(request, reply, auth, db, { tenantId: params.tenantId });
    if (!actor) return null;
    const search = typeof (request.query as Record<string, unknown> | undefined)?.search === "string"
      ? (request.query as Record<string, unknown>).search as string
      : undefined;
    const secrets = db.listSecrets(params.tenantId, search).filter((secret) => assertSecretAccess(db, actor, params.tenantId, secret.secretName, "metadata.read"));
    return { secrets };
  });

  app.get("/v1/tenants/:tenantId/secrets/:secretName", async (request, reply) => {
    const params = request.params as { tenantId: string; secretName: string };
    const actor = await requireActor(request, reply, auth, db, { tenantId: params.tenantId });
    if (!actor) return null;
    if (!assertSecretAccess(db, actor, params.tenantId, params.secretName, "metadata.read")) {
      return await reply.code(403).send({ error: "Forbidden" });
    }
    const secret = db.getSecretMetadata(params.tenantId, params.secretName);
    if (!secret) return await reply.code(404).send({ error: "Not found" });
    return { secret };
  });

  app.post("/v1/tenants/:tenantId/secrets", async (request, reply) => {
    const params = request.params as { tenantId: string };
    const actor = await requireActor(request, reply, auth, db, {
      tenantId: params.tenantId,
      roles: ["tenant_admin", "tenant_operator"],
    });
    if (!actor) return null;
    const body = readBody(request);
    const secretName = typeof body.secretName === "string" ? body.secretName.trim() : "";
    const secretValue = typeof body.secretValue === "string" ? body.secretValue : "";
    if (!secretName || !secretValue) {
      return await reply.code(400).send({ error: "secretName and secretValue are required." });
    }
    const typeId = typeof body.typeId === "string" ? body.typeId.trim() : "";
    const structuredFields = normalizeStructuredFields(getSecretType(typeId), body.structuredFields);
    validateTypedSecretInput({ secretName, secretValue, typeId, structuredFields });
    const defaults = applySecretTypeDefaults({
      ...(typeof body.kind === "string" ? { kind: body.kind.trim() } : {}),
      ...(typeId ? { typeId } : {}),
      structuredFields,
      allowedHosts: normalizeStringArray(body.allowedHosts),
      allowedHeaderNames: normalizeStringArray(body.allowedHeaderNames),
      ...(typeof body.allowInURL === "boolean" ? { allowInURL: body.allowInURL === true } : {}),
      ...(typeof body.allowInRequestBody === "boolean" ? { allowInRequestBody: body.allowInRequestBody === true } : {}),
      ...(typeof body.allowLocalNetwork === "boolean" ? { allowLocalNetwork: body.allowLocalNetwork === true } : {}),
      ...(typeof body.readOnly === "boolean" ? { readOnly: body.readOnly === true } : {}),
      leaseModes: normalizeLeaseModes(body.leaseModes),
    });
    const secret = db.upsertSecret(params.tenantId, {
      secretName,
      secretValue,
      ...(typeof body.label === "string" ? { label: body.label.trim() } : {}),
      ...(defaults.kind ? { kind: defaults.kind } : {}),
      ...(defaults.typeId ? { typeId: defaults.typeId } : {}),
      ...(typeof body.notes === "string" ? { notes: body.notes } : {}),
      structuredFields: defaults.structuredFields,
      allowedHosts: defaults.allowedHosts,
      allowedHeaderNames: defaults.allowedHeaderNames,
      allowInURL: defaults.allowInURL,
      allowInRequestBody: defaults.allowInRequestBody,
      allowLocalNetwork: defaults.allowLocalNetwork,
      readOnly: defaults.readOnly,
      exportable: body.exportable === true,
      leaseModes: defaults.leaseModes,
    }, kek);
    const actorMeta = requestActor(actor);
    db.appendAudit({
      tenantId: params.tenantId,
      actorType: actorMeta.actorType,
      actorId: actorMeta.actorId,
      action: "secret.upsert",
      secretName,
      status: "success",
      detail: `Version ${secret.version} stored.`,
    });
    return await reply.code(201).send({ secret });
  });

  app.post("/v1/tenants/:tenantId/secrets/:secretName/versions", async (request, reply) => {
    const params = request.params as { tenantId: string; secretName: string };
    const actor = await requireActor(request, reply, auth, db, {
      tenantId: params.tenantId,
      roles: ["tenant_admin", "tenant_operator"],
    });
    if (!actor) return null;
    if (!assertSecretAccess(db, actor, params.tenantId, params.secretName, "secret.rotate")) {
      return await reply.code(403).send({ error: "Forbidden" });
    }
    const body = readBody(request);
    const current = db.getSecretMetadata(params.tenantId, params.secretName);
    if (!current) return await reply.code(404).send({ error: "Not found" });
    const secretValue = typeof body.secretValue === "string" ? body.secretValue : "";
    if (!secretValue) return await reply.code(400).send({ error: "secretValue is required." });
    const nextTypeId = typeof body.typeId === "string" ? body.typeId.trim() : current.typeId;
    const structuredFields = normalizeStructuredFields(
      getSecretType(nextTypeId),
      typeof body.structuredFields === "object" && body.structuredFields && !Array.isArray(body.structuredFields)
        ? { ...(current.structuredFields ?? {}), ...(body.structuredFields as Record<string, unknown>) }
        : current.structuredFields,
    );
    validateTypedSecretInput({
      secretName: params.secretName,
      secretValue,
      typeId: nextTypeId,
      structuredFields,
    });
    const defaults = applySecretTypeDefaults({
      ...(typeof body.kind === "string" ? { kind: body.kind } : { kind: current.kind }),
      ...(nextTypeId ? { typeId: nextTypeId } : {}),
      structuredFields,
      allowedHosts: normalizeStringArray(body.allowedHosts).length > 0 ? normalizeStringArray(body.allowedHosts) : current.allowedHosts,
      allowedHeaderNames: normalizeStringArray(body.allowedHeaderNames).length > 0 ? normalizeStringArray(body.allowedHeaderNames) : current.allowedHeaderNames,
      ...(typeof body.allowInURL === "boolean" ? { allowInURL: body.allowInURL === true } : { allowInURL: current.allowInURL }),
      ...(typeof body.allowInRequestBody === "boolean" ? { allowInRequestBody: body.allowInRequestBody === true } : { allowInRequestBody: current.allowInRequestBody }),
      ...(typeof body.allowLocalNetwork === "boolean" ? { allowLocalNetwork: body.allowLocalNetwork === true } : { allowLocalNetwork: current.allowLocalNetwork }),
      ...(typeof body.readOnly === "boolean" ? { readOnly: body.readOnly === true } : { readOnly: current.readOnly }),
      leaseModes: normalizeLeaseModes(body.leaseModes).length > 0 ? normalizeLeaseModes(body.leaseModes) : current.leaseModes,
    });
    const secret = db.upsertSecret(params.tenantId, {
      secretName: params.secretName,
      secretValue,
      label: typeof body.label === "string" ? body.label : current.label,
      kind: defaults.kind,
      typeId: defaults.typeId,
      notes: typeof body.notes === "string" ? body.notes : current.notes,
      structuredFields: defaults.structuredFields,
      allowedHosts: defaults.allowedHosts,
      allowedHeaderNames: defaults.allowedHeaderNames,
      allowInURL: defaults.allowInURL,
      allowInRequestBody: defaults.allowInRequestBody,
      allowLocalNetwork: defaults.allowLocalNetwork,
      readOnly: defaults.readOnly,
      exportable: current.exportable,
      leaseModes: defaults.leaseModes,
    }, kek);
    const actorMeta = requestActor(actor);
    db.appendAudit({
      tenantId: params.tenantId,
      actorType: actorMeta.actorType,
      actorId: actorMeta.actorId,
      action: "secret.rotate",
      secretName: params.secretName,
      status: "success",
      detail: `Version ${secret.version} active.`,
    });
    return { secret };
  });

  app.get("/v1/tenants/:tenantId/secrets/:secretName/capabilities", async (request, reply) => {
    const params = request.params as { tenantId: string; secretName: string };
    const actor = await requireActor(request, reply, auth, db, { tenantId: params.tenantId });
    if (!actor) return null;
    const secret = db.getSecretMetadata(params.tenantId, params.secretName);
    if (!secret) return await reply.code(404).send({ error: "Not found" });
    if (!assertSecretAccess(db, actor, params.tenantId, params.secretName, "metadata.read")) {
      return await reply.code(403).send({ error: "Forbidden" });
    }
    return {
      secret,
      capabilities: resolveSecretCapabilities(db, actor, params.tenantId, secret),
    };
  });

  app.get("/v1/tenants/:tenantId/secrets/:secretName/actions", async (request, reply) => {
    const params = request.params as { tenantId: string; secretName: string };
    const actor = await requireActor(request, reply, auth, db, { tenantId: params.tenantId });
    if (!actor) return null;
    const secret = db.getSecretMetadata(params.tenantId, params.secretName);
    if (!secret) return await reply.code(404).send({ error: "Not found" });
    if (!assertSecretAccess(db, actor, params.tenantId, params.secretName, "metadata.read")) {
      return await reply.code(403).send({ error: "Forbidden" });
    }
    return {
      secret,
      actions: listSecretActions(secret).map((action) => ({
        ...action,
        allowed: assertSecretAccess(db, actor, params.tenantId, params.secretName, action.capability),
      })),
    };
  });

  app.get("/v1/tenants/:tenantId/policies", async (request, reply) => {
    const params = request.params as { tenantId: string };
    const actor = await requireActor(request, reply, auth, db, { tenantId: params.tenantId });
    if (!actor) return null;
    return { policies: db.listPolicies(params.tenantId) };
  });

  app.post("/v1/tenants/:tenantId/policies", async (request, reply) => {
    const params = request.params as { tenantId: string };
    const actor = await requireActor(request, reply, auth, db, {
      tenantId: params.tenantId,
      roles: ["tenant_admin", "tenant_operator"],
    });
    if (!actor) return null;
    const body = readBody(request);
    const subjectType = typeof body.subjectType === "string" ? body.subjectType : "";
    const subjectId = typeof body.subjectId === "string" ? body.subjectId.trim() : "";
    const secretName = typeof body.secretName === "string" ? body.secretName.trim() : "";
    const capability = typeof body.capability === "string" ? body.capability as VaultCapability : null;
    const effect = body.effect === "deny" ? "deny" : body.effect === "allow" ? "allow" : null;
    if (!subjectType || !subjectId || !secretName || !capability || !effect) {
      return await reply.code(400).send({ error: "subjectType, subjectId, secretName, capability, and effect are required." });
    }
    const policy = db.createPolicy({
      tenantId: params.tenantId,
      subjectType: subjectType as VaultUserRole | VaultPrincipalType | "*",
      subjectId,
      secretName,
      capability,
      effect,
    });
    const actorMeta = requestActor(actor);
    db.appendAudit({
      tenantId: params.tenantId,
      actorType: actorMeta.actorType,
      actorId: actorMeta.actorId,
      action: "policy.create",
      secretName,
      status: "success",
      detail: `${effect} ${capability} for ${subjectType}:${subjectId}`,
    });
    return await reply.code(201).send({ policy });
  });

  app.delete("/v1/tenants/:tenantId/policies/:policyId", async (request, reply) => {
    const params = request.params as { tenantId: string; policyId: string };
    const actor = await requireActor(request, reply, auth, db, {
      tenantId: params.tenantId,
      roles: ["tenant_admin", "tenant_operator"],
    });
    if (!actor) return null;
    const deleted = db.deletePolicy(params.tenantId, params.policyId);
    if (!deleted) return await reply.code(404).send({ error: "Not found" });
    return { ok: true };
  });

  app.get("/v1/tenants/:tenantId/principals", async (request, reply) => {
    const params = request.params as { tenantId: string };
    const actor = await requireActor(request, reply, auth, db, {
      tenantId: params.tenantId,
      roles: ["tenant_admin", "tenant_operator"],
    });
    if (!actor) return null;
    return { principals: db.listPrincipals(params.tenantId) };
  });

  app.post("/v1/tenants/:tenantId/principals", async (request, reply) => {
    const params = request.params as { tenantId: string };
    const actor = await requireActor(request, reply, auth, db, {
      tenantId: params.tenantId,
      roles: ["tenant_admin", "tenant_operator"],
    });
    if (!actor) return null;
    const body = readBody(request);
    const type = typeof body.type === "string" ? body.type as VaultPrincipalType : null;
    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (!type || !label) return await reply.code(400).send({ error: "type and label are required." });
    const principal = db.createPrincipal(params.tenantId, type, label);
    const actorMeta = requestActor(actor);
    db.appendAudit({
      tenantId: params.tenantId,
      actorType: actorMeta.actorType,
      actorId: actorMeta.actorId,
      action: "principal.create",
      status: "success",
      detail: `${type}:${label}`,
    });
    return await reply.code(201).send({ principal });
  });

  app.post("/v1/tenants/:tenantId/broker/http", async (request, reply) => {
    const params = request.params as { tenantId: string };
    const actor = await requireActor(request, reply, auth, db, { tenantId: params.tenantId });
    if (!actor) return null;
    const body = readBody(request);
    try {
      const result = await executeBrokerRequest(db, kek, params.tenantId, actor, {
        method: typeof body.method === "string" ? body.method : "GET",
        url: typeof body.url === "string" ? body.url : "",
        headers: typeof body.headers === "object" && body.headers && !Array.isArray(body.headers)
          ? Object.fromEntries(Object.entries(body.headers as Record<string, unknown>).map(([key, value]) => [key, String(value)]))
          : {},
        ...(typeof body.body === "string" ? { body: body.body } : {}),
      });
      const actorMeta = requestActor(actor);
      const secretName = parseTemplateTokens([
        typeof body.url === "string" ? body.url : "",
        JSON.stringify(body.headers ?? {}),
        typeof body.body === "string" ? body.body : "",
      ].join(" "))[0];
      db.appendAudit({
        tenantId: params.tenantId,
        actorType: actorMeta.actorType,
        actorId: actorMeta.actorId,
        action: "broker.http",
        ...(secretName ? { secretName } : {}),
        status: "success",
        detail: `${String(body.method ?? "GET").toUpperCase()} ${redactInlineSecrets(String(body.url ?? ""))}`,
      });
      return result;
    } catch (error) {
      const actorMeta = requestActor(actor);
      db.appendAudit({
        tenantId: params.tenantId,
        actorType: actorMeta.actorType,
        actorId: actorMeta.actorId,
        action: "broker.http",
        status: "error",
        detail: error instanceof Error ? error.message : String(error),
      });
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/v1/tenants/:tenantId/secrets/:secretName/actions/:actionId", async (request, reply) => {
    const params = request.params as { tenantId: string; secretName: string; actionId: string };
    const actor = await requireActor(request, reply, auth, db, { tenantId: params.tenantId });
    if (!actor) return null;
    const metadata = db.getSecretMetadata(params.tenantId, params.secretName);
    if (!metadata) return await reply.code(404).send({ error: "Not found" });
    try {
      const secretValue = db.readSecretValue(params.tenantId, params.secretName, kek);
      if (!secretValue) {
        return await reply.code(404).send({ error: "Secret not found." });
      }
      const brokerInput = buildTypedActionBrokerRequest(metadata, secretValue, params.actionId);
      if (!assertSecretAccess(db, actor, params.tenantId, params.secretName, brokerInput.action.capability)) {
        return await reply.code(403).send({ error: "Forbidden" });
      }
      const result = await executeBrokerRequest(db, kek, params.tenantId, actor, {
        method: brokerInput.method,
        url: brokerInput.url,
        headers: brokerInput.headers,
        ...(brokerInput.body ? { body: brokerInput.body } : {}),
      });
      const actorMeta = requestActor(actor);
      db.appendAudit({
        tenantId: params.tenantId,
        actorType: actorMeta.actorType,
        actorId: actorMeta.actorId,
        action: `broker.action.${params.actionId}`,
        secretName: params.secretName,
        status: "success",
        detail: brokerInput.action.label,
      });
      return {
        action: brokerInput.action,
        result,
      };
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/v1/tenants/:tenantId/leases", async (request, reply) => {
    const params = request.params as { tenantId: string };
    const actor = await requireActor(request, reply, auth, db, { tenantId: params.tenantId });
    if (!actor) return null;
    const actorMeta = requestActor(actor);
    const body = readBody(request);
    const secretName = typeof body.secretName === "string" ? body.secretName.trim() : "";
    const capability = typeof body.capability === "string" ? body.capability as VaultCapability : null;
    const mode = typeof body.mode === "string" ? body.mode as VaultLeaseMode : null;
    const ttlSec = typeof body.ttlSec === "number" ? body.ttlSec : 60;
    if (!secretName || !capability || !mode) return await reply.code(400).send({ error: "secretName, capability, and mode are required." });
    if (!assertSecretAccess(db, actor, params.tenantId, secretName, capability)) {
      return await reply.code(403).send({ error: "Forbidden" });
    }
    const metadata = db.getSecretMetadata(params.tenantId, secretName);
    if (!metadata || !metadata.leaseModes.includes(mode)) {
      return await reply.code(400).send({ error: "Lease mode is not allowed for this secret." });
    }
    const lease = db.createLease({
      tenantId: params.tenantId,
      secretName,
      capability,
      mode,
      ttlSec,
      actor: actorMeta,
      metadata: typeof body.metadata === "object" && body.metadata && !Array.isArray(body.metadata) ? body.metadata as Record<string, unknown> : {},
    });
    db.appendAudit({
      tenantId: params.tenantId,
      actorType: actorMeta.actorType,
      actorId: actorMeta.actorId,
      action: "lease.create",
      secretName,
      status: "success",
      detail: `${mode} ${capability}`,
    });
    return await reply.code(201).send({ lease });
  });

  app.get("/v1/tenants/:tenantId/leases", async (request, reply) => {
    const params = request.params as { tenantId: string };
    const actor = await requireActor(request, reply, auth, db, { tenantId: params.tenantId });
    if (!actor) return null;
    return { leases: db.listLeases(params.tenantId) };
  });

  app.post("/v1/tenants/:tenantId/leases/:leaseId/consume", async (request, reply) => {
    const params = request.params as { tenantId: string; leaseId: string };
    const actor = await requireActor(request, reply, auth, db, {
      tenantId: params.tenantId,
      principalTypes: ["sidecar_principal"],
    });
    if (!actor) return null;
    const body = readBody(request);
    const token = typeof body.token === "string" ? body.token : "";
    const lease = db.consumeLease(params.tenantId, params.leaseId, token);
    if (!lease) return await reply.code(404).send({ error: "Lease not found or no longer valid." });
    const secretValue = db.readSecretValue(params.tenantId, lease.secretName, kek);
    if (!secretValue) return await reply.code(404).send({ error: "Secret not found." });
    const actorMeta = requestActor(actor);
    db.appendAudit({
      tenantId: params.tenantId,
      actorType: actorMeta.actorType,
      actorId: actorMeta.actorId,
      action: "lease.consume",
      secretName: lease.secretName,
      status: "success",
      detail: `${lease.mode} ${lease.capability}`,
    });
    return {
      secretName: lease.secretName,
      mode: lease.mode,
      capability: lease.capability,
      secretValue,
    };
  });

  app.post("/v1/tenants/:tenantId/leases/:leaseId/revoke", async (request, reply) => {
    const params = request.params as { tenantId: string; leaseId: string };
    const actor = await requireActor(request, reply, auth, db, { tenantId: params.tenantId });
    if (!actor) return null;
    const ok = db.revokeLease(params.tenantId, params.leaseId);
    if (!ok) return await reply.code(404).send({ error: "Not found" });
    const actorMeta = requestActor(actor);
    db.appendAudit({
      tenantId: params.tenantId,
      actorType: actorMeta.actorType,
      actorId: actorMeta.actorId,
      action: "lease.revoke",
      status: "success",
      detail: params.leaseId,
    });
    return { ok: true };
  });

  app.get("/v1/tenants/:tenantId/audit", async (request, reply) => {
    const params = request.params as { tenantId: string };
    const actor = await requireActor(request, reply, auth, db, { tenantId: params.tenantId });
    if (!actor) return null;
    return { events: db.listAudit(params.tenantId) };
  });

  return { app, db };
}
