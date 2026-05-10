import type { BuiltinCollectionDefinition } from "../_types.ts";

export const RELEASE_PIPELINES: BuiltinCollectionDefinition = {
  name: "release_pipelines",
  displayName: "Release Pipelines",
  family: "infra",
  aliases: ["release_pipeline","release_pipelines"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "teamId", type: "relation", relation: { collectionName: "teams" } },
    { name: "name", type: "text", required: true },
    { name: "type", type: "select", options: ["continuous","scheduled"] },
    { name: "definition", type: "json" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "rel_pipelines_company_idx", fields: ["companyId"] },
  ],
};
