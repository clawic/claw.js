import type { BuiltinCollectionDefinition } from "../_types.ts";

export const FUNNEL_RUNS: BuiltinCollectionDefinition = {
  name: "funnel_runs",
  displayName: "Funnel Runs",
  family: "analytics",
  aliases: ["funnel_run","funnel_runs"],
  fields: [
    { name: "funnelId", type: "relation", required: true, relation: { collectionName: "funnels" } },
    { name: "periodStart", type: "date" },
    { name: "periodEnd", type: "date" },
    { name: "stepCounts", type: "json" },
    { name: "conversionRate", type: "number" },
    { name: "computedAt", type: "date" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "funnel_runs_funnel_idx", fields: ["funnelId"] },
  ],
};
