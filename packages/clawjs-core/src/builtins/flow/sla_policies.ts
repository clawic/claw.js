import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SLA_POLICIES: BuiltinCollectionDefinition = {
  name: "sla_policies",
  displayName: "SLA Policies",
  family: "flow",
  aliases: ["sla","slas","sla_policy","sla_policies"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "teamId", type: "relation", relation: { collectionName: "teams" } },
    { name: "name", type: "text", required: true },
    { name: "filters", type: "json" },
    { name: "durationHours", type: "number", required: true },
    { name: "useBusinessDays", type: "boolean" },
    { name: "workingDays", type: "json" },
    { name: "workingHours", type: "json" },
    { name: "holidays", type: "json" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "sla_policies_company_idx", fields: ["companyId"] },
    { name: "sla_policies_team_idx", fields: ["teamId"] },
  ],
};
