import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CODING_SANDBOXES: BuiltinCollectionDefinition = {
  name: "coding_sandboxes",
  displayName: "Coding Sandboxes",
  family: "agents",
  aliases: ["sandbox","sandboxes","coding_sandbox","coding_sandboxes"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "runId", type: "relation", relation: { collectionName: "runs" } },
    { name: "sessionId", type: "relation", relation: { collectionName: "agent_sessions" } },
    { name: "vmType", type: "text" },
    { name: "cpuLimit", type: "number" },
    { name: "memoryLimit", type: "number" },
    { name: "gitReference", type: "text" },
    { name: "branchName", type: "text" },
    { name: "sandboxUrl", type: "text" },
    { name: "active", type: "boolean" },
    { name: "destroyedAt", type: "date" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "sandboxes_company_idx", fields: ["companyId"] },
    { name: "sandboxes_session_idx", fields: ["sessionId"] },
  ],
};
