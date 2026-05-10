import type { BuiltinCollectionDefinition } from "../_types.ts";

export const INFRA_SECRETS: BuiltinCollectionDefinition = {
  name: "infra_secrets",
  displayName: "Infra Secrets / Env Vars",
  family: "infra",
  aliases: ["secret","secrets","infra_secret","infra_secrets","env_var"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "environmentId", type: "relation", required: true, relation: { collectionName: "infra_environments" } },
    { name: "name", type: "text", required: true },
    { name: "valueEncrypted", type: "text" },
    { name: "isSecret", type: "boolean" },
    { name: "lastRotatedAt", type: "date" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "infra_secrets_unique", fields: ["environmentId","name"], unique: true },
  ],
};
