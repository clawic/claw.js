import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PIPELINE_STAGES: BuiltinCollectionDefinition = {
  name: "pipeline_stages",
  displayName: "Pipeline Stages",
  family: "crm",
  aliases: ["stage","stages","pipeline_stage","pipeline_stages"],
  fields: [
    { name: "pipelineId", type: "relation", required: true, relation: { collectionName: "pipelines" } },
    { name: "name", type: "text", required: true },
    { name: "probability", type: "number" },
    { name: "position", type: "number" },
    { name: "type", type: "select", options: ["open","won","lost"] },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "stages_pipeline_idx", fields: ["pipelineId"] },
  ],
};
