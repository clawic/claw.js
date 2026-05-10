import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PAYOUTS: BuiltinCollectionDefinition = {
  name: "payouts",
  displayName: "Payouts",
  family: "billing",
  aliases: ["payout","payouts"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "amountCents", type: "number" },
    { name: "currency", type: "text" },
    { name: "arrivalDate", type: "date" },
    { name: "status", type: "select", options: ["pending","in_transit","paid","failed","canceled"] },
    { name: "automatic", type: "boolean" },
    { name: "method", type: "select", options: ["standard","instant"] },
    { name: "statementDescriptor", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "payouts_company_idx", fields: ["companyId"] },
    { name: "payouts_status_idx", fields: ["status"] },
  ],
};
