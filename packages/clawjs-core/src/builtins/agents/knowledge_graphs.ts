import type { BuiltinCollectionDefinition } from "../_types.ts";

export const KNOWLEDGE_GRAPHS: BuiltinCollectionDefinition = {
  name: "knowledge_graphs",
  displayName: "Knowledge Graphs",
  family: "agents",
  aliases: ["kg","knowledge_graph","knowledge_graphs"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "entityName", type: "text", required: true },
    { name: "entityType", type: "text" },
    { name: "properties", type: "json" },
    { name: "embeddingVector", type: "json" },
    { name: "confidence", type: "number" },
    { name: "sourceRunIds", type: "json" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "kg_company_idx", fields: ["companyId"] },
    { name: "kg_name_idx", fields: ["entityName"] },
    { name: "kg_type_idx", fields: ["entityType"] },
  ],
};
