import {
  MAC_PERMISSION_CATALOG,
  MAC_PERMISSION_PACKS,
  buildMacActionPlan,
  clawMacControlPlaneRegistry,
  listMacAtlasCapabilities,
  macActionRequestSchema,
} from "@clawjs/core";

import type { MCPExposedTool } from "./types.ts";

/**
 * Default ClawJS surface exposed as MCP tools. Real implementations would route to
 * sessions/, memory/, user-model/, kanban/, etc. APIs. Tests and consumers can pass
 * their own list of tools via buildMCPApp options.
 */
export function defaultExposedTools(): MCPExposedTool[] {
  return [
    {
      name: "clawjs_ping",
      description: "Health-check tool exposed by ClawJS MCP server.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      handler: async () => ({ ok: true, service: "clawjs-mcp", at: new Date().toISOString() }),
    },
    {
      name: "clawjs_echo",
      description: "Echoes back its arguments. Useful to test MCP plumbing end-to-end.",
      inputSchema: {
        type: "object",
        properties: { message: { type: "string" } },
        required: ["message"],
        additionalProperties: false,
      },
      handler: async (args) => ({ echo: args.message }),
    },
    {
      name: "mac.plan",
      description: "Builds a governed Mac action plan without native execution.",
      inputSchema: {
        type: "object",
        properties: {
          request: { type: "object", additionalProperties: true },
        },
        additionalProperties: true,
      },
      handler: async (args) => {
        const request = macActionRequestSchema.parse(args.request ?? args);
        return buildMacActionPlan({ request });
      },
    },
    {
      name: "mac.permissions",
      description: "Lists central Mac permission packs and atomic permission ids.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      handler: async () => ({
        packs: MAC_PERMISSION_PACKS,
        permissions: MAC_PERMISSION_CATALOG,
      }),
    },
    {
      name: "mac.audit",
      description: "Reports where Mac action audit is available.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      handler: async () => ({ status: "host_required", reason: "Mac action audit lives in the signed host operational store." }),
    },
    {
      name: "mac.execute",
      description: "Fails closed unless routed through the active signed host Mac Action Broker.",
      inputSchema: {
        type: "object",
        properties: {
          request: { type: "object", additionalProperties: true },
        },
        additionalProperties: true,
      },
      handler: async (args) => {
        const request = macActionRequestSchema.parse(args.request ?? args);
        const plan = buildMacActionPlan({ request });
        return {
          status: "signed_host_required",
          plan,
          reason: "MCP cannot execute native Mac actions directly; it must hand this plan to the signed host broker.",
        };
      },
    },
    {
      name: "mac.revert",
      description: "Plans a Mac action revert boundary without executing native state changes.",
      inputSchema: {
        type: "object",
        properties: { receiptId: { type: "string" } },
        required: ["receiptId"],
        additionalProperties: false,
      },
      handler: async (args) => ({
        status: "plan_required",
        receiptId: args.receiptId,
        revertContract: "Revert always plans first and only executes after explicit confirmation in the signed host.",
      }),
    },
    {
      name: "mac.coverage",
      description: "Returns the Mac Control Plane atlas and coverage summary.",
      inputSchema: {
        type: "object",
        properties: { family: { type: "string" } },
        additionalProperties: false,
      },
      handler: async (args) => {
        const family = typeof args.family === "string" ? args.family : undefined;
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
      },
    },
  ];
}
