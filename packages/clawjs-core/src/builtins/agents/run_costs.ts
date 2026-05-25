import type { BuiltinCollectionDefinition } from "../_types.ts";

export const RUN_COSTS: BuiltinCollectionDefinition = {
  name: "run_costs",
  displayName: "Run Costs",
  family: "agents",
  aliases: ["run_cost","run_costs"],
  fields: [
    { name: "runId", type: "relation", required: true, relation: { collectionName: "agent_runs" } },
    { name: "model", type: "text" },
    { name: "inputTokens", type: "number" },
    { name: "outputTokens", type: "number" },
    { name: "cacheReadTokens", type: "number" },
    { name: "cacheWriteTokens", type: "number" },
    { name: "toolCalls", type: "number" },
    { name: "toolCallCostCents", type: "number" },
    { name: "inferenceCostCents", type: "number" },
    { name: "totalCostCents", type: "number" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "run_costs_run_idx", fields: ["runId"] },
  ],
};
