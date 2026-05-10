import type { BuiltinCollectionDefinition } from "../_types.ts";

export const AGENT_SESSION_ACTIVITIES: BuiltinCollectionDefinition = {
  name: "agent_session_activities",
  displayName: "Agent Session Activities",
  family: "agents",
  aliases: ["agent_activity","agent_activities","agent_session_activity","agent_session_activities"],
  fields: [
    { name: "sessionId", type: "relation", required: true, relation: { collectionName: "agent_sessions" } },
    { name: "type", type: "select", required: true, options: ["prompt","response","thought","reasoning","tool_call","tool_result","event","error","text","widget","elicitation","system"] },
    { name: "content", type: "json" },
    { name: "position", type: "number", required: true },
    { name: "actorId", type: "relation", relation: { collectionName: "actors" } },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "asa_session_idx", fields: ["sessionId","position"] },
  ],
};
