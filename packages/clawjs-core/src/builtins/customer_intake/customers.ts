import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CUSTOMERS: BuiltinCollectionDefinition = {
  name: "customers",
  displayName: "Customers",
  family: "customer_intake",
  aliases: ["customer","customers"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "name", type: "text", required: true },
    { name: "domain", type: "text" },
    { name: "email", type: "email" },
    { name: "externalIds", type: "json" },
    { name: "tierId", type: "relation", relation: { collectionName: "customer_tiers" } },
    { name: "revenue", type: "number" },
    { name: "employees", type: "number" },
    { name: "website", type: "text" },
    { name: "status", type: "select", options: ["prospect","customer","inactive","churned"] },
    { name: "ownerActorId", type: "relation", relation: { collectionName: "actors" } },
    { name: "lastActivityAt", type: "date" },
    { name: "approximateNeedCount", type: "number" },
    { name: "sourceMetadata", type: "json" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "customers_company_idx", fields: ["companyId"] },
    { name: "customers_domain_idx", fields: ["domain"] },
    { name: "customers_status_idx", fields: ["status"] },
  ],
};
