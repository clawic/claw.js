import type { BuiltinCollectionDefinition } from "../_types.ts";

export const GIT_AUTOMATION_STATES: BuiltinCollectionDefinition = {
  name: "git_automation_states",
  displayName: "Git Automation States",
  family: "flow",
  aliases: ["git_automation","git_automation_state","git_automation_states"],
  fields: [
    { name: "teamId", type: "relation", required: true, relation: { collectionName: "teams" } },
    { name: "repositoryId", type: "relation", required: true, relation: { collectionName: "repositories" } },
    { name: "branchNamingPattern", type: "text" },
    { name: "prLinking", type: "boolean" },
    { name: "commitLinking", type: "boolean" },
    { name: "autoStatusUpdate", type: "boolean" },
    { name: "state", type: "json" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "git_auto_team_repo_unique", fields: ["teamId","repositoryId"], unique: true },
  ],
};
