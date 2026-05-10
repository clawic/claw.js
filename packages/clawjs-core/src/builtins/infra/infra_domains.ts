import type { BuiltinCollectionDefinition } from "../_types.ts";

export const INFRA_DOMAINS: BuiltinCollectionDefinition = {
  name: "infra_domains",
  displayName: "Infra Domains",
  family: "infra",
  aliases: ["domain","domains","infra_domain","infra_domains"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "environmentId", type: "relation", relation: { collectionName: "infra_environments" } },
    { name: "name", type: "text", required: true },
    { name: "verified", type: "boolean" },
    { name: "sslCertId", type: "text" },
    { name: "expiresAt", type: "date" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "infra_domains_name_unique", fields: ["name"], unique: true },
    { name: "infra_domains_env_idx", fields: ["environmentId"] },
  ],
};
