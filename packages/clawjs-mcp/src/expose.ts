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
  ];
}
