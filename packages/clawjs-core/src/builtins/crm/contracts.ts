import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CONTRACTS: BuiltinCollectionDefinition = {
  name: "contracts",
  displayName: "Contracts",
  family: "crm",
  aliases: ["contract","contracts"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "accountId", type: "relation", relation: { collectionName: "accounts" } },
    { name: "quoteId", type: "relation", relation: { collectionName: "quotes" } },
    { name: "dealId", type: "relation", relation: { collectionName: "deals" } },
    { name: "title", type: "text" },
    { name: "startDate", type: "date" },
    { name: "endDate", type: "date" },
    { name: "termMonths", type: "number" },
    { name: "status", type: "select", options: ["draft","sent","signed","active","terminated","expired"] },
    { name: "signedAt", type: "date" },
    { name: "pdfUrl", type: "text" },
    { name: "autoRenewal", type: "boolean" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "contracts_company_idx", fields: ["companyId"] },
    { name: "contracts_account_idx", fields: ["accountId"] },
    { name: "contracts_status_idx", fields: ["status"] },
  ],
};
