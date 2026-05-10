import type { BuiltinCollectionDefinition } from "../_types.ts";

export const RELEASE_STAGES: BuiltinCollectionDefinition = {
  name: "release_stages",
  displayName: "Release Stages",
  family: "infra",
  aliases: ["release_stage","release_stages"],
  fields: [
    { name: "pipelineId", type: "relation", required: true, relation: { collectionName: "release_pipelines" } },
    { name: "name", type: "text", required: true },
    { name: "kind", type: "select", options: ["code_freeze","qa","staging","canary","production","postmortem","custom"] },
    { name: "position", type: "number" },
    { name: "isFrozen", type: "boolean" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "rel_stages_pipeline_idx", fields: ["pipelineId"] },
  ],
};
