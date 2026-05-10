import type { BuiltinCollectionDefinition } from "../_types.ts";

export const AGENT_SESSION_PULL_REQUESTS: BuiltinCollectionDefinition = {
  name: "agent_session_pull_requests",
  displayName: "Agent Session ↔ Pull Requests",
  family: "agents",
  aliases: ["agent_session_pr","agent_session_pull_request","agent_session_pull_requests"],
  fields: [
    { name: "sessionId", type: "relation", required: true, relation: { collectionName: "agent_sessions" } },
    { name: "pullRequestId", type: "relation", required: true, relation: { collectionName: "pull_requests" } },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "asp_unique", fields: ["sessionId","pullRequestId"], unique: true },
  ],
};
