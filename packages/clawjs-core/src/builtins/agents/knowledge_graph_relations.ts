import type { BuiltinCollectionDefinition } from "../_types.ts";

export const KNOWLEDGE_GRAPH_RELATIONS: BuiltinCollectionDefinition = {
  name: "knowledge_graph_relations",
  displayName: "Knowledge Graph Relations",
  family: "agents",
  aliases: ["kg_relation","knowledge_graph_relation","knowledge_graph_relations"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "fromEntityId", type: "relation", required: true, relation: { collectionName: "knowledge_graphs" } },
    { name: "toEntityId", type: "relation", required: true, relation: { collectionName: "knowledge_graphs" } },
    { name: "relationType", type: "text" },
    { name: "confidence", type: "number" },
    { name: "evidence", type: "json" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "kgr_from_idx", fields: ["fromEntityId"] },
    { name: "kgr_to_idx", fields: ["toEntityId"] },
  ],
};
