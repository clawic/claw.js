import type { BuiltinCollectionDefinition } from "../_types.ts";

export const HELP_CENTERS: BuiltinCollectionDefinition = {
  name: "help_centers",
  displayName: "Help Centers",
  family: "support",
  aliases: ["help_center","help_centers","kb","knowledge_base"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "name", type: "text", required: true },
    { name: "slug", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "defaultLocale", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "help_centers_company_slug_unique", fields: ["companyId","slug"], unique: true },
  ],
};
