import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { FastifyRequest } from "fastify";

import { jsonParse, jsonStringify, now, type DB } from "./db/index.ts";
import { prefixedId } from "../shared/ids.ts";

export type AuthPrincipal =
  | { kind: "ephemeral_admin"; workspaceId: string | null }
  | { kind: "user"; userId: string; workspaceId: string | null; tokenId: string }
  | { kind: "service"; tokenId: string; workspaceId: string | null }
  | { kind: "share"; approvalId: string };

export interface TokenRecord {
  id: string;
  workspaceId: string | null;
  userId: string | null;
  name: string;
  scopes: string[];
  expiresAt: number | null;
  revokedAt: number | null;
  createdAt: number;
}

export class AuthService {
  private readonly tokenStorePath: string;
  private readonly hostManagedToken: boolean;
  private ephemeralToken: string;

  constructor(private readonly db: DB, tokenStorePath: string, ephemeralToken?: string | null) {
    this.tokenStorePath = tokenStorePath;
    this.hostManagedToken = Boolean(ephemeralToken);
    this.ephemeralToken = ephemeralToken && ephemeralToken.length >= 32
      ? ephemeralToken
      : this.loadOrCreateEphemeralToken();
  }

  private loadOrCreateEphemeralToken(): string {
    try {
      if (fs.existsSync(this.tokenStorePath)) {
        const raw = fs.readFileSync(this.tokenStorePath, "utf8").trim();
        if (raw) return raw;
      }
    } catch {
      // fall through, will regenerate
    }
    const token = `publishing_admin_${crypto.randomBytes(24).toString("hex")}`;
    fs.mkdirSync(path.dirname(this.tokenStorePath), { recursive: true });
    fs.writeFileSync(this.tokenStorePath, token, { mode: 0o600 });
    return token;
  }

  getEphemeralAdminToken(): string {
    return this.ephemeralToken;
  }

  rotateEphemeralAdminToken(): string {
    const token = `publishing_admin_${crypto.randomBytes(24).toString("hex")}`;
    if (!this.hostManagedToken) {
      fs.writeFileSync(this.tokenStorePath, token, { mode: 0o600 });
    }
    this.ephemeralToken = token;
    return token;
  }

  hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  createToken(input: {
    workspaceId: string | null;
    userId: string | null;
    name: string;
    scopes?: string[];
    expiresAt?: number | null;
  }): { id: string; secret: string; record: TokenRecord } {
    const id = prefixedId("tok");
    const secret = `publishing_${crypto.randomBytes(24).toString("hex")}`;
    const tokenHash = this.hashToken(secret);
    const createdAt = now();
    this.db
      .prepare(
        `INSERT INTO api_token (id, workspace_id, user_id, name, token_hash, scopes, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.workspaceId,
        input.userId,
        input.name,
        tokenHash,
        jsonStringify(input.scopes ?? []),
        input.expiresAt ?? null,
        createdAt,
      );
    return {
      id,
      secret,
      record: {
        id,
        workspaceId: input.workspaceId,
        userId: input.userId,
        name: input.name,
        scopes: input.scopes ?? [],
        expiresAt: input.expiresAt ?? null,
        revokedAt: null,
        createdAt,
      },
    };
  }

  revokeToken(id: string) {
    this.db.prepare(`UPDATE api_token SET revoked_at = ? WHERE id = ?`).run(now(), id);
  }

  listTokens(workspaceId: string | null): TokenRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, workspace_id, user_id, name, scopes, expires_at, revoked_at, created_at
         FROM api_token
         WHERE workspace_id IS ? OR workspace_id = ?
         ORDER BY created_at DESC`,
      )
      .all(workspaceId, workspaceId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r.id),
      workspaceId: (r.workspace_id as string) ?? null,
      userId: (r.user_id as string) ?? null,
      name: String(r.name),
      scopes: jsonParse<string[]>(r.scopes as string, []),
      expiresAt: (r.expires_at as number) ?? null,
      revokedAt: (r.revoked_at as number) ?? null,
      createdAt: Number(r.created_at),
    }));
  }

  resolvePrincipal(request: FastifyRequest): AuthPrincipal | null {
    const token = parseBearer(request);
    if (!token) return null;
    if (token === this.ephemeralToken) {
      const workspaceId = (request.headers["x-publishing-workspace"] as string | undefined) ?? null;
      return { kind: "ephemeral_admin", workspaceId };
    }
    const hash = this.hashToken(token);
    const row = this.db
      .prepare(
        `SELECT id, workspace_id, user_id, expires_at, revoked_at
         FROM api_token WHERE token_hash = ?`,
      )
      .get(hash) as Record<string, unknown> | undefined;
    if (!row) return null;
    if (row.revoked_at) return null;
    if (row.expires_at && Number(row.expires_at) < now()) return null;
    this.db.prepare(`UPDATE api_token SET last_used_at = ? WHERE id = ?`).run(now(), String(row.id));
    if (row.user_id) {
      return {
        kind: "user",
        userId: String(row.user_id),
        workspaceId: (row.workspace_id as string) ?? null,
        tokenId: String(row.id),
      };
    }
    return {
      kind: "service",
      tokenId: String(row.id),
      workspaceId: (row.workspace_id as string) ?? null,
    };
  }
}

function parseBearer(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (header) {
    const [scheme, value] = header.split(" ");
    if (scheme?.toLowerCase() === "bearer" && value) return value;
  }
  const rawUrl = request.raw.url ?? request.url;
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl, "http://127.0.0.1");
      const queryToken = parsed.searchParams.get("token");
      if (queryToken?.trim()) return queryToken;
    } catch {
      // ignore
    }
  }
  return null;
}
