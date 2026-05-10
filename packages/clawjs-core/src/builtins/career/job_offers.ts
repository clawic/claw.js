import type { BuiltinCollectionDefinition } from "../_types.ts";

export const JOB_OFFERS: BuiltinCollectionDefinition = {
  name: "job_offers",
  displayName: "Job Offers",
  family: "career",
  aliases: ["job_offer","job_offers"],
  fields: [
    { name: "jobApplicationId", type: "relation", required: true, relation: { collectionName: "job_applications" } },
    { name: "offeredAt", type: "date", required: true },
    { name: "salaryCents", type: "number" },
    { name: "currency", type: "text" },
    { name: "description", type: "text" },
    { name: "expiresAt", type: "date" },
    { name: "status", type: "select", options: ["pending","accepted","declined","expired"] },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "job_offers_status_idx", fields: ["status"] },
  ],
};
