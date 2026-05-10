import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PULL_REQUEST_ISSUES: BuiltinCollectionDefinition = {
  name: "pull_request_issues",
  displayName: "PR ↔ Issues",
  family: "integrations",
  aliases: ["pr_issue","pr_issues","pull_request_issue","pull_request_issues"],
  fields: [
    { name: "pullRequestId", type: "relation", required: true, relation: { collectionName: "pull_requests" } },
    { name: "issueId", type: "relation", required: true, relation: { collectionName: "issues" } },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "pr_issues_unique", fields: ["pullRequestId","issueId"], unique: true },
    { name: "pr_issues_issue_idx", fields: ["issueId"] },
  ],
};
