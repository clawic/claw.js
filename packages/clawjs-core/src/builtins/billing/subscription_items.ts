import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SUBSCRIPTION_ITEMS: BuiltinCollectionDefinition = {
  name: "subscription_items",
  displayName: "Subscription Items",
  family: "billing",
  aliases: ["subscription_item","subscription_items"],
  fields: [
    { name: "subscriptionId", type: "relation", required: true, relation: { collectionName: "subscriptions" } },
    { name: "priceId", type: "relation", required: true, relation: { collectionName: "prices" } },
    { name: "quantity", type: "number" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "sub_items_subscription_idx", fields: ["subscriptionId"] },
  ],
};
