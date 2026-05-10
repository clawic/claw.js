import type { BuiltinCollectionDefinition } from "../_types.ts";

export const COHORT_MEMBERSHIPS: BuiltinCollectionDefinition = {
  name: "cohort_memberships",
  displayName: "Cohort Memberships",
  family: "analytics",
  aliases: ["cohort_membership","cohort_memberships"],
  fields: [
    { name: "cohortId", type: "relation", required: true, relation: { collectionName: "cohorts" } },
    { name: "personId", type: "relation", required: true, relation: { collectionName: "analytics_persons" } },
    { name: "addedAt", type: "date" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "cohort_mem_unique", fields: ["cohortId","personId"], unique: true },
    { name: "cohort_mem_person_idx", fields: ["personId"] },
  ],
};
