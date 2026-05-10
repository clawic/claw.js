import type { BuiltinCollectionDefinition } from "../_types.ts";

export const EXPERIMENT_METRICS: BuiltinCollectionDefinition = {
  name: "experiment_metrics",
  displayName: "Experiment Metrics",
  family: "analytics",
  aliases: ["experiment_metric","experiment_metrics"],
  fields: [
    { name: "experimentId", type: "relation", required: true, relation: { collectionName: "experiments" } },
    { name: "variantKey", type: "text" },
    { name: "metricName", type: "text" },
    { name: "value", type: "number" },
    { name: "confidence", type: "number" },
    { name: "significance", type: "number" },
    { name: "computedAt", type: "date" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "exp_metrics_experiment_idx", fields: ["experimentId"] },
  ],
};
