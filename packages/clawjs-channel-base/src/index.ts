// @clawjs-persistent-surface-ddl-source
import { clawApiPath, resolveClawPersistentSurfacePath } from "@clawjs/core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import Database from "better-sqlite3";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";

export interface ChannelAccount {
  id: string;
  channel: string;
  name: string;
  credentialsRef: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: number;
  updatedAt: number;
}

export interface ChannelRouting {
  id: string;
  channel: string;
  accountId: string;
  targetId: string;
  agentId: string;
  createdAt: number;
}

export interface ChannelMessage {
  id: string;
  channel: string;
  accountId: string;
  targetId: string | null;
  direction: "inbound" | "outbound";
  role: "user" | "assistant" | "system";
  content: string;
  providerMessageId: string | null;
  providerStatus: string | null;
  senderId: string | null;
  senderLabel: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: number;
}

export interface CreateAccountInput {
  id?: string;
  name: string;
  credentialsRef?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AssignRoutingInput {
  id?: string;
  accountId: string;
  targetId: string;
  agentId: string;
}

export interface SendMessageInput {
  accountId: string;
  targetId: string;
  content: string;
  role?: "user" | "assistant" | "system";
  metadata?: Record<string, unknown> | null;
}

export interface InboundWebhookInput {
  accountId: string;
  targetId: string;
  content: string;
  providerMessageId?: string | null;
  senderId?: string | null;
  senderLabel?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ChannelTransport {
  /**
   * Deliver an outbound message via the platform-specific transport. Default `stub` transport
   * just records `delivered: stub` without making any external call. Real channels should
   * substitute this with platform SDK calls when credentials are configured.
   */
  send(input: { account: ChannelAccount; targetId: string; content: string; metadata?: Record<string, unknown> | null }): Promise<{
    providerMessageId: string | null;
    providerStatus: string;
    metadata?: Record<string, unknown> | null;
  }>;
}

export const stubChannelTransport: ChannelTransport = {
  async send() {
    return { providerMessageId: `stub_${randomUUID()}`, providerStatus: "stub_delivered", metadata: null };
  },
};

export interface ChannelServiceConfig {
  host: string;
  port: number;
  dbPath: string;
  dataDir: string;
  sharedSecret: string;
}

export function loadChannelConfig(channelName: string, overrides: Partial<ChannelServiceConfig> = {}): ChannelServiceConfig {
  const upper = channelName.toUpperCase().replace(/-/g, "_");
  const dataDir = overrides.dataDir ?? process.env[`${upper}_DATA_DIR`] ?? defaultClawjsDataRoot();
  return {
    host: overrides.host ?? process.env[`${upper}_HOST`] ?? "127.0.0.1",
    port: overrides.port ?? Number(process.env[`${upper}_PORT`] ?? process.env.PORT ?? "0"),
    dbPath: overrides.dbPath ?? process.env[`${upper}_DB_PATH`] ?? process.env.CLAW_DB_PATH ?? path.join(dataDir, "core.sqlite"),
    dataDir,
    sharedSecret: overrides.sharedSecret ?? process.env[`${upper}_SHARED_SECRET`] ?? `${channelName}-dev-secret-change-me`,
  };
}

function defaultClawjsDataRoot(): string {
  const explicit = process.env.CLAW_DATA_DIR;
  if (explicit) return expandHome(explicit);
  const home = process.env.CLAW_HOME ? expandHome(process.env.CLAW_HOME) : expandHome(resolveClawPersistentSurfacePath("claw.global.root"));
  return path.join(home, "data");
}

function expandHome(value: string): string {
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}

interface AccountRow {
  id: string; channel: string; name: string; credentials_ref: string | null;
  metadata_json: string | null; created_at: number; updated_at: number;
}
interface RoutingRow {
  id: string; channel: string; account_id: string; target_id: string; agent_id: string; created_at: number;
}
interface MessageRow {
  id: string; channel: string; account_id: string; target_id: string | null;
  direction: "inbound" | "outbound"; role: "user" | "assistant" | "system";
  content: string; provider_message_id: string | null; provider_status: string | null;
  sender_id: string | null; sender_label: string | null; metadata_json: string | null; created_at: number;
}

function parseJson<T>(value: string | null): T | null {
  if (value == null) return null;
  try { return JSON.parse(value) as T; } catch { return null; }
}

function rowToAccount(row: AccountRow): ChannelAccount {
  return {
    id: row.id, channel: row.channel, name: row.name,
    credentialsRef: row.credentials_ref,
    metadata: parseJson<Record<string, unknown>>(row.metadata_json),
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
function rowToRouting(row: RoutingRow): ChannelRouting {
  return { id: row.id, channel: row.channel, accountId: row.account_id, targetId: row.target_id, agentId: row.agent_id, createdAt: row.created_at };
}
function rowToMessage(row: MessageRow): ChannelMessage {
  return {
    id: row.id, channel: row.channel, accountId: row.account_id, targetId: row.target_id,
    direction: row.direction, role: row.role, content: row.content,
    providerMessageId: row.provider_message_id, providerStatus: row.provider_status,
    senderId: row.sender_id, senderLabel: row.sender_label,
    metadata: parseJson<Record<string, unknown>>(row.metadata_json),
    createdAt: row.created_at,
  };
}

const SCHEMA_TEMPLATE = `
  CREATE TABLE IF NOT EXISTS channel_accounts (
    id              TEXT PRIMARY KEY,
    channel         TEXT NOT NULL,
    name            TEXT NOT NULL UNIQUE,
    credentials_ref TEXT,
    metadata_json   TEXT,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_accounts_channel ON channel_accounts(channel);

  CREATE TABLE IF NOT EXISTS channel_routing (
    id          TEXT PRIMARY KEY,
    channel     TEXT NOT NULL,
    account_id  TEXT NOT NULL REFERENCES channel_accounts(id) ON DELETE CASCADE,
    target_id   TEXT NOT NULL,
    agent_id    TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    UNIQUE (account_id, target_id)
  );
  CREATE INDEX IF NOT EXISTS idx_routing_agent ON channel_routing(agent_id);

  CREATE TABLE IF NOT EXISTS channel_messages (
    id                  TEXT PRIMARY KEY,
    channel             TEXT NOT NULL,
    account_id          TEXT NOT NULL REFERENCES channel_accounts(id) ON DELETE CASCADE,
    target_id           TEXT,
    direction           TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
    role                TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
    content             TEXT NOT NULL,
    provider_message_id TEXT,
    provider_status     TEXT,
    sender_id           TEXT,
    sender_label        TEXT,
    metadata_json       TEXT,
    created_at          INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_account ON channel_messages(account_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_messages_target  ON channel_messages(account_id, target_id, created_at DESC);
`;

export class ChannelServiceStore {
  private readonly db: Database.Database;
  readonly channel: string;

  constructor(channel: string, dbPath: string) {
    this.channel = channel;
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(SCHEMA_TEMPLATE);
  }

  close(): void { this.db.close(); }

  createAccount(input: CreateAccountInput): ChannelAccount {
    const id = input.id ?? randomUUID();
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO channel_accounts (id, channel, name, credentials_ref, metadata_json, created_at, updated_at)
      VALUES (@id, @channel, @name, @credentials_ref, @metadata_json, @now, @now)
      ON CONFLICT(name) DO UPDATE SET
        credentials_ref = excluded.credentials_ref,
        metadata_json   = excluded.metadata_json,
        updated_at      = excluded.updated_at
    `).run({
      id, channel: this.channel, name: input.name,
      credentials_ref: input.credentialsRef ?? null,
      metadata_json: input.metadata ? JSON.stringify(input.metadata) : null,
      now,
    });
    const row = this.db.prepare("SELECT * FROM channel_accounts WHERE name = ? AND channel = ?").get(input.name, this.channel) as AccountRow;
    return rowToAccount(row);
  }

  listAccounts(): ChannelAccount[] {
    return (this.db.prepare("SELECT * FROM channel_accounts WHERE channel = ? ORDER BY created_at ASC").all(this.channel) as AccountRow[]).map(rowToAccount);
  }

  getAccount(id: string): ChannelAccount | null {
    const row = this.db.prepare("SELECT * FROM channel_accounts WHERE id = ? AND channel = ?").get(id, this.channel) as AccountRow | undefined;
    return row ? rowToAccount(row) : null;
  }

  deleteAccount(id: string): boolean {
    const info = this.db.prepare("DELETE FROM channel_accounts WHERE id = ? AND channel = ?").run(id, this.channel);
    return info.changes > 0;
  }

  assignRouting(input: AssignRoutingInput): ChannelRouting {
    const id = input.id ?? randomUUID();
    this.db.prepare(`
      INSERT INTO channel_routing (id, channel, account_id, target_id, agent_id, created_at)
      VALUES (@id, @channel, @account_id, @target_id, @agent_id, @now)
      ON CONFLICT(account_id, target_id) DO UPDATE SET
        agent_id   = excluded.agent_id,
        created_at = excluded.created_at
    `).run({
      id, channel: this.channel, account_id: input.accountId, target_id: input.targetId, agent_id: input.agentId, now: Date.now(),
    });
    const row = this.db.prepare("SELECT * FROM channel_routing WHERE account_id = ? AND target_id = ?").get(input.accountId, input.targetId) as RoutingRow;
    return rowToRouting(row);
  }

  listRouting(filter: { accountId?: string; agentId?: string } = {}): ChannelRouting[] {
    const conditions: string[] = ["channel = @channel"];
    const params: Record<string, unknown> = { channel: this.channel };
    if (filter.accountId) { conditions.push("account_id = @account_id"); params.account_id = filter.accountId; }
    if (filter.agentId) { conditions.push("agent_id = @agent_id"); params.agent_id = filter.agentId; }
    const rows = this.db.prepare(`SELECT * FROM channel_routing WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`).all(params) as RoutingRow[];
    return rows.map(rowToRouting);
  }

  unassignRouting(id: string): boolean {
    const info = this.db.prepare("DELETE FROM channel_routing WHERE id = ? AND channel = ?").run(id, this.channel);
    return info.changes > 0;
  }

  resolveAgent(accountId: string, targetId: string): string | null {
    const row = this.db.prepare("SELECT agent_id FROM channel_routing WHERE account_id = ? AND target_id = ?").get(accountId, targetId) as { agent_id: string } | undefined;
    return row?.agent_id ?? null;
  }

  insertMessage(input: {
    direction: "inbound" | "outbound";
    role: "user" | "assistant" | "system";
    accountId: string;
    targetId: string | null;
    content: string;
    providerMessageId?: string | null;
    providerStatus?: string | null;
    senderId?: string | null;
    senderLabel?: string | null;
    metadata?: Record<string, unknown> | null;
  }): ChannelMessage {
    const id = randomUUID();
    this.db.prepare(`
      INSERT INTO channel_messages (
        id, channel, account_id, target_id, direction, role, content,
        provider_message_id, provider_status, sender_id, sender_label, metadata_json, created_at
      ) VALUES (
        @id, @channel, @account_id, @target_id, @direction, @role, @content,
        @provider_message_id, @provider_status, @sender_id, @sender_label, @metadata_json, @now
      )
    `).run({
      id, channel: this.channel,
      account_id: input.accountId, target_id: input.targetId,
      direction: input.direction, role: input.role, content: input.content,
      provider_message_id: input.providerMessageId ?? null,
      provider_status: input.providerStatus ?? null,
      sender_id: input.senderId ?? null, sender_label: input.senderLabel ?? null,
      metadata_json: input.metadata ? JSON.stringify(input.metadata) : null,
      now: Date.now(),
    });
    return rowToMessage(this.db.prepare("SELECT * FROM channel_messages WHERE id = ?").get(id) as MessageRow);
  }

  listMessages(filter: { accountId?: string; targetId?: string; direction?: "inbound" | "outbound"; limit?: number } = {}): ChannelMessage[] {
    const conditions: string[] = ["channel = @channel"];
    const params: Record<string, unknown> = { channel: this.channel };
    if (filter.accountId) { conditions.push("account_id = @account_id"); params.account_id = filter.accountId; }
    if (filter.targetId) { conditions.push("target_id = @target_id"); params.target_id = filter.targetId; }
    if (filter.direction) { conditions.push("direction = @direction"); params.direction = filter.direction; }
    const limit = Math.min(filter.limit ?? 100, 1000);
    const rows = this.db.prepare(`SELECT * FROM channel_messages WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT ${limit}`).all(params) as MessageRow[];
    return rows.map(rowToMessage);
  }
}

export interface BuildChannelAppOptions {
  channel: string;
  config?: Partial<ChannelServiceConfig>;
  transport?: ChannelTransport;
  defaultPort?: number;
}

function parseBearer(request: FastifyRequest): string | null {
  const header = request.headers.authorization; if (!header) return null;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

function requireSecret(request: FastifyRequest, reply: FastifyReply, secret: string): boolean {
  const token = parseBearer(request);
  if (token !== secret) { void reply.code(401).send({ error: "Unauthorized" }); return false; }
  return true;
}

function readBody(request: FastifyRequest): Record<string, unknown> { return ((request.body ?? {}) as Record<string, unknown>); }
function readQuery(request: FastifyRequest): Record<string, string> { return ((request.query ?? {}) as Record<string, string>); }
function asString(value: unknown): string | undefined { return typeof value === "string" && value.length > 0 ? value : undefined; }
function asNumber(value: unknown): number | undefined { if (value === undefined || value === null || value === "") return undefined; const n = Number(value); return Number.isFinite(n) ? n : undefined; }

export interface BuiltChannelApp {
  app: FastifyInstance;
  config: ChannelServiceConfig;
  store: ChannelServiceStore;
}

export function buildChannelApp(options: BuildChannelAppOptions): BuiltChannelApp {
  const config = loadChannelConfig(options.channel, options.config);
  fs.mkdirSync(config.dataDir, { recursive: true });
  const app = Fastify({ logger: false, bodyLimit: 4 * 1024 * 1024 });
  const store = new ChannelServiceStore(options.channel, config.dbPath);
  const transport = options.transport ?? stubChannelTransport;

  app.addHook("onClose", async () => { store.close(); });

  app.get(clawApiPath("health"), async () => ({ ok: true, service: options.channel, host: config.host, port: config.port }));

  app.post(clawApiPath(`${options.channel}/accounts`), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const body = readBody(request);
    if (!asString(body.name)) return await reply.code(400).send({ error: "name is required" });
    return store.createAccount({
      id: asString(body.id),
      name: String(body.name),
      credentialsRef: (body.credentialsRef as string | null | undefined) ?? null,
      metadata: (body.metadata as Record<string, unknown> | null) ?? null,
    });
  });

  app.get(clawApiPath(`${options.channel}/accounts`), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    return { items: store.listAccounts() };
  });

  app.delete(clawApiPath(`${options.channel}/accounts/:id`), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    return { deleted: store.deleteAccount(params.id) };
  });

  app.post(clawApiPath(`${options.channel}/routing`), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const body = readBody(request);
    const accountId = asString(body.accountId);
    const targetId = asString(body.targetId);
    const agentId = asString(body.agentId);
    if (!accountId || !targetId || !agentId) return await reply.code(400).send({ error: "accountId, targetId, agentId required" });
    return store.assignRouting({ accountId, targetId, agentId, id: asString(body.id) });
  });

  app.get(clawApiPath(`${options.channel}/routing`), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const query = readQuery(request);
    return { items: store.listRouting({ accountId: asString(query.accountId), agentId: asString(query.agentId) }) };
  });

  app.delete(clawApiPath(`${options.channel}/routing/:id`), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    return { deleted: store.unassignRouting(params.id) };
  });

  app.post(clawApiPath(`${options.channel}/messages/send`), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const body = readBody(request);
    const accountId = asString(body.accountId);
    const targetId = asString(body.targetId);
    const content = asString(body.content);
    if (!accountId || !targetId || !content) return await reply.code(400).send({ error: "accountId, targetId, content required" });
    const account = store.getAccount(accountId);
    if (!account) return await reply.code(404).send({ error: "account_not_found" });
    const outcome = await transport.send({
      account,
      targetId,
      content,
      metadata: (body.metadata as Record<string, unknown> | null) ?? null,
    });
    return store.insertMessage({
      direction: "outbound",
      role: (body.role as "user" | "assistant" | "system" | undefined) ?? "assistant",
      accountId, targetId, content,
      providerMessageId: outcome.providerMessageId,
      providerStatus: outcome.providerStatus,
      metadata: outcome.metadata ?? ((body.metadata as Record<string, unknown> | null) ?? null),
    });
  });

  app.post(clawApiPath(`${options.channel}/webhooks/inbound`), async (request, reply) => {
    const body = readBody(request);
    const accountId = asString(body.accountId);
    const targetId = asString(body.targetId);
    const content = asString(body.content);
    if (!accountId || !targetId || !content) return await reply.code(400).send({ error: "accountId, targetId, content required" });
    const account = store.getAccount(accountId);
    if (!account) return await reply.code(404).send({ error: "account_not_found" });
    return store.insertMessage({
      direction: "inbound", role: "user",
      accountId, targetId, content,
      providerMessageId: (body.providerMessageId as string | null | undefined) ?? null,
      senderId: (body.senderId as string | null | undefined) ?? null,
      senderLabel: (body.senderLabel as string | null | undefined) ?? null,
      metadata: (body.metadata as Record<string, unknown> | null) ?? null,
    });
  });

  app.get(clawApiPath(`${options.channel}/messages`), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const query = readQuery(request);
    return { items: store.listMessages({
      accountId: asString(query.accountId),
      targetId: asString(query.targetId),
      direction: asString(query.direction) as "inbound" | "outbound" | undefined,
      limit: asNumber(query.limit),
    }) };
  });

  return { app, config, store };
}

export interface ChannelApiClientOptions {
  channel: string;
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
}

export class ChannelApiClient {
  readonly channel: string;
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ChannelApiClientOptions) {
    this.channel = options.channel;
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { authorization: `Bearer ${this.token}` };
    if (body !== undefined) headers["content-type"] = "application/json";
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) { const text = await response.text(); throw new Error(`${this.channel} api ${method} ${path} -> ${response.status}: ${text}`); }
    return (await response.json()) as T;
  }

  health(): Promise<{ ok: boolean; service: string }> { return this.call("GET", clawApiPath("health")); }
  createAccount(input: CreateAccountInput): Promise<ChannelAccount> { return this.call("POST", clawApiPath(`${this.channel}/accounts`), input); }
  listAccounts(): Promise<{ items: ChannelAccount[] }> { return this.call("GET", clawApiPath(`${this.channel}/accounts`)); }
  deleteAccount(id: string): Promise<{ deleted: boolean }> { return this.call("DELETE", clawApiPath(`${this.channel}/accounts/${encodeURIComponent(id)}`)); }
  assignRouting(input: AssignRoutingInput): Promise<ChannelRouting> { return this.call("POST", clawApiPath(`${this.channel}/routing`), input); }
  listRouting(filter: { accountId?: string; agentId?: string } = {}): Promise<{ items: ChannelRouting[] }> {
    const entries = Object.entries(filter).filter(([, value]) => value !== undefined && value !== null && value !== "");
    const query = entries.length ? `?${entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&")}` : "";
    return this.call("GET", clawApiPath(`${this.channel}/routing${query}`));
  }
  unassignRouting(id: string): Promise<{ deleted: boolean }> { return this.call("DELETE", clawApiPath(`${this.channel}/routing/${encodeURIComponent(id)}`)); }
  sendMessage(input: SendMessageInput): Promise<ChannelMessage> { return this.call("POST", clawApiPath(`${this.channel}/messages/send`), input); }
  inboundWebhook(input: InboundWebhookInput): Promise<ChannelMessage> { return this.call("POST", clawApiPath(`${this.channel}/webhooks/inbound`), input); }
  listMessages(filter: { accountId?: string; targetId?: string; direction?: "inbound" | "outbound"; limit?: number } = {}): Promise<{ items: ChannelMessage[] }> {
    const entries = Object.entries(filter).filter(([, value]) => value !== undefined && value !== null && value !== "");
    const query = entries.length ? `?${entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&")}` : "";
    return this.call("GET", clawApiPath(`${this.channel}/messages${query}`));
  }
}
