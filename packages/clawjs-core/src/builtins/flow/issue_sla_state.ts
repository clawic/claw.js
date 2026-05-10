import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ISSUE_SLA_STATE: BuiltinCollectionDefinition = {
  name: "issue_sla_state",
  displayName: "Issue SLA State",
  family: "flow",
  aliases: ["issue_sla","issue_sla_state"],
  fields: [
    { name: "issueId", type: "relation", required: true, relation: { collectionName: "issues" } },
    { name: "slaPolicyId", type: "relation", required: true, relation: { collectionName: "sla_policies" } },
    { name: "startedAt", type: "date" },
    { name: "breachesAt", type: "date" },
    { name: "breachedAt", type: "date" },
    { name: "pausedAt", type: "date" },
    { name: "dayCount", type: "number" },
    { name: "status", type: "select", options: ["on_track","low_risk","medium_risk","high_risk","breached","achieved","failed","paused"] },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "issue_sla_issue_idx", fields: ["issueId"] },
    { name: "issue_sla_status_idx", fields: ["status"] },
    { name: "issue_sla_breach_idx", fields: ["breachesAt"] },
  ],
};
