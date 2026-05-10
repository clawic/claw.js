import type { BuiltinCollectionDefinition } from "../_types.ts";

export const FEATURE_FLAG_EVALUATIONS: BuiltinCollectionDefinition = {
  name: "feature_flag_evaluations",
  displayName: "Feature Flag Evaluations",
  family: "analytics",
  aliases: ["flag_eval","flag_evals","feature_flag_evaluation","feature_flag_evaluations"],
  fields: [
    { name: "flagId", type: "relation", required: true, relation: { collectionName: "feature_flags" } },
    { name: "distinctId", type: "text", required: true },
    { name: "variation", type: "text" },
    { name: "timestamp", type: "date" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "flag_eval_flag_time_idx", fields: ["flagId","timestamp"] },
  ],
};
