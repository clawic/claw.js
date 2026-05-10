import type { BuiltinCollectionDefinition } from "../_types.ts";

export const AUTOMATION_RECIPES: BuiltinCollectionDefinition = {
  name: "automation_recipes",
  displayName: "Automation Recipes",
  family: "flow",
  aliases: ["automation_recipe","automation_recipes"],
  fields: [
    { name: "companyId", type: "relation", relation: { collectionName: "companies" } },
    { name: "name", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "triggerKind", type: "text", required: true },
    { name: "conditions", type: "json" },
    { name: "actions", type: "json" },
    { name: "authorActorId", type: "relation", relation: { collectionName: "actors" } },
    { name: "isPublic", type: "boolean" },
    { name: "installCount", type: "number" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "recipes_company_idx", fields: ["companyId"] },
    { name: "recipes_public_idx", fields: ["isPublic"] },
  ],
};
