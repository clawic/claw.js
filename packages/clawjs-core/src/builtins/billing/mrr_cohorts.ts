import type { BuiltinCollectionDefinition } from "../_types.ts";

export const MRR_COHORTS: BuiltinCollectionDefinition = {
  name: "mrr_cohorts",
  displayName: "MRR Cohorts",
  family: "billing",
  aliases: ["mrr","mrr_cohort","mrr_cohorts"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "cohortMonth", type: "text", required: true },
    { name: "newMrrCents", type: "number" },
    { name: "expansionMrrCents", type: "number" },
    { name: "contractionMrrCents", type: "number" },
    { name: "churnMrrCents", type: "number" },
    { name: "netMrrCents", type: "number" },
    { name: "netMrrRetention", type: "number" },
    { name: "cohortSize", type: "number" },
    { name: "activeAtMonth", type: "number" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "mrr_cohorts_company_month_unique", fields: ["companyId","cohortMonth"], unique: true },
  ],
};
