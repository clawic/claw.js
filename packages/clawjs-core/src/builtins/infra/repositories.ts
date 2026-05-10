import type { BuiltinCollectionDefinition } from "../_types.ts";

export const REPOSITORIES: BuiltinCollectionDefinition = {
  name: "repositories",
  displayName: "Repositories",
  family: "infra",
  aliases: ["repo","repos","repository","repositories"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "provider", type: "select", required: true, options: ["github","gitlab","bitbucket","azure_devops","gitea","other"] },
    { name: "externalId", type: "text" },
    { name: "owner", type: "text", required: true },
    { name: "name", type: "text", required: true },
    { name: "url", type: "text" },
    { name: "defaultBranch", type: "text" },
    { name: "private", type: "boolean" },
    { name: "description", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "repos_company_idx", fields: ["companyId"] },
    { name: "repos_provider_external_unique", fields: ["provider","externalId"], unique: true },
    { name: "repos_owner_name_idx", fields: ["owner","name"] },
  ],
};
