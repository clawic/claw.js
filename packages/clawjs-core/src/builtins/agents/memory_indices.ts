import type { BuiltinCollectionDefinition } from "../_types.ts";

export const MEMORY_INDICES: BuiltinCollectionDefinition = {
  name: "memory_indices",
  displayName: "Memory Indices",
  family: "agents",
  aliases: ["memory_index","memory_indices"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "name", type: "text", required: true },
    { name: "dimensions", type: "number" },
    { name: "model", type: "text" },
    { name: "memoryBlockCount", type: "number" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "memory_indices_company_idx", fields: ["companyId"] },
  ],
};
