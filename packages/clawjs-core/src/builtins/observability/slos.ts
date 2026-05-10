import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SLOS: BuiltinCollectionDefinition = {
  name: "slos",
  displayName: "SLOs",
  family: "observability",
  aliases: ["slo","slos"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "name", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "targetPercent", type: "number" },
    { name: "warningPercent", type: "number" },
    { name: "timeWindow", type: "select", options: ["rolling_7d","rolling_30d","rolling_90d","calendar_week","calendar_month","calendar_quarter"] },
    { name: "monitorIds", type: "json" },
    { name: "goodEventQuery", type: "text" },
    { name: "totalEventQuery", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "slos_company_idx", fields: ["companyId"] },
  ],
};
