import type { BuiltinCollectionDefinition } from "../_types.ts";

export const LABELS: BuiltinCollectionDefinition = {
  name: "labels",
  displayName: "Labels",
  family: "work",
  aliases: ["label","labels"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "teamId", type: "relation", relation: { collectionName: "teams" } },
    { name: "parentLabelId", type: "relation", relation: { collectionName: "labels" } },
    { name: "isGroup", type: "boolean" },
    { name: "name", type: "text", required: true },
    { name: "color", type: "text" },
    { name: "description", type: "text" },
    { name: "sortOrder", type: "number" },
    { name: "labelSource", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "labels_company_idx", fields: ["companyId"] },
    { name: "labels_team_idx", fields: ["teamId"] },
    { name: "labels_parent_idx", fields: ["parentLabelId"] },
  ],
};
