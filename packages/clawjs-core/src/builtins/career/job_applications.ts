import type { BuiltinCollectionDefinition } from "../_types.ts";

export const JOB_APPLICATIONS: BuiltinCollectionDefinition = {
  name: "job_applications",
  displayName: "Job Applications",
  family: "career",
  aliases: ["job_application","job_applications"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "companyOfInterestId", type: "relation", relation: { collectionName: "companies_of_interest" } },
    { name: "appliedAt", type: "date" },
    { name: "postingUrl", type: "url" },
    { name: "status", type: "select", options: ["draft","applied","screening","interviewing","offer","rejected","withdrawn","hired"] },
    { name: "source", type: "text" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "job_applications_status_idx", fields: ["status"] },
    { name: "job_applications_applied_idx", fields: ["appliedAt"] },
  ],
};
