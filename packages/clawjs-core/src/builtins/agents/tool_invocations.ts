import type { BuiltinCollectionDefinition } from "../_types.ts";

export const TOOL_INVOCATIONS: BuiltinCollectionDefinition = {
  name: "tool_invocations",
  displayName: "Tool Invocations",
  family: "agents",
  aliases: ["tool_call","tool_calls","tool_invocation","tool_invocations"],
  fields: [
    { name: "runId", type: "relation", required: true, relation: { collectionName: "agent_runs" } },
    { name: "sessionId", type: "relation", relation: { collectionName: "agent_sessions" } },
    { name: "toolName", type: "text", required: true },
    { name: "argsJson", type: "json" },
    { name: "resultJson", type: "json" },
    { name: "durationMs", type: "number" },
    { name: "costTokens", type: "number" },
    { name: "status", type: "select", options: ["success","retry","fail","timeout","cancelled"] },
    { name: "errorMessage", type: "text" },
    { name: "index", type: "number" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "tool_inv_run_idx", fields: ["runId"] },
    { name: "tool_inv_name_idx", fields: ["toolName"] },
  ],
};
