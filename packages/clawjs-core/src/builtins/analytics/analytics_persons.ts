import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ANALYTICS_PERSONS: BuiltinCollectionDefinition = {
  name: "analytics_persons",
  displayName: "Analytics Persons",
  family: "analytics",
  aliases: ["analytics_person","analytics_persons"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "distinctId", type: "text", required: true },
    { name: "email", type: "email" },
    { name: "name", type: "text" },
    { name: "firstSeenAt", type: "date" },
    { name: "lastSeenAt", type: "date" },
    { name: "properties", type: "json" },
    { name: "cohortIds", type: "json" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "anal_persons_distinct_unique", fields: ["companyId","distinctId"], unique: true },
    { name: "anal_persons_email_idx", fields: ["email"] },
  ],
};
