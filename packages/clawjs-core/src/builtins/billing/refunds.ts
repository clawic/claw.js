import type { BuiltinCollectionDefinition } from "../_types.ts";

export const REFUNDS: BuiltinCollectionDefinition = {
  name: "refunds",
  displayName: "Refunds",
  family: "billing",
  aliases: ["refund","refunds"],
  fields: [
    { name: "chargeId", type: "relation", required: true, relation: { collectionName: "charges" } },
    { name: "paymentIntentId", type: "relation", relation: { collectionName: "payment_intents" } },
    { name: "amountCents", type: "number" },
    { name: "currency", type: "text" },
    { name: "status", type: "select", options: ["pending","succeeded","failed","canceled"] },
    { name: "reason", type: "select", options: ["duplicate","fraudulent","requested_by_customer","expired_uncaptured_charge","other"] },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "refunds_charge_idx", fields: ["chargeId"] },
  ],
};
