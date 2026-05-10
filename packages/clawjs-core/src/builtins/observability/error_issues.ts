import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ERROR_ISSUES: BuiltinCollectionDefinition = {
  name: "error_issues",
  displayName: "Error Issues",
  family: "observability",
  aliases: ["error","errors","error_issue","error_issues"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "projectId", type: "relation", relation: { collectionName: "projects" } },
    { name: "title", type: "text" },
    { name: "culprit", type: "text" },
    { name: "fingerprint", type: "text", required: true },
    { name: "level", type: "select", options: ["debug","info","warning","error","fatal"] },
    { name: "status", type: "select", options: ["unresolved","resolved","ignored","in_progress"] },
    { name: "count", type: "number" },
    { name: "usersAffected", type: "number" },
    { name: "firstSeenAt", type: "date" },
    { name: "lastSeenAt", type: "date" },
    { name: "releaseId", type: "relation", relation: { collectionName: "company_releases" } },
    { name: "assigneeActorId", type: "relation", relation: { collectionName: "actors" } },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "err_issues_company_idx", fields: ["companyId"] },
    { name: "err_issues_fingerprint_unique", fields: ["companyId","fingerprint"], unique: true },
    { name: "err_issues_status_idx", fields: ["status"] },
  ],
};
