import type { BuiltinCollectionDefinition } from "../_types.ts";

export const INSIGHT_DEFINITIONS: BuiltinCollectionDefinition = {
  name: "insight_definitions",
  displayName: "Insight Definitions",
  family: "analytics",
  aliases: ["insight","insights","insight_definition","insight_definitions"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "name", type: "text", required: true },
    { name: "kind", type: "select", required: true, options: ["issue_count","cycle_time","lead_time","triage_time","issue_age","effort","custom_event","mrr","churn","retention","funnel","deal_value"] },
    { name: "dimensions", type: "json" },
    { name: "visualization", type: "select", options: ["bar","line","scatter","burnup","burndown","table","single_value","pie","area","heatmap"] },
    { name: "filters", type: "json" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "insight_def_company_idx", fields: ["companyId"] },
    { name: "insight_def_kind_idx", fields: ["kind"] },
  ],
};
