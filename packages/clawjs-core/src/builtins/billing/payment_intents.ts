import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PAYMENT_INTENTS: BuiltinCollectionDefinition = {
  name: "payment_intents",
  displayName: "Payment Intents",
  family: "billing",
  aliases: ["payment_intent","payment_intents","intent","intents"],
  fields: [
    { name: "billingCustomerId", type: "relation", required: true, relation: { collectionName: "billing_customers" } },
    { name: "amountCents", type: "number" },
    { name: "currency", type: "text" },
    { name: "status", type: "select", required: true, options: ["requires_payment_method","requires_confirmation","requires_action","processing","requires_capture","succeeded","canceled"] },
    { name: "paymentMethodId", type: "relation", relation: { collectionName: "payment_methods" } },
    { name: "clientSecret", type: "text" },
    { name: "invoiceId", type: "relation", relation: { collectionName: "invoices" } },
    { name: "lastError", type: "json" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "pi_customer_idx", fields: ["billingCustomerId"] },
    { name: "pi_status_idx", fields: ["status"] },
  ],
};
