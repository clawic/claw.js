import type { BuiltinCollectionDefinition } from "../_types.ts";

export const RETENTION_ANALYSES: BuiltinCollectionDefinition = {
  name: "retention_analyses",
  displayName: "Retention Analyses",
  family: "analytics",
  aliases: ["retention","retention_analysis","retention_analyses"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "name", type: "text" },
    { name: "cohortDefinition", type: "json" },
    { name: "returningEvent", type: "text" },
    { name: "targetEvent", type: "text" },
    { name: "periodKind", type: "select", options: ["day","week","month"] },
    { name: "matrix", type: "json" },
    { name: "computedAt", type: "date" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "retention_company_idx", fields: ["companyId"] },
  ],
};
