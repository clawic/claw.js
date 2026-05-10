import type { BuiltinCollectionDefinition } from "../_types.ts";

export const DISCOUNTS_APPLIED: BuiltinCollectionDefinition = {
  name: "discounts_applied",
  displayName: "Applied Discounts",
  family: "billing",
  aliases: ["discount","discounts","discount_applied","discounts_applied"],
  fields: [
    { name: "couponId", type: "relation", required: true, relation: { collectionName: "coupons" } },
    { name: "billingCustomerId", type: "relation", relation: { collectionName: "billing_customers" } },
    { name: "subscriptionId", type: "relation", relation: { collectionName: "subscriptions" } },
    { name: "invoiceId", type: "relation", relation: { collectionName: "invoices" } },
    { name: "start", type: "date" },
    { name: "end", type: "date" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "discounts_customer_idx", fields: ["billingCustomerId"] },
    { name: "discounts_subscription_idx", fields: ["subscriptionId"] },
  ],
};
