import type { BuiltinCollectionDefinition } from "../_types.ts";

export const TRANSACTIONS: BuiltinCollectionDefinition = {
  name: "transactions",
  displayName: "Transactions",
  family: "finance",
  aliases: ["transaction","transactions"],
  fields: [
    { name: "accountId", type: "relation", required: true, relation: { collectionName: "financial_accounts" } },
    { name: "postedAt", type: "date", required: true },
    { name: "amountCents", type: "number", required: true },
    { name: "currency", type: "text" },
    { name: "merchant", type: "text" },
    { name: "description", type: "text" },
    { name: "categoryId", type: "relation", relation: { collectionName: "budget_categories" } },
    { name: "kind", type: "select", options: ["debit","credit","transfer","fee","interest","refund"] },
    { name: "tags", type: "json" },
    { name: "cleared", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "transactions_account_idx", fields: ["accountId"] },
    { name: "transactions_posted_idx", fields: ["postedAt"] },
    { name: "transactions_category_idx", fields: ["categoryId"] },
  ],
};
