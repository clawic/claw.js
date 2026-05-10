import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CODE_OWNERS: BuiltinCollectionDefinition = {
  name: "code_owners",
  displayName: "Code Owners",
  family: "observability",
  aliases: ["code_owner","code_owners","codeowner","codeowners"],
  fields: [
    { name: "repositoryId", type: "relation", required: true, relation: { collectionName: "repositories" } },
    { name: "pattern", type: "text", required: true },
    { name: "ownerActorIds", type: "json" },
    { name: "priority", type: "number" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "code_owners_repo_idx", fields: ["repositoryId"] },
  ],
};
