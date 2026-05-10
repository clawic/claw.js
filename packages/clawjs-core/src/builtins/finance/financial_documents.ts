import type { BuiltinCollectionDefinition } from "../_types.ts";

export const FINANCIAL_DOCUMENTS: BuiltinCollectionDefinition = {
  name: "financial_documents",
  displayName: "Financial Documents",
  family: "finance",
  aliases: ["financial_document","financial_documents"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "kind", type: "select", options: ["statement","receipt","tax_return","contract","invoice","other"] },
    { name: "documentDate", type: "date" },
    { name: "accountId", type: "relation", relation: { collectionName: "financial_accounts" } },
    { name: "file", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "financial_documents_kind_idx", fields: ["kind"] },
  ],
};
