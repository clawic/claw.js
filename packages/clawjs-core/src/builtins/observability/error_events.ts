import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ERROR_EVENTS: BuiltinCollectionDefinition = {
  name: "error_events",
  displayName: "Error Events",
  family: "observability",
  aliases: ["error_event","error_events"],
  fields: [
    { name: "errorIssueId", type: "relation", required: true, relation: { collectionName: "error_issues" } },
    { name: "timestamp", type: "date", required: true },
    { name: "message", type: "text" },
    { name: "stacktrace", type: "json" },
    { name: "tags", type: "json" },
    { name: "extra", type: "json" },
    { name: "personId", type: "relation", relation: { collectionName: "analytics_persons" } },
    { name: "releaseId", type: "relation", relation: { collectionName: "company_releases" } },
    { name: "environmentId", type: "relation", relation: { collectionName: "infra_environments" } },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "err_events_issue_idx", fields: ["errorIssueId","timestamp"] },
    { name: "err_events_release_idx", fields: ["releaseId"] },
  ],
};
