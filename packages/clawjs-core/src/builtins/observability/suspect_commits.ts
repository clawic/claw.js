import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SUSPECT_COMMITS: BuiltinCollectionDefinition = {
  name: "suspect_commits",
  displayName: "Suspect Commits",
  family: "observability",
  aliases: ["suspect_commit","suspect_commits"],
  fields: [
    { name: "errorIssueId", type: "relation", required: true, relation: { collectionName: "error_issues" } },
    { name: "commitId", type: "relation", required: true, relation: { collectionName: "commits" } },
    { name: "likelihood", type: "number" },
    { name: "reason", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "susp_commit_issue_idx", fields: ["errorIssueId"] },
    { name: "susp_commit_commit_idx", fields: ["commitId"] },
  ],
};
