import type { BuiltinCollectionDefinition } from "../_types.ts";

export const INFRA_ENVIRONMENTS: BuiltinCollectionDefinition = {
  name: "infra_environments",
  displayName: "Infra Environments",
  family: "infra",
  aliases: ["env","envs","environment","environments","infra_environment","infra_environments"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "repositoryId", type: "relation", relation: { collectionName: "repositories" } },
    { name: "name", type: "text", required: true },
    { name: "kind", type: "select", options: ["development","preview","staging","production","custom"] },
    { name: "protected", type: "boolean" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "envs_company_idx", fields: ["companyId"] },
    { name: "envs_repo_idx", fields: ["repositoryId"] },
  ],
};
