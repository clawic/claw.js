import type { BuiltinCollectionDefinition } from "../_types.ts";

export const AGENT_SESSIONS: BuiltinCollectionDefinition = {
  name: "agent_sessions",
  displayName: "Agent Sessions",
  family: "agents",
  aliases: ["session","sessions","agent_session","agent_sessions"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "agentId", type: "relation", relation: { collectionName: "company_agents" } },
    { name: "initiatorActorId", type: "relation", relation: { collectionName: "actors" } },
    { name: "status", type: "select", required: true, options: ["active","awaiting_input","complete","error","pending","stale","paused"] },
    { name: "initialSource", type: "select", options: ["comment","direct_chat","pull_request_comment","slack","workflow","intercom","zendesk","mcp","form","email","scheduled","other"] },
    { name: "context", type: "json" },
    { name: "summary", type: "text" },
    { name: "readAt", type: "date" },
    { name: "linkedIssueId", type: "relation", relation: { collectionName: "issues" } },
    { name: "linkedTaskId", type: "relation", relation: { collectionName: "tasks" } },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "agent_sess_company_idx", fields: ["companyId"] },
    { name: "agent_sess_status_idx", fields: ["status"] },
    { name: "agent_sess_agent_idx", fields: ["agentId"] },
  ],
};
