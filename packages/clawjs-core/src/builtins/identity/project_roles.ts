import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PROJECT_ROLES: BuiltinCollectionDefinition = {
  name: "project_roles",
  displayName: "Project Roles",
  family: "identity",
  aliases: ["project_role","project_roles"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "projectId", type: "relation", relation: { collectionName: "projects" } },
    { name: "portfolioItemId", type: "relation", relation: { collectionName: "portfolio_items" } },
    { name: "name", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "project_roles_company_idx", fields: ["companyId"] },
    { name: "project_roles_project_idx", fields: ["projectId"] },
  ],
};
