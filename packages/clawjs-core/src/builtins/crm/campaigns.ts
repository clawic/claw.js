import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CAMPAIGNS: BuiltinCollectionDefinition = {
  name: "campaigns",
  displayName: "Campaigns",
  family: "crm",
  aliases: ["campaign","campaigns"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "name", type: "text", required: true },
    { name: "type", type: "select", options: ["email","event","ads","content","webinar","social","outbound","partnership","other"] },
    { name: "status", type: "select", options: ["planning","active","completed","canceled"] },
    { name: "budgetCents", type: "number" },
    { name: "startDate", type: "date" },
    { name: "endDate", type: "date" },
    { name: "goals", type: "json" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "campaigns_company_idx", fields: ["companyId"] },
    { name: "campaigns_status_idx", fields: ["status"] },
  ],
};
