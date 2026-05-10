import type { BuiltinCollectionDefinition } from "../_types.ts";

export const DEPLOYMENTS: BuiltinCollectionDefinition = {
  name: "deployments",
  displayName: "Deployments",
  family: "infra",
  aliases: ["deploy","deploys","deployment","deployments"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "repositoryId", type: "relation", required: true, relation: { collectionName: "repositories" } },
    { name: "environmentId", type: "relation", required: true, relation: { collectionName: "infra_environments" } },
    { name: "commitSha", type: "text" },
    { name: "branch", type: "text" },
    { name: "status", type: "select", options: ["queued","building","deploying","ready","error","canceled"] },
    { name: "url", type: "text" },
    { name: "releaseId", type: "relation", relation: { collectionName: "company_releases" } },
    { name: "triggeredByActorId", type: "relation", relation: { collectionName: "actors" } },
    { name: "durationSeconds", type: "number" },
    { name: "logsRef", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "deployments_company_idx", fields: ["companyId"] },
    { name: "deployments_env_idx", fields: ["environmentId"] },
    { name: "deployments_status_idx", fields: ["status"] },
  ],
};
