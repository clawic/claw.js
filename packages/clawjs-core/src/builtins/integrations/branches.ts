import type { BuiltinCollectionDefinition } from "../_types.ts";

export const BRANCHES: BuiltinCollectionDefinition = {
  name: "branches",
  displayName: "Branches",
  family: "integrations",
  aliases: ["branch","branches"],
  fields: [
    { name: "repositoryId", type: "relation", required: true, relation: { collectionName: "repositories" } },
    { name: "name", type: "text", required: true },
    { name: "ref", type: "text" },
    { name: "isProtected", type: "boolean" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "branches_repo_name_unique", fields: ["repositoryId","name"], unique: true },
  ],
};
