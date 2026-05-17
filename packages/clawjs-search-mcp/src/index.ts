import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";

import { SearchStore, type SearchAuditEventType, type SearchProfileId, type SearchQueryInput } from "@clawjs/search";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (params: Record<string, unknown>) => Promise<unknown> | unknown;
}

export interface SearchMcpServerOptions {
  dbPath?: string;
  dataDir?: string;
}

function buildTools(store: SearchStore): ToolDef[] {
  return [
    {
      name: "search.query",
      description: "Query the local @clawjs/search sidecar index.",
      inputSchema: {
        type: "object",
        required: ["query"],
        properties: {
          query: { type: "string" },
          domains: { type: "array", items: { type: "string" } },
          sources: { type: "array", items: { type: "string" } },
          shards: { type: "array", items: { type: "string" } },
          strategy: { type: "string", enum: ["lexical", "semantic", "hybrid"] },
          embedding: {
            type: "object",
            required: ["model", "vector"],
            properties: {
              model: { type: "string" },
              vector: { type: "array", items: { type: "number" } },
            },
          },
          profile: { type: "string", enum: ["framework", "full"] },
          limit: { type: "integer" },
          filters: { type: "object" },
          explain: { type: "boolean" },
          actor: { type: "string" },
          surface: { type: "string" },
        },
      },
      handler: (p) => store.query(searchQueryFromParams(p)),
    },
    { name: "search.sources.list", description: "List Search source manifests.", inputSchema: { type: "object", properties: { profile: { type: "string", enum: ["framework", "full"] } } }, handler: (p) => store.listSources(searchProfile(p.profile)) },
    { name: "search.status", description: "List Search source status rows.", inputSchema: { type: "object", properties: {} }, handler: () => store.sourceStatus() },
    { name: "search.actions.list", description: "List actions attached to one Search result.", inputSchema: { type: "object", required: ["resultId"], properties: { resultId: { type: "string" } } }, handler: (p) => store.actionsForResult(requiredString(p, "resultId")) },
    { name: "search.saved.list", description: "List saved searches.", inputSchema: { type: "object", properties: {} }, handler: () => store.listSavedSearches() },
    {
      name: "search.saved.create",
      description: "Create or update a saved search.",
      inputSchema: { type: "object", required: ["id", "query"], properties: { id: { type: "string" }, name: { type: "string" }, query: { type: "string" }, profile: { type: "string", enum: ["framework", "full"] } } },
      handler: (p) => {
        const id = requiredString(p, "id");
        store.saveSearch({ id, name: stringParam(p.name) ?? id, query: { query: requiredString(p, "query"), profile: searchProfile(p.profile) } });
        return store.listSavedSearches().find((item) => item.id === id) ?? null;
      },
    },
    { name: "search.monitors.list", description: "List Search monitors.", inputSchema: { type: "object", properties: {} }, handler: () => store.listMonitors() },
    {
      name: "search.monitors.create",
      description: "Create or update a Search monitor for a saved search.",
      inputSchema: { type: "object", required: ["id", "savedSearchId"], properties: { id: { type: "string" }, savedSearchId: { type: "string" }, name: { type: "string" }, cadence: { type: "string" }, enabled: { type: "boolean" } } },
      handler: (p) => {
        const id = requiredString(p, "id");
        store.saveMonitor({ id, savedSearchId: requiredString(p, "savedSearchId"), name: stringParam(p.name), cadence: stringParam(p.cadence), enabled: typeof p.enabled === "boolean" ? p.enabled : true });
        return store.listMonitors().find((item) => item.id === id) ?? null;
      },
    },
    { name: "search.audit.list", description: "List Search audit events for actions and sensitive queries.", inputSchema: { type: "object", properties: { limit: { type: "integer" }, type: { type: "string", enum: ["action", "sensitive_query"] } } }, handler: (p) => store.listAuditEvents({ limit: numberParam(p.limit), type: searchAuditType(p.type) }) },
  ];
}

function send(out: Writable, message: JsonRpcResponse | JsonRpcRequest): void {
  const payload = JSON.stringify(message);
  const header = `Content-Length: ${Buffer.byteLength(payload, "utf8")}\r\n\r\n`;
  out.write(header + payload);
}

export function runSearchMcpServer(opts: SearchMcpServerOptions = {}) {
  const store = new SearchStore(resolveSearchDbPath(opts));
  const tools = buildTools(store);
  const toolMap = new Map(tools.map((tool) => [tool.name, tool] as const));

  const respond = (id: JsonRpcRequest["id"], result?: unknown, error?: JsonRpcResponse["error"]) => {
    const response: JsonRpcResponse = { jsonrpc: "2.0", id: id ?? null };
    if (error) response.error = error; else response.result = result ?? null;
    send(process.stdout, response);
  };

  const handle = async (req: JsonRpcRequest) => {
    try {
      if (req.method === "initialize") {
        respond(req.id, { serverInfo: { name: "@clawjs/search-mcp", version: "0.1.2" }, protocolVersion: "2024-11-05", capabilities: { tools: { listChanged: false } } });
        return;
      }
      if (req.method === "tools/list") {
        respond(req.id, { tools: tools.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema })) });
        return;
      }
      if (req.method === "tools/call") {
        const params = (req.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
        const tool = params.name ? toolMap.get(params.name) : null;
        if (!tool) { respond(req.id, undefined, { code: -32601, message: `unknown tool ${params.name}` }); return; }
        const result = await tool.handler(params.arguments ?? {});
        respond(req.id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], isError: false });
        return;
      }
      if (req.method === "notifications/initialized") return;
      respond(req.id, undefined, { code: -32601, message: `method ${req.method} not supported` });
    } catch (error) {
      respond(req.id, undefined, { code: -32000, message: error instanceof Error ? error.message : String(error) });
    }
  };

  let buffer = Buffer.alloc(0);
  process.stdin.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) break;
      const header = buffer.subarray(0, headerEnd).toString();
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) { buffer = buffer.subarray(headerEnd + 4); continue; }
      const length = Number(match[1]);
      const total = headerEnd + 4 + length;
      if (buffer.length < total) break;
      const body = buffer.subarray(headerEnd + 4, total).toString("utf8");
      buffer = buffer.subarray(total);
      try { handle(JSON.parse(body) as JsonRpcRequest).catch(() => undefined); } catch { /* ignore */ }
    }
  });

  const rl = createInterface({ input: process.stdin });
  rl.on("line", (line) => {
    if (!line.startsWith("{")) return;
    try { handle(JSON.parse(line) as JsonRpcRequest).catch(() => undefined); } catch { /* ignore */ }
  });
}

export default function runDefaultSearchMcpServer(opts: SearchMcpServerOptions = {}): void {
  runSearchMcpServer(opts);
}

function resolveSearchDbPath(opts: SearchMcpServerOptions): string {
  if (opts.dbPath) return path.resolve(opts.dbPath);
  if (process.env.CLAW_SEARCH_DB_PATH) return path.resolve(process.env.CLAW_SEARCH_DB_PATH);
  const dataDir = opts.dataDir ?? process.env.CLAW_DATA_DIR ?? path.join(os.homedir(), ".claw", "data");
  fs.mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, "search.sqlite");
}

function searchQueryFromParams(params: Record<string, unknown>): SearchQueryInput {
  return {
    query: requiredString(params, "query"),
    domains: stringArrayParam(params.domains),
    sources: stringArrayParam(params.sources),
    shards: stringArrayParam(params.shards),
    strategy: searchStrategy(params.strategy),
    embedding: searchEmbedding(params.embedding),
    profile: searchProfile(params.profile),
    limit: numberParam(params.limit),
    explain: typeof params.explain === "boolean" ? params.explain : undefined,
    actor: stringParam(params.actor),
    surface: stringParam(params.surface),
    filters: recordParam(params.filters),
  };
}

function searchProfile(value: unknown): SearchProfileId {
  return value === "full" ? "full" : "framework";
}

function searchStrategy(value: unknown): SearchQueryInput["strategy"] {
  return value === "semantic" || value === "hybrid" || value === "lexical" ? value : undefined;
}

function searchEmbedding(value: unknown): SearchQueryInput["embedding"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as { model?: unknown; vector?: unknown };
  if (typeof record.model !== "string" || !Array.isArray(record.vector)) return undefined;
  const vector = record.vector.filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry));
  return vector.length === record.vector.length && vector.length ? { model: record.model, vector } : undefined;
}

function searchAuditType(value: unknown): SearchAuditEventType | undefined {
  return value === "action" || value === "sensitive_query" ? value : undefined;
}

function requiredString(params: Record<string, unknown>, key: string): string {
  const value = stringParam(params[key]);
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function stringParam(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberParam(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringArrayParam(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries = value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim());
  return entries.length ? entries : undefined;
}

function recordParam(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
