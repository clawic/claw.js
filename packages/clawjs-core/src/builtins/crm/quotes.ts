import type { BuiltinCollectionDefinition } from "../_types.ts";

export const QUOTES: BuiltinCollectionDefinition = {
  name: "quotes",
  displayName: "Quotes",
  family: "crm",
  aliases: ["quote","quotes"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "dealId", type: "relation", relation: { collectionName: "deals" } },
    { name: "accountId", type: "relation", relation: { collectionName: "accounts" } },
    { name: "contactId", type: "relation", relation: { collectionName: "contacts" } },
    { name: "totalCents", type: "number" },
    { name: "currency", type: "text" },
    { name: "validUntil", type: "date" },
    { name: "status", type: "select", options: ["draft","sent","accepted","expired","declined"] },
    { name: "pdfUrl", type: "text" },
    { name: "signedAt", type: "date" },
    { name: "number", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "quotes_company_idx", fields: ["companyId"] },
    { name: "quotes_account_idx", fields: ["accountId"] },
    { name: "quotes_status_idx", fields: ["status"] },
  ],
};
