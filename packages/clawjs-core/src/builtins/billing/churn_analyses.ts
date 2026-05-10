import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CHURN_ANALYSES: BuiltinCollectionDefinition = {
  name: "churn_analyses",
  displayName: "Churn Analyses",
  family: "billing",
  aliases: ["churn","churn_analysis","churn_analyses"],
  fields: [
    { name: "billingCustomerId", type: "relation", required: true, relation: { collectionName: "billing_customers" } },
    { name: "churnProbability", type: "number" },
    { name: "triggers", type: "json" },
    { name: "predictedLtvCents", type: "number" },
    { name: "computedAt", type: "date" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "churn_customer_idx", fields: ["billingCustomerId"] },
  ],
};
