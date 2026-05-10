import type { BuiltinCollectionDefinition } from "../_types.ts";

export const WORKFLOW_STATES: BuiltinCollectionDefinition = {
  name: "workflow_states",
  displayName: "Workflow States",
  family: "work",
  aliases: ["state","states","workflow_state","workflow_states"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "teamId", type: "relation", relation: { collectionName: "teams" } },
    { name: "name", type: "text", required: true },
    { name: "type", type: "select", required: true, options: ["backlog","unstarted","started","completed","canceled","triage"] },
    { name: "color", type: "text" },
    { name: "description", type: "text" },
    { name: "position", type: "number", required: true },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "workflow_states_company_idx", fields: ["companyId"] },
    { name: "workflow_states_team_idx", fields: ["teamId"] },
    { name: "workflow_states_type_idx", fields: ["type"] },
  ],
};
