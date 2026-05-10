import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PULL_REQUESTS: BuiltinCollectionDefinition = {
  name: "pull_requests",
  displayName: "Pull Requests",
  family: "integrations",
  aliases: ["pr","prs","pull_request","pull_requests"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "repositoryId", type: "relation", required: true, relation: { collectionName: "repositories" } },
    { name: "identifier", type: "text", required: true },
    { name: "title", type: "text" },
    { name: "body", type: "text" },
    { name: "state", type: "select", required: true, options: ["draft","open","merged","closed","abandoned"] },
    { name: "url", type: "text" },
    { name: "provider", type: "select", options: ["github","gitlab","bitbucket","azure_devops"] },
    { name: "externalId", type: "text" },
    { name: "branch", type: "text" },
    { name: "baseBranch", type: "text" },
    { name: "authorActorId", type: "relation", relation: { collectionName: "actors" } },
    { name: "mergedAt", type: "date" },
    { name: "closedAt", type: "date" },
    { name: "releaseId", type: "relation", relation: { collectionName: "company_releases" } },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "prs_company_idx", fields: ["companyId"] },
    { name: "prs_repo_idx", fields: ["repositoryId"] },
    { name: "prs_state_idx", fields: ["state"] },
  ],
};
