import type { BuiltinCollectionDefinition } from "../_types.ts";

export const BILL_PAYMENTS: BuiltinCollectionDefinition = {
  name: "bill_payments",
  displayName: "Bill Payments",
  family: "finance",
  aliases: ["bill_payment","bill_payments"],
  fields: [
    { name: "billId", type: "relation", required: true, relation: { collectionName: "bills" } },
    { name: "paidAt", type: "date", required: true },
    { name: "amountCents", type: "number" },
    { name: "accountId", type: "relation", relation: { collectionName: "financial_accounts" } },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "bill_payments_bill_idx", fields: ["billId"] },
    { name: "bill_payments_paid_idx", fields: ["paidAt"] },
  ],
};
