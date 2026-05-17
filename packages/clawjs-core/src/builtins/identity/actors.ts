import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ACTORS: BuiltinCollectionDefinition = {
  name: "actors",
  displayName: "Actors",
  family: "identity",
  aliases: ["actor","actors"],
  fields: [
    { name: "companyId", type: "relation", relation: { collectionName: "companies" } },
    { name: "kind", type: "select", required: true, options: ["human","agent","external"] },
    { name: "humanPersonId", type: "relation", relation: { collectionName: "people" } },
    { name: "agentId", type: "relation", relation: { collectionName: "agents" } },
    { name: "externalUserId", type: "relation", relation: { collectionName: "external_users" } },
    { name: "displayName", type: "text", required: true },
    { name: "avatarUrl", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "actors_company_idx", fields: ["companyId"] },
    { name: "actors_kind_idx", fields: ["kind"] },
    { name: "actors_human_idx", fields: ["humanPersonId"] },
    { name: "actors_agent_idx", fields: ["agentId"] },
    { name: "actors_external_idx", fields: ["externalUserId"] },
  ],
};
