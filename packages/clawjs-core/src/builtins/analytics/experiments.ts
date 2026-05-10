import type { BuiltinCollectionDefinition } from "../_types.ts";

export const EXPERIMENTS: BuiltinCollectionDefinition = {
  name: "experiments",
  displayName: "Experiments",
  family: "analytics",
  aliases: ["experiment","experiments","ab_test"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "name", type: "text", required: true },
    { name: "hypothesis", type: "text" },
    { name: "variants", type: "json" },
    { name: "metrics", type: "json" },
    { name: "featureFlagId", type: "relation", relation: { collectionName: "feature_flags" } },
    { name: "audienceCriteria", type: "json" },
    { name: "status", type: "select", options: ["draft","running","completed","winner_declared","discarded"] },
    { name: "startedAt", type: "date" },
    { name: "endedAt", type: "date" },
    { name: "winnerVariant", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "experiments_company_idx", fields: ["companyId"] },
    { name: "experiments_status_idx", fields: ["status"] },
  ],
};
