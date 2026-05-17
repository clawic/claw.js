import type { BuiltinCollectionDefinition } from "../_types.ts";

export const AGENT_SKILLS: BuiltinCollectionDefinition = {
  name: "agent_skills",
  displayName: "Agent Skills",
  family: "agents",
  aliases: ["skill","skills","agent_skill","agent_skills"],
  fields: [
    { name: "companyId", type: "relation", relation: { collectionName: "companies" } },
    { name: "agentId", type: "relation", relation: { collectionName: "agents" } },
    { name: "skillRef", type: "text" },
    { name: "version", type: "text" },
    { name: "requiredResourceGrantsJson", type: "json" },
    { name: "name", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "instructions", type: "text" },
    { name: "toolsEnabled", type: "json" },
    { name: "confidenceScore", type: "number" },
    { name: "lastEvaluationId", type: "relation", relation: { collectionName: "evaluations" } },
    { name: "files", type: "json" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "skills_company_idx", fields: ["companyId"] },
    { name: "skills_agent_idx", fields: ["agentId"] },
  ],
};
