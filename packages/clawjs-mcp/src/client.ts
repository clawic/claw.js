import { clawApiPath } from "@clawjs/core";
import type { MCPServerRecord, MCPToolCallResult } from "./types.ts";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface MCPProtocolClientOptions {
  server: MCPServerRecord;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Minimal MCP protocol client that speaks JSON-RPC 2.0 over HTTP. Real Anthropic MCP SDK
 * does much more (stdio streaming, SSE, notifications, etc.); for ClawJS framework purposes
 * we implement the request-response subset that covers `initialize`, `tools/list`, `tools/call`.
 */
export class MCPProtocolClient {
  private readonly options: MCPProtocolClientOptions;
  private readonly fetchImpl: typeof fetch;

  constructor(options: MCPProtocolClientOptions) {
    this.options = options;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async rpc<T>(method: string, params: unknown = {}): Promise<T> {
    if (this.options.server.transport !== "http" && this.options.server.transport !== "sse") {
      throw new Error(`MCPProtocolClient currently supports http/sse transport only (got ${this.options.server.transport})`);
    }
    const request: JsonRpcRequest = { jsonrpc: "2.0", id: Date.now(), method, params };
    const response = await this.fetchImpl(this.options.server.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      throw new Error(`mcp rpc ${method} -> ${response.status}: ${await response.text()}`);
    }
    const data = (await response.json()) as JsonRpcResponse;
    if (data.error) throw new Error(`mcp rpc ${method} error: ${data.error.message}`);
    return data.result as T;
  }

  async initialize(): Promise<{ capabilities: Record<string, unknown> }> {
    return await this.rpc("initialize", { protocolVersion: "0.1.0", clientInfo: { name: "clawjs-mcp", version: "0.1.0" } });
  }

  async listTools(): Promise<Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>> {
    const result = await this.rpc<{ tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }> }>("tools/list");
    return result.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolCallResult> {
    const startedAt = Date.now();
    try {
      const result = await this.rpc<{ content: unknown }>("tools/call", { name, arguments: args });
      return { ok: true, content: result.content, error: null, durationMs: Date.now() - startedAt };
    } catch (error) {
      return { ok: false, content: null, error: error instanceof Error ? error.message : String(error), durationMs: Date.now() - startedAt };
    }
  }
}

export interface MCPApiClientOptions {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
}

function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const entries: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    entries.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return entries.length ? `?${entries.join("&")}` : "";
}

export class MCPApiClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: MCPApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { authorization: `Bearer ${this.token}` };
    if (body !== undefined) headers["content-type"] = "application/json";
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`mcp api ${method} ${path} -> ${response.status}: ${text}`);
    }
    return (await response.json()) as T;
  }

  registerServer(input: {
    id?: string;
    name: string;
    transport: "stdio" | "http" | "sse";
    endpoint: string;
    env?: Record<string, string> | null;
    enabled?: boolean;
  }): Promise<MCPServerRecord> {
    return this.call("POST", clawApiPath("mcp/servers"), input);
  }

  listServers(): Promise<{ items: MCPServerRecord[] }> {
    return this.call("GET", clawApiPath("mcp/servers"));
  }

  removeServer(id: string): Promise<{ deleted: boolean }> {
    return this.call("DELETE", clawApiPath(`mcp/servers/${encodeURIComponent(id)}`));
  }

  refreshServer(id: string): Promise<{ tools: unknown[]; capabilities: unknown }> {
    return this.call("POST", clawApiPath(`mcp/servers/${encodeURIComponent(id)}/refresh`), {});
  }

  listTools(serverId?: string): Promise<{ items: unknown[] }> {
    return this.call("GET", clawApiPath(`mcp/tools${buildQuery({ server: serverId })}`));
  }

  callTool(prefixedName: string, args: Record<string, unknown>): Promise<MCPToolCallResult> {
    return this.call("POST", clawApiPath("mcp/tools/call"), { prefixedName, args });
  }

  exposed(): Promise<{ items: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> }> {
    return this.call("GET", clawApiPath("mcp/expose/tools"));
  }
}
