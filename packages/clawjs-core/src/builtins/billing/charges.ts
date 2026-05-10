import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CHARGES: BuiltinCollectionDefinition = {
  name: "charges",
  displayName: "Charges",
  family: "billing",
  aliases: ["charge","charges"],
  fields: [
    { name: "billingCustomerId", type: "relation", required: true, relation: { collectionName: "billing_customers" } },
    { name: "paymentIntentId", type: "relation", relation: { collectionName: "payment_intents" } },
    { name: "amountCents", type: "number" },
    { name: "currency", type: "text" },
    { name: "status", type: "select", required: true, options: ["succeeded","pending","failed"] },
    { name: "paymentMethodId", type: "relation", relation: { collectionName: "payment_methods" } },
    { name: "refundedCents", type: "number" },
    { name: "disputed", type: "boolean" },
    { name: "receiptUrl", type: "text" },
    { name: "failureCode", type: "text" },
    { name: "failureMessage", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "charges_customer_idx", fields: ["billingCustomerId"] },
    { name: "charges_status_idx", fields: ["status"] },
  ],
};
