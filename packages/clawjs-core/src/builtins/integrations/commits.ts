import type { BuiltinCollectionDefinition } from "../_types.ts";

export const COMMITS: BuiltinCollectionDefinition = {
  name: "commits",
  displayName: "Commits",
  family: "integrations",
  aliases: ["commit","commits"],
  fields: [
    { name: "repositoryId", type: "relation", required: true, relation: { collectionName: "repositories" } },
    { name: "sha", type: "text", required: true },
    { name: "message", type: "text" },
    { name: "authorActorId", type: "relation", relation: { collectionName: "actors" } },
    { name: "authoredAt", type: "date" },
    { name: "parentShas", type: "json" },
    { name: "branchName", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "commits_repo_sha_unique", fields: ["repositoryId","sha"], unique: true },
    { name: "commits_branch_idx", fields: ["repositoryId","branchName"] },
  ],
};
