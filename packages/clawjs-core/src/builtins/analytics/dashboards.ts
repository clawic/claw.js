import type { BuiltinCollectionDefinition } from "../_types.ts";

export const DASHBOARDS: BuiltinCollectionDefinition = {
  name: "dashboards",
  displayName: "Dashboards",
  family: "analytics",
  aliases: ["dashboard","dashboards"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "teamId", type: "relation", relation: { collectionName: "teams" } },
    { name: "name", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "widgets", type: "json" },
    { name: "filters", type: "json" },
    { name: "layout", type: "json" },
    { name: "ownerActorId", type: "relation", relation: { collectionName: "actors" } },
    { name: "isPublic", type: "boolean" },
    { name: "sharedWithTeams", type: "json" },
    { name: "sharedWithUsers", type: "json" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "dashboards_company_idx", fields: ["companyId"] },
    { name: "dashboards_owner_idx", fields: ["ownerActorId"] },
  ],
};
