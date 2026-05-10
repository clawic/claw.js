import type { BuiltinCollectionDefinition } from "../_types.ts";

export const RELEASE_RUNS: BuiltinCollectionDefinition = {
  name: "release_runs",
  displayName: "Release Runs",
  family: "infra",
  aliases: ["release_run","release_runs"],
  fields: [
    { name: "pipelineId", type: "relation", required: true, relation: { collectionName: "release_pipelines" } },
    { name: "versionId", type: "relation", relation: { collectionName: "versions" } },
    { name: "currentStageId", type: "relation", relation: { collectionName: "release_stages" } },
    { name: "status", type: "select", options: ["pending","in_progress","blocked","completed","rolled_back","cancelled"] },
    { name: "startedAt", type: "date" },
    { name: "completedAt", type: "date" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "rel_runs_pipeline_idx", fields: ["pipelineId"] },
  ],
};
