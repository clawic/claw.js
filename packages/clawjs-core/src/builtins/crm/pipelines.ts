import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PIPELINES: BuiltinCollectionDefinition = {
  name: "pipelines",
  displayName: "Pipelines",
  family: "crm",
  aliases: ["pipeline","pipelines"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "name", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "isDefault", type: "boolean" },
    { name: "kind", type: "select", options: ["sales","support","recruitment","custom"] },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "pipelines_company_idx", fields: ["companyId"] },
  ],
};
