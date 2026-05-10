import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ACTIVITIES: BuiltinCollectionDefinition = {
  name: "activities",
  displayName: "CRM Activities",
  family: "crm",
  aliases: ["activity","activities"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "kind", type: "select", required: true, options: ["call","meeting","email","note","task","sms","linkedin","demo","follow_up","other"] },
    { name: "subject", type: "text" },
    { name: "body", type: "text" },
    { name: "contactId", type: "relation", relation: { collectionName: "contacts" } },
    { name: "accountId", type: "relation", relation: { collectionName: "accounts" } },
    { name: "dealId", type: "relation", relation: { collectionName: "deals" } },
    { name: "leadId", type: "relation", relation: { collectionName: "leads" } },
    { name: "ownerActorId", type: "relation", relation: { collectionName: "actors" } },
    { name: "dueDate", type: "date" },
    { name: "completedAt", type: "date" },
    { name: "duration", type: "number" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "activities_company_idx", fields: ["companyId"] },
    { name: "activities_kind_idx", fields: ["kind"] },
    { name: "activities_contact_idx", fields: ["contactId"] },
    { name: "activities_deal_idx", fields: ["dealId"] },
  ],
};
