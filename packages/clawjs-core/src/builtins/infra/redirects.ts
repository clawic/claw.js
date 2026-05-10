import type { BuiltinCollectionDefinition } from "../_types.ts";

export const REDIRECTS: BuiltinCollectionDefinition = {
  name: "redirects",
  displayName: "Redirects",
  family: "infra",
  aliases: ["redirect","redirects"],
  fields: [
    { name: "environmentId", type: "relation", required: true, relation: { collectionName: "infra_environments" } },
    { name: "sourcePath", type: "text", required: true },
    { name: "destination", type: "text" },
    { name: "type", type: "select", options: ["permanent","temporary"] },
    { name: "statusCode", type: "number" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "redirects_env_source_unique", fields: ["environmentId","sourcePath"], unique: true },
  ],
};
