import type { BuiltinCollectionDefinition } from "../_types.ts";

export const FEEDBACK_LOOPS: BuiltinCollectionDefinition = {
  name: "feedback_loops",
  displayName: "Feedback Loops",
  family: "agents",
  aliases: ["feedback_loop","feedback_loops"],
  fields: [
    { name: "companyId", type: "relation", relation: { collectionName: "companies" } },
    { name: "runId", type: "relation", relation: { collectionName: "runs" } },
    { name: "agentSessionId", type: "relation", relation: { collectionName: "agent_sessions" } },
    { name: "actorId", type: "relation", required: true, relation: { collectionName: "actors" } },
    { name: "rating", type: "number" },
    { name: "feedbackText", type: "text" },
    { name: "correctionProvided", type: "json" },
    { name: "applied", type: "boolean" },
    { name: "appliedAt", type: "date" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "feedback_run_idx", fields: ["runId"] },
    { name: "feedback_session_idx", fields: ["agentSessionId"] },
  ],
};
