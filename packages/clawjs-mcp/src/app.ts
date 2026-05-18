import {
  MAC_PERMISSION_CATALOG,
  MAC_PERMISSION_PACKS,
  buildMacActionPlan,
  clawApiPath,
  clawMacControlPlaneRegistry,
  listMacAtlasCapabilities,
  macActionRequestSchema,
} from "@clawjs/core";
import fs from "node:fs";

import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";

import { MCPProtocolClient } from "./client.ts";
import { loadMCPConfig, type MCPServiceConfig } from "./config.ts";
import { assertMCPToolControlPlane } from "./control-plane.ts";
import { defaultExposedTools } from "./expose.ts";
import { createMacSignedHostBridge, type MacSignedHostBridge } from "./mac-signed-host-bridge.ts";
import { MCPServiceStore } from "./store.ts";
import type {
  MCPExposedTool,
  MCPToolCallInput,
  RegisterMCPServerInput,
} from "./types.ts";

export interface BuildMCPAppOptions {
  config?: Partial<MCPServiceConfig>;
  exposedTools?: MCPExposedTool[];
  protocolFetch?: typeof fetch;
  macSignedHostBridge?: MacSignedHostBridge | null;
}

function parseBearer(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

function requireSecret(request: FastifyRequest, reply: FastifyReply, secret: string): boolean {
  const token = parseBearer(request);
  if (token !== secret) { void reply.code(401).send({ error: "Unauthorized" }); return false; }
  return true;
}

function readBody(request: FastifyRequest): Record<string, unknown> {
  return ((request.body ?? {}) as Record<string, unknown>);
}

function readQuery(request: FastifyRequest): Record<string, string> {
  return ((request.query ?? {}) as Record<string, string>);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function macCoveragePayload(family?: string) {
  const capabilities = listMacAtlasCapabilities(family ? { family } : {});
  return {
    registryVersion: clawMacControlPlaneRegistry.version,
    family: family ?? null,
    capabilities,
    coverage: capabilities.reduce<Record<string, number>>((summary, capability) => {
      summary[capability.coverageState] = (summary[capability.coverageState] ?? 0) + 1;
      return summary;
    }, {}),
  };
}

async function sendMacHostBridgeResult(reply: FastifyReply, promise: Promise<unknown>) {
  try {
    const result = await promise;
    if (result && typeof result === "object" && "ok" in result && (result as { ok?: unknown }).ok === false) {
      return await reply.code(409).send(result);
    }
    return result;
  } catch (error) {
    return await reply.code(502).send({
      status: "signed_host_unavailable",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function buildMCPApp(options: BuildMCPAppOptions = {}) {
  const config = loadMCPConfig(options.config);
  fs.mkdirSync(config.dataDir, { recursive: true });
  const app = Fastify({ logger: false, bodyLimit: 4 * 1024 * 1024 });
  const store = new MCPServiceStore(config.dbPath);
  const macSignedHostBridge = options.macSignedHostBridge === undefined
    ? createMacSignedHostBridge(config.liveBrokerCommand)
    : options.macSignedHostBridge;
  const exposed: MCPExposedTool[] = options.exposedTools ?? defaultExposedTools({ macSignedHostBridge });
  const exposedByName = new Map(exposed.map((tool) => [tool.name, tool]));

  app.addHook("onClose", async () => { store.close(); });

  app.get(clawApiPath("health"), async () => ({ ok: true, service: "mcp", host: config.host, port: config.port, exposedTools: exposed.map((tool) => tool.name) }));

  app.get(clawApiPath("mac/coverage"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const query = readQuery(request);
    return macCoveragePayload(asString(query.family));
  });

  app.post(clawApiPath("mac/plan"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const body = readBody(request);
    try {
      const actionRequest = macActionRequestSchema.parse(body.request ?? body);
      return buildMacActionPlan({ request: actionRequest });
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post(clawApiPath("mac/execute"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const body = readBody(request);
    try {
      const actionRequest = macActionRequestSchema.parse(body.request ?? body);
      const plan = buildMacActionPlan({ request: actionRequest });
      if (macSignedHostBridge) return await sendMacHostBridgeResult(reply, macSignedHostBridge.execute(actionRequest));
      return await reply.code(409).send({
        status: "signed_host_required",
        plan,
        reason: "HTTP API cannot execute native Mac actions directly; route this plan to the active signed host broker.",
      });
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post(clawApiPath("mac/revert"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const body = readBody(request);
    const receiptId = asString(body.receiptId);
    if (!receiptId?.startsWith("macact_")) return await reply.code(400).send({ error: "receiptId macact_<id> is required" });
    if (macSignedHostBridge) return await sendMacHostBridgeResult(reply, macSignedHostBridge.revert(receiptId));
    return await reply.code(409).send({
      status: "signed_host_required",
      receiptId,
      revertContract: "Revert always plans first and only executes after explicit confirmation in the signed host.",
    });
  });

  app.get(clawApiPath("mac/audit"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    if (macSignedHostBridge) return await sendMacHostBridgeResult(reply, macSignedHostBridge.audit());
    return await reply.code(409).send({ status: "host_required", reason: "Mac action audit lives in the signed host operational store." });
  });

  app.get(clawApiPath("mac/permissions"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    if (macSignedHostBridge) return await sendMacHostBridgeResult(reply, macSignedHostBridge.permissions());
    return {
      packs: MAC_PERMISSION_PACKS,
      permissions: MAC_PERMISSION_CATALOG,
    };
  });

  app.post(clawApiPath("mac/permissions/request"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const body = readBody(request);
    const permissionId = asString(body.permissionId ?? body.permission_id ?? body.id ?? body.permission);
    if (!permissionId?.startsWith("mac.permission.")) return await reply.code(400).send({ error: "permissionId mac.permission.<id> is required" });
    const confirm = body.confirm === true || body.approved === true;
    if (macSignedHostBridge) {
      return await sendMacHostBridgeResult(reply, macSignedHostBridge.permissions({ command: "request", permissionId, confirm }));
    }
    return await reply.code(409).send({
      status: "signed_host_required",
      permissionId,
      nativePrompt: "just_in_time_only",
      surprisePrompt: false,
      reason: "Permission prompts must be routed to the active signed host broker.",
    });
  });

  app.post(clawApiPath("mcp/servers"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const body = readBody(request);
    const input: RegisterMCPServerInput = {
      id: asString(body.id),
      name: String(body.name ?? ""),
      transport: body.transport as RegisterMCPServerInput["transport"],
      endpoint: String(body.endpoint ?? ""),
      env: (body.env as Record<string, string> | null) ?? null,
      enabled: body.enabled === false ? false : true,
    };
    if (!input.name || !input.transport || !input.endpoint) {
      return await reply.code(400).send({ error: "name, transport, endpoint are required" });
    }
    return store.registerServer(input);
  });

  app.get(clawApiPath("mcp/servers"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    return { items: store.listServers() };
  });

  app.delete(clawApiPath("mcp/servers/:id"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    return { deleted: store.removeServer(params.id) };
  });

  app.post(clawApiPath("mcp/servers/:id/refresh"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    const server = store.getServer(params.id);
    if (!server) return await reply.code(404).send({ error: "server_not_found" });
    if (server.transport === "stdio") {
      store.recordHealth(server.id, false);
      return await reply.code(501).send({ error: "stdio transport refresh not implemented in this build" });
    }
    const protocol = new MCPProtocolClient({ server, fetchImpl: options.protocolFetch });
    try {
      const capabilities = await protocol.initialize();
      const tools = await protocol.listTools();
      store.clearToolsForServer(server.id);
      for (const tool of tools) {
        store.upsertTool(server.id, {
          name: tool.name,
          description: tool.description ?? null,
          inputSchema: tool.inputSchema ?? null,
          prefix: server.name,
        });
      }
      store.recordHealth(server.id, true, capabilities.capabilities ?? null);
      return { tools, capabilities };
    } catch (error) {
      store.recordHealth(server.id, false);
      return await reply.code(502).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get(clawApiPath("mcp/tools"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const query = readQuery(request);
    return { items: store.listTools(asString(query.server)) };
  });

  app.post(clawApiPath("mcp/tools/call"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const body = readBody(request) as MCPToolCallInput;
    if (!body.prefixedName) return await reply.code(400).send({ error: "prefixedName is required" });
    const tool = store.findToolByPrefixedName(body.prefixedName);
    if (!tool) return await reply.code(404).send({ error: "tool_not_found" });
    const server = store.getServer(tool.serverId);
    if (!server) return await reply.code(404).send({ error: "server_not_found" });
    try {
      assertMCPToolControlPlane({ server, tool, controlPlane: body.controlPlane, agentPolicy: body.agentPolicy });
    } catch (error) {
      return await reply.code(403).send({ error: error instanceof Error ? error.message : String(error) });
    }
    const protocol = new MCPProtocolClient({ server, fetchImpl: options.protocolFetch });
    return await protocol.callTool(tool.toolName, body.args ?? {});
  });

  app.get(clawApiPath("mcp/expose/tools"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    return { items: exposed.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema })) };
  });

  app.post(clawApiPath("mcp/expose/rpc"), async (request, reply) => {
    const body = readBody(request) as { jsonrpc?: string; id?: number | string; method?: string; params?: Record<string, unknown> };
    if (body.jsonrpc !== "2.0" || !body.method) {
      return await reply.code(400).send({ jsonrpc: "2.0", id: body.id ?? null, error: { code: -32600, message: "invalid request" } });
    }
    if (body.method === "initialize") {
      return { jsonrpc: "2.0", id: body.id ?? null, result: { capabilities: { tools: {} }, serverInfo: { name: "clawjs-mcp", version: "0.1.0" } } };
    }
    if (body.method === "tools/list") {
      return {
        jsonrpc: "2.0",
        id: body.id ?? null,
        result: { tools: exposed.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema })) },
      };
    }
    if (body.method === "tools/call") {
      const params = (body.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
      const tool = params.name ? exposedByName.get(params.name) : undefined;
      if (!tool) {
        return await reply.code(404).send({ jsonrpc: "2.0", id: body.id ?? null, error: { code: -32601, message: `tool_not_found:${params.name}` } });
      }
      try {
        const content = await tool.handler(params.arguments ?? {});
        return { jsonrpc: "2.0", id: body.id ?? null, result: { content } };
      } catch (error) {
        return await reply.code(500).send({ jsonrpc: "2.0", id: body.id ?? null, error: { code: -32000, message: error instanceof Error ? error.message : String(error) } });
      }
    }
    return await reply.code(400).send({ jsonrpc: "2.0", id: body.id ?? null, error: { code: -32601, message: `method_not_supported:${body.method}` } });
  });

  return { app, config, store, exposed };
}
