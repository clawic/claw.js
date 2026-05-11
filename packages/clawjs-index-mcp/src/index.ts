import { createInterface } from "node:readline";
import { Writable } from "node:stream";

import { IndexApiClient } from "@clawjs/index";

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
  handler: (params: Record<string, unknown>) => Promise<unknown>;
}

function buildTools(client: IndexApiClient): ToolDef[] {
  return [
    { name: "index.types.list", description: "List entity types known by Index (canonical + custom).", inputSchema: { type: "object", properties: {} }, handler: async () => client.listTypes() },
    { name: "index.types.declare", description: "Declare or update a custom entity type with JSON Schema, identity fields and timeseries fields.", inputSchema: { type: "object", required: ["name", "schema", "identityFields"], properties: { name: { type: "string" }, schema: { type: "object" }, identityFields: { type: "array", items: { type: "string" } }, timeseriesFields: { type: "array", items: { type: "string" } }, uiHints: { type: "object" } } }, handler: async (p) => client.declareType(p) },
    { name: "index.entities.upsert", description: "Insert or update an entity. Returns {entityId, isNew, changedFields, entity}.", inputSchema: { type: "object", required: ["type", "data"], properties: { type: { type: "string" }, data: { type: "object" }, sourceUrl: { type: "string" }, observedAt: { type: "string" }, runId: { type: "string" }, agentSessionId: { type: "string" } } }, handler: async (p) => client.upsertEntity(p) },
    { name: "index.entities.get", description: "Get one entity, its observations, relations and tags.", inputSchema: { type: "object", required: ["entityId"], properties: { entityId: { type: "string" } } }, handler: async (p) => client.getEntity(p.entityId as string) },
    { name: "index.entities.query", description: "Query entities by type, predicates, tags or collection.", inputSchema: { type: "object", properties: { type: { type: "string" }, where: { type: "object" }, orderBy: { type: "object" }, limit: { type: "integer" }, offset: { type: "integer" }, tagIds: { type: "array", items: { type: "string" } }, collectionId: { type: "string" } } }, handler: async (p) => client.queryEntities(p) },
    { name: "index.entities.search", description: "Full-text search across entity payloads (FTS5).", inputSchema: { type: "object", required: ["fullText"], properties: { fullText: { type: "string" }, type: { type: "string" }, limit: { type: "integer" } } }, handler: async (p) => client.searchEntities(p) },
    { name: "index.entities.history", description: "Read the timeseries values for a specific field on an entity.", inputSchema: { type: "object", required: ["entityId", "field"], properties: { entityId: { type: "string" }, field: { type: "string" } } }, handler: async (p) => client.getHistory(p.entityId as string, p.field as string) },
    { name: "index.searches.create", description: "Persist a saved Search (name + criteria + prompt template).", inputSchema: { type: "object", required: ["name"], properties: { name: { type: "string" }, type: { type: "string" }, criteria: { type: "object" }, promptTemplate: { type: "string" } } }, handler: async (p) => client.createSearch(p) },
    { name: "index.searches.run", description: "Trigger a manual Run of an existing Search.", inputSchema: { type: "object", required: ["searchId"], properties: { searchId: { type: "string" }, prompt: { type: "string" } } }, handler: async (p) => client.runSearch(p.searchId as string, p) },
    { name: "index.monitors.create", description: "Promote a Search into a recurring Monitor with cron and alert rules.", inputSchema: { type: "object", required: ["searchId", "cronExpr"], properties: { searchId: { type: "string" }, cronExpr: { type: "string" }, name: { type: "string" }, alertRules: { type: "array", items: { type: "object" } }, enabled: { type: "boolean" } } }, handler: async (p) => client.createMonitor(p) },
    { name: "index.monitors.fireNow", description: "Trigger a Monitor immediately, outside its schedule.", inputSchema: { type: "object", required: ["monitorId"], properties: { monitorId: { type: "string" } } }, handler: async (p) => client.fireMonitor(p.monitorId as string) },
    { name: "index.runs.get", description: "Inspect a Run, its captured entities and log.", inputSchema: { type: "object", required: ["runId"], properties: { runId: { type: "string" } } }, handler: async (p) => client.getRun(p.runId as string) },
    { name: "index.tags.apply", description: "Apply a tag to an entity by name (creates the tag if missing).", inputSchema: { type: "object", required: ["entityId", "name"], properties: { entityId: { type: "string" }, name: { type: "string" }, color: { type: "string" } } }, handler: async (p) => client.applyTag(p) },
    { name: "index.alerts.list", description: "List recent alerts (unacked first).", inputSchema: { type: "object", properties: {} }, handler: async () => client.listAlerts() },
  ];
}

function send(out: Writable, message: JsonRpcResponse | JsonRpcRequest): void {
  const payload = JSON.stringify(message);
  const header = `Content-Length: ${Buffer.byteLength(payload, "utf8")}\r\n\r\n`;
  out.write(header + payload);
}

export function runIndexMcpServer(opts: { baseUrl: string; token?: string }) {
  const client = new IndexApiClient(opts);
  const tools = buildTools(client);
  const toolMap = new Map(tools.map((t) => [t.name, t] as const));

  const respond = (id: JsonRpcRequest["id"], result?: unknown, error?: JsonRpcResponse["error"]) => {
    const response: JsonRpcResponse = { jsonrpc: "2.0", id: id ?? null };
    if (error) response.error = error; else response.result = result ?? null;
    send(process.stdout, response);
  };

  const handle = async (req: JsonRpcRequest) => {
    try {
      if (req.method === "initialize") {
        respond(req.id, { serverInfo: { name: "@clawjs/index-mcp", version: "0.1.2" }, protocolVersion: "2024-11-05", capabilities: { tools: { listChanged: false } } });
        return;
      }
      if (req.method === "tools/list") {
        respond(req.id, { tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
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

export default runIndexMcpServer;
