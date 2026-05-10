import type { BuiltinCollectionDefinition } from "../_types.ts";

export const MEMORY_BLOCKS: BuiltinCollectionDefinition = {
  name: "memory_blocks",
  displayName: "Memory Blocks",
  family: "agents",
  aliases: ["memory","memories","memory_block","memory_blocks"],
  fields: [
    { name: "agentId", type: "relation", required: true, relation: { collectionName: "company_agents" } },
    { name: "companyId", type: "relation", relation: { collectionName: "companies" } },
    { name: "memoryIndexId", type: "relation", relation: { collectionName: "memory_indices" } },
    { name: "kind", type: "select", required: true, options: ["short_term","long_term","episodic","semantic","procedural","working"] },
    { name: "content", type: "text" },
    { name: "embeddingVector", type: "json" },
    { name: "embeddingModel", type: "text" },
    { name: "ttl", type: "number" },
    { name: "lastAccessedAt", type: "date" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "memory_agent_idx", fields: ["agentId"] },
    { name: "memory_kind_idx", fields: ["kind"] },
  ],
};
