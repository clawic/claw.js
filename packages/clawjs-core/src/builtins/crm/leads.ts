import type { BuiltinCollectionDefinition } from "../_types.ts";

export const LEADS: BuiltinCollectionDefinition = {
  name: "leads",
  displayName: "Leads",
  family: "crm",
  aliases: ["lead","leads"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "firstName", type: "text" },
    { name: "lastName", type: "text" },
    { name: "email", type: "email" },
    { name: "phone", type: "text" },
    { name: "company", type: "text" },
    { name: "title", type: "text" },
    { name: "leadSource", type: "text" },
    { name: "status", type: "select", options: ["new","working","qualified","unqualified","converted"] },
    { name: "ownerActorId", type: "relation", relation: { collectionName: "actors" } },
    { name: "convertedAt", type: "date" },
    { name: "convertedContactId", type: "relation", relation: { collectionName: "contacts" } },
    { name: "convertedAccountId", type: "relation", relation: { collectionName: "accounts" } },
    { name: "convertedDealId", type: "relation", relation: { collectionName: "deals" } },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "leads_company_idx", fields: ["companyId"] },
    { name: "leads_status_idx", fields: ["status"] },
    { name: "leads_owner_idx", fields: ["ownerActorId"] },
  ],
};
