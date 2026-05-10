import type { BuiltinCollectionDefinition } from "../_types.ts";

export const COHORTS: BuiltinCollectionDefinition = {
  name: "cohorts",
  displayName: "Cohorts",
  family: "analytics",
  aliases: ["cohort","cohorts"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "name", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "dynamic", type: "boolean" },
    { name: "criteria", type: "json" },
    { name: "memberCount", type: "number" },
    { name: "lastComputedAt", type: "date" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "cohorts_company_idx", fields: ["companyId"] },
  ],
};
