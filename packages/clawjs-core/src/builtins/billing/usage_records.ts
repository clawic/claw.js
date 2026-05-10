import type { BuiltinCollectionDefinition } from "../_types.ts";

export const USAGE_RECORDS: BuiltinCollectionDefinition = {
  name: "usage_records",
  displayName: "Usage Records",
  family: "billing",
  aliases: ["usage","usage_record","usage_records"],
  fields: [
    { name: "subscriptionItemId", type: "relation", required: true, relation: { collectionName: "subscription_items" } },
    { name: "quantity", type: "number", required: true },
    { name: "timestamp", type: "date" },
    { name: "action", type: "select", options: ["increment","set"] },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "usage_records_sub_item_idx", fields: ["subscriptionItemId","timestamp"] },
  ],
};
