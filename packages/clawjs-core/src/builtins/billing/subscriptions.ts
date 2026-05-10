import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SUBSCRIPTIONS: BuiltinCollectionDefinition = {
  name: "subscriptions",
  displayName: "Subscriptions",
  family: "billing",
  aliases: ["subscription","subscriptions","sub","subs"],
  fields: [
    { name: "billingCustomerId", type: "relation", required: true, relation: { collectionName: "billing_customers" } },
    { name: "status", type: "select", required: true, options: ["trialing","active","past_due","canceled","unpaid","incomplete","incomplete_expired","paused"] },
    { name: "currentPeriodStart", type: "date" },
    { name: "currentPeriodEnd", type: "date" },
    { name: "cancelAt", type: "date" },
    { name: "cancelAtPeriodEnd", type: "boolean" },
    { name: "canceledAt", type: "date" },
    { name: "trialStart", type: "date" },
    { name: "trialEnd", type: "date" },
    { name: "defaultPaymentMethodId", type: "relation", relation: { collectionName: "payment_methods" } },
    { name: "latestInvoiceId", type: "relation", relation: { collectionName: "invoices" } },
    { name: "collectionMethod", type: "select", options: ["charge_automatically","send_invoice"] },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "subs_customer_idx", fields: ["billingCustomerId"] },
    { name: "subs_status_idx", fields: ["status"] },
  ],
};
