import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ACCOUNTS: BuiltinCollectionDefinition = {
  name: "accounts",
  displayName: "Accounts (B2B)",
  family: "crm",
  aliases: ["account","accounts"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "name", type: "text", required: true, aliases: ["accountName"] },
    { name: "domain", type: "text" },
    { name: "industry", type: "text" },
    { name: "employeeCount", type: "number" },
    { name: "annualRevenue", type: "number" },
    { name: "website", type: "text" },
    { name: "taxId", type: "text" },
    { name: "phone", type: "text" },
    { name: "address", type: "json" },
    { name: "ownerActorId", type: "relation", relation: { collectionName: "actors" } },
    { name: "properties", type: "json" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "accounts_company_idx", fields: ["companyId"] },
    { name: "accounts_domain_idx", fields: ["domain"] },
  ],
};
