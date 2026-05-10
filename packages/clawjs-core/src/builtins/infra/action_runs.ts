import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ACTION_RUNS: BuiltinCollectionDefinition = {
  name: "action_runs",
  displayName: "CI/CD Action Runs",
  family: "infra",
  aliases: ["ci","ci_run","action_run","action_runs"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "repositoryId", type: "relation", required: true, relation: { collectionName: "repositories" } },
    { name: "workflowName", type: "text" },
    { name: "workflowFile", type: "text" },
    { name: "runNumber", type: "number" },
    { name: "status", type: "select", options: ["queued","in_progress","completed","skipped","cancelled"] },
    { name: "conclusion", type: "select", options: ["success","failure","neutral","cancelled","timed_out","action_required"] },
    { name: "event", type: "select", options: ["push","pull_request","scheduled","manual","release","workflow_dispatch"] },
    { name: "branch", type: "text" },
    { name: "commitSha", type: "text" },
    { name: "triggeredByActorId", type: "relation", relation: { collectionName: "actors" } },
    { name: "startedAt", type: "date" },
    { name: "completedAt", type: "date" },
    { name: "durationSeconds", type: "number" },
    { name: "logsRef", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "action_runs_repo_idx", fields: ["repositoryId"] },
    { name: "action_runs_status_idx", fields: ["status"] },
  ],
};
