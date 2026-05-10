import type { BuiltinCollectionDefinition } from "../_types.ts";

export const TEAMS: BuiltinCollectionDefinition = {
  name: "teams",
  displayName: "Teams",
  family: "identity",
  aliases: ["team","teams"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "key", type: "text", required: true },
    { name: "name", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "color", type: "text" },
    { name: "icon", type: "text" },
    { name: "private", type: "boolean" },
    { name: "parentTeamId", type: "relation", relation: { collectionName: "teams" } },
    { name: "timezone", type: "text" },
    { name: "defaultStateId", type: "relation", relation: { collectionName: "workflow_states" } },
    { name: "requiresPriority", type: "boolean" },
    { name: "joinByDefault", type: "boolean" },
    { name: "issueEstimationScale", type: "select", options: ["notUsed","exponential","fibonacci","linear","tShirt"] },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "teams_company_key_unique", fields: ["companyId","key"], unique: true },
    { name: "teams_parent_idx", fields: ["parentTeamId"] },
  ],
};
