import type { BuiltinCollectionDefinition } from "../_types.ts";

export const MONITORS: BuiltinCollectionDefinition = {
  name: "monitors",
  displayName: "Monitors",
  family: "observability",
  aliases: ["monitor","monitors"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "name", type: "text", required: true },
    { name: "type", type: "select", options: ["metric","log","composite","synthetic","uptime","anomaly","rum"] },
    { name: "query", type: "json" },
    { name: "threshold", type: "json" },
    { name: "evaluationDelay", type: "number" },
    { name: "enabled", type: "boolean" },
    { name: "tags", type: "json" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "monitors_company_idx", fields: ["companyId"] },
    { name: "monitors_type_idx", fields: ["type"] },
  ],
};
